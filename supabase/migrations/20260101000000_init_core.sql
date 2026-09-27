-- =============================================================
-- JagoScholarship — core schema
-- Unified Scholarship Module for ST students (MoTA · SIH PS 26238)
-- =============================================================
create extension if not exists "pgcrypto";

-- ---------- enums ----------
create type public.app_role as enum ('student','reviewer','analyst','admin');
create type public.check_outcome as enum
  ('verified','mismatch','expired','not_found','unavailable','skipped');
create type public.severity as enum ('blocker','warning','info');
create type public.review_status as enum ('open','in_review','resolved','rejected');

-- ---------- helper: updated_at ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- identity & profile ----------
-- profiles holds non-sensitive attributes so that Ministry analysts can be
-- granted row access without ever seeing PII (privacy-by-design).
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  guardian_name text,
  state_ut text not null,
  district text not null,
  block text,
  pincode text,
  home_state text,
  category text not null default 'ST' check (category in ('ST','PVTG')),
  pvtg_list text,
  current_class text,
  current_course text,
  institution_name text,
  udise_plus text,
  apaar_id text,
  preferred_language text not null default 'en',
  role public.app_role not null default 'student',
  photo_url text,
  is_demo boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- PII lives here. Self-access only — reviewers never read it directly,
-- they only see masked evidence rendered inside verification_checks.
create table public.student_private (
  student_id uuid primary key references public.profiles(id) on delete cascade,
  date_of_birth date,
  gender text,
  phone text,
  aadhaar_last4 text,
  aadhaar_verified boolean not null default false,
  bank_account_last4 text,
  bank_ifsc text,
  bank_name text,
  bank_seeded_aadhaar boolean not null default false,
  family_income_annual numeric(12,2) not null default 0,
  income_certificate_valid_till date,
  nsp_otr text,
  sfmp_scholar_id text,
  nos_application_id text,
  disability_udid text,
  updated_at timestamptz not null default now()
);
create trigger student_private_touch before update on public.student_private
  for each row execute function public.touch_updated_at();

-- ---------- institutions ----------
create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('school','college','university','institute')),
  state_ut text not null,
  district text not null,
  affiliation text check (affiliation in ('government','aided','private','deemed')),
  udise_plus text,
  aishe_code text,
  aishe_verified boolean not null default false,
  is_top_class_institute boolean not null default false,
  is_nfst_host boolean not null default false,
  nos_eligible boolean not null default false,
  qs_rank integer,
  naac_grade text,
  created_at timestamptz not null default now()
);
create unique index institutions_udise_idx on public.institutions (udise_plus)
  where udise_plus is not null;
create index institutions_state_idx on public.institutions (state_ut, district);

-- ---------- schemes & rules ----------
create table public.schemes (
  code text primary key check (code in
    ('pre_matric','post_matric','top_class','nfst','nos')),
  name text not null,
  short_name text not null,
  portal text not null check (portal in ('NSP','SFMP','NOS','MoTA')),
  portal_url text,
  level text not null,
  is_central_sector boolean not null default false,
  funding_pattern text,
  income_ceiling numeric(12,2),
  slots_per_year integer,
  benefit jsonb not null default '{}'::jsonb,
  eligibility_summary text,
  document_requirements jsonb not null default '[]'::jsonb,
  deadline_fresh date,
  deadline_renewal date,
  source_url text,
  figures_verified_on date,
  accent text,
  sort_order integer not null default 0
);

create table public.scheme_rules (
  id bigint generated always as identity primary key,
  scheme_code text not null references public.schemes(code) on delete cascade,
  rule_key text not null,
  rule_type text not null check (rule_type in
    ('income_ceiling','age_limit','class_level','course_level','institution_type',
     'institution_flag','doc_required','single_scheme','percentile','qs_rank',
     'net_jrf','udid','domicile','seats_limit')),
  params jsonb not null default '{}'::jsonb,
  severity public.severity not null default 'blocker',
  label_en text not null,
  label_hi text,
  source_url text,
  active boolean not null default true,
  unique (scheme_code, rule_key)
);

