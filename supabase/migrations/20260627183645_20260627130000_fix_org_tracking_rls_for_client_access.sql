/*
# Fix Organization Tracking RLS for Client Access

## Summary
The ResponderOrgTracking component needs to display client information (name, phone) for alerts handled by organization members. Currently, responders can only see their own profile and other org member profiles, but not client profiles.

## Changes
1. Add policy allowing responders to view client profiles for alerts they respond to
2. Update the org alerts policy to be clearer and include UNRESOLVED status
*/

-- 1. Allow responders to view client profiles for alerts they have responded to
-- This enables the org tracking page to show client info for alerts handled by org members
DROP POLICY IF EXISTS "Responders can view client profiles for their alerts" ON profiles;
CREATE POLICY "Responders can view client profiles for their alerts"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    -- User can see their own profile (already covered by another policy, but included for completeness)
    auth.uid() = id
    OR
    -- Responders can see profiles of clients whose alerts they responded to
    (
      user_type = 'Client'
      AND EXISTS (
        SELECT 1 FROM alerts
        WHERE alerts.current_responder_id = auth.uid()
        AND alerts.client_id = profiles.id
      )
    )
    OR
    -- Org responders can see client profiles for alerts handled by their org members
    (
      user_type = 'Client'
      AND EXISTS (
        SELECT 1 FROM alerts
        JOIN profiles AS responder ON responder.id = alerts.current_responder_id
        WHERE alerts.client_id = profiles.id
        AND alerts.current_responder_id IS NOT NULL
        AND responder.organization_name = public.get_user_org(auth.uid())
        AND responder.organization_name IS NOT NULL
        AND responder.organization_name != ''
      )
    )
  );

-- 2. Update alerts status constraint to include UNRESOLVED if not already there
DO $$
BEGIN
  -- Check if UNRESOLVED is already in the check constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname LIKE '%status%' 
    AND conrelid = 'alerts'::regclass
    AND pg_get_constraintdef(oid) LIKE '%UNRESOLVED%'
  ) THEN
    -- Drop and recreate the constraint with UNRESOLVED included
    ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_status_check;
    ALTER TABLE alerts ADD CONSTRAINT alerts_status_check 
      CHECK (status IN ('ACTIVE', 'ACCEPTED', 'RESOLVED', 'UNRESOLVED'));
  END IF;
END $$;

-- 3. Update the select_org_alerts policy to include alerts from the user's own org
-- (including UNRESOLVED status)
DROP POLICY IF EXISTS "select_org_alerts" ON alerts;
CREATE POLICY "select_org_alerts"
  ON alerts FOR SELECT
  TO authenticated
  USING (
    -- Responders can see alerts they are currently handling
    current_responder_id = auth.uid()
    OR
    -- Responders can see alerts handled by their org members
    (
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
    )
  );
