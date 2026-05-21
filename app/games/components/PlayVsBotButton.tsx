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

  return (
    <div className={`relative ${className}`} style={{ minHeight: 58 }}>
      {/* Original button — fades out when open */}
      <button
        onClick={() => setOpen(true)}
        className={`bd-btn bd-btn-soft bd-btn-lg w-full justify-center absolute inset-0 transition-opacity duration-200 ${
          open ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        🤖 {t('quickPlay.playVsBot')}
      </button>

      {/* Difficulty picker — fades in when open */}
      <div
        className={`absolute inset-0 flex items-center gap-1.5 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {(['easy', 'medium', 'hard'] as Difficulty[]).map((diff) => (
          <button
            key={diff}
            onClick={() => handleDifficulty(diff)}
            disabled={loading}
            className="flex-1 rounded-2xl border-2 border-bd-ink py-3 text-sm font-bold text-bd-ink transition-colors hover:bg-bd-ink hover:text-bd-bg disabled:opacity-50"
            style={{ background: 'var(--bd-bg2)' }}
          >
            {loading ? '…' : t(DIFFICULTY_KEYS[diff])}
          </button>
        ))}
        {!loading && (
          <button
            onClick={() => setOpen(false)}
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full border-2 border-bd-line text-base text-bd-ink-muted transition-colors hover:border-bd-ink hover:text-bd-ink"
            style={{ background: 'var(--bd-bg2)' }}
            aria-label="Cancel"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}
