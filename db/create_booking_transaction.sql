-- Makes "claim a credit, create the booking, create the payment" one real Postgres
-- transaction instead of three separate HTTP round-trips from the Node server.
--
-- Why this matters: with three separate calls, if the Payment insert fails after the
-- Booking already succeeded, you're left with a confirmed booking, a permanently
-- "used" Care_Credit, and no payment record to show for it -- a silently broken
-- record with no way to recover automatically. A PL/pgSQL function runs inside a
-- single transaction: any unhandled error (including the booking_psychologist_schedule_unique
-- violation from db/booking_slot_unique.sql) rolls back everything the function did,
-- including the credit claim, so nothing is left half-done.
--
-- FOR UPDATE SKIP LOCKED on the credit lookup replaces the app-level conditional
-- UPDATE from claimCareCredit() -- inside a single transaction it's the more standard
-- way to claim one row safely under concurrency.
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
CREATE OR REPLACE FUNCTION create_booking_transaction(
  p_resident_id INT,
  p_psychologist_id INT,
  p_schedule TIMESTAMPTZ,
  p_session_type TEXT DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_session_price NUMERIC;
  v_credit_id INT;
  v_booking_id INT;
  v_booking RECORD;
  v_payment RECORD;
  v_platform_fee NUMERIC;
  v_payout NUMERIC;
BEGIN
  SELECT session_price INTO v_session_price
  FROM "Psychologist"
  WHERE psychologist_id = p_psychologist_id;

  IF v_session_price IS NULL THEN
    RAISE EXCEPTION 'PSYCHOLOGIST_NOT_FOUND';
  END IF;

  -- Claim one available credit for this resident, skipping any row another
  -- concurrent transaction already has locked instead of waiting on it.
  SELECT credit_id INTO v_credit_id
  FROM "Care_Credit"
  WHERE resident_id = p_resident_id AND status = 'available'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_credit_id IS NOT NULL THEN
    UPDATE "Care_Credit" SET status = 'used' WHERE credit_id = v_credit_id;
  END IF;

  -- Raises a unique_violation (23505) automatically if this slot is already booked --
  -- caught by the caller, and it rolls back the credit claim above for free.
  INSERT INTO "Booking" (resident_id, psychologist_id, schedule, status, care_credit_id, session_type)
  VALUES (p_resident_id, p_psychologist_id, p_schedule, 'confirmed', v_credit_id, p_session_type)
  RETURNING booking_id INTO v_booking_id;

  v_platform_fee := ROUND(v_session_price * 0.2, 2);
  v_payout := ROUND(v_session_price * 0.8, 2);

  INSERT INTO "Payment" (booking_id, amount, platform_fee, psychologist_payout, status)
  VALUES (
    v_booking_id,
    v_session_price,
    v_platform_fee,
    v_payout,
    CASE WHEN v_credit_id IS NOT NULL THEN 'paid' ELSE 'pending' END
  )
  RETURNING * INTO v_payment;

  SELECT * INTO v_booking FROM "Booking" WHERE booking_id = v_booking_id;

  RETURN json_build_object(
    'booking', row_to_json(v_booking),
    'payment', row_to_json(v_payment),
    'care_credit_applied', v_credit_id IS NOT NULL
  );
END;
$$;
