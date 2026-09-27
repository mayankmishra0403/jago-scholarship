/**
 * Small presentational primitives shared by every screen.
 *
 * The visual language is deliberately austere: a government service should look
 * like a government service. Colour is reserved for meaning (verdict, severity,
 * source provenance) rather than decoration, because the whole point of the
 * product is that a student can tell *why* something is the colour it is.
 */

import type { ReactNode } from 'react'
import type {
  ApplicationStatus,
  CheckStatus,
  DocumentStatus,
  SanctionOrder,
  Severity,
  VerificationCheck,
} from '@shared/types.ts'
import { bytes, num, pct } from '@shared/format.ts'

/* ------------------------------------------------------------------ */
/* status + severity                                                   */
/* ------------------------------------------------------------------ */

/**
 * One pill for every status the app shows. Checks, documents, applications and
 * sanctions all have their own status vocabularies, but they mean the same
 * handful of things — so they share one colour language. A "failed" document and
 * a "rejected" application are both ember, because to a student they are the
 * same news.
 */
export type PillStatus = CheckStatus | DocumentStatus | ApplicationStatus | SanctionOrder['status']

const STATUS_TONE: Partial<Record<PillStatus, string>> = {
  pass: 'bg-leaf-soft text-leaf',
  fail: 'bg-ember-soft text-ember',
  warning: 'bg-saffron-soft text-saffron-700',
  review: 'bg-plum-soft text-plum',
  skipped: 'bg-ink-100 text-ink-500',
  pending: 'bg-ink-100 text-ink-500',

  valid: 'bg-leaf-soft text-leaf',
  expired: 'bg-ember-soft text-ember',
  pending_review: 'bg-saffron-soft text-saffron-700',
  rejected: 'bg-ember-soft text-ember',
  missing: 'bg-ink-100 text-ink-500',

  draft: 'bg-ink-100 text-ink-500',
  eligibility_checked: 'bg-monsoon-soft text-monsoon',
  documents_pending: 'bg-saffron-soft text-saffron-700',
  submitted: 'bg-monsoon-soft text-monsoon',
  verification_running: 'bg-monsoon-soft text-monsoon',
  manual_review: 'bg-plum-soft text-plum',
  sanctioned: 'bg-leaf-soft text-leaf',
  disbursed: 'bg-leaf-soft text-leaf',
  payment_returned: 'bg-ember-soft text-ember',

  issued: 'bg-monsoon-soft text-monsoon',
  pfms_processing: 'bg-saffron-soft text-saffron-700',
  returned: 'bg-ember-soft text-ember',
}

const STATUS_MARK: Partial<Record<PillStatus, string>> = {
  pass: '✓',
  fail: '✕',
  warning: '!',
  review: '?',
  skipped: '–',
  pending: '…',
  valid: '✓',
  expired: '!',
  pending_review: '…',
  rejected: '✕',
  missing: '–',
  draft: '–',
  eligibility_checked: '✓',
  documents_pending: '…',
  submitted: '→',
  verification_running: '…',
  manual_review: '?',
  sanctioned: '✓',
  disbursed: '✓',
  payment_returned: '↩',
  issued: '→',
  pfms_processing: '…',
  returned: '↩',
}

const STATUS_LABEL: Partial<Record<PillStatus, string>> = {
  pass: 'pass',
  fail: 'fail',
  warning: 'warning',
  review: 'review',
  skipped: 'skipped',
  pending: 'pending',
  valid: 'valid',
  expired: 'expired',
  pending_review: 'pending review',
  rejected: 'rejected',
  missing: 'missing',
  draft: 'draft',
  eligibility_checked: 'eligibility checked',
  documents_pending: 'documents pending',
  submitted: 'submitted',
  verification_running: 'verifying',
  manual_review: 'manual review',
  sanctioned: 'sanctioned',
  disbursed: 'disbursed',
  payment_returned: 'returned by PFMS',
  issued: 'issued',
  pfms_processing: 'processing',
  returned: 'returned',
}

const NEUTRAL_PILL = 'bg-ink-100 text-ink-500'

export const StatusPill = ({ status, children }: { status: PillStatus; children?: ReactNode }) => (
  <span className={`pill ${STATUS_TONE[status] ?? NEUTRAL_PILL}`}>
    <span aria-hidden>{STATUS_MARK[status] ?? '•'}</span>
    {children ?? STATUS_LABEL[status] ?? status.replace(/_/g, ' ')}
  </span>
)

const SEVERITY_BORDER: Record<Severity, string> = {
  blocker: 'border-l-ember',
  warning: 'border-l-saffron',
  info: 'border-l-monsoon',
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  blocker: 'Blocking',
  warning: 'Needs attention',
  info: 'For information',
}

/**
 * One eligibility check, expanded by default.
 *
 * The layout is fixed: what the rule is, where the answer came from, what was
 * expected versus what was found, and what to do about it. A reviewer and a
 * student read the same card, which is the point of a single shared engine.
 */
