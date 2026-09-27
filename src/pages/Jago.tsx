/**
 * JAGO — the in-app assistant.
 *
 * JAGO answers from three places, in this order, and says which one it used:
 *
 *   1. The student's own record. "Am I eligible?" is answered from the same
 *      engine that produced the verdict on the Home screen, never from a
 *      separate model that might disagree.
 *   2. The knowledge base. Scheme rules, documents, deadlines, what to do when
 *      something is rejected.
 *   3. A scripted fallback that refuses rather than guesses.
 *
 * The scripted-fallback behaviour is the honest choice for a prototype. A
 * generative answer we cannot attribute to a rule or a record is worse than an
 * admission, because a student will act on it.
 */

import { useEffect, useRef, useState } from 'react'
import { SCHEMES } from '@shared/catalogue.ts'
import { getLanguage, isUiLanguage, t } from '@shared/i18n.ts'
import { money } from '@shared/format.ts'
import type { LanguageCode } from '@shared/types.ts'
import { useApp } from '@/store/app.tsx'
import { SectionCard } from '@/components/bits.tsx'

interface Message {
  id: string
  from: 'student' | 'jago'
  text: string
  /** Where the answer came from. Rendered so it can be audited. */
  basis?: 'record' | 'knowledge' | 'refusal'
  chips?: string[]
}

/**
 * Rule-grounded question bank. Every chip is a question JAGO can answer from the
 * record or the scheme rules, in the student's own language.
 */
const suggestions = (lang: LanguageCode): string[][] => [
  [t(lang, 'jago.q.eligible'), t(lang, 'jago.q.blocked')],
  [t(lang, 'jago.q.blocked'), t(lang, 'jago.q.renew')],
  [t(lang, 'jago.q.renew'), t(lang, 'jago.q.pfms')],
  [t(lang, 'jago.q.pfms'), t(lang, 'jago.q.topclass')],
  [t(lang, 'jago.q.topclass'), t(lang, 'jago.q.eligible')],
]

