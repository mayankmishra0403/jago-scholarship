/**
 * Scheme catalogue + eligibility rules, mirrored from the Supabase seed so the
 * app runs fully offline in the demo. The DB remains the source of truth at
 * runtime; `sync:shared` regenerates this file from `supabase/migrations`.
 */

import type { DocumentRequirement, Institution, Scheme, SchemeRule } from './types.ts'

export const SCHEMES: Scheme[] = [
  {
    code: 'pre_matric',
    name: 'Pre-Matric Scholarship for ST Students',
    shortName: 'Pre-Matric',
    portal: 'NSP',
    portalUrl: 'https://scholarships.gov.in',
    level: 'Secondary · Class IX–X',
    isCentralSector: false,
    fundingPattern: 'Centrally Sponsored: 75:25 (90:10 NE/Hill states, 100:0 UTs without legislature)',
    incomeCeiling: 250000,
    slotsPerYear: null,
    benefit: {
      dayScholarPerMonth: '₹225',
      hostellerPerMonth: '₹525',
      monthsPerYear: '10',
      note: 'Ten months per academic year, paid via PFMS-DBT into an Aadhaar-seeded account.',
    },
    eligibilitySummary:
      'Student must be studying in Class IX or X and parental income from all sources must not exceed Rs. 2.50 lakh per annum.',
    documentRequirements: [
      { docType: 'st_certificate', label: 'ST / PVTG certificate', mandatory: true, reusable: true, autoFetchFrom: 'edistrict' },
      { docType: 'income_certificate', label: 'Income certificate', mandatory: true, autoFetchFrom: 'edistrict' },
      { docType: 'domicile', label: 'Domicile certificate', mandatory: true, autoFetchFrom: 'edistrict' },
      { docType: 'aadhaar', label: 'Aadhaar', mandatory: true, autoFetchFrom: 'uidai' },
      { docType: 'institution_bonafide', label: 'Institution bonafide', mandatory: true },
      { docType: 'bank_passbook', label: 'Bank passbook (Aadhaar seeded)', mandatory: true, autoFetchFrom: 'uidai' },
    ] as DocumentRequirement[],
    deadlineFresh: '2026-11-30',
    deadlineRenewal: '2027-02-28',
    sourceUrl: 'https://tribal.nic.in/Scholarship.aspx',
    figuresVerifiedOn: '2026-09-26',
    accent: '#0F766E',
    sortOrder: 1,
  },
  {
    code: 'post_matric',
    name: 'Post-Matric Scholarship for ST Students',
    shortName: 'Post-Matric',
    portal: 'NSP',
    portalUrl: 'https://scholarships.gov.in',
    level: 'Senior Secondary & above · Class XI+',
    isCentralSector: false,
    fundingPattern: 'Centrally Sponsored: 75:25 (90:10 NE/Hill states, 100:0 UTs without legislature)',
    incomeCeiling: 250000,
    slotsPerYear: null,
    benefit: {
      tuitionFee: 'Full non-refundable fees reimbursed',
      maintenanceAllowance: 'As per group / stream notified by the State',
      note: 'Two components: fee reimbursement + maintenance allowance.',
    },
    eligibilitySummary:
      'Student must be pursuing a recognised course after Class X and parental income from all sources must not exceed Rs. 2.50 lakh per annum.',
    documentRequirements: [
      { docType: 'st_certificate', label: 'ST / PVTG certificate', mandatory: true, reusable: true, autoFetchFrom: 'edistrict' },
      { docType: 'income_certificate', label: 'Income certificate', mandatory: true, autoFetchFrom: 'edistrict' },
      { docType: 'domicile', label: 'Domicile certificate', mandatory: true, autoFetchFrom: 'edistrict' },
      { docType: 'aadhaar', label: 'Aadhaar', mandatory: true, autoFetchFrom: 'uidai' },
      { docType: 'marksheet', label: 'Previous marksheet', mandatory: true },
      { docType: 'institution_bonafide', label: 'Institution bonafide', mandatory: true },
      { docType: 'bank_passbook', label: 'Bank passbook (Aadhaar seeded)', mandatory: true, autoFetchFrom: 'uidai' },
    ] as DocumentRequirement[],
    deadlineFresh: '2026-11-30',
    deadlineRenewal: '2027-02-28',
    sourceUrl: 'https://tribal.nic.in/Scholarship.aspx',
    figuresVerifiedOn: '2026-09-26',
    accent: '#1D4ED8',
    sortOrder: 2,
  },
  {
    code: 'top_class',
    name: 'National Scholarship for Higher Education of ST Students (Top Class)',
    shortName: 'Top Class',
    portal: 'NSP',
    portalUrl: 'https://tribal.nic.in/Scholarship.aspx',
    level: 'Graduation & Post-Graduation · notified institutes',
    isCentralSector: true,
    fundingPattern: '100% Central funding',
    incomeCeiling: 600000,
    slotsPerYear: 1000,
    benefit: {
      tuitionFeeCeiling: '₹2,50,000 per year',
      booksAndStationeryPerYear: '₹5,000',
      stipendPerMonth: '₹3,000',
      computerOneTime: '₹45,000',
      paymentSplit:
        'Component I (stipend, books, computer, non-refundable fees) to student via PFMS-DBT; Component II (tuition + admission fee) to the Institute via PFMS.',
      privateInstituteCeilingPerYear: '₹2,50,000',
    },
    eligibilitySummary:
      'Meritorious ST student admitted to a full-time notified Top Class Institute; family income from all sources must not exceed Rs. 6.00 lakh per annum. Scholarship continues for the full course duration.',
    documentRequirements: [
      { docType: 'st_certificate', label: 'ST / PVTG certificate', mandatory: true, reusable: true, autoFetchFrom: 'edistrict' },
      { docType: 'income_certificate', label: 'Income certificate', mandatory: true, autoFetchFrom: 'edistrict' },
      { docType: 'aadhaar', label: 'Aadhaar', mandatory: true, autoFetchFrom: 'uidai' },
      { docType: 'marksheet', label: 'Class XII marksheet', mandatory: true },
      { docType: 'institution_bonafide', label: 'Institute admission letter', mandatory: true },
      { docType: 'bank_passbook', label: 'Bank passbook (Aadhaar seeded)', mandatory: true, autoFetchFrom: 'uidai' },
    ] as DocumentRequirement[],
    deadlineFresh: '2026-10-31',
    deadlineRenewal: '2027-01-31',
    sourceUrl: 'https://scholarships.gov.in/public/schemeGuidelines/tribalfellowshipguideline.pdf',
    figuresVerifiedOn: '2026-09-26',
    accent: '#7C3AED',
    sortOrder: 3,
  },
  {
    code: 'nfst',
    name: 'National Fellowship for Higher Education of ST Students (NFST)',
    shortName: 'NFST Fellowship',
    portal: 'SFMP',
    portalUrl: 'https://scholarship.canarabank.in',
    level: 'M.Phil / M.Phil+Ph.D / Ph.D · research fellowship',
    isCentralSector: true,
    fundingPattern: '100% Central funding',
    incomeCeiling: null,
    slotsPerYear: 750,
    benefit: {
      mPhilStipendPerMonth: '₹31,000',
      phdStipendPerMonthFirstTwoYears: '₹31,000',
      phdStipendPerMonthRemaining: '₹35,000',
      contingencyHumanitiesSocialSciences: '₹10,000',
      contingencyScienceEngineeringTechnology: '₹12,000',
      contingencyPhdHumanitiesSocialSciences: '₹20,500',
      contingencyPhdScienceEngineeringTechnology: '₹25,000',
      hra: 'At par with UGC rates (8% / 16% / 24% by city)',
      escortAllowance: '₹2,000 (Divyangjan candidates)',
      disbursal: 'Quarterly through PFMS-DBT into the scholar Aadhaar-seeded bank account',
      priorityOrder: 'PVTG first, then female candidates, then BPL, then inter-se merit',
    },
    eligibilitySummary:
      'ST student who has passed the Post-Graduation examination and is admitted to a regular, full-time M.Phil / Ph.D in a UGC-entitled or Government-funded institution. Not eligible for any other fellowship for the same study. No State or University-wise ceiling.',
    documentRequirements: [
      { docType: 'st_certificate', label: 'ST / PVTG certificate', mandatory: true, reusable: true, autoFetchFrom: 'edistrict' },
      { docType: 'aadhaar', label: 'Aadhaar', mandatory: true, autoFetchFrom: 'uidai' },
      { docType: 'marksheet', label: 'Post-graduation marksheet', mandatory: true },
      { docType: 'institution_bonafide', label: 'Institute / guide confirmation', mandatory: true },
      { docType: 'bank_passbook', label: 'Bank passbook (Aadhaar seeded)', mandatory: true, autoFetchFrom: 'uidai' },
      { docType: 'net_jrf', label: 'NET / JRF (if claimed)', mandatory: false, autoFetchFrom: 'ugc_nta' },
    ] as DocumentRequirement[],
    deadlineFresh: '2026-10-31',
    deadlineRenewal: '2027-01-31',
    sourceUrl: 'https://scholarships.gov.in/public/schemeGuidelines/tribalfellowshipguideline.pdf',
    figuresVerifiedOn: '2026-09-26',
    accent: '#B45309',
    sortOrder: 4,
  },
  {
    code: 'nos',
    name: 'National Overseas Scholarship for ST Students',
    shortName: 'NOS (Overseas)',
    portal: 'NOS',
    portalUrl: 'https://nos.mota.gov.in',
    level: 'Studies abroad · top 1000 QS-ranked universities',
    isCentralSector: true,
    fundingPattern: '100% Central funding',
    incomeCeiling: 600000,
    slotsPerYear: 20,
    benefit: {
      slotsPerYear: '20',
      ageLimit: '32 (Masters) · 35 (Ph.D) · 38 (post-doctoral research)',
      universityCriterion: 'Top 1000 universities as per latest QS World University Rankings',
      covers: 'Tuition, travel, living allowance and contingency as per MoTA NOS guidelines',
    },
    eligibilitySummary:
      "ST student whose family income does not exceed Rs. 6.00 lakh per annum, seeking admission to a top 1000 QS-ranked university abroad. Age limit: 32 for Masters, 35 for Ph.D and 38 for post-doctoral research.",
    documentRequirements: [
      { docType: 'st_certificate', label: 'ST / PVTG certificate', mandatory: true, reusable: true, autoFetchFrom: 'edistrict' },
      { docType: 'income_certificate', label: 'Income certificate', mandatory: true, autoFetchFrom: 'edistrict' },
      { docType: 'aadhaar', label: 'Aadhaar', mandatory: true, autoFetchFrom: 'uidai' },
      { docType: 'marksheet', label: 'Academic transcripts', mandatory: true },
      { docType: 'passport', label: 'Valid passport', mandatory: true },
      { docType: 'nos_offer_letter', label: 'University offer letter', mandatory: true },
      { docType: 'nos_qs_proof', label: 'QS ranking evidence', mandatory: true, autoFetchFrom: 'qs' },
      { docType: 'bank_passbook', label: 'Bank passbook', mandatory: true, autoFetchFrom: 'uidai' },
    ] as DocumentRequirement[],
    deadlineFresh: '2026-09-30',
    deadlineRenewal: null,
    sourceUrl: 'https://tribal.nic.in/Scholarship.aspx',
    figuresVerifiedOn: '2026-09-26',
    accent: '#BE123C',
    sortOrder: 5,
  },
]

