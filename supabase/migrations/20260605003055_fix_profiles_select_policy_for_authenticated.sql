/*
  # Fix: Allow authenticated users to read all profiles

  The existing "Public can read all profiles" policy was scoped to `anon` only,
  meaning authenticated clients could NOT read responder profiles (needed for
  the client map to show responder locations). This replaces that policy with
  one that applies to `authenticated` as well.
*/

-- Drop the anon-only public read policy
DROP POLICY IF EXISTS "Public can read all profiles" ON profiles;

-- Recreate it for both anon AND authenticated roles
CREATE POLICY "Anyone can read all profiles" ON profiles
  FOR SELECT
  TO anon, authenticated
  USING (true);
