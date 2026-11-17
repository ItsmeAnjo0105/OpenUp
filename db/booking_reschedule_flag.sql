-- The Appointment Management calendar needs to show "Rescheduled" as its own
-- card color, but rescheduling a booking today only ever changes its `schedule`
-- -- there was no record that a reschedule happened at all. This adds a
-- timestamp the reschedule endpoints stamp, and the cancel/accept/decline paths
-- never touch, so it only ever reflects "this booking's time was moved."
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
ALTER TABLE "Booking"
  ADD COLUMN IF NOT EXISTS rescheduled_at TIMESTAMPTZ;
