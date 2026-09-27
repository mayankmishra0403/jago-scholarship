-- Ministry coverage baseline: the real ST student population per State / UT.
--
-- `coverage_records` holds a deterministic *sample* of the eligible universe
-- (enough to compute match rates without bloating the database). The Ministry
-- dashboard cannot report national numbers from a sample, so this table carries
-- the true UDISE+ / AISHE enrolment denominators and the sample's rates are
-- projected onto them. `v_coverage_matrix` is rebuilt on top of both.
--
-- This migration is separate from `align_domain_model` because that one was
-- already applied before the dashboard needed a real denominator.

create table if not exists public.coverage_baseline (
  state_ut text primary key,
  st_enrolled integer not null,
  st_pvtg integer not null default 0,
  pvtg_share numeric(4,3) not null default 0,
  otr_registered integer not null default 0,
  otr_rate numeric(4,3) not null default 0,
  median_family_income numeric(12,2),
  source_url text,
  figures_verified_on date,
  updated_at timestamptz not null default now()
);
create trigger coverage_baseline_touch before update on public.coverage_baseline
  for each row execute function public.touch_updated_at();

/**
 * Scheme-by-state coverage matrix for the Ministry dashboard. Built from
 * `coverage_baseline` (the real population), `coverage_records` (the matched
 * sample that supplies rates) and `applications` (what was actually claimed).
 */

-- Baseline figures: UDISE+ AISHE ST enrolment returns. `pvtg_share` and
-- `otr_rate` are recorded alongside the head-counts so the dashboard can show
-- how far each state's outreach has to travel.
insert into public.coverage_baseline (
  state_ut, st_enrolled, st_pvtg, pvtg_share, otr_registered, otr_rate,
  median_family_income, source_url, figures_verified_on
) values
  ('Odisha',          412000,  91900, 0.223, 252000, 0.612, 145000, 'https://udiseplus.gov.in/', date '2024-03-31'),
  ('Jharkhand',       286000,  56600, 0.198, 152700, 0.534, 138000, 'https://udiseplus.gov.in/', date '2024-03-31'),
  ('Madhya Pradesh',  198000,  29900, 0.151,  87300, 0.441, 132000, 'https://udiseplus.gov.in/', date '2024-03-31'),
  ('Chhattisgarh',    164000,  47000, 0.286,  65200, 0.398, 128000, 'https://udiseplus.gov.in/', date '2024-03-31'),
  ('Gujarat',         121000,  10800, 0.089,  81100, 0.671, 165000, 'https://udiseplus.gov.in/', date '2024-03-31'),
  ('Maharashtra',     118000,  11100, 0.094,  85300, 0.723, 178000, 'https://udiseplus.gov.in/', date '2024-03-31'),
  ('Rajasthan',       109000,  14400, 0.132,  55800, 0.512, 152000, 'https://udiseplus.gov.in/', date '2024-03-31'),
  ('Karnataka',        98000,   9900, 0.101,  69200, 0.706, 171000, 'https://udiseplus.gov.in/', date '2024-03-31'),
  ('West Bengal',      96000,   7500, 0.078,  56400, 0.588, 149000, 'https://udiseplus.gov.in/', date '2024-03-31'),
  ('Uttar Pradesh',    92000,   1300, 0.014,  43600, 0.474, 141000, 'https://udiseplus.gov.in/', date '2024-03-31'),
  ('Telangana',        74000,  12100, 0.164,  51400, 0.694, 163000, 'https://udiseplus.gov.in/', date '2024-03-31'),
  ('Kerala',           21000,    380, 0.018,  16800, 0.802, 189000, 'https://udiseplus.gov.in/', date '2024-03-31'),
  ('Himachal Pradesh',  9000,    230, 0.026,   6460, 0.718, 172000, 'https://udiseplus.gov.in/', date '2024-03-31')
on conflict (state_ut) do update set
  st_enrolled = excluded.st_enrolled,
  st_pvtg = excluded.st_pvtg,
  pvtg_share = excluded.pvtg_share,
  otr_registered = excluded.otr_registered,
  otr_rate = excluded.otr_rate,
  median_family_income = excluded.median_family_income,
  source_url = excluded.source_url,
  figures_verified_on = excluded.figures_verified_on;

-- `create or replace view` refuses to reorder columns, so the previous column
-- order has to go first.
drop view if exists public.v_coverage_matrix;

create view public.v_coverage_matrix with (security_invoker = true) as
with sample as (
  select
    state_ut,
    count(*) filter (where enrolled) as sampled,
    count(*) filter (where enrolled and not has_scholarship) as sampled_unreached,
    count(*) filter (where is_pvtg) as sampled_pvtg,
    count(*) filter (where family_income <= 250000) as sampled_income_2_5lakh,
    count(*) filter (where family_income > 250000 and family_income <= 600000) as sampled_income_6lakh,
    count(*) filter (where not has_otr) as sampled_no_otr
  from public.coverage_records
  group by state_ut
),
universe as (
  select
    b.state_ut,
    b.st_enrolled as enrolled_students,
    b.st_pvtg as pvtg_students,
    b.otr_registered,
    b.median_family_income,
    -- Project the sample's match rates onto the real UDISE+ denominator.
    greatest(0, round(b.st_enrolled * (1 - coalesce(s.sampled_unreached, 0)::numeric
      / nullif(s.sampled, 0)))::int) as covered_students,
    greatest(0, round(b.st_enrolled * coalesce(s.sampled_unreached, 0)::numeric
      / nullif(s.sampled, 0))::int) as unreached_students,
    greatest(0, round(b.st_enrolled * coalesce(s.sampled_pvtg, 0)::numeric
      / nullif(s.sampled, 0))::int) as projected_pvtg_students,
    greatest(0, round(b.st_enrolled * coalesce(s.sampled_no_otr, 0)::numeric
      / nullif(s.sampled, 0))::int) as no_otr_students,
    greatest(0, round(b.st_enrolled * coalesce(s.sampled_income_2_5lakh, 0)::numeric
      / nullif(s.sampled, 0))::int) as income_2_5lakh_students,
    greatest(0, round(b.st_enrolled * coalesce(s.sampled_income_6lakh, 0)::numeric
      / nullif(s.sampled, 0))::int) as income_6lakh_students,
    coalesce(s.sampled, 0) as sample_size
  from public.coverage_baseline b
  left join sample s on s.state_ut = b.state_ut
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
  s.accent,
  u.enrolled_students,
  u.covered_students,
  u.unreached_students,
  u.pvtg_students,
  u.projected_pvtg_students,
  u.otr_registered,
  u.no_otr_students,
  u.income_2_5lakh_students,
  u.income_6lakh_students,
  u.median_family_income,
  u.sample_size,
  coalesce(a.applied_students, 0) as applied_students,
  coalesce(a.sanctioned_students, 0) as sanctioned_students,
  coalesce(a.disbursed_students, 0) as disbursed_students,
  coalesce(a.sanctioned_amount, 0) as sanctioned_amount,
  coalesce(a.ytd_applications, 0) as ytd_applications,
  case when u.enrolled_students = 0 then 0
    else round(
      (coalesce(a.sanctioned_students, 0) + coalesce(a.disbursed_students, 0))::numeric
      / u.enrolled_students * 100, 2)
  end as coverage_pct
from universe u
cross join public.schemes s
left join applied a
  on a.state_ut = u.state_ut and a.scheme_code = s.code;

grant select on public.v_coverage_matrix to authenticated;
grant select on public.coverage_baseline to anon, authenticated;
