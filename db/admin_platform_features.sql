-- Backs five Admin modules in one pass: Resources Management, AI Crisis
-- Management, Reports & Analytics (reuses existing tables, no new ones),
-- System Settings (Manage Configurations + Backup & Maintenance only --
-- Manage Roles & Permissions is NOT addressed here, see note below), and
-- the Crisis Companion's "[YOUR VERIFIED CRISIS HOTLINE NUMBER HERE]"
-- placeholder.
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).

-- Resources Management: "Publish Resource" needs a draft/published state
-- that didn't exist before. Existing seeded resources default to published
-- so residents' Wellness Resources page doesn't regress.
ALTER TABLE "Resource" ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT true;

-- AI Crisis Management / "Configure Escalation Rules": the crisis-detection
-- keyword list was previously hardcoded in index.js (CRISIS_PHRASES). Moving
-- it here makes it admin-editable; the backend falls back to the same
-- hardcoded list if this table is ever empty, so detection never silently
-- goes blind.
CREATE TABLE IF NOT EXISTS "Crisis_Escalation_Rule" (
  rule_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  phrase TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO "Crisis_Escalation_Rule" (phrase) VALUES
  ('kill myself'), ('want to die'), ('end my life'), ('better off without me'),
  ('no reason to live'), ('can''t go on'), ('suicide'), ('hurting myself'),
  ('self harm'), ('end it all'), ('don''t want to be here anymore'),
  ('no point in living')
ON CONFLICT (phrase) DO NOTHING;

-- AI Crisis Management / "Manage Emergency Contacts": replaces the
-- CrisisCompanion.jsx placeholder "[YOUR VERIFIED CRISIS HOTLINE NUMBER
-- HERE]" with real, admin-entered contacts. Deliberately seeded with NOTHING
-- -- a wrong or unverified crisis hotline number shown to someone in crisis
-- is actively dangerous, so this must only ever contain numbers an admin
-- has personally verified, never a guessed or placeholder one.
CREATE TABLE IF NOT EXISTS "Emergency_Contact" (
  contact_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- System Settings / "Manage Configurations": a generic key-value store.
-- Seeded with the one setting that actually does something real right now
-- (maintenance_mode drives a real banner across the app) plus a cosmetic
-- platform_name, to prove the generic mechanism works for more than one key.
CREATE TABLE IF NOT EXISTS "Platform_Setting" (
  key TEXT PRIMARY KEY,
  value TEXT,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO "Platform_Setting" (key, value, description) VALUES
  ('maintenance_mode', 'false', 'When true, shows a maintenance banner across the app.'),
  ('platform_name', 'OpenUp', 'Shown in the maintenance banner and a few static labels.')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE "Crisis_Escalation_Rule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Emergency_Contact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Platform_Setting" ENABLE ROW LEVEL SECURITY;
