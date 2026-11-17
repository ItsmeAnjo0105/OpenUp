-- Subscription renewals: manual renewal with admin approval, payment
-- verification, scheduled activation and automatic expiry.
--
-- Builds on the existing tables -- no second subscription system:
--   Subscription          still ONE current row per barangay (the active term)
--   Subscription_History  still the audit trail; new action types added
--   Budget                the barangay's Care Credit pool; a plan's credits are
--                         added here exactly once, when its term activates
--   Subscription_Plan     the catalog; gains an optional features list
-- New:
--   Subscription_Request             barangay's request for its next plan
--                                     pending -> approved -> scheduled -> activated
--                                     (or rejected / cancelled); never deleted
--   Subscription_Credit_Issuance     one row per activation (UNIQUE request_id), so
--                                     plan credits can never be issued twice
--   Subscription_Reminder            30/15/7-day expiry reminders already sent
--                                     (UNIQUE per term + interval)
-- Lifecycle changes run inside the two functions at the bottom so each one
-- is a single transaction (activate = new term + credits + ledger + history).
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
-- Safe to re-run. Requires db/budget_and_subscription.sql and db/subscription_module.sql.

-- ---------------------------------------------------------------------------
-- Subscription: real 'expired' status (replaces the old ad-hoc 'past_due')
-- ---------------------------------------------------------------------------
ALTER TABLE "Subscription" DROP CONSTRAINT IF EXISTS "Subscription_status_check";
ALTER TABLE "Subscription" DROP CONSTRAINT IF EXISTS subscription_status_check;
ALTER TABLE "Subscription"
  ADD CONSTRAINT subscription_status_check
  CHECK (status IN ('active', 'inactive', 'expired', 'past_due', 'cancelled'));

UPDATE "Subscription" SET status = 'expired' WHERE status = 'past_due';
-- Terms that have already run out are expired by the server's lifecycle job
-- on its first run (so they get a history entry and notifications).

ALTER TABLE "Subscription_Plan" ADD COLUMN IF NOT EXISTS features TEXT[] NOT NULL DEFAULT '{}';

-- ---------------------------------------------------------------------------
-- Requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Subscription_Request" (
  request_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  barangay_id BIGINT NOT NULL REFERENCES "Barangay"(barangay_id),
  plan_id BIGINT REFERENCES "Subscription_Plan"(plan_id) ON DELETE SET NULL,
  -- plan terms snapshotted at request time (catalog edits never change a request)
  plan_name TEXT NOT NULL,
  price NUMERIC NOT NULL,
  care_credits INT NOT NULL,
  validity_months INT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('new', 'renewal')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'scheduled', 'activated', 'rejected', 'cancelled')),
  requested_by BIGINT,                 -- LGU user_id (plain ids: no extra FKs to "User")
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expected_activation_at TIMESTAMPTZ,  -- NULL = "as soon as approved and paid"
  approved_by BIGINT,
  approved_at TIMESTAMPTZ,
  rejected_by BIGINT,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  rejection_remarks TEXT,
  cancelled_by BIGINT,
  cancelled_by_role TEXT CHECK (cancelled_by_role IN ('lgu', 'admin')),
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'submitted', 'verified', 'not_required')),
  payment_reference TEXT,
  payment_note TEXT,
  payment_submitted_at TIMESTAMPTZ,
  payment_amount NUMERIC,
  payment_verified_by BIGINT,
  payment_verified_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ
);

-- One open (pending / approved / scheduled) request per barangay, enforced by
-- the database so two clicks or two tabs can't create a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_subscription_request
  ON "Subscription_Request" (barangay_id)
  WHERE status IN ('pending', 'approved', 'scheduled');
