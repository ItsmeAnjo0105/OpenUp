-- A short self-written bio a psychologist can show on their public card --
-- the redesigned Book Counseling card has room for one, and there was no
-- backing field for it at all before this.
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
ALTER TABLE "Psychologist" ADD COLUMN IF NOT EXISTS bio TEXT;
