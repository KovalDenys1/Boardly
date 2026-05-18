'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useTranslation, type TranslationKeys } from '@/lib/i18n-helpers'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { showToast } from '@/lib/i18n-toast'

type Difficulty = 'easy' | 'medium' | 'hard'

const DIFFICULTY_KEYS: Record<Difficulty, TranslationKeys> = {
  easy: 'lobby.create.difficultyEasy',
  medium: 'lobby.create.difficultyMedium',
  hard: 'lobby.create.difficultyHard',
}

interface PlayVsBotButtonProps {
  gameType: string
  className?: string
}

export default function PlayVsBotButton({ gameType, className = '' }: PlayVsBotButtonProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const { status } = useSession()
  const { isGuest } = useGuest()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleDifficulty = async (difficulty: Difficulty) => {
    if (status === 'unauthenticated' && !isGuest) {
      showToast.error('quickPlay.signInToPlay')
      router.push('/auth/login')
      return
    }

    setLoading(true)
    try {
      const res = await fetchWithGuest('/api/quick-play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType, difficulty, forceSolo: true }),
      })
      const data = await res.json() as { lobbyCode?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      router.push(`/lobby/${data.lobbyCode}`)
    } catch (err) {
      showToast.error('errors.general', undefined, {
        message: err instanceof Error ? err.message : 'Something went wrong',
      })
      setLoading(false)
      setOpen(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`bd-btn bd-btn-soft bd-btn-lg justify-center ${className}`}
      >
        🤖 {t('quickPlay.playVsBot')}
      </button>
    )
  }

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <span className="text-sm font-semibold text-bd-ink-muted">
        {t('quickPlay.selectDifficulty')}
      </span>
      <div className="flex gap-2">
        {(['easy', 'medium', 'hard'] as Difficulty[]).map((diff) => (
          <button
            key={diff}
            onClick={() => handleDifficulty(diff)}
            disabled={loading}
            className="bd-btn bd-btn-soft disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? t('quickPlay.starting') : t(DIFFICULTY_KEYS[diff])}
          </button>
        ))}
      </div>
      {!loading && (
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-bd-ink-muted underline"
        >
          {t('common.cancel')}
        </button>
      )}
    </div>
  )
}