CREATE INDEX IF NOT EXISTS idx_subscription_request_barangay
  ON "Subscription_Request" (barangay_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_request_status
  ON "Subscription_Request" (status);

-- ---------------------------------------------------------------------------
-- Care Credit issuance ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Subscription_Credit_Issuance" (
  issuance_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  barangay_id BIGINT NOT NULL REFERENCES "Barangay"(barangay_id),
  subscription_id BIGINT NOT NULL REFERENCES "Subscription"(subscription_id),
  request_id BIGINT NOT NULL UNIQUE REFERENCES "Subscription_Request"(request_id),
  plan_name TEXT NOT NULL,
  amount INT NOT NULL CHECK (amount >= 0),
  budget_funded_after NUMERIC NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credit_issuance_barangay
  ON "Subscription_Credit_Issuance" (barangay_id, issued_at DESC);

-- ---------------------------------------------------------------------------
-- Expiry reminders already sent (one per term per interval)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Subscription_Reminder" (
  reminder_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  barangay_id BIGINT NOT NULL REFERENCES "Barangay"(barangay_id),
  subscription_id BIGINT NOT NULL REFERENCES "Subscription"(subscription_id),
  term_expires_at TIMESTAMPTZ NOT NULL,
  days_before INT NOT NULL CHECK (days_before IN (30, 15, 7)),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, term_expires_at, days_before)
);

-- ---------------------------------------------------------------------------
-- History: new action types + links back to the request
-- ---------------------------------------------------------------------------
ALTER TABLE "Subscription_History"
  ADD COLUMN IF NOT EXISTS request_id BIGINT,
  ADD COLUMN IF NOT EXISTS note TEXT,
  ADD COLUMN IF NOT EXISTS care_credits INT,
  ADD COLUMN IF NOT EXISTS period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS actor_user_id BIGINT;

ALTER TABLE "Subscription_History" DROP CONSTRAINT IF EXISTS "Subscription_History_action_check";
ALTER TABLE "Subscription_History" DROP CONSTRAINT IF EXISTS subscription_history_action_check;
ALTER TABLE "Subscription_History"
  ADD CONSTRAINT subscription_history_action_check
  CHECK (action IN (
    'subscribed', 'renewed', 'plan_changed', 'status_changed',
    'request_submitted', 'request_approved', 'request_rejected', 'request_cancelled',
    'payment_submitted', 'payment_verified', 'activated', 'credits_issued', 'expired'
  ));

ALTER TABLE "Subscription_History" DROP CONSTRAINT IF EXISTS "Subscription_History_actor_role_check";
ALTER TABLE "Subscription_History" DROP CONSTRAINT IF EXISTS subscription_history_actor_role_check;
ALTER TABLE "Subscription_History"
  ADD CONSTRAINT subscription_history_actor_role_check
  CHECK (actor_role IN ('admin', 'lgu', 'system'));

ALTER TABLE "Subscription_Request" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subscription_Credit_Issuance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subscription_Reminder" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- activate_subscription_request: one transaction that
--   1. starts the new term (right where the old one ended -- no overlap, no gap --
--      or now, if the barangay had no running term),
--   2. adds the plan's Care Credits to the barangay's Budget,
--   3. writes the issuance ledger row (UNIQUE request_id => exactly once),
--   4. marks the request activated and logs history.
-- Refuses unless the request is 'scheduled' (approved AND payment verified /
-- not required) and the current term has actually ended.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION activate_subscription_request(p_request_id BIGINT) RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_req RECORD;
  v_sub RECORD;
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_sub_id BIGINT;
  v_budget RECORD;
