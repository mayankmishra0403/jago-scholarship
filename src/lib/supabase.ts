/**
 * Minimal PostgREST client.
 *
 * The app needed exactly eight operations from supabase-js — select with
 * equality filters, order, limit, single-row fetch, insert, update-by-id and a
 * session read. Pulling in the full client for that also dragged along the
 * realtime websocket layer and the GoTrue auth machinery, which together
 * accounted for roughly a third of the shipped bundle and are not used: this
 * prototype has no login UI, and RLS is enforced by PostgREST from the
 * publishable key.
 *
 * So this module implements that subset directly over `fetch`. The builder
 * shape is deliberately compatible with the calls in `data/repository.ts`, so
 * the repository does not need rewriting.
 *
 * If real authentication is added later, reintroduce `@supabase/supabase-js`
 * for the auth surface only and keep this module for data access.
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && key)

const REST = url ? `${url.replace(/\/$/, '')}/rest/v1` : ''

/** PostgREST error shape, which the repository surfaces directly. */
export interface PgError {
  code: string
  message: string
  details: string
  hint: string
}

export interface PgResult<T> {
  data: T | null
  error: PgError | null
}

/* ------------------------------------------------------------------ */
/* session                                                             */
/* ------------------------------------------------------------------ */

export interface AuthUser {
  id: string
  email: string | null
  phone: string | null
  user_metadata: Record<string, unknown>
}

export interface AuthSession {
  access_token: string
  refresh_token: string
  /** Seconds until the access token expires. */
  expires_in: number
  expires_at: number
  user: AuthUser
}

const SESSION_KEY = 'jago.session'

function readSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AuthSession
    // An expired token is worse than none: PostgREST would reject it and the app
    // would look offline rather than signed out.
    if (parsed.expires_at * 1000 <= Date.now()) {
      localStorage.removeItem(SESSION_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writeSession(session: AuthSession | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    /* private mode — the session simply will not survive a reload */
  }
}

type AuthListener = (session: AuthSession | null) => void
const listeners = new Set<AuthListener>()

function emit(): void {
  const session = readSession()
  for (const fn of listeners) {
    try {
      fn(session)
    } catch {
      /* a bad listener must not break auth for the others */
    }
  }
}

/** A malformed or expired refresh token means "signed out", not "throw". */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = '',
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

const AUTH = url ? `${url.replace(/\/$/, '')}/auth/v1` : ''

async function goTrue(
  path: string,
  body: Record<string, unknown>,
  method: 'POST' | 'GET' = 'POST',
  /**
   * Presented as `Authorization: Bearer`. Required by `/logout`: with
   * `scope=global` the server has to know *whose* sessions to revoke, and
   * without this header the call silently succeeds while revoking nothing —
   * leaving a stolen refresh token valid. `/otp` and the refresh token grant
   * authenticate from the request body instead and must not send it.
   */
  bearer?: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${AUTH}${path}`, {
    method,
    headers: {
      apikey: key ?? '',
      'Content-Type': 'application/json',
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  })

  const text = await res.text()
  let parsed: Record<string, unknown> = {}
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = {}
    }
  }

  if (!res.ok) {
    const msg =
      (parsed.msg as string) ??
      (parsed.error_description as string) ??
      (parsed.error as string) ??
      `Authentication failed (${res.status})`
    throw new AuthError(msg, res.status, (parsed.error_code as string) ?? '')
  }
  return parsed
}

/** GoTrue returns the session object directly on some routes, wrapped on others. */
function toSession(raw: Record<string, unknown>): AuthSession {
  return {
    access_token: String(raw.access_token ?? ''),
    refresh_token: String(raw.refresh_token ?? ''),
    expires_in: Number(raw.expires_in ?? 3600),
    expires_at: Number(raw.expires_at ?? Math.floor(Date.now() / 1000) + 3600),
    user: raw.user as AuthUser,
  }
}

export interface SendOtpOptions {
  /** Seeded into profiles on the `auth.users` insert trigger. */
  fullName?: string
  preferredLanguage?: string
  /** False refuses to create a user that does not exist yet (sign-in only). */
  createUser?: boolean
}

export const auth = {
  /**
   * Step 1 of passwordless sign-in: email GoTrue a code.
   *
   * Requires "Enable Email OTP" in the Supabase dashboard; without it GoTrue
   * answers `otp_disabled`, which is surfaced as an AuthError rather than a
   * silent no-op.
   */
  async sendOtp(
    email: string,
    { fullName, preferredLanguage, createUser = true }: SendOtpOptions = {},
  ): Promise<void> {
    const raw = await goTrue('/otp', {
      email,
      create_user: createUser,
      data: {
        ...(fullName ? { full_name: fullName } : {}),
        ...(preferredLanguage ? { preferred_language: preferredLanguage } : {}),
      },
    })
    // When the email provider is a magic-link flow GoTrue may hand back a
    // session directly instead of a code. Record it so the app is usable.
    if (raw.access_token) {
      writeSession(toSession(raw))
      emit()
    }
  },

  /** Step 2: exchange the emailed code for a session. */
  async verifyOtp(
    email: string,
    token: string,
  ): Promise<AuthSession> {
    const raw = await goTrue('/verify', {
      email,
      token: token.trim(),
      type: 'email',
    })
    const session = toSession(raw)
    writeSession(session)
    emit()
    return session
  },

  async getSession(): Promise<{ data: { session: AuthSession | null } }> {
    return { data: { session: readSession() } }
  },

  /**
   * Trade an expired access token for a fresh one. Returns null when the
   * refresh token is no longer valid, which is the real sign-out signal.
   */
  async refresh(): Promise<AuthSession | null> {
    const current = readSession()
    if (!current?.refresh_token) return null
    try {
      const raw = await goTrue('/token?grant_type=refresh_token', {
        refresh_token: current.refresh_token,
      })
      const session = toSession(raw)
      writeSession(session)
      emit()
      return session
    } catch {
      writeSession(null)
      emit()
      return null
    }
  },

  async signOut(): Promise<void> {
    const current = readSession()
    if (current?.refresh_token) {
      try {
        await goTrue('/logout', { scope: 'global' }, 'POST', current.access_token)
      } catch {
        /* the local session is cleared regardless; a failed remote revoke must
           not trap the user in a signed-in shell */
      }
    }
    writeSession(null)
    emit()
  },

  /** Subscribe to sign-in/sign-out. Returns an unsubscribe function. */
  onAuthStateChange(fn: AuthListener): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
}

/**
 * The bearer token when a session exists, otherwise the publishable key.
 * PostgREST needs one of the two on every request, and RLS decides from
 * whichever identity is presented — so this function is where "am I signed in"
 * actually takes effect.
 */
function authHeader(): string {
  return readSession()?.access_token ?? key ?? ''
}

function pgError(status: number, body: unknown): PgError {
  const b = (body ?? {}) as Partial<PgError>
  return {
    code: b.code ?? String(status),
    message: b.message ?? `Request failed with status ${status}`,
    details: b.details ?? '',
    hint: b.hint ?? '',
  }
}

/* ------------------------------------------------------------------ */
/* query builder                                                       */
/* ------------------------------------------------------------------ */

type Filter = [column: string, op: string, value: unknown]

class PgQuery<T> implements PromiseLike<PgResult<T>> {
  private filters: Filter[] = []
  private orders: string[] = []
  private limitTo: number | null = null
  private columns = '*'
  private wantSingle = false
  private tolerateEmpty = false

  constructor(
    readonly table: string,
    private readonly method: 'GET' | 'POST' | 'PATCH',
    private readonly body?: unknown,
  ) {}

  /*
   * The write verbs hang off the builder rather than the client because the
   * only call shapes the repository uses are `supabase.from('t').insert(...)`
   * and `supabase.from('t').update(...).eq('id', ...)`. Each returns a new
   * builder, so chaining after a write is the same as chaining after a read.
   */
  insert(body: unknown): PgQuery<unknown> {
    return new PgQuery<unknown>(this.table, 'POST', body)
  }

  update(body: unknown): PgQuery<unknown> {
    return new PgQuery<unknown>(this.table, 'PATCH', body)
  }

  select(columns = '*'): this {
    this.columns = columns
    return this
  }

  eq(column: string, value: unknown): this {
    this.filters.push([column, 'eq', value])
    return this
  }

  order(column: string, opts?: { ascending?: boolean }): this {
    this.orders.push(`${column}.${opts?.ascending === false ? 'desc' : 'asc'}`)
    return this
  }

  limit(n: number): this {
    this.limitTo = n
    return this
  }

  single(): this {
    this.wantSingle = true
    return this
  }

  /**
   * Expect at most one row but treat "none" as a normal outcome rather than an
   * error, which is what PostgREST's 406 signals.
   */
  maybeSingle(): this {
    this.wantSingle = true
    this.tolerateEmpty = true
    return this
  }

  private buildUrl(): string {
    const params = new URLSearchParams()
    for (const [column, op, value] of this.filters) {
      params.set(column, `${op}.${String(value)}`)
    }
    if (this.orders.length) params.set('order', this.orders.join(','))
    if (this.limitTo !== null) params.set('limit', String(this.limitTo))
    const qs = params.toString()
    return `${REST}/${this.table}${qs ? `?${qs}` : ''}`
  }

  private async run(): Promise<PgResult<T>> {
    const headers: Record<string, string> = {
      apikey: key ?? '',
      Authorization: `Bearer ${authHeader()}`,
    }

    if (this.method === 'GET') {
      // PostgREST returns every column by default, so a projection header is
      // only needed when the caller asked for a narrower one.
      if (this.columns !== '*') {
        headers['Accept'] = 'application/vnd.pgrst.object+json'
      }
      const res = await fetch(this.buildUrl(), { headers })
      return parse<T>(res, this.wantSingle, this.tolerateEmpty)
    }

    headers['Content-Type'] = 'application/json'
    // Writes need the row back only when the caller chained .select(); without
    // it PostgREST returns 201 with an empty body, which is what supabase-js
    // surfaces as `data: null` with no error.
    headers.Prefer = this.columns === '*' ? 'return=minimal' : 'return=representation'
    if (this.columns !== '*') headers['Accept'] = 'application/vnd.pgrst.object+json'

    // Filters must be honoured on writes too. PostgREST scopes the UPDATE by
    // the query string, so an `update(...).eq('id', x)` that dropped the filter
    // would rewrite every row in the table.
    const res = await fetch(this.buildUrl(), {
      method: this.method,
      headers,
      body: JSON.stringify(this.body ?? {}),
    })
    return parse<T>(res, this.wantSingle, this.tolerateEmpty)
  }

  then<R1 = PgResult<T>, R2 = never>(
    onfulfilled?: ((v: PgResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.run().then(onfulfilled, onrejected)
  }
}

async function parse<T>(
  res: Response,
  single: boolean,
  tolerateEmpty = false,
): Promise<PgResult<T>> {
  if (res.status === 204) return { data: null, error: null }
  const text = await res.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }
  // PostgREST signals "a single-row result matched nothing" with 406, not 404.
  // It has to be handled before the generic !ok branch, because 406 is not a
  // 2xx and would otherwise be reported as a transport failure.
  if (res.status === 406) {
    if (tolerateEmpty) return { data: null, error: null }
    return {
      data: null,
      error: { code: 'PGRST116', message: 'No rows returned', details: '', hint: '' },
    }
  }
  if (!res.ok) return { data: null, error: pgError(res.status, body) }
  return { data: (single && Array.isArray(body) ? body[0] : body) as T, error: null }
}

/* ------------------------------------------------------------------ */
/* public surface                                                      */
/* ------------------------------------------------------------------ */

/**
 * RLS is the only authorisation boundary — there is no privileged client in
 * the browser bundle, and the demo role switcher only changes which demo
 * identity is attached, never the policies that apply.
 */
export const supabase = isSupabaseConfigured
  ? {
      auth,
      from: <T = unknown>(table: string) => new PgQuery<T>(table, 'GET'),
    }
  : null

export class RepositoryUnavailable extends Error {
  constructor(what: string) {
    super(
      `${what} is unavailable: Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env`,
    )
    this.name = 'RepositoryUnavailable'
  }
}
