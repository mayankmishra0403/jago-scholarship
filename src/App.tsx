/**
 * App shell: hash routing, data hydration, role boundaries.
 *
 * A hash router rather than react-router: the point of this prototype is that
 * `npm run dev`, a static Vercel drop and a Capacitor WebView all work with no
 * server rewrite rules, and one fewer dependency is one fewer thing to explain
 * in a demo.
 */

import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { BottomNav, Header, Page, Toaster, type Route } from '@/components/Chrome.tsx'
import {
  Breadcrumbs,
  GovBar,
  GovFooter,
  PhaseBanner,
  useLastUpdated,
} from '@/components/Portal.tsx'
import { Loading, SectionCard, Stat } from '@/components/bits.tsx'
import { useApp } from '@/store/app.tsx'
import { hydrateDemoState } from '@/data/repository.ts'
import { summarise } from '@shared/eligibility.ts'
import { SCHEMES } from '@shared/catalogue.ts'
import { money, pct } from '@shared/format.ts'
import { isUiLanguage, t } from '@shared/i18n.ts'
import { Jago } from '@/pages/Jago.tsx'
import { Apply, Tracker } from '@/pages/Apply.tsx'
import { Schemes } from '@/pages/Student.tsx'
import { Wallet } from '@/pages/Wallet.tsx'
import { Accessibility, Help, Privacy, Terms } from '@/pages/Static.tsx'
import { AadhaarVerify } from '@/pages/Aadhaar.tsx'
import { isSupabaseConfigured } from '@/lib/supabase.ts'
import { Login } from '@/pages/Login.tsx'

/*
 * The Ministry screens (reviewer queue, coverage analytics, connector
 * simulator) are the largest block of code in the app and are reachable only
 * by staff. A student on a 2G link in a tribal district should not download
 * them, so they are split into their own chunk and fetched on first navigation.
 */
const Analytics = lazy(() =>
  import('@/pages/Staff.tsx').then((m) => ({ default: m.Analytics })),
)
const Reviewer = lazy(() =>
  import('@/pages/Staff.tsx').then((m) => ({ default: m.Reviewer })),
)
const Simulator = lazy(() =>
  import('@/pages/Staff.tsx').then((m) => ({ default: m.Simulator })),
)

const VALID: Route[] = [
  'home',
  'schemes',
  'apply',
  'wallet',
  'track',
  'jago',
  'aadhaar',
  'login',
  'review',
  'analytics',
  'simulator',
]

const STAFF_ONLY: Route[] = ['review', 'analytics', 'simulator']

const isRoute = (v: string): v is Route => (VALID as string[]).includes(v)

