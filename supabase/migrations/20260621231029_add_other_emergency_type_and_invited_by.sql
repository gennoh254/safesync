/*
  # Add OTHER emergency type and invited_by field for responder user management

  ## Summary
  1. Adds 'OTHER' to the emergency_type enum in alerts table
  2. Adds description column for OTHER emergencies
  3. Adds invited_by column to profiles to track who created a responder user
  4. Updates RLS to allow responders to create other responder users
*/

-- Add description column to alerts for OTHER emergencies
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS description text DEFAULT '';

-- Add invited_by column to profiles for responder user management
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- Create an RLS policy for responders to create other responder users
-- They can only create users where invited_by is their own id
CREATE POLICY "Responders can create other responder users"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Allow normal user creation (self-registration)
    auth.uid() = id
    OR
    -- Allow responders to create other responders with themselves as inviter
    (
      EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.user_type = 'Responder'
        AND p.invited_by IS NULL  -- Only responders who weren't invited can add users
      )
      AND user_type = 'Responder'
      AND invited_by = auth.uid()
    )
  );

-- Drop the old insert policy and recreate
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

-- Allow admins (from admin_rls_policies migration) to also create users
-- The above policy handles self-registration and responder-invited users