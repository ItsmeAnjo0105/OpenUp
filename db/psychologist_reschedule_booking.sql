-- Psychologist-initiated reschedule. Distinct from reschedule_booking (resident-
-- initiated): a resident proposing a new time hasn't been agreed to yet, so that
-- one resets the booking to 'pending' and unwinds payment/credit for a fresh
-- accept. Here the psychologist -- the service provider -- is the one moving the
-- time, so the booking's status, Payment, and Care_Credit are left exactly as
-- they were; only the schedule changes. The resident finds out via the
-- Notification the route creates alongside this call.
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
CREATE OR REPLACE FUNCTION psychologist_reschedule_booking(
  p_booking_id INT,
  p_psychologist_id INT,
  p_new_schedule TIMESTAMPTZ
) RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_booking RECORD;
BEGIN
  SELECT * INTO v_booking FROM "Booking" WHERE booking_id = p_booking_id FOR UPDATE;

  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;

  IF v_booking.psychologist_id != p_psychologist_id THEN
    RAISE EXCEPTION 'NOT_YOUR_BOOKING';
  END IF;

  IF v_booking.status IN ('cancelled', 'declined') THEN
    RAISE EXCEPTION 'ALREADY_TERMINAL';
  END IF;

  -- Raises unique_violation (23505) if this psychologist already has a live
  -- booking at the new time -- same protection as booking or reassigning.
  UPDATE "Booking" SET schedule = p_new_schedule WHERE booking_id = p_booking_id;

  SELECT * INTO v_booking FROM "Booking" WHERE booking_id = p_booking_id;
  RETURN json_build_object('booking', row_to_json(v_booking));
END;
$$;
