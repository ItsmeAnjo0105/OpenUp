-- Tracks which PayMongo Checkout Session a Payment row is waiting on, so we can look
-- its status back up (via GET /payments/:id/sync) after the resident returns from
-- PayMongo's hosted checkout page.
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
ALTER TABLE "Payment"
  ADD COLUMN IF NOT EXISTS paymongo_checkout_session_id TEXT;