const readHash = (): Route => {
  const raw = window.location.hash.replace(/^#\/?/, '')
  return isRoute(raw) ? raw : 'home'
}

export default function App() {
  const app = useApp()
  const [route, setRoute] = useState<Route>(readHash)
  const [dbState, setDbState] = useState<'pending' | 'live' | 'offline'>('pending')
  const lastUpdated = useLastUpdated()

  useEffect(() => {
    const onHash = () => setRoute(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Pull the demo record from Postgres on first paint. A failure is not fatal:
  // the store falls back to its local demo data and we say so rather than
  // pretending the numbers came from the database.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const result = await hydrateDemoState()
      if (cancelled) return
      setDbState(result ? 'live' : 'offline')
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const go = useCallback((next: Route) => {
    window.location.hash = `/${next}`
  }, [])

  // The route the shell is allowed to show. Derived, not event-driven, so a role
  // switch never paints a screen the new role is not allowed to see.
  //
  // Which gate applies depends on whether a backend exists at all.
  //
  //  - Deployed with Supabase: the real gate. A staff screen needs a session
  //    whose `profiles.role` is staff. Without a JWT, RLS returns nothing for
  //    those tables, so showing them would be a table of empty rows.
  //  - Local prototype with no backend: the demo role switcher, so the Ministry
  //    screens stay walkable for a SIH judge who has no account.
  //
  // The switcher therefore self-disables once a real backend is present, rather
  // than quietly granting staff to anyone who clicks it.
  const live = isSupabaseConfigured

  const staff =
    STAFF_ONLY.includes(route) && (live ? app.isStaff : app.role !== 'student')

  const effective: Route = STAFF_ONLY.includes(route)
    ? live && !app.isStaff
      ? 'login'
      : app.isStaff || app.role !== 'student'
        ? route
        : 'home'
    : !live && app.role !== 'student'
      ? 'review'
      : route

  // Then correct the URL so a shared link and the back button agree with it.
  useEffect(() => {
    if (effective !== route) go(effective)
  }, [effective, route, go])

  return (
    <div className="app">
      {/* First tab stop: lets a keyboard or screen-reader user bypass the
          emblem, the two control groups and the nav strip. */}
      <a className="skip-link" href="#main">
        {app.language === 'hi' ? 'मुख्य सामग्री पर जाएँ' : 'Skip to main content'}
      </a>

      <GovBar />
      <Header route={effective} go={go} />
      <PhaseBanner>
        Built for Smart India Hackathon problem statement 26238. Government connectors are
        simulated, so no real application or payment happens here. Use the National Scholarship
        Portal to apply for real.
      </PhaseBanner>
      <Breadcrumbs route={effective} />
      <Toaster />

      <main id="main" tabIndex={-1} className="focus:outline-none">
        <Page>
          <Suspense
            fallback={
              <Loading label="Loading the Ministry workspace…" />
            }
          >
            {effective === 'home' ? (
              <Home go={go} />
            ) : effective === 'schemes' ? (
              <Schemes go={go} />
            ) : effective === 'wallet' ? (
              <Wallet />
            ) : effective === 'apply' ? (
              <Apply />
            ) : effective === 'track' ? (
              <Tracker />
            ) : effective === 'jago' ? (
              <Jago />
            ) : effective === 'aadhaar' ? (
              <AadhaarVerify />
            ) : effective === 'login' ? (
              <Login onDone={app.setSession} />
            ) : effective === 'review' && !staff ? (
              <SectionCard title="Staff only">
                <p className="text-sm text-ink-700">
                  {t(isUiLanguage(app.language) ? app.language : 'en', 'auth.guard_body')}
                </p>
              </SectionCard>
            ) : effective === 'review' ? (
              <Reviewer />
            ) : effective === 'analytics' ? (
              <Analytics />
            ) : effective === 'simulator' ? (
              <Simulator />
            ) : effective === 'accessibility' ? (
              <Accessibility />
            ) : effective === 'privacy' ? (
              <Privacy />
            ) : effective === 'terms' ? (
              <Terms />
            ) : (
              <Help />
            )}
          </Suspense>
        </Page>
      </main>

      <BottomNav route={effective} go={go} />

      <GovFooter
        dbState={dbState}
        onAsk={() => go('jago')}
        lastUpdated={lastUpdated}
      />
    </div>
  )
}

/** The student landing screen. Local so it can take navigation. */
const Home = ({ go }: { go: (r: Route) => void }) => {
  const { profile, runs, applications, checking, live, language } = useApp()
  // Full-interface languages translate the whole screen; tribal languages are
  // assistant-tier, so the page chrome stays in English.
  const lang = isUiLanguage(language) ? language : 'en'
  const verdicts = SCHEMES.map((s) => ({ scheme: s, run: runs[s.code] })).filter(
    (v) => v.run !== undefined,
  )
  const anyQualifies = verdicts.some(
    (v) => v.run!.result.overall === 'eligible' || v.run!.result.overall === 'deficient',
  )
  const readiness = verdicts.length
    ? verdicts.reduce((n, v) => n + v.run!.result.documentReadiness, 0) / verdicts.length
    : 0

  return (
    <div className="space-y-4">
      <SectionCard
        title={t(lang, 'app.greeting', { name: profile.fullName.split(' ')[0] ?? '' })}
        subtitle={t(lang, 'home.subtitle', {
          class: profile.currentClass,
          institution: profile.institutionName,
          district: profile.district,
          state: profile.stateUt,
        })}
        action={
          <button
            type="button"
            className="btn-primary !min-h-9 !px-3 text-xs"
            onClick={() => go(applications.length > 0 ? 'track' : 'apply')}
          >
            {applications.length > 0 ? 'Track application' : 'Start an application'}
          </button>
        }
      >
        <p className="text-sm text-ink-600">{t(lang, 'home.blurb')}</p>
        {!live && (
          <p className="hint mt-2">
            {checking ? 'Checking eligibility…' : t(lang, 'home.offline')}
          </p>
        )}
      </SectionCard>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat
          label="Paperwork ready"
          value={pct(readiness, 0)}
          tone={readiness >= 0.9 ? 'good' : readiness >= 0.6 ? 'warn' : 'neutral'}
          sub="of mandatory documents"
        />
        <Stat label="Schemes checked" value={`${verdicts.length}/5`} />
        <Stat
          label="Open blockers"
          value={String(
            verdicts.reduce((n, v) => n + v.run!.result.blockingIssues.length, 0),
          )}
          tone={verdicts.some((v) => v.run!.result.blockingIssues.length) ? 'warn' : 'good'}
          sub="across all schemes"
        />
        <Stat
          label="Applications"
          value={String(applications.length)}
          sub={applications.length > 0 ? applications[0]!.status.replace(/_/g, ' ') : 'none yet'}
        />
      </div>

      {verdicts.length > 0 ? (
        <SectionCard
          title="Your eligibility, side by side"
          subtitle="Same engine, all five schemes, no forms filled in yet"
        >
          <ul className="space-y-2">
            {verdicts.map(({ scheme, run }) => {
              const r = run!.result
              return (
                <li key={scheme.code} className="card p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-ink-900">{scheme.shortName}</span>
                    <span
                      className={`pill ${
                        r.overall === 'eligible'
                          ? 'bg-leaf-soft text-leaf'
                          : r.overall === 'deficient'
                            ? 'bg-saffron-soft text-saffron-700'
                            : r.overall === 'manual_review'
                              ? 'bg-plum-soft text-plum'
                              : 'bg-ink-100 text-ink-500'
                      }`}
                    >
                      {r.overall.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="hint mt-1">{scheme.benefit.monthly ? `${money(Number(scheme.benefit.monthly))} per month` : scheme.level}</p>
                  <p className="mt-1 text-sm text-ink-600">{summarise(r)}</p>
                </li>
              )
            })}
          </ul>

          <div className="mt-3 flex flex-wrap gap-2 border-t border-ink-100 pt-3">
            <button type="button" className="btn-primary" onClick={() => go('apply')}>
              {anyQualifies ? 'Apply to a scheme' : 'See what to fix'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => go('wallet')}>
              Document wallet
            </button>
            <button type="button" className="btn-ghost" onClick={() => go('jago')}>
              Ask JAGO
            </button>
          </div>
        </SectionCard>
      ) : (
        <SectionCard title="Checking your eligibility">
          <p className="text-sm text-ink-600">
            {checking
              ? 'Asking UDISE+, AISHE, e-District, NSP OTR and PFMS what they know about you…'
              : 'No verdicts yet. Open the schemes tab and re-run the checks.'}
          </p>
        </SectionCard>
      )}

      <SectionCard
        title="Why this is not five separate portals"
        subtitle="The problem this replaces"
      >
        <p className="text-sm text-ink-600">
          Today a tribal student visits the Pre-Matric portal, the Post-Matric portal, then the
          Ministry site, then their state e-District site, entering the same Aadhaar number and the
          same income certificate each time, and learns about a rejection weeks later. One record,
          checked once, with the reasoning shown, is the difference between a rejected application and
          a sanctioned one inside the same deadline.
        </p>
      </SectionCard>
    </div>
  )
}
