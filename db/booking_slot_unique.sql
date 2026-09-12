-- Prevents two residents from booking the same psychologist at the same schedule
-- at the same time. Without this, two concurrent POST /bookings requests can both
-- pass the application-level checks and both insert successfully, double-booking
-- the slot -- this index makes Postgres itself reject the second insert instead.
--
-- Partial (WHERE status <> 'cancelled') so that once a cancellation flow exists,
-- a cancelled booking frees up its slot for someone else to book again.
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
CREATE UNIQUE INDEX IF NOT EXISTS booking_psychologist_schedule_unique
ON "Booking" (psychologist_id, schedule)
WHERE status <> 'cancelled';
