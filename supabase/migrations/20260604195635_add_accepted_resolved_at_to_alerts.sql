/*
  # Add accepted_at and resolved_at timestamps to alerts

  1. New Columns
    - `alerts.accepted_at` (timestamptz) - Timestamp when a responder accepted the alert
    - `alerts.resolved_at` (timestamptz) - Timestamp when the alert was resolved/closed

  2. Modified Tables
    - `alerts` - Added two nullable timestamp columns

  3. Important Notes
    - `accepted_at` is set when status transitions to ACCEPTED
    - `resolved_at` is set when status transitions to RESOLVED
    - Both columns are nullable since they only get values at specific lifecycle points
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'alerts' AND column_name = 'accepted_at'
  ) THEN
    ALTER TABLE alerts ADD COLUMN accepted_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'alerts' AND column_name = 'resolved_at'
  ) THEN
    ALTER TABLE alerts ADD COLUMN resolved_at timestamptz;
  END IF;
END $$;
