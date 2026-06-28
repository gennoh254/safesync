/*
  # Add tables to realtime publication

  ## Summary
  Adds the alerts and profiles tables to the supabase_realtime publication
  so that realtime subscriptions work for these tables.
*/

-- Add alerts table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;

-- Add profiles table to realtime publication for responder status tracking
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;