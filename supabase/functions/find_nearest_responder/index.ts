import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Alert {
  id: string;
  latitude: string | number | null;
  longitude: string | number | null;
  emergency_type: string;
  notified_responder_ids: string[] | null;
}

interface Responder {
  id: string;
  name: string;
  phone: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  response_types: string[];
}

// Helper to convert string/number to number
function toNumber(val: string | number | null): number | null {
  if (val === null || val === undefined) return null;
  const num = typeof val === 'string' ? parseFloat(val) : val;
  return isNaN(num) ? null : num;
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { alertId, excludeIds } = await req.json();

    if (!alertId) {
      return new Response(JSON.stringify({ error: "alertId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get alert details
    const { data: alert, error: alertError } = await supabase
      .from("alerts")
      .select("*")
      .eq("id", alertId)
      .maybeSingle();

    if (alertError || !alert) {
      return new Response(JSON.stringify({ error: "Alert not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const alertData = alert as Alert;

    // Convert coordinates to numbers (Postgres numeric type returns strings)
    const alertLat = toNumber(alertData.latitude);
    const alertLng = toNumber(alertData.longitude);

    // Can't route without coordinates
    if (alertLat === null || alertLng === null) {
      console.log("Alert has no valid coordinates:", alertData.latitude, alertData.longitude);
      return new Response(JSON.stringify({ error: "Alert has no location coordinates" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get excluded IDs from request or use the alert's notified_responder_ids
    const excludeResponderIds = excludeIds || alertData.notified_responder_ids || [];
    console.log("Finding responder for alert:", alertId, "emergency:", alertData.emergency_type, "excluding:", excludeResponderIds);

    // Find available on-duty responders who:
    // 1. Are on duty
    // 2. Don't have an active alert
    // 3. Haven't been notified about this alert
    // 4. Have location data
    // 5. Match the emergency type (if fire, only send to fire responders; if medical, to medical)
    const { data: responders, error: respondersError } = await supabase
      .from("profiles")
      .select("id, name, phone, latitude, longitude, response_types")
      .eq("user_type", "Responder")
      .eq("on_duty", true)
      .eq("has_active_alert", false)
      .not("latitude", "is", null)
      .not("longitude", "is", null);

    if (respondersError) {
      console.error("Failed to fetch responders:", respondersError);
      return new Response(JSON.stringify({ error: "Failed to fetch responders" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Found available responders:", responders?.length || 0);

    // Filter by response type and excluded IDs
    // OTHER emergencies are routed to FIRE responders
    const effectiveEmergencyType = alertData.emergency_type === 'OTHER' ? 'FIRE' : alertData.emergency_type;

    const eligibleResponders = (responders as Responder[]).filter((r) => {
      // Exclude already notified responders
      if (excludeResponderIds.includes(r.id)) return false;

      // Check if responder handles this emergency type
      if (r.response_types && r.response_types.length > 0) {
        return r.response_types.includes(effectiveEmergencyType);
      }
      // If no response types set, allow them (fallback)
      return true;
    });

    console.log("Eligible responders after filtering:", eligibleResponders.length);

    if (eligibleResponders.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        message: "No eligible responders available",
        responder: null
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find nearest responder
    const respondersWithDistance = eligibleResponders
      .filter((r) => {
        const lat = toNumber(r.latitude);
        const lng = toNumber(r.longitude);
        return lat !== null && lng !== null;
      })
      .map((r) => {
        const lat = toNumber(r.latitude)!;
        const lng = toNumber(r.longitude)!;
        return {
          ...r,
          distance: haversineDistance(alertLat, alertLng, lat, lng)
        };
      })
      .sort((a, b) => a.distance - b.distance);

    const nearestResponder = respondersWithDistance[0];

    if (!nearestResponder) {
      return new Response(JSON.stringify({
        success: false,
        message: "No responders with valid location data",
        responder: null
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update the alert to assign to this responder
    const { error: updateError } = await supabase
      .from("alerts")
      .update({
        current_responder_id: nearestResponder.id,
        notified_responder_ids: [...excludeResponderIds, nearestResponder.id]
      })
      .eq("id", alertId);

    if (updateError) {
      console.error("Failed to update alert:", updateError);
      return new Response(JSON.stringify({ error: "Failed to assign responder" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fire push notification to the assigned responder (non-blocking)
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({
        responderId: nearestResponder.id,
        alertId,
        emergencyType: alertData.emergency_type,
        location: alert.location,
        latitude: alertLat,
        longitude: alertLng,
        clientId: alert.client_id,
        createdAt: alert.created_at,
      }),
    }).catch((e) => console.error("Failed to send push notification:", e));

    return new Response(JSON.stringify({
      success: true,
      responder: {
        id: nearestResponder.id,
        name: nearestResponder.name,
        phone: nearestResponder.phone,
        distance: nearestResponder.distance
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Error in find_nearest_responder:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
