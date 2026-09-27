-- Realign the database with the app's domain model.
--
-- The core migration was written before the shared TypeScript domain types
-- settled. This migration renames the enums and columns the app actually uses,
-- adds the denormalised reviewer-facing fields, and exposes the two views the
-- client reads (`v_student_profile`, `v_coverage_matrix`) so the repository
-- layer never has to know how PII is split across tables.

-- ------------------------------------------------------------------
-- enum values used by the shared engine
-- ------------------------------------------------------------------
-- application status: the app tracks document/verification states that the
-- portal pipeline did not model.
alter table public.applications
  drop constraint if exists applications_status_check;
alter table public.applications
  add constraint applications_status_check check (status in
    ('draft','eligibility_checked','documents_pending','submitted',
     'verification_running','manual_review','sanctioned','rejected',
     'payment_returned','disbursed'));

-- document types match `DocumentType` in shared/types.ts
alter table public.documents
  drop constraint if exists documents_doc_type_check;
alter table public.documents
  add constraint documents_doc_type_check check (doc_type in
    ('st_certificate','income_certificate','domicile','aadhaar','disability_certificate',
     'marksheet','bank_passbook','institution_bonafide','net_jrf','passport',
     'nos_offer_letter','nos_qs_proof','apaar_id','photo'));

alter table public.documents
  drop constraint if exists documents_status_check;
alter table public.documents
  add constraint documents_status_check check (status in
    ('valid','expired','pending_review','rejected','missing','superseded'));

alter table public.documents
  drop constraint if exists documents_source_check;
alter table public.documents
  add constraint documents_source_check check (source in
    ('upload','digilocker','edistrict','aishe','nta','generated','apaar','udise_plus','manual'));

-- ------------------------------------------------------------------
-- applications: reviewer-facing + demo support
-- ------------------------------------------------------------------
alter table public.applications
  add column if not exists academic_year text not null default '2026-27',
  add column if not exists blocking_issues jsonb not null default '[]'::jsonb,
  add column if not exists warnings jsonb not null default '[]'::jsonb,
  add column if not exists risk_score integer not null default 0,
  add column if not exists institution_name text,
  add column if not exists family_income numeric(12,2),
  add column if not exists started_at timestamptz not null default now(),
  add column if not exists is_demo boolean not null default false;

-- applicant_* are denormalised on purpose: the reviewer queue and the Ministry
-- dashboard must sort and filter on them without joining `student_private`,
-- which reviewers have no access to.
alter table public.applications
  add column if not exists applicant_name text,
  add column if not exists applicant_state text,
  add column if not exists applicant_district text;

create index if not exists applications_queue_idx
  on public.applications (status, risk_score desc, submitted_at);
create index if not exists applications_demo_idx
  on public.applications (is_demo) where is_demo;

-- ------------------------------------------------------------------
-- profiles: demo key + academic fields the app needs
-- ------------------------------------------------------------------
alter table public.profiles
  add column if not exists demo_key text,
  add column if not exists email text,
  add column if not exists course_level text,
  add column if not exists course_name text,
  add column if not exists udid text,
  add column if not exists currently_holds_scholarship boolean not null default false,
  add column if not exists held_scholarship_details text;

create unique index if not exists profiles_demo_key_idx
  on public.profiles (demo_key) where demo_key is not null;

-- ------------------------------------------------------------------
-- documents: app-facing aliases
-- ------------------------------------------------------------------
alter table public.documents
  add column if not exists file_name text,
  add column if not exists storage_path text,
  add column if not exists mime_type text not null default 'application/pdf',
  add column if not exists size_bytes integer not null default 0,
  add column if not exists matched_application_id uuid
    references public.applications(id) on delete set null,
  add column if not exists is_demo boolean not null default false;

update public.documents set file_name = title where file_name is null;

-- ------------------------------------------------------------------
-- verification_runs / checks: match the engine's output shape
-- ------------------------------------------------------------------
alter table public.verification_runs
  add column if not exists scheme_code text references public.schemes(code) on delete cascade,
  add column if not exists overall text,
  add column if not exists checks jsonb not null default '[]'::jsonb,
  add column if not exists connector_latency_ms jsonb not null default '{}'::jsonb,
  add column if not exists engine_version text;

alter table public.verification_runs
  drop constraint if exists verification_runs_outcome_check;
alter table public.verification_runs
  add constraint verification_runs_outcome_check check (overall is null or overall in
    ('eligible','deficient','manual_review','blocked','running'));

-- ------------------------------------------------------------------
-- views consumed by the client
-- ------------------------------------------------------------------

