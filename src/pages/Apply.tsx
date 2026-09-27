/**
 * Apply wizard and application tracker.
 *
 * The wizard is four steps and it refuses to let a student submit into a known
 * failure. That refusal is the point: the blocking items come from the same
 * engine the reviewer and the sanction file use, so "you cannot apply yet"
 * always has a stated, sourced reason and a stated fix.
 *
 * The tracker then tells the truth about where the application is, including
 * the parts that are uncomfortable — a pending reviewer decision, a payment
 * returned by PFMS because the bank account was never Aadhaar-seeded.
 */

import { useMemo, useState } from 'react'
import { SCHEMES, schemeByCode } from '@shared/catalogue.ts'
import { dateTime, money, shortDate } from '@shared/format.ts'
import { isUiLanguage, t } from '@shared/i18n.ts'
import { saveApplication } from '@/data/repository.ts'
import type { Application, DocumentType, SchemeCode } from '@shared/types.ts'
import { useApp, useRun } from '@/store/app.tsx'
import { CheckRow, Empty, Meter, SectionCard, StatusPill } from '@/components/bits.tsx'

/* ------------------------------------------------------------------ */
/* apply                                                               */
/* ------------------------------------------------------------------ */

/** Dictionary keys, one per step. `apply.step` wraps the number and the name. */
const STEPS = [
  'apply.step.scheme',
  'apply.step.details',
  'apply.step.documents',
  'apply.step.submit',
] as const