export const RULES: SchemeRule[] = [
  // Pre-Matric
  { schemeCode: 'pre_matric', ruleKey: 'income_2_5lakh', ruleType: 'income_ceiling', params: { maxAnnual: 250000 }, severity: 'blocker', labelEn: 'Family income must not exceed Rs. 2.50 lakh per annum', labelHi: 'पारिवारिक आय वार्षिक Rs. 2.50 लाख से अधिक नहीं होनी चाहिए', sourceUrl: 'https://tribal.nic.in/Scholarship.aspx' },
  { schemeCode: 'pre_matric', ruleKey: 'class_ix_x', ruleType: 'class_level', params: { min: 'IX', max: 'X' }, severity: 'blocker', labelEn: 'Student must be in Class IX or X', labelHi: 'छात्र कक्षा IX या X में नियमित अध्ययन कर रहा हो', sourceUrl: 'https://tribal.nic.in/Scholarship.aspx' },
  { schemeCode: 'pre_matric', ruleKey: 'domicile_required', ruleType: 'domicile', params: {}, severity: 'blocker', labelEn: 'Domicile certificate of the State / UT is required', labelHi: 'आवासीय प्रमाण पत्र आवश्यक', sourceUrl: 'https://tribal.nic.in/Scholarship.aspx' },
  { schemeCode: 'pre_matric', ruleKey: 'one_scheme_at_a_time', ruleType: 'single_scheme', params: {}, severity: 'blocker', labelEn: 'A student may hold only one scholarship at a time', labelHi: 'एक समय में केवल एक छात्रवृत्ति', sourceUrl: 'https://tribal.nic.in/Scholarship.aspx' },
  { schemeCode: 'pre_matric', ruleKey: 'govt_school', ruleType: 'institution_type', params: { allow: ['school'] }, severity: 'warning', labelEn: 'Pre-Matric is administered through the school', labelHi: 'प्री-मैट्रिक विद्यालय के माध्यम से', sourceUrl: 'https://tribal.nic.in/Scholarship.aspx' },
  // Post-Matric
  { schemeCode: 'post_matric', ruleKey: 'income_2_5lakh', ruleType: 'income_ceiling', params: { maxAnnual: 250000 }, severity: 'blocker', labelEn: 'Family income must not exceed Rs. 2.50 lakh per annum', labelHi: 'पारिवारिक आय वार्षिक Rs. 2.50 लाख से अधिक नहीं होनी चाहिए', sourceUrl: 'https://tribal.nic.in/Scholarship.aspx' },
  { schemeCode: 'post_matric', ruleKey: 'class_xi_plus', ruleType: 'class_level', params: { min: 'XI' }, severity: 'blocker', labelEn: 'Student must be in Class XI or above', labelHi: 'छात्र कक्षा XI या उससे ऊपर', sourceUrl: 'https://tribal.nic.in/Scholarship.aspx' },
  { schemeCode: 'post_matric', ruleKey: 'domicile_required', ruleType: 'domicile', params: {}, severity: 'blocker', labelEn: 'Domicile certificate of the State / UT is required', labelHi: 'आवासीय प्रमाण पत्र आवश्यक', sourceUrl: 'https://tribal.nic.in/Scholarship.aspx' },
  { schemeCode: 'post_matric', ruleKey: 'one_scheme_at_a_time', ruleType: 'single_scheme', params: {}, severity: 'blocker', labelEn: 'A student may hold only one scholarship at a time', labelHi: 'एक समय में केवल एक छात्रवृत्ति', sourceUrl: 'https://tribal.nic.in/Scholarship.aspx' },
  // Top Class
  { schemeCode: 'top_class', ruleKey: 'income_6lakh', ruleType: 'income_ceiling', params: { maxAnnual: 600000 }, severity: 'blocker', labelEn: 'Family income must not exceed Rs. 6.00 lakh per annum', labelHi: 'पारिवारिक आय वार्षिक Rs. 6.00 लाख से अधिक नहीं होनी चाहिए', sourceUrl: 'https://scholarships.gov.in/public/schemeGuidelines/tribalfellowshipguideline.pdf' },
  { schemeCode: 'top_class', ruleKey: 'notified_institute', ruleType: 'institution_flag', params: { flag: 'is_top_class_institute' }, severity: 'blocker', labelEn: 'Admission must be in a Ministry-notified Top Class Institute', labelHi: 'मंत्रालय द्वारा अधिसूचित टॉप क्लास संस्थान में प्रवेश आवश्यक', sourceUrl: 'https://tribal.nic.in/Scholarship.aspx' },
  { schemeCode: 'top_class', ruleKey: 'graduation_level', ruleType: 'course_level', params: { allow: ['graduation', 'post_graduation'] }, severity: 'blocker', labelEn: 'Course must be Graduation or Post-Graduation', labelHi: 'पाठ्यक्रम स्नातक या स्नातकोत्तर होना चाहिए', sourceUrl: 'https://tribal.nic.in/Scholarship.aspx' },
  { schemeCode: 'top_class', ruleKey: 'one_scheme_at_a_time', ruleType: 'single_scheme', params: {}, severity: 'blocker', labelEn: 'A student may hold only one scholarship at a time', labelHi: 'एक समय में केवल एक छात्रवृत्ति', sourceUrl: 'https://tribal.nic.in/Scholarship.aspx' },
  // NFST
  { schemeCode: 'nfst', ruleKey: 'post_graduation_required', ruleType: 'course_level', params: { allow: ['m_phil', 'ph_d'] }, severity: 'blocker', labelEn: 'Must be admitted to a regular, full-time M.Phil / Ph.D after a Post-Graduation degree', labelHi: 'स्नातकोत्तर उपाधि के बाद नियमित पूर्णकालिक M.Phil / Ph.D में प्रवेश आवश्यक', sourceUrl: 'https://scholarships.gov.in/public/schemeGuidelines/tribalfellowshipguideline.pdf' },
  { schemeCode: 'nfst', ruleKey: 'ugc_entitled_institute', ruleType: 'institution_flag', params: { flag: 'is_nfst_host' }, severity: 'blocker', labelEn: 'Institute must be UGC-entitled, Government-funded or an Institute of National Importance', labelHi: 'संस्थान UGC-योग्य या सरकार द्वारा वित्तपोषित होना चाहिए', sourceUrl: 'https://scholarships.gov.in/public/schemeGuidelines/tribalfellowshipguideline.pdf' },
  { schemeCode: 'nfst', ruleKey: 'no_other_fellowship', ruleType: 'single_scheme', params: { scope: 'all' }, severity: 'blocker', labelEn: 'NFST scholars cannot hold any other fellowship for the same study', labelHi: 'NFST छात्र उसी अध्ययन हेतु अन्य छात्रवृत्ति नहीं ले सकता', sourceUrl: 'https://www.ugc.gov.in/pdfnews/0242709_Revised-guidelines-of-NFSTS.pdf' },
  { schemeCode: 'nfst', ruleKey: 'quarterly_review', ruleType: 'percentile', params: { note: 'Progressive quarterly review of research progress' }, severity: 'info', labelEn: 'Fellowship is released quarterly after progress review', labelHi: 'प्रगति की समीक्षा के बाद तिमाही जारी', sourceUrl: 'https://scholarships.gov.in/public/schemeGuidelines/tribalfellowshipguideline.pdf' },
  // NOS
  { schemeCode: 'nos', ruleKey: 'income_6lakh', ruleType: 'income_ceiling', params: { maxAnnual: 600000 }, severity: 'blocker', labelEn: 'Family income must not exceed Rs. 6.00 lakh per annum', labelHi: 'पारिवारिक आय वार्षिक Rs. 6.00 लाख से अधिक नहीं होनी चाहिए', sourceUrl: 'https://tribal.nic.in/Scholarship.aspx' },
  { schemeCode: 'nos', ruleKey: 'qs_top_1000', ruleType: 'qs_rank', params: { maxRank: 1000 }, severity: 'blocker', labelEn: 'University must rank within the top 1000 in the latest QS World University Rankings', labelHi: 'विश्वविद्यालय QS वर्ल्ड यूनिवर्सिटी रैंकिंग में टॉप 1000 में होना चाहिए', sourceUrl: 'https://tribal.nic.in/Scholarship.aspx' },
  { schemeCode: 'nos', ruleKey: 'age_limit', ruleType: 'age_limit', params: { masters: 32, phd: 35, postDoctoral: 38 }, severity: 'blocker', labelEn: 'Age limit: 32 for Masters, 35 for Ph.D, 38 for post-doctoral research', labelHi: 'आयु सीमा: मासर 32 वर्ष, पीएचडी 35 वर्ष, पोस्ट-डॉक्टोरल 38 वर्ष', sourceUrl: 'https://tribal.nic.in/Scholarship.aspx' },
  { schemeCode: 'nos', ruleKey: 'only_20_slots', ruleType: 'seats_limit', params: { slots: 20 }, severity: 'warning', labelEn: 'Only 20 awards are available every year across the country', labelHi: 'प्रतिवर्ष केवल 20 पुरस्कार उपलब्ध', sourceUrl: 'https://tribal.nic.in/Scholarship.aspx' },
  { schemeCode: 'nos', ruleKey: 'one_scheme_at_a_time', ruleType: 'single_scheme', params: {}, severity: 'warning', labelEn: 'Concurrent scholarships must be surrendered before joining NOS', labelHi: 'NOS में शामिल होने से पूर्व अन्य छात्रवृत्ति वापस करनी होगी', sourceUrl: 'https://tribal.nic.in/Scholarship.aspx' },
]

