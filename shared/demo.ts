/**
 * Demo dataset for the SIH walkthrough.
 *
 * The persona is a real-shaped ST student with three genuine problems that the
 * product is built to explain rather than hide: a lapsed income certificate, a
 * transliteration variant on the ST certificate, and a bank account that is not
 * Aadhaar-seeded (which is why PFMS returns instalments).
 */

import { runConnectors, type ConnectorMode } from './connectors.ts'
import { institutionByName, rulesFor, schemeByCode } from './catalogue.ts'
import { verify, type VerificationOutput } from './eligibility.ts'
import type {
  Application,
  StudentDocument,
  StudentProfile,
  VerificationSource,
} from './types.ts'

export const DEMO_PROFILE: StudentProfile = {
  fullName: 'Suriya Hansda',
  gender: 'male',
  dateOfBirth: '2008-04-12',
  category: 'ST',
  tribe: 'Kondh',
  district: 'Sambalpur',
  stateUt: 'Odisha',
  phone: '+91 98765 43210',
  email: 'suriya.hansda@example.com',
  aadhaarLast4: '4471',
  apaarId: 'APAAR-4412-9987',
  udid: null,
  currentClass: 'X',
  courseLevel: 'secondary',
  courseName: 'Class X (secondary)',
  institutionName: 'Biju Patnaik Government High School, Rairakhol',
  annualFamilyIncome: 180000,
  incomeCertificateValidTill: '2026-06-30',
  bankAadhaarSeeded: false,
  aadhaarNameMatches: true,
  disabilityPercentage: null,
  currentlyHoldsScholarship: false,
  heldScholarshipDetails: null,
  preferredLanguage: 'sat',
}

export const DEMO_DOCUMENTS: StudentDocument[] = [
  {
    id: 'doc-1',
    docType: 'st_certificate',
    fileName: 'ST_Certificate_Suriya_Hansda.pdf',
    storagePath: 'demo/st_certificate.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 284_912,
    status: 'valid',
    validTill: '2029-03-31',
    source: 'digilocker',
    matchedApplicationId: null,
    uploadedAt: '2025-07-14T09:12:00Z',
  },
  {
    id: 'doc-2',
    docType: 'aadhaar',
    fileName: 'Aadhaar_Suriya.pdf',
    storagePath: 'demo/aadhaar.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 151_204,
    status: 'valid',
    validTill: null,
    source: 'digilocker',
    matchedApplicationId: null,
    uploadedAt: '2025-07-14T09:14:00Z',
  },
  {
    id: 'doc-3',
    docType: 'income_certificate',
    fileName: 'Income_Certificate_2025.pdf',
    storagePath: 'demo/income_2025.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 198_450,
    status: 'expired',
    validTill: '2026-06-30',
    source: 'upload',
    matchedApplicationId: null,
    uploadedAt: '2025-08-02T11:40:00Z',
  },
  {
    id: 'doc-4',
    docType: 'institution_bonafide',
    fileName: 'Bonafide_BijuPatnaikHS.pdf',
    storagePath: 'demo/bonafide.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 96_770,
    status: 'valid',
    validTill: '2027-04-30',
    source: 'upload',
    matchedApplicationId: null,
    uploadedAt: '2025-09-01T08:05:00Z',
  },
]

export const DEMO_APPLICATIONS: Application[] = [
  {
    id: 'app-demo-1',
    schemeCode: 'pre_matric',
    status: 'manual_review',
    blockingIssues: ['Income certificate has expired'],
    warnings: ['ST certificate name reads "Suriya Hansdah" — reviewer confirmation needed'],
    startedAt: '2025-09-04T10:00:00Z',
    submittedAt: '2025-09-05T06:20:00Z',
    applicantName: 'Suriya Hansda',
    applicantState: 'Odisha',
    applicantDistrict: 'Sambalpur',
    institutionName: 'Biju Patnaik Government High School, Rairakhol',
    familyIncome: 180000,
  },
]

/* ------------------------------------------------------------------ */
/* orchestration                                                       */
/* ------------------------------------------------------------------ */

export interface EligibilityRun {
  result: VerificationOutput
  latencyMs: Record<string, number>
}

export async function evaluateScheme(
  schemeCode: string,
  profile: StudentProfile = DEMO_PROFILE,
  documents: StudentDocument[] = DEMO_DOCUMENTS,
  options: {
    simulateFailure?: VerificationSource[]
    heldSchemes?: { code: string; status: string }[]
    mode?: ConnectorMode
    now?: Date
  } = {},
): Promise<EligibilityRun> {
  const scheme = schemeByCode(schemeCode)
  if (!scheme) throw new Error(`Unknown scheme: ${schemeCode}`)

  const connectors = await runConnectors(
    {
      profile,
      documents,
      simulateFailure: new Set(options.simulateFailure ?? []),
      mode: options.mode ?? 'mock',
      useLatency: true,
      schemeNeeds: () => true,
    },
    [schemeCode],
  )

  const result = verify({
    scheme,
    rules: rulesFor(schemeCode),
    profile,
    documents,
    institution: institutionByName(profile.institutionName) ?? null,
    connectors,
    heldSchemes: options.heldSchemes ?? [],
    now: options.now ?? new Date(),
  })

  return {
    result,
    latencyMs: Object.fromEntries(connectors.map((c) => [c.connector, c.latencyMs])),
  }
}

/** All five schemes at once — powers the "which scheme fits me?" home view. */
export async function evaluateAllSchemes(
  profile: StudentProfile = DEMO_PROFILE,
  documents: StudentDocument[] = DEMO_DOCUMENTS,
  options: { simulateFailure?: VerificationSource[]; now?: Date } = {},
): Promise<Record<string, EligibilityRun>> {
  const codes = ['pre_matric', 'post_matric', 'top_class', 'nfst', 'nos'] as const
  const runs = await Promise.all(codes.map((c) => evaluateScheme(c, profile, documents, options)))
  return Object.fromEntries(codes.map((c, i) => [c, runs[i]!]))
}
