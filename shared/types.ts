/**
 * Canonical domain types for JagoScholarship.
 * Shared verbatim between the web/Capacitor app, the verification engine and
 * Supabase Edge Functions so that rules can never drift between them.
 */

export type Role = 'student' | 'reviewer' | 'admin'

export type SchemeCode = 'pre_matric' | 'post_matric' | 'top_class' | 'nfst' | 'nos'

export type CourseLevel =
  | 'secondary'
  | 'senior_secondary'
  | 'graduation'
  | 'post_graduation'
  | 'm_phil'
  | 'ph_d'
  | 'masters_abroad'
  | 'phd_abroad'
  | 'postdoc_abroad'

export type RuleType =
  | 'income_ceiling'
  | 'class_level'
  | 'course_level'
  | 'institution_type'
  | 'institution_flag'
  | 'domicile'
  | 'single_scheme'
  | 'qs_rank'
  | 'age_limit'
  | 'seats_limit'
  | 'percentile'

export type Severity = 'blocker' | 'warning' | 'info'

export type CheckStatus = 'pass' | 'fail' | 'warning' | 'review' | 'skipped' | 'pending'

export type VerificationSource =
  | 'self_declared'
  | 'udise_plus'
  | 'aishe'
  | 'edistrict'
  | 'digilocker'
  | 'uidai'
  | 'ugc_nta'
  | 'qs'
  | 'nfst_host'
  | 'nos_portal'
  | 'nsp'
  | 'nta'
  | 'pfms'
  | 'sfmp'
  | 'otr'
  | 'apaar'
  | 'swavlamban'
  | 'moTA'
  | 'pfms'

export type DocumentType =
  | 'st_certificate'
  | 'income_certificate'
  | 'domicile'
  | 'aadhaar'
  | 'institution_bonafide'
  | 'bank_passbook'
  | 'marksheet'
  | 'passport'
  | 'nos_offer_letter'
  | 'nos_qs_proof'
  | 'net_jrf'
  | 'disability_certificate'
  | 'apaar_id'
  | 'photo'

export type DocumentStatus = 'valid' | 'expired' | 'pending_review' | 'rejected' | 'missing'

export type ApplicationStatus =
  | 'draft'
  | 'eligibility_checked'
  | 'documents_pending'
  | 'submitted'
  | 'verification_running'
  | 'manual_review'
  | 'sanctioned'
  | 'rejected'
  | 'payment_returned'
  | 'disbursed'

export type ReviewDecision = 'approve' | 'reject' | 'clarify' | 'refer'

/** A rule as stored in `public.scheme_rules`. */
export interface SchemeRule {
  id?: string
  schemeCode: SchemeCode
  ruleKey: string
  ruleType: RuleType
  params: Record<string, unknown>
  severity: Severity
  labelEn: string
  labelHi: string
  sourceUrl: string
}

export interface BenefitLine {
  key: string
  labelEn: string
  labelHi: string
  value: string
  note?: string
}

export interface DocumentRequirement {
  docType: DocumentType
  label: string
  mandatory: boolean
  /** Verification connector that can auto-fetch this document. */
  autoFetchFrom?: VerificationSource
  /** True when the same document can be reused across schemes. */
  reusable?: boolean
}

export interface Scheme {
  code: SchemeCode
  name: string
  shortName: string
  portal: string
  portalUrl: string
  level: string
  isCentralSector: boolean
  fundingPattern: string
  incomeCeiling: number | null
  slotsPerYear: number | null
  benefit: Record<string, string | number>
  eligibilitySummary: string
  documentRequirements: DocumentRequirement[]
  deadlineFresh: string | null
  deadlineRenewal: string | null
  sourceUrl: string
  figuresVerifiedOn: string
  accent: string
  sortOrder: number
}

export interface Institution {
  id?: string
  name: string
  type: 'school' | 'college' | 'university'
  stateUt: string
  district: string
  affiliation: string
  udisePlus: string | null
  aisheCode: string | null
  aisheVerified: boolean
  isTopClassInstitute: boolean
  isNfstHost: boolean
  nosEligible: boolean
  qsRank: number | null
  naacGrade: string | null
}

