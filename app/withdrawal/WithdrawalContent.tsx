'use client'

import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'
import Footer from '@/components/Footer'
import { Icon } from '@/components/icons'
import { useTranslation } from '@/lib/i18n-helpers'
import { SUPPORT_EMAIL } from '@/lib/organization-json-ld'
import {
  WITHDRAWAL_RECIPIENT,
  buildWithdrawalEmailText,
  buildWithdrawalMailto,
  withdrawalFormFields,
  type WithdrawalFormStrings,
} from '@/lib/withdrawal-form'

const linkStyle = { color: 'var(--bd-coral-deep)', textDecoration: 'underline', textUnderlineOffset: 3 } as const

type CopyState = 'idle' | 'copied' | 'failed'

/**
 * `navigator.clipboard` is missing on http origins and in some in-app browsers.
 * The textarea + execCommand path is the same fallback PublicProfileView uses;
 * it answers false where even that is gone, so the page can say so instead of
 * claiming a copy that never happened.
 */
function legacyCopy(text: string): boolean {
  if (typeof document.execCommand !== 'function') return false
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    return document.execCommand('copy')
  } finally {
    document.body.removeChild(textarea)
  }
}

export default function WithdrawalContent() {
  const { t } = useTranslation()
  const [copyState, setCopyState] = useState<CopyState>('idle')

  const strings: WithdrawalFormStrings = useMemo(
    () => ({
      toLabel: t('withdrawal.formToLabel'),
      statement: t('withdrawal.formStatement'),
      ordered: t('withdrawal.formOrdered'),
      name: t('withdrawal.formName'),
      address: t('withdrawal.formAddress'),
      date: t('withdrawal.formDate'),
      signature: t('withdrawal.formSignature'),
    }),
    [t]
  )
  const emailText = useMemo(() => buildWithdrawalEmailText(strings), [strings])
  const mailto = buildWithdrawalMailto(t('withdrawal.emailSubject'), emailText)

  const copy = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(emailText)
      } else if (!legacyCopy(emailText)) {
        throw new Error('clipboard unavailable')
      }
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }, [emailText])

  return (
    <div className="bd-page flex min-h-full flex-1 flex-col">
      <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-10 sm:px-6 lg:px-8">
        <nav className="mb-6 flex items-center gap-2 text-sm" style={{ color: 'var(--bd-ink-muted)' }} aria-label={t('breadcrumbs.label')}>
          <Link href="/" className="transition-colors hover:text-bd-ink">{t('breadcrumbs.home')}</Link>
          <span>/</span>
          <span style={{ color: 'var(--bd-ink)' }}>{t('withdrawal.breadcrumb')}</span>
        </nav>

        <article className="bd-card p-8 md:p-12">
          <h1
            className="mb-6 text-3xl font-extrabold leading-tight tracking-tight"
            style={{ color: 'var(--bd-ink)', fontFamily: 'var(--bd-font-display)' }}
          >
            {t('withdrawal.title')}
          </h1>

          <div className="space-y-8 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            <section className="space-y-3">
              <p className="text-base" style={{ color: 'var(--bd-ink)' }} data-testid="withdrawal-intro">
                {t('withdrawal.intro')}
              </p>
              <p>{t('withdrawal.refund')}</p>
              <p>{t('withdrawal.startNow')}</p>
            </section>

            <section>
              <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--bd-ink)' }}>{t('withdrawal.howTitle')}</h2>
              <p className="mb-3">{t('withdrawal.howIntro')}</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  {t('withdrawal.howEmailLabel')}{' '}
                  <a href={`mailto:${SUPPORT_EMAIL}`} style={linkStyle}>{SUPPORT_EMAIL}</a>
                </li>
                <li>
                  <span className="font-semibold" style={{ color: 'var(--bd-ink)' }}>{t('withdrawal.howFormLabel')}</span>
                  {': '}
                  {t('withdrawal.howFormBody')}
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--bd-ink)' }}>{t('withdrawal.afterTitle')}</h2>
              <ol className="list-decimal space-y-1.5 pl-5">
                <li>{t('withdrawal.after1')}</li>
                <li>{t('withdrawal.after2')}</li>
              </ol>
            </section>

            <section>
              <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--bd-ink)' }}>{t('withdrawal.laterTitle')}</h2>
              <p>{t('withdrawal.later')}</p>
            </section>

            {/* The standard form (Q-0319B / Annex I(B)), as read-only text the visitor can copy */}
            <section>
              <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--bd-ink)' }}>{t('withdrawal.formTitle')}</h2>
              <div
                className="rounded-2xl p-5 sm:p-6"
                style={{ background: 'var(--bd-bg2)', border: '1px solid var(--bd-line)' }}
                data-testid="withdrawal-form"
              >
                <p className="mb-4 text-xs italic" style={{ color: 'var(--bd-ink-muted)' }}>{t('withdrawal.formHint')}</p>

                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--bd-ink-muted)' }}>
                  {strings.toLabel}
                </p>
                <p className="mt-0.5" style={{ color: 'var(--bd-ink)' }}>{WITHDRAWAL_RECIPIENT}</p>
                <p className="mt-4 font-medium" style={{ color: 'var(--bd-ink)' }}>{strings.statement}</p>

                <dl className="mt-4 space-y-3" style={{ color: 'var(--bd-ink)' }}>
                  {withdrawalFormFields(strings).map((field) => (
                    <div key={field.key} className="flex flex-wrap items-baseline gap-x-2">
                      <dt>{field.label}:</dt>
                      {/* The blank the consumer fills in; the copied text carries WITHDRAWAL_BLANK in its place. */}
                      <dd className="min-w-[8rem] flex-1" style={{ borderBottom: '1px solid var(--bd-ink-muted)' }} />
                    </div>
                  ))}
                </dl>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={() => void copy()} className="bd-btn bd-btn-primary">
                    <Icon name="copy" size={18} />
                    {t('withdrawal.copyButton')}
                  </button>
                  <a href={mailto} className="bd-btn bd-btn-soft">
                    <Icon name="mail" size={18} />
                    {t('withdrawal.emailButton')}
                  </a>
                </div>
                <p className="mt-3 min-h-[1.25rem] text-xs" role="status" aria-live="polite" style={{ color: copyState === 'failed' ? 'var(--bd-coral-deep)' : 'var(--bd-mint-deep)' }}>
                  {copyState === 'copied' && t('withdrawal.copied', { email: SUPPORT_EMAIL })}
                  {copyState === 'failed' && t('withdrawal.copyFailed')}
                </p>
              </div>
              <p className="mt-3 text-xs" style={{ color: 'var(--bd-ink-muted)' }}>{t('withdrawal.formSource')}</p>
            </section>

            <p className="pt-4" style={{ borderTop: '1px solid var(--bd-line)' }}>
              <Link href="/premium" style={linkStyle}>{t('withdrawal.backToPremium')}</Link>
            </p>
          </div>
        </article>
      </div>
      <Footer />
    </div>
  )
}
