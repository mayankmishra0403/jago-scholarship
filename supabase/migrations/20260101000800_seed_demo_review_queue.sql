-- 20260101000800_seed_demo_review_queue.sql
--
-- Gives the reviewer console a queue to render.
--
-- Before this, a staff session signed in to an empty review_tasks table, which on
-- screen is indistinguishable from a broken app. The point of a reviewer console is
-- the reviewer workflow, so it needs data to demonstrate.
--
-- Every row below is derived from the demo application's own state in
-- 20260101000500_seed_demo_student.sql. Nothing new is invented:
--   * the blocking_issues on that application are "income certificate expired" and
--     "name mismatch on the ST certificate",
--   * the connectors report exactly these five outcomes,
--   * the two open tasks are the two issues that genuinely need a human.
--
-- On replication: this is seeded demo data, so it is written idempotently
-- (ON CONFLICT DO NOTHING) rather than assumed empty. Run against a fresh project and
-- it populates; run twice and it is a no-op.

-- ---------------------------------------------------------------------------
-- The verification run
-- ---------------------------------------------------------------------------
insert into public.verification_runs (
  id, application_id, student_id, subject_id, subject_type,
  scheme_code, trigger, connectors, outcome, overall,
  stats, duration_ms, connector_latency_ms, engine_version,
  started_at, finished_at
) values (
  'd3e0a002-0000-4000-8000-000000000001',
  'd3e0a001-0000-4000-8000-000000000002',  -- the demo application
  'd3e0a001-0000-4000-8000-000000000001',  -- the demo student
  'd3e0a001-0000-4000-8000-000000000002',
  'application',
  'pre_matric',
  'application_submit',
  -- jsonb, not text[]: to_jsonb() over the array literal is what keeps this a JSON
  -- array rather than a Postgres array, which would not cast implicitly.
  to_jsonb(array['udise_plus', 'aishe', 'edistrict', 'nsp_otr', 'pfms']),
  'complete',
  'manual_review',
  jsonb_build_object(
    'total', 5,
    'expired', 1,
    'skipped', 1,
    'mismatch', 1,
    'verified', 2,
    'unavailable', 0
  ),
  3850,
  jsonb_build_object(
    'udise_plus', 412,
    'aishe', 288,
    'edistrict', 901,
    'nsp_otr', 1544,
    'pfms', 703
  ),
  '0.9.0-sih',
  now() - interval '2 days',
  now() - interval '2 days' + interval '3.85 seconds'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The five checks
--
-- outcome is deliberately not uniform. A queue where everything is green teaches a
-- reviewer nothing; the mix below is what the demo persona's own record implies:
-- one expired certificate (blocker), one transliteration mismatch that only a human
-- can settle (warning), one clean institution check, one connector that timed out,
-- and one check that could not run at all because there is no UIDAI agreement.
--
-- The last two are the important ones. A skipped check is not a pass, and an
-- unavailable one is not a rejection: encoding that in the seeded data is the whole
-- point of "an outage is not a pass".
-- ---------------------------------------------------------------------------
insert into public.verification_checks (
  id, run_id, application_id, student_id, check_key, connector, doc_type,
  outcome, severity, confidence, auto_resolvable,
  label_en, label_hi, message_en, message_hi, remedy_en, remedy_hi,
  claimed, source_value, evidence_url
) values
(
  'd3e0a003-0000-4000-8000-000000000001',
  'd3e0a002-0000-4000-8000-000000000001',
  'd3e0a001-0000-4000-8000-000000000002',
  'd3e0a001-0000-4000-8000-000000000001',
  'income_ceiling', 'edistrict', 'income_certificate',
  'expired', 'blocker', 0.97, false,
  'Annual family income against the scheme ceiling',
  'वार्षिक परिवार आय सीमा के अनुसार',
  'The income certificate expired on 31 August 2025, so it can no longer be used to certify the declared income.',
  'आय प्रमाण पत्र 31 अगस्त 2025 को समाप्त हो गया, इसलिए इसे घोषित आय प्रमाणित करने के लिए उपयोग नहीं किया जा सकता।',
  'Ask the student for a fresh certificate from the block office, then re-check.',
  'विद्यार्थी से ब्लॉक कार्यालय से नवीन प्रमाण पत्र मंगवाएँ, फिर जाँच दोबारा करें।',
  jsonb_build_object('issued', '2024-02-11', 'certificate', 'Odisha BPL 2024', 'annual_income', 180000),
  jsonb_build_object('certificate', 'Odisha BPL 2024', 'valid_until', '2025-08-31', 'annual_income', 180000),
  'https://edistrict.odisha.gov.in/certificate/income'
),
(
  'd3e0a003-0000-4000-8000-000000000002',
  'd3e0a002-0000-4000-8000-000000000001',
  'd3e0a001-0000-4000-8000-000000000002',
  'd3e0a001-0000-4000-8000-000000000001',
  'st_certificate_name', 'edistrict', 'st_certificate',
  'mismatch', 'warning', 0.91, false,
  'Name on the ST certificate against the school record',
  'अनुसूचित जनजाति प्रमाण पत्र पर नाम बनाम स्कूल रिकॉर्ड',
  'The ST certificate reads "Suriya Hansdah" while the school record says "Suriya Hansda". Transliteration between Santali, Hindi and Odia scripts varies, so this is a reviewer confirmation rather than a rejection.',
  'अनुसूचित जनजाति प्रमाण पत्र में "Suriya Hansdah" है जबकि स्कूल रिकॉर्ड में "Suriya Hansda" है। संताली, हिंदी और ओडिया लिपियों के बीच लिप्यंतरण बदलता है, इसलिए यह अस्वीकार नहीं बल्कि समीक्षक की पुष्टि है।',
  'Confirm the name against the original certificate and record the decision.',
  'मूल प्रमाण पत्र से नाम की पुष्टि करें और निर्णय दर्ज करें।',
  jsonb_build_object('name', 'Suriya Hansda', 'category', 'ST', 'certificate', 'ST Odisha 2023'),
  jsonb_build_object('name', 'Suriya Hansdah', 'category', 'ST', 'certificate', 'ST Odisha 2023'),
  'https://edistrict.odisha.gov.in/certificate/st'
),
(
  'd3e0a003-0000-4000-8000-000000000003',
  'd3e0a002-0000-4000-8000-000000000001',
  'd3e0a001-0000-4000-8000-000000000002',
  'd3e0a001-0000-4000-8000-000000000001',
  'institution_udise', 'udise_plus', null,
  'verified', 'info', 0.99, true,
  'Institution on UDISE+ against the application',
  'आवेदन बनाम UDISE+ पर संस्थान',
  'The institution is active on UDISE+ and the code matches the application.',
  'संस्थान UDISE+ पर सक्रिय है और कोड आवेदन से मेल खाता है।',
  'No action needed.',
  'कोई कार्रवाई आवश्यक नहीं।',
  jsonb_build_object('name', 'Biju Patnaik Government High School, Rairakhol', 'udise', '21081900123'),
  jsonb_build_object('name', 'Biju Patnaik GHS Rairakhol', 'udise', '21081900123', 'status', 'active'),
  'https://udiseplus.gov.in/institution/21081900123'
),
(
  'd3e0a003-0000-4000-8000-000000000004',
  'd3e0a002-0000-4000-8000-000000000001',
  'd3e0a001-0000-4000-8000-000000000002',
  'd3e0a001-0000-4000-8000-000000000001',
  'nsp_duplicate_otr', 'nsp_otr', null,
  'skipped', 'warning', 0.0, true,
  'Duplicate OTR check on the National Scholarship Portal',
  'राष्ट्रीय छात्रवृत्ति पोर्टल पर डुप्लिकेट OTR जाँच',
  'The National Scholarship Portal did not respond, so duplicate detection was skipped. A skipped check is not a pass: another portal may already hold an application for this student.',
  'राष्ट्रीय छात्रवृत्ति पोर्टल ने प्रतिक्रिया नहीं दी, इसलिए डुप्लिकेट जाँच छोड़ दी गई। छोड़ी गई जाँच स्वीकृति नहीं है: हो सकता है कि दूसरे पोर्टल पर इस विद्यार्थी का आवेदन पहले से मौजूद हो।',
  'Retry the check, or ask the student for their OTR number directly.',
  'जाँच दोबारा करें, या विद्यार्थी से उनका OTR क्रमांक सीधे लें।',
  jsonb_build_object('otr', 'NOT_SUBMITTED'),
  jsonb_build_object('error', 'portal timeout after 3 attempts', 'retryable', true),
  null
),
(
  'd3e0a003-0000-4000-8000-000000000005',
  'd3e0a002-0000-4000-8000-000000000001',
  'd3e0a001-0000-4000-8000-000000000002',
  'd3e0a001-0000-4000-8000-000000000001',
  'aadhaar_name', 'uidai_gateway', 'aadhaar',
  'unavailable', 'info', 0.0, true,
  'Name on the Aadhaar record against the wallet',
  'आधार रिकॉर्ड पर नाम बनाम वॉलेट',
  'Aadhaar verification needs a registered UIDAI gateway partner, which this build does not have. Until it does, the name on the ST certificate is the only spelling evidence available.',
  'आधार सत्यापन के लिए पंजीकृत UIDAI गेटवेय भागीदार चाहिए, जो इस बिल्ड के पास नहीं है। जब तक नहीं मिलता, अनुसूचित जनजाति प्रमाण पत्र का नाम ही उपलब्ध वर्तनी प्रमाण है।',
  'Enable the identity verification screen once gateway credentials exist.',
  'गेटवेय क्रेडेंशियल मिलने पर पहचान सत्यापन स्क्रीन चालू करें।',
  jsonb_build_object('name', 'SURYA HANSDA', 'last4', '0012'),
  jsonb_build_object('reason', 'no gateway agreement', 'status', 'not_performed'),
  null
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The two open tasks
--
-- Only the two checks that genuinely need a human become tasks. The UDISE+ match and
-- the unavailable Aadhaar check do not, because auto_resolvable is true for them and
-- a queue padded with "no action needed" items is how a reviewer stops reading it.
--
-- sla_due is relative to now() so the demo never shows a queue that is uniformly
-- within SLA: one item is deliberately overdue, which is the state a reviewer
-- actually has to triage.
-- ---------------------------------------------------------------------------
insert into public.review_tasks (
  id, application_id, student_id, check_id, reason, status, priority, sla_due
) values
(
  'd3e0a004-0000-4000-8000-000000000001',
  'd3e0a001-0000-4000-8000-000000000002',
  'd3e0a001-0000-4000-8000-000000000001',
  'd3e0a003-0000-4000-8000-000000000001',
  'Income certificate expired on 31 August 2025. A fresh certificate is needed before this application can move past manual review.',
  'open',
  'high',
  now() - interval '1 day'
),
(
  'd3e0a004-0000-4000-8000-000000000002',
  'd3e0a001-0000-4000-8000-000000000002',
  'd3e0a001-0000-4000-8000-000000000001',
  'd3e0a003-0000-4000-8000-000000000002',
  'ST certificate reads "Suriya Hansdah", the school record reads "Suriya Hansda". Needs a human to confirm the spelling against the original.',
  'open',
  'normal',
  now() + interval '5 days'
)
on conflict (id) do nothing;
