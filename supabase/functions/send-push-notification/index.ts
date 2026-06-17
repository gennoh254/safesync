import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(b64 + padding);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function b64urlEncode(buf: Uint8Array | ArrayBuffer): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

function numToU16BE(n: number): Uint8Array {
  return new Uint8Array([(n >> 8) & 0xff, n & 0xff]);
}

function numToU32BE(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

// ---------------------------------------------------------------------------
// VAPID JWT  (ES256 / P-256 ECDSA)
// ---------------------------------------------------------------------------

async function buildVapidJwt(
  pkcs8B64url: string,
  audience: string,
  subject: string
): Promise<string> {
  const te = new TextEncoder();
  const header = b64urlEncode(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64urlEncode(te.encode(JSON.stringify({ aud: audience, exp: now + 3600, sub: subject })));

  const sigInput = `${header}.${payload}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    b64urlDecode(pkcs8B64url),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    te.encode(sigInput)
  );

  return `${sigInput}.${b64urlEncode(sig)}`;
}

// ---------------------------------------------------------------------------
// RFC 8291 Web Push Encryption (aes128gcm content-encoding)
// ---------------------------------------------------------------------------

async function hkdfExpand(
  prk: Uint8Array,
  info: Uint8Array,
  len: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", prk, { name: "HKDF" }, false, ["deriveBits"]);
  // HKDF-Expand: use empty salt (HKDF-Expand doesn't use salt; we pass prk as key + empty salt trick)
  // Actually, deriveBits with HKDF requires salt for Extract. We do Extract+Expand in one shot.
  // For Expand-only we need HMAC.
  const hmacKey = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const blocks = Math.ceil(len / 32);
  const out = new Uint8Array(blocks * 32);
  let prev = new Uint8Array(0);
  for (let i = 0; i < blocks; i++) {
    const input = concat(prev, info, new Uint8Array([i + 1]));
    const block = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, input));
    out.set(block, i * 32);
    prev = block;
  }
  return out.slice(0, len);
}

async function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Promise<Uint8Array> {
  const saltKey = await crypto.subtle.importKey("raw", salt, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", saltKey, ikm));
}

async function encryptWebPush(
  payloadStr: string,
  p256dhB64: string,
  authB64: string
): Promise<{ body: Uint8Array; headers: Record<string, string> }> {
  const te = new TextEncoder();
  const plaintext = te.encode(payloadStr);

  // Recipient public key
  const recipientPubRaw = b64urlDecode(p256dhB64);
  const recipientPub = await crypto.subtle.importKey(
    "raw", recipientPubRaw, { name: "ECDH", namedCurve: "P-256" }, true, []
  );

  // Ephemeral server ECDH key pair
  const serverKP = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]
  );
  const serverPubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", serverKP.publicKey));

  // ECDH shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: recipientPub }, serverKP.privateKey, 256)
  );

  const authSecret = b64urlDecode(authB64);
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // RFC 8291 key derivation
  const keyInfoStr = "WebPush: info\0";
  const keyInfo = concat(te.encode(keyInfoStr), recipientPubRaw, serverPubRaw);

  const prk = await hkdfExtract(authSecret, sharedSecret);
  const inputKeyMaterial = await hkdfExpand(prk, keyInfo, 32);

  const cekInfo = te.encode("Content-Encoding: aes128gcm\0");
  const nonceInfo = te.encode("Content-Encoding: nonce\0");

  const prk2 = await hkdfExtract(salt, inputKeyMaterial);
  const cek = await hkdfExpand(prk2, cekInfo, 16);
  const nonce = await hkdfExpand(prk2, nonceInfo, 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);

  // Padding: RFC 8291 §4  "pad byte (0x02) for the last record"
  const padded = concat(plaintext, new Uint8Array([0x02]));

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, padded)
  );

  // RFC 8188 aes128gcm header: salt(16) + rs(4) + keyidlen(1) + keyid(serverPubRaw)
  const rs = 4096;
  const header = concat(
    salt,
    numToU32BE(rs),
    new Uint8Array([serverPubRaw.length]),
    serverPubRaw
  );

  const body = concat(header, ciphertext);

  return {
    body,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      "Content-Length": String(body.length),
    },
  };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { responderId, alertId, emergencyType, location, latitude, longitude, clientId, createdAt } = body;

    if (!responderId || !alertId) {
      return new Response(JSON.stringify({ error: "responderId and alertId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@safesync.app";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Read VAPID keys from Supabase Vault
    const { data: vaultRows, error: vaultError } = await supabase
      .from("vault.decrypted_secrets")
      .select("name, decrypted_secret")
      .in("name", ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"]);

    if (vaultError || !vaultRows || vaultRows.length < 2) {
      console.error("Vault read error:", vaultError, "rows:", vaultRows?.length);
      return new Response(JSON.stringify({ error: "VAPID keys not in vault" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const vapidPublicKey = (vaultRows as any[]).find((s) => s.name === "VAPID_PUBLIC_KEY")?.decrypted_secret || "";
    const vapidPrivateKey = (vaultRows as any[]).find((s) => s.name === "VAPID_PRIVATE_KEY")?.decrypted_secret || "";

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(JSON.stringify({ error: "VAPID keys missing from vault" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all push subscriptions for this responder
    const { data: subs, error: subsError } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", responderId);

    if (subsError || !subs || subs.length === 0) {
      console.log("No push subscriptions for responder:", responderId);
      return new Response(JSON.stringify({ success: false, message: "No push subscriptions found" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pushPayload = JSON.stringify({
      title: emergencyType === "FIRE" ? "FIRE EMERGENCY" : emergencyType === "MEDICAL" ? "MEDICAL EMERGENCY" : "EMERGENCY ALERT",
      body: `Emergency at ${location || "unknown location"}. Tap to respond.`,
      alertId,
      emergencyType,
      location,
      latitude,
      longitude,
      clientId,
      createdAt,
    });

    const results = await Promise.allSettled(
      subs.map(async (sub: any) => {
        const audience = new URL(sub.endpoint).origin;
        const jwt = await buildVapidJwt(vapidPrivateKey, audience, vapidSubject);

        const { body: encBody, headers: encHeaders } = await encryptWebPush(
          pushPayload, sub.p256dh, sub.auth
        );

        const resp = await fetch(sub.endpoint, {
          method: "POST",
          headers: {
            ...encHeaders,
            "Authorization": `vapid t=${jwt},k=${vapidPublicKey}`,
            "TTL": "86400",
            "Urgency": "high",
          },
          body: encBody,
        });

        if (!resp.ok) {
          const text = await resp.text();
          console.error("Push send failed:", resp.status, text);
          if (resp.status === 410 || resp.status === 404) {
            await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          }
          throw new Error(`Push failed: ${resp.status} ${text}`);
        }

        return { endpoint: sub.endpoint, status: resp.status };
      })
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").map((r) => (r as any).reason?.message);

    console.log(`Push sent: ${succeeded}/${subs.length}`, failed.length ? `failures: ${failed.join(", ")}` : "");

    return new Response(JSON.stringify({ success: true, sent: succeeded, total: subs.length }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("send-push-notification error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
