# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server on port 3000
npm run build     # Production build
npm run lint      # TypeScript type check (tsc --noEmit)
npm run clean     # Remove dist/
```

There are no automated tests in this project.

## Architecture

SafeSync is a React 19 + TypeScript SPA backed by Supabase. It is an emergency response system with three distinct user roles rendered as entirely separate layouts.

### Role-Based Routing

`App.tsx` is the root router. After auth, it checks the user's `profiles.user_type` and renders one of three layouts — no URL routing library is used:

- `Client` → `HomeDashboard` (trigger fire/medical alerts)
- `Responder` → `ReceiverLayout` (monitor and accept incoming alerts)
- `Administrator` → `AdminLayout` (dashboard, user management, audit logs)

The Admin portal is accessible via a bypass button on the login screen with no authentication.

### Navigation Pattern

Each layout uses **tab-based navigation** with local `useState`. A sidebar renders on desktop (`lg:flex`) and a bottom nav renders on mobile. The active tab drives conditional rendering of child components — there is no router or URL state.

### Auth Flow

Signup calls the `create_profile` Edge Function, which uses the Supabase service role to create an auth user with `email_confirm: true` (no email sent) and immediately inserts a profile row. The client then signs in with `signInWithPassword`. Login reads `profiles.user_type` post-signin to determine which layout to render.

### Real-Time Alerts

`ReceiverAlerts.tsx` subscribes to `postgres_changes` on the `alerts` table via `supabase.channel()`. When any change fires, it refetches all `ACTIVE` alerts. The subscription is torn down on unmount.

### Database Schema

**`profiles`** — one row per auth user
- `id` (UUID, FK → auth.users), `name`, `company`, `email`, `user_type` ('Client' | 'Responder')

**`alerts`** — created by clients, acted on by responders
- `id`, `client_id` (FK → profiles), `emergency_type` ('FIRE' | 'MEDICAL'), `location` (text), `latitude`, `longitude`, `status` ('ACTIVE' | 'ACCEPTED' | 'RESOLVED'), timestamps

RLS is enforced on both tables. Clients can only see and insert their own alerts. Responders can view all alerts and update status. The `create_profile` Edge Function bypasses RLS via service role.

### Edge Functions

One Edge Function lives in `supabase/functions/create_profile/`. Deploy and manage it via the `mcp__supabase__deploy_edge_function` MCP tool — never use the Supabase CLI.

### Environment Variables

Client-side (`.env`, prefixed `VITE_`):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `GOOGLE_MAPS_PLATFORM_KEY` (optional, for live map in `AlertSentDashboard`)
- `GEMINI_API_KEY` (optional, not actively used)

Edge Function env vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) are injected automatically by the Supabase runtime.

### Styling

Tailwind CSS v4 via `@tailwindcss/vite`. Custom CSS variables are defined in `src/index.css` under `@theme`. Dark mode is managed through `ThemeContext` (not Tailwind's `dark:` variant) — components check `const { theme } = useTheme()` and apply classes conditionally.