export const CheckRow = ({ check, showRuleKey = false }: { check: VerificationCheck; showRuleKey?: boolean }) => (
  <li className={`card border-l-4 p-3 ${SEVERITY_BORDER[check.severity]}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-semibold text-ink-900">{check.label}</p>
        {showRuleKey && <p className="hint mt-0.5 font-mono">{check.ruleKey}</p>}
      </div>
      <StatusPill status={check.status} />
    </div>

    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      <dt className="text-ink-500">Expected</dt>
      <dd className="text-ink-800">{check.expected}</dd>
      <dt className="text-ink-500">Found</dt>
      <dd className="text-ink-800">
        {check.actual}
        {check.diff && (
          <span className="ml-1 text-ink-500">
            (certificate reads “{check.diff.b}”)
          </span>
        )}
      </dd>
      <dt className="text-ink-500">Source</dt>
      <dd className="text-ink-800">
        {check.source.replace(/_/g, ' ')}
        {check.sourceUrl && (
          <>
            {' · '}
            <a className="text-brand-700 underline" href={check.sourceUrl} target="_blank" rel="noreferrer">
              official record
            </a>
          </>
        )}
      </dd>
    </dl>

    <p className="mt-2 text-sm text-ink-600">{check.explanation}</p>

    {check.remediation && (
      <p className="mt-2 rounded-lg bg-ink-50 p-2 text-sm text-ink-700">
        <span className="font-semibold">What to do: </span>
        {check.remediation}
      </p>
    )}
  </li>
)

/* ------------------------------------------------------------------ */
/* layout                                                              */
/* ------------------------------------------------------------------ */

export const SectionCard = ({
  title,
  subtitle,
  action,
  children,
}: {
  title?: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
}) => (
  <section className="card p-4">
    {(title || action) && (
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          {title && <h2 className="text-base font-bold text-ink-900">{title}</h2>}
          {subtitle && <p className="hint mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </header>
    )}
    {children}
  </section>
)

export const Stat = ({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string
  value: string
  sub?: string
  tone?: 'neutral' | 'good' | 'warn' | 'bad'
}) => {
  const toneClass = {
    neutral: 'text-ink-900',
    good: 'text-leaf',
    warn: 'text-saffron-700',
    bad: 'text-ember',
  }[tone]
  return (
    <div className="card p-3">
      <p className="text-xs font-medium tracking-wide text-ink-500 uppercase">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${toneClass}`}>{value}</p>
      {sub && <p className="hint mt-0.5">{sub}</p>}
    </div>
  )
}

/** Horizontal coverage bar used across the analytics screens. */
export const Meter = ({
  value,
  max,
  tone = 'brand',
  label,
}: {
  value: number
  max: number
  tone?: 'brand' | 'saffron' | 'ember' | 'leaf'
  label?: string
}) => {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  const fill = {
    brand: 'bg-brand-600',
    saffron: 'bg-saffron',
    ember: 'bg-ember',
    leaf: 'bg-leaf',
  }[tone]
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-ink-200"
      role="meter"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
    >
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${ratio * 100}%` }} />
    </div>
  )
}

export const DocRow = ({
  title,
  source,
  status,
  validTill,
  size,
  actions,
}: {
  title: string
  source: string
  status: PillStatus
  validTill?: string | null
  size?: number
  actions?: ReactNode
}) => (
  <li className="flex items-start gap-3 border-b border-ink-100 py-3 last:border-0">
    <div className="min-w-0 flex-1">
      <p className="truncate font-semibold text-ink-900">{title}</p>
      <p className="hint">
        {source.replace(/_/g, ' ')}
        {size ? ` · ${bytes(size)}` : ''}
        {validTill ? ` · valid till ${validTill}` : ''}
      </p>
    </div>
    <StatusPill status={status as CheckStatus} />
    {actions}
  </li>
)

/* ------------------------------------------------------------------ */
/* empty + loading states                                              */
/* ------------------------------------------------------------------ */

export const Empty = ({ title, body, action }: { title: string; body?: string; action?: ReactNode }) => (
  <div className="card flex flex-col items-center gap-2 p-8 text-center">
    <p className="font-semibold text-ink-800">{title}</p>
    {body && <p className="max-w-sm text-sm text-ink-500">{body}</p>}
    {action}
  </div>
)

export const Loading = ({ label = 'Checking' }: { label?: string }) => (
  <div className="flex items-center gap-2 p-6 text-sm text-ink-500">
    <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-300 border-t-brand-600" />
    {label}…
  </div>
)

/** Tiny helper for the analytics screens: `pct` of a subset against a total. */
export const RatioLine = ({ part, whole, label }: { part: number; whole: number; label: string }) => (
  <div className="flex items-center justify-between gap-2 text-sm">
    <span className="text-ink-600">{label}</span>
    <span className="tabular-nums text-ink-800">
      {num(part)} <span className="text-ink-400">({pct(whole > 0 ? part / whole : 0, 1)})</span>
    </span>
  </div>
)
