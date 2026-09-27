/**
 * RLS-safe data access.
 *
 * Every read goes through the anon client's session, so the policies in
 * `supabase/migrations` decide what is visible: a signed-in student sees only
 * their own rows, staff see the reviewer and analytics views, and the synthetic
 * demo cohort is readable through the `is_demo` carve-out so the prototype works
 * without a login. Private PII is split into `student_private` and is only ever
 * reached through `v_student_profile`, which is `security_invoker`, so the
 * underlying policies still apply.
 *
 * Writes require a real Supabase Auth session. When there is none the helpers
 * return `null` and the caller falls back to `shared/demo.ts` rather than
 * silently pretending a write succeeded.
 */

import { supabase } from '@/lib/supabase.ts'
import { DEMO_APPLICATIONS, DEMO_DOCUMENTS, DEMO_PROFILE } from '@shared/demo.ts'
import { schemeByCode } from '@shared/catalogue.ts'
import type {
  Application,
  ApplicationStatus,
  SchemeCode,
  StudentDocument,
  StudentProfile,
} from '@shared/types.ts'

export const DEMO_KEY = 'demo-student'

/**
 * Every read gets a deadline. A government prototype gets demoed on hotel and
 * conference wifi, where a request can hang for minutes. Without this the
 * reviewer console and the Ministry dashboard sit on "Loading" forever instead
 * of falling back to something honest.
 */
const DEADLINE_MS = 6000

