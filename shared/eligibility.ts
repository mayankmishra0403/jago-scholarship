/**
 * Explainable eligibility + verification engine.
 *
 * Pure, dependency-free and shared by the app, the Edge Function and the test
 * suite. Every rule in `public.scheme_rules` is evaluated here, and every
 * outcome carries a human-readable reason so a student — or a reviewer — always
 * understands *why* a check passed or failed.
 */

import type {
  CheckStatus,
  DocumentRequirement,
  DocumentType,
  Institution,
  Scheme,
  SchemeRule,
  StudentDocument,
  StudentProfile,
  VerificationCheck,
  VerificationSource,
} from './types.ts'

export const ENGINE_VERSION = '1.0.0'

export interface ConnectorResult {
  connector: VerificationSource
  ok: boolean
  latencyMs: number
  data?: Record<string, unknown>
  error?: string
  sourceUrl?: string
}

export interface VerificationInput {
  scheme: Scheme
  rules: SchemeRule[]
  profile: StudentProfile
  documents: StudentDocument[]
  institution: Institution | null
  /** Results of every external connector call, keyed by `connector` name. */
  connectors: ConnectorResult[]
  /** Schemes the student already holds, for the one-scheme-at-a-time rule. */
  heldSchemes: { code: string; status: string }[]
  now: Date
}

