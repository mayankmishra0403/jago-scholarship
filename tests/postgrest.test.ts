/**
 * Tests for the hand-rolled PostgREST client.
 *
 * This client replaced `@supabase/supabase-js` to keep the realtime and GoTrue
 * layers out of the bundle, so its request construction is now our
 * responsibility. These tests assert the exact URL, method and headers, and the
 * status-code-to-error mapping, because a silent mistake here would surface as
 * "the demo is offline" rather than as a crash.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubEnv('VITE_SUPABASE_URL', 'https://demo.supabase.co')
vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')

const { supabase } = await import('@/lib/supabase.ts')

interface Captured {
  url: string
  init: RequestInit
}

let calls: Captured[] = []
let respond: () => Response

function stubFetch() {
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      calls.push({ url: String(input), init })
      return respond()
    }),
  )
}

const headers = (i = 0) => calls[i].init.headers as Record<string, string>
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

beforeEach(() => {
  respond = () => json([])
  stubFetch()
})

describe('select', () => {
  it('builds a plain GET against the rest root', async () => {
    respond = () => json([{ id: 1 }])
    const { data, error } = await supabase!.from('documents').select('*')

    expect(error).toBeNull()
    expect(data).toEqual([{ id: 1 }])
    expect(calls[0].url).toBe('https://demo.supabase.co/rest/v1/documents')
    expect(calls[0].init.method).toBeUndefined()
  })

  it('serialises eq filters as PostgREST operators', async () => {
    await supabase!.from('v_student_profile').select('*').eq('demo_key', 'demo-1')
    expect(calls[0].url).toBe(
      'https://demo.supabase.co/rest/v1/v_student_profile?demo_key=eq.demo-1',
    )
  })

  it('percent-encodes filter values so they cannot break the query string', async () => {
    await supabase!.from('documents').select('*').eq('id', 'a b&demo_key=eq.injected')
    expect(calls[0].url).toBe(
      'https://demo.supabase.co/rest/v1/documents?id=eq.a+b%26demo_key%3Deq.injected',
    )
    expect(calls[0].url.split('?')[1]?.split('&')).toHaveLength(1)
  })

  it('orders ascending by default and descending on request', async () => {
    await supabase!.from('v_coverage_matrix').select('*').order('state_ut')
    expect(calls[0].url).toContain('order=state_ut.asc')

    respond = () => json([])
    await supabase!
      .from('v_coverage_cohorts')
      .select('*')
      .order('unreached_st', { ascending: false })
      .limit(60)
    expect(calls[1].url).toContain('order=unreached_st.desc')
    expect(calls[1].url).toContain('limit=60')
  })

  it('sends the publishable key as both apikey and bearer', async () => {
    await supabase!.from('documents').select('*')
    expect(headers().apikey).toBe('sb_publishable_test')
    expect(headers().Authorization).toBe('Bearer sb_publishable_test')
  })
})

describe('single row semantics', () => {
  it('unwraps the first row for single()', async () => {
    respond = () => json([{ id: 'abc' }])
    const { data } = await supabase!.from('applications').select('id').single()
    expect(data).toEqual({ id: 'abc' })
  })

  it('maps PostgREST 406 to a not-found error for single()', async () => {
    respond = () => json({ code: 'PGRST116', message: '0 rows' }, 406)
    const { data, error } = await supabase!.from('applications').select('id').single()
    expect(data).toBeNull()
    expect(error?.code).toBe('PGRST116')
  })

  it('treats 406 as a normal empty result for maybeSingle()', async () => {
    respond = () => json({ code: 'PGRST116', message: '0 rows' }, 406)
    const { data, error } = await supabase!
      .from('v_student_profile')
      .select('*')
      .eq('demo_key', 'missing')
      .maybeSingle()
    expect(data).toBeNull()
    expect(error).toBeNull()
  })
})

describe('writes', () => {
  it('POSTs an insert and asks for the row back only when selected', async () => {
    respond = () => json([{ id: 'new-1' }], 201)
    const { data } = await supabase!
      .from('applications')
      .insert({ scheme_code: 'nfst' })
      .select('id')
      .single()

    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].url).toBe('https://demo.supabase.co/rest/v1/applications')
    expect(calls[0].init.body).toBe('{"scheme_code":"nfst"}')
    expect(headers().Prefer).toBe('return=representation')
    expect(data).toEqual({ id: 'new-1' })
  })

  it('uses return=minimal for a bare insert and treats 201 as success', async () => {
    respond = () => new Response(null, { status: 201 })
    const { data, error } = await supabase!
      .from('verification_runs')
      .insert({ overall: 'eligible' })

    expect(headers().Prefer).toBe('return=minimal')
    expect(data).toBeNull()
    expect(error).toBeNull()
  })

  it('PATCHes an update filtered by id', async () => {
    respond = () => json([{ id: 'a1' }])
    await supabase!
      .from('applications')
      .update({ status: 'submitted' })
      .eq('id', 'a1')
      .select('id')
      .single()

    expect(calls[0].init.method).toBe('PATCH')
    expect(calls[0].url).toBe('https://demo.supabase.co/rest/v1/applications?id=eq.a1')
    expect(calls[0].init.body).toBe('{"status":"submitted"}')
  })
})

describe('error mapping', () => {
  it('surfaces the PostgREST error object', async () => {
    respond = () =>
      json({ code: '42501', message: 'permission denied', details: '', hint: '' }, 403)
    const { data, error } = await supabase!.from('coverage_records').select('*')

    expect(data).toBeNull()
    expect(error?.code).toBe('42501')
    expect(error?.message).toBe('permission denied')
  })

  it('synthesises an error when PostgREST returns a non-JSON body', async () => {
    respond = () => new Response('<html>502 Bad Gateway</html>', { status: 502 })
    const { error } = await supabase!.from('v_review_queue').select('*')

    expect(error?.code).toBe('502')
    expect(error?.message).toContain('502')
  })
})
