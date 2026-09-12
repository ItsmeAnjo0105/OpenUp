-- Accept/decline drive the booking state machine: accepting consumes the reserved
-- credit and creates the Payment; declining releases the credit back to 'available'.
-- Both run as a single transaction with FOR UPDATE on the booking row, so a
-- psychologist can't accept and decline the same request at the same time from two
-- tabs, and so the ownership + status checks can't be bypassed by a race.
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
CREATE OR REPLACE FUNCTION accept_booking_request(
  p_booking_id INT,
  p_psychologist_id INT
) RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_booking RECORD;
  v_session_price NUMERIC;
  v_platform_fee NUMERIC;
  v_payout NUMERIC;
  v_payment RECORD;
BEGIN
  SELECT * INTO v_booking FROM "Booking" WHERE booking_id = p_booking_id FOR UPDATE;

  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;

  IF v_booking.psychologist_id != p_psychologist_id THEN
    RAISE EXCEPTION 'NOT_YOUR_BOOKING';
  END IF;

  IF v_booking.status != 'pending' THEN
    RAISE EXCEPTION 'BOOKING_NOT_PENDING';
  END IF;

  IF v_booking.care_credit_id IS NOT NULL THEN
    UPDATE "Care_Credit" SET status = 'used' WHERE credit_id = v_booking.care_credit_id;
  END IF;

  UPDATE "Booking" SET status = 'confirmed' WHERE booking_id = p_booking_id;

  SELECT session_price INTO v_session_price FROM "Psychologist" WHERE psychologist_id = p_psychologist_id;
  v_platform_fee := ROUND(v_session_price * 0.2, 2);
  v_payout := ROUND(v_session_price * 0.8, 2);

  INSERT INTO "Payment" (booking_id, amount, platform_fee, psychologist_payout, status)
  VALUES (
    p_booking_id,
    v_session_price,
    v_platform_fee,
    v_payout,
    CASE WHEN v_booking.care_credit_id IS NOT NULL THEN 'paid' ELSE 'pending' END
  )
  RETURNING * INTO v_payment;

  SELECT * INTO v_booking FROM "Booking" WHERE booking_id = p_booking_id;

  RETURN json_build_object('booking', row_to_json(v_booking), 'payment', row_to_json(v_payment));
END;
$$;

CREATE OR REPLACE FUNCTION decline_booking_request(
  p_booking_id INT,
  p_psychologist_id INT
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

  IF v_booking.status != 'pending' THEN
    RAISE EXCEPTION 'BOOKING_NOT_PENDING';
  END IF;

  IF v_booking.care_credit_id IS NOT NULL THEN
    UPDATE "Care_Credit" SET status = 'available' WHERE credit_id = v_booking.care_credit_id;
  END IF;

  UPDATE "Booking" SET status = 'declined' WHERE booking_id = p_booking_id;

  SELECT * INTO v_booking FROM "Booking" WHERE booking_id = p_booking_id;

  RETURN json_build_object('booking', row_to_json(v_booking));
END;
$$;
