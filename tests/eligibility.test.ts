import { describe, expect, it } from 'vitest'
import {
  ENGINE_VERSION,
  evaluateDocuments,
  editDistance,
  nameSimilarity,
  summarise,
  verify,
  type ConnectorResult,
  type VerificationInput,
} from '../shared/eligibility.ts'
import { rulesFor, schemeByCode } from '../shared/catalogue.ts'
import { DEMO_DOCUMENTS, DEMO_PROFILE } from '../shared/demo.ts'
import type {
  Institution,
  StudentDocument,
  StudentProfile,
  VerificationSource,
} from '../shared/types.ts'

const NOW = new Date('2026-09-26T00:00:00Z')

const ok = (connector: VerificationSource, data: Record<string, unknown> = {}): ConnectorResult => ({
  connector,
  ok: true,
  latencyMs: 100,
  data,
})

const fail = (connector: VerificationSource, error = 'timeout'): ConnectorResult => ({
  connector,
  ok: false,
  latencyMs: 100,
  error,
})

/**
 * A complete, currently-valid document set for a scheme. Used by tests whose
 * claim is about a *different* check, so a missing document cannot mask it.
 */
const docsFor = (schemeCode: string): StudentDocument[] =>
  schemeByCode(schemeCode)!.documentRequirements.map((req, i) => ({
    id: `full-${i}`,
    docType: req.docType,
    fileName: `${req.docType}.pdf`,
    storagePath: null,
    mimeType: 'application/pdf',
    sizeBytes: 100_000,
    status: 'valid' as const,
    validTill: '2029-03-31',
    source: 'upload' as const,
    matchedApplicationId: null,
    uploadedAt: '2026-01-01T00:00:00Z',
  }))

/** A profile with no outstanding problem, so only the rule under test can fail. */
const cleanProfile = (over: Partial<StudentProfile> = {}): StudentProfile => ({
  ...DEMO_PROFILE,
  incomeCertificateValidTill: '2029-03-31',
  bankAadhaarSeeded: true,
  aadhaarNameMatches: true,
  ...over,
})

const baseInput = (overrides: Partial<VerificationInput> = {}): VerificationInput => {
  const scheme = schemeByCode('pre_matric')!
  return {
    scheme,
    rules: rulesFor('pre_matric'),
    profile: DEMO_PROFILE,
    documents: DEMO_DOCUMENTS,
    institution: null,
    connectors: [],
    heldSchemes: [],
    now: NOW,
    ...overrides,
  }
}

describe('nameSimilarity', () => {
  it('treats a one-character transliteration variant as similar', () => {
    const r = nameSimilarity('Suriya Hansda', 'Suriya Hansdah')
    expect(r.similar).toBe(true)
    expect(r.distance).toBe(1)
  })

  it('rejects a genuinely different name', () => {
    const r = nameSimilarity('Suriya Hansda', 'Birendra Munda')
    expect(r.similar).toBe(false)
  })

  it('ignores case, punctuation and spacing', () => {
    const r = nameSimilarity('SUNITA  KUMARI', 'Sunita Kumari')
    expect(r.similar).toBe(true)
  })

  it('editDistance is symmetric and zero for identical strings', () => {
    expect(editDistance('abc', 'abc')).toBe(0)
    expect(editDistance('abc', 'abd')).toBe(editDistance('abd', 'abc'))
  })
})

describe('income ceiling', () => {
  const withIncome = (annualFamilyIncome: number, incomeCertificateValidTill: string | null) =>
    baseInput({
      profile: { ...DEMO_PROFILE, annualFamilyIncome, incomeCertificateValidTill },
      connectors: [ok('edistrict', { valid: true, incomeValidTill: incomeCertificateValidTill })],
    })

  it('passes when income is within the Rs. 2.50 lakh ceiling', () => {
    const out = verify(withIncome(180000, '2029-03-31'))
    const check = out.checks.find((c) => c.ruleKey === 'income_2_5lakh')!
    expect(check.status).toBe('pass')
  })

  it('fails with a clear reason when income exceeds the ceiling', () => {
    const out = verify(withIncome(320000, '2029-03-31'))
    const check = out.checks.find((c) => c.ruleKey === 'income_2_5lakh')!
    expect(check.status).toBe('fail')
    expect(check.explanation).toContain('2,50,000')
    expect(check.remediation).toBeTruthy()
  })

  it('fails a within-ceiling student whose income certificate has lapsed', () => {
    const out = verify(withIncome(180000, '2026-06-30'))
    const check = out.checks.find((c) => c.ruleKey === 'income_2_5lakh')!
    expect(check.status).toBe('fail')
    expect(check.explanation).toContain('2026-06-30')
    expect(check.remediation).toMatch(/fresh|renew/i)
  })

  it('treats exactly the ceiling as eligible', () => {
    const out = verify(withIncome(250000, '2029-03-31'))
    expect(out.checks.find((c) => c.ruleKey === 'income_2_5lakh')!.status).toBe('pass')
  })
})

