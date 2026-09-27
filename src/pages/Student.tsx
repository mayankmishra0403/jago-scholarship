/**
 * Schemes: "which of the five can I actually get, and why?"
 *
 * The verdict comes first, then what is wrong, then how to fix it, then which
 * record proved it. Students abandon applications when the reason for rejection
 * is hidden, so nothing here is collapsed behind a click by default.
 */

import { SCHEMES } from '@shared/catalogue.ts'
import { lakh, money, num, shortDate } from '@shared/format.ts'
import { useApp } from '@/store/app.tsx'
import { SectionCard } from '@/components/bits.tsx'

export const Schemes = ({ go }: { go: (r: 'apply') => void }) => {
  const { runChecks, checking } = useApp()

  return (
    <div className="space-y-4">
      <SectionCard
        title="All five schemes in one place"
        subtitle="Separate portals, separate rules, one interface."
        action={
          <button
            type="button"
            className="btn-secondary !min-h-9 !px-3 text-xs"
            onClick={() => runChecks(SCHEMES.map((s) => s.code))}
            disabled={checking}
          >
            Check me against all
          </button>
        }
      >
        <ul className="space-y-3">
          {SCHEMES.map((s) => (
            <li key={s.code} className="card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: s.accent }} aria-hidden />
                <h3 className="font-bold text-ink-900">{s.name}</h3>
                <span className="pill bg-ink-100 text-ink-600">{s.level}</span>
                {s.isCentralSector && <span className="pill bg-monsoon-soft text-monsoon">Central</span>}
              </div>

              <p className="mt-2 text-sm text-ink-600">{s.eligibilitySummary}</p>

              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-ink-50 p-2">
                  <dt className="text-xs text-ink-500">Benefit</dt>
                  <dd className="font-semibold text-ink-900">
                    {typeof s.benefit.monthly === 'number'
                      ? `${money(s.benefit.monthly)}/mo`
                      : typeof s.benefit.annual === 'number'
                        ? `${money(s.benefit.annual)}/yr`
                        : '—'}
                  </dd>
                </div>
                <div className="rounded-lg bg-ink-50 p-2">
                  <dt className="text-xs text-ink-500">Income ceiling</dt>
                  <dd className="font-semibold text-ink-900">
                    {s.incomeCeiling ? `${lakh(s.incomeCeiling)} p.a.` : 'No income bar'}
                  </dd>
                </div>
                <div className="rounded-lg bg-ink-50 p-2">
                  <dt className="text-xs text-ink-500">Fresh deadline</dt>
                  <dd className="font-semibold text-ink-900">{shortDate(s.deadlineFresh)}</dd>
                </div>
                <div className="rounded-lg bg-ink-50 p-2">
                  <dt className="text-xs text-ink-500">Slots / year</dt>
                  <dd className="font-semibold text-ink-900">
                    {s.slotsPerYear ? num(s.slotsPerYear) : 'Not capped'}
                  </dd>
                </div>
              </dl>

              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold text-brand-700">
                  Documents required ({s.documentRequirements.length})
                </summary>
                <ul className="mt-2 space-y-1 text-sm text-ink-700">
                  {s.documentRequirements.map((d) => (
                    <li key={d.docType} className="flex items-start gap-2">
                      <span className="mt-0.5 text-xs" aria-hidden>
                        {d.mandatory ? '●' : '○'}
                      </span>
                      <span>
                        {d.label}
                        {!d.mandatory && <span className="ml-1 text-xs text-ink-400">(optional)</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                <a
                  className="text-brand-700 underline"
                  href={s.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Official guidelines
                </a>
                <span className="text-ink-400">Figures verified {s.figuresVerifiedOn}</span>
                <button type="button" className="btn-secondary ml-auto !min-h-9 text-xs" onClick={() => go('apply')}>
                  Apply
                </button>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  )
}