BEGIN
  SELECT * INTO v_req FROM "Subscription_Request" WHERE request_id = p_request_id FOR UPDATE;
  IF v_req.request_id IS NULL THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  IF v_req.status <> 'scheduled' THEN RAISE EXCEPTION 'REQUEST_NOT_SCHEDULED'; END IF;
  IF v_req.payment_status NOT IN ('verified', 'not_required') THEN RAISE EXCEPTION 'PAYMENT_NOT_VERIFIED'; END IF;

  SELECT * INTO v_sub FROM "Subscription" WHERE barangay_id = v_req.barangay_id FOR UPDATE;

  IF v_sub.subscription_id IS NOT NULL AND v_sub.status = 'active' AND v_sub.expires_at IS NOT NULL AND v_sub.expires_at > now() THEN
    RAISE EXCEPTION 'CURRENT_STILL_ACTIVE';
  END IF;

  -- Continue seamlessly from a term that just ran out; otherwise start now.
  IF v_sub.subscription_id IS NOT NULL AND v_sub.status = 'active' AND v_sub.expires_at IS NOT NULL THEN
    v_start := v_sub.expires_at;
  ELSE
    v_start := now();
  END IF;
  v_end := v_start + make_interval(months => v_req.validity_months);

  IF v_sub.subscription_id IS NOT NULL AND v_sub.status = 'active' THEN
    INSERT INTO "Subscription_History" (barangay_id, plan_id, plan_name, action, status, price, actor_role, note, period_end)
    VALUES (v_sub.barangay_id, v_sub.plan_id, v_sub.plan_name, 'expired', 'expired', v_sub.price, 'system',
            'Term ended; replaced by the scheduled renewal.', v_sub.expires_at);
  END IF;

  INSERT INTO "Subscription" (barangay_id, plan, plan_id, plan_name, price, care_credits, validity_months,
                              status, started_at, expires_at, renewed_at)
  VALUES (v_req.barangay_id, v_req.plan_name, v_req.plan_id, v_req.plan_name, v_req.price, v_req.care_credits,
          v_req.validity_months, 'active', v_start, v_end, now())
  ON CONFLICT (barangay_id) DO UPDATE SET
    plan = EXCLUDED.plan, plan_id = EXCLUDED.plan_id, plan_name = EXCLUDED.plan_name, price = EXCLUDED.price,
    care_credits = EXCLUDED.care_credits, validity_months = EXCLUDED.validity_months, status = 'active',
    started_at = EXCLUDED.started_at, expires_at = EXCLUDED.expires_at, renewed_at = EXCLUDED.renewed_at
  RETURNING subscription_id INTO v_sub_id;

  INSERT INTO "Budget" (barangay_id, total_funded, total_spent)
  VALUES (v_req.barangay_id, v_req.care_credits, 0)
  ON CONFLICT (barangay_id) DO UPDATE SET total_funded = "Budget".total_funded + EXCLUDED.total_funded
  RETURNING * INTO v_budget;

  -- UNIQUE(request_id): a second activation of the same request fails here and
  -- rolls back everything above.
  INSERT INTO "Subscription_Credit_Issuance"
    (barangay_id, subscription_id, request_id, plan_name, amount, budget_funded_after, period_start, period_end)
  VALUES (v_req.barangay_id, v_sub_id, v_req.request_id, v_req.plan_name, v_req.care_credits,
          v_budget.total_funded, v_start, v_end);

  UPDATE "Subscription_Request"
    SET status = 'activated', activated_at = now(), period_start = v_start, period_end = v_end
    WHERE request_id = v_req.request_id;

  INSERT INTO "Subscription_History"
    (barangay_id, plan_id, plan_name, action, status, price, actor_role, request_id, care_credits, period_start, period_end)
  VALUES
    (v_req.barangay_id, v_req.plan_id, v_req.plan_name, 'activated', 'active', v_req.price, 'system',
     v_req.request_id, v_req.care_credits, v_start, v_end),
    (v_req.barangay_id, v_req.plan_id, v_req.plan_name, 'credits_issued', 'active', v_req.price, 'system',
     v_req.request_id, v_req.care_credits, v_start, v_end);

  RETURN json_build_object(
    'barangay_id', v_req.barangay_id, 'request_id', v_req.request_id, 'subscription_id', v_sub_id,
    'plan_name', v_req.plan_name, 'care_credits', v_req.care_credits,
    'period_start', v_start, 'period_end', v_end
  );
END;
$$;

-- expire_subscription: marks a term whose end date has passed as expired
-- (only if it's still 'active'). Returns true if this call did it. Nothing is
-- deleted; issued Care Credits and the Budget are left as they are.
CREATE OR REPLACE FUNCTION expire_subscription(p_subscription_id BIGINT) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_sub RECORD;
BEGIN
  UPDATE "Subscription" SET status = 'expired'
    WHERE subscription_id = p_subscription_id AND status = 'active'
      AND expires_at IS NOT NULL AND expires_at <= now()
    RETURNING * INTO v_sub;
  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO "Subscription_History" (barangay_id, plan_id, plan_name, action, status, price, actor_role, note, period_end)
  VALUES (v_sub.barangay_id, v_sub.plan_id, v_sub.plan_name, 'expired', 'expired', v_sub.price, 'system',
          'Expired with no approved, payment-verified renewal.', v_sub.expires_at);
  RETURN true;
END;
$$;
