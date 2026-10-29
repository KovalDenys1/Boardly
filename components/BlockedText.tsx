'use client'

import { useState, type ReactNode } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { useBlockedPlayers } from '@/hooks/useBlockedPlayers'

interface BlockedTextProps {
  /** The author is on the viewer's block list. */
  blocked: boolean
  /** Who wrote it. Until the viewer's block list is known, anyone else's text folds too. */
  from: string | null | undefined
  /** A hover title for the text, given only while the text shows. */
  title?: string
  children: ReactNode
  className?: string
}

/** Text a player typed inside a game: from a blocked player it folds to one line and a Show button, so the round stays playable. */
export default function BlockedText({ blocked, from, title, children, className = '' }: BlockedTextProps) {
  const { t } = useTranslation()
  const { ready, unknown, accountId } = useBlockedPlayers({ load: false })
  const [shown, setShown] = useState(false)

  const listUnknown = !ready || unknown
  const folded = blocked || (listUnknown && !!from && from !== accountId)

  if (!folded) return title ? <span title={title}>{children}</span> : <>{children}</>
  if (shown) return <span className="blocked-text-reveal" title={title}>{children}</span>

  return (
    <span
      data-blocked-text
      className={`inline-flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs font-semibold italic text-bd-ink-muted ${className}`}
    >
      <span>{t('blockedPlayers.hiddenText')}</span>
      <button
        type="button"
        onClick={() => setShown(true)}
        className="rounded-md not-italic text-bd-ink-soft underline underline-offset-2 transition-colors hover:text-bd-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav-deep focus-visible:outline-hidden"
      >
        {t('blockedPlayers.show')}
      </button>
    </span>
  )
}
