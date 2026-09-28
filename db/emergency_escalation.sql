-- A record of a psychologist flagging a live/upcoming session as an emergency
-- during that session -- this app has no real integration with police, EMS, or
-- a crisis hotline, so "escalate" here means: raise it urgently for every admin
-- to see and act on (the same honesty principle as Trusted_Contact's
-- delivered=false), never a claim that emergency services were actually contacted.
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
CREATE TABLE IF NOT EXISTS "Emergency_Escalation" (
  escalation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id BIGINT NOT NULL REFERENCES "Booking"(booking_id) ON DELETE CASCADE,
  psychologist_id BIGINT NOT NULL REFERENCES "Psychologist"(psychologist_id) ON DELETE CASCADE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "Emergency_Escalation" ENABLE ROW LEVEL SECURITY;