export const INSTITUTIONS: Institution[] = [
  { id: 'inst-1', name: 'Biju Patnaik Government High School, Rairakhol', type: 'school', stateUt: 'Odisha', district: 'Sambalpur', affiliation: 'government', udisePlus: '21240300101', aisheCode: null, aisheVerified: false, isTopClassInstitute: false, isNfstHost: false, nosEligible: false, qsRank: null, naacGrade: null },
  { id: 'inst-2', name: 'Kisan Science College, Bolangir', type: 'college', stateUt: 'Odisha', district: 'Balangir', affiliation: 'government', udisePlus: null, aisheCode: 'U-UNI-OD-1244', aisheVerified: true, isTopClassInstitute: true, isNfstHost: true, nosEligible: true, qsRank: null, naacGrade: 'A+' },
  { id: 'inst-3', name: 'Sambalpur University', type: 'university', stateUt: 'Odisha', district: 'Sambalpur', affiliation: 'government', udisePlus: null, aisheCode: 'U-UNI-OD-0087', aisheVerified: true, isTopClassInstitute: true, isNfstHost: true, nosEligible: true, qsRank: null, naacGrade: 'A' },
  { id: 'inst-4', name: 'Nabarangpur College of Arts & Science', type: 'college', stateUt: 'Odisha', district: 'Nabarangpur', affiliation: 'government', udisePlus: null, aisheCode: 'U-COL-OD-0911', aisheVerified: true, isTopClassInstitute: false, isNfstHost: true, nosEligible: true, qsRank: null, naacGrade: 'B+' },
  { id: 'inst-5', name: 'Rani Durgavati Vishwavidyalaya', type: 'university', stateUt: 'Madhya Pradesh', district: 'Jabalpur', affiliation: 'government', udisePlus: null, aisheCode: 'U-UNI-MP-0042', aisheVerified: true, isTopClassInstitute: true, isNfstHost: true, nosEligible: true, qsRank: null, naacGrade: 'A' },
  { id: 'inst-6', name: 'Government College of Music, Bhopal', type: 'college', stateUt: 'Madhya Pradesh', district: 'Bhopal', affiliation: 'government', udisePlus: null, aisheCode: 'U-COL-MP-0533', aisheVerified: true, isTopClassInstitute: true, isNfstHost: true, nosEligible: true, qsRank: null, naacGrade: 'A' },
  { id: 'inst-7', name: 'Kasturba Gandhi Balika Vidyalaya, Dindori', type: 'school', stateUt: 'Madhya Pradesh', district: 'Dindori', affiliation: 'government', udisePlus: '23210400307', aisheCode: null, aisheVerified: false, isTopClassInstitute: false, isNfstHost: false, nosEligible: false, qsRank: null, naacGrade: null },
  { id: 'inst-8', name: 'Rajiv Gandhi University of Knowledge, Ranchi', type: 'university', stateUt: 'Jharkhand', district: 'Ranchi', affiliation: 'government', udisePlus: null, aisheCode: 'U-UNI-JH-0021', aisheVerified: true, isTopClassInstitute: true, isNfstHost: true, nosEligible: true, qsRank: null, naacGrade: 'A' },
  { id: 'inst-9', name: "St. Xavier's College, Ranchi", type: 'college', stateUt: 'Jharkhand', district: 'Ranchi', affiliation: 'private', udisePlus: null, aisheCode: 'U-COL-JH-0233', aisheVerified: true, isTopClassInstitute: true, isNfstHost: true, nosEligible: true, qsRank: null, naacGrade: 'A+' },
  { id: 'inst-10', name: 'Tribal College of Education, Koraput', type: 'college', stateUt: 'Odisha', district: 'Koraput', affiliation: 'government', udisePlus: null, aisheCode: 'U-COL-OD-0788', aisheVerified: true, isTopClassInstitute: false, isNfstHost: true, nosEligible: true, qsRank: null, naacGrade: 'B' },
  { id: 'inst-11', name: 'Baba Bhimrao Ambedkar University, Unnao', type: 'university', stateUt: 'Uttar Pradesh', district: 'Unnao', affiliation: 'government', udisePlus: null, aisheCode: 'U-UNI-UP-0177', aisheVerified: true, isTopClassInstitute: true, isNfstHost: true, nosEligible: true, qsRank: null, naacGrade: 'A' },
  { id: 'inst-12', name: 'University of Oxford (reference, NOS eligible)', type: 'university', stateUt: 'Oxford', district: 'Oxford', affiliation: 'deemed', udisePlus: null, aisheCode: null, aisheVerified: true, isTopClassInstitute: false, isNfstHost: true, nosEligible: true, qsRank: 3, naacGrade: null },
]

