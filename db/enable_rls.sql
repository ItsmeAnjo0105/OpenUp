-- Budget, Message, and Subscription were created without enabling Row Level Security,
-- unlike every other table in the schema -- an oversight from when they were first
-- added. The backend always uses the service_role key, which bypasses RLS regardless,
-- so this didn't affect app behavior -- but it meant the project's public anon key
-- (meant to be safe to expose specifically because RLS restricts what it can touch)
-- could read or write these tables directly through Supabase's API with no auth at all,
-- including every private counseling chat message in Message.
--
-- No policies needed: RLS enabled with zero policies denies everyone except
-- service_role, matching every other table's posture.
ALTER TABLE "Budget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;
