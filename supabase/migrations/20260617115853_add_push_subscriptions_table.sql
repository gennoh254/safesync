CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_subscriptions_select" ON push_subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "users_manage_own_subscriptions_insert" ON push_subscriptions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_manage_own_subscriptions_update" ON push_subscriptions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_manage_own_subscriptions_delete" ON push_subscriptions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