export const Apply = () => {
  const {
    profile,
    documents,
    applications,
    addApplication,
    toast,
    runChecks,
    checking,
    language,
  } = useApp()
  // The wizard is interface chrome, so it follows the full-UI language tier.
  const lang = isUiLanguage(language) ? language : 'en'
  const [step, setStep] = useState(0)
  const [code, setCode] = useState<SchemeCode>('pre_matric')
  const [saving, setSaving] = useState(false)
  const [persisted, setPersisted] = useState<string | null>(null)

  const scheme = schemeByCode(code)
  const { run } = useRun(code)
  const out = run?.result
  const already = applications.find(
    (a) => a.schemeCode === code && !['rejected', 'draft'].includes(a.status),
  )

  const held = useMemo(
    () => new Set(documents.filter((d) => d.status === 'valid').map((d) => d.docType)),
    [documents],
  )
  const needed = scheme?.documentRequirements.filter((d) => d.mandatory) ?? []
  const missing = needed.filter((d) => !held.has(d.docType as DocumentType))
  const blocked = (out?.blockingIssues.length ?? 0) > 0

  const submit = async () => {
    if (!scheme) return
    setSaving(true)
    try {
      // The database write needs a Supabase session. Without one this returns
      // null and we keep the application locally rather than faking a receipt.
      const id = await saveApplication({
        schemeCode: code,
        status: 'submitted',
        blockingIssues: out?.blockingIssues ?? [],
        warnings: out?.warnings ?? [],
        profile,
      }).catch(() => null)
      setPersisted(id)

      const app: Application = {
        id: id ?? `app-local-${Date.now()}`,
        schemeCode: code,
        status: 'submitted',
        blockingIssues: out?.blockingIssues ?? [],
        warnings: out?.warnings ?? [],
        startedAt: new Date().toISOString(),
        submittedAt: new Date().toISOString(),
        applicantName: profile.fullName,
        applicantState: profile.stateUt,
        applicantDistrict: profile.district,
        institutionName: profile.institutionName,
        familyIncome: profile.annualFamilyIncome,
      }
      addApplication(app)
      toast({
        tone: 'success',
        title: t(lang, 'apply.toast.submitted', { scheme: scheme.shortName }),
        body: id
          ? t(lang, 'apply.toast.saved')
          : t(lang, 'apply.toast.local'),
      })
      setStep(3)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <ol className="flex items-center gap-1" aria-label={t(lang, 'apply.progress')}>
        {STEPS.map((stepKey, i) => (
          <li key={stepKey} className="flex flex-1 items-center gap-1">
            <div className="flex-1">
              <div
                className={`h-1.5 rounded-full ${i <= step ? 'bg-brand-600' : 'bg-ink-200'}`}
                aria-hidden
              />
              <p
                className={`mt-1 truncate text-[11px] font-semibold ${
                  i === step ? 'text-brand-800' : 'text-ink-400'
                }`}
              >
                {t(lang, 'apply.step', { n: i + 1, name: t(lang, stepKey) })}
              </p>
            </div>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <SectionCard
          title={t(lang, 'apply.choose.title')}
          subtitle={t(lang, 'apply.choose.subtitle')}
        >
          {already && (
            <p className="mb-3 rounded-lg bg-monsoon-soft p-2 text-sm text-monsoon">
              {t(lang, 'apply.choose.already', {
                scheme: schemeByCode(already.schemeCode)?.shortName ?? '',
                status: t(lang, TIMELINE[already.status].label),
              })}
            </p>
          )}
          <ul className="space-y-2">
            {SCHEMES.map((s) => {
              const active = s.code === code
              return (
                <li key={s.code}>
                  <button
                    type="button"
                    onClick={() => {
                      setCode(s.code)
                      void runChecks([s.code])
                    }}
                    aria-pressed={active}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      active
                        ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-600/20'
                        : 'border-ink-200 hover:border-ink-300 hover:bg-ink-50'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ background: s.accent }} aria-hidden />
                      <span className="font-bold text-ink-900">{s.name}</span>
                      {typeof s.benefit.monthly === 'number' && (
                        <span className="ml-auto text-sm font-semibold text-ink-700">
                          {money(s.benefit.monthly)}/mo
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-sm text-ink-600">{s.eligibilitySummary}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          <button
            type="button"
            className="btn-primary mt-4 w-full"
            onClick={() => setStep(1)}
            disabled={!scheme}
          >
            {t(lang, 'apply.continueWith', { scheme: scheme?.shortName ?? '' })}
          </button>
        </SectionCard>
      )}

      {step === 1 && scheme && (
        <SectionCard
          title={t(lang, 'apply.details.title')}
          subtitle={t(lang, 'apply.details.subtitle')}
        >
          <dl className="divide-y divide-ink-100 text-sm">
            {(
              [
                [t(lang, 'apply.detail.name'), profile.fullName],
                [t(lang, 'apply.detail.tribe'), profile.tribe || '—'],
                [t(lang, 'apply.detail.category'), profile.category],
                [t(lang, 'apply.detail.class'), `${profile.currentClass} · ${profile.courseName}`],
                [t(lang, 'apply.detail.institution'), profile.institutionName],
                [t(lang, 'apply.detail.udise'), t(lang, 'apply.detail.udiseValue')],
                [
                  t(lang, 'apply.detail.stateDistrict'),
                  `${profile.district}, ${profile.stateUt}`,
                ],
                [t(lang, 'apply.detail.income'), money(profile.annualFamilyIncome)],
                [
                  t(lang, 'apply.detail.bank'),
                  profile.bankAadhaarSeeded
                    ? t(lang, 'apply.detail.bankSeeded')
                    : t(lang, 'apply.detail.bankUnseeded'),
                ],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-3 py-2">
                <dt className="text-ink-500">{k}</dt>
                <dd className="max-w-[60%] text-right font-medium text-ink-800">{v}</dd>
              </div>
            ))}
          </dl>

          {blocked && (
            <div className="mt-3 rounded-xl bg-ember-soft p-3">
              <p className="text-sm font-bold text-ember">{t(lang, 'apply.blocked.title')}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-800">
                {out?.blockingIssues.map((b) => <li key={b}>{b}</li>)}
              </ul>
              <p className="mt-2 text-sm text-ink-700">{t(lang, 'apply.blocked.fix')}</p>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => setStep(0)}>
              {t(lang, 'common.back')}
            </button>
            <button type="button" className="btn-primary flex-1" onClick={() => setStep(2)}>
              {t(lang, 'common.continue')}
            </button>
          </div>
        </SectionCard>
      )}

      {step === 2 && scheme && (
        <SectionCard
          title={t(lang, 'apply.docs.title')}
          subtitle={t(lang, 'apply.docs.subtitle', {
            have: needed.length - missing.length,
            total: needed.length,
          })}
        >
          <Meter
            value={needed.length - missing.length}
            max={needed.length}
            tone={missing.length ? 'saffron' : 'leaf'}
            label={t(lang, 'apply.docs.ready')}
          />
          <ul className="mt-3 space-y-2">
            {scheme.documentRequirements.map((d) => {
              const doc = documents.find((x) => x.docType === d.docType)
              return (
                <li key={d.docType} className="flex items-center gap-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-ink-800">{d.label}</span>
                    {!d.mandatory && (
                      <span className="ml-1 text-xs text-ink-400">
                        {t(lang, 'common.optional')}
                      </span>
                    )}
                    {doc?.validTill && (
                      <span className="hint block">
                        {t(lang, 'apply.docs.validTill', { date: shortDate(doc.validTill) })}
                      </span>
                    )}
                  </span>
                  {doc ? (
                    <StatusPill status={doc.status} />
                  ) : d.mandatory ? (
                    <span className="pill bg-ember-soft text-ember">
                      {t(lang, 'common.missing')}
                    </span>
                  ) : (
                    <span className="pill bg-ink-100 text-ink-500">
                      {t(lang, 'common.notNeeded')}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>

          {missing.length > 0 && (
            <p className="mt-3 rounded-lg bg-saffron-soft p-2 text-sm text-ink-800">
              {t(lang, 'apply.docs.addFirst', {
                documents: missing.map((d) => d.label).join(', '),
              })}
            </p>
          )}

          {out && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold text-brand-700">
                {t(lang, 'apply.docs.seeChecks', { count: out.checks.length })}
              </summary>
              <ul className="mt-2 space-y-2">
                {out.checks.map((c) => (
                  <CheckRow key={c.id} check={c} />
                ))}
              </ul>
            </details>
          )}

          <div className="mt-4 flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => setStep(1)}>
              {t(lang, 'common.back')}
            </button>
            <button
              type="button"
              className="btn-primary flex-1"
              onClick={() => setStep(3)}
              disabled={blocked || missing.length > 0 || checking}
            >
              {blocked || missing.length > 0
                ? t(lang, 'apply.docs.notReady')
                : t(lang, 'apply.docs.reviewSubmit')}
            </button>
          </div>
        </SectionCard>
      )}

      {step === 3 && scheme && (
        <SectionCard
          title={
            persisted || already ? t(lang, 'apply.done.received') : t(lang, 'apply.done.readyTitle')
          }
        >
          <div className="rounded-xl bg-leaf-soft p-3">
            <p className="font-bold text-leaf">
              {persisted || already
                ? t(lang, 'apply.done.queued', { scheme: scheme.shortName })
                : t(lang, 'apply.done.ready', { scheme: scheme.shortName })}
            </p>
            <p className="mt-1 text-sm text-ink-700">
              {persisted
                ? t(lang, 'apply.done.persisted')
                : already
                  ? t(lang, 'apply.done.replaced')
                  : t(lang, 'apply.done.local')}
            </p>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" className="btn-secondary flex-1" onClick={() => setStep(0)}>
              {t(lang, 'apply.done.another')}
            </button>
            <button
              type="button"
              className="btn-primary flex-1"
              onClick={submit}
              disabled={saving || Boolean(persisted) || Boolean(already)}
            >
              {saving
                ? t(lang, 'apply.done.submitting')
                : persisted || already
                  ? t(lang, 'apply.done.submitted')
                  : t(lang, 'apply.done.submitNow')}
            </button>
          </div>
        </SectionCard>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* tracker                                                             */
/* ------------------------------------------------------------------ */

/** Stage copy by status. Both fields are dictionary keys, resolved with `t`. */
const TIMELINE: Record<Application['status'], { label: string; blurb: string }> = {
  draft: { label: 'apply.status.draft.label', blurb: 'apply.status.draft.blurb' },
  eligibility_checked: {
    label: 'apply.status.eligibility_checked.label',
    blurb: 'apply.status.eligibility_checked.blurb',
  },
  documents_pending: {
    label: 'apply.status.documents_pending.label',
    blurb: 'apply.status.documents_pending.blurb',
  },
  submitted: { label: 'apply.status.submitted.label', blurb: 'apply.status.submitted.blurb' },
  verification_running: {
    label: 'apply.status.verification_running.label',
    blurb: 'apply.status.verification_running.blurb',
  },
  manual_review: {
    label: 'apply.status.manual_review.label',
    blurb: 'apply.status.manual_review.blurb',
  },
  sanctioned: { label: 'apply.status.sanctioned.label', blurb: 'apply.status.sanctioned.blurb' },
  rejected: { label: 'apply.status.rejected.label', blurb: 'apply.status.rejected.blurb' },
  payment_returned: {
    label: 'apply.status.payment_returned.label',
    blurb: 'apply.status.payment_returned.blurb',
  },
  disbursed: { label: 'apply.status.disbursed.label', blurb: 'apply.status.disbursed.blurb' },
}

const ORDER: Application['status'][] = [
  'draft',
  'eligibility_checked',
  'documents_pending',
  'submitted',
  'verification_running',
  'manual_review',
  'sanctioned',
  'disbursed',
]

export const Tracker = () => {
  const { applications, profile, setApplicationStatus, toast, language } = useApp()
  const lang = isUiLanguage(language) ? language : 'en'

  if (applications.length === 0) {
    return (
      <Empty title={t(lang, 'apply.empty.title')} body={t(lang, 'apply.empty.body')} />
    )
  }

  return (
    <div className="space-y-4">
      {applications.map((app) => {
        const scheme = schemeByCode(app.schemeCode)
        const stage = ORDER.indexOf(app.status)
        const returned = app.status === 'payment_returned'
        return (
          <SectionCard
            key={app.id}
            title={scheme?.name ?? app.schemeCode}
            subtitle={`${app.applicantState} · ${app.institutionName}`}
            action={<StatusPill status={app.status} />}
          >
            <ol className="space-y-0">
              {ORDER.map((s, i) => {
                const done = stage >= i && stage !== -1
                const current = s === app.status
                return (
                  <li key={s} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`h-3 w-3 shrink-0 rounded-full ${
                          done ? 'bg-brand-600' : 'bg-ink-200'
                        }`}
                        aria-hidden
                      />
                      {i < ORDER.length - 1 && (
                        <span className={`w-0.5 flex-1 ${done ? 'bg-brand-200' : 'bg-ink-200'}`} aria-hidden />
                      )}
                    </div>
                    <div className="pb-4">
                      <p className={`text-sm font-semibold ${current ? 'text-brand-800' : done ? 'text-ink-700' : 'text-ink-400'}`}>
                        {t(lang, TIMELINE[s].label)}
                        {current && t(lang, 'apply.here')}
                      </p>
                      <p className="hint">{t(lang, TIMELINE[s].blurb)}</p>
                    </div>
                  </li>
                )
              })}
            </ol>

            {app.blockingIssues.length > 0 && (
              <div className="rounded-xl bg-ember-soft p-3">
                <p className="text-sm font-bold text-ember">{t(lang, 'apply.blocking')}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-800">
                  {app.blockingIssues.map((b) => <li key={b}>{b}</li>)}
                </ul>
              </div>
            )}

            {returned && (
              <div className="rounded-xl bg-saffron-soft p-3">
                <p className="text-sm font-bold text-saffron-700">{t(lang, 'apply.returned')}</p>
                <p className="mt-1 text-sm text-ink-700">
                  {profile.bankAadhaarSeeded
                    ? t(lang, 'apply.returnSeeded')
                    : t(lang, 'apply.returnUnseeded')}
                </p>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-500">
              <span>{t(lang, 'apply.started', { date: dateTime(app.startedAt) })}</span>
              {app.submittedAt && (
                <span>{t(lang, 'apply.submittedAt', { date: dateTime(app.submittedAt) })}</span>
              )}
            </div>

            {/* The prototype lets a judge drive the pipeline to show the states a
                student would otherwise wait weeks to see. Each button is labelled
                as a simulation so nobody mistakes it for a real portal action. */}
            <div className="mt-3 border-t border-ink-100 pt-3">
              <p className="hint mb-2">{t(lang, 'apply.demoControls')}</p>
              <div className="flex flex-wrap gap-2">
                {(['verification_running', 'manual_review', 'sanctioned', 'payment_returned', 'disbursed'] as const)
                  .filter((s) => s !== app.status)
                  .slice(0, 3)
                  .map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="btn-secondary !min-h-9 text-xs"
                      onClick={() => {
                        setApplicationStatus(app.id, s)
                        toast({
                          tone: 'info',
                          title: t(lang, TIMELINE[s].label),
                          body: t(lang, TIMELINE[s].blurb),
                        })
                      }}
                    >
                      → {t(lang, TIMELINE[s].label)}
                    </button>
                  ))}
              </div>
            </div>
          </SectionCard>
        )
      })}
    </div>
  )
}
