/**
 * App chrome: header, role switcher, language picker, navigation, toasts.
 *
 * Two design decisions worth stating, because both are visible in a demo:
 *
 * - The role switcher is a *prototype affordance*, not an auth mechanism. It
 *   only changes which screens are rendered; it grants no data access. Every
 *   read still goes through Supabase RLS, so a reviewer screen opened this way
 *   shows the live queue only if the session is genuinely a staff session. That
 *   is why the reviewer screen can come up empty and says so.
 *
 * - The language picker offers all eight languages everywhere, but tribal
 *   languages are labelled as assistant/explainer coverage rather than full UI
 *   translation, so the app never implies a translation it does not have.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LANGUAGES, getLanguage, isUiLanguage, t } from '@shared/i18n.ts'
import type { LanguageCode, Role } from '@shared/types.ts'
import { initials } from '@shared/format.ts'
import { useApp } from '@/store/app.tsx'

const ROLE_LABEL: Record<Role, string> = {
  student: 'Student',
  reviewer: 'Reviewer',
  admin: 'Ministry',
}

export type Route =
  | 'home'
  | 'schemes'
  | 'apply'
  | 'wallet'
  | 'track'
  | 'jago'
  | 'aadhaar'
  | 'login'
  | 'review'
  | 'analytics'
  | 'simulator'
  | 'accessibility'
  | 'privacy'
  | 'terms'
  | 'help'

const STUDENT_NAV: Array<{ route: Route; icon: string; key: string }> = [
  { route: 'home', icon: '◎', key: 'nav.home' },
  { route: 'schemes', icon: '✦', key: 'nav.schemes' },
  { route: 'apply', icon: '✎', key: 'nav.apply' },
  { route: 'wallet', icon: '▤', key: 'nav.wallet' },
  { route: 'track', icon: '→', key: 'nav.track' },
  { route: 'jago', icon: '◍', key: 'nav.jago' },
  { route: 'aadhaar', icon: '✓', key: 'nav.aadhaar' },
]

const STAFF_NAV: Array<{ route: Route; icon: string; key: string }> = [
  { route: 'review', icon: '⚑', key: 'nav.review' },
  { route: 'analytics', icon: '▦', key: 'nav.analytics' },
  { route: 'simulator', icon: '⚙', key: 'nav.simulator' },
]

/* ------------------------------------------------------------------ */
/* pickers                                                             */
/* ------------------------------------------------------------------ */

const useOutsideClose = (onClose: () => void) => {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])
  return ref
}

const LanguagePicker = () => {
  const { language } = useApp()
  const [open, setOpen] = useState(false)
  const ref = useOutsideClose(() => setOpen(false))
  const active = getLanguage(language)
  const national = LANGUAGES.filter((l) => l.tier === 'national')
  const tribal = LANGUAGES.filter((l) => l.tier === 'tribal')

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="btn-ghost !min-h-9 !px-2 text-sm"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Language: ${active.label}`}
      >
        <span aria-hidden>🌐</span>
        <span className="hidden sm:inline">{active.nativeLabel}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 z-40 mt-1 w-64 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-lg"
          role="listbox"
        >
          <p className="border-b border-ink-100 px-3 py-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
            Full interface
          </p>
          {national.map((l) => (
            <LanguageOption key={l.code} code={l.code} onPick={() => setOpen(false)} />
          ))}
          <p className="border-y border-ink-100 bg-ink-50 px-3 py-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
            Assistant &amp; explainers
          </p>
          {tribal.map((l) => (
            <LanguageOption key={l.code} code={l.code} onPick={() => setOpen(false)} />
          ))}
          <p className="px-3 py-2 text-xs text-ink-500">
            Tribal languages cover the JAGO assistant, scheme explainers and eligibility reasons. The
            buttons stay in English or Hindi.
          </p>
        </div>
      )}
    </div>
  )
}

const LanguageOption = ({ code, onPick }: { code: LanguageCode; onPick: () => void }) => {
  const { language, setLanguage } = useApp()
  const meta = getLanguage(code)
  const selected = language === code
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      lang={meta.script === 'Latin' ? undefined : code}
      className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-ink-50 ${
        selected ? 'bg-brand-50 font-semibold text-brand-800' : 'text-ink-800'
      }`}
      onClick={() => {
        setLanguage(code)
        onPick()
      }}
    >
      <span>
        {meta.nativeLabel}
        <span className="ml-2 text-xs text-ink-400">{meta.label}</span>
      </span>
      {selected && <span aria-hidden>✓</span>}
    </button>
  )
}

