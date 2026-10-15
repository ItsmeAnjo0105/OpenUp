-- Backs the AI Effectiveness Tracker (LGU role): real detection activity and
-- real resident feedback for the AI Crisis Companion, instead of fabricated
-- numbers. No message content is ever stored here -- just whether a given
-- chat turn tripped the crisis-detection check, and a resident's own rating.
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).

-- One row per AI Crisis Companion chat turn. Voice Journal already logs its
-- own detection result on Voice_Journal.risk_flag, so this table only covers
-- the companion-chat source -- the two are combined at query time.
CREATE TABLE IF NOT EXISTS "AI_Detection_Log" (
  log_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES "User"(user_id) ON DELETE CASCADE,
  crisis_detected BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_detection_log_user ON "AI_Detection_Log"(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_detection_log_created ON "AI_Detection_Log"(created_at);

-- A resident's own rating of an AI Crisis Companion conversation (1-5).
CREATE TABLE IF NOT EXISTS "AI_Rating" (
  rating_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES "User"(user_id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_rating_user ON "AI_Rating"(user_id);

-- No policies needed: RLS enabled with zero policies denies everyone except
-- service_role, matching every other table's posture (see enable_rls.sql).
ALTER TABLE "AI_Detection_Log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AI_Rating" ENABLE ROW LEVEL SECURITY;
