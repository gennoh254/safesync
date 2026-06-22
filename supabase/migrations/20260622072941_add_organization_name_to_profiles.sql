/*
  # Add organization_name to profiles for responder organizations

  ## Summary
  Adds organization_name column to profiles table so that:
  - Admin responders can set their organization name
  - Invited users inherit the organization name from their inviter
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS organization_name text DEFAULT '';