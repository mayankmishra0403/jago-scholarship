-- 20260101000900_lock_down_trigger_functions.sql
--
-- Removes the ability to call trigger functions as RPC.
--
-- These are all SECURITY DEFINER, which is correct: each needs to bypass RLS in order
-- to do its job (provisioning a profile on signup, rejecting a self-promotion, writing
-- an audit row). That same property made them a liability, because any function is
-- reachable at POST /rest/v1/rpc/<name> by default, and executing one fires its body
-- with definer rights.
--
-- Concretely, a logged-out client could call rpc/audit_staff_write and land rows in
-- audit_log, or call rpc/handle_new_auth_user and insert profile rows for arbitrary ids.
--
-- The important detail: revoking from PUBLIC is NOT sufficient on Supabase. The
-- anon and authenticated roles carry their own explicit EXECUTE grant, so a
-- REVOKE ... FROM PUBLIC leaves both paths open. All three must be revoked by name.

-- security advisor: "function_search_path_mutable" is handled by proconfig; this
-- migration is purely about who may execute.

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.protect_profile_role() from public, anon, authenticated;
revoke execute on function public.audit_staff_write() from public, anon, authenticated;

-- handle_new_auth_user is a trigger on auth.users, fired by the GoTrue insert. That
-- insert runs as supabase_auth_admin, not as the end user, so the grant must come back
-- for exactly that role or signup breaks. Verified by the sign-up smoke test.
grant execute on function public.handle_new_auth_user() to supabase_auth_admin;

-- Not granted back to service_role: service_role bypasses RLS outright, so it does not
-- need to fire these triggers through an RPC to do anything it is entitled to do.

-- ---------------------------------------------------------------------------
-- Deliberately NOT revoked
--
-- is_staff() and current_app_role() stay executable by anon and authenticated.
-- RLS policies evaluate as the invoking user, so revoking them would make every
-- policy that calls them raise permission-denied and lock the database shut. Each
-- returns only the caller's own role, so neither discloses anything about another
-- student. They account for the two advisories that remain after this migration, and
-- that is the correct trade: availability and non-disclosure over a clean report.
--
-- To remove even those, the role would have to be embedded in a policy that does not
-- call a function, which means duplicating the lookup into every policy. Not worth it.