const RoleSwitcher = () => {
  const { role, setRole } = useApp()
  const enabled = import.meta.env.VITE_DEV_ROLE_SWITCH !== 'false'
  if (!enabled) return null

  return (
    <div className="flex items-center gap-1 rounded-lg bg-ink-100 p-0.5" role="group" aria-label="View as">
      {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => setRole(r)}
          aria-pressed={role === r}
          className={`min-h-8 rounded-md px-2.5 text-xs font-semibold transition ${
            role === r ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800'
          }`}
        >
          {ROLE_LABEL[r]}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* header + nav                                                        */
/* ------------------------------------------------------------------ */

export const Header = ({ route, go }: { route: Route; go: (r: Route) => void }) => {
  const { profile, live, hydrated, role, language, session, signOut } = useApp()
  const staff = role !== 'student'
  // The chrome is full-UI tier, so it follows the selected language only when
  // that language is a full-interface one. A tribal-language selection is
  // assistant-tier by design: the nav stays in English rather than showing four
  // translated tabs beside an untranslated body, which reads as broken.
  const tr = (key: string) => t(isUiLanguage(language) ? language : 'en', key)

  return (
    <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-2">
        <button
          type="button"
          className="flex items-center gap-2 text-left"
          onClick={() => go('home')}
          aria-label="Jago home"
        >
          <span
            className="grid h-9 w-9 place-items-center rounded-xl bg-brand-700 text-sm font-bold text-white"
            aria-hidden
          >
            ज
          </span>
          <span className="hidden sm:block">
            <span className="block text-sm leading-tight font-bold text-ink-900">
              {tr('app.name')}
            </span>
            <span className="block text-[11px] leading-tight text-ink-500">
              {tr('app.tagline')}
            </span>
          </span>
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          <RoleSwitcher />
          <LanguagePicker />
          {hydrated && (
            <span
              className={`pill ${live ? 'bg-leaf-soft text-leaf' : 'bg-ink-100 text-ink-500'}`}
              title={live ? 'Read live from Supabase' : 'Running on the local demo dataset'}
            >
              <span aria-hidden>{live ? '●' : '○'}</span>
              <span className="hidden md:inline">{live ? 'Live' : 'Demo'}</span>
            </span>
          )}
          <span
            className="grid h-9 w-9 place-items-center rounded-full bg-plum-soft text-xs font-bold text-plum"
            title={profile.fullName}
          >
            {initials(profile.fullName)}
          </span>
          {/* Identity is the one control that must not lie. A live session shows
              who it belongs to and offers a way out; without one, the button
              leads to sign-in rather than implying an account exists. */}
          {session ? (
            <button
              type="button"
              onClick={() => void signOut()}
              className="min-h-9 rounded-lg border border-ink-300 px-2.5 text-[13px] font-semibold text-ink-700 hover:bg-ink-100"
              title={`${tr('auth.signed_in_as')} ${session.user.email}`}
            >
              {tr('auth.sign_out')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => go('login')}
              className="min-h-9 rounded-lg bg-brand-800 px-3 text-[13px] font-semibold text-white hover:bg-brand-900"
            >
              {tr('auth.sign_in')}
            </button>
          )}
        </div>
      </div>

      <nav className="mx-auto max-w-5xl overflow-x-auto px-1 pb-1" aria-label="Primary">
        <ul className="flex min-w-max gap-1">
          {(staff ? STAFF_NAV : STUDENT_NAV).map((item) => (
            <li key={item.route}>
              <button
                type="button"
                onClick={() => go(item.route)}
                aria-current={route === item.route ? 'page' : undefined}
                className={`flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold whitespace-nowrap transition ${
                  route === item.route
                    ? 'bg-brand-50 text-brand-800'
                    : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'
                }`}
              >
                <span aria-hidden>{item.icon}</span>
                {tr(item.key)}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}

export const BottomNav = ({ route, go }: { route: Route; go: (r: Route) => void }) => {
  const { role, language } = useApp()
  // Staff screens have their own nav, so the student tab bar is hidden there.
  if (role !== 'student') return null
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      aria-label="Primary"
    >
      <ul className="flex">
        {STUDENT_NAV.slice(0, 5).map((item) => (
          <li key={item.route} className="flex-1">
            <button
              type="button"
              onClick={() => go(item.route)}
              aria-current={route === item.route ? 'page' : undefined}
              className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
                route === item.route ? 'text-brand-700' : 'text-ink-500'
              }`}
            >
              <span className="text-base" aria-hidden>
                {item.icon}
              </span>
              {t(isUiLanguage(language) ? language : 'en', item.key)}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/* ------------------------------------------------------------------ */
/* toasts                                                              */
/* ------------------------------------------------------------------ */

const TOAST_TONE = {
  info: 'border-monsoon bg-monsoon-soft text-monsoon',
  success: 'border-leaf bg-leaf-soft text-leaf',
  warn: 'border-saffron bg-saffron-soft text-saffron-700',
  error: 'border-ember bg-ember-soft text-ember',
} as const

export const Toaster = () => {
  const { toasts, dismissToast, language } = useApp()
  if (toasts.length === 0) return null
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-16 z-50 flex flex-col items-center gap-2 px-3 md:bottom-4"
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          className={`pointer-events-auto w-full max-w-sm rounded-xl border-l-4 p-3 shadow-lg ${TOAST_TONE[item.tone]}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-bold">{item.title}</p>
              {item.body && <p className="mt-0.5 text-sm opacity-90">{item.body}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(item.id)}
              className="-m-1 px-1 text-lg leading-none opacity-60 hover:opacity-100"
              aria-label={t(isUiLanguage(language) ? language : 'en', 'common.dismiss')}
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Page shell. Deliberately a div, not a <main>: App owns the single main
 * landmark that the skip link targets, and two nested main landmarks are an
 * accessibility error rather than a harmless detail.
 */
export const Page = ({ children }: { children: ReactNode }) => (
  <div className="mx-auto max-w-5xl px-3 pt-4 pb-24 md:pb-8">{children}</div>
)
