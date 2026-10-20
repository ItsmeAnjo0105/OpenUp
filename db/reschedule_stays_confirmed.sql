-- Bookings are now auto-confirmed with payment already settled at creation
-- time (see create_booking_transaction / p_auto_confirm). The old version of
-- this function reverted a confirmed booking to 'pending' on reschedule so a
-- psychologist could re-accept the new time -- but nothing re-accepts pending
-- bookings anymore under auto-confirm, so that would strand it forever.
-- Rescheduling now only ever changes WHEN the already-paid-for session
-- happens; the booking, its Payment, and its Care_Credit are untouched.
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
CREATE OR REPLACE FUNCTION reschedule_booking(
  p_booking_id INT,
  p_resident_id INT,
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

  IF v_booking.resident_id != p_resident_id THEN
    RAISE EXCEPTION 'NOT_YOUR_BOOKING';
  END IF;

  IF v_booking.status IN ('cancelled', 'declined') THEN
    RAISE EXCEPTION 'ALREADY_TERMINAL';
  END IF;

  -- Raises unique_violation (23505) if the psychologist already has a live
  -- booking at the new time -- same protection as creating a booking.
  UPDATE "Booking"
  SET schedule = p_new_schedule
  WHERE booking_id = p_booking_id;

  SELECT * INTO v_booking FROM "Booking" WHERE booking_id = p_booking_id;
  RETURN json_build_object('booking', row_to_json(v_booking));
END;
$$;