describe('class level', () => {
  const withClass = (currentClass: string) =>
    baseInput({ profile: { ...DEMO_PROFILE, currentClass } })

  it('accepts Class IX and X for Pre-Matric', () => {
    for (const c of ['IX', 'X']) {
      expect(verify(withClass(c)).checks.find((x) => x.ruleKey === 'class_ix_x')!.status).toBe('pass')
    }
  })

  it('rejects Class XI for Pre-Matric and suggests what to do', () => {
    const check = verify(withClass('XI')).checks.find((x) => x.ruleKey === 'class_ix_x')!
    expect(check.status).toBe('fail')
    expect(check.remediation).toMatch(/notified/i)
  })
})

describe('one scheme at a time', () => {
  it('passes when the student holds nothing', () => {
    const check = verify(baseInput()).checks.find((c) => c.ruleKey === 'one_scheme_at_a_time')!
    expect(check.status).toBe('pass')
  })

  it('warns rather than blocks when another scholarship is held', () => {
    const out = verify(
      baseInput({
        profile: { ...DEMO_PROFILE, currentlyHoldsScholarship: true, heldScholarshipDetails: 'Pre-Matric 2025' },
      }),
    )
    const check = out.checks.find((c) => c.ruleKey === 'one_scheme_at_a_time')!
    expect(check.status).toBe('warning')
    expect(out.overall).not.toBe('blocked')
    expect(check.explanation).toContain('surrendered')
  })
})

describe('institution notification', () => {
  const topClassInput = (institutionFlags: Partial<Institution>) =>
    baseInput({
      scheme: schemeByCode('top_class')!,
      rules: rulesFor('top_class'),
      profile: { ...DEMO_PROFILE, currentClass: 'XII', courseLevel: 'graduation' },
      institution: {
        id: 'i1',
        name: 'Test College',
        type: 'college',
        stateUt: 'Odisha',
        district: 'Balangir',
        affiliation: 'government',
        udisePlus: null,
        aisheCode: 'U-COL-OD-1244',
        aisheVerified: true,
        isTopClassInstitute: true,
        isNfstHost: true,
        nosEligible: true,
        qsRank: null,
        naacGrade: 'A+',
        ...institutionFlags,
      },
    })

  it('passes for a notified Top Class institute', () => {
    const check = verify(topClassInput({ isTopClassInstitute: true })).checks.find(
      (c) => c.ruleKey === 'notified_institute',
    )!
    expect(check.status).toBe('pass')
  })

  it('fails for a non-notified institute and names the AISHE status', () => {
    const out = verify(topClassInput({ isTopClassInstitute: false }))
    const check = out.checks.find((c) => c.ruleKey === 'notified_institute')!
    expect(check.status).toBe('fail')
    expect(out.overall).toBe('deficient')
    expect(check.remediation).toMatch(/notified institute/i)
  })
})

describe('NFST course level', () => {
  it('rejects a student who has not yet completed post-graduation', () => {
    const check = verify(
      baseInput({
        scheme: schemeByCode('nfst')!,
        rules: rulesFor('nfst'),
        profile: { ...DEMO_PROFILE, courseLevel: 'graduation' },
      }),
    ).checks.find((c) => c.ruleKey === 'post_graduation_required')!
    expect(check.status).toBe('fail')
  })

  it('accepts a full-time Ph.D scholar', () => {
    const check = verify(
      baseInput({
        scheme: schemeByCode('nfst')!,
        rules: rulesFor('nfst'),
        profile: { ...DEMO_PROFILE, courseLevel: 'ph_d' },
      }),
    ).checks.find((c) => c.ruleKey === 'post_graduation_required')!
    expect(check.status).toBe('pass')
  })
})

