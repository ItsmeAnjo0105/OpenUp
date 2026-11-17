-- Psychologist profile, credential submission and license verification
-- (Psychologist > Profile  +  Admin > Verification).
--
-- Builds on the EXISTING Psychologist row -- no separate application/account
-- table. Psychologist.is_verified stays the single gate every verified-only
-- feature checks (public directory, booking, inquiries, group sessions).
-- verification_status is the state of the psychologist's LATEST credential
-- submission:
--
--   not_submitted   signed up, credentials not submitted yet
--   pending         submitted, waiting for an admin
--   info_requested  admin asked for more info / corrected documents
--   approved        admin approved
--   denied          admin denied, reason recorded
--
-- A psychologist who is ALREADY verified and changes regulated credentials
-- (license number / expiry / credentials / credential documents) goes back to
-- 'pending' but KEEPS is_verified = true: the previously approved values stay
-- in license_no / credentials untouched, and the proposed values wait in
-- pending_credentials until an admin approves them. Denying such an update
-- keeps the old approval unless the admin explicitly revokes it.
--
-- Every submission is snapshotted in Psychologist_Credential_Submission (so the
-- admin can compare old vs new and the history is never overwritten), and every
-- action is logged in Psychologist_Verification_Event. Uploaded documents live
-- in a PRIVATE storage bucket and are only served to their owner or an admin
-- through short-lived signed URLs.
--
-- Safe to run more than once. Run it in the Supabase SQL Editor
-- (Dashboard > SQL Editor > New query).

-- ---------------------------------------------------------------------------
-- Psychologist: verification state + new self-editable profile fields
-- ---------------------------------------------------------------------------
ALTER TABLE "Psychologist"
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'not_submitted',
  ADD COLUMN IF NOT EXISTS verification_note TEXT,              -- denial reason or requested info
  ADD COLUMN IF NOT EXISTS verification_decided_at TIMESTAMPTZ,
  -- Plain id, deliberately NO foreign key: a second Psychologist -> User FK would
  -- make every existing PostgREST embed Psychologist(User(name)) ambiguous.
  ADD COLUMN IF NOT EXISTS verification_decided_by BIGINT,      -- admin user_id
  ADD COLUMN IF NOT EXISTS verification_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS info_response TEXT,                  -- legacy: reply to an info request
  ADD COLUMN IF NOT EXISTS info_responded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS license_expiry DATE,
  ADD COLUMN IF NOT EXISTS pending_credentials JSONB,           -- proposed {license_no, license_expiry, credentials}
  -- ordinary profile fields (never trigger re-verification)
  ADD COLUMN IF NOT EXISTS professional_title TEXT,
  ADD COLUMN IF NOT EXISTS education TEXT,
  ADD COLUMN IF NOT EXISTS contact_number TEXT,
  ADD COLUMN IF NOT EXISTS expertise TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS services TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS consultation_types TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS session_duration_minutes INT;

-- New signups start as "not submitted" (the column default above); the
-- signup route doesn't set it, so this keeps working before and after.
ALTER TABLE "Psychologist" ALTER COLUMN verification_status SET DEFAULT 'not_submitted';

ALTER TABLE "Psychologist" DROP CONSTRAINT IF EXISTS psychologist_verification_status_check;
ALTER TABLE "Psychologist"
  ADD CONSTRAINT psychologist_verification_status_check
  CHECK (verification_status IN ('not_submitted', 'pending', 'info_requested', 'approved', 'denied'));

ALTER TABLE "Psychologist" DROP CONSTRAINT IF EXISTS psychologist_consultation_types_check;
ALTER TABLE "Psychologist"
  ADD CONSTRAINT psychologist_consultation_types_check
  CHECK (consultation_types <@ ARRAY['online', 'face_to_face']::TEXT[]);

