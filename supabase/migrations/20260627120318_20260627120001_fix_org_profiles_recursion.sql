/*
# Fix RLS recursion on profiles for organization tracking

## Summary
The previous `select_org_members` policy on `profiles` caused infinite recursion because it ran a `SELECT` from `profiles` inside a `profiles` RLS policy. This migration replaces it with a `SECURITY DEFINER` function that reads the current user's organization without triggering RLS recursion.

## Changes
1. Drops the recursive `select_org_members` policy on profiles
2. Creates a `SECURITY DEFINER` function `get_user_org` that bypasses RLS to read the current user's organization
3. Creates a new `select_org_members` policy using that function
*/

-- 1. Drop the recursive policy
DROP POLICY IF EXISTS "select_org_members" ON profiles;

-- 2. Create a SECURITY DEFINER function that reads the user's org
-- This bypasses RLS because it runs with the owner's privileges
CREATE OR REPLACE FUNCTION public.get_user_org(user_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_name FROM profiles WHERE id = user_id;
$$;

-- 3. Recreate the policy using the function (no recursion)
CREATE POLICY "select_org_members"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    user_type = 'Responder'
    AND organization_name = public.get_user_org(auth.uid())
    AND organization_name IS NOT NULL
    AND organization_name != ''
  );
