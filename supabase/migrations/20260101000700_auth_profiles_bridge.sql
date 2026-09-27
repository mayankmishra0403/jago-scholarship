-- 20260101000700_auth_profiles_bridge.sql
--
-- Links Supabase Auth to the existing domain model.
--
-- WHY THIS EXISTS
-- ---------------
-- Every RLS policy in the schema resolves ownership through `auth.uid()`:
--   applications_own        -> profiles.id = auth.uid()
--   documents_own           -> profiles.id = auth.uid()
--   public.is_staff()       -> exists(select 1 from profiles
--                                where id = auth.uid() and role in (...))
--
-- `auth.uid()` reads from the GoTrue session. Until a real sign-in exists it is
-- always NULL, so `is_staff()` is permanently false and every staff table is
-- permanently locked. That is RLS behaving correctly with an anonymous caller,
-- not a bug — it is exactly why the reviewer queue renders empty.
--
-- This migration is the missing half: it provisions a `profiles` row for every
-- new auth user, so `auth.uid()` has something to match. Without it a sign-in
-- can succeed while every policy still denies, which is the single most
-- confusing failure mode in an auth + RLS design.
--
-- Applied by hand in the Supabase SQL editor (this project has no CI link to
-- the remote database yet).

-- ---------------------------------------------------------------------------
-- 1. Ensure the columns auth needs to seed a profile
-- ---------------------------------------------------------------------------

-- `full_name`, `state_ut` and `district` are NOT NULL with no default, so a bare
-- trigger insert would fail. Give them safe defaults now; onboarding fills in the
-- real values immediately after the first sign-in.
--
-- The state default is deliberately empty rather than 'Odisha'. A national portal
-- that silently stamps Odisha onto every new account would file tribal students
-- from six other states into the wrong state scholarship pool, which is a data
-- error nobody would notice until a sanction is rejected. Unknown is honest.
alter table public.profiles
  alter column full_name set default '',
  alter column state_ut  set default '',
  alter column district  set default '';

-- NOTE: `role` already exists as the `public.app_role` enum, which is what the
-- rest of the schema and `current_app_role()` expect. It is deliberately NOT
-- re-declared here — an `add column if not exists role text` would silently no-op
-- and leave a reader believing a plain-text check constraint exists. The enum
-- already restricts the values to student/reviewer/analyst/admin.

-- Verification state for the Aadhaar / DigiLocker consent flow. `unverified` is
-- the safe default: an unverified identity must never be treated as verified.
alter table public.profiles
  add column if not exists identity_status text not null default 'unverified'
    check (identity_status in ('unverified', 'pending', 'verified', 'rejected'));

-- Last four digits only. Storing a full Aadhaar number in this schema would be
-- unlawful (Aadhaar Act 2016 s.57) and is deliberately not done anywhere here.
alter table public.profiles
  add column if not exists aadhaar_last4 text
    check (aadhaar_last4 is null or aadhaar_last4 ~ '^[0-9]{4}$'),
  add column if not exists aadhaar_verified_at timestamptz,
  add column if not exists identity_provider text;

-- ---------------------------------------------------------------------------
-- 2. Provision a profile on sign-up
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, preferred_language)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(new.email, 'student'), '@', 1)
    ),
    coalesce(new.raw_user_meta_data ->> 'preferred_language', 'en')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public;
grant execute on function public.handle_new_auth_user() to supabase_auth_admin;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- 3. Backfill: staff roles for the demo identities
-- ---------------------------------------------------------------------------
-- The prototype's reviewer/analyst screens read live data only when a real staff
-- session exists. These two rows are the staff accounts the demo signs in as.
-- Passwords are not set here — they authenticate through the normal OTP flow.
-- The emails are role placeholders; change them before any real deployment.

insert into public.profiles (id, full_name, state_ut, district, role)
select u.id, 'Reviewer Desk', 'Odisha', 'Sambalpur', 'reviewer'
from auth.users u
where u.email = 'reviewer@jagoscholarship.gov.in'
on conflict (id) do nothing;