export interface VerificationOutput {
  overall: 'eligible' | 'deficient' | 'manual_review' | 'blocked'
  checks: VerificationCheck[]
  blockingIssues: string[]
  warnings: string[]
  /** Fraction of mandatory documents that are valid (0..1). */
  documentReadiness: number
  /** Higher means more scrutiny needed. Drives the reviewer queue ordering. */
  riskScore: number
  engineVersion: string
  checkedAt: string
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

let seq = 0
const nextId = (ruleKey: string) => `chk_${ruleKey}_${(seq += 1)}`

function ageOn(dob: string, now: Date): number {
  const birth = new Date(dob)
  if (Number.isNaN(birth.getTime())) return Number.NaN
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1
  return age
}

const CLASS_ORDER = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
const CLASS_INDEX = (c: string) => {
  const i = CLASS_ORDER.indexOf(String(c).toUpperCase())
  return i === -1 ? Number.NaN : i
}

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`

/** Levenshtein distance, capped for performance. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i]
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    prev = cur
  }
  return prev[b.length]
}

const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-zऀ-ॿ\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** Tolerance for minor transliteration/spelling differences in names. */
export function nameSimilarity(a: string, b: string): { similar: boolean; distance: number } {
  const na = normalise(a)
  const nb = normalise(b)
  if (!na || !nb) return { similar: false, distance: Number.POSITIVE_INFINITY }
  const distance = editDistance(na, nb)
  return { similar: distance <= 2, distance }
}

const findConnector = (
  connectors: ConnectorResult[],
  c: VerificationSource,
): ConnectorResult | undefined => connectors.find((x) => x.connector === c)

/** Normalises a `data` payload into a record of strings for comparison. */
function asData(r: ConnectorResult | undefined): Record<string, unknown> {
  return r?.ok && r.data ? r.data : {}
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : v == null ? null : String(v))

/* ------------------------------------------------------------------ */
/* document evaluation                                                 */
/* ------------------------------------------------------------------ */

export interface DocumentEvaluation {
  docType: DocumentType
  requirement: DocumentRequirement
  status: CheckStatus
  label: string
  detail: string
  documentId: string | null
  source: string
  reusable: boolean
}

export function evaluateDocuments(
  requirements: DocumentRequirement[],
  documents: StudentDocument[],
  connectors: ConnectorResult[],
  now: Date,
): DocumentEvaluation[] {
  return requirements.map((req) => {
    const doc = documents.find((d) => d.docType === req.docType)
    const digi = findConnector(connectors, 'digilocker')
    const reusable = req.reusable !== false
    const label = req.label

    if (doc) {
      if (doc.status === 'valid') {
        if (doc.validTill) {
          const till = new Date(doc.validTill)
          const expired = till.getTime() < now.getTime()
          return {
            docType: req.docType,
            requirement: req,
            status: expired ? 'fail' : 'pass',
            label,
            detail: expired
              ? `${doc.fileName} expired on ${doc.validTill}`
              : `${doc.fileName} is valid${doc.validTill ? ` till ${doc.validTill}` : ''}`,
            documentId: doc.id,
            source: doc.source,
            reusable,
          }
        }
        return {
          docType: req.docType,
          requirement: req,
          status: 'pass',
          label,
          detail: `${doc.fileName} is valid`,
          documentId: doc.id,
          source: doc.source,
          reusable,
        }
      }
      if (doc.status === 'expired') {
        return {
          docType: req.docType,
          requirement: req,
          status: 'fail',
          label,
          detail: `${doc.fileName} expired on ${doc.validTill ?? 'a past date'} — get a fresh one`,
          documentId: doc.id,
          source: doc.source,
          reusable,
        }
      }
      if (doc.status === 'pending_review') {
        return {
          docType: req.docType,
          requirement: req,
          status: 'review',
          label,
          detail: `${doc.fileName} is with a reviewer`,
          documentId: doc.id,
          source: doc.source,
          reusable,
        }
      }
      return {
        docType: req.docType,
        requirement: req,
        status: 'fail',
        label,
        detail: `${doc.fileName} was rejected — upload a fresh copy`,
        documentId: doc.id,
        source: doc.source,
        reusable,
      }
    }

    // No upload — can a connector auto-supply it?
    if (req.autoFetchFrom) {
      const c = findConnector(connectors, req.autoFetchFrom)
      if (c?.ok) {
        const d = asData(c)
        const issuer = str(d.issuer) ?? str(d.authority)
        return {
          docType: req.docType,
          requirement: req,
          status: 'pass',
          label,
          detail: `Fetched automatically from ${req.autoFetchFrom}${issuer ? ` (${issuer})` : ''} — no upload needed`,
          documentId: null,
          source: req.autoFetchFrom,
          reusable,
        }
      }
    }

    if (digi?.ok && !req.autoFetchFrom) {
      const d = asData(digi)
      const count = typeof d.documents === 'number' ? d.documents : 0
      return {
        docType: req.docType,
        requirement: req,
        status: count > 0 ? 'review' : 'fail',
        label,
        detail:
          count > 0
            ? `DigiLocker holds ${count} issued documents — pick the right one from your wallet`
            : 'Not found in DigiLocker and not uploaded yet',
        documentId: null,
        source: 'digilocker',
        reusable,
      }
    }

    return {
      docType: req.docType,
      requirement: req,
      status: 'fail',
      label,
      detail: 'Not uploaded yet',
      documentId: null,
      source: 'none',
      reusable,
    }
  })
}

/* ------------------------------------------------------------------ */
/* rule evaluation                                                     */
/* ------------------------------------------------------------------ */

function makeCheck(
  rule: SchemeRule,
  status: CheckStatus,
  expected: string,
  actual: string,
  explanation: string,
  source: VerificationSource,
  extra: Partial<VerificationCheck> = {},
): VerificationCheck {
  return {
    id: nextId(rule.ruleKey),
    ruleKey: rule.ruleKey,
    ruleType: rule.ruleType,
    label: rule.labelEn,
    labelHi: rule.labelHi,
    severity: rule.severity,
    status,
    expected,
    actual,
    source,
    sourceUrl: rule.sourceUrl,
    explanation,
    remediation: null,
    checkedAt: new Date().toISOString(),
    ...extra,
  }
}

export function evaluateRule(
  rule: SchemeRule,
  input: VerificationInput,
): VerificationCheck {
  const { profile, institution, scheme, now } = input
  const p = rule.params as Record<string, never>

  switch (rule.ruleType) {
    case 'income_ceiling': {
      const max = Number(p.maxAnnual as unknown as number)
      const within = profile.annualFamilyIncome <= max
      const icExpired =
        profile.incomeCertificateValidTill !== null &&
        new Date(profile.incomeCertificateValidTill).getTime() < now.getTime()
      if (!within) {
        return makeCheck(
          rule,
          'fail',
          `Family income ≤ ${rupees(max)} per annum`,
          `Declared family income ${rupees(profile.annualFamilyIncome)}`,
          `The ${scheme.shortName} scheme requires family income from all sources not to exceed ${rupees(max)} per year. Your declared income is higher, so this scheme cannot be applied for.`,
          'self_declared',
          {
            remediation: `Look at the schemes with a higher ceiling, or get your income certificate re-assessed if the declared figure is incorrect.`,
          },
        )
      }
      if (icExpired) {
        return makeCheck(
          rule,
          'fail',
          `Valid income certificate on the date of application`,
          `Income certificate valid till ${profile.incomeCertificateValidTill} (expired)`,
          `Your income is within the ceiling, but the income certificate you hold expired on ${profile.incomeCertificateValidTill}. Scholarship rules require a valid certificate at the time of application.`,
          'edistrict',
          {
            remediation: `Apply for a fresh Income Certificate from your Block / Tehsil office, then upload it. JagoScholarship will re-run this check automatically.`,
          },
        )
      }
      return makeCheck(
        rule,
        'pass',
        `Family income ≤ ${rupees(max)} per annum`,
        `Declared family income ${rupees(profile.annualFamilyIncome)}`,
        `Your declared family income of ${rupees(profile.annualFamilyIncome)} is within the ${rupees(max)} ceiling for this scheme.`,
        'self_declared',
      )
    }

    case 'class_level': {
      const min = CLASS_INDEX(String(p.min))
      const maxIdx = p.max !== undefined ? CLASS_INDEX(String(p.max)) : Number.POSITIVE_INFINITY
      const idx = CLASS_INDEX(profile.currentClass)
      if (Number.isNaN(idx)) {
        return makeCheck(
          rule,
          'review',
          `Class ${String(p.min)}${p.max ? `–${String(p.max)}` : ''}`,
          `Declared class ${profile.currentClass}`,
          'We could not read your class from UDISE+, so this check needs a reviewer.',
          'self_declared',
        )
      }
      const ok = idx >= min && idx <= maxIdx
      return makeCheck(
        rule,
        ok ? 'pass' : 'fail',
        `Studying in Class ${String(p.min)}${p.max ? ` to ${String(p.max)}` : ' or above'}`,
        `Currently in Class ${profile.currentClass}`,
        ok
          ? `Class ${profile.currentClass} falls within the eligible range for this scheme.`
          : `This scheme is only for students in Class ${String(p.min)}${p.max ? `–${String(p.max)}` : ' or above'}. You are in Class ${profile.currentClass}, so it does not apply right now.`,
        'udise_plus',
        {
          remediation: ok
            ? null
            : 'You will be auto-notified when you reach the eligible class.',
        },
      )
    }

    case 'course_level': {
      const allow = (p.allow as unknown as string[]) ?? []
      const ok = allow.includes(profile.courseLevel)
      const udise = findConnector(input.connectors, 'udise_plus')
      return makeCheck(
        rule,
        ok ? 'pass' : 'fail',
        `Course level: ${allow.join(', ')}`,
        `Course level: ${profile.courseLevel} (${profile.courseName})`,
        ok
          ? `Your course (${profile.courseName}) is at an eligible level for this scheme.`
          : `This scheme covers ${allow.join(', ')} courses. Your current course is ${profile.courseName}.`,
        udise?.ok ? 'udise_plus' : 'self_declared',
        { remediation: ok ? null : 'Explore the schemes that match your current course level.' },
      )
    }

    case 'institution_type': {
      const allow = (p.allow as unknown as string[]) ?? []
      const type = institution?.type
      if (!type) {
        return makeCheck(
          rule,
          'review',
          `Institution type: ${allow.join(', ')}`,
          'Institution not matched',
          'We could not match your institution, so a reviewer will confirm it.',
          'self_declared',
        )
      }
      const ok = allow.includes(type)
      return makeCheck(
        rule,
        ok ? 'pass' : 'fail',
        `Institution type: ${allow.join(', ')}`,
        `${institution!.name} (${type})`,
        ok
          ? `${institution!.name} is a ${type}, which is eligible to host this scheme.`
          : `${institution!.name} is a ${type}; this scheme is administered through ${allow.join('/')}.`,
        'aishe',
      )
    }

    case 'institution_flag': {
      const flag = String(p.flag)
      if (!institution) {
        return makeCheck(
          rule,
          'review',
          'Institution eligible for this scheme',
          'Institution not matched',
          'Your institution is not in our verified list yet, so a reviewer must confirm eligibility.',
          'aishe',
        )
      }
      const mapping: Record<string, boolean> = {
        is_top_class_institute: institution.isTopClassInstitute,
        is_nfst_host: institution.isNfstHost,
        nos_eligible: institution.nosEligible,
      }
      const value = mapping[flag] ?? false
      const human = flag.replace(/_/g, ' ').replace(/^is /, '')
      return makeCheck(
        rule,
        value ? 'pass' : 'fail',
        `Institute notified for ${human}`,
        value
          ? `${institution.name} is notified${institution.aisheCode ? ` (AISHE ${institution.aisheCode})` : ''}`
          : `${institution.name} is not currently notified for ${human}`,
        value
          ? `${institution.name} appears in the Ministry's notified list, so the institute-level condition is satisfied.`
          : `${institution.name} is not on the notified list for ${human}. A notified institute is a mandatory condition of this scheme, so the application cannot proceed from this institution.`,
        institution.aisheVerified ? 'aishe' : 'self_declared',
        {
          remediation: value
            ? null
            : 'Ask your institute to confirm its AISHE / notification status, or apply through a notified institute.',
        },
      )
    }

    case 'domicile': {
      const ed = findConnector(input.connectors, 'edistrict')
      const data = asData(ed)
      const state = str(data.state) ?? str(data.district)
      if (!ed) {
        return makeCheck(
          rule,
          'review',
          'Domicile certificate from the State / UT',
          'e-District connector not reachable',
          'The e-District portal could not be reached, so the domicile certificate will be verified manually.',
          'edistrict',
        )
      }
      if (!ed.ok) {
        return makeCheck(
          rule,
          'review',
          'Domicile certificate from the State / UT',
          `e-District error: ${ed.error ?? 'unknown'}`,
          'The e-District portal did not respond, so domicile verification has been routed to a reviewer instead of failing your application.',
          'edistrict',
        )
      }
      const matches = !state || normalise(state).includes(normalise(profile.stateUt))
      return makeCheck(
        rule,
        matches ? 'pass' : 'fail',
        `Domicile of ${profile.stateUt}`,
        state ? `Certificate shows ${state}` : 'Certificate found, issuing state not returned',
        matches
          ? 'Your domicile certificate matches the State / UT in which you are studying.'
          : `Your domicile certificate is issued for a different State / UT. Domicile must be from the State / UT where you study.`,
        'edistrict',
        { remediation: matches ? null : 'Get a domicile certificate issued by your current State / UT.' },
      )
    }

    case 'single_scheme': {
      const held = input.heldSchemes.filter(
        (h) => h.code !== scheme.code && !['rejected', 'withdrawn'].includes(h.status),
      )
      if (!profile.currentlyHoldsScholarship && held.length === 0) {
        return makeCheck(
          rule,
          'pass',
          'No other scholarship held at the same time',
          'No active scholarship found',
          'We found no other active scholarship or fellowship on your record, so the one-scheme-at-a-time condition is satisfied.',
          'otr',
        )
      }
      const heldLabel = profile.heldScholarshipDetails ?? held.map((h) => h.code).join(', ')
      return makeCheck(
        rule,
        'warning',
        'No other scholarship held at the same time',
        `Already holding: ${heldLabel}`,
        `A student may hold only one scholarship at a time. You currently hold ${heldLabel}. If this new application is approved, the earlier one must be formally surrendered before the money is released.`,
        'otr',
        {
          remediation: 'We will raise a surrender request automatically once this application is sanctioned. Keep applying — you will not lose the benefit by applying early.',
        },
      )
    }

    case 'qs_rank': {
      const maxRank = Number(p.maxRank as unknown as number)
      const qs = findConnector(input.connectors, 'qs')
      const data = asData(qs)
      const rank = typeof data.rank === 'number' ? data.rank : null
      const univ = str(data.name) ?? profile.institutionName
      if (rank === null) {
        return makeCheck(
          rule,
          'review',
          `University ranked within the top ${maxRank} in QS World University Rankings`,
          'QS ranking could not be resolved',
          'The QS ranking for your university could not be resolved automatically, so a reviewer will check it against the current edition.',
          'qs',
        )
      }
      const ok = rank <= maxRank
      return makeCheck(
        rule,
        ok ? 'pass' : 'fail',
        `University ranked within the top ${maxRank} in QS`,
        `${univ} is ranked ${rank}`,
        ok
          ? `${univ} is ranked ${rank} in the current QS World University Rankings, which is within the top ${maxRank} required for this scheme.`
          : `${univ} is ranked ${rank}. The NOS scheme is limited to the top ${maxRank} universities, so this university is not eligible.`,
        'qs',
      )
    }

    case 'age_limit': {
      const age = ageOn(profile.dateOfBirth, now)
      const level = profile.courseLevel
      const key = level.includes('masters')
        ? 'masters'
        : level.includes('postdoc')
          ? 'postDoctoral'
          : level.includes('phd') || level.includes('m_phil')
            ? 'phd'
            : null
      if (!key) {
        return makeCheck(
          rule,
          'warning',
          `Age limit: ${JSON.stringify(p)}`,
          'Course level does not map to an age band',
          'The age limit band could not be derived from your course level; a reviewer will confirm it.',
          'self_declared',
        )
      }
      const limit = Number(p[key] as unknown as number)
      const ok = age <= limit
      return makeCheck(
        rule,
        ok ? 'pass' : 'fail',
        `Age not more than ${limit} years for this study level`,
        `Age on ${now.toISOString().slice(0, 10)}: ${Number.isNaN(age) ? 'unknown' : `${age} years`}`,
        ok
          ? `Your age of ${age} years is within the ${limit}-year limit for this level.`
          : `The age limit for this level is ${limit} years. At ${age} years you are over the limit, so this application cannot be considered.`,
        'self_declared',
      )
    }

    case 'seats_limit': {
      const slots = Number(p.slots as unknown as number)
      return makeCheck(
        rule,
        'warning',
        `Only ${slots} awards available per year`,
        `This scheme awards ${slots} slots nationally each year`,
        `Competition for this scheme is very high: only ${slots} awards are made every year for the whole country. A strong profile improves your chances, but selection is not guaranteed.`,
        'nos_portal',
      )
    }

    case 'percentile':
    default: {
      return makeCheck(
        rule,
        'skipped',
        String(p.note ?? 'Informational rule'),
        'No automated data source',
        'This condition is assessed by a human reviewer using the application documents.',
        'self_declared',
      )
    }
  }
}

