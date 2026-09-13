-- Adds the profile fields a psychologist can self-edit that don't exist yet.
-- specialties, credentials, license_no, session_price, is_verified, and is_available
-- already existed and stay controlled by signup/admin verification -- these three are
-- new and safe for the psychologist to change themselves at any time.
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
ALTER TABLE "Psychologist"
  ADD COLUMN IF NOT EXISTS years_experience INT,
  ADD COLUMN IF NOT EXISTS languages TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS availability TEXT;
