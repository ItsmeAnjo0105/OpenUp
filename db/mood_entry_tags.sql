-- Lets a Mood_Entry optionally carry the resident's own pick of what's behind
-- today's mood (Sleep, Work/School, etc.) so Daily Insights can eventually
-- surface a real "X came up N times this week" card from it, the same way
-- voice journal keyword correlation already works. Nullable -- entries logged
-- before this existed, or where the resident skips the follow-up, are
-- untouched.
ALTER TABLE "Mood_Entry"
  ADD COLUMN IF NOT EXISTS tags TEXT[];
