-- "Flag High-Risk Cases" for the LGU role: lets a barangay's LGU account
-- manually flag one of its own residents as high-risk (e.g. from a field
-- report or home visit), independent of the resident's own self-reported
-- Assessment_Result.safety_flag. Separate from that automatic signal on
-- purpose -- this is a human judgment call an LGU office makes, with a
-- reason on record and an explicit resolve action, not a check-in score.
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
CREATE TABLE IF NOT EXISTS "LGU_Risk_Flag" (
  flag_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  resident_id BIGINT NOT NULL REFERENCES "User"(user_id) ON DELETE CASCADE,
  barangay_id BIGINT NOT NULL REFERENCES "Barangay"(barangay_id),
  flagged_by BIGINT NOT NULL REFERENCES "User"(user_id),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_lgu_risk_flag_resident ON "LGU_Risk_Flag"(resident_id);
CREATE INDEX IF NOT EXISTS idx_lgu_risk_flag_barangay ON "LGU_Risk_Flag"(barangay_id);

-- No policies needed: RLS enabled with zero policies denies everyone except
-- service_role, matching every other table's posture (see enable_rls.sql).
ALTER TABLE "LGU_Risk_Flag" ENABLE ROW LEVEL SECURITY;