-- ---------- applications ----------
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  scheme_code text not null references public.schemes(code),
  academic_year text not null,
  institution_id uuid references public.institutions(id),
  course text,
  course_level text,
  residence_type text check (residence_type in ('day_scholar','hosteller')),
  portal text not null check (portal in ('NSP','SFMP','NOS','MoTA')),
  portal_ref text,
  status text not null default 'draft' check (status in
    ('draft','submitted','in_verification','pending_institution','pending_state',
     'pending_ministry','sanctioned','disbursed','rejected','withdrawn')),
  current_stage text,
  concurrency_conflict boolean not null default false,
  amount_sanctioned numeric(12,2),
  submitted_at timestamptz,
  sanctioned_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, scheme_code, academic_year)
);
create trigger applications_touch before update on public.applications
  for each row execute function public.touch_updated_at();
create index applications_student_idx on public.applications (student_id, status);

create table public.application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  status text,
  stage text,
  actor_role text,
  actor_id uuid,
  note text,
  source_system text,
  occurred_at timestamptz not null default now()
);
create index application_events_app_idx on public.application_events (application_id, occurred_at);

-- ---------- document wallet ----------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  doc_type text not null check (doc_type in
    ('st_certificate','income_certificate','domicile','aadhaar','disability_udid',
     'marksheet','bank_passbook','institution_bonafide','net_jrf','passport',
     'nos_offer_letter','nos_qs_proof','apaar_consent','community_certificate')),
  title text not null,
  source text not null default 'upload' check (source in
    ('upload','digilocker','edistrict','aishe','nta','generated','apaar')),
  issuing_authority text,
  doc_number text,
  issued_on date,
  valid_till date,
  file_path text,
  digilocker_uri text,
  digilocker_name text,
  status text not null default 'submitted' check (status in
    ('submitted','verified','mismatch','expired','rejected','superseded')),
  verified_at timestamptz,
  verification_check_id uuid,
  reuse_of uuid references public.documents(id),
  verification_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger documents_touch before update on public.documents
  for each row execute function public.touch_updated_at();
create index documents_student_idx on public.documents (student_id, doc_type);

-- ---------- verification layer ----------
create table public.verification_runs (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('application','student','document')),
  subject_id uuid not null,
  student_id uuid references public.profiles(id) on delete cascade,
  application_id uuid references public.applications(id) on delete cascade,
  trigger text not null,
  outcome text not null default 'running' check (outcome in
    ('running','verified','needs_review','blocked','error')),
  connectors jsonb not null default '[]'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  duration_ms integer,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index verification_runs_app_idx on public.verification_runs (application_id, started_at desc);

create table public.verification_checks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.verification_runs(id) on delete cascade,
  application_id uuid references public.applications(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  check_key text not null,
  label_en text not null,
  label_hi text,
  connector text not null,
  doc_type text,
  claimed jsonb,
  source_value jsonb,
  outcome public.check_outcome not null,
  severity public.severity not null default 'warning',
  auto_resolvable boolean not null default false,
  message_en text not null,
  message_hi text,
  remedy_en text,
  remedy_hi text,
  evidence_url text,
  confidence numeric(4,3),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_decision text check (review_decision in ('accepted_source','accepted_claim','rejected','needs_more_info')),
  review_note text,
  created_at timestamptz not null default now()
);
create index verification_checks_app_idx on public.verification_checks (application_id, created_at desc);
create index verification_checks_outcome_idx on public.verification_checks (outcome, severity);

create table public.review_tasks (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references public.verification_checks(id) on delete cascade,
  application_id uuid references public.applications(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status public.review_status not null default 'open',
  reason text not null,
  sla_due timestamptz,
  assignee_id uuid references public.profiles(id),
  resolution text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index review_tasks_status_idx on public.review_tasks (status, priority, sla_due);

-- ---------- money ----------
create table public.sanctions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  sanction_letter_no text,
  sanctioned_amount numeric(12,2) not null,
  sanction_date date,
  sanctioned_by text,
  components jsonb not null default '{}'::jsonb,
  letter_path text,
  created_at timestamptz not null default now()
);

create table public.payment_installments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  sanction_id uuid references public.sanctions(id) on delete cascade,
  period_label text not null,
  amount numeric(12,2) not null,
  due_date date,
  status text not null default 'scheduled' check (status in
    ('scheduled','initiated','credited','returned','failed','on_hold')),
  pfms_ref text,
  utr text,
  initiated_at timestamptz,
  credited_at timestamptz,
  failure_reason text,
  bank_seeded boolean not null default true,
  created_at timestamptz not null default now()
);
create index payment_installments_app_idx on public.payment_installments (application_id, due_date);

