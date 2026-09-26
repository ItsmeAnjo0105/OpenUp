-- Deleting a contact with a logged Crisis_Alert against it failed outright (FK
-- violation, no cleanup) -- found during testing. A contact being removed (wrong
-- number, no longer trusted) should take its own alert history with it rather than
-- block deletion.
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
ALTER TABLE "Crisis_Alert" DROP CONSTRAINT "Crisis_Alert_contact_id_fkey";
ALTER TABLE "Crisis_Alert" ADD CONSTRAINT "Crisis_Alert_contact_id_fkey"
  FOREIGN KEY (contact_id) REFERENCES "Trusted_Contact"(contact_id) ON DELETE CASCADE;
