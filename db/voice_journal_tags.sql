-- The top-2 emotion labels from the classifier (content_indicators) were
-- already computed on every save, but only returned in the POST response --
-- never persisted, so Journal History couldn't show them for past entries.
ALTER TABLE "Voice_Journal" ADD COLUMN IF NOT EXISTS content_indicators text[];
