/**
 * Aadhaar / DigiLocker identity verification.
 *
 * ---------------------------------------------------------------------------
 * THE LEGAL CONSTRAINT, STATED PLAINLY
 * ---------------------------------------------------------------------------
 * There is no public Aadhaar verification API that an app can call directly.
 * UIDAI issues credentials only to registered gateway partners, and obtaining
 * one requires a registered entity, an Aadhaar KYC licence, and a signed
 * agreement. The `auth.uidai.gov.in` endpoints are not self-serve; an
 * unauthenticated call does not return data.
 *
 * Separately, Aadhaar is a "restricted identifier" under the Aadhaar Act 2016,
 * s.57. The consequence that matters for this module: a private app may not
 * *display* a full Aadhaar number and may not *store* one. It is not forbidden
 * from *transmitting* one to a registered gateway — that transmission is the
 * whole point of a consented e-KYC — but the gateway credentials used to make
 * that call are a different matter entirely (see `UidaiGatewayProvider`).
 *
 * Getting this distinction wrong in either direction is a real risk: claiming
 * "we never transmit your Aadhaar" while shipping a browser that does exactly
 * that would be a false assurance on a government identity flow, which is worse
 * than saying nothing.
 *
 * So this module is deliberately built as an *adapter*:
 *
 *   - `IdentityProvider` is the interface a real gateway plugs into.
 *   - `DemoIdentityProvider` is the default. It is labelled as a simulation in
 *     the UI, keeps only the last four digits, and can never claim to have
 *     verified anything against the government register.
 *   - `UidaiGatewayProvider` is a real implementation, fully written, waiting
 *     only for credentials that this project does not have. It is the piece
 *     that becomes live the moment a partner agreement exists. It holds *no*
 *     credentials itself — see the note on that class for why that matters.
 *
 * What the browser is allowed to see: a verification *result* — matched or not,
 * name-as-per-record, and a masked number. Never the number itself, and never a
 * gateway secret.
 *
 * DigiLocker's OAuth flow, by contrast, is public and free, so that half is
 * genuinely implementable and is included.
 *
 * Reference: UIDAI Aadhaar Authentication API v2.1 (partner-restricted).
 * Reference: DigiLocker OAuth 2.0, https://digilocker.gov.in
 */

import type { LanguageCode } from '@shared/types.ts'
import { t } from '@shared/i18n.ts'

/* ------------------------------------------------------------------ */
/* types                                                               */
/* ------------------------------------------------------------------ */

/** Everything a provider may return. Note what is absent: the Aadhaar number. */
export interface IdentityResult {
  /** Whether the number matched the government register. */
  matched: boolean
  /** Name as it appears on the Aadhaar record, for transliteration review. */
  nameOnRecord: string | null
  /** Year of birth, used only to disambiguate a name match. Never the DOB itself. */
  birthYear: number | null
  /** Exactly four digits. The rest is discarded by the provider, not masked here. */
  maskedNumber: string
  /** ISO timestamp of the check. */
  verifiedAt: string
  /** Which implementation answered — surfaced in the UI, never hidden. */
  provider: string
  /** True when no real government register was consulted. */
  simulated: boolean
}

export interface VerifyRequest {
  /** 12 digits. Only ever present in memory, for the duration of one request. */
  aadhaarNumber: string
  /** OTP received on the registered mobile, if the provider requires one. */
  otp?: string
  /**
   * The caller's Supabase access token.
   *
   * Sent to our own gateway so the server can tell who is asking rather than
   * trusting an anonymous caller, and so it can rate-limit per user. It is the
   * user's own token, not a partner credential.
   */
  accessToken?: string
}

/**
 * Numbers that exercise both branches of the simulator.
 *
 * Exported so the on-screen hint, the tests and any future walkthrough all
 * quote the same values. A hint that suggests a number failing the checksum is
 * worse than no hint: it looks like a broken product.
 *
 * Both were derived with the Verhoeff implementation above and both satisfy it,
 * which is the point — validation runs *before* the match/miss branch, so an
 * invalid fixture can never reach it.
 */
export const DEMO_FIXTURES = {
  /** Passes validation, last four are not 9999, so the match branch runs. */
  match: '2108 0000 0126',
  /**
   * Passes validation, last four are 9999, so the "not on the register" branch
   * runs.
   *
   * Twelve digits, in 4-4-4 grouping. The earlier hint here read
   * `9999 9999 9999 9999` — four groups of four, i.e. sixteen digits — so it
   * was rejected on length before it ever reached the branch it was meant to
   * demonstrate. The symptom was a demo that looked like a broken verifier.
   */
  miss: '9999 9999 9999',
} as const

export type VerifyOutcome =
  | { status: 'verified'; result: IdentityResult }
  | { status: 'not_found'; reason: string }
  | { status: 'invalid_input'; reason: string }
  | { status: 'unavailable'; reason: string }

export interface IdentityProvider {
  readonly id: string
  readonly label: string
  /** False for every adapter until a partner agreement is in place. */
  readonly simulated: boolean
  /** Documentation link shown in the consent screen. */
  readonly authority: string
  verify(request: VerifyRequest): Promise<VerifyOutcome>
}

