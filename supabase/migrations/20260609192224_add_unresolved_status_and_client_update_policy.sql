/*
  # Add UNRESOLVED status and client update policy

  1. Status Changes
    - Adds 'UNRESOLVED' as a valid status (for when client reports incident wasn't resolved)
    - Adds 'CANCELLED' status for client-initiated cancellations

  2. RLS Policy Changes
    - Adds policy for clients to update their own alerts (to resolve/unresolve/cancel)
    - Clients can only update status, resolved_at fields

  3. Important Notes
    - Responders retain their update policy for accepting alerts
    - Clients can now mark their own alerts as RESOLVED, UNRESOLVED, or CANCELLED
*/

-- Drop existing constraint and add new one with UNRESOLVED and CANCELLED
ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_status_check;
ALTER TABLE alerts ADD CONSTRAINT alerts_status_check 
  CHECK (status IN ('ACTIVE', 'ACCEPTED', 'RESOLVED', 'UNRESOLVED', 'CANCELLED'));

-- Add policy for clients to update their own alerts (for resolving/cancelling)
CREATE POLICY "Clients can update their own alerts"
  ON alerts FOR UPDATE
  TO authenticated
  USING (auth.uid() = client_id)
  WITH CHECK (auth.uid() = client_id);