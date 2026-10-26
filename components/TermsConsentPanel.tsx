'use client'

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n-helpers'

interface TermsConsentPanelProps {
  /** Records the acceptance; resolves false when it was not stored, and the panel says so. */
  onAccept: () => Promise<boolean>
  /** Takes focus when it replaced the input the player was typing in. */
  autoFocus?: boolean
  /** 'play' where the text is a move other players see, not a chat message. */
  context?: 'chat' | 'play'
  /** One row, for a slot sized for a single input. */
  compact?: boolean
  className?: string
  style?: CSSProperties
}

const linkClass =
  'rounded-md text-bd-ink-soft underline underline-offset-2 transition-colors hover:text-bd-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav-deep focus-visible:outline-hidden'

/**
 * Stands in for a composer until the viewer has accepted the Terms of Use and the Community
 * Rules (#1466): Google Play's user-generated-content policy, enforced by the server with a
 * 403 TERMS_REQUIRED on chat and Alias guesses.
 */
export default function TermsConsentPanel({
  onAccept,
  autoFocus = false,
  context = 'chat',
  compact = false,
  className = '',
  style,
}: TermsConsentPanelProps) {
  const { t } = useTranslation()
  const [state, setState] = useState<'idle' | 'saving' | 'failed'>('idle')
  const acceptRef = useRef<HTMLButtonElement>(null)
  const promptId = useId()

  useEffect(() => {
    if (autoFocus) acceptRef.current?.focus()
  }, [autoFocus])

  const accept = async () => {
    if (state === 'saving') return
    setState('saving')
    setState((await onAccept()) ? 'idle' : 'failed')
  }

  const prompt = t(context === 'play' ? 'chat.termsPromptPlay' : 'chat.termsPrompt')
  const acceptLabel = t(context === 'play' ? 'chat.termsAcceptPlay' : 'chat.termsAccept')
  const links = (
    <>
      <Link href="/terms" prefetch={false} target="_blank" rel="noopener noreferrer" className={linkClass}>
        {t('chat.termsTerms')}
      </Link>
      <Link href="/rules" prefetch={false} target="_blank" rel="noopener noreferrer" className={linkClass}>
        {t('chat.termsRules')}
      </Link>
    </>
  )
  const button = (
    <button
      ref={acceptRef}
      type="button"
      onClick={accept}
      disabled={state === 'saving'}
      aria-describedby={promptId}
      className={`bd-btn bd-btn-primary shrink-0 justify-center rounded-2xl ${compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} focus-visible:ring-4! focus-visible:ring-inset focus-visible:ring-bd-lav-deep focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none!`}
    >
      {acceptLabel}
    </button>
  )
  const failed = state === 'failed' && (
    <p role="alert" className={`${compact ? 'mt-1' : 'mt-2'} text-xs font-semibold text-bd-danger-text`}>
      {t('chat.termsFailed')}
    </p>
  )

  if (compact) {
    return (
      <div role="group" aria-labelledby={promptId} tabIndex={-1} className={`terms-consent focus:outline-hidden ${className}`} style={style}>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p id={promptId} className="text-xs leading-snug text-bd-ink">{prompt}</p>
            <div className="flex flex-wrap gap-x-3 text-[11px] leading-snug font-semibold">{links}</div>
          </div>
          {button}
        </div>
        {failed}
      </div>
    )
  }

  return (
    <div role="group" aria-labelledby={promptId} tabIndex={-1} className={`terms-consent focus:outline-hidden ${className}`} style={style}>
      <p id={promptId} className="text-sm leading-snug text-bd-ink">{prompt}</p>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold">{links}</div>
        {button}
      </div>
      {failed}
    </div>
  )
}