/** What the student declares in the application form. */
export interface StudentProfile {
  fullName: string
  gender: 'male' | 'female' | 'other'
  dateOfBirth: string // ISO yyyy-mm-dd
  category: 'ST' | 'PVTG'
  tribe: string
  district: string
  stateUt: string
  phone: string
  email: string
  aadhaarLast4: string
  apaarId: string | null
  udid: string | null
  currentClass: string // 'IX' | 'X' | 'XI' | 'XII' | 'UG' | 'PG' ...
  courseLevel: CourseLevel
  courseName: string
  institutionName: string
  annualFamilyIncome: number
  incomeCertificateValidTill: string | null
  bankAadhaarSeeded: boolean
  aadhaarNameMatches: boolean
  disabilityPercentage: number | null
  currentlyHoldsScholarship: boolean
  heldScholarshipDetails: string | null
  preferredLanguage: LanguageCode
}

/** The student's document wallet. */
export interface StudentDocument {
  id: string
  docType: DocumentType
  fileName: string
  storagePath: string | null
  mimeType: string
  sizeBytes: number
  status: DocumentStatus
  validTill: string | null
  /** Provenance. Mirrors `documents_source_check` in the database. */
  source:
    | 'upload'
    | 'digilocker'
    | 'udise_plus'
    | 'aishe'
    | 'edistrict'
    | 'nta'
    | 'nsp'
    | 'generated'
    | 'apaar'
    | 'manual'
  matchedApplicationId: string | null
  uploadedAt: string
}

/** One result produced by a connector during verification. */
export interface VerificationCheck {
  id: string
  ruleKey: string
  ruleType: RuleType
  label: string
  labelHi: string
  severity: Severity
  status: CheckStatus
  expected: string
  actual: string
  source: VerificationSource
  sourceUrl: string | null
  explanation: string
  /** Difference of two comparable strings, e.g. a name spelling variant. */
  diff?: { field: string; a: string; b: string }
  remediation: string | null
  checkedAt: string
}

export interface VerificationRun {
  id: string
  applicationId: string
  schemeCode: SchemeCode
  overall: 'eligible' | 'deficient' | 'manual_review' | 'blocked' | 'running'
  checks: VerificationCheck[]
  connectorLatencyMs: Record<string, number>
  startedAt: string
  finishedAt: string | null
  engineVersion: string
}

export interface ReviewTask {
  id: string
  applicationId: string
  schemeCode: SchemeCode
  reason: string
  riskScore: number
  status: 'open' | 'in_review' | 'resolved'
  assignedTo: string | null
  slaDueAt: string
  createdAt: string
}

export interface SanctionOrder {
  id: string
  applicationId: string
  sanctionNo: string
  amountSanctioned: number
  components: { key: string; label: string; amount: number }[]
  status: 'issued' | 'pfms_processing' | 'disbursed' | 'returned'
  issuedAt: string
  pfmsBatch: string | null
  utr: string | null
  returnReason: string | null
}

export interface CoverageRow {
  stateUt: string
  schemeCode: SchemeCode
  eligibleStudents: number
  appliedStudents: number
  sanctionedStudents: number
  disbursedStudents: number
  sanctionedAmount: number
  ytdApplications: number
}

export interface Application {
  id: string
  schemeCode: SchemeCode
  status: ApplicationStatus
  blockingIssues: string[]
  warnings: string[]
  startedAt: string
  submittedAt: string | null
  applicantName: string
  applicantState: string
  applicantDistrict: string
  institutionName: string
  familyIncome: number
}

/** Languages supported for the JAGO assistant and the UI. */
export type LanguageCode =
  | 'en'
  | 'hi'
  | 'sat'
  | 'gon'
  | 'kui'
  | 'ora'
  | 'mun'
  | 'sora'

export interface LanguageMeta {
  code: LanguageCode
  label: string
  nativeLabel: string
  script: string
  speechCode: string
  tier: 'national' | 'tribal'
  stateUt: string | null
}
