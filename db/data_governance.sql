-- Backs "Data Governance & Consent" (LGU role): a real consent record tied to
-- the one actual consent gate that already exists in the app (the checkbox
-- before the Mental Health Assessment) -- not a fabricated "agreed to terms"
-- event with no corresponding UI action behind it.
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
CREATE TABLE IF NOT EXISTS "Consent_Record" (
  consent_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES "User"(user_id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('assessment')),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consent_record_user ON "Consent_Record"(user_id);

-- No policies needed: RLS enabled with zero policies denies everyone except
-- service_role, matching every other table's posture (see enable_rls.sql).
ALTER TABLE "Consent_Record" ENABLE ROW LEVEL SECURITY;
