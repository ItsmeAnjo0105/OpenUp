-- Resident-initiated reschedule. A CONFIRMED booking already has a Payment tied to
-- the old time and (if a credit was used) a 'used' Care_Credit -- moving the time
-- means the psychologist hasn't actually agreed to THIS slot yet, so both get
-- unwound back to the pending state a fresh request would be in: the credit goes
-- back to 'reserved' (not 'available' -- it's still earmarked for this booking, not
-- released to the pool) and the stale Payment is deleted (accept_booking_request
-- creates a fresh one when the psychologist re-accepts).
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

  IF v_booking.status = 'confirmed' THEN
    IF v_booking.care_credit_id IS NOT NULL THEN
      UPDATE "Care_Credit" SET status = 'reserved' WHERE credit_id = v_booking.care_credit_id;
    END IF;
    DELETE FROM "Payment" WHERE booking_id = p_booking_id;
  END IF;

  -- Raises unique_violation (23505) if the psychologist already has a live booking
  -- at the new time -- same protection as creating or reassigning a booking.
  UPDATE "Booking"
  SET schedule = p_new_schedule, status = 'pending'
  WHERE booking_id = p_booking_id;

  SELECT * INTO v_booking FROM "Booking" WHERE booking_id = p_booking_id;
  RETURN json_build_object('booking', row_to_json(v_booking));
END;
$$;
