-- v2: a declined request must free up its slot for someone else to book, same as a
-- cancelled one -- the original index (db/booking_slot_unique.sql) only excluded
-- 'cancelled', so a declined booking would have wrongly kept blocking that slot forever.
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
DROP INDEX IF EXISTS booking_psychologist_schedule_unique;

CREATE UNIQUE INDEX IF NOT EXISTS booking_psychologist_schedule_unique
ON "Booking" (psychologist_id, schedule)
WHERE status NOT IN ('cancelled', 'declined');