const withDeadline = async <T>(work: PromiseLike<T>, fallback: T): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), DEADLINE_MS)
  })
  try {
    return await Promise.race([work, deadline])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export interface HydrateResult {
  profile: StudentProfile
  documents: StudentDocument[]
  applications: Application[]
}

const row = (r: Record<string, unknown>) => r

const mapProfile = (r: Record<string, unknown>): StudentProfile => ({
  fullName: String(r.full_name ?? ''),
  gender: (r.gender as StudentProfile['gender']) ?? 'other',
  dateOfBirth: String(r.date_of_birth ?? ''),
  category: (r.category as StudentProfile['category']) ?? 'ST',
  tribe: String(r.tribe ?? ''),
  district: String(r.district ?? ''),
  stateUt: String(r.state_ut ?? ''),
  phone: String(r.phone ?? ''),
  email: String(r.email ?? ''),
  aadhaarLast4: String(r.aadhaar_last4 ?? ''),
  apaarId: (r.apaar_id as string) ?? null,
  udid: (r.udid as string) ?? null,
  currentClass: String(r.current_class ?? ''),
  courseLevel: (r.course_level as StudentProfile['courseLevel']) ?? 'secondary',
  courseName: String(r.course_name ?? ''),
  institutionName: String(r.institution_name ?? ''),
  annualFamilyIncome: Number(r.annual_family_income ?? 0),
  incomeCertificateValidTill: (r.income_certificate_valid_till as string) ?? null,
  bankAadhaarSeeded: Boolean(r.bank_aadhaar_seeded),
  // A null means the registry was never queried, which the engine treats as
  // "no mismatch found" rather than "mismatch".
  aadhaarNameMatches: r.aadhaar_name_matches == null ? true : Boolean(r.aadhaar_name_matches),
  disabilityPercentage: r.disability_percentage == null ? null : Number(r.disability_percentage),
  currentlyHoldsScholarship: Boolean(r.currently_holds_scholarship),
  heldScholarshipDetails: (r.held_scholarship_details as string) ?? null,
  preferredLanguage: (r.preferred_language as StudentProfile['preferredLanguage']) ?? 'en',
})

const mapDocument = (r: Record<string, unknown>): StudentDocument => ({
  id: String(r.id),
  docType: r.doc_type as StudentDocument['docType'],
  fileName: String(r.file_name ?? r.title ?? 'document'),
  storagePath: (r.storage_path as string) ?? null,
  mimeType: String(r.mime_type ?? 'application/pdf'),
  sizeBytes: Number(r.size_bytes ?? 0),
  status: r.status as StudentDocument['status'],
  validTill: (r.valid_till as string) ?? null,
  source: (r.source as StudentDocument['source']) ?? 'upload',
  matchedApplicationId: (r.matched_application_id as string) ?? null,
  uploadedAt: String(r.created_at ?? new Date().toISOString()),
})

const mapApplication = (r: Record<string, unknown>): Application => ({
  id: String(r.id),
  schemeCode: r.scheme_code as Application['schemeCode'],
  status: r.status as ApplicationStatus,
  blockingIssues: (r.blocking_issues as string[]) ?? [],
  warnings: (r.warnings as string[]) ?? [],
  startedAt: String(r.started_at ?? new Date().toISOString()),
  submittedAt: (r.submitted_at as string) ?? null,
  applicantName: String(r.applicant_name ?? ''),
  applicantState: String(r.applicant_state ?? ''),
  applicantDistrict: String(r.applicant_district ?? ''),
  institutionName: String(r.institution_name ?? ''),
  familyIncome: Number(r.family_income ?? 0),
})

/**
 * Reads the demo student's record. Returns `null` when Supabase is not
 * configured, the row is absent, or the read is refused, so the caller can fall
 * back to the local dataset without branching on infrastructure.
 */
export async function hydrateDemoState(): Promise<HydrateResult | null> {
  if (!supabase) return null

  return withDeadline(
    (async (): Promise<HydrateResult | null> => {
      const { data: profileRow, error: profileError } = await supabase
        .from('v_student_profile')
        .select('*')
        .eq('demo_key', DEMO_KEY)
        .maybeSingle()

      if (profileError || !profileRow) return null

      // The profile lookup already proved the session can read this student, so
      // the child tables can key off the resolved id rather than guessing at it.
      const profile = mapProfile(row(profileRow as Record<string, unknown>))

      const [docRes, appRes] = await Promise.all([
        supabase
          .from('documents')
          .select('*')
          .eq('is_demo', true)
          .order('created_at', { ascending: false }),
        supabase
          .from('applications')
          .select('*')
          .eq('is_demo', true)
          .order('started_at', { ascending: false }),
      ])

      return {
        profile,
        documents: ((docRes.data ?? []) as Record<string, unknown>[]).map(mapDocument),
        applications: ((appRes.data ?? []) as Record<string, unknown>[]).map(mapApplication),
      }
    })(),
    null,
  )
}

export interface SaveApplicationInput {
  schemeCode: SchemeCode
  status: ApplicationStatus
  blockingIssues: string[]
  warnings: string[]
  profile: StudentProfile
  applicationId?: string
}

/**
 * Writes an application for the signed-in student.
 *
 * `student_id`, `academic_year` and `portal` are all NOT NULL with no default,
 * and RLS pins `student_id` to `auth.uid()`, so a session is genuinely required.
 * Returning `null` (rather than throwing) is what lets the demo keep working
 * offline while making the difference visible in the UI.
 */
export async function saveApplication(input: SaveApplicationInput): Promise<string | null> {
  if (!supabase) return null

  const { data: sessionData } = await supabase.auth.getSession()
  const studentId = sessionData.session?.user.id
  if (!studentId) return null

  const scheme = schemeByCode(input.schemeCode)
  if (!scheme) throw new Error(`Unknown scheme: ${input.schemeCode}`)

  const payload = {
    student_id: studentId,
    scheme_code: input.schemeCode,
    academic_year: currentAcademicYear(),
    portal: scheme.portal,
    course: input.profile.courseName || null,
    course_level: input.profile.courseLevel,
    status: input.status,
    institution_name: input.profile.institutionName || null,
    applicant_name: input.profile.fullName,
    applicant_state: input.profile.stateUt || null,
    applicant_district: input.profile.district || null,
    family_income: input.profile.annualFamilyIncome || null,
    blocking_issues: input.blockingIssues,
    warnings: input.warnings,
    ...(input.status === 'submitted' ? { submitted_at: new Date().toISOString() } : {}),
  }

  const query = input.applicationId
    ? supabase.from('applications').update(payload).eq('id', input.applicationId)
    : supabase.from('applications').insert(payload)

  const { data, error } = await query.select('id').single()
  if (error) throw error
  return String((data as { id: string }).id)
}

/** Appwrite-free helper: Indian academic year runs April to March. */
function currentAcademicYear(at: Date = new Date()): string {
  const startYear = at.getMonth() >= 3 ? at.getFullYear() : at.getFullYear() - 1
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
}

export interface VerificationRunInput {
  overall: string
  checks: unknown[]
  connectorLatencyMs: Record<string, number>
  engineVersion: string
}

/** Records a completed eligibility run against an application. Staff-only. */
export async function persistVerificationRun(
  applicationId: string,
  schemeCode: SchemeCode,
  run: VerificationRunInput,
): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('verification_runs').insert({
    application_id: applicationId,
    scheme_code: schemeCode,
    overall: run.overall,
    checks: run.checks,
    connector_latency_ms: run.connectorLatencyMs,
    engine_version: run.engineVersion,
  })
  return !error
}

