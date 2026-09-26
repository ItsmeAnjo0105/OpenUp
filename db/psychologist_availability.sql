-- A psychologist's weekly recurring working hours (day_of_week 0=Sunday..6=Saturday,
-- start_time/end_time in Philippines local time by convention -- the backend
-- converts to/from UTC explicitly with a +08:00 offset when generating bookable
-- slots, since that's how Booking.schedule is actually stored).
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
CREATE TABLE IF NOT EXISTS "Psychologist_Availability" (
  availability_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  psychologist_id BIGINT NOT NULL REFERENCES "Psychologist"(psychologist_id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

ALTER TABLE "Psychologist_Availability" ENABLE ROW LEVEL SECURITY;
