-- Messages are scoped to a Booking (the pairing that already exists between a
-- resident and a psychologist). sender_role is stored instead of a user id/name so
-- the API layer never even has real-identity columns to accidentally select --
-- masking is structural, not just a conditional check that could be forgotten later.
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
CREATE TABLE IF NOT EXISTS "Message" (
  message_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id BIGINT NOT NULL REFERENCES "Booking"(booking_id),
  sender_role TEXT NOT NULL CHECK (sender_role IN ('resident', 'psychologist')),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS message_booking_id_idx ON "Message" (booking_id, created_at);
