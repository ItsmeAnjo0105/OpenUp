-- The AI Crisis Companion never persisted a conversation anywhere -- closing the
-- tab lost it for good, and there was no way to revisit or delete one. This adds
-- real storage: one Crisis_Conversation row per chat session, with its turns in
-- Crisis_Message, scoped to the resident who had it.
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).

CREATE TABLE IF NOT EXISTS "Crisis_Conversation" (
  conversation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES "User"(user_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  crisis_detected BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Crisis_Message" (
  message_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES "Crisis_Conversation"(conversation_id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  crisis_detected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Same posture as every other table (see db/enable_rls.sql) -- the backend's
-- service_role key bypasses RLS regardless; this just stops the public anon key
-- from reading or writing anyone's crisis conversations directly through
-- Supabase's API, which matters more here than almost anywhere else in the schema.
ALTER TABLE "Crisis_Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Crisis_Message" ENABLE ROW LEVEL SECURITY;
