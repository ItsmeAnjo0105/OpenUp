-- Lets a resident choose to reveal their name on a specific message instead of the
-- masking always being on. Defaults to true (masked) so existing behavior is
-- unchanged unless a resident explicitly opts out for that message.
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
ALTER TABLE "Message"
  ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT true;
