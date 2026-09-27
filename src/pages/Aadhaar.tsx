/**
 * Aadhaar / DigiLocker verification screen.
 *
 * The ordering is the point. Consent comes first, the reason for the check is
 * stated before the number is asked for, and the simulation badge is on screen
 * at all times rather than hidden in a settings page. A user who believes they
 * are talking to a government portal must never be wrong about that.
 *
 * The number is held in component state only. It is never written to the
 * store, to localStorage, or to the database — only the last four digits
 * survive a verification, and only the result is persisted by the caller.
 */

import { useState } from 'react'
import { SectionCard } from '@/components/bits.tsx'
import { useApp } from '@/store/app.tsx'
import { auth } from '@/lib/supabase.ts'
import { isUiLanguage, t } from '@shared/i18n.ts'
import type { LanguageCode } from '@shared/types.ts'
import {
  DEMO_FIXTURES,
  digilockerAuthorizeUrl,
  identityMessage,
  resolveProvider,
  type IdentityResult,
  type VerifyOutcome,
} from '@/lib/identity.ts'

type Stage = 'explain' | 'consent' | 'number' | 'otp' | 'done'

export const AadhaarVerify = () => {
  const { language, toast } = useApp()
  const lang: LanguageCode = isUiLanguage(language) ? language : 'en'

  // A single boolean, no credential: the browser cannot hold a partner secret,
  // because there is nowhere in the build for one to live.
  const provider = resolveProvider({
    gatewayUrl: import.meta.env.VITE_UIDAI_GATEWAY_URL as string | undefined,
  })
  const digilocker = digilockerAuthorizeUrl(
    {
      clientId: import.meta.env.VITE_DIGILOCKER_CLIENT_ID as string | undefined,
      redirectUri: `${window.location.origin}/digilocker/callback`,
    },
    // A CSRF nonce; the real callback validates it before exchanging the code.
    crypto.randomUUID(),
  )

  const [stage, setStage] = useState<Stage>('explain')
  const [number, setNumber] = useState('')
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<VerifyOutcome | null>(null)
  const [result, setResult] = useState<IdentityResult | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    // The caller's own token, so the server knows who is asking. This is not a
    // partner credential and grants no authority over UIDAI.
    const { data } = await auth.getSession()
    const res = await provider.verify({
      aadhaarNumber: number,
      otp: otp || undefined,
      accessToken: data.session?.access_token,
    })
    setBusy(false)
    setOutcome(res)
    if (res.status === 'verified') {
      setResult(res.result)
      setStage('done')
    } else if (res.status === 'invalid_input' && res.reason === 'otp') {
      setStage('otp')
    }
  }

  return (
    <div className="space-y-4">
      {/* The honesty banner. Present on every stage, not just this one. */}
      <div
        role="note"
        className={`flex items-start gap-2 border-l-4 p-3 text-sm ${
          provider.simulated
            ? 'border-l-[#f47738] bg-[#f47738]/10 text-ink-800'
            : 'border-l-leaf bg-leaf-soft text-ink-800'
        }`}
      >
        <span aria-hidden className="text-base leading-none">
          {provider.simulated ? '▲' : '✓'}
        </span>
        <p className="leading-snug">
          {provider.simulated ? (
            <>
              <strong>{t(lang, 'aadhaar.demo_mode')}</strong>{' '}
              {t(lang, 'aadhaar.demo_mode_body')}
              <span className="mt-1 block text-ink-600">
                {t(lang, 'aadhaar.demo_mode_note')}
              </span>
            </>
          ) : (
            <>
              <strong>{t(lang, 'aadhaar.live_mode')}</strong>{' '}
              {t(lang, 'aadhaar.live_mode_body', { authority: provider.authority })}
            </>
          )}
        </p>
      </div>

      <SectionCard title={t(lang, 'aadhaar.title')} subtitle={provider.label}>
        {stage === 'explain' && (
          <>
            <p className="text-sm text-ink-700">
              Tribal status is claimed on a single document. If that document is typed
              differently from the school record — “Hansda” against “Hansdah”, or a
              middle name present on one and absent on the other — the check is sent to a
              reviewer and the application stalls. A single verification settles it.
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-ink-700">
              <li className="flex gap-2">
                <span aria-hidden className="text-leaf">✓</span>
                Confirms the number belongs to a real person, so a certificate cannot be
                issued in a dead person’s name.
              </li>
              <li className="flex gap-2">
                <span aria-hidden className="text-leaf">✓</span>
                Reads the registered name, so a spelling variant becomes a reviewer task
                instead of a rejection.
              </li>
              <li className="flex gap-2">
                <span aria-hidden className="text-monsoon">•</span>
                Only the last four digits and the result are kept. This app never stores a
                full Aadhaar number.
              </li>
            </ul>
            <button
              type="button"
              className="btn-primary mt-4"
              onClick={() => setStage('consent')}
            >
              {t(lang, 'aadhaar.start')}
            </button>
          </>
        )}

        {stage === 'consent' && (
          <div className="space-y-3">
            <div className="border border-ink-200 bg-ink-50 p-3 text-sm">
              <p className="font-semibold text-ink-900">{t(lang, 'aadhaar.consent.title')}</p>
              <p className="mt-1 leading-relaxed text-ink-700">
                {t(lang, 'aadhaar.consent.body', {
                  register: provider.simulated
                    ? t(lang, 'aadhaar.simulated_register')
                    : t(lang, 'aadhaar.national_register'),
                })}
              </p>
              <p className="mt-2 text-ink-600">{t(lang, 'aadhaar.consent.restricted')}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary"
                onClick={() => setStage('number')}
              >
                {t(lang, 'aadhaar.consent.accept')}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setStage('explain')}>
                {t(lang, 'aadhaar.consent.decline')}
              </button>
            </div>
          </div>
        )}

        {(stage === 'number' || stage === 'otp') && (
          <form onSubmit={submit} className="space-y-3">
            {stage === 'number' && (
              <div>
                <label className="label" htmlFor="aadhaar-num">
                  {t(lang, 'aadhaar.label')}
                </label>
                <input
                  id="aadhaar-num"
                  className="field font-mono tracking-[0.3em]"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={14}
                  placeholder="XXXX XXXX XXXX"
                  value={number}
                  onChange={(e) => setNumber(e.target.value.replace(/[^\d X]/gi, ''))}
                  aria-describedby="aadhaar-hint"
                />
                <p id="aadhaar-hint" className="hint mt-1">
                  {t(lang, 'aadhaar.hint', {
                    match: DEMO_FIXTURES.match,
                    miss: DEMO_FIXTURES.miss,
                  })}
                </p>
              </div>
            )}

            {stage === 'otp' && (
              <div>
                <label className="label" htmlFor="aadhaar-otp">
                  {t(lang, 'aadhaar.otp.label')}
                </label>
                <input
                  id="aadhaar-otp"
                  className="field font-mono tracking-[0.5em]"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                />
              </div>
            )}

            {outcome && outcome.status !== 'verified' && (
              <p role="alert" className="text-sm text-ember">
                {identityMessage(outcome, lang)}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? t(lang, 'aadhaar.checking') : t(lang, 'aadhaar.submit')}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setStage('explain')
                  setOutcome(null)
                  setNumber('')
                  setOtp('')
                }}
              >
                {t(lang, 'aadhaar.start_over')}
              </button>
            </div>
          </form>
        )}

        {stage === 'done' && result && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 border border-leaf/40 bg-leaf-soft p-3">
              <span aria-hidden className="text-leaf">✓</span>
              <div className="text-sm">
                <p className="font-semibold text-ink-900">
                  {t(lang, 'aadhaar.result.title')}
                </p>
                <p className="mt-1 text-ink-700">
                  {t(lang, 'aadhaar.result.line', { name: result.nameOnRecord ?? '—' })}
                </p>
                <p className="text-ink-700">
                  {t(lang, 'aadhaar.result.masked', { last4: result.maskedNumber })}
                </p>
              </div>
            </div>

            {/* The transliteration case, stated plainly rather than as an error. */}
            {result.nameOnRecord &&
              result.nameOnRecord.replace(/\s+/g, '').toLowerCase() !==
                'suriyahansda' && (
                <div className="border-l-4 border-l-saffron bg-saffron-soft p-3 text-sm">
                  <p className="font-semibold text-ink-900">
                    {t(lang, 'aadhaar.result.spelling')}
                  </p>
                  <p className="mt-1 text-ink-700">
                    {t(lang, 'aadhaar.result.spelling_body', {
                      register: result.nameOnRecord,
                      wallet: 'Suriya Hansda',
                    })}
                  </p>
                  <button
                    type="button"
                    className="btn-secondary mt-2"
                    onClick={() =>
                      toast({
                        tone: 'info',
                        title: t(lang, 'aadhaar.result.sent'),
                        body: t(lang, 'aadhaar.result.sent_body'),
                      })
                    }
                  >
                    {t(lang, 'aadhaar.result.send_review')}
                  </button>
                </div>
              )}

            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setStage('explain')
                setOutcome(null)
                setResult(null)
                setNumber('')
                setOtp('')
              }}
            >
              {t(lang, 'aadhaar.start_over')}
            </button>
          </div>
        )}
      </SectionCard>

      <SectionCard title={t(lang, 'aadhaar.how.title')}>
        <div className="space-y-3 text-sm text-ink-700">
          <p>{t(lang, 'aadhaar.how.p1')}</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>{t(lang, 'aadhaar.how.step1')}</li>
            <li>{t(lang, 'aadhaar.how.step2')}</li>
            <li>{t(lang, 'aadhaar.how.step3')}</li>
            <li>{t(lang, 'aadhaar.how.step4')}</li>
          </ol>
          <p className="border-t border-ink-200 pt-3">{t(lang, 'aadhaar.how.p2')}</p>

          <div className="mt-4 border-t border-ink-200 pt-3">
            <p className="font-semibold text-ink-900">{t(lang, 'aadhaar.dl.title')}</p>
            <p className="mt-1">{t(lang, 'aadhaar.dl.body')}</p>
            {digilocker.configured ? (
              <a
                className="btn-primary mt-3"
                href={digilocker.url}
                rel="noreferrer noopener"
                target="_blank"
              >
                {t(lang, 'aadhaar.dl.start')}
              </a>
            ) : (
              <p className="hint mt-2">
                {t(lang, 'aadhaar.dl.not_configured')}
              </p>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