-- ---------- JAGO ----------
create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  language text not null default 'en',
  channel text not null default 'in_app',
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  language text not null default 'en',
  intent text,
  confidence numeric(4,3),
  tool_calls jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  quick_replies jsonb not null default '[]'::jsonb,
  latency_ms integer,
  helpful boolean,
  created_at timestamptz not null default now()
);
create index chat_messages_session_idx on public.chat_messages (session_id, created_at);

create table public.kb_articles (
  id bigint generated always as identity primary key,
  slug text not null unique,
  category text not null default 'general',
  title jsonb not null,
  body jsonb not null,
  tags text[],
  source_url text,
  updated_at timestamptz not null default now()
);

-- ---------- notifications ----------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  channel text not null default 'in_app' check (channel in ('in_app','push','sms','email','whatsapp')),
  title jsonb not null,
  body jsonb not null,
  action_route text,
  severity public.severity not null default 'info',
  read_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------- integration layer registry ----------
create table public.source_systems (
  code text primary key,
  name text not null,
  category text not null,
  base_url text,
  auth_mode text,
  env_key text,
  mode text not null default 'mock' check (mode in ('mock','live','degraded','down')),
  is_available boolean not null default true,
  latency_ms integer,
  last_checked_at timestamptz,
  last_sync_at timestamptz,
  notes text,
  sort_order integer not null default 0
);

create table public.mock_overrides (
  id bigint generated always as identity primary key,
  connector text not null,
  match_key text not null,
  response jsonb not null,
  note text,
  created_at timestamptz not null default now(),
  unique (connector, match_key)
);

-- ---------- coverage gap analytics ----------
create table public.coverage_records (
  id bigint generated always as identity primary key,
  udise_plus text,
  apaar_id text,
  student_name text not null,
  class_level text,
  gender text,
  state_ut text not null,
  district text not null,
  block text,
  is_pvtg boolean not null default false,
  family_income numeric(12,2),
  enrolled boolean not null default true,
  has_otr boolean not null default false,
  otr_year text,
  has_scholarship boolean not null default false,
  matched_student_id uuid references public.profiles(id) on delete set null,
  matched_application_id uuid references public.applications(id) on delete set null,
  match_status text not null default 'unmatched',
  need_score numeric(5,2) not null default 0,
  outreach_status text not null default 'not_contacted',
  source_systems text[] not null default '{}',
  last_synced_at timestamptz not null default now(),
  unique (state_ut, udise_plus, apaar_id)
);
create index coverage_status_idx on public.coverage_records (match_status, state_ut);
create index coverage_need_idx on public.coverage_records (need_score desc);

create table public.outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  target_cohort text not null,
  state_ut text,
  channel text not null default 'sms',
  status text not null default 'draft' check (status in ('draft','running','closed')),
  created_by uuid references public.profiles(id),
  total_targets integer not null default 0,
  sent_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.outreach_contacts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.outreach_campaigns(id) on delete cascade,
  coverage_id bigint not null references public.coverage_records(id) on delete cascade,
  contact_value text,
  status text not null default 'queued',
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, coverage_id)
);

-- ---------- audit ----------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, created_at desc);

-- ---------- views ----------
-- "one scheme at a time" guard data
create view public.v_student_active_schemes as
select
  a.student_id,
  a.scheme_code,
  s.name as scheme_name,
  a.status,
  a.academic_year,
  a.amount_sanctioned,
  (a.status in ('submitted','in_verification','pending_institution',
                'pending_state','pending_ministry','sanctioned','disbursed')) as is_active
from public.applications a
join public.schemes s on s.code = a.scheme_code;

create view public.v_coverage_cohorts as
select
  state_ut,
  district,
  count(*) filter (where enrolled) as enrolled_st,
  count(*) filter (where match_status = 'enrolled_not_availing') as enrolled_not_availing,
  count(*) filter (where match_status = 'applied_not_sanctioned') as applied_not_sanctioned,
  count(*) filter (where match_status = 'sanctioned_not_paid') as sanctioned_not_paid,
  count(*) filter (where match_status = 'availing') as availing,
  count(*) filter (where match_status = 'exited') as exited,
  round(avg(need_score), 2) as avg_need_score
