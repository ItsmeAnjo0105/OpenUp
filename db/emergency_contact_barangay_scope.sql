-- Lets an Emergency_Contact be scoped to one barangay (e.g. a barangay health
-- center's own number) instead of only ever being platform-wide. NULL means
-- platform-wide, unchanged from before -- existing rows and the admin's
-- "Manage Emergency Contacts" page keep working exactly as they did.
ALTER TABLE "Emergency_Contact"
  ADD COLUMN IF NOT EXISTS barangay_id BIGINT REFERENCES "Barangay"(barangay_id);
