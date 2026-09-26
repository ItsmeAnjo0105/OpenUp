-- A resident's trusted contacts, and a log of crisis alerts raised for them.
-- delivered stays false until a real SMS/email provider is wired in -- this table
-- exists so the alert intent is recorded and actionable (e.g. by an admin later),
-- not so the app can falsely claim someone was actually notified.
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
CREATE TABLE IF NOT EXISTS "Trusted_Contact" (
  contact_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES "User"(user_id),
  name TEXT NOT NULL,
  relationship TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Crisis_Alert" (
  alert_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES "User"(user_id),
  contact_id BIGINT NOT NULL REFERENCES "Trusted_Contact"(contact_id),
  delivered BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "Trusted_Contact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Crisis_Alert" ENABLE ROW LEVEL SECURITY;