describe('NOS: QS ranking and age limit', () => {
  const nosInput = (profile: Partial<StudentProfile>, data: Record<string, unknown>) =>
    baseInput({
      scheme: schemeByCode('nos')!,
      rules: rulesFor('nos'),
      profile: cleanProfile({ institutionName: 'University of Oxford', courseLevel: 'masters_abroad', ...profile }),
      connectors: [ok('qs', data)],
    })

  it('passes for a top-1000 university', () => {
    const check = verify(nosInput({}, { rank: 3, name: 'University of Oxford' })).checks.find(
      (c) => c.ruleKey === 'qs_top_1000',
    )!
    expect(check.status).toBe('pass')
  })

  it('fails outside the top 1000', () => {
    const check = verify(nosInput({}, { rank: 1450, name: 'Some University' })).checks.find(
      (c) => c.ruleKey === 'qs_top_1000',
    )!
    expect(check.status).toBe('fail')
  })

  it('routes an unresolvable ranking to a human reviewer instead of failing', () => {
    const out = verify(
      baseInput({
        scheme: schemeByCode('nos')!,
        rules: rulesFor('nos'),
        profile: cleanProfile({ institutionName: 'University of Oxford', courseLevel: 'masters_abroad' }),
        documents: docsFor('nos'),
        connectors: [ok('qs', { rank: null })],
      }),
    )
    const check = out.checks.find((c) => c.ruleKey === 'qs_top_1000')!
    expect(check.status).toBe('review')
    expect(out.overall).toBe('manual_review')
    expect(out.blockingIssues).not.toContain(check.label)
  })

  it('applies the Masters age limit of 32', () => {
    const over = verify(
      nosInput({ dateOfBirth: '1990-01-01' }, { rank: 3, name: 'University of Oxford' }),
    ).checks.find((c) => c.ruleKey === 'age_limit')!
    expect(over.status).toBe('fail')
    expect(over.actual).toMatch(/years/)
  })

  it('passes a 30-year-old Masters applicant', () => {
    const check = verify(
      nosInput({ dateOfBirth: '1996-01-01' }, { rank: 3, name: 'University of Oxford' }),
    ).checks.find((c) => c.ruleKey === 'age_limit')!
    expect(check.status).toBe('pass')
  })
})

describe('e-District failure routes to manual review, never a silent fail', () => {
  it('does not fail a student when the certificate source is down', () => {
    const out = verify(
      baseInput({
        profile: cleanProfile(),
        documents: docsFor('pre_matric'),
        connectors: [fail('edistrict')],
      }),
    )
    const check = out.checks.find((c) => c.ruleKey === 'domicile_required')!
    expect(check.status).toBe('review')
    expect(check.explanation).toMatch(/reviewer/i)
    // The outage itself must never be the reason a student is blocked.
    expect(out.checks.filter((c) => c.source === 'edistrict' && c.status === 'fail')).toHaveLength(0)
  })

  it('routes to manual review when the outage is the only problem', () => {
    const out = verify(
      baseInput({
        profile: cleanProfile(),
        documents: docsFor('pre_matric'),
        connectors: [fail('edistrict')],
      }),
    )
    expect(out.overall).toBe('manual_review')
    expect(out.blockingIssues).toHaveLength(0)
  })

  it('still blocks a genuinely expired income certificate', () => {
    const out = verify(
      baseInput({
        profile: { ...DEMO_PROFILE, incomeCertificateValidTill: '2026-06-30' },
        documents: docsFor('pre_matric'),
        connectors: [ok('edistrict', { name: 'Suriya Hansda', valid: false, incomeValidTill: '2026-06-30' })],
      }),
    )
    expect(out.overall).toBe('deficient')
  })
})

describe('ST certificate name variant', () => {
  it('flags a transliteration variant for reviewer confirmation', () => {
    const out = verify(
      baseInput({
        profile: cleanProfile(),
        documents: docsFor('pre_matric'),
        connectors: [ok('edistrict', { name: 'Suriya Hansdah', valid: true, incomeValidTill: '2029-03-31' })],
      }),
    )
    const check = out.checks.find((c) => c.ruleKey === 'st_name_variant')!
    expect(check.status).toBe('review')
    expect(check.diff).toEqual({ field: 'name', a: 'Suriya Hansda', b: 'Suriya Hansdah' })
    expect(check.explanation).toMatch(/transliteration|slightly different/i)
  })

  it('fails a materially different name instead of routing it to review', () => {
    const out = verify(
      baseInput({
        profile: cleanProfile(),
        documents: docsFor('pre_matric'),
        connectors: [ok('edistrict', { name: 'Birendra Munda', valid: true, incomeValidTill: '2029-03-31' })],
      }),
    )
    const check = out.checks.find((c) => c.ruleKey === 'st_name_match')!
    expect(check.status).toBe('fail')
  })

  it('does not flag an exactly matching name', () => {
    const out = verify(
      baseInput({
        profile: cleanProfile(),
        documents: docsFor('pre_matric'),
        connectors: [ok('edistrict', { name: 'Suriya Hansda', valid: true, incomeValidTill: '2029-03-31' })],
      }),
    )
    expect(out.checks.find((c) => c.ruleKey === 'st_name_variant')).toBeUndefined()
  })
})

