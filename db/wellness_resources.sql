-- Wellness Resources: title/description/category plus a file in Supabase Storage
-- (bucket "resources", created separately via the Storage API, same as
-- psychologist-photos and voice-journal-audio were).
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
CREATE TABLE IF NOT EXISTS "Resource" (
  resource_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  file_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "Resource" ENABLE ROW LEVEL SECURITY;
