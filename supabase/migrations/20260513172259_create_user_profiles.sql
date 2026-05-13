/*
  # Create user profiles table

  ## Summary
  Creates a `profiles` table to store user data linked to Supabase auth.

  ## New Tables
  - `profiles`
    - `id` (uuid, PK, references auth.users)
    - `name` (text) - full name
    - `company` (text) - company or organization name
    - `email` (text) - user email (mirrored for easy lookup)
    - `user_type` (text) - either 'Client' or 'Responder'
    - `created_at` (timestamptz)

  ## Security
  - RLS enabled
  - Users can read and update their own profile
  - Users can insert their own profile on signup
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  company text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  user_type text NOT NULL DEFAULT 'Client' CHECK (user_type IN ('Client', 'Responder')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
