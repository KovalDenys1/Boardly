'use client'

import { useEffect, useId, useState } from 'react'
import LeaveIcon from '@/components/LeaveIcon'
import Modal, { ModalCloseButton } from '@/components/Modal'
import { useTranslation } from '@/lib/i18n-helpers'

interface GameInterruptedOverlayProps {
  playerName?: string
  reason: 'player_left' | 'abandoned'
  onRedirect: () => void
}

const COUNTDOWN = 5

export default function GameInterruptedOverlay({ playerName, reason, onRedirect }: GameInterruptedOverlayProps) {
  const { t } = useTranslation()
  const [seconds, setSeconds] = useState(COUNTDOWN)
  const titleId = useId()

  useEffect(() => {
    if (seconds <= 0) {
      onRedirect()
      return
    }
    const id = setTimeout(() => setSeconds(s => s - 1), 1000)
    return () => clearTimeout(id)
  }, [seconds, onRedirect])

  return (
    <Modal
      isOpen
      onClose={onRedirect}
      aria-labelledby={titleId}
      initialFocus="dialog"
      maxWidth="sm"
      bodyPadding="none"
      panelClassName="rounded-3xl border-[1.5px] border-bd-line bg-bd-bg shadow-2xl"
    >
      <div className="relative p-7 text-center">
        <ModalCloseButton onClick={onRedirect} className="absolute right-2 top-2" />
        <div className="mb-3 flex justify-center" style={{ color: 'var(--bd-ink-soft)' }}><LeaveIcon size={48} /></div>

        <h2 id={titleId} className="mb-2 text-lg font-bold text-bd-ink">
          {t('lobby.gameAbandoned')}
        </h2>

        {playerName && reason === 'player_left' && (
          <p className="mb-4 text-sm text-bd-ink-soft">
            {t('toast.playerLeft', { player: playerName })}
          </p>
        )}

        <p className="mb-5 text-sm text-bd-ink-muted">
          {t('lobby.gameInterrupted.returning', { seconds })}
        </p>

        <button
          onClick={onRedirect}
          className="bd-btn bd-btn-primary w-full rounded-2xl! py-3! font-semibold"
        >
          {t('lobby.gameInterrupted.returnNow')}
        </button>
      </div>
    </Modal>
  )
}
