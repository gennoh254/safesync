/*
# Fix RLS infinite recursion for organization tracking

## Summary
The previous migration created circular RLS:
- `select_org_alerts` on alerts references profiles
- `Responders can view client profiles for their alerts` on profiles references alerts

This causes infinite recursion. The fix:
1. Remove the circular policy on profiles
2. Create a SECURITY DEFINER function to check org membership
3. Use the function in alerts policy instead of direct table references
*/

-- 1. Drop the problematic policy that causes circular reference
DROP POLICY IF EXISTS "Responders can view client profiles for their alerts" ON profiles;

-- 2. Create a SECURITY DEFINER function to check if a responder is in the same org as the current user
-- This bypasses RLS and breaks the circular dependency
CREATE OR REPLACE FUNCTION public.is_org_member(responder_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p1, profiles p2
    WHERE p1.id = auth.uid()
      AND p1.user_type = 'Responder'
      AND p1.organization_name IS NOT NULL
      AND p1.organization_name != ''
      AND p2.id = responder_id
      AND p2.organization_name = p1.organization_name
  );
$$;

-- 3. Drop and recreate the select_org_alerts policy using the function
DROP POLICY IF EXISTS "select_org_alerts" ON alerts;
CREATE POLICY "select_org_alerts"
  ON alerts FOR SELECT
  TO authenticated
  USING (
    -- Responder can see alerts they are handling
    current_responder_id = auth.uid()
    OR
    -- Responder can see alerts handled by their org members
    (
      current_responder_id IS NOT NULL
      AND public.is_org_member(current_responder_id)
    )
  );