/* ------------------------------------------------------------------ */
/* validation                                                          */
/* ------------------------------------------------------------------ */

/**
 * Verhoeff check digit, implemented the way it is published and independently
 * reimplemented everywhere else — the D5 multiplication table combined with the
 * position permutation table, walking the digits right to left. A valid number
 * ends with a checksum of 0.
 *
 * This catches every single-digit typo and every adjacent transposition, which
 * is the whole point: the failure it prevents is a student reading "8" as "3"
 * off a plastic card and being told the number is invalid.
 *
 * It is a *format* check. It says nothing about whether the number exists, which
 * only the gateway can answer.
 */
const D: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]

const P: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]

/**
 * Running Verhoeff checksum. Zero means the number as a whole is well-formed.
 *
 * The walk starts at the rightmost digit on purpose. The dihedral multiplication
 * is not commutative, so processing the same digits in the other order yields a
 * different answer and every valid number would be reported as invalid.
 */
function verhoeffChecksum(digits: string): number {
  let c = 0
  for (let position = 0; position < digits.length; position++) {
    const digit = Number(digits[digits.length - 1 - position])
    c = D[c][P[position % 8][digit]]
  }
  return c
}

/** The digit that would make this 11-digit prefix a valid 12-digit number. */
export function aadhaarCheckDigit(prefix: string): number {
  for (let x = 0; x <= 9; x++) {
    if (verhoeffChecksum(prefix + String(x)) === 0) return x
  }
  return -1
}

/** Structural + checksum validation. Catches typos before any network call. */
export function validateAadhaar(raw: string): { ok: boolean; reason?: string } {
  const n = raw.replace(/\D/g, '')
  if (n.length !== 12) return { ok: false, reason: 'digits' }
  if (n[0] === '0' || n[0] === '1') return { ok: false, reason: 'firstDigit' }

  // The first six digits encode the issuing state or country and are never
  // all-zero; catching that here saves a pointless gateway round trip.
  if (Number(n.slice(0, 6)) === 0) return { ok: false, reason: 'region' }

  return verhoeffChecksum(n) === 0 ? { ok: true } : { ok: false, reason: 'checksum' }
}

/* ------------------------------------------------------------------ */
/* providers                                                           */
/* ------------------------------------------------------------------ */

/**
 * The default. Simulates a register lookup against a fixed fixture so the flow
 * is demonstrable end to end without claiming to have contacted UIDAI.
 *
 * Two fixtures exist on purpose: one that matches, one that does not, so the
 * transliteration-review path can be demonstrated.
 */
export class DemoIdentityProvider implements IdentityProvider {
  readonly id = 'demo-simulator'
  readonly label = 'Simulated register (demo mode)'
  readonly simulated = true
  readonly authority = 'No government register is contacted in this build.'

  async verify({ aadhaarNumber }: VerifyRequest): Promise<VerifyOutcome> {
    const check = validateAadhaar(aadhaarNumber)
    if (!check.ok) return { status: 'invalid_input', reason: check.reason ?? 'invalid' }

    const maskedNumber = aadhaarNumber.slice(-4)

    // A deliberate fixture: 1234 5678 0123 fails the checksum, so a valid
    // checksum is required to reach the match/miss branch. `9999` is treated as
    // "not on the register" to make the miss path easy to demo.
    if (maskedNumber === '9999') {
      return {
        status: 'not_found',
        reason: 'No record was returned for this number.',
      }
    }

    await new Promise((r) => setTimeout(r, 900)) // a real gateway takes time

    return {
      status: 'verified',
      result: {
        matched: true,
        // The whole point of the check: the wallet's name and the Aadhaar name
        // often differ in spelling, and that is a review item, not a rejection.
        nameOnRecord: 'SURYA HANSDA',
        birthYear: 2010,
        maskedNumber,
        verifiedAt: new Date().toISOString(),
        provider: this.id,
        simulated: true,
      },
    }
  }
}

/**
 * Real UIDAI gateway integration.
 *
 * This is not a stub — the two-step shape (a gateway request, then the OTP the
 * gateway sends to the registered mobile) and the response fields are what
 * UIDAI's Aadhaar Authentication API v2.1 specifies. It stays inert until a
 * `gatewayUrl` is configured, which requires a registered partner agreement. It
 * returns `unavailable` rather than pretending.
 *
 * WHY THIS CLASS HAS NO CREDENTIALS
 * ---------------------------------
 * The obvious implementation takes a `clientId` and a `clientSecret` and sends
 * them as headers. That version is a credential leak waiting to happen, and the
 * reason is not subtle: in a Vite app every `VITE_*` variable is inlined into
 * the JavaScript bundle, so a `VITE_UIDAI_CLIENT_SECRET` is not a secret at all.
 * It ships to every visitor, sits in browser history and devtools, and is
 * trivially scraped. A partner secret is issued to a registered entity under a
 * signed agreement; publishing it to the internet ends that agreement rather
 * than merely embarrassing the team.
 *
 * So the browser talks only to *our* endpoint (`api/identity/aadhaar.ts`), and
 * that endpoint adds the partner credentials server-side, where they are read
 * from the environment at request time and never leave the server. The browser
 * sends the signed-in user's own token instead, which identifies a person
 * without conferring any authority over UIDAI.
 */
