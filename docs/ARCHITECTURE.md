# SafeSync — Architecture & Technical Documentation

SafeSync is a real-time emergency alert and response coordination platform. It connects people in distress (**Clients**) with trained emergency responders (**Responders**), managed by a system **Administrator**. The system handles geolocation, push notifications, live tracking, alert escalation, responder organization management, and client payments.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Technology Stack](#technology-stack)
3. [Application Architecture](#application-architecture)
4. [User Roles](#user-roles)
5. [Database Schema](#database-schema)
6. [Row-Level Security (RLS)](#row-level-security-rls)
7. [Edge Functions](#edge-functions)
8. [Real-Time Subscriptions](#real-time-subscriptions)
9. [Push Notifications](#push-notifications)
10. [Emergency Audio System](#emergency-audio-system)
11. [Component Reference](#component-reference)
12. [Context Providers](#context-providers)
13. [User Flows](#user-flows)
14. [Environment Variables](#environment-variables)
15. [Database Migrations](#database-migrations)

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        SafeSync Platform                         │
│                                                                  │
│  ┌──────────┐    ┌──────────────┐    ┌────────────────────────┐  │
│  │  Client  │    │  Responder   │    │    Administrator       │  │
│  │  (App)   │    │  (App)       │    │    (Portal)            │  │
│  └────┬─────┘    └──────┬───────┘    └───────────┬────────────┘  │
│       │                 │                        │               │
│       └────────┬────────┴────────────────────────┘               │
│                ▼                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Supabase Backend (PostgreSQL)               │   │
│  │  ┌─────────┐  ┌─────────┐  ┌──────────┐  ┌──────────────┐ │   │
│  │  │  Auth   │  │ Realtime│  │   Edge   │  │  Storage/    │ │   │
│  │  │         │  │         │  │ Functions│  │  Vault       │ │   │
│  │  └─────────┘  └─────────┘  └──────────┘  └──────────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Core Workflow

1. A **Client** triggers an emergency alert (Fire, Medical, or Other) with their GPS location.
2. The system inserts the alert and calls the `find_nearest_responder` edge function.
3. The edge function finds the closest on-duty, available responder matching the emergency type and assigns them.
4. The assigned responder receives a **Web Push notification** and sees a full-screen **IncomingAlertOverlay** with a siren.
5. The responder **accepts** (alert → ACCEPTED) or **declines** (system re-routes to the next nearest responder).
6. The client sees real-time status updates and the responder's live location on a map.
7. Upon arrival, the alert is **resolved** (or marked unresolved), and the client rates the responder (1–5 stars).

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend Framework | React 19 + TypeScript |
| Build Tool | Vite 6 |
| Styling | Tailwind CSS v4 |
| Icons | lucide-react |
| Animations | motion (Framer Motion) |
| Maps | Google Maps Platform (`@vis.gl/react-google-maps`) |
| Backend | Supabase (PostgreSQL, Auth, Realtime, Edge Functions) |
| Push Notifications | Web Push API (RFC 8291 encryption, VAPID JWT) |
| Audio | Web Audio API + HTML5 Audio fallback |
| PWA | Service Worker (`/sw.js`), Web Manifest |

---

## Application Architecture

### Routing (App.tsx)

```
App
├── ThemeProvider
│   └── PushNotificationProvider
│       └── AlertProvider
│           ├── authView === 'admin' → AdminLayout (no auth required)
│           ├── initializing → loading spinner
│           ├── !userType (not logged in)
│           │   ├── 'login' → AuthForm
│           │   └── 'recovery' → PasswordRecovery
│           └── userType set (logged in)
│               ├── 'Client' → HomeDashboard
│               ├── 'Administrator' → AdminLayout
│               └── 'Responder' → ReceiverLayout
```

### Auth Session Management

- On mount, `supabase.auth.getSession()` checks for an existing session.
- If a session exists, the app fetches `profiles.user_type` to route to the correct dashboard.
- If the profile is missing (edge case), it falls back to `user_metadata.user_type` from the auth record and upserts a profile.
- `onAuthStateChange` listener handles login/logout events with the same profile-fetch logic.
- A `mounted` flag prevents state updates after unmount (avoids memory leaks and deadlocks).

---

## User Roles

### Client

- Sends emergency alerts (FIRE, MEDICAL, OTHER with description).
- Views alert history and status timeline.
- Tracks assigned responder on a live map.
- Rates responders after resolution (1–5 stars).
- Manages account balance and payment history (M-Pesa or card).
- Must have a phone number configured before sending alerts.
- MEDICAL alerts require a minimum balance of Ksh 500.

### Responder

- Toggles on-duty/off-duty status (requires profile completion + equipment confirmation).
- Receives incoming alert overlays with siren + vibration.
- Accepts or declines alerts (decline triggers escalation to next responder).
- Views active alerts and response history.
- Navigates to emergency locations via live map.
- Organization admins (users who created the org, `invited_by IS NULL`) can:
  - Invite new responders to their organization.
  - View team member status and handled alerts via the Tracking tab.

### Administrator

- Accesses the admin portal (no auth required for the portal view).
- Views system-wide dashboard with live stats.
- Manages all users (create, delete, change type).
- Views audit logs of all alert events.
- Monitors a central live map of all alerts and responders.
- Exports data to CSV.

---

## Database Schema

### `profiles`

Stores user data linked to Supabase Auth. Supports all three user types.

| Column | Type | Default | Description |
|---|---|---|---|
| `id` | uuid, PK | — | References `auth.users(id)`, ON DELETE CASCADE |
| `name` | text | `''` | Full name |
| `company` | text | `''` | Company/organization name (legacy field) |
| `email` | text | — | Mirrored from auth for easy lookup |
| `user_type` | text | — | CHECK: `'Client'`, `'Responder'`, `'Administrator'` |
| `phone` | text | `''` | Mobile number (required for alerts) |
| `response_types` | text[] | `NULL` | Emergency types the responder handles (e.g., `['FIRE','MEDICAL']`) |
| `latitude` | numeric | `NULL` | Real-time latitude |
| `longitude` | numeric | `NULL` | Real-time longitude |
| `last_location_update` | timestamptz | `NULL` | Timestamp of last location ping |
| `on_duty` | boolean | `false` | Whether the responder is currently on duty |
| `has_active_alert` | boolean | `false` | Whether the responder is currently handling an alert |
| `last_declined_at` | timestamptz | `NULL` | When the responder last declined an alert |
| `invited_by` | uuid | `NULL` | FK to `profiles(id)` — who invited this responder (NULL = org admin) |
| `organization_name` | text | `''` | Organization grouping for responders |
| `created_at` | timestamptz | `now()` | Record creation timestamp |

### `alerts`

Emergency alerts sent by clients, routed to responders.

| Column | Type | Default | Description |
|---|---|---|---|
| `id` | uuid, PK | `gen_random_uuid()` | Alert ID |
| `client_id` | uuid, NOT NULL | — | FK to `profiles(id)`, ON DELETE CASCADE |
| `emergency_type` | text, NOT NULL | — | CHECK: `'FIRE'`, `'MEDICAL'`, `'OTHER'` |
| `location` | text | `''` | Text description / coordinates of location |
| `latitude` | numeric | `NULL` | Alert latitude |
| `longitude` | numeric | `NULL` | Alert longitude |
| `status` | text, NOT NULL | `'ACTIVE'` | CHECK: `'ACTIVE'`, `'ACCEPTED'`, `'RESOLVED'`, `'UNRESOLVED'`, `'CANCELLED'` |
| `current_responder_id` | uuid | `NULL` | Responder currently assigned/notified |
| `notified_responder_ids` | uuid[] | `'{}'` | All responders that have been notified |
| `description` | text | `''` | Description for OTHER emergency type |
| `accepted_at` | timestamptz | `NULL` | When the responder accepted |
| `resolved_at` | timestamptz | `NULL` | When the alert was resolved |
| `responder_rating` | integer | `NULL` | CHECK: 1–5 — client's rating of the responder |
| `escalated_at` | timestamptz | `NULL` | When the alert was last escalated |
| `escalation_count` | integer | `0` | Number of times the alert has been escalated |
| `created_at` | timestamptz | `now()` | Alert creation timestamp |
| `updated_at` | timestamptz | `now()` | Last update timestamp |

### `push_subscriptions`

Web Push notification subscriptions for each user.

| Column | Type | Default | Description |
|---|---|---|---|
| `id` | uuid, PK | `gen_random_uuid()` | Subscription ID |
| `user_id` | uuid, NOT NULL | — | FK to `auth.users(id)`, ON DELETE CASCADE |
| `endpoint` | text, NOT NULL | — | Push service endpoint URL |
| `p256dh` | text, NOT NULL | — | Public key for Web Push encryption |
| `auth` | text, NOT NULL | — | Auth secret for Web Push |
| `created_at` | timestamptz | `now()` | Creation timestamp |

**Unique constraint:** `(user_id, endpoint)`

### `client_payments`

Tracks account balances and payment history for clients.

| Column | Type | Default | Description |
|---|---|---|---|
| `id` | uuid, PK | `gen_random_uuid()` | Payment ID |
| `client_id` | uuid, NOT NULL | — | FK to `auth.users(id)`, ON DELETE CASCADE |
| `amount` | decimal(10,2) | — | Payment amount in Ksh |
| `payment_method` | text, NOT NULL | — | CHECK: `'card'`, `'mpesa'` |
| `payment_type` | text, NOT NULL | — | CHECK: `'subscription'`, `'alert_fee'` |
| `status` | text, NOT NULL | `'pending'` | CHECK: `'pending'`, `'completed'`, `'failed'` |
| `reference` | text | `NULL` | Payment reference string |
| `alert_id` | uuid | `NULL` | FK to `alerts(id)`, ON DELETE SET NULL |
| `created_at` | timestamptz | `now()` | Creation timestamp |
| `updated_at` | timestamptz | `now()` | Last update (auto-updated via trigger) |

**Indexes:** `idx_client_payments_client_id`, `idx_client_payments_created_at`

### Database Functions & Triggers

| Name | Type | Purpose |
|---|---|---|
| `auto_confirm_new_user()` | BEFORE INSERT on `auth.users` | Auto-sets `email_confirmed_at` — no email verification needed |
| `handle_new_user()` | AFTER INSERT on `auth.users` | Auto-creates a `profiles` row from `raw_user_meta_data` |
| `update_updated_at_column()` | BEFORE UPDATE on `client_payments` | Auto-updates `updated_at` |
| `get_user_org(user_id)` | SECURITY DEFINER fn | Reads `organization_name` bypassing RLS — prevents recursion |
| `is_org_member(responder_id)` | SECURITY DEFINER fn | Checks if a responder is in the same org as the current user |

---

## Row-Level Security (RLS)

RLS is enabled on all tables. Below is a summary of the policy patterns.

### `profiles` Policies

| Policy | Operation | Logic |
|---|---|---|
| Users can view own profile | SELECT | `auth.uid() = id` |
| Anyone can read all profiles | SELECT | `true` (enables client map & admin dashboard) |
| Users can insert own profile on signup | INSERT | `auth.uid() = id` |
| Responders can create other responder users | INSERT | Self-registration OR org admin creating a responder |
| Users can update own profile | UPDATE | `auth.uid() = id` |
| Select org members | SELECT | Uses `get_user_org()` SECURITY DEFINER fn to avoid recursion |

### `alerts` Policies

| Policy | Operation | Logic |
|---|---|---|
| Clients can insert their own alerts | INSERT | `auth.uid() = client_id` |
| Clients can view their own alerts | SELECT | `auth.uid() = client_id` |
| Responders can view all alerts | SELECT | Subquery: user is a Responder |
| Public can read all alerts | SELECT | `true` (admin dashboard) |
| Responders can update alert status | UPDATE | Subquery: user is a Responder |
| Clients can update their own alerts | UPDATE | `auth.uid() = client_id` |
| Select org alerts | SELECT | `current_responder_id = auth.uid()` OR `is_org_member(current_responder_id)` |

### `push_subscriptions` & `client_payments`

Standard ownership pattern: users can SELECT/INSERT/UPDATE/DELETE only their own records (`auth.uid() = user_id` or `auth.uid() = client_id`).

### RLS Recursion Fixes

The project went through three iterations of fixing infinite recursion in RLS policies:

1. **Admin policies querying `profiles` inside `profiles` RLS** — replaced with public read policies.
2. **`select_org_members` querying `profiles` inside `profiles` RLS** — replaced with `get_user_org()` SECURITY DEFINER function.
3. **Cross-table circular reference** (`profiles` policy queried `alerts`, `alerts` policy queried `profiles`) — replaced with `is_org_member()` SECURITY DEFINER function.

---

## Edge Functions

All edge functions are deployed to Supabase and called via `POST` to `{SUPABASE_URL}/functions/v1/{function_name}`.

### `create_profile`

**Purpose:** Creates a new auth user and profile using the service role key (bypasses RLS).

| Input | Type | Required |
|---|---|---|
| `name` | string | Yes |
| `email` | string | Yes |
| `password` | string | Yes |
| `user_type` | string | Yes |
| `company` | string | No |

**Flow:**
1. Creates auth user with `email_confirm: true` (auto-confirmed, no email sent).
2. Inserts into `profiles` table using service role.
3. If profile insert fails, deletes the created user (cleanup).

### `find_nearest_responder`

**Purpose:** Finds the geographically nearest available responder for a given alert and assigns them.

| Input | Type | Required |
|---|---|---|
| `alertId` | string (uuid) | Yes |
| `excludeIds` | string[] | No (defaults to alert's `notified_responder_ids`) |

**Flow:**
1. Fetches the alert by ID, extracts coordinates.
2. Queries `profiles` for responders that are: `user_type = 'Responder'`, `on_duty = true`, `has_active_alert = false`, and have non-null lat/lng.
3. Filters by `response_types` matching the emergency type. `OTHER` emergencies are routed to `FIRE` responders.
4. Excludes already-notified responder IDs.
5. Calculates **Haversine distance** to each eligible responder, sorts by distance.
6. Updates the alert: sets `current_responder_id` and appends to `notified_responder_ids`.
7. Fires a non-blocking call to `send-push-notification`.

**Returns:** `{ success, responder: { id, name, phone, distance } }`

### `send-push-notification`

**Purpose:** Sends Web Push notifications to a responder's subscribed devices.

| Input | Type | Required |
|---|---|---|
| `responderId` | string (uuid) | Yes |
| `alertId` | string (uuid) | Yes |
| `emergencyType` | string | Yes |
| `location` | string | No |
| `latitude` | number | No |
| `longitude` | number | No |
| `clientId` | string | No |
| `createdAt` | string | No |

**Flow:**
1. Reads VAPID keys from Supabase Vault (`vault.decrypted_secrets`).
2. Fetches all `push_subscriptions` for the responder.
3. Constructs a push payload with title, body, and alert metadata.
4. Implements **RFC 8291 Web Push encryption** (aes128gcm) and **VAPID JWT** (ES256) from scratch using Web Crypto API.
5. Sends to each subscription endpoint with `Urgency: high`, `TTL: 86400`.
6. Cleans up expired subscriptions (HTTP 410/404 → delete from DB).

**Returns:** `{ success, sent, total }`

---

## Real-Time Subscriptions

The `alerts` and `profiles` tables are added to the `supabase_realtime` publication. The app uses Supabase Realtime channels for live updates:

| Channel | Table | Event | Used By |
|---|---|---|---|
| `client-map-channel` | `profiles` | UPDATE | ClientMap — responder location updates |
| `client-alert-channel` | `alerts` | UPDATE | ClientMap — alert status changes |
| `home-dashboard-alert-channel` | `alerts` | UPDATE | HomeDashboard — auto-reset when alert resolved |
| `alert-status-channel` | `alerts` | UPDATE | AlertSentDashboard — real-time status |
| `alert-detail-{alertId}` | `alerts` | UPDATE | AlertDetailView — responder assignment |
| `responder-alerts-v6-{userId}` | `alerts` | INSERT, UPDATE | ReceiverLayout — incoming alert detection |
| `responder-map-channel` | `alerts` | UPDATE, INSERT | ResponderMap — alert list updates |
| `receiver-alerts-list-{timestamp}` | `alerts` | * | ReceiverAlerts — alert list + sound trigger |
| `admin-map-channel` | `profiles`, `alerts` | UPDATE, * | AdminLiveMap — live tracking |
| `admin-dashboard-channel` | `alerts`, `profiles` | * | AdminDashboard — stats updates |
| `admin-audit-channel` | `alerts` | * | AdminAuditLogs — log updates |
| `admin-users-channel` | `profiles` | * | AdminUserManagement — user list updates |

### Polling Fallbacks

Several components also implement polling intervals as a fallback for missed real-time events:

| Component | Poll Interval | Purpose |
|---|---|---|
| ClientMap | 5s | Refresh responder locations + active alert |
| ReceiverLayout | 3s | Check for alerts assigned to this responder |
| AlertSentDashboard | 3s | Check for alert acceptance |
| AlertDetailView | 5s | Poll responder location |
| AdminLiveMap | 30s | Refresh all locations |
| ResponderOrgTracking | 10s | Refresh org member data |

---

## Push Notifications

### Architecture

```
Client triggers alert
    │
    ▼
find_nearest_responder (edge function)
    │
    ▼
send-push-notification (edge function)
    │
    ├── Reads VAPID keys from Supabase Vault
    ├── Fetches push_subscriptions for responder
    ├── Encrypts payload (RFC 8291 aes128gcm)
    ├── Signs VAPID JWT (ES256)
    └── POSTs to push service endpoint
          │
          ▼
    Browser Service Worker (sw.js)
          │
          ├── Shows system notification (requireInteraction: true)
          ├── Posts INCOMING_ALERT message to all open tabs
          └── Handles accept/decline notification actions
```

### Service Worker (`public/sw.js`)

- Registered at scope `/` with type `classic`.
- Listens for `push` events and shows system notifications with `requireInteraction: true` (stays until user acts).
- Notification actions: `accept` (focuses app tab and re-posts alert), `decline` (posts decline message to open tab).
- Posts `INCOMING_ALERT` messages to all open tabs via `clients.matchAll()` so the React overlay can fire immediately.

### Client-Side (`PushNotificationContext.tsx`)

- Registers the service worker and manages push subscriptions.
- Stores subscriptions in the `push_subscriptions` table.
- Exposes `subscribe()`, `unsubscribe()`, `isSubscribed`, `permission`, `isSupported`.
- VAPID public key is embedded in the client (safe — it's public).

---

## Emergency Audio System

The `useEmergencyAlert` hook (`src/hooks/useEmergencyAlert.ts`) generates a multi-oscillator siren using the Web Audio API.

### Features

- **Three oscillators:** Primary sawtooth (600→1200Hz ramp), secondary sawtooth harmony (1200→2400Hz), bass square wave (150→300Hz).
- **Session tracking:** Each alert gets a unique session ID. Starting a new alert stops the previous one. Stopping increments the session ID to invalidate pending callbacks.
- **Vibration:** Navigator Vibrate API with pattern `[300, 150, 300, 150, 600]` every 2 seconds.
- **Auto-stop:** Default 120-second duration.
- **HTML5 Audio fallback:** If Web Audio API is unavailable or context resume fails, falls back to a base64-encoded WAV siren.
- **Audio unlocking:** Browsers block audio until user interaction. `unlockAudio()` plays a silent buffer to unlock the AudioContext. The app also unlocks on first click/touch.

### Exported API

```typescript
const { startAlert, stopAlert, testAlert, isPlaying } = useEmergencyAlert();

startAlert({ duration: 120000, onVibrate: true, onSound: true });
stopAlert();
testAlert(); // Plays 3 siren cycles for 4 seconds
```

---

## Component Reference

### Authentication & Shell

| Component | File | Purpose |
|---|---|---|
| `AuthForm` | `LoginForm.tsx` | Login/Signup form with account type selector. Creates auth user + upserts profile. Has admin portal access button. |
| `PasswordRecovery` | `PasswordRecovery.tsx` | Password reset flow via Supabase auth. |
| `Header` | `Header.tsx` | Top navigation bar (login screen). |
| `FooterStatusBar` | `Footer.tsx` | Footer status bar (login screen). |

### Client Components

| Component | File | Purpose |
|---|---|---|
| `HomeDashboard` | `HomeDashboard.tsx` | Main client dashboard. Sends alerts, shows history, map, settings, accounts. |
| `ClientMap` | `ClientMap.tsx` | Interactive map showing client location and nearby on-duty responders. |
| `AlertSentDashboard` | `AlertSentDashboard.tsx` | Post-alert view with real-time status updates. |
| `AlertDetailView` | `AlertDetailView.tsx` | Detailed alert view with responder info, timeline, and rating. |
| `ClientAccounts` | `ClientAccounts.tsx` | Account balance and payment history management. |
| `SimpleMapView` | `SimpleMapView.tsx` | Lightweight canvas-based map for embedding. |

### Responder Components

| Component | File | Purpose |
|---|---|---|
| `ReceiverLayout` | `ReceiverLayout.tsx` | Main responder shell with tabbed navigation. Manages incoming alerts, audio, on-duty state. |
| `ReceiverHome` | `ReceiverHome.tsx` | On-duty toggle with equipment confirmation checklist. |
| `ReceiverAlerts` | `ReceiverAlerts.tsx` | List of active alerts to accept and response history. |
| `IncomingAlertOverlay` | `IncomingAlertOverlay.tsx` | Full-screen alert overlay with siren, accept/decline, 2-min timeout. |
| `ResponderMap` | `ResponderMap.tsx` | Map showing responder position and active alert location. |
| `ResponderOrgTracking` | `ResponderOrgTracking.tsx` | Org admin view of team members and their alerts. |
| `ReceiverSettings` | `ReceiverSettings.tsx` | Push notifications, sound, response types, org management, user invitations. |
| `ReceiverTrackingPage` | `ReceiverTrackingPage.tsx` | Wrapper for ResponderMap. |
| `ReceiverIncidentView` | `ReceiverIncidentView.tsx` | Active incident detail with communication log. |
| `ReceiverAlertOverlay` | `ReceiverAlertOverlay.tsx` | Slide-to-accept alert banner (legacy). |

### Admin Components

| Component | File | Purpose |
|---|---|---|
| `AdminLayout` | `AdminLayout.tsx` | Admin shell with sidebar navigation. |
| `AdminDashboard` | `AdminDashboard.tsx` | System-wide stats and active alerts overview. |
| `AdminUserManagement` | `AdminUserManagement.tsx` | User CRUD operations. |
| `AdminAuditLogs` | `AdminAuditLogs.tsx` | Alert event history with search/filter/CSV export. |
| `AdminLiveMap` | `AdminLiveMap.tsx` | Central live map of all alerts and responders. |
| `AdminSettings` | `AdminSettings.tsx` | Admin configuration (theme, profile, system). |
| `AdminClientsPage` | `AdminClientsPage.tsx` | Client accounts view (legacy/mock). |

---

## Context Providers

| Provider | File | Purpose |
|---|---|---|
| `ThemeProvider` | `ThemeContext.tsx` | Light/dark theme toggle. Default: light. |
| `PushNotificationProvider` | `PushNotificationContext.tsx` | Web Push subscription lifecycle. Registers SW, requests permission, stores subscriptions in DB. |
| `AlertProvider` | `AlertContext.tsx` | In-app UI notification system (not emergency alerts). Maintains a list of `{id, message, timestamp}`. |

---

## User Flows

### Client Flow

```
Login → HomeDashboard
  ├── Select emergency type (FIRE / MEDICAL / OTHER)
  ├── Add description (for OTHER)
  ├── GPS location captured
  ├── Alert inserted into `alerts` table (status: ACTIVE)
  ├── `find_nearest_responder` edge function called
  ├── AlertSentDashboard shows real-time status
  │   ├── ACTIVE (transmitted, waiting)
  │   ├── ACCEPTED (responder en route)
  │   └── Map shows responder location
  ├── Client can cancel (while ACTIVE)
  ├── Client can resolve/unresolve + rate (when ACCEPTED)
  └── Alert History tab shows all past alerts
```

### Responder Flow

```
Login → ReceiverLayout
  ├── Home: Toggle on-duty (requires profile + equipment check)
  │   ├── GPS location captured and stored
  │   └── Location updates every 10s while on duty
  ├── Incoming Alert (via realtime or push notification)
  │   ├── IncomingAlertOverlay with siren + vibration
  │   ├── 2-minute auto-timeout (escalates to next responder)
  │   ├── Accept → status: ACCEPTED, has_active_alert: true
  │   └── Decline → re-route via find_nearest_responder
  ├── Map: Navigate to emergency location
  ├── Alerts: View active alerts + response history
  ├── Team (org admins only): View org members & their alerts
  └── Settings: Push notifications, sound, response types, invite users
```

### Administrator Flow

```
Admin Portal (no auth required) → AdminLayout
  ├── Dashboard: System-wide stats (total alerts, active, users)
  ├── Users: CRUD all users, change types
  ├── Audit Logs: All alert events with search/filter/CSV export
  ├── Live Map: All active alerts + responder positions
  └── Settings: Theme, profile, system config
```

---

## Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | Client | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Client | Supabase anon key |
| `SUPABASE_URL` | Edge Functions | Supabase project URL (server-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions | Service role key (bypasses RLS) |
| `SUPABASE_ANON_KEY` | Edge Functions | Anon key for inter-function calls |
| `VAPID_SUBJECT` | Edge Functions | VAPID subject (e.g., `mailto:admin@safesync.app`) |
| `VAPID_PUBLIC_KEY` | Supabase Vault | VAPID public key for push notifications |
| `VAPID_PRIVATE_KEY` | Supabase Vault | VAPID private key for signing push JWTs |
| `VITE_VAPID_PUBLIC_KEY` | Client | VAPID public key (injected via Vite define) |
| `GOOGLE_MAPS_PLATFORM_KEY` | Vite config | Google Maps API key (hardcoded in vite.config.ts) |
| `GEMINI_API_KEY` | Vite config | Google Gemini API key (if used) |

---

## Database Migrations

Migrations are in `supabase/migrations/` and are applied in chronological order. Key migrations:

| Migration | Purpose |
|---|---|
| `20260513172259` | Create `profiles` table with basic columns |
| `20260514093049` | Create `alerts` table |
| `20260514124242` | Fix profiles RLS policies |
| `20260518041212` | Fix alerts RLS for responder visibility |
| `20260519155814` | Add geolocation columns to profiles |
| `20260522212853` | Add `last_location_update` to profiles |
| `20260522215755` | Add admin RLS policies |
| `20260522215813` | Add public read policies for admin |
| `20260523074649` | Fix RLS recursion error |
| `20260525080058` | Add `on_duty` status to profiles |
| `20260528150019` | Add alert escalation fields |
| `20260604195635` | Add `accepted_at` and `resolved_at` to alerts |
| `20260605003055` | Fix profiles SELECT policy for authenticated |
| `20260609192224` | Add UNRESOLVED status and client update policy |
| `20260610060304` | Add responder availability tracking |
| `20260613182549` | Auto-confirm users (no email verification) |
| `20260616050051` | Add responder rating to alerts |
| `20260617115853` | Create push_subscriptions table |
| `20260621231029` | Add OTHER emergency type and invited_by |
| `20260622072941` | Add organization_name to profiles |
| `20260624131928` | Create client_payments table |
| `20260627115054` | Add org tracking RLS policies |
| `20260627120318` | Fix org profiles recursion |
| `20260627183645` | Fix org tracking RLS for client access |
| `20260627184420` | Fix RLS infinite recursion |
| `20260628201109` | Add tables to realtime publication |
