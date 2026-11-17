-- Completed Sessions (Appointment Management > Completed Sessions).
--
-- Until now "completed" was only ever inferred ("confirmed and its time has
-- passed"), which can't tell a session that actually happened from one nobody
-- showed up to. This adds an explicit marker on the EXISTING Booking row -- no
-- separate sessions table. The psychologist sets it with "Mark as completed"
-- (POST /bookings/:id/complete), which is only allowed for a confirmed, paid
-- booking whose start time has already passed, so a completed session can
-- never also count as upcoming.
--
-- Booking.status stays 'confirmed' so every existing query that reads it keeps
-- working; completed_at is the single source of truth for "completed".
-- Existing past sessions are NOT back-filled: nothing in the data proves they
-- actually took place, so the psychologist confirms each one.
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
ALTER TABLE "Booking"
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_booking_psychologist_completed
  ON "Booking" (psychologist_id, completed_at)
  WHERE completed_at IS NOT NULL;
