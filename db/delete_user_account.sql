-- Permanently deletes a User account and every row that references it, in one
-- transaction (a PL/pgSQL function body is implicitly transactional -- if any
-- statement here fails, everything rolls back, so a partial/orphaned deletion
-- can't happen). This is a real, irreversible hard delete: mood history,
-- voice journal entries, wellness check results, booking history, chat
-- messages, trusted contacts, testimonials/comments -- all of it, gone.
--
-- Order matters: children are deleted before the parents they reference.
-- A resident and a psychologist share the same User row, so both branches
-- run unconditionally (the psychologist branch is a no-op if this user was
-- never a psychologist).
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
CREATE OR REPLACE FUNCTION delete_user_account(p_user_id BIGINT)
RETURNS TABLE(deleted_user_id BIGINT, deleted_name TEXT, deleted_email TEXT) AS $$
DECLARE
  v_psychologist_id BIGINT;
  v_name TEXT;
  v_email TEXT;
BEGIN
  SELECT name, email INTO v_name, v_email FROM "User" WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found', p_user_id;
  END IF;

  SELECT psychologist_id INTO v_psychologist_id FROM "Psychologist" WHERE user_id = p_user_id;

  -- Crisis alerts / trusted contacts (Crisis_Alert references both user_id and
  -- Trusted_Contact, so it goes first).
  DELETE FROM "Crisis_Alert" WHERE user_id = p_user_id;
  DELETE FROM "Trusted_Contact" WHERE user_id = p_user_id;

  DELETE FROM "Crisis_Requests" WHERE user_id = p_user_id;

  -- Testimonials: their own comments, comments on their testimonials, then
  -- the testimonials themselves.
  DELETE FROM "Testimonial_Comment" WHERE user_id = p_user_id;
  DELETE FROM "Testimonial_Comment" WHERE testimonial_id IN (
    SELECT testimonial_id FROM "Testimonial" WHERE user_id = p_user_id
  );
  DELETE FROM "Testimonial" WHERE user_id = p_user_id;

  -- Their own notifications get deleted; announcements/notifications they
  -- authored as an admin stay (institutional record), just un-attributed.
  DELETE FROM "Notification" WHERE user_id = p_user_id;
  UPDATE "System_Announcement" SET created_by = NULL WHERE created_by = p_user_id;

  -- Bookings where they were the resident: messages, then payments, then the
  -- booking rows.
  DELETE FROM "Message" WHERE booking_id IN (
    SELECT booking_id FROM "Booking" WHERE resident_id = p_user_id
  );
  DELETE FROM "Payment" WHERE booking_id IN (
    SELECT booking_id FROM "Booking" WHERE resident_id = p_user_id
  );
  DELETE FROM "Booking" WHERE resident_id = p_user_id;

  DELETE FROM "Mood_Entry" WHERE user_id = p_user_id;
  DELETE FROM "Voice_Journal" WHERE user_id = p_user_id;
  DELETE FROM "Assessment_Result" WHERE user_id = p_user_id;

  -- Psychologist side, only if this account was ever a psychologist.
  -- Psychologist_Availability and Psychologist_Date_Override already cascade
  -- from Psychologist (see their own migrations), so no explicit delete needed.
  IF v_psychologist_id IS NOT NULL THEN
    DELETE FROM "Message" WHERE booking_id IN (
      SELECT booking_id FROM "Booking" WHERE psychologist_id = v_psychologist_id
    );
    DELETE FROM "Payment" WHERE booking_id IN (
      SELECT booking_id FROM "Booking" WHERE psychologist_id = v_psychologist_id
    );
    DELETE FROM "Booking" WHERE psychologist_id = v_psychologist_id;
    DELETE FROM "Group_Session" WHERE psychologist_id = v_psychologist_id;
    DELETE FROM "Psychologist" WHERE psychologist_id = v_psychologist_id;
  END IF;

  DELETE FROM "User" WHERE user_id = p_user_id;

  RETURN QUERY SELECT p_user_id, v_name, v_email;
END;
$$ LANGUAGE plpgsql;