export class UidaiGatewayProvider implements IdentityProvider {
  readonly id = 'uidai-gateway'
  readonly label = 'UIDAI Aadhaar Authentication (partner gateway)'
  readonly simulated = false
  readonly authority = 'Unique Identification Authority of India'

  /** Our own server endpoint, not a UIDAI URL. */
  constructor(private readonly gatewayUrl: string) {}

  async verify({ aadhaarNumber, otp, accessToken }: VerifyRequest): Promise<VerifyOutcome> {
    const check = validateAadhaar(aadhaarNumber)
    if (!check.ok) return { status: 'invalid_input', reason: check.reason ?? 'invalid' }
    if (!otp) {
      return { status: 'invalid_input', reason: 'otp' }
    }

    try {
      const res = await fetch(this.gatewayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        // The number travels one hop to our own server, which adds the partner
        // credentials. It is never sent straight to UIDAI from a browser: that
        // request has to be signed with a secret the browser cannot hold.
        body: JSON.stringify({ aadhaar: aadhaarNumber, otp }),
      })

      if (res.status === 501 || res.status === 503) {
        return {
          status: 'unavailable',
          reason:
            'The verification gateway is not configured. A registered UIDAI partner agreement is required; see the Aadhaar page for what that involves.',
        }
      }

      if (res.status === 401 || res.status === 403) {
        return {
          status: 'unavailable',
          reason: 'Sign in before running a live identity check.',
        }
      }

      if (!res.ok) {
        return {
          status: 'not_found',
          reason: `Gateway responded ${res.status}.`,
        }
      }

      const body = (await res.json()) as {
        verified?: boolean
        name?: string
        yearOfBirth?: number
        aadhaarLastFour?: string
      }

      if (!body.verified) {
        return { status: 'not_found', reason: 'The number did not match the register.' }
      }

      return {
        status: 'verified',
        result: {
          matched: true,
          nameOnRecord: body.name ?? null,
          birthYear: body.yearOfBirth ?? null,
          // Prefer the gateway's own masking; never reconstruct the full number.
          maskedNumber: body.aadhaarLastFour ?? aadhaarNumber.slice(-4),
          verifiedAt: new Date().toISOString(),
          provider: this.id,
          simulated: false,
        },
      }
    } catch {
      return {
        status: 'unavailable',
        reason: 'The verification gateway could not be reached.',
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* selection                                                           */
/* ------------------------------------------------------------------ */

export interface ProviderConfig {
  /**
   * URL of *our* server endpoint that fronts UIDAI. A non-empty value is what
   * distinguishes a live build from a simulated one, and it is deliberately the
   * only input: there is no field in which a partner secret could be supplied,
   * so no caller can reintroduce the browser-exposed-credential bug by mistake.
   */
  gatewayUrl?: string
}

/**
 * Prefer a real gateway when one is configured, otherwise the simulator.
 *
 * This is the only place the choice is made, so there is a single answer to
 * "is this build talking to UIDAI?" — and it is never answered implicitly by a
 * component deep in the tree.
 */
export function resolveProvider(cfg: ProviderConfig): IdentityProvider {
  if (cfg.gatewayUrl) {
    return new UidaiGatewayProvider(cfg.gatewayUrl)
  }
  return new DemoIdentityProvider()
}

/* ------------------------------------------------------------------ */
/* DigiLocker                                                          */
/* ------------------------------------------------------------------ */

export interface DigiLockerConfig {
  clientId?: string
  redirectUri?: string
}

/**
 * DigiLocker's OAuth 2.0 *is* public and free, so unlike UIDAI this can be
 * genuinely wired up given a client id. It returns a consent URL rather than
 * performing a redirect, so the caller controls the navigation and can show
 * the consent explanation first — which is the behaviour the UIDAI/DigiLocker
 * guidelines require anyway.
 */
export function digilockerAuthorizeUrl(
  cfg: DigiLockerConfig,
  state: string,
): { url: string; configured: boolean } {
  if (!cfg.clientId || !cfg.redirectUri) {
    return { url: '', configured: false }
  }
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    // `scopes=DigLocker.eKYC` is the minimum for identity use.
    scopes: 'DigLocker.eKYC',
    state,
  })
  return {
    url: `https://digilocker.gov.in/oauth/v2/authorize?${params.toString()}`,
    configured: true,
  }
}

/* ------------------------------------------------------------------ */
/* messages                                                            */
/* ------------------------------------------------------------------ */

export const identityMessage = (
  outcome: VerifyOutcome,
  lang: LanguageCode,
): string => {
  const l = lang === 'hi' ? 'hi' : 'en'
  switch (outcome.status) {
    case 'verified':
      return t(l, 'aadhaar.msg.verified')
    case 'not_found':
      return outcome.reason
    case 'invalid_input':
      return t(l, `aadhaar.err.${outcome.reason}`)
    case 'unavailable':
      return outcome.reason
  }
}
