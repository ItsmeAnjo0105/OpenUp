-- v2: adds p_auto_confirm. Regular resident bookings now go through as 'pending'
-- with their credit only RESERVED (not spent) until the psychologist accepts or
-- declines -- see db/booking_accept_decline.sql for that half. Crisis-match bookings
-- still pass p_auto_confirm := true to keep their original immediate-confirm behavior,
-- since an active crisis isn't something that should wait on a psychologist's approval.
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query) --
-- CREATE OR REPLACE is safe to run even though the function already exists from before.
CREATE OR REPLACE FUNCTION create_booking_transaction(
  p_resident_id INT,
  p_psychologist_id INT,
  p_schedule TIMESTAMPTZ,
  p_session_type TEXT DEFAULT NULL,
  p_auto_confirm BOOLEAN DEFAULT FALSE
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
  v_booking_status TEXT;
  v_credit_status TEXT;
BEGIN
  SELECT session_price INTO v_session_price
  FROM "Psychologist"
  WHERE psychologist_id = p_psychologist_id;

  IF v_session_price IS NULL THEN
    RAISE EXCEPTION 'PSYCHOLOGIST_NOT_FOUND';
  END IF;

  SELECT credit_id INTO v_credit_id
  FROM "Care_Credit"
  WHERE resident_id = p_resident_id AND status = 'available'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  v_booking_status := CASE WHEN p_auto_confirm THEN 'confirmed' ELSE 'pending' END;
  v_credit_status := CASE WHEN p_auto_confirm THEN 'used' ELSE 'reserved' END;

  IF v_credit_id IS NOT NULL THEN
    UPDATE "Care_Credit" SET status = v_credit_status WHERE credit_id = v_credit_id;
  END IF;

  -- Raises unique_violation (23505) if this slot already has a live (non-cancelled,
  -- non-declined) booking -- see db/booking_slot_unique_v2.sql.
  INSERT INTO "Booking" (resident_id, psychologist_id, schedule, status, care_credit_id, session_type)
  VALUES (p_resident_id, p_psychologist_id, p_schedule, v_booking_status, v_credit_id, p_session_type)
  RETURNING booking_id INTO v_booking_id;

  IF p_auto_confirm THEN
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
  END IF;

  SELECT * INTO v_booking FROM "Booking" WHERE booking_id = v_booking_id;

  RETURN json_build_object(
    'booking', row_to_json(v_booking),
    'payment', CASE WHEN p_auto_confirm THEN row_to_json(v_payment) ELSE NULL END,
    'care_credit_applied', p_auto_confirm AND v_credit_id IS NOT NULL,
    'care_credit_reserved', (NOT p_auto_confirm) AND v_credit_id IS NOT NULL
  );
END;
$$;