/* ------------------------------------------------------------------ */
/* cross-checks: Aadhaar / bank / name consistency                     */
/* ------------------------------------------------------------------ */

/** Distance beyond which a name is a different person, not a spelling variant. */
const NAME_VARIANT_MAX = 6

export function crossChecks(input: VerificationInput): VerificationCheck[] {
  const { profile, connectors } = input
  const out: VerificationCheck[] = []
  const uidai = findConnector(connectors, 'uidai')
  const data = asData(uidai)
  /**
   * A successful e-KYC response is authoritative. The self-declared value is
   * only used when UIDAI could not be reached — otherwise a student would be
   * told their bank is unseeded while the gateway says it is fine.
   */
  const nameMatch = typeof data.nameMatch === 'boolean' ? data.nameMatch : profile.aadhaarNameMatches
  const bankSeeded = typeof data.bankSeeded === 'boolean' ? data.bankSeeded : profile.bankAadhaarSeeded
  const source: VerificationSource = uidai?.ok ? 'uidai' : 'self_declared'
  const synthetic = (partial: Partial<VerificationCheck>): VerificationCheck => ({
    id: nextId(partial.ruleKey ?? 'cross'),
    ruleKey: partial.ruleKey ?? 'cross',
    ruleType: 'income_ceiling' as const,
    label: 'Cross-check',
    labelHi: 'Cross-check',
    severity: 'blocker' as const,
    status: 'pass' as const,
    expected: '',
    actual: '',
    source: 'uidai' as const,
    sourceUrl: null,
    explanation: '',
    remediation: null,
    checkedAt: new Date().toISOString(),
    ...partial,
  })

  if (nameMatch === false) {
    out.push(
      synthetic({
        ruleKey: 'aadhaar_name_match',
        ruleType: 'income_ceiling',
        status: 'fail',
        source,
        expected: 'Aadhaar name matches the application name',
        actual: `Aadhaar name does not match "${profile.fullName}"`,
        explanation:
          'The name on your Aadhaar differs from the name in this application. PFMS cannot credit a DBT instalment when the Aadhaar-seeded name does not match the beneficiary record, so the payment would be returned.',
        remediation: 'Update your Aadhaar name or use the exact spelling from your Aadhaar, then re-apply.',
      }),
    )
  } else {
    out.push(
      synthetic({
        ruleKey: 'aadhaar_name_match',
        ruleType: 'income_ceiling',
        status: 'pass',
        source,
        expected: 'Aadhaar name matches the application name',
        actual: 'Name and date of birth match Aadhaar',
        explanation:
          'Your name and date of birth match your Aadhaar record, so PFMS DBT payments will not be rejected for a name mismatch.',
      }),
    )
  }

  if (bankSeeded === false) {
    out.push(
      synthetic({
        ruleKey: 'aadhaar_seeded_bank',
        ruleType: 'income_ceiling',
        status: 'fail',
        source,
        expected: 'Bank account seeded with Aadhaar',
        actual: 'Bank account is not Aadhaar-seeded',
        explanation:
          'All five schemes are paid by PFMS DBT into an Aadhaar-seeded bank account. An unseeded account causes every instalment to be returned with NPCI mapper code 3054.',
        remediation:
          'Ask your bank to seed your account with Aadhaar (they can do it at any branch or through net banking), then update the passbook in your wallet.',
      }),
    )
  } else {
    out.push(
      synthetic({
        ruleKey: 'aadhaar_seeded_bank',
        ruleType: 'income_ceiling',
        status: 'pass',
        source,
        expected: 'Bank account seeded with Aadhaar',
        actual: 'Bank account is Aadhaar-seeded',
        explanation:
          'Your bank account is Aadhaar-seeded, so PFMS DBT instalments will be credited without a return.',
      }),
    )
  }

  // ST certificate name spelling variant → manual review, never a silent pass.
  const st = stCertificateFrom(input)
  if (st) {
    const { distance } = nameSimilarity(profile.fullName, st.nameOnDocument)
    if (distance > 0 && distance <= NAME_VARIANT_MAX) {
      // Close but not identical: the overwhelmingly common case is a
      // transliteration variant, which a human must confirm because a single
      // wrong character in the ST category blocks the sanction.
      out.push(
        synthetic({
          ruleKey: 'st_name_variant',
          ruleType: 'income_ceiling',
          status: 'review',
          severity: 'warning',
          source: 'edistrict',
          expected: `Name on ST certificate matches "${profile.fullName}"`,
          actual: `ST certificate reads "${st.nameOnDocument}" (${distance} character difference)`,
          diff: { field: 'name', a: profile.fullName, b: st.nameOnDocument },
          explanation:
            'The ST certificate uses a slightly different spelling of your name. This is very common across transliterations of tribal names, and a single wrong character in the ST category can block a sanction. A reviewer will confirm the match against the original certificate.',
          remediation: null,
        }),
      )
    } else if (distance > NAME_VARIANT_MAX) {
      out.push(
        synthetic({
          ruleKey: 'st_name_match',
          ruleType: 'income_ceiling',
          status: 'fail',
          source: 'edistrict',
          expected: `Name on ST certificate matches "${profile.fullName}"`,
          actual: `ST certificate reads "${st.nameOnDocument}"`,
          diff: { field: 'name', a: profile.fullName, b: st.nameOnDocument },
          explanation:
            'The name on your ST certificate is materially different from the name on this application. Applying under another category with mismatched names is not permitted, and a mismatch can lead to cancellation.',
          remediation: 'Use the exact name and spelling printed on your ST certificate, or get the certificate corrected first.',
        }),
      )
    }
  }

  return out
}

