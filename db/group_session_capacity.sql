-- Lets a psychologist set a real participant cap (1-8) when scheduling a
-- Group Session, and explicitly mark one completed or cancelled instead of
-- it only ever existing as "scheduled" forever. Group_Session_Participant
-- is what actually enforces the cap: a resident's "Join" registers a row
-- here first (server-side, see POST /group-sessions/:id/join), and is
-- refused once max_participants rows already exist for that session --
-- without this table "max participants" would just be a decorative number.
ALTER TABLE "Group_Session"
  ADD COLUMN IF NOT EXISTS max_participants SMALLINT NOT NULL DEFAULT 8
    CHECK (max_participants BETWEEN 1 AND 8),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'completed', 'cancelled'));

CREATE TABLE IF NOT EXISTS "Group_Session_Participant" (
  participant_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_session_id BIGINT NOT NULL REFERENCES "Group_Session"(group_session_id) ON DELETE CASCADE,
  resident_id BIGINT NOT NULL REFERENCES "User"(user_id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_session_id, resident_id)
);
