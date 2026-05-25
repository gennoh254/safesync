/*
  # Add on-duty status tracking to responder profiles

  ## Summary
  Adds `on_duty` column to profiles table to track whether responders are currently on duty.
  This allows the system to persist on-duty status across page navigation and updates.

  ## Changes
  - `profiles` table: Add `on_duty` boolean column (default false)
  - Responders can update their own on_duty status
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'on_duty'
  ) THEN
    ALTER TABLE profiles ADD COLUMN on_duty boolean DEFAULT false;
  END IF;
END $$;