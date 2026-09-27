import { readFileSync } from 'node:fs'
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
import { RULES, rulesFor, schemeByCode } from '../shared/catalogue.ts'
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

describe('NFST: rules verified against the scheme guidelines', () => {
  // Source: "National Fellowship & Scholarship for Higher Education of Scheduled
  // Tribe Students 2021-22 to 2025-26", sections 2.1-2.5. Note the mirror on
  // scholarships.gov.in is a partial extract starting at 5.4 and contains none
  // of this; the MoTA copy is the complete document.
  const nfstInput = (profile: Partial<StudentProfile> = {}) =>
    baseInput({
      scheme: schemeByCode('nfst')!,
      rules: rulesFor('nfst'),
      profile: cleanProfile({ courseLevel: 'm_phil', ...profile }),
    })

  const check = (key: string, profile: Partial<StudentProfile> = {}) =>
    verify(nfstInput(profile)).checks.find((c) => c.ruleKey === key)!

  it('applies the 36-year limit measured on 1 July of the award year', () => {
    // 2.3: "Maximum 36 years, as on first day of July of the relevant year of
    // award of scholarship." Born Aug 1989 => 36 on 2026-07-01, 37 in Sept.
    const born = '1989-08-15'
    const over = check('age_limit_36', { dateOfBirth: born })
    expect(over.actual).toContain('2026-07-01')
    expect(over.actual).toContain('36 years')
    expect(over.status).toBe('pass')
  })

  it('fails an applicant over 36 on the reference date', () => {
    expect(check('age_limit_36', { dateOfBirth: '1985-01-01' }).status).toBe('fail')
  })

  it('uses one flat limit for course levels that have no age band', () => {
    // NFST states a single figure, not per-course bands like NOS. `graduation`
    // and `post_graduation` resolve to no band, so without `flat` support these
    // fall through to a vague "course level does not map to an age band"
    // warning and the 36-year limit is never actually applied. Using only
    // m_phil/ph_d here would pass either way, because both map to the phd band.
    for (const level of ['graduation', 'post_graduation', 'secondary'] as const) {
      const c = verify(
        baseInput({
          scheme: schemeByCode('nfst')!,
          rules: rulesFor('nfst'),
          profile: cleanProfile({ courseLevel: level, dateOfBirth: '1985-01-01' }),
        }),
      ).checks.find((x) => x.ruleKey === 'age_limit_36')!
      expect(c.status, level).toBe('fail')
      expect(c.label, level).toContain('36')
    }
  })

  it('treats the 55% PG marks requirement as a real condition', () => {
    // 2.1 (ii): "minimum 55% marks at the final examination/grading at PG
    // level". No marks field on the profile, so it must go to a reviewer rather
    // than silently pass.
    const c = check('marks_55_pg')
    expect(c).toBeDefined()
    expect(c.severity).toBe('blocker')
    expect(c.status).toBe('skipped')
    expect(c.explanation).toMatch(/reviewer/i)
  })

  it('records that the scheme has no income criterion', () => {
    // 2.2: "There is no income criteria for eligibility in respect of this
    // scholarship." Encoding a ceiling here would wrongly exclude poor students
    // from a means-tested-looking scheme that has no means test.
    expect(schemeByCode('nfst')!.incomeCeiling).toBeNull()
    expect(rulesFor('nfst').some((r) => r.ruleType === 'income_ceiling')).toBe(false)
  })

  it('does not block on a low-slot-count scheme wrongly, and keeps 750', () => {
    expect(schemeByCode('nfst')!.slotsPerYear).toBe(750)
  })

  it('states the official slot split, with Divyangjan first', () => {
    // 2.5 (ii): Divyangjan 38, PVTG 25, Female 225, ST Others 462. The previous
    // text said "PVTG first, then female, then BPL" - BPL appears nowhere in the
    // guidelines and Divyangjan was missing entirely.
    const order = schemeByCode('nfst')!.benefit.priorityOrder
    expect(order).toMatch(/Divyangjan.*38/)
    expect(order).toMatch(/PVTG.*25/)
    expect(order).toMatch(/Female.*225/)
    expect(order).toMatch(/ST Others.*462/)
    expect(order).not.toMatch(/BPL/)
  })

  it('cites the complete guidelines document for every NFST rule', () => {
    // Guards the regression where rules cited a partial PDF that did not
    // contain the eligibility section at all.
    const good = 'guidelines/NFS/GuidelinesFellowshipandScholarship2022.pdf'
    for (const r of rulesFor('nfst')) {
      expect(r.sourceUrl, r.ruleKey).toContain(good)
    }
    expect(schemeByCode('nfst')!.sourceUrl).toContain(good)
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

  it('does not fail a candidate whose university is outside the top 1000', () => {
    // The 2021-26 NOS guidelines make QS top 1000 a priority provision, not an
    // eligibility bar: candidates already admitted to a top 1000 institute are
    // exempt from the 55% marks test and placed first in the merit list. A
    // candidate ranked below it is still eligible, just lower in the merit
    // list, so this must not be a fail.
    const check = verify(nosInput({}, { rank: 1450, name: 'Some University' })).checks.find(
      (c) => c.ruleKey === 'qs_top_1000',
    )!
    expect(check.status).toBe('pass')
    expect(check.severity).toBe('info')
    expect(check.explanation).toMatch(/does not make you ineligible/i)
  })

  it('never tells a candidate a lower-ranked university makes them ineligible', () => {
    // This exact sentence shipped in the app and was a fabrication: the NOS
    // guidelines contain no such limit. Assert on the wording so it cannot
    // creep back in through a refactor.
    const out = verify(nosInput({}, { rank: 1450, name: 'Some University' }))
    const blob = out.checks.map((c) => `${c.explanation} ${c.expected} ${c.label}`).join(' ')
    expect(blob).not.toMatch(/not eligible/i)
    expect(blob).not.toMatch(/limited to the top/i)
  })

  it('does not block a NOS application on QS rank alone', () => {
    // The harm this guards: a student who satisfies every real criterion was
    // told they were ineligible purely because of university ranking.
    const out = verify(
      nosInput({ dateOfBirth: '1996-01-01' }, { rank: 1450, name: 'Some University' }),
    )
    expect(out.blockingIssues.join(' ')).not.toMatch(/QS|rank/i)
  })

  it('waives the marks test and notes priority for a top-1000 institute', () => {
    const check = verify(nosInput({}, { rank: 3, name: 'University of Oxford' })).checks.find(
      (c) => c.ruleKey === 'qs_top_1000',
    )!
    expect(check.status).toBe('pass')
    expect(check.explanation).toMatch(/55% marks test is waived/i)
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

  it('measures age on 1 July of the selection year, not the day of applying', () => {
    // The guidelines say "Maximum Age as on 1st July of selection year". Age on
    // the application date can be a year higher, and for a blocker that decides
    // the outcome, so the reference date has to be the official one.
    const check = verify(
      nosInput({ dateOfBirth: '1994-08-01' }, { rank: 3, name: 'University of Oxford' }),
    ).checks.find((c) => c.ruleKey === 'age_limit')!
    // Born Aug 1994 => 31 on 2026-07-01, but 32 on the 2026-09-26 test clock.
    expect(check.actual).toContain('2026-07-01')
    expect(check.actual).toContain('31 years')
    expect(check.status).toBe('pass')
  })

  it('still applies the 55% marks requirement as a real condition', () => {
    // The marks test is the actual academic bar for NOS. It has no automated
    // data source yet, so it must degrade to "a reviewer checks it" rather than
    // silently passing — omission would be as wrong as the QS over-claim was.
    const check = verify(nosInput({}, { rank: 3, name: 'University of Oxford' })).checks.find(
      (c) => c.ruleKey === 'marks_55',
    )!
    expect(check).toBeDefined()
    expect(check.severity).toBe('blocker')
    expect(check.status).toBe('skipped')
    expect(check.explanation).toMatch(/reviewer/i)
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

/**
 * The runtime reads rules from Supabase; this file is the offline mirror. When
 * the two disagree the app answers differently depending on whether the DB is
 * reachable, which is the worst failure mode for an eligibility tool: the same
 * student gets a different answer depending on network conditions.
 *
 * This guard exists because that divergence actually shipped — the NOS
 * `qs_top_1000` severity differed between the two copies, denying eligible
 * students when the DB was down.
 */
describe('catalogue matches the Supabase seed', () => {
  const seed = readFileSync(
    new URL('../supabase/migrations/20260101000100_seed_reference.sql', import.meta.url),
    'utf8',
  )

  /** Pull `('code','key','type','params','severity',` rows out of the seed. */
  const seedRules = (): Map<string, { ruleType: string; severity: string }> => {
    const out = new Map<string, { ruleType: string; severity: string }>()
    const re =
      /\('([a-z_]+)'\s*,\s*'([a-z0-9_]+)'\s*,\s*'([a-z_]+)'\s*,\s*'(\{[^']*\})'\s*,\s*'(blocker|warning|info)'/g
    let m: RegExpExecArray | null
    while ((m = re.exec(seed)) !== null) {
      const [, code, key, ruleType, , severity] = m
      // Later migrations amend rows; the last write wins, same as in Postgres.
      out.set(`${code}/${key}`, { ruleType, severity })
    }
    return out
  }

  it('finds the NOS rules in the seed', () => {
    const rules = seedRules()
    expect(rules.has('nos/qs_top_1000')).toBe(true)
    expect(rules.has('nos/age_limit')).toBe(true)
  })

  it('agrees on rule_type and severity for every seeded rule', () => {
    // Baseline seed plus every correction migration, in order. The baseline is
    // deliberately left untouched so the corrections stay auditable, which means
    // reading only the seed would report the pre-correction severities.
    const corrections = [
      '20260101001200_correct_nos_rules_against_guidelines.sql',
      '20260101001300_correct_nfst_rules_against_guidelines.sql',
    ].map((f) =>
      readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8'),
    )
    const effective = new Map([
      ...seedRules(),
      ...corrections.flatMap((sql) => [...seedRulesFrom(sql)]),
    ])
    const mismatches: string[] = []

    for (const rule of RULES) {
      const row = effective.get(`${rule.schemeCode}/${rule.ruleKey}`)
      if (!row) {
        mismatches.push(`${rule.schemeCode}/${rule.ruleKey}: missing from SQL`)
        continue
      }
      if (row.ruleType !== rule.ruleType) {
        mismatches.push(
          `${rule.schemeCode}/${rule.ruleKey}: ruleType ts=${rule.ruleType} sql=${row.ruleType}`,
        )
      }
      if (row.severity !== rule.severity) {
        mismatches.push(
          `${rule.schemeCode}/${rule.ruleKey}: severity ts=${rule.severity} sql=${row.severity}`,
        )
      }
    }
    expect(mismatches).toEqual([])
  })

  it('never seeds a blocker whose only basis is a QS rank', () => {
    // Guards the specific regression: eligibility was denied on ranking alone.
    for (const rule of RULES) {
      if (rule.ruleType === 'qs_rank') {
        expect(
          rule.severity,
          `${rule.schemeCode}/${rule.ruleKey} must not block on QS rank`,
        ).not.toBe('blocker')
      }
    }
  })
})

/** Rows written by an `insert ... values` or `update` in a later migration. */
function seedRulesFrom(sql: string): Map<string, { ruleType: string; severity: string }> {
  const out = new Map<string, { ruleType: string; severity: string }>()
  const insertRe =
    /\('([a-z_]+)'\s*,\s*'([a-z0-9_]+)'\s*,\s*'([a-z_]+)'\s*,\s*'(\{[^']*\})'\s*,\s*'(blocker|warning|info)'/g
  let m: RegExpExecArray | null
  while ((m = insertRe.exec(sql)) !== null) {
    out.set(`${m[1]}/${m[2]}`, { ruleType: m[3], severity: m[5] })
  }
  // `update ... set severity = 'info' where scheme_code='nos' and rule_key='x'`
  const updateRe =
    /update\s+public\.scheme_rules\s+set\s+severity\s*=\s*'(blocker|warning|info)'[^;]*?where\s+scheme_code\s*=\s*'([a-z_]+)'\s+and\s+rule_key\s*=\s*'([a-z0-9_]+)'/gis
  while ((m = updateRe.exec(sql)) !== null) {
    out.set(`${m[2]}/${m[3]}`, { ruleType: out.get(`${m[2]}/${m[3]}`)?.ruleType ?? 'qs_rank', severity: m[1] })
  }
  return out
}
