-- Community Testimonials: posts + comments. ON DELETE CASCADE on the comment's FK
-- so deleting a testimonial takes its comments with it -- learned that lesson the
-- hard way with Trusted_Contact earlier (an unprotected FK blocked deletion outright).
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
CREATE TABLE IF NOT EXISTS "Testimonial" (
  testimonial_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES "User"(user_id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS "Testimonial_Comment" (
  comment_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  testimonial_id BIGINT NOT NULL REFERENCES "Testimonial"(testimonial_id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES "User"(user_id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE "Testimonial" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Testimonial_Comment" ENABLE ROW LEVEL SECURITY;
