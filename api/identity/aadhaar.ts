/**
 * Aadhaar verification endpoint.
 *
 * This is the only place a UIDAI partner credential is read. The browser has no
 * secret to leak because it never had one: `src/lib/identity.ts` posts the
 * number here, and the `client_secret` is attached below, server-side, from the
 * environment.
 *
 * Configure as server-side environment variables (note the absence of the
 * `VITE_` prefix — with it, Vite would inline the value into the bundle and
 * hand it to every visitor):
 *
 *   UIDAI_GATEWAY_URL    e.g. https://auth.uidai.gov.in/v2/aadhaar/auth
 *   UIDAI_CLIENT_ID      issued under the partner agreement
 *   UIDAI_CLIENT_SECRET  issued under the partner agreement
 *
 * Until those are set the endpoint answers 501, which the client reports as
 * "not configured" rather than as a verification failure. A user must never be
 * told their Aadhaar did not match because the integration is switched off.
 *
 * Not yet implemented, and deliberately not faked: rate limiting, per-user
 * attempt caps, and the OTP-initiation step of UIDAI's two-step flow. The
 * blocking behaviour is rate limiting — without it this endpoint would let
 * anyone use the partner quota to brute-force an Aadhaar number, which is a far
 * worse outcome than a verification that does not work.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

/** Mirrors validateAadhaar in src/lib/identity.ts; the server does not trust the client. */
const D = [
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
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]

function checksum(digits: string): number {
  let c = 0
  for (let p = 0; p < digits.length; p++) {
    c = D[c][P[p % 8][Number(digits[digits.length - 1 - p])]]
  }
  return c
}

function validAadhaar(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false
  const n = raw.replace(/\D/g, '')
  if (n.length !== 12) return false
  if (n[0] === '0' || n[0] === '1') return false
  return checksum(n) === 0
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // GET is a liveness probe, not an API surface.
  if (req.method === 'GET') {
    const configured = Boolean(
      process.env.UIDAI_GATEWAY_URL &&
        process.env.UIDAI_CLIENT_ID &&
        process.env.UIDAI_CLIENT_SECRET,
    )
    return res.status(200).json({ ok: true, configured })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const { aadhaar, otp } = (req.body ?? {}) as { aadhaar?: unknown; otp?: unknown }

  // Validate here even though the client already did: the client is a
  // convenience, not a trust boundary.
  if (!validAadhaar(aadhaar)) {
    return res.status(400).json({ error: 'invalid_aadhaar' })
  }
  if (typeof otp !== 'string' || !/^\d{4,8}$/.test(otp)) {
    return res.status(400).json({ error: 'invalid_otp' })
  }

  const gatewayUrl = process.env.UIDAI_GATEWAY_URL
  const clientId = process.env.UIDAI_CLIENT_ID
  const clientSecret = process.env.UIDAI_CLIENT_SECRET

  if (!gatewayUrl || !clientId || !clientSecret) {
    return res.status(501).json({ error: 'not_configured' })
  }

  const digits = aadhaar.replace(/\D/g, '')

  try {
    const upstream = await fetch(gatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        client_id: clientId,
        client_secret: clientSecret,
      },
      // Aadhaar goes in the body, never the query string: query strings are
      // written to access logs by proxies and load balancers.
      body: JSON.stringify({ aadhaar: digits, otp }),
    })

    if (!upstream.ok) {
      // Deliberately vague. Upstream error text can echo the number back.
      return res.status(502).json({ verified: false, error: 'gateway_error' })
    }

    const body = (await upstream.json()) as {
      verified?: boolean
      name?: string
      yearOfBirth?: number
    }

    return res.status(200).json({
      verified: Boolean(body.verified),
      name: body.name ?? null,
      yearOfBirth: body.yearOfBirth ?? null,
      // Masked here, once, at the boundary. The full number is not echoed back
      // to the browser under any circumstance.
      aadhaarLastFour: digits.slice(-4),
    })
  } catch {
    return res.status(502).json({ verified: false, error: 'gateway_unreachable' })
  }
}