insert into public.profiles (id, full_name, state_ut, district, role)
select u.id, 'Ministry Analyst', 'Odisha', 'Sambalpur', 'analyst'
from auth.users u
where u.email = 'analyst@jagoscholarship.gov.in'
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Staff must be able to read the profile they are reviewing
-- ---------------------------------------------------------------------------
-- The ownership policy reads `profiles.id = auth.uid()`, so a reviewer can see
-- their own row but not the student's. Review needs the latter.

drop policy if exists profiles_staff_read on public.profiles;
create policy profiles_staff_read on public.profiles
  for select
  using (public.is_staff() or id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. A user may not promote themselves, and a user may not verify themselves
-- ---------------------------------------------------------------------------
-- `profiles_update_self` is
--     using (id = auth.uid() or public.is_staff()) with check (true)
-- so *any* signed-in user can update *any* column of their own row. Without a
-- guard that includes `role`, which means one request
--
--     PATCH /rest/v1/profiles?id=eq.<own uid>  {"role": "admin"}
--
-- promotes a student to admin and unlocks every staff table at once. RLS has no
-- column-level policy, so the guard has to be a trigger.
--
-- The check is `current_app_role() = 'admin'`, not `is_staff()`. Testing
-- `is_staff()` here would be the bug this trigger exists to prevent: a reviewer
-- is staff, so a reviewer could set their own role to admin. The promotion must
-- come from an account that already holds the top role.
--
-- `auth.uid()` is NULL for a service_role request, which is how role changes are
-- actually made — the dashboard, a seed script, or a service-role client. That
-- path is allowed through deliberately.

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Reads never trip this. Only an actual change of `role` does.
  if new.role is distinct from old.role then
    if auth.uid() is not null and public.current_app_role() <> 'admin' then
      raise exception 'role is not self-assignable'
        using errcode = '42501';
    end if;
  end if;

  -- Same reasoning for identity state: a student must not be able to mark
  -- themselves Aadhaar-verified. Only a server-side verification callback may.
  if new.identity_status is distinct from old.identity_status then
    if coalesce(current_setting('app.identity_verified_by', true), '') <> 'gateway' then
      raise exception 'identity_status is set by the verification gateway, not the client'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_profile_role_change on public.profiles;
create trigger on_profile_role_change
  before update on public.profiles
  for each row execute function public.protect_profile_role();

-- ---------------------------------------------------------------------------
-- 6. Record every staff action
-- ---------------------------------------------------------------------------
-- `audit_log` already exists and is already staff-readable, but nothing was
-- writing to it. The review decision path is the highest-value thing to log in
-- this product: it decides whether a student gets money.

create or replace function public.audit_staff_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  row_before jsonb;
  row_after  jsonb;
  row_id     text;
begin
  -- NEW is unassigned on DELETE and OLD is unassigned on INSERT. Referencing
  -- either one outside its own TG_OP branch raises
  --   'record "old" is not assigned yet'
  -- and aborts the statement, so the branches below are not a stylistic choice.
  if tg_op in ('UPDATE', 'DELETE') then
    row_before := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    row_after := to_jsonb(new);
  end if;

  row_id := coalesce(row_after ->> 'id', row_before ->> 'id');

  -- Anonymous callers and non-staff actors are not audited: the first
  -- cannot be attributed, the second cannot change a review task in the first
  -- place because RLS already stopped them.
  if actor is null or not public.is_staff() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  insert into public.audit_log (
    actor_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    before,
    after
  )
  values (
    actor,
    (public.current_app_role())::text,
    lower(tg_op),
    tg_table_name,
    row_id,
    row_before,
    row_after
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists on_review_task_audit on public.review_tasks;
create trigger on_review_task_audit
  after insert or update or delete on public.review_tasks
  for each row execute function public.audit_staff_write();
