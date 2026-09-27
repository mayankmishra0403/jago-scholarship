-- 20260101001100_fix_is_demo_guard_on_insert.sql
--
-- Fixes a bug introduced by 20260101001000 that made it impossible for a student to
-- apply at all.
--
-- 010 pinned is_demo with:
--
--     new.is_demo := case when tg_op = 'INSERT' then false else old.is_demo end;
--
-- which is correct for UPDATE and broken for INSERT. OLD is unassigned on INSERT, so
-- touching old.is_demo raises
--
--     record "old" is not assigned yet
--
-- and aborts the statement. Any student submitting the application form hit a 500 —
-- the guard was so effective it closed the front door.
--
-- The whole evaluation also short-circuited incorrectly: `new.is_demo is distinct
-- from <expr>` had to evaluate <expr> to answer the question, so the exception was
-- raised even when the student was submitting is_demo=false, which was never going to
-- change anything.
--
-- Both branches are now written so the expression is only evaluated where OLD
-- actually exists. Note the trigger is still before INSERT OR UPDATE and still
-- rewrites the value; the fix is the branch, not the timing.

create or replace function public.pin_is_demo_seed_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and not public.is_staff() then
    if tg_op = 'INSERT' then
      -- There is no prior value on INSERT. A student-supplied application is never
      -- demo data, whatever the request body claims, so the correct pinned value is
      -- simply false.
      new.is_demo := false;
    elsif new.is_demo is distinct from old.is_demo then
      -- UPDATE: silently restore the stored value. No exception, because rejecting
      -- the write would surface as a failed save to a student who did nothing wrong
      -- beyond sending a field the form should not have sent.
      new.is_demo := old.is_demo;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.pin_is_demo_seed_flag() is
  'Pins applications.is_demo for non-staff clients. INSERT pins to false (no OLD row exists); UPDATE restores the stored value. SECURITY DEFINER so the pin holds even if the caller cannot read is_staff().';

-- ---------------------------------------------------------------------------
-- Verified against the live database after applying, all five cases:
--
--   student INSERT omitting is_demo          -> row created, is_demo = false
--   student UPDATE is_demo = true            -> unchanged, still false
--   staff   UPDATE is_demo = true            -> honoured
--   anon    SELECT of a non-demo application -> 0 rows
--   service_role INSERT is_demo = true       -> honoured (seeding path)
--
-- Without the last case, the demo cohort could not be reseeded at all, which is the
-- failure mode a guard that is too strict always has.
