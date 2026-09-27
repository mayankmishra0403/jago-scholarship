/**
 * Deterministic mock connector adapters.
 *
 * Each adapter mirrors the shape of the real government system it stands in for
 * and returns the same field names the live integration would return, so
 * switching `mode` to `live` is a configuration change, not a rewrite. The
 * latency is simulated so the UI's loading states are exercised honestly.
 *
 * `simulateFailure` is used by the demo simulator panel to force a connector
 * error and show that a failed source routes to manual review instead of
 * silently failing a student.
 */

import type { ConnectorResult } from './eligibility.ts'
import type { StudentDocument, StudentProfile, VerificationSource } from './types.ts'

export type ConnectorMode = 'mock' | 'live'

export interface ConnectorContext {
  profile: StudentProfile
  documents: StudentDocument[]
  /** Connector names forced to fail by the demo simulator. */
  simulateFailure: Set<VerificationSource>
  mode: ConnectorMode
  /** Set false in tests to skip all simulated latency. */
  useLatency?: boolean
  /** Schemes whose rules need this connector; avoids pointless network calls. */
  schemeNeeds(connector: VerificationSource): boolean
}

const wait = (ms: number, enabled: boolean) =>
  enabled && ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve()

/** `fails` first so the simulator always wins over the happy path. */
function result(
  ctx: ConnectorContext,
  connector: VerificationSource,
  latencyMs: number,
  build: () => Record<string, unknown>,
  sourceUrl?: string,
): Promise<ConnectorResult> {
  const started = Date.now()
  const latency = ctx.useLatency === false ? 0 : latencyMs
  return wait(latency, true).then(() => {
    const base = { connector, ok: true, latencyMs: latency || Date.now() - started }
    if (ctx.simulateFailure.has(connector)) {
      return {
        ...base,
        ok: false,
        error: 'Simulated outage (demo simulator)',
        sourceUrl,
      } satisfies ConnectorResult
    }
    return { ...base, data: build(), sourceUrl } satisfies ConnectorResult
  })
}

/* ------------------------------------------------------------------ */

export const connectorUdisePlus = (ctx: ConnectorContext): Promise<ConnectorResult> =>
  result(
    ctx,
    'udise_plus',
    340,
    () => {
      const udise = demoUdise(ctx)
      if (!udise) {
        // Higher-education students are not in UDISE+; that is a clean miss,
        // not an error, and the engine routes the class check to the applicant.
        return { enrolled: false, applicable: false, reason: 'Not a school-level record' }
      }
      return udise
    },
    'https://udiseplus.gov.in',
  )

export const connectorAishe = (ctx: ConnectorContext): Promise<ConnectorResult> =>
  result(
    ctx,
    'aishe',
    360,
    () => ({
      verified: true,
      isTopClass: demoIsTopClass(ctx),
      isNfstHost: demoIsNfstHost(ctx),
      sanctionedSeats: 50,
      institutionName: ctx.profile.institutionName,
    }),
    'https://aishe.gov.in',
  )

/**
 * One e-District call returns both the ST certificate record and the income
 * certificate status — the real portal serves them from the same revenue
 * register, so they are a single round trip.
 */
export const connectorEDistrict = (ctx: ConnectorContext): Promise<ConnectorResult> =>
  result(
    ctx,
    'edistrict',
    880,
    () => ({
      // ST certificate: a real transliteration variant, not a made-up mismatch.
      category: 'ST',
      name: demoNameOnStCertificate(ctx.profile),
      tribe: 'Kondh',
      district: ctx.profile.district,
      state: ctx.profile.stateUt,
      validTill: '2029-03-31',
      authority: 'Sub-Divisional Officer, Sambalpur',
      // The income certificate in the demo wallet has lapsed — this is the
      // deficiency the reviewer queue is built around.
      valid: false,
      reason: 'expired',
      incomeValidTill: '2026-06-30',
    }),
    'https://edistrict.odisha.gov.in',
  )

export const connectorDigiLocker = (ctx: ConnectorContext): Promise<ConnectorResult> =>
  result(
    ctx,
    'digilocker',
    540,
    () => ({
      documents: ctx.documents.filter((d) => d.source === 'digilocker').length || 4,
      issuer: 'State Board of Secondary Education, Odisha',
      fetchMs: 540,
    }),
    'https://www.digilocker.gov.in',
  )

export const connectorUidai = (ctx: ConnectorContext): Promise<ConnectorResult> =>
  result(
    ctx,
    'uidai',
    610,
    () => ({
      nameMatch: ctx.profile.aadhaarNameMatches,
      dobMatch: true,
      bankSeeded: ctx.profile.bankAadhaarSeeded,
    }),
    'https://api.uidai.gov.in',
  )

export const connectorQs = (ctx: ConnectorContext): Promise<ConnectorResult> =>
  result(
    ctx,
    'qs',
    200,
    () => {
      const isOxford = /oxford/i.test(ctx.profile.institutionName)
      return isOxford
        ? { rank: 3, name: 'University of Oxford', edition: '2026' }
        : { rank: null, name: ctx.profile.institutionName, edition: '2026', resolvable: false }
    },
    'https://www.topuniversities.com',
  )

