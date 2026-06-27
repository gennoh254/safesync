/*
# Add Organization Tracking RLS Policies

## Summary
This migration adds Row Level Security policies that allow responder admins to view their organization members' profiles and the alerts those responders have handled. This enables a responder admin tracking page to show team activity including online/offline status, alerts accepted/declined, and alert details.

## New Policies
- `select_org_members` on profiles: authenticated responders can view other responder profiles in the same organization
- `select_org_alerts` on alerts: authenticated responder admins can view alerts handled by their organization members

## Security
- Only authenticated users can access these policies
- Organization access is scoped by matching `organization_name`
- Responder admins can track all members in their organization
- Regular members can also see other org members (needed for coordination)
- Alert access is scoped to responders in the same organization
*/

-- 1. Allow responders to view profiles in the same organization
DROP POLICY IF EXISTS "select_org_members" ON profiles;
CREATE POLICY "select_org_members"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles AS my_profile
      WHERE my_profile.id = auth.uid()
        AND my_profile.user_type = 'Responder'
        AND profiles.organization_name = my_profile.organization_name
        AND profiles.organization_name != ''
        AND profiles.organization_name IS NOT NULL
    )
  );

-- 2. Allow responders to view alerts handled by their org members
DROP POLICY IF EXISTS "select_org_alerts" ON alerts;
CREATE POLICY "select_org_alerts"
  ON alerts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles AS my_profile
      WHERE my_profile.id = auth.uid()
        AND my_profile.user_type = 'Responder'
        AND my_profile.organization_name != ''
        AND my_profile.organization_name IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM profiles AS org_member
          WHERE org_member.id = alerts.current_responder_id
            AND org_member.organization_name = my_profile.organization_name
        )
    )
  );
