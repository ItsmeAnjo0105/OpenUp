-- Admin reassignment and cancellation, run as single transactions so a booking is
-- never left half-updated (e.g. psychologist changed but Payment still reflecting
-- the old one's price, or a booking cancelled but its credit never released).
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
CREATE OR REPLACE FUNCTION admin_cancel_booking(p_booking_id INT) RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_booking RECORD;
BEGIN
  SELECT * INTO v_booking FROM "Booking" WHERE booking_id = p_booking_id FOR UPDATE;

  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;

  IF v_booking.status IN ('cancelled', 'declined') THEN
    RAISE EXCEPTION 'ALREADY_TERMINAL';
  END IF;

  -- Release a reserved-or-used credit back to the resident regardless of which
  -- state the booking was in when cancelled.
  IF v_booking.care_credit_id IS NOT NULL THEN
    UPDATE "Care_Credit" SET status = 'available' WHERE credit_id = v_booking.care_credit_id;
  END IF;

  -- A paid Payment becomes 'refunded' (money owed back); an unpaid one just 'cancelled'.
  UPDATE "Payment"
  SET status = CASE WHEN status = 'paid' THEN 'refunded' ELSE 'cancelled' END
  WHERE booking_id = p_booking_id;

  UPDATE "Booking" SET status = 'cancelled' WHERE booking_id = p_booking_id;

  SELECT * INTO v_booking FROM "Booking" WHERE booking_id = p_booking_id;
  RETURN json_build_object('booking', row_to_json(v_booking));
END;
$$;

CREATE OR REPLACE FUNCTION admin_reassign_booking(
  p_booking_id INT,
  p_new_psychologist_id INT
) RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_booking RECORD;
  v_new_price NUMERIC;
  v_platform_fee NUMERIC;
  v_payout NUMERIC;
BEGIN
  SELECT * INTO v_booking FROM "Booking" WHERE booking_id = p_booking_id FOR UPDATE;

  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;

  IF v_booking.status IN ('cancelled', 'declined') THEN
    RAISE EXCEPTION 'ALREADY_TERMINAL';
  END IF;

  SELECT session_price INTO v_new_price
  FROM "Psychologist"
  WHERE psychologist_id = p_new_psychologist_id AND is_verified = true;

  IF v_new_price IS NULL THEN
    RAISE EXCEPTION 'NEW_PSYCHOLOGIST_NOT_FOUND_OR_UNVERIFIED';
  END IF;

  -- Raises unique_violation (23505) if the new psychologist already has a live
  -- booking at this exact schedule -- same index that protects normal booking creation.
  UPDATE "Booking" SET psychologist_id = p_new_psychologist_id WHERE booking_id = p_booking_id;

  -- If this booking was already confirmed (and therefore has a Payment), the new
  -- psychologist's own session_price replaces the old one -- pricing is per-psychologist,
  -- so reassigning without recomputing this would silently keep the wrong price/payout.
  IF v_booking.status = 'confirmed' THEN
    v_platform_fee := ROUND(v_new_price * 0.2, 2);
    v_payout := ROUND(v_new_price * 0.8, 2);

    UPDATE "Payment"
    SET amount = v_new_price, platform_fee = v_platform_fee, psychologist_payout = v_payout
    WHERE booking_id = p_booking_id;
  END IF;

  SELECT * INTO v_booking FROM "Booking" WHERE booking_id = p_booking_id;
  RETURN json_build_object('booking', row_to_json(v_booking));
END;
$$;
