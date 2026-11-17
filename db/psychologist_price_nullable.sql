-- session_price now moves from the signup form to the psychologist's own
-- profile (set/edited after their account exists, before they're bookable).
-- The column was NOT NULL with no default, so a brand-new psychologist row
-- could never be inserted without a price yet -- the rest of the codebase
-- (create_booking_transaction.sql, booking_credit_toggle.sql, and the public
-- /psychologists directory) was already defensively written to handle a NULL
-- session_price, so this just makes that state actually reachable.
ALTER TABLE "Psychologist"
  ALTER COLUMN session_price DROP NOT NULL;
