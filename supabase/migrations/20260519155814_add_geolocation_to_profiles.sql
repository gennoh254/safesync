/*
  # Add geolocation columns to profiles table

  ## Summary
  Adds latitude and longitude columns to the profiles table so users can store
  their real-time location. This enables the map features to show both client
  and responder positions and calculate distances between them.

  ## Changes
  - Add `latitude` column (numeric, nullable) to profiles
  - Add `longitude` column (numeric, nullable) to profiles

  ## Security
  - No RLS changes needed; existing policies already govern profile access
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'latitude'
  ) THEN
    ALTER TABLE profiles ADD COLUMN latitude numeric;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'longitude'
  ) THEN
    ALTER TABLE profiles ADD COLUMN longitude numeric;
  END IF;
END $$;
