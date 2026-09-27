/**
 * Tests for the Aadhaar endpoint.
 *
 * This file is the only place a partner credential is read, so its behaviour
 * under the awkward cases matters more than its happy path: it must refuse a
 * bad number without calling UIDAI, it must not leak the number back to the
 * browser, and it must report "not configured" as such rather than as a failed
 * match. A student being told their Aadhaar did not match because an
 * integration is switched off is a serious harm, and it is the easiest mistake
 * to make here.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../api/identity/aadhaar.ts'

const MATCH = '210800000126'

interface FakeRes {
  statusCode: number
  body: unknown
  status(code: number): FakeRes
  json(payload: unknown): FakeRes
}

function mockRes(): FakeRes {
  const res: FakeRes = {
    statusCode: 0,
    body: undefined,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.body = payload
      return this
    },
  }
  return res
}

/**
 * The only cast in this file. VercelResponse is a full http.ServerResponse with
 * ~60 members; building a real one to assert on a status code is not worth it,
 * and the handler only ever touches status() and json().
 */
async function invoke(req: unknown, res: FakeRes): Promise<void> {
  await handler(req as never, res as never)
}

function mockReq(overrides: Record<string, unknown> = {}) {
  return {
    method: 'POST',
    body: { aadhaar: MATCH, otp: '123456' },
    headers: {},
    ...overrides,
  } as never
}

describe('aadhaar endpoint', () => {
  const saved = { ...process.env }

  beforeEach(() => {
    delete process.env.UIDAI_GATEWAY_URL
    delete process.env.UIDAI_CLIENT_ID
    delete process.env.UIDAI_CLIENT_SECRET
  })

  afterEach(() => {
    process.env = { ...saved }
    vi.unstubAllGlobals()
  })

  it('reports unconfigured rather than a failed match', async () => {
    const res = mockRes()
    await invoke(mockReq(), res)
    expect(res.statusCode).toBe(501)
    expect(res.body).toEqual({ error: 'not_configured' })
  })

  it('reports liveness and whether it is configured', async () => {
    const res = mockRes()
    await invoke(mockReq({ method: 'GET' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ok: true, configured: false })
  })

  it('rejects a bad checksum without spending a gateway call', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    process.env.UIDAI_GATEWAY_URL = 'https://auth.uidai.gov.in/v2/aadhaar/auth'
    process.env.UIDAI_CLIENT_ID = 'id'
    process.env.UIDAI_CLIENT_SECRET = 'secret'

    const res = mockRes()
    await invoke(mockReq({ body: { aadhaar: '210800000127', otp: '123456' } }), res)

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'invalid_aadhaar' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a malformed otp', async () => {
    const res = mockRes()
    await invoke(mockReq({ body: { aadhaar: MATCH, otp: 'abc' } }), res)
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'invalid_otp' })
  })

  it('refuses a method other than GET or POST', async () => {
    const res = mockRes()
    await invoke(mockReq({ method: 'DELETE' }), res)
    expect(res.statusCode).toBe(405)
  })

  it('never echoes the full number back to the caller', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ verified: true, name: 'SURYA HANSDA' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    process.env.UIDAI_GATEWAY_URL = 'https://auth.uidai.gov.in/v2/aadhaar/auth'
    process.env.UIDAI_CLIENT_ID = 'id'
    process.env.UIDAI_CLIENT_SECRET = 'secret'

    const res = mockRes()
    await invoke(mockReq(), res)

    expect(res.statusCode).toBe(200)
    const serialised = JSON.stringify(res.body)
    expect(serialised).not.toContain(MATCH)
    expect((res.body as Record<string, unknown>).aadhaarLastFour).toBe('0126')
  })

  it('sends the credentials server-side and the number in the body, not the URL', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ verified: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    process.env.UIDAI_GATEWAY_URL = 'https://auth.uidai.gov.in/v2/aadhaar/auth'
    process.env.UIDAI_CLIENT_ID = 'partner-id'
    process.env.UIDAI_CLIENT_SECRET = 'partner-secret'

    await invoke(mockReq(), mockRes())

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    // Query strings are written to proxy and load-balancer access logs.
    expect(url).not.toContain(MATCH)
    expect((init.headers as Record<string, string>).client_secret).toBe('partner-secret')
    expect(JSON.parse(String(init.body)).aadhaar).toBe(MATCH)
  })

  it('does not relay an upstream error body, which can echo the number', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(`aadhaar ${MATCH} rejected`, { status: 400 })),
    )
    process.env.UIDAI_GATEWAY_URL = 'https://auth.uidai.gov.in/v2/aadhaar/auth'
    process.env.UIDAI_CLIENT_ID = 'id'
    process.env.UIDAI_CLIENT_SECRET = 'secret'

    const res = mockRes()
    await invoke(mockReq(), res)

    expect(res.statusCode).toBe(502)
    expect(JSON.stringify(res.body)).not.toContain(MATCH)
  })
})
