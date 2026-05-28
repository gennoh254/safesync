/*
  # Add alert escalation tracking fields

  ## Summary
  Adds fields to track alert escalation status and responder notification history.
  This enables the system to route alerts to the next responder if no response within timeout.

  ## Changes
  - `alerts` table: Add `escalated_at` timestamp
  - `alerts` table: Add `escalation_count` integer (default 0)
  - `alerts` table: Add `notified_responder_ids` array to track which responders were notified
  - `alerts` table: Add `current_responder_id` for the responder currently being notified
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'alerts' AND column_name = 'escalated_at'
  ) THEN
    ALTER TABLE alerts ADD COLUMN escalated_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'alerts' AND column_name = 'escalation_count'
  ) THEN
    ALTER TABLE alerts ADD COLUMN escalation_count integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'alerts' AND column_name = 'notified_responder_ids'
  ) THEN
    ALTER TABLE alerts ADD COLUMN notified_responder_ids uuid[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'alerts' AND column_name = 'current_responder_id'
  ) THEN
    ALTER TABLE alerts ADD COLUMN current_responder_id uuid;
  END IF;
END $$;