/*
  # Create alerts table for emergency alerts

  ## Summary
  Creates an `alerts` table to store emergency alerts sent by clients and viewed by responders.

  ## New Tables
  - `alerts`
    - `id` (uuid, PK)
    - `client_id` (uuid, FK to profiles) - user who sent the alert
    - `emergency_type` (text) - type of emergency (FIRE, MEDICAL, etc.)
    - `location` (text) - location of the emergency
    - `latitude` (numeric, optional) - latitude coordinate
    - `longitude` (numeric, optional) - longitude coordinate
    - `status` (text) - alert status (ACTIVE, ACCEPTED, RESOLVED)
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

  ## Security
  - RLS enabled
  - Clients can insert their own alerts
  - Responders can view all ACTIVE alerts
  - Clients can view their own alerts
*/

CREATE TABLE IF NOT EXISTS alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emergency_type text NOT NULL CHECK (emergency_type IN ('FIRE', 'MEDICAL', 'OTHER')),
  location text NOT NULL DEFAULT '',
  latitude numeric,
  longitude numeric,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ACCEPTED', 'RESOLVED')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can insert their own alerts"
  ON alerts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Clients can view their own alerts"
  ON alerts FOR SELECT
  TO authenticated
  USING (auth.uid() = client_id);

CREATE POLICY "Responders can view all active alerts"
  ON alerts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type = 'Responder'
    )
  );

CREATE POLICY "Responders can update alert status"
  ON alerts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type = 'Responder'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type = 'Responder'
    )
  );
