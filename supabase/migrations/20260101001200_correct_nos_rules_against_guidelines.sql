-- Correct the NOS rules against the scheme's own guidelines.
--
-- Verified 2026-09-27 against:
--   * https://tribal.nic.in/ScholarshiP.aspx            (portal, landing page)
--   * .../downloads/guidelines/NOS/RevisedGuidelinesNOS07102022.pdf  (authority)
--
-- Two defects are fixed here.
--
-- 1. `qs_top_1000` was a 'blocker'. It is not an eligibility bar. The
--    guidelines say the marks criterion "will not apply to those candidates
--    who have already obtained admissions in top 1,000 Institutes as QS World
--    ranking", and "First priority will be given to the candidates ... The
--    merit list will be drawn based on the ranking of the Institute." So a
--    candidate below the top 1000 is eligible and merely ranked lower. As a
--    blocker it denied a real student a real benefit.
--
-- 2. The age limits and the QS provision were cited to the portal page, which
--    contains neither. They come from the guidelines PDF, so the citation now
--    points at the document that actually states them.
--
-- The reference date is also corrected: the guidelines measure age "as on 1st
-- July of selection year", not on the day the student applies.
--
-- Two conditions that were missing entirely are added: the 55% marks test
-- (waived for a top 1000 admittee) and the one-child-in-a-family rule.

-- ---------- 1. QS top 1000 is a merit priority, not a gate ----------
update public.scheme_rules
   set severity  = 'info',
       label_en  = 'Admission to a QS top 1000 institute waives the 55% marks test and takes first priority in the merit list',
       label_hi  = 'QS टॉप 1000 संस्थान में प्रवेश 55% अंक की शर्त से छूट देता है और मेरिट सूची में प्रथम प्राथमिकता देता है',
       source_url = 'https://tribal.nic.in/downloads/guidelines/NOS/RevisedGuidelinesNOS07102022.pdf'
 where scheme_code = 'nos' and rule_key = 'qs_top_1000';

-- ---------- 2. Age limits: correct source and reference date ----------
update public.scheme_rules
   set params    = jsonb_set(params, '{asOn}', '"2026-07-01"'::jsonb),
       label_en  = 'Age limit: 32 for Masters, 35 for Ph.D, 38 for post-doctoral research, as on 1 July of the selection year',
       label_hi  = 'आयु सीमा: मासर 32 वर्ष, पीएचडी 35 वर्ष, पोस्ट-डॉक्टोरल 38 वर्ष, चयन वर्ष की 1 जुलाई को',
       source_url = 'https://tribal.nic.in/downloads/guidelines/NOS/RevisedGuidelinesNOS07102022.pdf'
 where scheme_code = 'nos' and rule_key = 'age_limit';

-- ---------- 3. Slot count, with the official ST / PVTG split ----------
update public.scheme_rules
   set label_en  = 'Only 20 awards are available every year across the country (17 for ST, 3 for PVTG)',
       label_hi  = 'प्रतिवर्ष देशभर में केवल 20 पुरस्कार उपलब्ध (17 अनुसूचित जनजाति, 3 विशेष पिछड़ी जनजाति)',
       source_url = 'https://tribal.nic.in/ScholarshiP.aspx'
 where scheme_code = 'nos' and rule_key = 'only_20_slots';

update public.scheme_rules
   set source_url = 'https://tribal.nic.in/ScholarshiP.aspx'
 where scheme_code = 'nos' and rule_key in ('income_6lakh', 'one_scheme_at_a_time');

-- ---------- 4. Conditions that were missing ----------
-- 'percentile' is the rule type used for conditions with no automated data
-- source; it degrades to a human review rather than silently passing.
insert into public.scheme_rules
  (scheme_code, rule_key, rule_type, params, severity, label_en, label_hi, source_url)
values
  ('nos', 'marks_55', 'percentile', '{"note":"55% marks or equivalent grade in the relevant degree"}', 'blocker',
   '55% marks or equivalent grade in the relevant Master''s / Bachelor''s degree',
   'संबंधित पाठ्यक्रम में 55% अंक या समतुल्य ग्रेड',
   'https://tribal.nic.in/downloads/guidelines/NOS/RevisedGuidelinesNOS07102022.pdf'),
  ('nos', 'one_child_in_family', 'single_scheme', '{}', 'blocker',
   'One child in a family, and one-time assistance only',
   'एक परिवार में एक ही बच्चा, और केवल एक बार सहायता',
   'https://tribal.nic.in/downloads/guidelines/NOS/RevisedGuidelinesNOS07102022.pdf')
on conflict (scheme_code, rule_key) do update
   set rule_type  = excluded.rule_type,
       params     = excluded.params,
       severity   = excluded.severity,
       label_en   = excluded.label_en,
       label_hi   = excluded.label_hi,
       source_url = excluded.source_url;

-- ---------- 5. Scheme-level corrections ----------
-- The eligibility summary repeated the false "must be a top 1000 QS university"
-- requirement. Corrected wording, plus the courses the page actually lists and
-- the two-year window to secure a foreign admission.
update public.schemes
   set eligibility_summary =
         'ST student whose family income from all sources does not exceed Rs. 6.00 lakh per annum, '
         'seeking admission to a foreign university for Post Graduation, Ph.D or post-doctoral research, '
         'with 55% marks (or equivalent grade) in the relevant degree. Age limit: 32 for Masters, 35 for '
         'Ph.D and 38 for post-doctoral research, as on 1 July of the selection year. A candidate already '
         'admitted to a QS top 1000 institute is exempt from the 55% marks test and is given first '
         'priority in the merit list - a lower-ranked institute does not make a candidate ineligible. '
         'Two years are given to secure admission to a foreign university after selection on the merit list.',
       source_url = 'https://tribal.nic.in/ScholarshiP.aspx',
       figures_verified_on = date '2026-09-27'
 where code = 'nos';
