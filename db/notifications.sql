-- Notification stores real alerts (new message, system announcement). Session
-- reminders are deliberately NOT stored here -- there's no background scheduler in
-- this app (Render's free tier sleeps when idle, so a cron job couldn't be relied
-- on to fire), so they're computed live from actual upcoming Booking rows every
-- time GET /notifications is called instead, which is always correct by construction.
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
CREATE TABLE IF NOT EXISTS "Notification" (
  notification_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES "User"(user_id),
  type TEXT NOT NULL CHECK (type IN ('message', 'system')),
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "System_Announcement" (
  announcement_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by BIGINT REFERENCES "User"(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "System_Announcement" ENABLE ROW LEVEL SECURITY;
