/*
  # Fix alerts RLS for responder visibility

  ## Summary
  Ensures responders can view all alerts (not just ACTIVE ones) so the alerts section
  shows both active and historical alerts. Also ensures clients can view all their own
  alerts for their alert history tab. Replaces the existing SELECT policies with
  updated ones.

  ## Changes
  - Drops and recreates the responder SELECT policy to allow viewing all alerts (any status)
  - Drops and recreates the client SELECT policy to allow viewing all their own alerts

  ## Security
  - Responders must be authenticated and have user_type = 'Responder' in profiles
  - Clients can only view their own alerts (auth.uid() = client_id)
*/

DROP POLICY IF EXISTS "Responders can view all active alerts" ON alerts;
DROP POLICY IF EXISTS "Clients can view their own alerts" ON alerts;

CREATE POLICY "Responders can view all alerts"
  ON alerts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.user_type = 'Responder'
    )
  );

CREATE POLICY "Clients can view their own alerts"
  ON alerts FOR SELECT
  TO authenticated
  USING (auth.uid() = client_id);
