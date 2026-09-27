/**
 * Reviewer console and Ministry analytics.
 *
 * The reviewer console reads the live `v_review_queue`, which carries applicant
 * names and family income and is therefore staff-only by RLS. A visitor who
 * opens this screen without a staff session gets an honest empty state instead
 * of a fabricated queue — the prototype does not fake privileged data, and the
 * reason is printed on screen.
 *
 * The analytics screen is the opposite: `v_coverage_matrix` is built on UDISE+
 * head-counts with no personal data, so it is genuinely public and the dashboard
 * shows real national-scale numbers.
 */

import { useEffect, useMemo, useState } from 'react'
import { SCHEMES } from '@shared/catalogue.ts'
import { lakh, money, num, pct, shortDate } from '@shared/format.ts'
import {
  loadCoverage,
  loadCoverageCohorts,
  loadReviewQueue,
  type CoverageRowOut,
  type ReviewQueueRowOut,
} from '@/data/repository.ts'
import type { VerificationSource } from '@shared/types.ts'
import { isUiLanguage, t } from '@shared/i18n.ts'
import { useApp } from '@/store/app.tsx'
import {
  CheckRow,
  Empty,
  Loading,
  Meter,
  SectionCard,
  Stat,
} from '@/components/bits.tsx'

/* ------------------------------------------------------------------ */
/* reviewer                                                            */
/* ------------------------------------------------------------------ */

const QUEUE_FILTERS = ['all', 'manual_review', 'verification_running', 'documents_pending'] as const

