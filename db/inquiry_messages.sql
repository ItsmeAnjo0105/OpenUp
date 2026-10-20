-- Pre-booking inquiries: a resident messaging a psychologist they haven't
-- booked with yet (the "Message" button on each psychologist card). Distinct
-- from the existing booking-scoped Anonymous Chat (Message table) -- this
-- thread is keyed by (resident_id, psychologist_id) directly since there's no
-- booking to key it by yet, and it's never anonymous (both sides are
-- genuinely themselves, unlike the identity-masked post-booking chat).
CREATE TABLE IF NOT EXISTS "Inquiry_Message" (
  message_id SERIAL PRIMARY KEY,
  resident_id INT NOT NULL REFERENCES "User"(user_id) ON DELETE CASCADE,
  psychologist_id INT NOT NULL REFERENCES "Psychologist"(psychologist_id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('resident', 'psychologist')),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inquiry_message_thread
  ON "Inquiry_Message" (resident_id, psychologist_id, created_at);
