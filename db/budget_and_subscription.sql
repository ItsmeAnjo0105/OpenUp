-- Two new tables plus the functions that wire them into the existing Care Credit
-- allocation flow: a barangay's Subscription status gates whether it can be funded
-- at all, and its Budget gates how many Care Credits it can actually issue --
-- matching "payment status and plan changes determine whether a barangay can fund
-- credits" and "financial integrity matters" from the module descriptions.
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).

CREATE TABLE IF NOT EXISTS "Subscription" (
  subscription_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  barangay_id BIGINT NOT NULL UNIQUE REFERENCES "Barangay"(barangay_id),
  plan TEXT NOT NULL DEFAULT 'basic',
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'past_due', 'cancelled')),
  renewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Budget" (
  budget_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  barangay_id BIGINT NOT NULL UNIQUE REFERENCES "Barangay"(barangay_id),
  total_funded NUMERIC NOT NULL DEFAULT 0,
  total_spent NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Adds funds to a barangay's budget (upserts the row, incrementing rather than
-- replacing total_funded). Blocked unless the barangay's subscription is 'active' --
-- a barangay with no Subscription row at all (the default for every barangay until
-- an admin sets one) is treated the same as inactive, which is the safe default.
CREATE OR REPLACE FUNCTION fund_barangay_budget(p_barangay_id INT, p_amount NUMERIC) RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_budget RECORD;
  v_sub_status TEXT;
BEGIN
  SELECT status INTO v_sub_status FROM "Subscription" WHERE barangay_id = p_barangay_id;

  IF v_sub_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'SUBSCRIPTION_INACTIVE';
  END IF;

  INSERT INTO "Budget" (barangay_id, total_funded, total_spent)
  VALUES (p_barangay_id, p_amount, 0)
  ON CONFLICT (barangay_id) DO UPDATE SET total_funded = "Budget".total_funded + EXCLUDED.total_funded
  RETURNING * INTO v_budget;

  RETURN row_to_json(v_budget);
END;
$$;

-- Replaces the plain-insert version of single-resident Care Credit issuance: now
-- requires an active subscription and enough remaining budget (total_funded -
-- total_spent), and locks the Budget row (FOR UPDATE) so two concurrent allocations
-- against the same barangay can't both pass the balance check and jointly overspend it.
CREATE OR REPLACE FUNCTION allocate_care_credit_single(p_resident_id INT, p_amount NUMERIC) RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_barangay_id INT;
  v_sub_status TEXT;
  v_budget RECORD;
  v_credit RECORD;
BEGIN
  SELECT barangay_id INTO v_barangay_id FROM "User" WHERE user_id = p_resident_id AND role = 'resident';
  IF v_barangay_id IS NULL THEN
    RAISE EXCEPTION 'RESIDENT_NOT_FOUND';
  END IF;

  SELECT status INTO v_sub_status FROM "Subscription" WHERE barangay_id = v_barangay_id;
  IF v_sub_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'SUBSCRIPTION_INACTIVE';
  END IF;

  SELECT * INTO v_budget FROM "Budget" WHERE barangay_id = v_barangay_id FOR UPDATE;
  IF v_budget IS NULL THEN
    RAISE EXCEPTION 'NO_BUDGET_FOR_BARANGAY';
  END IF;

  IF (v_budget.total_funded - v_budget.total_spent) < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_BUDGET';
  END IF;

  UPDATE "Budget" SET total_spent = total_spent + p_amount WHERE budget_id = v_budget.budget_id;

  INSERT INTO "Care_Credit" (barangay_id, resident_id, amount, status)
  VALUES (v_barangay_id, p_resident_id, p_amount, 'available')
  RETURNING * INTO v_credit;

  RETURN row_to_json(v_credit);
END;
$$;

-- Same guarantees as above, for bulk issuance to every resident of a barangay.
CREATE OR REPLACE FUNCTION allocate_care_credits_bulk(p_barangay_id INT, p_amount NUMERIC) RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_sub_status TEXT;
  v_budget RECORD;
  v_count INT;
  v_total NUMERIC;
BEGIN
  SELECT status INTO v_sub_status FROM "Subscription" WHERE barangay_id = p_barangay_id;
  IF v_sub_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'SUBSCRIPTION_INACTIVE';
  END IF;

  SELECT * INTO v_budget FROM "Budget" WHERE barangay_id = p_barangay_id FOR UPDATE;
  IF v_budget IS NULL THEN
    RAISE EXCEPTION 'NO_BUDGET_FOR_BARANGAY';
  END IF;

  SELECT count(*) INTO v_count FROM "User" WHERE barangay_id = p_barangay_id AND role = 'resident';

  IF v_count = 0 THEN
    RETURN json_build_object('credits_issued', 0, 'total_amount', 0);
  END IF;

  v_total := p_amount * v_count;

  IF (v_budget.total_funded - v_budget.total_spent) < v_total THEN
    RAISE EXCEPTION 'INSUFFICIENT_BUDGET';
  END IF;

  UPDATE "Budget" SET total_spent = total_spent + v_total WHERE budget_id = v_budget.budget_id;

  INSERT INTO "Care_Credit" (barangay_id, resident_id, amount, status)
  SELECT p_barangay_id, user_id, p_amount, 'available'
  FROM "User" WHERE barangay_id = p_barangay_id AND role = 'resident';

  RETURN json_build_object('credits_issued', v_count, 'total_amount', v_total);
END;
$$;
