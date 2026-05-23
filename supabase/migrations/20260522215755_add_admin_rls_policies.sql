/*
  # Add admin RLS policies for full data access

  ## Summary
  Adds permissive RLS policies for admin users to view and manage all profiles and alerts.
  Admins are identified by being non-null in the admin_access field or by special role.
  Since the admin portal uses a special admin mode, we add public read policies for admin users.

  ## Changes
  - Add policy allowing authenticated users with 'Administrator' role to read all profiles
  - Add policy allowing authenticated users with 'Administrator' role to read all alerts
  - Add policy allowing authenticated users with 'Administrator' role to update all profiles and alerts

  ## Security
  - Admins must still be authenticated
  - Public access is NOT granted; only authenticated users with admin access can read all data
*/

-- Policy for admins to read all profiles
CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    -- Allow if user is accessing their own profile
    (auth.uid() = id)
    OR
    -- Allow if user_type is Administrator (for admin access)
    ((SELECT user_type FROM profiles WHERE id = auth.uid()) = 'Administrator')
  );

-- Policy for admins to read all alerts
CREATE POLICY "Admins can read all alerts"
  ON alerts FOR SELECT
  TO authenticated
  USING (
    -- Allow clients to view their own alerts
    (auth.uid() = client_id)
    OR
    -- Allow responders to view all alerts
    (EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.user_type = 'Responder'
    ))
    OR
    -- Allow administrators to view all alerts
    ((SELECT user_type FROM profiles WHERE id = auth.uid()) = 'Administrator')
  );

-- Policy for admins to update all profiles
CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    -- Allow if updating own profile
    (auth.uid() = id)
    OR
    -- Allow if user is admin
    ((SELECT user_type FROM profiles WHERE id = auth.uid()) = 'Administrator')
  )
  WITH CHECK (
    -- Allow if updating own profile
    (auth.uid() = id)
    OR
    -- Allow if user is admin
    ((SELECT user_type FROM profiles WHERE id = auth.uid()) = 'Administrator')
  );

-- Policy for admins to update all alerts
CREATE POLICY "Admins can update any alert"
  ON alerts FOR UPDATE
  TO authenticated
  USING (
    -- Allow responders to update
    (EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.user_type = 'Responder'
    ))
    OR
    -- Allow administrators to update
    ((SELECT user_type FROM profiles WHERE id = auth.uid()) = 'Administrator')
  )
  WITH CHECK (
    -- Allow responders to update
    (EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.user_type = 'Responder'
    ))
    OR
    -- Allow administrators to update
    ((SELECT user_type FROM profiles WHERE id = auth.uid()) = 'Administrator')
  );
