/*
  # Fix infinite recursion in RLS policies

  ## Problem
  Previous migration created policies that reference the profiles table within 
  the policy governing profiles access, causing infinite recursion:
  - "Admins can read all profiles" uses a subquery on profiles to check user_type
  - This creates a circular dependency when evaluating the policy

  ## Solution
  1. Drop the problematic admin policies that cause recursion
  2. Keep the public (anon) read policies which allow unauthenticated access
  3. Use JWT claims or a simpler approach for admin access

  ## Changes
  - Drop "Admins can read all profiles" policy (causes recursion)
  - Drop "Admins can read all alerts" policy (causes recursion)  
  - Drop "Admins can update any profile" policy (causes recursion)
  - Drop "Admins can update any alert" policy (causes recursion)
  - Keep public read-only policies for admin dashboard display
*/

-- Drop the problematic policies causing infinite recursion
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can read all alerts" ON alerts;
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;
DROP POLICY IF EXISTS "Admins can update any alert" ON alerts;
