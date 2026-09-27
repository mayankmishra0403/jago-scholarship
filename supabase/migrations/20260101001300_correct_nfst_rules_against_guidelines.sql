-- Correct the NFST / National Scholarship rules against the scheme guidelines.
--
-- Verified 2026-09-27 against the complete MoTA-hosted document:
--   .../downloads/guidelines/NFS/GuidelinesFellowshipandScholarship2022.pdf
--   "National Fellowship & Scholarship for Higher Education of Scheduled Tribe
--    Students [Central Sector Scheme] 2021-22 to 2025-26"
--
-- Citation defect: the rules cited the scholarships.gov.in mirror of this same
-- document. The mirror is a partial extract that begins at section 5.4, so it
-- contains no eligibility section, no age limit and no marks criterion. Every
-- citation now points at the complete copy, because a reviewer following the
-- link to confirm a rule must actually find the rule there.
--
-- Two blockers that were missing entirely are added, from sections 2.1 and 2.3:
--   2.1 (ii) "minimum 55% marks at the final examination/grading at PG level"
--   2.3     "Maximum 36 years, as on first day of July of the relevant year of
--            award of scholarship"
--
-- `flat` is used for the age limit because NFST states one figure for every
-- course, unlike NOS which bands 32/35/38 by level. Both schemes measure age on
-- 1 July, not on the day of applying, so both carry an `asOn` reference date.

-- ---------- 1. Point every citation at the complete document ----------
update public.scheme_rules
   set source_url = 'https://tribal.nic.in/downloads/guidelines/NFS/GuidelinesFellowshipandScholarship2022.pdf'
 where source_url in (
         'https://scholarships.gov.in/public/schemeGuidelines/tribalfellowshipguideline.pdf',
         'https://www.ugc.gov.in/pdfnews/0242709_Revised-guidelines-of-NFSTS.pdf'
       );

update public.schemes
   set source_url = 'https://tribal.nic.in/downloads/guidelines/NFS/GuidelinesFellowshipandScholarship2022.pdf'
 where source_url = 'https://scholarships.gov.in/public/schemeGuidelines/tribalfellowshipguideline.pdf';

-- ---------- 2. Add the two missing blockers ----------
-- 'percentile' is the rule type for conditions with no automated data source;
-- it degrades to a human review rather than silently passing.
insert into public.scheme_rules
  (scheme_code, rule_key, rule_type, params, severity, label_en, label_hi, source_url)
values
  ('nfst', 'age_limit_36', 'age_limit', '{"flat":36,"asOn":"2026-07-01"}', 'blocker',
   'Age must not exceed 36 years as on 1 July of the year of award',
   'आयु पुरस्कार वर्ष की 1 जुलाई को 36 वर्ष से अधिक नहीं होनी चाहिए',
   'https://tribal.nic.in/downloads/guidelines/NFS/GuidelinesFellowshipandScholarship2022.pdf'),
  ('nfst', 'marks_55_pg', 'percentile', '{"note":"Minimum 55% marks at the final examination at PG level"}', 'blocker',
   'Minimum 55% marks at the final examination at Post-Graduation level',
   'स्नातकोत्तर स्तर की अंतिम परीक्षा में न्यूनतम 55% अंक',
   'https://tribal.nic.in/downloads/guidelines/NFS/GuidelinesFellowshipandScholarship2022.pdf')
on conflict (scheme_code, rule_key) do update
   set rule_type  = excluded.rule_type,
       params     = excluded.params,
       severity   = excluded.severity,
       label_en   = excluded.label_en,
       label_hi   = excluded.label_hi,
       source_url = excluded.source_url;

-- ---------- 3. Scheme-level corrections ----------
-- The priority order was wrong. Section 2.5 (ii) allocates the 750 slots as
-- Divyangjan 38 (5%), PVTG 25, Female 225 (30%), ST Others 462. The previous
-- text read "PVTG first, then female candidates, then BPL, then inter-se merit"
-- which dropped Divyangjan - the highest priority group - entirely and named
-- BPL, a category that appears nowhere in the guidelines. Note 1 also gives
-- priority to candidates holding an IIT / AIIMS / IIM / IISER offer, reducing
-- the ST-Others quota proportionately.
--
-- Section 2.2 confirms there is no income criterion, so income_ceiling stays
-- null; encoding one would exclude exactly the students the scheme targets.
update public.schemes
   set benefit = jsonb_set(
         benefit,
         '{priorityOrder}',
         '"Divyangjan (38) -> PVTG (25) -> Female (225) -> ST Others (462), of 750 slots; an offer from an IIT / AIIMS / IIM / IISER takes priority and reduces the ST-Others quota"'::jsonb),
       eligibility_summary =
         'ST student who has passed the Post-Graduation examination with at least 55% marks and is admitted to a '
         'regular, full-time M.Phil / Ph.D (or M.Phil + Ph.D) in a UGC-entitled or Government-funded institution. '
         'Maximum age 36 years as on 1 July of the year of award. There is no income criterion for this fellowship. '
         '750 fellowships are awarded each year with no State or University-wise ceiling, allocated Divyangjan (38), '
         'PVTG (25), Female (225) and ST Others (462); a Divyangjan candidate must produce a disability certificate '
         'of at least 40%. Fellowship runs for 2 years for M.Phil and 5 years for Ph.D, or until submission of the '
         'dissertation, whichever is earlier. Not eligible for any other fellowship of the Union or a State '
         'Government for the same study.',
       figures_verified_on = date '2026-09-27'
 where code = 'nfst';
