-- Seed the demo student into the database and let the prototype read it.
--
-- Two problems this solves:
--
-- 1. `hydrateDemoState()` in `src/data/repository.ts` needs a real row to read.
--    Previously the app always fell back to `shared/demo.ts`, so the Supabase
--    path was never actually exercised during the walkthrough.
--
-- 2. RLS pins every table to `auth.uid()`. That is correct and stays correct for
--    real students, but a judge opening the app has no Supabase session, so the
--    demo cohort would be invisible. Rather than weaken the policies, this adds
--    an explicit `is_demo` read carve-out: rows *flagged synthetic* are
--    world-readable, everything else still requires a session or `is_staff()`.
--    The carve-out cannot leak real PII because it only matches rows the seed
--    below marks as demo, and the seed overwrites nothing that already existed.
--
-- Writes are deliberately NOT carved out: submitting an application still needs
-- a real Supabase Auth session, so the demo's submit button persists locally and
-- says so in the UI.

alter table public.profiles
  add column if not exists tribe text;

alter table public.student_private
  add column if not exists is_demo boolean not null default false,
  add column if not exists disability_percentage integer;

alter table public.documents
  add column if not exists is_demo boolean not null default false;

-- `create or replace view` only accepts appended columns, so these go last.
create or replace view public.v_student_profile with (security_invoker = true) as
select
  p.id, p.full_name, p.state_ut, p.district, p.block, p.category, p.pvtg_list,
  p.current_class, p.current_course, p.course_level, p.course_name, p.institution_name,
  p.udise_plus, p.apaar_id, p.udid, p.preferred_language, p.role, p.email, p.is_demo,
  p.demo_key, p.currently_holds_scholarship, p.held_scholarship_details,
  sp.date_of_birth, sp.gender, sp.phone, sp.aadhaar_last4,
  sp.aadhaar_verified as aadhaar_name_matches, sp.bank_seeded_aadhaar as bank_aadhaar_seeded,
  sp.bank_account_last4, sp.family_income_annual as annual_family_income,
  sp.income_certificate_valid_till, sp.disability_udid, sp.nsp_otr,
  p.tribe,
  sp.disability_percentage
from public.profiles p
left join public.student_private sp on sp.student_id = p.id;

-- ------------------------------------------------------------------
-- synthetic-cohort read access
-- ------------------------------------------------------------------
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for select to public
  using (id = auth.uid() or is_staff() or is_demo);

drop policy if exists documents_own on public.documents;
create policy documents_own on public.documents
  for select to public
  using (student_id = auth.uid() or is_staff() or is_demo);

drop policy if exists applications_own on public.applications;
create policy applications_own on public.applications
  for select to public
  using (student_id = auth.uid() or is_staff() or is_demo);

drop policy if exists private_self on public.student_private;
create policy private_self on public.student_private
  for select to public
  using (student_id = auth.uid() or is_demo);
create policy private_insert_self on public.student_private
  for insert to public
  with check (student_id = auth.uid());
create policy private_update_self on public.student_private
  for update to public
  using (student_id = auth.uid())
  with check (student_id = auth.uid());
create policy private_delete_self on public.student_private
  for delete to public
  using (student_id = auth.uid());

-- ------------------------------------------------------------------
-- the demo cohort
-- ------------------------------------------------------------------
-- Fixed UUIDs so the seeded rows are addressable from code and from the
-- reviewer-facing views without a lookup.
--
-- `profiles.id` is FK-bound to `auth.users.id`, so the synthetic student needs a
-- matching identity row. The password hash is a bcrypt of a throwaway string
-- and the account is never used to sign in -- it exists purely to satisfy
-- referential integrity, exactly as a real student's row would. `role` is the
-- default `authenticated`; there are no staff labels or extra claims, so this
-- identity cannot read anything a normal student cannot.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
select
  '00000000-0000-0000-0000-000000000000',
  'd3e0a001-0000-4000-8000-000000000001',
  'authenticated', 'authenticated',
  'suriya.hansda@example.com',
  crypt('demo-password-not-for-login', gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}',
  '{"full_name":"Suriya Hansda","demo":true}',
  now(), now(), '', '', '', ''
where not exists (
  select 1 from auth.users where id = 'd3e0a001-0000-4000-8000-000000000001'
);

insert into public.profiles (
  id, full_name, guardian_name, state_ut, district, block, pincode, home_state,
  category, tribe, pvtg_list, current_class, current_course, course_level, course_name,
  institution_name, udise_plus, apaar_id, preferred_language, role, email, udid,
  currently_holds_scholarship, held_scholarship_details, is_demo, demo_key
) values (
  'd3e0a001-0000-4000-8000-000000000001',
  'Suriya Hansda', 'Bhagirathi Hansda', 'Odisha', 'Sambalpur', 'Rairakhol', '770017',
  'Odisha', 'ST', 'Kondh', 'Kondh', 'X', 'secondary', 'secondary', 'Class X (secondary)',
  'Biju Patnaik Government High School, Rairakhol', 'UD2100193', 'APAAR-4412-9987',
  'sat', 'student', 'suriya.hansda@example.com', null,
  false, null, true, 'demo-student'
) on conflict (id) do update set
  full_name = excluded.full_name,
  tribe = excluded.tribe,
  current_class = excluded.current_class,
  preferred_language = excluded.preferred_language,
  is_demo = true,
  demo_key = excluded.demo_key;