describe('Aadhaar and bank cross-checks', () => {
  it('fails an unseeded bank account with the actual PFMS return code', () => {
    const out = verify(
      baseInput({
        profile: cleanProfile({ bankAadhaarSeeded: false }),
        connectors: [ok('uidai', { nameMatch: true, bankSeeded: false })],
      }),
    )
    const check = out.checks.find((c) => c.ruleKey === 'aadhaar_seeded_bank')!
    expect(check.status).toBe('fail')
    expect(check.explanation).toContain('3054')
  })

  it('fails a name mismatch because PFMS would reject the payment', () => {
    const out = verify(
      baseInput({
        profile: cleanProfile({ aadhaarNameMatches: false }),
        connectors: [ok('uidai', { nameMatch: false, bankSeeded: true })],
      }),
    )
    expect(out.checks.find((c) => c.ruleKey === 'aadhaar_name_match')!.status).toBe('fail')
  })

  it('passes when UIDAI confirms both', () => {
    const out = verify(
      baseInput({
        profile: cleanProfile(),
        connectors: [ok('uidai', { nameMatch: true, bankSeeded: true })],
      }),
    )
    expect(out.checks.find((c) => c.ruleKey === 'aadhaar_name_match')!.status).toBe('pass')
    expect(out.checks.find((c) => c.ruleKey === 'aadhaar_seeded_bank')!.status).toBe('pass')
  })
})

describe('document wallet', () => {
  const requirements = schemeByCode('pre_matric')!.documentRequirements

  it('marks an expired document as failed with a renewal hint', () => {
    const evals = evaluateDocuments(requirements, DEMO_DOCUMENTS, [], NOW)
    const income = evals.find((e) => e.docType === 'income_certificate')!
    expect(income.status).toBe('fail')
    expect(income.detail).toMatch(/expired/i)
  })

  it('treats an auto-fetchable document as satisfied without an upload', () => {
    const evals = evaluateDocuments(requirements, [], [ok('edistrict', { valid: true })], NOW)
    const st = evals.find((e) => e.docType === 'st_certificate')!
    expect(st.status).toBe('pass')
    expect(st.source).toBe('edistrict')
    expect(st.documentId).toBeNull()
  })

  it('computes readiness as the share of mandatory documents that pass', () => {
    const out = verify(baseInput({ documents: DEMO_DOCUMENTS }))
    expect(out.documentReadiness).toBeGreaterThan(0)
    expect(out.documentReadiness).toBeLessThan(1)
  })

  it('reuses one ST certificate across schemes', () => {
    const postMatric = schemeByCode('post_matric')!
    const stReq = postMatric.documentRequirements.find((d) => d.docType === 'st_certificate')!
    expect(stReq.reusable).toBe(true)
    const evals = evaluateDocuments([stReq], DEMO_DOCUMENTS, [], NOW)
    expect(evals[0]!.status).toBe('pass')
    expect(evals[0]!.reusable).toBe(true)
  })

  it('handles a document present but rejected', () => {
    const docs: StudentDocument[] = [
      { ...DEMO_DOCUMENTS[0]!, id: 'x', docType: 'domicile', status: 'rejected' },
    ]
    const evals = evaluateDocuments(requirements, docs, [], NOW)
    expect(evals.find((e) => e.docType === 'domicile')!.detail).toMatch(/rejected/i)
  })
})

describe('overall verdict and risk score', () => {
  it('reports deficient when a blocker fails', () => {
    const out = verify(baseInput({ profile: { ...DEMO_PROFILE, annualFamilyIncome: 400000 } }))
    expect(out.overall).toBe('deficient')
    expect(out.blockingIssues.length).toBeGreaterThan(0)
  })

  it('reports eligible for a clean record', () => {
    const out = verify(
      baseInput({
        profile: cleanProfile(),
        documents: docsFor('pre_matric'),
        institution: {
          id: 'i1', name: 'Biju Patnaik Government High School, Rairakhol', type: 'school',
          stateUt: 'Odisha', district: 'Sambalpur', affiliation: 'government', udisePlus: '21240300101',
          aisheCode: null, aisheVerified: false, isTopClassInstitute: false, isNfstHost: false,
          nosEligible: false, qsRank: null, naacGrade: null,
        },
        connectors: [
          ok('edistrict', { valid: true, name: 'Suriya Hansda', state: 'Odisha', incomeValidTill: '2029-03-31' }),
          ok('uidai', { nameMatch: true, bankSeeded: true }),
          ok('digilocker', { documents: 4 }),
        ],
      }),
    )
    expect(out.blockingIssues).toEqual([])
    expect(out.overall).toBe('eligible')
    expect(out.riskScore).toBeLessThan(20)
    expect(out.documentReadiness).toBe(1)
  })

  it('stamps the engine version on every result', () => {
    expect(verify(baseInput()).engineVersion).toBe(ENGINE_VERSION)
  })

  it('always produces a one-line summary', () => {
    const s = summarise(verify(baseInput()))
    expect(s).toMatch(/checks passed/)
  })
})