-- Back-fill from what was already true before this migration. Runs ONLY on
-- the first run (before the submission table exists), so re-running the file
-- never touches decisions made afterwards or brand-new signups:
--   is_verified = true                     -> approved
--   unverified + User.status = 'rejected'  -> denied (no reason was ever recorded)
--   any other unverified psychologist      -> pending (they applied at signup
--                                             with a license number, so they
--                                             stay in the admin's review queue)
DO $$
BEGIN
  IF to_regclass('public."Psychologist_Credential_Submission"') IS NULL THEN
    UPDATE "Psychologist" SET verification_status = 'approved' WHERE is_verified = true;

    UPDATE "Psychologist" p SET verification_status = 'denied'
      FROM "User" u
      WHERE u.user_id = p.user_id AND p.is_verified = false AND u.status = 'rejected';

    UPDATE "Psychologist" SET verification_status = 'pending'
      WHERE is_verified = false AND verification_status = 'not_submitted';
  END IF;
END $$;

-- Previously a rejection locked the psychologist out of logging in entirely, so
-- they could never see why. Denial is now tracked on verification_status (which
-- still keeps them unverified and out of every verified-only feature), so those
-- accounts are re-opened for login to read their decision.
UPDATE "User" u SET status = 'active'
  FROM "Psychologist" p
  WHERE p.user_id = u.user_id
    AND u.role = 'psychologist'
    AND u.status = 'rejected'
    AND p.verification_status = 'denied';

-- ---------------------------------------------------------------------------
-- Credential snapshots (one row per submission; never overwritten)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Psychologist_Credential_Submission" (
  submission_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  psychologist_id BIGINT NOT NULL REFERENCES "Psychologist"(psychologist_id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('initial', 'update', 'resubmission')),
  license_no TEXT,
  license_expiry DATE,
  credentials TEXT,
  document_ids BIGINT[] NOT NULL DEFAULT '{}',   -- documents active at submission time
  previous JSONB,                                -- approved values + document ids at submission time
  response TEXT,                                 -- psychologist's note to the admin
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'info_requested', 'approved', 'denied', 'superseded')),
  decision_note TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by BIGINT                              -- admin user_id (no FK, see above)
);
CREATE INDEX IF NOT EXISTS idx_credential_submission_psychologist
  ON "Psychologist_Credential_Submission" (psychologist_id, submitted_at DESC);

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Psychologist_Document" (
  document_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  psychologist_id BIGINT NOT NULL REFERENCES "Psychologist"(psychologist_id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "Psychologist_Document"
  -- draft: uploaded, not submitted yet (owner may remove it)
  -- submitted: part of a submission under review
  -- verified / rejected: admin decision
  -- superseded: replaced by a newer approved document (kept for history)
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS replaces_document_id BIGINT REFERENCES "Psychologist_Document"(document_id),
  ADD COLUMN IF NOT EXISTS submission_id BIGINT REFERENCES "Psychologist_Credential_Submission"(submission_id);

ALTER TABLE "Psychologist_Document" DROP CONSTRAINT IF EXISTS "Psychologist_Document_doc_type_check";
ALTER TABLE "Psychologist_Document" DROP CONSTRAINT IF EXISTS psychologist_document_doc_type_check;
ALTER TABLE "Psychologist_Document"
  ADD CONSTRAINT psychologist_document_doc_type_check
  CHECK (doc_type IN ('prc_id_front', 'prc_id_back', 'certificate_of_registration', 'diploma',
                      'certificate', 'other', 'prc_license'));

ALTER TABLE "Psychologist_Document" DROP CONSTRAINT IF EXISTS psychologist_document_status_check;
ALTER TABLE "Psychologist_Document"
  ADD CONSTRAINT psychologist_document_status_check
  CHECK (status IN ('draft', 'submitted', 'verified', 'rejected', 'superseded'));

CREATE INDEX IF NOT EXISTS idx_psychologist_document_psychologist
  ON "Psychologist_Document" (psychologist_id, uploaded_at DESC);

-- ---------------------------------------------------------------------------
-- Event log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Psychologist_Verification_Event" (
  event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  psychologist_id BIGINT NOT NULL REFERENCES "Psychologist"(psychologist_id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  note TEXT,
  actor_user_id BIGINT,  -- admin or psychologist user_id (no FK, see above)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "Psychologist_Verification_Event" DROP CONSTRAINT IF EXISTS "Psychologist_Verification_Event_action_check";
ALTER TABLE "Psychologist_Verification_Event" DROP CONSTRAINT IF EXISTS psychologist_verification_event_action_check;
ALTER TABLE "Psychologist_Verification_Event"
  ADD CONSTRAINT psychologist_verification_event_action_check
  CHECK (action IN (
    'submitted', 'update_submitted', 'resubmitted',
    'approved', 'update_approved', 'denied', 'update_denied', 'verification_revoked',
    'info_requested', 'info_submitted',
    'document_uploaded', 'document_removed', 'credentials_changed'
  ));
CREATE INDEX IF NOT EXISTS idx_psychologist_verification_event
  ON "Psychologist_Verification_Event" (psychologist_id, created_at DESC);

ALTER TABLE "Psychologist_Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Psychologist_Verification_Event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Psychologist_Credential_Submission" ENABLE ROW LEVEL SECURITY;

-- Private bucket for PRC IDs / diplomas / certificates (never public URLs).
-- 10 MB cap and the same file types the server accepts.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('psychologist-documents', 'psychologist-documents', false, 10485760,
        ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;
