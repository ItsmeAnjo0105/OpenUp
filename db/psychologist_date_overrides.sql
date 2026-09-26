-- Date-specific overrides on top of the weekly recurring pattern in
-- "Psychologist_Availability". A date with any row here ignores the weekly
-- pattern entirely for that date:
--   * is_closed = true  -> that date has zero bookable slots (a day off),
--                          start_time/end_time are left null.
--   * is_closed = false -> start_time/end_time define one custom window for
--                          that date (add several rows for several windows).
-- A date with no rows here just falls back to the weekly pattern, as before.
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
CREATE TABLE IF NOT EXISTS "Psychologist_Date_Override" (
  override_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  psychologist_id BIGINT NOT NULL REFERENCES "Psychologist"(psychologist_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  is_closed BOOLEAN NOT NULL DEFAULT false,
  start_time TIME,
  end_time TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time),
  CHECK (
    (is_closed AND start_time IS NULL AND end_time IS NULL)
    OR (NOT is_closed AND start_time IS NOT NULL AND end_time IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS psychologist_date_override_lookup
  ON "Psychologist_Date_Override" (psychologist_id, date);

ALTER TABLE "Psychologist_Date_Override" ENABLE ROW LEVEL SECURITY;