export const SOURCE_SYSTEMS = [
  { code: 'nsp', name: 'National Scholarship Portal', category: 'scholarship_portal', mode: 'mock' as const, isAvailable: true, latencyMs: 320, notes: 'Primary application intake for Pre-Matric, Post-Matric and Top Class.' },
  { code: 'sfmp', name: 'Scholarship & Fellowship Management Portal (Canara Bank)', category: 'fellowship_portal', mode: 'mock' as const, isAvailable: true, latencyMs: 410, notes: 'NFST / UGC fellowship application and payment confirmation.' },
  { code: 'nos_portal', name: 'National Overseas Scholarship Portal', category: 'scholarship_portal', mode: 'mock' as const, isAvailable: true, latencyMs: 280, notes: 'NOS applications, offer letters and sanction orders.' },
  { code: 'mota', name: 'MoTA Scholarship & DBT', category: 'ministry_system', mode: 'mock' as const, isAvailable: true, latencyMs: 260, notes: 'Sanction orders and PFMS settlement summaries.' },
  { code: 'digilocker', name: 'DigiLocker', category: 'document_source', mode: 'mock' as const, isAvailable: true, latencyMs: 540, notes: 'Issued document pull (Aadhaar, ST certificate, marksheet, income).' },
  { code: 'uidai', name: 'UIDAI / Aadhaar (e-KYC)', category: 'identity_source', mode: 'mock' as const, isAvailable: true, latencyMs: 610, notes: 'Identity and Aadhaar-seeded bank status.' },
  { code: 'edistrict', name: 'State e-District / revenue officer', category: 'certificate_source', mode: 'mock' as const, isAvailable: true, latencyMs: 880, notes: 'ST certificate, income certificate, domicile verification.' },
  { code: 'udise_plus', name: 'UDISE+', category: 'school_enrolment', mode: 'mock' as const, isAvailable: true, latencyMs: 340, notes: 'School enrolment and profile of classes IX–X students.' },
  { code: 'aishe', name: 'AISHE', category: 'higher_ed_enrolment', mode: 'mock' as const, isAvailable: true, latencyMs: 360, notes: 'Institute registration and sanctioned seat intake.' },
  { code: 'apaar', name: 'APAAR / ABHAAR', category: 'student_identity', mode: 'mock' as const, isAvailable: true, latencyMs: 390, notes: 'One Academic & One Aadhaar-mapped identifier for school students.' },
  { code: 'otr', name: 'NSP OTR registry', category: 'scholarship_portal', mode: 'mock' as const, isAvailable: true, latencyMs: 240, notes: 'One Time Registration presence — used for coverage-gap matching.' },
  { code: 'ugc_nta', name: 'UGC-NTA', category: 'qualification_source', mode: 'mock' as const, isAvailable: true, latencyMs: 300, notes: 'NET / JRF qualification and award letter.' },
  { code: 'swavlamban', name: 'Swavlamban (UDID)', category: 'disability_source', mode: 'mock' as const, isAvailable: true, latencyMs: 420, notes: 'Disability certificate and UDID number.' },
  { code: 'pfms', name: 'PFMS (Public Financial Management System)', category: 'payment_source', mode: 'mock' as const, isAvailable: true, latencyMs: 300, notes: 'DBT batch, UTR and settlement status.' },
  { code: 'qs', name: 'QS World University Rankings', category: 'reference_data', mode: 'mock' as const, isAvailable: true, latencyMs: 200, notes: 'Reference list for NOS eligibility (top 1000).' },
]