interface StCertificateLike {
  nameOnDocument: string
  valid: boolean
  reason?: string
  validTill?: string
}

function stCertificateFrom(input: VerificationInput): StCertificateLike | null {
  const ed = findConnector(input.connectors, 'edistrict')
  const data = asData(ed)
  const nameOnDocument = str(data.name)
  if (!nameOnDocument) return null
  return {
    nameOnDocument,
    valid: data.valid === true,
    reason: str(data.reason) ?? undefined,
    validTill: str(data.validTill) ?? undefined,
  }
}

/**
 * Income-certificate validity, surfaced as its own visible check so the
 * student sees the expiry date rather than a generic "income check failed".
 * e-District serves the ST certificate and the income certificate from the
 * same revenue register, so both arrive in one payload.
 */
export function incomeCertificateCheck(input: VerificationInput): VerificationCheck | null {
  const ed = findConnector(input.connectors, 'edistrict')
  if (!ed) return null
  const data = asData(ed)
  if (data.valid === undefined && data.reason === undefined) return null
  const valid = data.valid === true
  const till = str(data.incomeValidTill) ?? str(data.validTill)
  const authority = str(data.authority)
  return {
    id: nextId('income_certificate_validity'),
    ruleKey: 'income_certificate_validity',
    ruleType: 'domicile',
    label: 'Income certificate is currently valid',
    labelHi: 'आय प्रमाण पत्र वर्तमान में मान्य है',
    severity: 'blocker',
    status: valid ? 'pass' : 'fail',
    expected: 'A valid income certificate as on the date of application',
    actual: valid
      ? `Valid${till ? ` till ${till}` : ''}${authority ? `, issued by ${authority}` : ''}`
      : `${str(data.reason) ?? 'invalid'}${till ? ` (expired on ${till})` : ''}`,
    source: 'edistrict',
    sourceUrl: 'https://edistrict.*.gov.in',
    explanation: valid
      ? 'The e-District record confirms your income certificate is valid today, so the income ceiling check can rely on it.'
      : 'The issuing authority records this income certificate as no longer valid. Scholarship rules require a valid certificate at the time of application, so this must be renewed.',
    remediation: valid
      ? null
      : 'Apply for a fresh Income Certificate at your Block / Tehsil office (it is usually issued free of cost within 15 days).',
    checkedAt: new Date().toISOString(),
  }
}