from public.coverage_records
group by state_ut, district;

-- ---------- role helpers ----------
create or replace function public.current_app_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'student'::public.app_role)
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('reviewer','analyst','admin')
  )
$$;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.student_private enable row level security;
alter table public.institutions enable row level security;
alter table public.schemes enable row level security;
alter table public.scheme_rules enable row level security;
alter table public.applications enable row level security;
alter table public.application_events enable row level security;
alter table public.documents enable row level security;
alter table public.verification_runs enable row level security;
alter table public.verification_checks enable row level security;
alter table public.review_tasks enable row level security;
alter table public.sanctions enable row level security;
alter table public.payment_installments enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.kb_articles enable row level security;
alter table public.notifications enable row level security;
alter table public.source_systems enable row level security;
alter table public.mock_overrides enable row level security;
alter table public.coverage_records enable row level security;
alter table public.outreach_campaigns enable row level security;
alter table public.outreach_contacts enable row level security;
alter table public.audit_log enable row level security;

-- profiles: self or staff
create policy profiles_self on public.profiles for select
  using (id = auth.uid() or public.is_staff());
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid() or public.is_staff()) with check (true);
create policy profiles_insert_self on public.profiles for insert
  with check (id = auth.uid());

-- PII: strictly self
create policy private_self on public.student_private for all
  using (student_id = auth.uid()) with check (student_id = auth.uid());

-- reference data: readable by everyone (public info)
create policy institutions_read on public.institutions for select using (true);
create policy schemes_read on public.schemes for select using (true);
create policy scheme_rules_read on public.scheme_rules for select using (true);
create policy kb_read on public.kb_articles for select using (true);
create policy source_systems_read on public.source_systems for select using (public.is_staff());

-- student-owned
create policy applications_own on public.applications for select
  using (student_id = auth.uid() or public.is_staff());
create policy applications_insert_own on public.applications for insert
  with check (student_id = auth.uid());
create policy applications_update_own on public.applications for update
  using (student_id = auth.uid() or public.is_staff());

create policy events_own on public.application_events for select
  using (exists (select 1 from public.applications a
                 where a.id = application_id and (a.student_id = auth.uid() or public.is_staff())));

create policy documents_own on public.documents for select
  using (student_id = auth.uid() or public.is_staff());
create policy documents_insert_own on public.documents for insert
  with check (student_id = auth.uid());
create policy documents_update_own on public.documents for update
  using (student_id = auth.uid() or public.is_staff());

create policy runs_own on public.verification_runs for select
  using (student_id = auth.uid() or public.is_staff());

create policy checks_own on public.verification_checks for select
  using (student_id = auth.uid() or public.is_staff());

create policy review_tasks_staff on public.review_tasks for select using (public.is_staff());
create policy review_tasks_update_staff on public.review_tasks for update using (public.is_staff());

create policy sanctions_own on public.sanctions for select
  using (exists (select 1 from public.applications a
                 where a.id = application_id and (a.student_id = auth.uid() or public.is_staff())));

create policy installments_own on public.payment_installments for select
  using (exists (select 1 from public.applications a
                 where a.id = application_id and (a.student_id = auth.uid() or public.is_staff())));

create policy chat_sessions_own on public.chat_sessions for all
  using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy chat_messages_own on public.chat_messages for all
  using (exists (select 1 from public.chat_sessions s
                 where s.id = session_id and s.student_id = auth.uid()))
  with check (exists (select 1 from public.chat_sessions s
                 where s.id = session_id and s.student_id = auth.uid()));

create policy notifications_own on public.notifications for select
  using (user_id = auth.uid());
create policy notifications_update_own on public.notifications for update
  using (user_id = auth.uid());

create policy mock_overrides_staff on public.mock_overrides for select using (public.is_staff());
create policy coverage_staff on public.coverage_records for select using (public.is_staff());
create policy campaigns_staff on public.outreach_campaigns for all using (public.is_staff())
  with check (public.is_staff());
create policy contacts_staff on public.outreach_contacts for all using (public.is_staff())
  with check (public.is_staff());
create policy audit_staff on public.audit_log for select using (public.is_staff());
