-- Private per-booking notes a psychologist keeps for their own reference. One
-- note per booking (upserted), visible only to the psychologist who owns it --
-- never to the resident, admin, or any other psychologist.
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
CREATE TABLE IF NOT EXISTS "Session_Note" (
  note_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id BIGINT NOT NULL UNIQUE REFERENCES "Booking"(booking_id) ON DELETE CASCADE,
  psychologist_id BIGINT NOT NULL REFERENCES "Psychologist"(psychologist_id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE "Session_Note" ENABLE ROW LEVEL SECURITY;
