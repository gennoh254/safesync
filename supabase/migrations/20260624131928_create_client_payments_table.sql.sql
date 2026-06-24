-- Create client_payments table for tracking account balances and payment history
CREATE TABLE IF NOT EXISTS client_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('card', 'mpesa')),
  payment_type TEXT NOT NULL CHECK (payment_type IN ('subscription', 'alert_fee')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  reference TEXT,
  alert_id UUID REFERENCES alerts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX idx_client_payments_client_id ON client_payments(client_id);
CREATE INDEX idx_client_payments_created_at ON client_payments(created_at DESC);

-- Enable RLS
ALTER TABLE client_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for client_payments
CREATE POLICY "select_own_payments" ON client_payments FOR SELECT
  TO authenticated USING (auth.uid() = client_id);

CREATE POLICY "insert_own_payments" ON client_payments FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = client_id);

CREATE POLICY "update_own_payments" ON client_payments FOR UPDATE
  TO authenticated USING (auth.uid() = client_id) WITH CHECK (auth.uid() = client_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_client_payments_updated_at
  BEFORE UPDATE ON client_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();