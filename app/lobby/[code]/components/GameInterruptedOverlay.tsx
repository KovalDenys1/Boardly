'use client'

import { useEffect, useState } from 'react'
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

  useEffect(() => {
    if (seconds <= 0) {
      onRedirect()
      return
    }
    const id = setTimeout(() => setSeconds(s => s - 1), 1000)
    return () => clearTimeout(id)
  }, [seconds, onRedirect])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="w-full max-w-xs rounded-3xl p-7 text-center shadow-2xl"
        style={{ background: 'var(--bd-bg)', border: '1.5px solid var(--bd-line)' }}
      >
        <div className="mb-3 text-5xl">🚪</div>

        <h2 className="mb-2 text-lg font-bold text-bd-ink">
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
          className="bd-btn bd-btn-primary w-full !rounded-2xl !py-3 font-semibold"
        >
          {t('lobby.gameInterrupted.returnNow')}
        </button>
      </div>
    </div>
  )
}
