-- Backs "Community Testimonials Moderation" (Admin role): a real report
-- mechanism for residents, and real review/keep/remove actions for admins.
-- Without this, there was nothing for an admin to moderate -- Testimonial
-- had no concept of being flagged at all.
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
ALTER TABLE "Testimonial" ADD COLUMN IF NOT EXISTS flagged BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Testimonial" ADD COLUMN IF NOT EXISTS flag_reason TEXT;
