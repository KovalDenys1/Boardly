'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n-helpers'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { showToast } from '@/lib/i18n-toast'

const BOT_SUPPORTED_GAMES = [
  { type: 'yahtzee', emoji: '🎲', label: 'Yahtzee', players: '1–4' },
  { type: 'tic_tac_toe', emoji: '❌', label: 'Tic Tac Toe', players: '2' },
  { type: 'rock_paper_scissors', emoji: '🍂', label: 'Rock Paper Scissors', players: '2' },
] as const

type GameType = (typeof BOT_SUPPORTED_GAMES)[number]['type']

interface QuickPlayButtonProps {
  className?: string
}

export default function QuickPlayButton({ className }: QuickPlayButtonProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const { isGuest } = useGuest()
  const [showPicker, setShowPicker] = useState(false)
  const [selectedGame, setSelectedGame] = useState<GameType | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  const handleGameSelect = async (gameType: GameType) => {
    setSelectedGame(gameType)
    setIsSearching(true)

    try {
      const res = await fetchWithGuest('/api/quick-play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error || 'Quick play failed')
      }

      const { lobbyCode, isNew } = data as { lobbyCode: string; isNew: boolean }

      if (isNew) {
        showToast.success('quickPlay.createdLobby', undefined, undefined, { id: 'quick-play' })
      } else {
        showToast.success('quickPlay.joinedLobby', undefined, undefined, { id: 'quick-play' })
      }

      router.push(`/lobby/${lobbyCode}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      showToast.error('errors.general', undefined, { message: msg })
      setIsSearching(false)
      setSelectedGame(null)
    }
  }

  return (
    <>
      <button
        onClick={() => setShowPicker(true)}
        className={
          className ??
          'w-full bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-2xl hover:scale-105 hover:shadow-3xl transition-all duration-300 flex items-center justify-center gap-3'
        }
      >
        <span className="text-2xl">⚡</span>
        <span>{t('home.quickPlay', 'Quick Play')}</span>
      </button>

      {showPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (!isSearching && e.target === e.currentTarget) setShowPicker(false)
          }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-white/20 bg-white p-6 shadow-2xl dark:bg-slate-900">
            {isSearching ? (
              <div className="py-6 text-center">
                <p className="text-4xl mb-4 animate-bounce">⚡</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">
                  {t('quickPlay.finding', 'Finding a game…')}
                </p>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  {t('quickPlay.searching', 'Searching for open lobbies or creating one with bots')}
                </p>
              </div>
            ) : (
              <>
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    ⚡ {t('home.quickPlay', 'Quick Play')}
                  </h2>
                  <button
                    onClick={() => setShowPicker(false)}
                    className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  >
                    ✕
                  </button>
                </div>
                <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
                  {t('quickPlay.pickGame', 'Pick a game — we\'ll find or create a match instantly.')}
                </p>
                <div className="space-y-2">
                  {BOT_SUPPORTED_GAMES.map((game) => (
                    <button
                      key={game.type}
                      onClick={() => handleGameSelect(game.type)}
                      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:hover:border-blue-600 dark:hover:bg-blue-900/20"
                    >
                      <span className="text-3xl">{game.emoji}</span>
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{game.label}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {game.players} players
                        </p>
                      </div>
                      <svg
                        className="ml-auto h-4 w-4 shrink-0 text-slate-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
