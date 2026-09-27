/** Display formatters shared across the app. Indian conventions throughout. */

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const plain = new Intl.NumberFormat('en-IN')

export const money = (n: number): string => inr.format(n)

/** ₹2.5 lakh / ₹6 lakh — the way these ceilings are written in the guidelines. */
export const lakh = (n: number): string => {
  if (n >= 10000000) return `₹${plain.format(n / 10000000)} crore`
  if (n >= 100000) return `₹${plain.format(n / 100000)} lakh`
  return inr.format(n)
}

export const num = (n: number): string => plain.format(n)

export const pct = (ratio: number, digits = 0): string =>
  `${(ratio * 100).toFixed(digits)}%`

export const shortDate = (iso: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export const relativeDays = (iso: string | null, from = new Date()): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const days = Math.ceil((d.getTime() - from.getTime()) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`
}

/**
 * Whole days from `from` until `iso`; negative once the date has passed.
 *
 * The wallet needs the raw number, not the phrase, because "expires in 3 days"
 * and "expires in 30 days" drive very different advice. `Infinity` for a
 * missing or unparseable date so comparisons against a threshold never fire on
 * an absent value.
 */
export const daysUntil = (iso: string | null, from = new Date()): number => {
  if (!iso) return Infinity
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return Infinity
  return Math.ceil((d.getTime() - from.getTime()) / 86_400_000)
}

export const dateTime = (iso: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const bytes = (n: number): string => {
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1048576).toFixed(1)} MB`
}

export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')

/** Statuses that read as a green pill in the tracker. */
export const HAPPY_STATUSES = new Set(['sanctioned', 'disbursed', 'eligibility_checked'])

export const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  eligibility_checked: 'Eligibility checked',
  documents_pending: 'Documents pending',
  submitted: 'Submitted',
  verification_running: 'Verifying',
  manual_review: 'In review',
  sanctioned: 'Sanctioned',
  rejected: 'Rejected',
  payment_returned: 'Payment returned',
  disbursed: 'Disbursed',
}