export const schemeByCode = (code: string): Scheme | undefined =>
  SCHEMES.find((s) => s.code === code)

export const rulesFor = (code: string): SchemeRule[] => RULES.filter((r) => r.schemeCode === code)

export const institutionByName = (name: string): Institution | undefined => {
  const n = name.trim().toLowerCase()
  return INSTITUTIONS.find(
    (i) => i.name.toLowerCase() === n || i.name.toLowerCase().includes(n) || n.includes(i.name.toLowerCase()),
  )
}

/** Human labels for the benefit JSONB, in a stable display order. */
export const BENEFIT_LABELS: Record<string, { en: string; hi: string }> = {
  dayScholarPerMonth: { en: 'Day scholar (per month)', hi: 'डे-स्कॉलर (प्रति माह)' },
  hostellerPerMonth: { en: 'Hosteller (per month)', hi: 'छात्रावास (प्रति माह)' },
  monthsPerYear: { en: 'Months per academic year', hi: 'शैक्षणिक वर्ष में माह' },
  tuitionFee: { en: 'Tuition fee', hi: 'ट्यूशन फीस' },
  maintenanceAllowance: { en: 'Maintenance allowance', hi: 'निर्वाह भत्ता' },
  tuitionFeeCeiling: { en: 'Tuition fee ceiling (per year)', hi: 'ट्यूशन फीस सीमा (प्रति वर्ष)' },
  booksAndStationeryPerYear: { en: 'Books and stationery (per year)', hi: 'पुस्तक एवं स्टेशनरी (प्रति वर्ष)' },
  stipendPerMonth: { en: 'Stipend (per month)', hi: 'वजीफा (प्रति माह)' },
  computerOneTime: { en: 'Computer / laptop (one time)', hi: 'कंप्यूटर (एक बार)' },
  privateInstituteCeilingPerYear: { en: 'Ceiling for private institutes (per year)', hi: 'निजी संस्थान सीमा (प्रति वर्ष)' },
  mPhilStipendPerMonth: { en: 'M.Phil stipend (per month)', hi: 'M.Phil वजीफा (प्रति माह)' },
  phdStipendPerMonthFirstTwoYears: { en: 'Ph.D stipend — first 2 years (per month)', hi: 'पीएचडी वजीफा — प्रथम 2 वर्ष (प्रति माह)' },
  phdStipendPerMonthRemaining: { en: 'Ph.D stipend — remaining years (per month)', hi: 'पीएचडी वजीफा — शेष वर्ष (प्रति माह)' },
  contingencyHumanitiesSocialSciences: { en: 'Contingency — Humanities / Social Sciences', hi: 'कॉन्टिंजेंसी — मानविकी / सामाजिक विज्ञान' },
  contingencyScienceEngineeringTechnology: { en: 'Contingency — Science / Engineering / Technology', hi: 'कॉन्टिंजेंसी — विज्ञान / अभियांत्रिकी' },
  contingencyPhdHumanitiesSocialSciences: { en: 'Ph.D contingency — Humanities / Social Sciences', hi: 'पीएचडी कॉन्टिंजेंसी — मानविकी / सामाजिक विज्ञान' },
  contingencyPhdScienceEngineeringTechnology: { en: 'Ph.D contingency — Science / Engineering / Technology', hi: 'पीएचडी कॉन्टिंजेंसी — विज्ञान / अभियांत्रिकी' },
  hra: { en: 'House rent allowance', hi: 'मकान किराया भत्ता' },
  escortAllowance: { en: 'Escort allowance (Divyangjan)', hi: 'एस्कॉर्ट भत्ता (दिव्यांगज)' },
  disbursal: { en: 'Disbursal mode', hi: 'वितरण माध्यम' },
  priorityOrder: { en: 'Priority order', hi: 'प्राथमिकता क्रम' },
  slotsPerYear: { en: 'Awards per year (national)', hi: 'प्रति वर्ष पुरस्कार (राष्ट्रीय)' },
  ageLimit: { en: 'Age limit', hi: 'आयु सीमा' },
  universityCriterion: { en: 'University criterion', hi: 'विश्वविद्यालय मानदंड' },
  covers: { en: 'Covers', hi: 'शामिल' },
  note: { en: 'Note', hi: 'टिप्पणी' },
  paymentSplit: { en: 'Payment split', hi: 'भुगतान वितरण' },
}
