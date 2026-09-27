-- Adds an optional specific-emotion label alongside the existing 1-5 mood_level
-- (which everything else -- the weekly bar chart, trend insights -- keeps reading
-- as before). mood_label carries the exact word the resident picked (e.g. "Anxious",
-- "Frisky") from the expanded emotion picker; older rows just have it null and fall
-- back to the plain Low/Down/Okay/Good/Calm labels.
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
ALTER TABLE "Mood_Entry" ADD COLUMN IF NOT EXISTS mood_label TEXT;
