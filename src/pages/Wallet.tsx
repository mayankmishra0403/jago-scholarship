/**
 * Document wallet.
 *
 * The wallet is the product's most load-bearing screen. Eligibility is only ever
 * as good as the documents behind it, so the wallet is organised around three
 * ideas a tribal student will recognise from real life:
 *
 *   1. One place for every paper, wherever it came from — DigiLocker pull,
 *      e-District, a school upload, or a photograph taken here.
 *   2. Expiry is a *scheduled problem*, not a rejection. An income certificate
 *      that lapses in three months is flagged today, not on submission day.
 *   3. Reuse. The same ST certificate should never be uploaded twice, and the
 *      UI says which schemes will accept the document already in hand.
 */

import { useMemo, useState } from 'react'
import { SCHEMES } from '@shared/catalogue.ts'
import { daysUntil, relativeDays, shortDate } from '@shared/format.ts'
import { isUiLanguage, t } from '@shared/i18n.ts'
import type { DocumentType, LanguageCode, StudentDocument } from '@shared/types.ts'
import { useApp } from '@/store/app.tsx'
import { DocRow, Empty, SectionCard, Stat, StatusPill } from '@/components/bits.tsx'

/** What we can pull without the student doing anything. Both fields are dictionary keys. */
const AUTO_SOURCES: Array<{ docType: DocumentType; label: string; from: string }> = [
  { docType: 'st_certificate', label: 'wallet.auto.st_certificate', from: 'wallet.from.edistrict' },
  { docType: 'income_certificate', label: 'wallet.auto.income_certificate', from: 'wallet.from.edistrict' },
  { docType: 'domicile', label: 'wallet.auto.domicile', from: 'wallet.from.statePortal' },
  { docType: 'aadhaar', label: 'wallet.auto.aadhaar', from: 'wallet.from.digilocker' },
  { docType: 'apaar_id', label: 'wallet.auto.apaar_id', from: 'wallet.from.apaar' },
]