/* ------------------------------------------------------------------ */
/* main entry point                                                    */
/* ------------------------------------------------------------------ */

export function verify(input: VerificationInput): VerificationOutput {
  seq = 0
  const checks: VerificationCheck[] = []

  for (const rule of input.rules) {
    checks.push(evaluateRule(rule, input))
  }

  const icCheck = incomeCertificateCheck(input)
  if (icCheck) checks.push(icCheck)
  checks.push(...crossChecks(input))

  // Documents become checks too, so the reviewer sees one unified list.
  const docEvaluations = evaluateDocuments(
    input.scheme.documentRequirements,
    input.documents,
    input.connectors,
    input.now,
  )
  for (const d of docEvaluations) {
    checks.push({
      id: nextId(`doc_${d.docType}`),
      ruleKey: `doc_${d.docType}`,
      ruleType: 'domicile',
      label: `Document: ${d.label}`,
      labelHi: `दस्तावेज: ${d.label}`,
      severity: d.requirement.mandatory ? 'blocker' : 'info',
      status: d.status,
      expected: d.requirement.mandatory ? 'Mandatory document present and valid' : 'Optional document',
      actual: d.detail,
      source: (d.source as VerificationSource) ?? 'self_declared',
      sourceUrl: null,
      explanation: d.requirement.mandatory
        ? `${d.label} is mandatory for the ${input.scheme.shortName} scheme.`
        : `${d.label} is optional and only strengthens the application.`,
      remediation:
        d.status === 'fail'
          ? d.detail.includes('expired')
            ? 'Get a renewed copy and upload it to your wallet.'
            : 'Upload this document to your wallet to continue.'
          : null,
      checkedAt: new Date().toISOString(),
    })
  }

  const blockingIssues = checks
    .filter((c) => c.severity === 'blocker' && (c.status === 'fail' || c.status === 'pending'))
    .map((c) => c.label)
  const warnings = checks
    .filter((c) => c.status === 'warning' || (c.severity !== 'blocker' && c.status === 'fail'))
    .map((c) => c.label)
  const needsReview = checks.some((c) => c.status === 'review')

  let overall: VerificationOutput['overall']
  if (blockingIssues.length > 0) overall = 'deficient'
  else if (needsReview) overall = 'manual_review'
  else overall = 'eligible'

  const mandatory = input.scheme.documentRequirements.filter((d) => d.mandatory)
  const mandatoryDocs = docEvaluations.filter(
    (d) => d.requirement.mandatory && d.status === 'pass',
  )
  const documentReadiness = mandatory.length === 0 ? 1 : mandatoryDocs.length / mandatory.length

  // Weighted risk: hard failures weigh most, review items meaningfully,
  // warnings lightly. Range 0..100, used only for queue ordering.
  const riskScore = Math.min(
    100,
    Math.round(
      checks.reduce((acc, c) => {
        if (c.status === 'fail') return acc + (c.severity === 'blocker' ? 30 : 10)
        if (c.status === 'review') return acc + (c.severity === 'blocker' ? 18 : 8)
        if (c.status === 'warning') return acc + 4
        if (c.status === 'pending') return acc + 5
        return acc
      }, 0),
    ),
  )

  return {
    overall,
    checks,
    blockingIssues,
    warnings,
    documentReadiness,
    riskScore,
    engineVersion: ENGINE_VERSION,
    checkedAt: new Date().toISOString(),
  }
}

/** One-line human summary used in toasts, lists and the chatbot. */
export function summarise(result: VerificationOutput): string {
  const total = result.checks.length
  const passed = result.checks.filter((c) => c.status === 'pass').length
  const failed = result.checks.filter((c) => c.status === 'fail').length
  const review = result.checks.filter((c) => c.status === 'review').length
  const parts = [`${passed} of ${total} checks passed`]
  if (failed) parts.push(`${failed} must be fixed`)
  if (review) parts.push(`${review} need a reviewer`)
  return parts.join(' · ')
}
