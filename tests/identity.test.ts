/**
 * Tests for the identity adapter.
 *
 * Two things are being defended here, and they are not the same kind of thing.
 *
 * 1. Correctness of the Verhoeff implementation, which decides whether a real
 *    student reading their card correctly is told their number is invalid.
 *
 * 2. The absence of a credential in the browser bundle. `VITE_UIDAI_CLIENT_SECRET`
 *    would be inlined into the JavaScript and shipped to every visitor, so the
 *    test for it is a source scan rather than a behavioural assertion: there is
 *    no observable behaviour of "a secret is not present", only a fact about the
 *    text of the source.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEMO_FIXTURES,
  DemoIdentityProvider,
  UidaiGatewayProvider,
  aadhaarCheckDigit,
  resolveProvider,
  validateAadhaar,
} from '@/lib/identity.ts'

/* ------------------------------------------------------------------ */
/* Verhoeff                                                            */
/* ------------------------------------------------------------------ */

describe('validateAadhaar', () => {
  it('accepts a well-formed number', () => {
    expect(validateAadhaar('2108 0000 0126').ok).toBe(true)
  })

  it('rejects the wrong digit count', () => {
    expect(validateAadhaar('2108 0000 012').reason).toBe('digits')
  })

  it('rejects a leading zero or one', () => {
    // Aadhaar numbers issued in India start at 2.
    expect(validateAadhaar('1234 5678 9012').reason).toBe('firstDigit')
  })

  it('catches every single-digit typo', () => {
    // The failure this exists to prevent: a student misreads one digit off a
    // plastic card and is told the number is invalid.
    const valid = '210800000126'
    for (let i = 0; i < valid.length; i++) {
      for (let d = 0; d <= 9; d++) {
        if (String(d) === valid[i]) continue
        const mutated = valid.slice(0, i) + d + valid.slice(i + 1)
        expect(validateAadhaar(mutated).ok, `mutation at ${i} to ${d}`).toBe(false)
      }
    }
  })

  it('catches every adjacent transposition', () => {
    const valid = '210800000126'
    for (let i = 0; i < valid.length - 1; i++) {
      if (valid[i] === valid[i + 1]) continue
      const swapped =
        valid.slice(0, i) + valid[i + 1] + valid[i] + valid.slice(i + 2)
      expect(validateAadhaar(swapped).ok, `swap at ${i}`).toBe(false)
    }
  })

  it('derives the check digit', () => {
    for (const prefix of ['21080000012', '99999999999', '55550000000']) {
      const digit = aadhaarCheckDigit(prefix)
      expect(digit).toBeGreaterThanOrEqual(0)
      expect(validateAadhaar(prefix + digit).ok).toBe(true)
    }
  })

  it('is order sensitive, as the dihedral multiplication is', () => {
    // Guards against a well-meaning "simplification" to a plain weighted sum,
    // which passes most cases and silently accepts a few invalid ones.
    const digits = '210800000126'
    expect(validateAadhaar(digits).ok).toBe(true)
    expect(validateAadhaar([...digits].reverse().join('')).ok).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/* demo fixtures                                                       */
/* ------------------------------------------------------------------ */

describe('DEMO_FIXTURES', () => {
  // A hint that suggests a number failing the checksum is worse than no hint:
  // it looks like a broken product. So the advertised fixtures are tested, not
  // assumed.
  it.each([
    ['match', DEMO_FIXTURES.match],
    ['miss', DEMO_FIXTURES.miss],
  ])('%s fixture has twelve digits, so it can reach the branch it demos', (_name, n) => {
    // Guards the exact mistake the miss fixture used to contain: sixteen digits
    // in 4-4-4-4 grouping, rejected on length before the demo branch ran.
    expect(n.replace(/\D/g, ''), `${n} digit count`).toHaveLength(12)
    expect(validateAadhaar(n).ok, `${n} must validate`).toBe(true)
  })

  it('the miss fixture is distinguishable by its last four digits', () => {
    // The simulator keys the not-found branch off this, so the two fixtures
    // must not collide.
    expect(DEMO_FIXTURES.miss.replace(/\D/g, '').slice(-4)).toBe('9999')
    expect(DEMO_FIXTURES.match.replace(/\D/g, '').slice(-4)).not.toBe('9999')
  })
})

describe('DemoIdentityProvider', () => {
  const provider = new DemoIdentityProvider()

  it('is always labelled simulated', () => {
    expect(provider.simulated).toBe(true)
  })

  it('verifies the match fixture and returns a name, not a number', async () => {
    const out = await provider.verify({ aadhaarNumber: DEMO_FIXTURES.match })
    expect(out.status).toBe('verified')
    if (out.status !== 'verified') return
    expect(out.result.nameOnRecord).toBe('SURYA HANSDA')
    // The only trace of the number allowed to escape.
    expect(out.result.maskedNumber).toHaveLength(4)
    expect(out.result.maskedNumber).toBe(DEMO_FIXTURES.match.replace(/\D/g, '').slice(-4))
    expect(out.result.simulated).toBe(true)
  })

  it('returns not_found for the miss fixture rather than a false match', async () => {
    const out = await provider.verify({ aadhaarNumber: DEMO_FIXTURES.miss })
    expect(out.status).toBe('not_found')
  })

  it('rejects a bad checksum before reporting a register miss', async () => {
    const out = await provider.verify({ aadhaarNumber: '2108 0000 0127' })
    expect(out.status).toBe('invalid_input')
    expect(out.status === 'invalid_input' && out.reason).toBe('checksum')
  })
})

/* ------------------------------------------------------------------ */
/* provider selection                                                  */
/* ------------------------------------------------------------------ */

describe('resolveProvider', () => {
  it('is simulated when no gateway url is configured', () => {
    expect(resolveProvider({}).simulated).toBe(true)
  })

  it('selects the gateway when a url is configured', () => {
    expect(resolveProvider({ gatewayUrl: '/api/identity/aadhaar' }).simulated).toBe(false)
  })

  it('has no configuration through which a secret could be supplied', () => {
    // Structural guarantee: the secret cannot be reintroduced by a caller
    // because there is no field to put it in.
    const provider = resolveProvider({
      // @ts-expect-error - a secret field must not exist on the config
      uidaiClientSecret: 'leaked-secret',
    })
    expect(provider).toBeInstanceOf(DemoIdentityProvider)
    expect(provider.simulated).toBe(true)
  })
})

/* ------------------------------------------------------------------ */
/* the gateway request                                                 */
/* ------------------------------------------------------------------ */

describe('UidaiGatewayProvider', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends no credential material to the server', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ verified: true, name: 'X', aadhaarLastFour: '0126' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new UidaiGatewayProvider('/api/identity/aadhaar')
    await provider.verify({
      aadhaarNumber: DEMO_FIXTURES.match,
      otp: '123456',
      accessToken: 'user-jwt',
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const headers = init.headers as Record<string, string>

    expect(url).toBe('/api/identity/aadhaar')
    expect(headers.client_id).toBeUndefined()
    expect(headers.client_secret).toBeUndefined()
    // The user's own token identifies the caller without conferring authority.
    expect(headers.Authorization).toBe('Bearer user-jwt')
  })

  it('reports an unconfigured gateway as unavailable, not as a failed match', async () => {
    // The distinction matters to a real student: "not configured" and "your
    // Aadhaar did not match" must never be the same message.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 501 })))
    const out = await new UidaiGatewayProvider('/api/identity/aadhaar').verify({
      aadhaarNumber: DEMO_FIXTURES.match,
      otp: '123456',
    })
    expect(out.status).toBe('unavailable')
  })

  it('demands the otp before calling out', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const out = await new UidaiGatewayProvider('/api/identity/aadhaar').verify({
      aadhaarNumber: DEMO_FIXTURES.match,
    })
    expect(out.status).toBe('invalid_input')
    expect(out.status === 'invalid_input' && out.reason).toBe('otp')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

/* ------------------------------------------------------------------ */
/* source scan: no partner secret in the browser                       */
/* ------------------------------------------------------------------ */

describe('browser bundle hygiene', () => {
  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) sourceFiles(full, out)
      else if (/\.(ts|tsx|js|jsx)$/.test(entry)) out.push(full)
    }
    return out
  }

  it('no VITE_ variable carries a UIDAI secret', () => {
    // Vite inlines every VITE_* value into the bundle, so a secret behind that
    // prefix is a published secret. The endpoint reads its credentials from
    // non-VITE server variables instead.
    //
    // Matched on `import.meta.env.` specifically rather than the bare name, so
    // that the prose in identity.ts explaining *why* the variable is forbidden
    // does not trip the scan that enforces it.
    const offenders: string[] = []
    for (const file of [...sourceFiles('src'), ...sourceFiles('shared')]) {
      const text = readFileSync(file, 'utf8')
      if (/import\.meta\.env\.VITE_[A-Z_]*(SECRET|PRIVATE_KEY)/.test(text)) {
        offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })

  it('the Aadhaar endpoint keeps credentials out of the client env example', () => {
    const example = readFileSync('.env.example', 'utf8')
    expect(example).not.toMatch(/UIDAI_CLIENT_SECRET=/)
  })
})

/* ------------------------------------------------------------------ */
/* the staff simulator must address real connectors                     */
/* ------------------------------------------------------------------ */

describe('staff simulator sources', () => {
  it('every simulator entry names a connector that is actually registered', async () => {
    // The NTA toggle used to be `nta` while connectorNta reports `ugc_nta`.
    // Nothing errored; the control simply never did anything, which is the
    // worst kind of bug in a panel whose job is to demonstrate failures.
    const { REGISTERED_CONNECTORS } = await import('@shared/connectors.ts')
    const staff = readFileSync('src/pages/Staff.tsx', 'utf8')

    const ids = [...staff.matchAll(/\{\s*id:\s*'([a-z_]+)',\s*label:\s*'staff\.sim\./g)].map(
      (m) => m[1] as string,
    )

    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) {
      expect(REGISTERED_CONNECTORS, `simulator id "${id}" is not a registered connector`).toContain(
        id as never,
      )
    }
  })
})
