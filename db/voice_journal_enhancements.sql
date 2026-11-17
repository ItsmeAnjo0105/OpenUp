-- Voice Journal's AI reflection was never more than a 1-2 sentence summary, and
-- it was never actually saved -- only the freshly-created entry's response ever
-- carried it; reopening a past entry showed nothing but the transcript and a
-- raw emotion label. Same story for recommendations: a static lookup table keyed
-- by one of 7 emotion buckets, not anything generated from what the resident
-- actually said. This adds real storage for the full structured analysis and a
-- dynamic, per-entry recommendation set, plus title/editing support.
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).

ALTER TABLE "Voice_Journal"
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS emotional_summary TEXT,
  ADD COLUMN IF NOT EXISTS secondary_emotions TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS emotional_intensity TEXT,
  ADD COLUMN IF NOT EXISTS understanding_text TEXT,
  ADD COLUMN IF NOT EXISTS key_concerns TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS emotional_insights TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reflection_question TEXT,
  ADD COLUMN IF NOT EXISTS positive_signs TEXT,
  ADD COLUMN IF NOT EXISTS recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