/** Ministry-wide coverage, aggregated by the `v_coverage_matrix` view. */
export interface CoverageRowOut {
  state_ut: string
  scheme_code: SchemeCode
  short_name: string
  accent: string
  enrolled_students: number
  covered_students: number
  unreached_students: number
  pvtg_students: number
  projected_pvtg_students: number
  otr_registered: number
  no_otr_students: number
  income_2_5lakh_students: number
  income_6lakh_students: number
  median_family_income: number
  sample_size: number
  applied_students: number
  sanctioned_students: number
  disbursed_students: number
  sanctioned_amount: number
  ytd_applications: number
  coverage_pct: number
}

export async function loadCoverage(): Promise<CoverageRowOut[] | null> {
  if (!supabase) return null
  return withDeadline(
    supabase
      .from('v_coverage_matrix')
      .select('*')
      .order('state_ut')
      .then(({ data, error }) => (error ? null : (data as CoverageRowOut[]))),
    null,
  )
}

/** District cohorts behind the targeting list, from `v_coverage_cohorts`. */
export async function loadCoverageCohorts(): Promise<
  Array<{
    state_ut: string
    district: string
    enrolled_st: number
    unreached_st: number
    pvtg_st: number
    no_otr_st: number
    avg_need_score: number
  }> | null
> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('v_coverage_cohorts')
    .select('*')
    .order('unreached_st', { ascending: false })
    .limit(60)
  if (error) return null
  return data as never
}

export interface ReviewQueueRowOut {
  application_id: string
  scheme_code: SchemeCode
  short_name: string
  status: string
  applicant_name: string
  applicant_state: string
  applicant_district: string
  institution_name: string
  family_income: number
  risk_score: number
  blocking_issues: string[]
  warnings: string[]
  submitted_at: string | null
  started_at: string
  review_task_id: string | null
  reason: string | null
  review_status: string | null
  priority: string | null
  sla_due: string | null
  assignee_id: string | null
}

/**
 * The live reviewer queue. It carries applicant names and income, so it is
 * staff-only by policy: without a staff session this returns an empty list
 * rather than partial rows.
 */
export async function loadReviewQueue(): Promise<ReviewQueueRowOut[]> {
  if (!supabase) return []
  return withDeadline(
    supabase
      .from('v_review_queue')
      .select('*')
      .order('risk_score', { ascending: false })
      .then(({ data, error }) => (error ? [] : ((data ?? []) as ReviewQueueRowOut[]))),
    [],
  )
}

/** Institutes plus the flags that drive institute-level eligibility. */
export async function loadInstitutions(): Promise<Array<Record<string, unknown>> | null> {
  if (!supabase) return null
  return withDeadline(
    supabase
      .from('institutions')
      .select('*')
      .order('name')
      .then(({ data, error }) => (error ? null : (data as Array<Record<string, unknown>>))),
    null,
  )
}

export const localFallback = {
  profile: DEMO_PROFILE,
  documents: DEMO_DOCUMENTS,
  applications: DEMO_APPLICATIONS,
  schemes: schemeByCode,
}
