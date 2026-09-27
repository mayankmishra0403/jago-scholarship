/**
 * GOV.IN-style portal shell.
 *
 * The visual language here follows the Government of India / GDS convention
 * rather than inventing a new one, because the audience reads this as a
 * government service and familiarity is the point: a dark utility bar, the
 * national emblem lockup, a bilingual ministry wordmark, a phase banner for
 * the prototype status, breadcrumbs, and a footer that carries the legal and
 * accessibility links a public body is expected to publish.
 *
 * The Ashoka emblem is drawn as a simplified, non-photographic mark. It is a
 * visual reference for the national emblem, not a reproduction of the Lion
 * Capital engraving, and it is hidden from assistive technology because the
 * "भारत सरकार / Government of India" text beside it carries the meaning.
 */

import type { ReactNode } from 'react'
import type { Route } from '@/components/Chrome.tsx'

/* ------------------------------------------------------------------ */
/* emblem                                                              */
/* ------------------------------------------------------------------ */

/**
 * Simplified national-emblem mark: the wheel-and-lion abstraction used as a
 * portal identifier. Decorative — the accessible name is supplied by the
 * adjacent text, so it is `aria-hidden`.
 */
const Emblem = ({ className = '' }: { className?: string }) => (
  <svg
    aria-hidden
    viewBox="0 0 40 40"
    className={className}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="20" cy="20" r="18.5" stroke="currentColor" strokeWidth="1.4" />
    {/* Ashoka-chakra style spokes */}
    {Array.from({ length: 12 }, (_, i) => {
      const a = (i * Math.PI * 2) / 12
      return (
        <line
          key={i}
          x1={20 + Math.cos(a) * 4}
          y1={20 + Math.sin(a) * 4}
          x2={20 + Math.cos(a) * 11.5}
          y2={20 + Math.sin(a) * 11.5}
          stroke="currentColor"
          strokeWidth="1.1"
        />
      )
    })}
    <circle cx="20" cy="20" r="3.2" fill="currentColor" />
    <circle cx="20" cy="20" r="12" stroke="currentColor" strokeWidth="1.1" />
  </svg>
)

/* ------------------------------------------------------------------ */
/* government bar                                                      */
/* ------------------------------------------------------------------ */

export const GovBar = () => (
  <div className="on-dark bg-[#0b1b3a] text-white">
    <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-1.5 text-[11px] font-semibold tracking-wide">
      <Emblem className="h-5 w-5 shrink-0" />
      <span className="truncate">
        <span lang="hi">भारत सरकार</span>
        <span aria-hidden> | </span>
        <span>Government of India</span>
      </span>
      <span aria-hidden className="hidden text-white/50 sm:inline">
        |
      </span>
      <span className="hidden truncate text-white/80 sm:inline">
        <span lang="hi">जनजातीय कार्य मंत्रालय</span>
        <span aria-hidden> | </span>
        <span>Ministry of Tribal Affairs</span>
      </span>
    </div>
  </div>
)

/* ------------------------------------------------------------------ */
/* phase banner                                                        */
/* ------------------------------------------------------------------ */

/**
 * GDS phase banner. A public-facing prototype must say so before it says
 * anything else, otherwise a demo looks like a live disbursement portal.
 */
export const PhaseBanner = ({ children }: { children: ReactNode }) => (
  <div
    className="border-b border-[#f47738]/30 bg-[#f47738]/10"
    role="region"
    aria-label="Service status"
  >
    <div className="mx-auto max-w-5xl px-3 py-2 text-[13px] leading-snug text-ink-800">
      <strong className="font-bold text-[#a63c00]">Prototype</strong> — {children}
    </div>
  </div>
)

/* ------------------------------------------------------------------ */
/* breadcrumbs                                                         */
/* ------------------------------------------------------------------ */

const CRUMB: Record<Route, string> = {
  home: 'Home',
  schemes: 'Schemes',
  apply: 'Apply',
  wallet: 'Document wallet',
  track: 'Track application',
  jago: 'Ask JAGO',
  aadhaar: 'Identity verification',
  login: 'Sign in',
  review: 'Reviewer queue',
  analytics: 'Ministry coverage',
  simulator: 'Connector simulator',
  accessibility: 'Accessibility',
  privacy: 'Privacy',
  terms: 'Terms of use',
  help: 'Help',
}

