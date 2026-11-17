-- Resident Inquiries: replaces the psychologist-side "Anonymous Chats" with one
-- identified, per-(resident, psychologist) conversation built on the existing
-- Inquiry_Message table (see db/inquiry_messages.sql) -- no new message store.
--
-- 1. read_at on each message powers real unread counts / read receipts.
-- 2. Inquiry_Thread holds ONLY the psychologist's manual "Resolved" marker. Every
--    other inquiry status (New / Unread / In Progress / Responded) is derived
--    from the messages themselves, and the appointment booking badge is derived
--    from the real Booking + Payment rows -- neither is stored here.
-- 3. Historical booking-scoped chat (the old "Message" table) is copied into
--    Inquiry_Message. The resident is taken from Booking.resident_id -- the
--    booking that message was posted under -- so identity is verified by an
--    actual record, never guessed. Messages whose booking no longer resolves to
--    a resident are skipped. The "Message" table itself is left untouched.
--
-- Safe to re-run. Run once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).

ALTER TABLE "Inquiry_Message"
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS legacy_message_id BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inquiry_message_legacy
  ON "Inquiry_Message" (legacy_message_id)
  WHERE legacy_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inquiry_message_psych_unread
  ON "Inquiry_Message" (psychologist_id, sender_role)
  WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS "Inquiry_Thread" (
  resident_id INT NOT NULL REFERENCES "User"(user_id) ON DELETE CASCADE,
  psychologist_id INT NOT NULL REFERENCES "Psychologist"(psychologist_id) ON DELETE CASCADE,
  resolved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (resident_id, psychologist_id)
);

-- Copy legacy booking chat history. Marked read (read_at = created_at) so years
-- of already-seen history don't suddenly appear as unread.
INSERT INTO "Inquiry_Message" (resident_id, psychologist_id, sender_role, body, created_at, read_at, legacy_message_id)
SELECT b.resident_id, b.psychologist_id, m.sender_role, m.body, m.created_at, m.created_at, m.message_id
FROM "Message" m
JOIN "Booking" b ON b.booking_id = m.booking_id
JOIN "User" u ON u.user_id = b.resident_id AND u.role = 'resident'
WHERE NOT EXISTS (
  SELECT 1 FROM "Inquiry_Message" im WHERE im.legacy_message_id = m.message_id
);

ALTER TABLE "Inquiry_Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Inquiry_Thread" ENABLE ROW LEVEL SECURITY;