/**
 * One row per student with PII already resolved for the owner only. RLS on
 * this view is inherited from the underlying tables, so a reviewer session
 * still cannot read it.
 */
create or replace view public.v_student_profile with (security_invoker = true) as
select
  p.id,
  p.full_name,
  p.state_ut,
  p.district,
  p.block,
  p.category,
  p.pvtg_list,
  p.current_class,
  p.current_course,
  p.course_level,
  p.course_name,
  p.institution_name,
  p.udise_plus,
  p.apaar_id,
  p.udid,
  p.preferred_language,
  p.role,
  p.email,
  p.is_demo,
  p.demo_key,
  p.currently_holds_scholarship,
  p.held_scholarship_details,
  sp.date_of_birth,
  sp.gender,
  sp.phone,
  sp.aadhaar_last4,
  sp.aadhaar_verified as aadhaar_name_matches,
  sp.bank_seeded_aadhaar as bank_aadhaar_seeded,
  sp.bank_account_last4,
  sp.family_income_annual as annual_family_income,
  sp.income_certificate_valid_till,
  sp.disability_udid as disability_udid,
  sp.nsp_otr
from public.profiles p
left join public.student_private sp on sp.student_id = p.id;

/**
 * Scheme-by-state coverage matrix for the Ministry dashboard. Built from
 * `coverage_records` (the eligible universe) and `applications` (what was
 * actually claimed and sanctioned). Later rebuilt on top of `coverage_baseline`
 * in a follow-up migration once the dashboard needed a real denominator.
 */
create or replace view public.v_coverage_matrix with (security_invoker = true) as
with universe as (
  select
    state_ut,
    count(*) filter (where enrolled) as enrolled_students,
    count(*) filter (where enrolled and not has_scholarship) as unreached_students,
    count(*) filter (where is_pvtg) as pvtg_students,
    count(*) filter (where family_income <= 250000) as income_2_5lakh_students,
    count(*) filter (where family_income > 250000 and family_income <= 600000) as income_6lakh_students,
    count(*) filter (where not has_otr) as no_otr_students
  from public.coverage_records
  group by state_ut
),
applied as (
  select
    a.applicant_state as state_ut,
    a.scheme_code,
    count(*) filter (where a.status in
      ('eligibility_checked','documents_pending','submitted','verification_running','manual_review')
    ) as applied_students,
    count(*) filter (where a.status = 'sanctioned') as sanctioned_students,
    count(*) filter (where a.status = 'disbursed') as disbursed_students,
    coalesce(sum(a.amount_sanctioned) filter (where a.status in ('sanctioned','disbursed')), 0)
      as sanctioned_amount,
    count(*) filter (where a.submitted_at >= date_trunc('year', now())) as ytd_applications
  from public.applications a
  where a.applicant_state is not null
  group by a.applicant_state, a.scheme_code
)
select
  u.state_ut,
  s.code as scheme_code,
  s.short_name,
  u.enrolled_students,
  u.unreached_students,
  u.pvtg_students,
  u.income_2_5lakh_students,
  u.income_6lakh_students,
  u.no_otr_students,
  coalesce(a.applied_students, 0) as applied_students,
  coalesce(a.sanctioned_students, 0) as sanctioned_students,
  coalesce(a.disbursed_students, 0) as disbursed_students,
  coalesce(a.sanctioned_amount, 0) as sanctioned_amount,
  coalesce(a.ytd_applications, 0) as ytd_applications
from universe u
cross join public.schemes s
left join applied a
  on a.state_ut = u.state_ut and a.scheme_code = s.code;

grant select on public.v_student_profile to authenticated;
grant select on public.v_coverage_matrix to authenticated;

-- ------------------------------------------------------------------
-- reviewer queue view: one row per application needing a human
-- ------------------------------------------------------------------
create or replace view public.v_review_queue with (security_invoker = true) as
select
  a.id as application_id,
  a.scheme_code,
  s.short_name,
  a.status,
  a.applicant_name,
  a.applicant_state,
  a.applicant_district,
  a.institution_name,
  a.family_income,
  a.risk_score,
  a.blocking_issues,
  a.warnings,
  a.submitted_at,
  a.started_at,
  rt.id as review_task_id,
  rt.reason,
  rt.status as review_status,
  rt.priority,
  rt.sla_due,
  rt.assignee_id
from public.applications a
join public.schemes s on s.code = a.scheme_code
left join lateral (
  select id, reason, priority, status, sla_due, assignee_id
  from public.review_tasks
  where application_id = a.id
  order by created_at desc
  limit 1
) rt on true
where a.status in ('manual_review','verification_running','documents_pending','submitted');

grant select on public.v_review_queue to authenticated;
