/*
  # Add responder availability tracking

  1. New Column
    - `profiles.has_active_alert` (boolean) - Indicates if responder is currently handling an alert
    - `profiles.last_declined_at` (timestamptz) - Tracks when responder last declined (for cooldown)

  2. Important Notes
    - When a responder accepts an alert, has_active_alert is set to true
    - When an alert is resolved, the responder's has_active_alert is set to false
    - This allows quick filtering of available responders without joining alerts table
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'has_active_alert'
  ) THEN
    ALTER TABLE profiles ADD COLUMN has_active_alert boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'last_declined_at'
  ) THEN
    ALTER TABLE profiles ADD COLUMN last_declined_at timestamptz;
  END IF;
END $$;