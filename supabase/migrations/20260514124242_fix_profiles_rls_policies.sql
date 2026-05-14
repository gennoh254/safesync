/*
  # Fix profiles RLS policies for signup flow

  ## Summary
  Updates RLS policies on profiles table to properly allow users to insert their own profiles during signup.
  The previous INSERT policy had incorrect WITH CHECK clause. This migration removes the old policies
  and creates corrected ones.

  ## Changes
  - Drops old restrictive policies on profiles
  - Creates new policies that allow authenticated users to insert and update their own profiles
  - Maintains security by checking auth.uid() matches the profile id
*/

DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
  DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
  DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
END $$;

CREATE POLICY "Users can insert own profile on signup"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can view own profile data"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile data"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
