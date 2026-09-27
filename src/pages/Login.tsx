/**
 * Passwordless sign-in by email OTP.
 *
 * Why a code instead of a password: the target user is on a shared or
 * low-end phone in a tribal district, where a six-digit code typed once beats a
 * password that has to be remembered, reset over the phone, or reused across
 * accounts. GoTrue enforces that itself, so this form is only the sequence.
 *
 * A code is not a weaker credential here — the interesting security decision is
 * that the *role* is never chosen on this screen. The `role` column is written
 * by the `handle_new_auth_user` trigger and guarded by `protect_profile_role`,
 * so a user cannot make themselves a reviewer by tampering with this form.
 */

import { useState } from 'react'
import { SectionCard } from '@/components/bits.tsx'
import { useApp } from '@/store/app.tsx'
import { isUiLanguage, t } from '@shared/i18n.ts'
import { AuthError, auth } from '@/lib/supabase.ts'
import type { AuthSession } from '@/lib/supabase.ts'

type Step = 'email' | 'code'

export const Login = ({ onDone }: { onDone: (s: AuthSession | null) => void }) => {
  const { language, toast } = useApp()
  const lang = isUiLanguage(language) ? language : 'en'

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await auth.sendOtp(email.trim(), {
        createUser: true,
        fullName: name.trim() || undefined,
        preferredLanguage: lang,
      })
      setStep('code')
    } catch (err) {
      // These three are configuration or quota states, not bad input. Showing
      // GoTrue's raw text for them is worse than useless: "email rate limit
      // exceeded" does not tell a first-time user that the site owner has to
      // attach an SMTP provider, and it does not distinguish an exhausted quota
      // from the 60-second per-address cooldown.
      if (err instanceof AuthError) {
        if (err.code === 'otp_disabled') {
          setError(t(lang, 'auth.err.otp_disabled'))
        } else if (err.code === 'over_email_send_rate_limit') {
          setError(t(lang, 'auth.err.email_rate_limit'))
        } else if (err.status === 429) {
          setError(t(lang, 'auth.err.rate_limit'))
        } else {
          setError(err.message)
        }
      } else {
        setError(t(lang, 'auth.err.network'))
      }
    } finally {
      setBusy(false)
    }
  }

  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const session = await auth.verifyOtp(email.trim(), code)
      toast({ tone: 'success', title: t(lang, 'auth.signed_in') })
      onDone(session)
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'That code did not match.')
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md py-4">
      <SectionCard
        title={t(lang, 'auth.title')}
        subtitle={t(lang, 'auth.subtitle')}
      >
        {step === 'email' ? (
          <form onSubmit={send} className="space-y-3">
            <div>
              <label className="label" htmlFor="auth-email">
                {t(lang, 'auth.email')}
              </label>
              <input
                id="auth-email"
                type="email"
                required
                autoComplete="email"
                className="field"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="auth-name">
                {t(lang, 'auth.name')}
              </label>
              <input
                id="auth-name"
                className="field"
                autoComplete="name"
                placeholder={t(lang, 'auth.name_placeholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <p className="hint mt-1">{t(lang, 'auth.name_hint')}</p>
            </div>
            {error && (
              <p role="alert" className="text-sm text-ember">
                {error}
              </p>
            )}
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? t(lang, 'auth.sending') : t(lang, 'auth.send_code')}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-3">
            <p className="text-sm text-ink-700">
              {t(lang, 'auth.code_sent', { email: email.trim() })}
            </p>
            <div>
              <label className="label" htmlFor="auth-code">
                {t(lang, 'auth.code')}
              </label>
              <input
                id="auth-code"
                className="field text-center font-mono text-lg tracking-[0.4em]"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-ember">
                {error}
              </p>
            )}
            <button type="submit" className="btn-primary w-full" disabled={busy || code.length < 6}>
              {busy ? t(lang, 'auth.checking') : t(lang, 'auth.verify')}
            </button>
            <div className="flex justify-between gap-2">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setStep('email')
                  setError(null)
                }}
              >
                {t(lang, 'auth.change_email')}
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={busy}
                onClick={() => {
                  setBusy(true)
                  auth
                    .sendOtp(email.trim(), { createUser: true, fullName: name.trim() || undefined })
                    .catch(() => setError('Could not resend.'))
                    .finally(() => setBusy(false))
                }}
              >
                {t(lang, 'auth.resend')}
              </button>
            </div>
          </form>
        )}

        <p className="mt-4 border-t border-ink-200 pt-3 text-xs leading-relaxed text-ink-600">
          {t(lang, 'auth.legal')}
        </p>
      </SectionCard>

      <div className="mt-3 text-center text-xs text-ink-500">
        <p className="mb-1">{t(lang, 'auth.demo_intro')}</p>
        <button type="button" className="underline" onClick={() => onDone(null)}>
          {t(lang, 'auth.continue_demo')}
        </button>
      </div>
    </div>
  )
}