export const Wallet = () => {
  const { documents, profile, upsertDocument, removeDocument, toast, language } = useApp()
  const lang = isUiLanguage(language) ? language : 'en'
  const [busy, setBusy] = useState<string | null>(null)

  const expiring = useMemo(
    () =>
      documents.filter(
        (d) => d.validTill && d.status !== 'rejected' && daysUntil(d.validTill) <= 90,
      ),
    [documents],
  )
  const valid = documents.filter((d) => d.status === 'valid')
  const missing = AUTO_SOURCES.filter(
    (s) => !documents.some((d) => d.docType === s.docType),
  )

  /**
   * Auto-fetch is mocked at the connector layer, exactly like the live
   * integrations: the UI shows the same pending → resolved shape it would show
   * against a real DigiLocker round trip.
   */
  const autofetch = (docType: DocumentType, labelKey: string) => {
    setBusy(docType)
    window.setTimeout(() => {
      const existing = documents.find((d) => d.docType === docType)
      if (existing) {
        upsertDocument({ ...existing, status: 'valid', validTill: addYear(existing.validTill) })
        toast({
          tone: 'info',
          title: t(lang, 'wallet.toast.already'),
          body: t(lang, 'wallet.toast.refreshed', { document: t(lang, labelKey) }),
        })
      } else {
        const fresh: StudentDocument = {
          id: `doc-${docType}-${Date.now()}`,
          docType,
          fileName: `${docType.replace(/_/g, '_')}.pdf`,
          storagePath: null,
          mimeType: 'application/pdf',
          sizeBytes: 120_000 + Math.floor(Math.random() * 400_000),
          status: 'valid',
          validTill: addYear(null),
          source: docType === 'aadhaar' ? 'digilocker' : 'edistrict',
          matchedApplicationId: null,
          uploadedAt: new Date().toISOString(),
        }
        upsertDocument(fresh)
        toast({
          tone: 'success',
          title: t(lang, 'wallet.toast.fetched'),
          body: t(lang, 'wallet.toast.added', { document: t(lang, labelKey) }),
        })
      }
      setBusy(null)
    }, 900)
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title={t(lang, 'wallet.title')}
        subtitle={t(lang, 'wallet.subtitle')}
      >
        <div className="grid grid-cols-3 gap-2">
          <Stat label={t(lang, 'wallet.stat.valid')} value={String(valid.length)} tone="good" />
          <Stat
            label={t(lang, 'wallet.stat.expiring')}
            value={String(expiring.length)}
            tone={expiring.length ? 'warn' : 'neutral'}
            sub={t(lang, 'wallet.stat.expiringSub')}
          />
          <Stat label={t(lang, 'wallet.stat.total')} value={String(documents.length)} />
        </div>
      </SectionCard>

      {expiring.length > 0 && (
        <SectionCard
          title={t(lang, 'wallet.renew.title')}
          subtitle={t(lang, 'wallet.renew.subtitle')}
        >
          <ul>
            {expiring.map((d) => (
              <li key={d.id} className="flex items-start gap-3 border-b border-ink-100 py-3 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink-900">{labelFor(lang, d.docType)}</p>
                  <p className="hint">
                    {t(lang, 'wallet.expires', {
                      source: d.source.replace(/_/g, ' '),
                      date: shortDate(d.validTill),
                      relative: relativeDays(d.validTill),
                    })}
                  </p>
                  {ADVICE[d.docType] && (
                    <p className="mt-1 text-sm text-ink-600">{t(lang, ADVICE[d.docType]!)}</p>
                  )}
                </div>
                <StatusPill status={d.status} />
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <SectionCard
        title={t(lang, 'wallet.held.title')}
        subtitle={t(lang, 'wallet.held.subtitle')}
      >
        {documents.length === 0 ? (
          <Empty title={t(lang, 'wallet.empty.title')} body={t(lang, 'wallet.empty.body')} />
        ) : (
          <ul>
            {documents.map((d) => (
              <DocRow
                key={d.id}
                title={labelFor(lang, d.docType)}
                source={d.source}
                status={d.status}
                validTill={d.validTill}
                size={d.sizeBytes}
                actions={
                  <button
                    type="button"
                    className="btn-ghost !min-h-9 !px-2 text-xs text-ink-400 hover:text-ember"
                    onClick={() => {
                      removeDocument(d.id)
                      toast({
                        tone: 'info',
                        title: t(lang, 'wallet.toast.removed'),
                        body: t(lang, 'wallet.toast.removedDoc', {
                          document: labelFor(lang, d.docType),
                        }),
                      })
                    }}
                    aria-label={t(lang, 'wallet.removeDoc', { document: labelFor(lang, d.docType) })}
                  >
                    {t(lang, 'wallet.remove')}
                  </button>
                }
              />
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title={t(lang, 'wallet.fetch.title')}
        subtitle={t(lang, 'wallet.fetch.subtitle')}
      >
        <ul className="space-y-2">
          {AUTO_SOURCES.map((s) => {
            const held = documents.some((d) => d.docType === s.docType)
            return (
              <li key={s.docType} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-800">{t(lang, s.label)}</p>
                  <p className="hint">{t(lang, 'wallet.from', { source: t(lang, s.from) })}</p>
                </div>
                <button
                  type="button"
                  className={held ? 'btn-ghost !min-h-9 text-xs' : 'btn-secondary !min-h-9 text-xs'}
                  onClick={() => autofetch(s.docType, s.label)}
                  disabled={busy === s.docType}
                >
                  {busy === s.docType
                    ? t(lang, 'wallet.fetch.busy')
                    : held
                      ? t(lang, 'wallet.fetch.refresh')
                      : t(lang, 'wallet.fetch.action')}
                </button>
              </li>
            )
          })}
        </ul>

        {missing.length > 0 && (
          <p className="hint mt-3 border-t border-ink-100 pt-3">
            {t(lang, 'wallet.unavailable', { state: profile.stateUt })}
          </p>
        )}
      </SectionCard>

      <SectionCard
        title={t(lang, 'wallet.upload.title')}
        subtitle={t(lang, 'wallet.upload.subtitle')}
      >
        <label className="label" htmlFor="upload">
          {t(lang, 'wallet.upload.choose')}
        </label>
        <input
          id="upload"
          type="file"
          accept="image/*,application/pdf"
          className="field"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            const docType: DocumentType = 'domicile'
            upsertDocument({
              id: `doc-upload-${Date.now()}`,
              docType,
              fileName: file.name,
              storagePath: null,
              mimeType: file.type || 'application/pdf',
              sizeBytes: file.size,
              status: 'pending_review',
              validTill: null,
              source: 'upload',
              matchedApplicationId: null,
              uploadedAt: new Date().toISOString(),
            })
            toast({
              tone: 'success',
              title: t(lang, 'wallet.toast.uploaded'),
              body: t(lang, 'wallet.toast.queued', { file: file.name }),
            })
            e.target.value = ''
          }}
        />
        <p className="hint mt-2">{t(lang, 'wallet.upload.note')}</p>
      </SectionCard>

      <Reuse />
    </div>
  )
}

/** "Which of my papers does this scheme want?" — reuse is the anti-duplication story. */
const Reuse = () => {
  const { documents, language } = useApp()
  const lang = isUiLanguage(language) ? language : 'en'
  const held = new Set(documents.filter((d) => d.status === 'valid').map((d) => d.docType))

  return (
    <SectionCard
      title={t(lang, 'wallet.reuse.title')}
      subtitle={t(lang, 'wallet.reuse.subtitle')}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-left text-xs text-ink-500 uppercase">
              <th className="py-2 pr-3 font-semibold">{t(lang, 'wallet.reuse.scheme')}</th>
              <th className="py-2 pr-3 font-semibold">{t(lang, 'wallet.reuse.needed')}</th>
              <th className="py-2 pr-3 font-semibold">{t(lang, 'wallet.reuse.held')}</th>
              <th className="py-2 font-semibold">{t(lang, 'wallet.reuse.todo')}</th>
            </tr>
          </thead>
          <tbody>
            {SCHEMES.map((s) => {
              const needed = s.documentRequirements.filter((d) => d.mandatory)
              const have = needed.filter((d) => held.has(d.docType as DocumentType))
              const todo = needed.filter((d) => !held.has(d.docType as DocumentType))
              return (
                <tr key={s.code} className="border-b border-ink-100 last:border-0">
                  <td className="py-2 pr-3 font-medium text-ink-800">{s.shortName}</td>
                  <td className="py-2 pr-3 tabular-nums text-ink-600">{needed.length}</td>
                  <td className="py-2 pr-3 tabular-nums text-leaf">{have.length}</td>
                  <td className="py-2">
                    {todo.length === 0 ? (
                      <span className="text-leaf">{t(lang, 'wallet.reuse.ready')}</span>
                    ) : (
                      <span className="text-saffron-700">
                        {todo
                          .map((d) => labelFor(lang, d.docType as DocumentType))
                          .join(', ')}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}

/** Document names reused across the wallet. Values are dictionary keys. */
const DOC_LABEL_KEY: Record<DocumentType, string> = {
  st_certificate: 'wallet.doc.st_certificate',
  income_certificate: 'wallet.doc.income_certificate',
  domicile: 'wallet.doc.domicile',
  aadhaar: 'wallet.doc.aadhaar',
  disability_certificate: 'wallet.doc.disability_certificate',
  marksheet: 'wallet.doc.marksheet',
  bank_passbook: 'wallet.doc.bank_passbook',
  institution_bonafide: 'wallet.doc.institution_bonafide',
  net_jrf: 'wallet.doc.net_jrf',
  passport: 'wallet.doc.passport',
  nos_offer_letter: 'wallet.doc.nos_offer_letter',
  nos_qs_proof: 'wallet.doc.nos_qs_proof',
  apaar_id: 'wallet.doc.apaar_id',
  photo: 'wallet.doc.photo',
}

const labelFor = (lang: LanguageCode, docType: DocumentType): string =>
  DOC_LABEL_KEY[docType] ? t(lang, DOC_LABEL_KEY[docType]) : docType

/** Fresh copies of what the connectors have not updated, per document type. */
const ADVICE: Partial<Record<DocumentType, string>> = {
  income_certificate: 'wallet.advice.income_certificate',
  st_certificate: 'wallet.advice.st_certificate',
  bank_passbook: 'wallet.advice.bank_passbook',
  aadhaar: 'wallet.advice.aadhaar',
}

const addYear = (iso: string | null): string => {
  const d = iso ? new Date(iso) : new Date()
  const from = Number.isNaN(d.getTime()) ? new Date() : d
  const next = new Date(from)
  next.setFullYear(next.getFullYear() + 1)
  return next.toISOString().slice(0, 10)
}