export const Reviewer = () => {
  const { applications, language } = useApp()
  const lang = isUiLanguage(language) ? language : 'en'
  const [queue, setQueue] = useState<ReviewQueueRowOut[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<(typeof QUEUE_FILTERS)[number]>('all')
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const rows = await loadReviewQueue()
      if (!cancelled) {
        setQueue(rows)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const shown = useMemo(
    () => (queue ?? []).filter((r) => filter === 'all' || r.status === filter),
    [queue, filter],
  )

  if (loading) return <Loading label={t(lang, 'staff.queue.loading')} />

  // No live queue means no staff session. Show the local demo application so the
  // reviewer reasoning is still demonstrable, clearly labelled as such.
  const live = (queue ?? []).length > 0

  return (
    <div className="space-y-4">
      <SectionCard
        title={t(lang, 'staff.queue.title')}
        subtitle={
          live ? t(lang, 'staff.queue.live.subtitle') : t(lang, 'staff.queue.offline.subtitle')
        }
        action={
          <span className={`pill ${live ? 'bg-leaf-soft text-leaf' : 'bg-saffron-soft text-saffron-700'}`}>
            {live ? t(lang, 'staff.queue.live.badge') : t(lang, 'staff.queue.offline.badge')}
          </span>
        }
      >
        {!live && (
          <p className="rounded-xl bg-saffron-soft p-3 text-sm text-ink-800">
            <strong>{t(lang, 'staff.rls.lead')}</strong> {t(lang, 'staff.rls.body')}
          </p>
        )}

        {live && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {QUEUE_FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  filter === f ? 'bg-brand-700 text-white' : 'bg-ink-100 text-ink-600'
                }`}
              >
                {t(lang, `staff.filter.${f}`)}
              </button>
            ))}
          </div>
        )}

        {live ? (
          <ul className="space-y-2">
            {shown.map((row) => (
              <li key={row.application_id} className="card p-3">
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setOpenId(openId === row.application_id ? null : row.application_id)}
                  aria-expanded={openId === row.application_id}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-ink-900">{row.applicant_name}</span>
                    <span className="pill bg-ink-100 text-ink-600">{row.short_name}</span>
                    <span
                      className={`pill ${
                        row.risk_score >= 50
                          ? 'bg-ember-soft text-ember'
                          : row.risk_score >= 20
                            ? 'bg-saffron-soft text-saffron-700'
                            : 'bg-ink-100 text-ink-500'
                      }`}
                    >
                      {t(lang, 'staff.risk', { score: row.risk_score })}
                    </span>
                    {row.priority && <span className="pill bg-plum-soft text-plum">{row.priority}</span>}
                  </span>
                  <span className="hint mt-1 block">
                    {t(lang, 'staff.queue.row', {
                      district: row.applicant_district,
                      state: row.applicant_state,
                      institution: row.institution_name,
                      income: money(row.family_income),
                      submitted: shortDate(row.submitted_at),
                    })}
                    {row.sla_due && t(lang, 'staff.queue.sla', { date: shortDate(row.sla_due) })}
                  </span>
                  {row.reason && (
                    <span className="mt-1 block text-sm text-ink-700">
                      {t(lang, 'staff.held', { reason: row.reason })}
                    </span>
                  )}
                </button>

                {openId === row.application_id && (
                  <div className="mt-3 space-y-2 border-t border-ink-100 pt-3">
                    {row.blocking_issues.length > 0 && (
                      <div className="rounded-lg bg-ember-soft p-2 text-sm">
                        <strong>{t(lang, 'staff.blocking')}</strong> {row.blocking_issues.join('; ')}
                      </div>
                    )}
                    {row.warnings.length > 0 && (
                      <div className="rounded-lg bg-saffron-soft p-2 text-sm">
                        <strong>{t(lang, 'staff.warnings')}</strong> {row.warnings.join('; ')}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button type="button" className="btn-primary !min-h-9 text-xs">
                        {t(lang, 'staff.act.accept')}
                      </button>
                      <button type="button" className="btn-secondary !min-h-9 text-xs">
                        {t(lang, 'staff.act.ask')}
                      </button>
                      <button type="button" className="btn-ghost !min-h-9 text-xs text-ember">
                        {t(lang, 'staff.act.reject')}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <ul className="space-y-2">
            {applications.map((a) => (
              <li key={a.id} className="card p-3">
                <p className="font-bold text-ink-900">{a.applicantName}</p>
                <p className="hint">
                  {a.schemeCode.replace(/_/g, ' ')} · {a.applicantDistrict}, {a.applicantState} ·{' '}
                  {a.institutionName}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {a.blockingIssues.map((b) => (
                    <span key={b} className="pill bg-ember-soft text-ember">
                      {b}
                    </span>
                  ))}
                  {a.warnings.map((w) => (
                    <span key={w} className="pill bg-saffron-soft text-saffron-700">
                      {w}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-sm text-ink-600">{t(lang, 'staff.demo.question')}</p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title={t(lang, 'staff.decide.title')}
        subtitle={t(lang, 'staff.decide.subtitle')}
      >
        <ul className="space-y-2 text-sm text-ink-700">
          {(['1', '2', '3', '4'] as const).map((n) => (
            <li key={n}>
              <strong>{t(lang, `staff.decide.${n}.lead`)}</strong> {t(lang, `staff.decide.${n}.body`)}
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  )
}

/** The store hook, aliased so the staff screens read consistently. */
/* ------------------------------------------------------------------ */
/* analytics                                                           */
/* ------------------------------------------------------------------ */

export const Analytics = () => {
  const { language } = useApp()
  const lang = isUiLanguage(language) ? language : 'en'
  const [rows, setRows] = useState<CoverageRowOut[] | null>(null)
  const [cohorts, setCohorts] = useState<Awaited<ReturnType<typeof loadCoverageCohorts>>>(null)
  const [loading, setLoading] = useState(true)
  const [state, setState] = useState<string>('all')
  const [scheme, setScheme] = useState<string>('all')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [r, c] = await Promise.all([loadCoverage(), loadCoverageCohorts()])
      if (cancelled) return
      setRows(r)
      setCohorts(c)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <Loading label={t(lang, 'staff.analytics.loading')} />

  if (!rows || rows.length === 0) {
    return (
      <Empty
        title={t(lang, 'staff.analytics.empty.title')}
        body={t(lang, 'staff.analytics.empty.body')}
      />
    )
  }

  const states = [...new Set(rows.map((r) => r.state_ut))].sort()
  const shown = rows.filter(
    (r) => (state === 'all' || r.state_ut === state) && (scheme === 'all' || r.scheme_code === scheme),
  )

  // One row per state, so the totals are not multiplied by the scheme count.
  const byState = new Map<string, CoverageRowOut>()
  for (const r of rows) if (!byState.has(r.state_ut)) byState.set(r.state_ut, r)
  const universe = [...byState.values()]

  const enrolled = universe.reduce((n, r) => n + r.enrolled_students, 0)
  const unreached = universe.reduce((n, r) => n + r.unreached_students, 0)
  const pvtg = universe.reduce((n, r) => n + r.pvtg_students, 0)
  const noOtr = universe.reduce((n, r) => n + r.no_otr_students, 0)
  const sanctioned = rows.reduce((n, r) => n + r.sanctioned_students + r.disbursed_students, 0)
  const sanctionedAmount = rows.reduce((n, r) => n + r.sanctioned_amount, 0)

  return (
    <div className="space-y-4">
      <SectionCard
        title={t(lang, 'staff.analytics.title')}
        subtitle={t(lang, 'staff.analytics.subtitle')}
      >
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat
            label={t(lang, 'staff.stat.st.label')}
            value={num(enrolled)}
            sub={t(lang, 'staff.stat.st.sub')}
          />
          <Stat
            label={t(lang, 'staff.stat.unreached.label')}
            value={num(unreached)}
            tone={unreached > enrolled * 0.4 ? 'warn' : 'neutral'}
            sub={t(lang, 'staff.stat.unreached.sub', {
              pct: pct(enrolled > 0 ? unreached / enrolled : 0, 1),
            })}
          />
          <Stat
            label={t(lang, 'staff.stat.pvtg.label')}
            value={num(pvtg)}
            sub={pct(enrolled > 0 ? pvtg / enrolled : 0, 1)}
          />
          <Stat
            label={t(lang, 'staff.stat.noOtr.label')}
            value={num(noOtr)}
            sub={t(lang, 'staff.stat.noOtr.sub')}
            tone="warn"
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat
            label={t(lang, 'staff.stat.sanctioned.label')}
            value={num(sanctioned)}
            sub={t(lang, 'staff.stat.sanctioned.sub')}
            tone="good"
          />
          <Stat
            label={t(lang, 'staff.stat.value.label')}
            value={lakh(sanctionedAmount)}
            sub={t(lang, 'staff.stat.value.sub')}
          />
          <Stat label={t(lang, 'staff.stat.states.label')} value={String(states.length)} />
          <Stat
            label={t(lang, 'staff.stat.coverage.label')}
            value={pct(enrolled > 0 ? sanctioned / enrolled : 0, 2)}
            sub={t(lang, 'staff.stat.coverage.sub')}
          />
        </div>
      </SectionCard>

      <SectionCard
        title={t(lang, 'staff.table.title')}
        subtitle={t(lang, 'staff.table.subtitle')}
        action={
          <div className="flex gap-1.5">
            <select
              className="field !min-h-9 !w-auto text-xs"
              value={state}
              onChange={(e) => setState(e.target.value)}
              aria-label={t(lang, 'staff.filter.state')}
            >
              <option value="all">{t(lang, 'staff.allStates')}</option>
              {states.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              className="field !min-h-9 !w-auto text-xs"
              value={scheme}
              onChange={(e) => setScheme(e.target.value)}
              aria-label={t(lang, 'staff.filter.scheme')}
            >
              <option value="all">{t(lang, 'staff.allSchemes')}</option>
              {SCHEMES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.shortName}
                </option>
              ))}
            </select>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-xs text-ink-500 uppercase">
                <th className="py-2 pr-3 font-semibold">{t(lang, 'staff.table.state')}</th>
                <th className="py-2 pr-3 font-semibold">{t(lang, 'staff.table.scheme')}</th>
                <th className="py-2 pr-3 text-right font-semibold">
                  {t(lang, 'staff.table.enrolled')}
                </th>
                <th className="py-2 pr-3 text-right font-semibold">
                  {t(lang, 'staff.table.unreached')}
                </th>
                <th className="py-2 pr-3 text-right font-semibold">
                  {t(lang, 'staff.table.sanctioned')}
                </th>
                <th className="py-2 font-semibold">{t(lang, 'staff.table.reached')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={`${r.state_ut}-${r.scheme_code}`} className="border-b border-ink-100 last:border-0">
                  <td className="py-2 pr-3 font-medium text-ink-800">{r.state_ut}</td>
                  <td className="py-2 pr-3">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: r.accent }} aria-hidden />
                      <span className="text-ink-700">{r.short_name}</span>
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-ink-700">
                    {num(r.enrolled_students)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-saffron-700">
                    {num(r.unreached_students)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-ink-700">
                    {num(r.sanctioned_students + r.disbursed_students)}
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <Meter
                        value={r.sanctioned_students + r.disbursed_students}
                        max={r.enrolled_students}
                        tone="leaf"
                        label={t(lang, 'staff.table.coverageLabel', {
                          state: r.state_ut,
                          scheme: r.short_name,
                        })}
                      />
                      <span className="w-14 shrink-0 text-right text-xs tabular-nums text-ink-500">
                        {r.coverage_pct}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint mt-3">
          {t(lang, 'staff.table.sample', {
            min: Math.min(...universe.map((u) => u.sample_size)),
            max: Math.max(...universe.map((u) => u.sample_size)),
          })}
        </p>
      </SectionCard>

      <SectionCard
        title={t(lang, 'staff.outreach.title')}
        subtitle={t(lang, 'staff.outreach.subtitle')}
      >
        {cohorts && cohorts.length > 0 ? (
          <ul className="space-y-2">
            {cohorts.slice(0, 12).map((c) => (
              <li key={`${c.state_ut}-${c.district}`} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-800">
                    {c.district}, {c.state_ut}
                  </p>
                  <div className="mt-1">
                    <Meter
                      value={c.unreached_st}
                      max={cohorts[0]!.unreached_st}
                      tone="saffron"
                      label={t(lang, 'staff.outreach.meterLabel', { district: c.district })}
                    />
                  </div>
                </div>
                <div className="w-28 shrink-0 text-right text-xs">
                  <p className="font-bold tabular-nums text-saffron-700">
                    {t(lang, 'staff.outreach.unreached', { count: num(c.unreached_st) })}
                  </p>
                  <p className="hint">
                    {t(lang, 'staff.outreach.pvtgNeed', {
                      pvtg: num(c.pvtg_st),
                      score: c.avg_need_score,
                    })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty
            title={t(lang, 'staff.outreach.empty.title')}
            body={t(lang, 'staff.outreach.empty.body')}
          />
        )}
      </SectionCard>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* connector simulator                                                 */
/* ------------------------------------------------------------------ */

/**
 * Connector ids are stable engine keys; only the display copy is translated.
 *
 * Every id here must be one the connector registry actually runs, because
 * `result()` fails a connector only when its own id is in `simulateFailure`. An
 * id that is not registered produces a toggle that looks live and does nothing.
 * Two of these were wrong for exactly that reason: `nta` for a connector that
 * reports `ugc_nta`, and `nsp` for the NSP OTR check, which is `otr`.
 * `self_declared` was removed outright — the student's own claim is a
 * comparison baseline, not a connector, so there is nothing to fail.
 */
const SOURCES: Array<{ id: VerificationSource; label: string; owns: string }> = [
  { id: 'edistrict', label: 'staff.sim.edistrict.label', owns: 'staff.sim.edistrict.owns' },
  { id: 'digilocker', label: 'staff.sim.digilocker.label', owns: 'staff.sim.digilocker.owns' },
  { id: 'udise_plus', label: 'staff.sim.udise_plus.label', owns: 'staff.sim.udise_plus.owns' },
  { id: 'aishe', label: 'staff.sim.aishe.label', owns: 'staff.sim.aishe.owns' },
  { id: 'ugc_nta', label: 'staff.sim.ugc_nta.label', owns: 'staff.sim.ugc_nta.owns' },
  { id: 'otr', label: 'staff.sim.otr.label', owns: 'staff.sim.otr.owns' },
  { id: 'pfms', label: 'staff.sim.pfms.label', owns: 'staff.sim.pfms.owns' },
]

export const Simulator = () => {
  const { simulateFailure, toggleSimulator, runs, runChecks, checking, profile, language } = useApp()
  const lang = isUiLanguage(language) ? language : 'en'
  const latencies = runs.pre_matric?.latencyMs ?? {}
  const total = Object.values(latencies).reduce((n, v) => n + v, 0)

  return (
    <div className="space-y-4">
      <SectionCard
        title={t(lang, 'staff.sim.title')}
        subtitle={t(lang, 'staff.sim.subtitle')}
        action={
          <button
            type="button"
            className="btn-secondary !min-h-9 !px-3 text-xs"
            onClick={() => runChecks(SCHEMES.map((s) => s.code))}
            disabled={checking}
          >
            {checking ? t(lang, 'staff.sim.running') : t(lang, 'staff.sim.rerun')}
          </button>
        }
      >
        <p className="mb-3 rounded-lg bg-ink-50 p-2 text-sm text-ink-600">
          {t(lang, 'staff.sim.intro1')} <em>{t(lang, 'staff.sim.skipped')}</em>{' '}
          {t(lang, 'staff.sim.intro2')} <strong>{profile.fullName}</strong>.
        </p>

        <ul className="space-y-2">
          {SOURCES.map((s) => {
            const down = simulateFailure.includes(s.id)
            return (
              <li key={s.id} className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={down}
                  onClick={() => toggleSimulator(s.id)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                    down ? 'bg-ember' : 'bg-ink-300'
                  }`}
                  aria-label={t(lang, 'staff.sim.sourceStatus', {
                    source: t(lang, s.label),
                    state: t(lang, down ? 'staff.sim.state.down' : 'staff.sim.state.up'),
                  })}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                      down ? 'left-[22px]' : 'left-0.5'
                    }`}
                    aria-hidden
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-800">
                    {t(lang, s.label)}{' '}
                    {down && <span className="text-ember">{t(lang, 'staff.sim.marker.down')}</span>}
                  </p>
                  <p className="hint">{t(lang, s.owns)}</p>
                </div>
                {latencies[s.id] != null && (
                  <span className="shrink-0 text-xs tabular-nums text-ink-500">
                    {latencies[s.id]}ms
                  </span>
                )}
              </li>
            )
          })}
        </ul>

        {Object.keys(latencies).length > 0 && (
          <p className="hint mt-3 border-t border-ink-100 pt-3">
            {t(lang, 'staff.sim.answered', { count: Object.keys(latencies).length, ms: total })}
            {simulateFailure.length > 0 &&
              ` ${t(lang, 'staff.sim.forced', {
                count: simulateFailure.length,
                sources: simulateFailure.join(', '),
              })}`}
          </p>
        )}
      </SectionCard>

      <SectionCard
        title={t(lang, 'staff.sim.verdict.title')}
        subtitle={t(lang, 'staff.sim.verdict.subtitle')}
      >
        {runs.pre_matric ? (
          <>
            <ul className="space-y-2">
              {runs.pre_matric.result.checks
                .filter((c) => c.status === 'skipped' || c.status === 'fail' || c.status === 'review')
                .map((c) => (
                  <CheckRow key={c.id} check={c} />
                ))}
            </ul>
            {runs.pre_matric.result.checks.every(
              (c) => c.status !== 'skipped' && c.status !== 'fail' && c.status !== 'review',
            ) && (
              <p className="text-sm text-ink-600">{t(lang, 'staff.sim.clean')}</p>
            )}
          </>
        ) : (
          <Loading label={t(lang, 'staff.sim.runFirst')} />
        )}
      </SectionCard>
    </div>
  )
}
