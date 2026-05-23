/*
  # Add public read policies for admin dashboard

  ## Summary
  Adds public (anon) read-only policies for profiles and alerts tables.
  This allows the admin dashboard to display data without authentication.
  Write operations remain protected by existing authenticated-only policies.

  ## Changes
  - Add public SELECT policy for profiles (read-only)
  - Add public SELECT policy for alerts (read-only)

  ## Security
  - Only SELECT (read) is allowed for public users
  - No INSERT, UPDATE, or DELETE permissions for public users
  - Data exposure is intentional for admin monitoring purposes
*/

-- Allow anonymous users to read all profiles (admin dashboard display)
CREATE POLICY "Public can read all profiles"
  ON profiles FOR SELECT
  TO anon
  USING (true);

-- Allow anonymous users to read all alerts (admin dashboard display)
CREATE POLICY "Public can read all alerts"
  ON alerts FOR SELECT
  TO anon
  USING (true);
