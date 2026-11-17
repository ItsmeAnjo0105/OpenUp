-- Turns Subscription from a bare status toggle into a real plan-catalog-backed
-- module: Subscription_Plan is the LGU Admin's catalog (name/description/price/
-- Care Credit allocation/validity), and Subscription snapshots the plan a barangay
-- picked at the time they picked it (so editing or deleting a plan later never
-- rewrites what an already-subscribed barangay is shown as being on). Subscription_History
-- is the audit trail both roles read back ("Subscription history and renewal options").
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).

CREATE TABLE IF NOT EXISTS "Subscription_Plan" (
  plan_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL,
  care_credits INT NOT NULL,
  validity_months INT NOT NULL DEFAULT 12,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Snapshot columns so a barangay's subscribed plan stays legible even if the
-- catalog entry it was taken from is later edited or removed (plan_id goes NULL
-- on delete, but plan_name/price/care_credits/validity_months survive as-is).
ALTER TABLE "Subscription"
  ADD COLUMN IF NOT EXISTS plan_id BIGINT REFERENCES "Subscription_Plan"(plan_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS plan_name TEXT,
  ADD COLUMN IF NOT EXISTS price NUMERIC,
  ADD COLUMN IF NOT EXISTS care_credits INT,
  ADD COLUMN IF NOT EXISTS validity_months INT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS "Subscription_History" (
  history_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  barangay_id BIGINT NOT NULL REFERENCES "Barangay"(barangay_id),
  plan_id BIGINT REFERENCES "Subscription_Plan"(plan_id) ON DELETE SET NULL,
  plan_name TEXT,
  action TEXT NOT NULL CHECK (action IN ('subscribed', 'renewed', 'plan_changed', 'status_changed')),
  status TEXT NOT NULL,
  price NUMERIC,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('admin', 'lgu')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Same posture as every other table (see db/enable_rls.sql) -- the backend's
-- service_role key bypasses RLS regardless; this just stops the public anon key
-- from reading/writing these two directly through Supabase's API.
ALTER TABLE "Subscription_Plan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subscription_History" ENABLE ROW LEVEL SECURITY;

-- Starter catalog matching the four standard tiers -- editable/removable by the
-- LGU Admin afterwards from the Subscriptions page, this just seeds something
-- real to demo against instead of an empty catalog.
INSERT INTO "Subscription_Plan" (name, description, price, care_credits, validity_months, is_featured)
SELECT * FROM (VALUES
  ('Basic Plan', 'Essential wellness services for small barangays.', 1000, 1000, 6, false),
  ('Standard Plan', 'Comprehensive care for medium barangays.', 2000, 2500, 12, true),
  ('Premium Plan', 'Advanced support for large barangays.', 3500, 5000, 12, false),
  ('Enterprise Plan', 'Full wellness suite for LGU-wide coverage.', 6000, 10000, 12, false)
) AS seed(name, description, price, care_credits, validity_months, is_featured)
WHERE NOT EXISTS (SELECT 1 FROM "Subscription_Plan");