export const Breadcrumbs = ({ route }: { route: Route }) => (
  <nav aria-label="Breadcrumb" className="border-b border-ink-200 bg-white">
    <ol className="mx-auto flex max-w-5xl flex-wrap items-center gap-1 px-3 py-2 text-[13px] text-ink-600">
      <li>
        <span className="font-semibold text-ink-800">JagoScholarship</span>
      </li>
      {route !== 'home' && (
        <>
          <li aria-hidden className="px-1 text-ink-400">
            /
          </li>
          <li aria-current="page" className="font-medium text-ink-700">
            {CRUMB[route]}
          </li>
        </>
      )}
    </ol>
  </nav>
)

/* ------------------------------------------------------------------ */
/* panel                                                               */
/* ------------------------------------------------------------------ */

/**
 * GDS inset text panel: a 5px left rule, a pale background and a thick top
 * border. Used for explanatory copy where a full card would over-emphasise it.
 */
export const Panel = ({
  title,
  children,
  tone = 'info',
}: {
  title?: string
  children: ReactNode
  tone?: 'info' | 'warn'
}) => (
  <div
    className={`border border-ink-200 border-l-4 border-t-[3px] bg-white px-4 py-3 ${
      tone === 'warn' ? 'border-l-[#f47738]' : 'border-l-brand-700'
    }`}
  >
    {title && <h2 className="mb-1 text-sm font-bold text-ink-900">{title}</h2>}
    <div className="text-sm leading-relaxed text-ink-700">{children}</div>
  </div>
)

/* ------------------------------------------------------------------ */
/* footer                                                              */
/* ------------------------------------------------------------------ */

const FOOTER_LINKS: Array<{ label: string; href: string; external?: boolean }> = [
  { label: 'Accessibility statement', href: '#/accessibility' },
  { label: 'Privacy policy', href: '#/privacy' },
  { label: 'Terms of use', href: '#/terms' },
  { label: 'Help', href: '#/help' },
  { label: 'Ministry of Tribal Affairs', href: 'https://tribal.nic.in', external: true },
  { label: 'National Scholarship Portal', href: 'https://scholarships.gov.in', external: true },
]

export const GovFooter = ({
  dbState,
  onAsk,
  lastUpdated,
}: {
  dbState: 'pending' | 'live' | 'offline'
  onAsk: () => void
  lastUpdated: string
}) => (
  <footer className="mt-auto border-t-4 border-brand-800 bg-white">
    <div className="mx-auto max-w-5xl px-3 py-6 text-sm">
      <nav aria-label="Footer" className="mb-4">
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {FOOTER_LINKS.map((l) => (
            <li key={l.label}>
              {l.external ? (
                <a
                  href={l.href}
                  rel="noreferrer noopener"
                  target="_blank"
                  className="inline-flex min-h-9 items-center gap-1 text-brand-800 underline hover:text-brand-900"
                >
                  {l.label}
                  <span aria-hidden className="text-[10px]">
                    ↗
                  </span>
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : (
                <a
                  href={l.href}
                  className="inline-flex min-h-9 items-center text-brand-800 underline hover:text-brand-900"
                >
                  {l.label}
                </a>
              )}
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={onAsk}
              className="inline-flex min-h-9 items-center text-brand-800 underline hover:text-brand-900"
            >
              Ask JAGO
            </button>
          </li>
        </ul>
      </nav>

      <dl className="mb-4 grid gap-x-6 gap-y-1 text-[13px] text-ink-600 sm:grid-cols-2">
        <div className="flex gap-2">
          <dt className="font-semibold text-ink-800">Data source:</dt>
          <dd>
            {dbState === 'live'
              ? 'reading live from Supabase'
              : dbState === 'offline'
                ? 'offline, using the local demo record'
                : 'checking the database…'}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-semibold text-ink-800">Last updated:</dt>
          <dd>
            <time dateTime={lastUpdated}>{lastUpdated}</time>
          </dd>
        </div>
      </dl>

      <hr className="mb-3 border-ink-200" />

      <p className="text-[13px] leading-relaxed text-ink-600">
        Government connectors in this prototype are <strong>mocked, not live</strong>. No
        application submitted here reaches UDISE+, AISHE, e-District, NSP or PFMS, and no real
        money moves. Eligible students should apply through the{' '}
        <a
          href="https://scholarships.gov.in"
          rel="noreferrer noopener"
          target="_blank"
          className="underline"
        >
          National Scholarship Portal
        </a>
        .
      </p>

      <p className="mt-2 text-xs text-ink-500">
        Built for Smart India Hackathon problem statement 26238. Text and code are available under
        an open licence unless stated otherwise.
      </p>
    </div>
  </footer>
)

/* ------------------------------------------------------------------ */
/* last-updated helper                                                 */
/* ------------------------------------------------------------------ */

/** GDS asks every page to carry a "last updated" stamp. */
export const useLastUpdated = (): string =>
  new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
