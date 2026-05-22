/*
  # Add last_location_update timestamp to profiles

  ## Summary
  Adds a timestamp column to track when a user's location was last updated.
  This enables the client map to filter for "online" responders based on
  recent location updates (within last 5 minutes).

  ## Changes
  - Add `last_location_update` column (timestamptz, nullable) to profiles

  ## Security
  - No RLS changes needed; existing policies govern profile access
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'last_location_update'
  ) THEN
    ALTER TABLE profiles ADD COLUMN last_location_update timestamptz;
  END IF;
END $$;
