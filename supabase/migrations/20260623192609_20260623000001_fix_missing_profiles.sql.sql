/*
  # Fix missing profiles and auto-create profile on user signup

  ## Summary
  1. Creates a trigger that automatically creates a profile record when a new user signs up
  2. Fixes existing users who don't have profiles by creating them from user_metadata

  ## Why
  Several responder users were created but their profiles were not properly created,
  causing them to be redirected to the client dashboard instead of responder dashboard.

  ## Changes
  1. Creates handle_new_user function to auto-create profiles
  2. Creates a trigger on auth.users after insert
  3. Backfills missing profiles for existing users
*/

-- Function to automatically create a profile when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, user_type, phone, response_types, invited_by, organization_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'user_type', 'Client'),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    CASE
      WHEN NEW.raw_user_meta_data->>'response_types' IS NOT NULL
      THEN string_to_array(NEW.raw_user_meta_data->>'response_types', ',')
      ELSE '{}'::text[]
    END,
    (NEW.raw_user_meta_data->>'invited_by')::uuid,
    COALESCE(NEW.raw_user_meta_data->>'organization_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop the trigger if it exists, then create it
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Fix existing users who don't have profiles
-- Insert profiles for any auth.users that don't have a corresponding profile
INSERT INTO public.profiles (id, name, email, user_type, phone, response_types, invited_by, organization_name)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'name', ''),
  u.email,
  COALESCE(u.raw_user_meta_data->>'user_type', 'Client'),
  COALESCE(u.raw_user_meta_data->>'phone', ''),
  CASE
    WHEN u.raw_user_meta_data->>'response_types' IS NOT NULL
    THEN string_to_array(u.raw_user_meta_data->>'response_types', ',')
    ELSE '{}'::text[]
  END,
  (u.raw_user_meta_data->>'invited_by')::uuid,
  COALESCE(u.raw_user_meta_data->>'organization_name', '')
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;