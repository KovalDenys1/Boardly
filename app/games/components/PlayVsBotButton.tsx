'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useTranslation, type TranslationKeys } from '@/lib/i18n-helpers'
import { Icon, type IconName } from '@/components/icons'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { showToast } from '@/lib/i18n-toast'
import { AuthGateModal } from '@/components/AuthGateModal'

type Difficulty = 'easy' | 'medium' | 'hard'

const DIFFICULTIES: { id: Difficulty; icon: IconName; labelKey: TranslationKeys }[] = [
  { id: 'easy', icon: 'bot-easy' as const, labelKey: 'lobby.create.difficultyEasy' },
  { id: 'medium', icon: 'bot-medium' as const, labelKey: 'lobby.create.difficultyMedium' },
  { id: 'hard', icon: 'bot-hard' as const, labelKey: 'lobby.create.difficultyHard' },
]

interface PlayVsBotButtonProps {
  gameType: string
  className?: string
}

export default function PlayVsBotButton({ gameType, className = '' }: PlayVsBotButtonProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const { status } = useSession()
  const { isGuest } = useGuest()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [pendingDifficulty, setPendingDifficulty] = useState<Difficulty | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const startQuickPlay = async (difficulty: Difficulty) => {
    setLoading(true)
    try {
      const res = await fetchWithGuest('/api/quick-play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType, difficulty, forceSolo: true }),
      })
      const data = await res.json() as { lobbyCode?: string; error?: string }
      if (res.status === 401) {
        // No client-side check can predict this one: a guest token expires or
        // is rejected while `isGuest` is still true locally. The answer is the
        // same as for a fresh visitor — offer the gate, never a raw
        // "Unauthorized" toast, which tells a player nothing they can act on.
        setLoading(false)
        setPendingDifficulty(difficulty)
        return
      }
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

  const handleDifficulty = async (difficulty: Difficulty) => {
    // `!== 'authenticated'`, not `=== 'unauthenticated'`. NextAuth reports
    // `loading` for the first moments after mount, and a click inside that
    // window used to slip past this check and POST with no credentials — the
    // server answered 401 and the player got "An error occurred: Unauthorized"
    // on a page whose whole promise is that you can play without an account.
    // Erring towards the gate costs a signed-in player one dismissible modal
    // in a race they will rarely win; erring the other way costs a new visitor
    // the game.
    if (status !== 'authenticated' && !isGuest) {
      // Let a fresh visitor pick a guest name right here instead of bouncing
      // them to /auth/login — Play vs Bot is meant to work without an account.
      setPendingDifficulty(difficulty)
      return
    }

    await startQuickPlay(difficulty)
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        onClick={() => setOpen((value) => !value)}
        disabled={loading}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`bd-btn bd-btn-soft bd-btn-lg w-full justify-center disabled:opacity-60 ${
          open ? 'bg-bd-bg2' : ''
        }`}
      >
        <Icon name="robot" size={16} /> {loading ? '…' : t('quickPlay.playVsBot')}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 right-0 top-full z-30 mt-2 min-w-44 overflow-hidden rounded-2xl border-2 border-bd-ink bg-bd-bg shadow-[0_6px_0_0_rgba(31,27,22,0.85)]"
        >
          {DIFFICULTIES.map(({ id, icon, labelKey }) => (
            <button
              key={id}
              role="menuitem"
              disabled={loading}
              onClick={() => {
                setOpen(false)
                void handleDifficulty(id)
              }}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] font-bold text-bd-ink transition-colors hover:bg-bd-bg2 disabled:opacity-50"
            >
              <Icon name={icon} size={18} />
              {t(labelKey)}
            </button>
          ))}
        </div>
      )}
      {pendingDifficulty && (
        <AuthGateModal
          dest={pathname}
          onClose={() => { setPendingDifficulty(null); setOpen(false) }}
          onGuestReady={() => {
            const difficulty = pendingDifficulty
            setPendingDifficulty(null)
            void startQuickPlay(difficulty)
          }}
        />
      )}
    </div>
  )
}