export const connectorNta = (ctx: ConnectorContext): Promise<ConnectorResult> =>
  result(
    ctx,
    'ugc_nta',
    300,
    () => ({ qualified: true, category: 'JRF', year: 2024, validTill: '2026-12-31' }),
    'https://www.nta.ac.in',
  )

export const connectorOtr = (ctx: ConnectorContext): Promise<ConnectorResult> =>
  result(
    ctx,
    'otr',
    240,
    () => ({
      registered: true,
      otrId: 'OTR-2025-0042-91',
      activeScholarships: ctx.profile.currentlyHoldsScholarship
        ? [{ code: 'pre_matric', status: 'sanctioned' }]
        : [],
    }),
    'https://scholarships.gov.in',
  )

export const connectorApaar = (ctx: ConnectorContext): Promise<ConnectorResult> =>
  result(
    ctx,
    'apaar',
    390,
    () => ({ found: Boolean(ctx.profile.apaarId), apaarId: ctx.profile.apaarId }),
    'https://www.apaar.education.gov.in',
  )

export const connectorPfms = (ctx: ConnectorContext): Promise<ConnectorResult> =>
  result(
    ctx,
    'pfms',
    300,
    () => ({ status: 'SUCCESS', batch: 'PFMS-2026-SEP-0114', utr: 'UTR2202609140012' }),
    'https://pfms.nic.in',
  )

/* ------------------------------------------------------------------ */
/* demo data hooks                                                     */
/* ------------------------------------------------------------------ */

/**
 * The demo's UDISE+ record only exists for the school student. The identifiers
 * below mirror the `mock_overrides` rows seeded in Supabase so the UI, the
 * database and the connectors all tell the same story.
 */
const DEMO_UDISE = '21240300101'
const DEMO_UNIVERSITY = /university of oxford/i

export const demoUdise = (ctx: ConnectorContext) => {
  if (!/college|university/i.test(ctx.profile.institutionName)) {
    return {
      enrolled: true,
      applicable: true,
      udise: DEMO_UDISE,
      class: ctx.profile.currentClass,
      rollNo: 'STU-2025-0042',
      apaarId: ctx.profile.apaarId,
    }
  }
  return null
}

const NOTIFIED = [
  'kisan science college',
  'sambalpur university',
  'rani durgavati',
  'rajiv gandhi university of knowledge',
  'st. xavier',
  'baba bhimrao ambedkar',
  'government college of music',
]

export const demoIsTopClass = (ctx: ConnectorContext) =>
  NOTIFIED.some((n) => ctx.profile.institutionName.toLowerCase().includes(n))

export const demoIsNfstHost = (ctx: ConnectorContext) =>
  NOTIFIED.some((n) => ctx.profile.institutionName.toLowerCase().includes(n)) ||
  /tribal college of education|nabarangpur/i.test(ctx.profile.institutionName)

export const demoNameOnStCertificate = (profile: StudentProfile) =>
  profile.fullName === 'Suriya Hansda' ? 'Suriya Hansdah' : profile.fullName

export const demoIsOverseasUniversity = (profile: StudentProfile) =>
  DEMO_UNIVERSITY.test(profile.institutionName)

/* ------------------------------------------------------------------ */
/* runner                                                              */
/* ------------------------------------------------------------------ */

const ALL_CONNECTORS: Array<[VerificationSource, (c: ConnectorContext) => Promise<ConnectorResult>]> =
  [
    ['udise_plus', connectorUdisePlus],
    ['aishe', connectorAishe],
    ['digilocker', connectorDigiLocker],
    ['uidai', connectorUidai],
    ['otr', connectorOtr],
    ['apaar', connectorApaar],
  ]

/** Connectors that are only called when a rule can actually consume them. */
const CONDITIONAL_CONNECTORS: Array<
  [VerificationSource, (c: ConnectorContext) => Promise<ConnectorResult>, (c: ConnectorContext) => boolean]
> = [
  ['edistrict', connectorEDistrict, (c) => c.schemeNeeds('edistrict')],
  ['qs', connectorQs, (c) => c.schemeNeeds('qs')],
  ['ugc_nta', connectorNta, (c) => c.schemeNeeds('ugc_nta')],
  ['pfms', connectorPfms, (c) => c.schemeNeeds('pfms')],
]

/**
 * Ids of every connector this build can actually run.
 *
 * Exported so the staff simulator can be checked against the registry instead
 * of against a hand-typed list. A simulator entry whose id is not registered
 * here is inert: `result()` only fails the connector whose own id is in
 * `simulateFailure`, so the toggle renders, looks live, and does nothing.
 */
export const REGISTERED_CONNECTORS: VerificationSource[] = [
  ...ALL_CONNECTORS.map(([id]) => id),
  ...CONDITIONAL_CONNECTORS.map(([id]) => id),
]

/** Runs every relevant connector in parallel and reports per-source latency. */
export async function runConnectors(
  ctx: ConnectorContext,
  activeSchemes: string[],
): Promise<ConnectorResult[]> {
  const scoped: ConnectorContext = {
    ...ctx,
    schemeNeeds: (c) => activeSchemes.includes(c),
  }
  const always = await Promise.all(ALL_CONNECTORS.map(([, f]) => f(scoped)))
  const conditional = await Promise.all(
    CONDITIONAL_CONNECTORS.filter(([, , needs]) => needs(scoped)).map(([, f]) => f(scoped)),
  )
  return [...always, ...conditional]
}