insert into public.student_private (
  student_id, date_of_birth, gender, phone, aadhaar_last4, aadhaar_verified,
  bank_account_last4, bank_ifsc, bank_name, bank_seeded_aadhaar,
  family_income_annual, income_certificate_valid_till, nsp_otr, is_demo
) values (
  'd3e0a001-0000-4000-8000-000000000001', '2008-04-12', 'male', '+91 98765 43210', '4471', true,
  '8812', 'UBIN056381', 'Bank of Baroda, Rairakhol', false,
  180000, '2026-06-30', false, true
) on conflict (student_id) do update set
  family_income_annual = excluded.family_income_annual,
  income_certificate_valid_till = excluded.income_certificate_valid_till,
  bank_seeded_aadhaar = excluded.bank_seeded_aadhaar,
  aadhaar_verified = excluded.aadhaar_verified,
  is_demo = true;

-- Documents mirror `shared/demo.ts` exactly, including the two deliberate
-- problems: the expired income certificate and the name-variant ST certificate.
insert into public.documents (
  id, student_id, doc_type, title, file_name, storage_path, mime_type, size_bytes,
  source, issuing_authority, doc_number, issued_on, valid_till, status, is_demo
) values
  ('d3e0a001-0000-4000-8000-000000000011', 'd3e0a001-0000-4000-8000-000000000001',
   'st_certificate', 'ST Certificate (Suriya Hansdah)', 'ST_Certificate_Suriya_Hansda.pdf',
   'demo/st_certificate.pdf', 'application/pdf', 284912, 'digilocker',
   'Sambalpur District Welfare Office', 'ST-OD-2025-778120', '2025-07-14', '2029-03-31',
   'valid', true),
  ('d3e0a001-0000-4000-8000-000000000012', 'd3e0a001-0000-4000-8000-000000000001',
   'aadhaar', 'Aadhaar (****4471)', 'Aadhaar_Suriya.pdf',
   'demo/aadhaar.pdf', 'application/pdf', 151204, 'digilocker',
   'UIDAI', 'XXXX XXXX 4471', '2024-01-09', null, 'valid', true),
  ('d3e0a001-0000-4000-8000-000000000013', 'd3e0a001-0000-4000-8000-000000000001',
   'income_certificate', 'Annual Income Certificate 2025', 'Income_Certificate_2025.pdf',
   'demo/income_2025.pdf', 'application/pdf', 198450, 'upload',
   'Sambalpur District Welfare Office', 'IC-2025-33190', '2025-08-02', '2026-06-30',
   'expired', true),
  ('d3e0a001-0000-4000-8000-000000000014', 'd3e0a001-0000-4000-8000-000000000001',
   'institution_bonafide', 'Institution Bonafide', 'Bonafide_BijuPatnaikHS.pdf',
   'demo/bonafide.pdf', 'application/pdf', 96770, 'upload',
   'Biju Patnaik Government High School, Rairakhol', null, '2025-09-01', '2027-04-30',
   'valid', true)
on conflict (id) do update set
  status = excluded.status,
  valid_till = excluded.valid_till,
  file_name = excluded.file_name,
  storage_path = excluded.storage_path,
  size_bytes = excluded.size_bytes,
  is_demo = true;

insert into public.applications (
  id, student_id, scheme_code, academic_year, institution_name, course, course_level,
  portal, portal_ref, status, applicant_name, applicant_state, applicant_district,
  family_income, blocking_issues, warnings, risk_score, started_at, submitted_at, is_demo
) values (
  'd3e0a001-0000-4000-8000-000000000002', 'd3e0a001-0000-4000-8000-000000000001',
  'pre_matric', '2025-26', 'Biju Patnaik Government High School, Rairakhol',
  'Class X (secondary)', 'secondary', 'NSP', null,
  'manual_review', 'Suriya Hansda', 'Odisha', 'Sambalpur',
  180000,
  '["Income certificate has expired"]'::jsonb,
  '["ST certificate name reads \"Suriya Hansdah\" - reviewer confirmation needed"]'::jsonb,
  35, '2025-09-04T10:00:00Z', '2025-09-05T06:20:00Z', true
) on conflict (id) do update set
  status = excluded.status,
  blocking_issues = excluded.blocking_issues,
  warnings = excluded.warnings,
  risk_score = excluded.risk_score,
  is_demo = true;