/** Verdict wording, keyed by the eligibility engine's `overall` code. */
const VERDICT_KEY: Record<string, string> = {
  eligible: 'jago.v.eligible',
  deficient: 'jago.v.deficient',
  manual_review: 'jago.v.review',
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Matches a question typed in any supported language: the English keywords catch
 * a partly-typed question, and the localised chip text catches a tapped one.
 */
const asked = (
  text: string,
  lang: LanguageCode,
  keywords: string[],
  ...keys: string[]
): boolean =>
  new RegExp([...keywords, ...keys.map((k) => escapeRe(t(lang, k)))].join('|'), 'i').test(text)

export const Jago = () => {
  const { language, profile, applications, runs } = useApp()
  const lang = isUiLanguage(language) ? language : 'en'
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const meta = getLanguage(language)

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: 'greet',
          from: 'jago',
          text: t(language, 'chat.greeting'),
          basis: 'knowledge',
          chips: suggestions(language)[0]!,
        },
      ])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Guarded: scrollIntoView is missing from some Android WebViews and from
    // jsdom, and an auto-scroll is never worth breaking the chat over.
    const el = endRef.current
    if (typeof el?.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [messages])

  const ask = (question: string) => {
    const asked: Message = {
      id: `q-${Date.now()}`,
      from: 'student',
      text: question,
    }
    const reply = answer(question, { profile, applications, runs, language })
    setMessages((prev) => [...prev, asked, { ...reply, id: `a-${Date.now()}` }])
    setDraft('')
  }

  return (
    <div className="flex min-h-[70vh] flex-col gap-3">
      <SectionCard title="JAGO" subtitle={`${meta.label} · ${t(language, 'chat.mock')}`}>
        <p className="text-sm text-ink-600">{t(language, 'chat.disclaimer')}</p>
      </SectionCard>

      {/*
        role="log" + aria-live turns the transcript into a polite live region,
        so a screen reader announces each JAGO answer as it arrives instead of
        leaving a sighted-only conversation.
      */}
      <div className="flex-1 space-y-3" role="log" aria-live="polite" aria-relevant="additions">
        {messages.map((m) => (
          <div key={m.id} className={m.from === 'student' ? 'flex justify-end' : ''}>
            <div
              className={`max-w-[85%] rounded-2xl p-3 text-sm ${
                m.from === 'student'
                  ? 'bg-brand-700 text-white'
                  : 'card text-ink-800'
              }`}
            >
              {/*
                Only the assistant's own text is language-tagged. A message the
                student typed is in whatever script they typed it in, so
                claiming the active language would mispronounce it.
              */}
              <p
                className="whitespace-pre-wrap"
                lang={m.from === 'jago' && !isUiLanguage(language) ? language : undefined}
              >
                {m.text}
              </p>
              {m.basis && <BasisTag basis={m.basis} />}
              {m.chips && m.chips.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.chips.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="rounded-full border border-brand-300 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                      onClick={() => ask(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form
        className="sticky bottom-16 flex gap-2 md:bottom-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (draft.trim()) ask(draft.trim())
        }}
      >
        <input
          className="field flex-1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t(language, 'chat.placeholder')}
          aria-label={t(lang, 'jago.askAria')}
          maxLength={400}
        />
        <button type="submit" className="btn-primary" disabled={!draft.trim()}>
          {t(lang, 'jago.ask')}
        </button>
      </form>
    </div>
  )
}

const BasisTag = ({ basis }: { basis: NonNullable<Message['basis']> }) => {
  const { language } = useApp()
  const cls = {
    record: 'bg-monsoon-soft text-monsoon',
    knowledge: 'bg-ink-100 text-ink-600',
    refusal: 'bg-ember-soft text-ember',
  }[basis]
  return <span className={`pill mt-2 ${cls}`}>{t(language, `jago.basis.${basis}`)}</span>
}

/* ------------------------------------------------------------------ */
/* the answerer                                                        */
/* ------------------------------------------------------------------ */

interface AnswerContext {
  profile: ReturnType<typeof useApp>['profile']
  applications: ReturnType<typeof useApp>['applications']
  runs: ReturnType<typeof useApp>['runs']
  language: LanguageCode
}

const answer = (q: string, ctx: AnswerContext): Message => {
  // Answers follow the student's own language tier, so a tribal-language
  // question is answered in that language from the same record.
  const lang = ctx.language
  const text = q.toLowerCase()

  // 1. Eligibility, straight off the shared engine.
  if (asked(text, lang, ['eligib', 'which scheme', 'what can i get', 'apply for'], 'jago.q.eligible')) {
    const lines = SCHEMES.map((s) => {
      const out = ctx.runs[s.code]?.result
      if (!out) return t(lang, 'jago.a.checking', { scheme: s.shortName })
      return t(lang, 'jago.a.line', {
        scheme: s.shortName,
        amount: money(Number(s.benefit.monthly ?? s.benefit.annual ?? 0)),
        verdict: t(lang, VERDICT_KEY[out.overall] ?? 'jago.v.no'),
      })
    })
    return {
      id: '',
      from: 'jago',
      text: t(lang, 'jago.a.eligible', {
        name: ctx.profile.fullName,
        class: ctx.profile.currentClass,
        institution: ctx.profile.institutionName,
        schemes: lines.join('\n'),
      }),
      basis: 'record',
      chips: [t(lang, 'jago.q.blocked')],
    }
  }

  // 2. What is actually stopping them.
  if (asked(text, lang, ['block', 'stuck', 'stall', 'why.*(not|can).*submit', 'reject'], 'jago.q.blocked')) {
    const open = ctx.applications.filter((a) => a.blockingIssues.length > 0)
    if (open.length === 0) {
      return {
        id: '',
        from: 'jago',
        text: t(lang, 'jago.a.clear'),
        basis: 'record',
        chips: [t(lang, 'jago.q.renew'), t(lang, 'jago.q.pfms')],
      }
    }
    const app = open[0]!
    return {
      id: '',
      from: 'jago',
      text: t(lang, 'jago.a.held', {
        scheme: app.schemeCode.replace(/_/g, ' '),
        count: app.blockingIssues.length,
        items: app.blockingIssues.map((b) => `• ${b}`).join('\n'),
      }),
      basis: 'record',
      chips: [t(lang, 'jago.q.renew')],
    }
  }

  // 3. Knowledge-base answers.
  if (asked(text, lang, ['income certificate', 'renew', 'expire'], 'jago.q.renew')) {
    return {
      id: '',
      from: 'jago',
      text: t(lang, 'jago.a.income'),
      basis: 'knowledge',
      chips: [t(lang, 'jago.q.eligible')],
    }
  }

  if (asked(text, lang, ['pfms', 'payment', 'return', 'bank', 'seed', 'money', 'disburse'], 'jago.q.pfms')) {
    return {
      id: '',
      from: 'jago',
      text: t(lang, 'jago.a.pfms'),
      basis: 'knowledge',
      chips: [t(lang, 'jago.q.eligible')],
    }
  }

  if (asked(text, lang, ['top class'], 'jago.q.topclass')) {
    const s = SCHEMES.find((x) => x.code === 'top_class')!
    return {
      id: '',
      from: 'jago',
      text: t(lang, 'jago.a.topclass', {
        benefit: money(Number(s.benefit.monthly ?? 0)),
        documents: s.documentRequirements
          .filter((d) => d.mandatory)
          .map((d) => d.label)
          .join(', '),
        source: s.sourceUrl,
      }),
      basis: 'knowledge',
      chips: [t(lang, 'jago.q.eligible')],
    }
  }

  // 4. Refuse rather than invent.
  return {
    id: '',
    from: 'jago',
    text: t(lang, 'jago.a.refusal'),
    basis: 'refusal',
    chips: suggestions(lang)[0]!,
  }
}
