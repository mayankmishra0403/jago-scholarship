// @vitest-environment jsdom
/**
 * Render smoke test.
 *
 * `tsc` proves the code typechecks; it does not prove a component does not
 * throw on first paint. This mounts the real app in jsdom, walks every route and
 * every role, and fails on any console error or unhandled rejection. That is the
 * cheapest way to catch the class of bug a demo cannot survive: a blank screen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import App from '@/App.tsx'
import { AppProvider } from '@/store/app.tsx'

// The repository is the only thing that talks to the network. Mock it so these
// tests assert on rendering, not on whether the wifi in the room is working.
vi.mock('@/data/repository.ts', () => ({
  DEMO_KEY: 'demo-student',
  hydrateDemoState: async () => null,
  loadReviewQueue: async () => [],
  loadCoverage: async () => [],
  loadCoverageCohorts: async () => null,
  loadInstitutions: async () => null,
  saveApplication: async () => null,
}))

// This suite exercises the *prototype* path, where no backend is configured and
// the role switcher is a deliberate demo affordance. The deployed path, where a
// staff screen requires a real session, is asserted in auth-guard.test.tsx.
vi.mock('@/lib/supabase.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase.ts')>()),
  isSupabaseConfigured: false,
}))

const ROUTES = [
  'home',
  'schemes',
  'wallet',
  'apply',
  'track',
  'jago',
  'aadhaar',
  'review',
  'analytics',
  'simulator',
]

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let errors: string[] = []

beforeEach(() => {
  errors = []
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    errors.push(a.map(String).join(' '))
  })
  window.localStorage.clear()
  window.location.hash = ''
  // The Supabase client is never reachable in jsdom; make that explicit and fast.
  vi.stubEnv('VITE_SUPABASE_URL', '')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

/** Flushes pending promises and the async data loads a screen kicks off. */
const settle = async (times = 4) => {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5))
    })
  }
}

const mount = async (hash: string) => {
  window.location.hash = hash
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      <AppProvider>
        <App />
      </AppProvider>,
    )
  })
  // Let the hash-driven route and the async store effects settle.
  await act(async () => {
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    await new Promise((r) => setTimeout(r, 0))
  })
  return { host, root }
}

describe('app renders', () => {
  it('mounts the home screen as a student with no console errors', async () => {
    const { host, root } = await mount('#/home')
    expect(host.textContent).toContain('Namaste')
    expect(errors).toEqual([])
    await act(async () => root.unmount())
  })

  it.each(ROUTES)('renders #/%s without throwing', async (route) => {
    const { host, root } = await mount(`#/${route}`)
    expect(host.textContent?.length ?? 0).toBeGreaterThan(0)
    expect(errors).toEqual([])
    await act(async () => root.unmount())
  })
})

describe('role boundaries', () => {
  it('sends a student away from a staff route', async () => {
    const { host, root } = await mount('#/analytics')
    // The role guard redirects, so the student must not see the Ministry screen.
    expect(host.textContent).not.toContain('Ministry view')
    expect(errors).toEqual([])
    await act(async () => root.unmount())
  })

  it('renders the staff shell once the role is switched', async () => {
    const { host, root } = await mount('#/home')
    await act(async () => {
      // The role switcher is a prototype affordance; drive it the way a user would.
      const ministry = [...host.querySelectorAll('button')].find((b) =>
        b.textContent?.includes('Ministry'),
      )
      ministry?.click()
    })
    await settle()
    expect(host.textContent).toMatch(/Reviewer queue|Ministry view/)
    expect(errors).toEqual([])
    await act(async () => root.unmount())
  })
})

describe('language switching', () => {
  it('translates the chrome when the language changes', async () => {
    const { host, root } = await mount('#/home')
    expect(host.textContent).toContain('Schemes')
    expect(host.textContent).toContain('Wallet')

    await act(async () => {
      // Drive the real picker rather than the store, so the click path is covered.
      const trigger = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
        b.getAttribute('aria-label')?.startsWith('Language:'),
      )
      trigger?.click()
    })
    await settle()
    await act(async () => {
      const hindi = [...host.querySelectorAll<HTMLElement>('[role="option"]')].find((o) =>
        o.textContent?.includes('हिन्दी'),
      )
      hindi?.click()
    })
    await settle()

    // The nav must actually change language, not just the picker's own label.
    expect(host.textContent).toContain('योजनाएँ')
    expect(host.textContent).toContain('वॉलेट')
    expect(host.textContent).not.toContain('Wallet')
    expect(errors).toEqual([])
    await act(async () => root.unmount())
  })
})

describe('tier boundaries', () => {
  it('keeps the chrome in English for a tribal (assistant-tier) language', async () => {
    const { host, root } = await mount('#/home')
    // The demo persona prefers Santali, which the picker advertises as
    // "Assistant + explainers" — not a translated interface. The nav must stay
    // English rather than showing four tribal tabs beside an English body.
    expect(host.textContent).toContain('Schemes')
    expect(host.textContent).toContain('Wallet')
    expect(host.textContent).not.toContain('योजनाएँ')
    expect(errors).toEqual([])
    await act(async () => root.unmount())
  })
})
