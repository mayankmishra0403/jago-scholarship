-- Security hardening pass driven by the Supabase security advisors.
--
-- Findings addressed:
--
-- 1. [ERROR] `v_student_active_schemes` was created SECURITY DEFINER, so it
--    ran with its owner's privileges and completely bypassed the RLS policies
--    on `applications`. Because the view selects `student_id` and
--    `amount_sanctioned` for every row, the anon key could read every student's
--    application and sanction amount. This is the most serious finding in the
--    project and it was present from the core migration.
--
-- 2. [ERROR] `v_coverage_cohorts` was also SECURITY DEFINER. The data is
--    aggregate, but a definer view still silently bypasses `coverage_records`
--    policy changes, so it is rebuilt as invoker for the same reason.
--
-- 3. [ERROR] `coverage_baseline` is exposed to PostgREST without RLS enabled.
--    It holds only UDISE+ head-counts, so the policy is a plain select grant
--    rather than a lock, but the linter is right that the default is wrong.
--
-- 4. [WARN] `touch_updated_at` had a mutable `search_path`.
--
-- `security_invoker` views delegate to the querying role, so the underlying
-- policies now actually apply. The student-scoped view therefore returns a
-- student's rows only to that student (or to staff), and to nothing at all for
-- an anonymous caller who is not looking at a demo row.
--
-- Left deliberately unresolved:
--
--   `is_staff()` and `current_app_role()` remain SECURITY DEFINER and remain
--   executable. They are RLS policy helpers, and Postgres evaluates policy
--   expressions as the querying role, so revoking EXECUTE from `anon` would
--   make every policy that references them raise an error. `is_staff()` only
--   ever inspects `auth.uid()`, which is null for anonymous callers, so the RPC
--   surface discloses nothing. `is_staff()` cannot be made SECURITY INVOKER
--   because the `profiles` policy it is used in calls `is_staff()` itself.

drop view if exists public.v_student_active_schemes;

create view public.v_student_active_schemes with (security_invoker = true) as
select
  a.student_id,
  a.scheme_code,
  s.name as scheme_name,
  a.status,
  a.academic_year,
  a.amount_sanctioned,
  (a.status in (
    'eligibility_checked', 'documents_pending', 'submitted', 'verification_running',
    'manual_review', 'sanctioned', 'payment_returned', 'disbursed'
  )) as is_active
from public.applications a
join public.schemes s on s.code = a.scheme_code;

grant select on public.v_student_active_schemes to authenticated;

drop view if exists public.v_coverage_cohorts;

create view public.v_coverage_cohorts with (security_invoker = true) as
select
  state_ut,
  district,
  count(*) filter (where enrolled) as enrolled_st,
  count(*) filter (where match_status = 'unmatched') as unreached_st,
  count(*) filter (where is_pvtg) as pvtg_st,
  count(*) filter (where not has_otr) as no_otr_st,
  round(avg(need_score), 2) as avg_need_score
from public.coverage_records
group by state_ut, district;

grant select on public.v_coverage_cohorts to authenticated;

-- Public aggregate: UDISE+ enrolment head-counts contain no personal data, so
-- the dashboard can read them without a session. RLS is still switched on so
-- the table's default posture is deny rather than allow-by-omission.
alter table public.coverage_baseline enable row level security;

drop policy if exists coverage_baseline_public_read on public.coverage_baseline;
create policy coverage_baseline_public_read on public.coverage_baseline
  for select to anon, authenticated
  using (true);

alter function public.touch_updated_at() set search_path = '';
