-- 20260101001000_pin_is_demo_seed_flag.sql
--
-- Closes a privacy hole in the `is_demo` carve-out.
--
-- The demo cohort is deliberately world-readable so the public coverage and review
-- screens have something to show without a session. That carve-out was implemented as
--
--     using (student_id = auth.uid() or is_demo)
--
-- on the applications policies. Read access was never the problem. The problem was
-- that the INSERT and UPDATE policies' WITH CHECK let a client SET that column:
--
--     patch applications?is_demo=true   -- one request
--
-- and the row then became world-readable. That publishes the student's declared
-- annual income, institution, scheme, the reasons they were blocked and their
-- review history, to anyone who asks. With CHECK merely testing the resulting row, a
-- self-flagged row satisfies its own policy and sails through.
--
-- A trigger is the fix, not a policy change, because a policy can only see the value
-- that is being written; the trigger can see who is writing it and ignore the value.

create or replace function public.pin_is_demo_seed_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A change to the flag is only honoured for staff, and for service-side writes
  -- (auth.uid() is null, which is how the seed migrations and admin tooling write).
  --
  -- Anything else is pinned back to what it already was, so the submitted value is
  -- silently discarded rather than rejected. A student applying normally sends
  -- is_demo=false, which is the value we want anyway.
  if auth.uid() is not null
     and not public.is_staff()
     and new.is_demo is distinct from (
       case when tg_op = 'INSERT' then false else old.is_demo end
     ) then
    new.is_demo := case when tg_op = 'INSERT' then false else old.is_demo end;
  end if;

  return new;
end;
$$;

comment on function public.pin_is_demo_seed_flag() is
  'Pins applications.is_demo for non-staff clients. SECURITY DEFINER so the pin holds even if the caller cannot read is_staff().';

-- before insert or update, so the value is corrected before the row is written and
-- before any policy evaluates the resulting row.
drop trigger if exists on_is_demo_seed_flag on public.applications;
create trigger on_is_demo_seed_flag
  before insert or update on public.applications
  for each row execute function public.pin_is_demo_seed_flag();

-- The flag is a seeder concern, not a client concern. Revoke the RPC path the same way
-- as 20260101000900 — the function is SECURITY DEFINER, so leaving it callable would
-- hand out the same privilege the trigger enforces.
revoke execute on function public.pin_is_demo_seed_flag() from public, anon, authenticated;
