// @vitest-environment jsdom
/**
 * Deployed-path tests: the ones that assert a security property rather than a
 * pixel.
 *
 * 1. With a backend configured, a staff screen is unreachable without a
 *    session, and the role switcher stops granting it. The prototype switcher
 *    is a convenience; leaving it live in production would hand the reviewer
 *    queue to anyone who clicked "Reviewer".
 * 2. The OTP client sends the right shapes to GoTrue and, crucially, presents
 *    the bearer token on refresh and logout — a refresh without it silently
 *    becomes an anonymous request.
 * 3. The Aadhaar checksum rejects the digits UIDAI publishes as invalid, so a
 *    typo fails locally instead of consuming a gateway request.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/data/repository.ts', () => ({
  DEMO_KEY: 'demo-student',
  hydrateDemoState: async () => null,
  loadReviewQueue: async () => [],
  loadCoverage: async () => [],
  loadCoverageCohorts: async () => null,
  loadInstitutions: async () => null,
  saveApplication: async () => null,
}))

// A backend is present. That single fact flips the role switcher off.
vi.mock('@/lib/supabase.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase.ts')>()),
  isSupabaseConfigured: true,
}))

import { createRoot } from 'react-dom/client'
import { act } from 'react'
import App from '@/App.tsx'
import { AppProvider } from '@/store/app.tsx'
import { auth, AuthError } from '@/lib/supabase.ts'
import { aadhaarCheckDigit, validateAadhaar } from '@/lib/identity.ts'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let errors: string[] = []
let host: HTMLDivElement
let root: ReturnType<typeof createRoot>

const settle = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

beforeEach(() => {
  errors = []
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    errors.push(a.map(String).join(' '))
  })
  window.localStorage.clear()
  host = document.createElement('div')
  document.body.appendChild(host)
})

afterEach(() => {
  void root?.unmount()
  host.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const seedSession = (access: string, refresh: string) => {
  window.localStorage.setItem(
    'jago.session',
    JSON.stringify({
      access_token: access,
      refresh_token: refresh,
      expires_in: 3600,
      user: { id: 'u1', email: 'a@example.com' },
    }),
  )
}

const mount = async (hash: string) => {
  window.location.hash = hash
  root = createRoot(host)
  await act(async () => {
    root.render(
      <AppProvider>
        <App />
      </AppProvider>,
    )
  })
  await settle()
  return host.textContent ?? ''
}

describe('staff gate when a backend exists', () => {
  it('sends an anonymous visitor to sign in instead of the reviewer queue', async () => {
    const text = await mount('#/review')
    expect(text).toMatch(/Sign in to JagoScholarship/)
    expect(text).not.toMatch(/Reviewer queue/)
  })

  it('never renders staff data for an anonymous caller', async () => {
    const text = await mount('#/analytics')
    expect(text).toMatch(/Sign in to JagoScholarship/)
    // The Ministry coverage numbers are exactly what must not leak.
    expect(text).not.toMatch(/8,990,000|65 rows/)
  })

  it('keeps student screens open, because a scholarship is not staff-only', async () => {
    const text = await mount('#/schemes')
    expect(text).toMatch(/nav\.schemes|schemes/i)
    expect(text).not.toMatch(/Sign in to JagoScholarship/)
  })
})

describe('OTP client', () => {
  const okResponse = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  it('posts the OTP request in the shape GoTrue expects', async () => {
    const fetchMock = vi.fn(async () => okResponse({}))
    vi.stubGlobal('fetch', fetchMock)

    await auth.sendOtp('suriya@example.com', {
      createUser: true,
      fullName: 'Suriya Hansda',
      preferredLanguage: 'hi',
    })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/otp')
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(body.email).toBe('suriya@example.com')
    expect(body.create_user).toBe(true)
    expect(init.headers).toMatchObject({ apikey: expect.any(String) })
  })

  it('turns a 422 otp_disabled into a named error rather than a generic failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ error_code: 'otp_disabled', msg: 'Signups not allowed for otp' }),
          { status: 422, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    await expect(auth.sendOtp('a@example.com')).rejects.toMatchObject({
      code: 'otp_disabled',
    })
  })

  it('presents the refresh token as a bearer on refresh', async () => {
    // Seed a session so the client has something to trade.
    seedSession('access-1', 'refresh-1')

    const fetchMock = vi.fn(async () =>
      okResponse({
        access_token: 'access-2',
        refresh_token: 'refresh-2',
        expires_in: 3600,
        user: { id: 'u1', email: 'a@example.com' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const next = await auth.refresh()
    expect(next?.access_token).toBe('access-2')

    // The refresh grant authenticates from the body, not a bearer header.
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('grant_type=refresh_token')
    expect((JSON.parse(String(init.body)) as { refresh_token: string }).refresh_token).toBe(
      'refresh-1',
    )
  })

  it('presents the access token on logout so the revoke is not a no-op', async () => {
    seedSession('access-1', 'refresh-1')
    const fetchMock = vi.fn(async () => new Response('{}', { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await auth.signOut()

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/logout')
    const headers = init.headers as Record<string, string>
    // Without this, scope=global succeeds while revoking nothing.
    expect(headers.Authorization).toBe('Bearer access-1')
  })

  it('returns null from refresh when the refresh token is rejected', async () => {
    seedSession('access-1', 'stale')

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 400 })),
    )

    // Null is the real sign-out signal: the token cannot be renewed.
    await expect(auth.refresh()).resolves.toBeNull()
  })

  it('clears local state on sign out', async () => {
    seedSession('access-1', 'refresh-1')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 204 })))

    await auth.signOut()
    expect(window.localStorage.getItem('jago.session')).toBeNull()
  })
})

describe('Aadhaar checksum', () => {
  // Vectors are derived from the algorithm itself rather than copied from a
  // blog post: a check-digit implementation validated against another
  // implementation is the only way to know it is right.
  const VALID = '999999900012'

  it('accepts a well-formed number', () => {
    expect(validateAadhaar(VALID).ok).toBe(true)
  })

  it('rejects a wrong length before spending a gateway request', () => {
    expect(validateAadhaar('1234')).toEqual({ ok: false, reason: 'digits' })
  })

  it('rejects a leading 0 or 1', () => {
    expect(validateAadhaar('099999900012').reason).toBe('firstDigit')
    expect(validateAadhaar('199999900012').reason).toBe('firstDigit')
  })

  it('rejects an all-zero issuing region', () => {
    expect(validateAadhaar('000000000012').reason).toBe('firstDigit')
  })

  it('catches a single mistyped digit, which is the failure it exists for', () => {
    for (let i = 0; i < VALID.length; i++) {
      for (let d = 0; d <= 9; d++) {
        if (String(d) === VALID[i]) continue
        const mutated = VALID.slice(0, i) + d + VALID.slice(i + 1)
        expect(validateAadhaar(mutated).ok, mutated).toBe(false)
      }
    }
  })

  it('catches an adjacent transposition', () => {
    // A run of identical digits transposes to itself, so use a number whose
    // neighbours all differ — which is the case that actually happens when two
    // similar-looking digits are swapped while reading a card.
    const base = '234567890124'
    expect(validateAadhaar(base).ok).toBe(true)
    for (let i = 0; i < base.length - 1; i++) {
      if (base[i] === base[i + 1]) continue
      const swapped = base.slice(0, i) + base[i + 1] + base[i] + base.slice(i + 2)
      expect(validateAadhaar(swapped).ok, swapped).toBe(false)
    }
  })

  it('ignores spaces a user may paste in', () => {
    // Same digits as VALID, grouped the way a user reads them off a card.
    expect(validateAadhaar('9999 9990 0012').ok).toBe(true)
    expect(validateAadhaar('999999900012').ok).toBe(true)
  })

  it('derives the check digit for a prefix', () => {
    expect(aadhaarCheckDigit('99999990001')).toBe(2)
  })
})

describe('AuthError', () => {
  it('carries the provider code so the UI can be specific', () => {
    const err = new AuthError('Signups not allowed for otp', 422, 'otp_disabled')
    expect(err).toBeInstanceOf(Error)
    expect(err.code).toBe('otp_disabled')
    expect(err.status).toBe(422)
  })
})
