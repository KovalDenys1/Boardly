'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useOnboarding } from '@/contexts/OnboardingContext'
import { showToast } from '@/lib/i18n-toast'
import { fetchWithGuest } from '@/lib/fetch-with-guest'

const BOT_GAMES = [
  { type: 'yahtzee', label: 'Yahtzee', icon: '🎲' },
  { type: 'tic_tac_toe', label: 'Tic Tac Toe', icon: '❌⭕' },
  { type: 'rock_paper_scissors', label: 'Rock Paper Scissors', icon: '✊✋✌️' },
] as const

type GameType = typeof BOT_GAMES[number]['type']

export function OnboardingModal() {
  const router = useRouter()
  const { showModal, completeOnboarding, skipOnboarding } = useOnboarding()
  const [step, setStep] = useState<1 | 2>(1)
  const [selectedGame, setSelectedGame] = useState<GameType | null>(null)
  const [loading, setLoading] = useState(false)

  if (!showModal) return null

  const handleQuickStart = async () => {
    if (!selectedGame || loading) return
    setLoading(true)
    try {
      const lobbyRes = await fetchWithGuest('/api/lobby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: selectedGame, maxPlayers: 2 }),
      })
      if (!lobbyRes.ok) throw new Error('Failed to create lobby')
      const { lobby } = await lobbyRes.json() as { lobby: { code: string } }

      const botRes = await fetchWithGuest(`/api/lobby/${lobby.code}/add-bot`, { method: 'POST' })
      if (!botRes.ok) throw new Error('Failed to add bot')

      await completeOnboarding()
      router.push(`/lobby/${lobby.code}`)
    } catch {
      showToast.error('common.error')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 shadow-2xl p-6">
        {step === 1 ? (
          <>
            <div className="text-center mb-6">
              <span className="text-5xl">🎲</span>
              <h2 className="mt-3 text-2xl font-extrabold text-slate-900 dark:text-white">
                Welcome to Boardly!
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                How would you like to start?
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => setStep(2)}
                className="w-full flex items-center gap-4 rounded-2xl border-2 border-blue-500 bg-blue-50 dark:bg-blue-500/10 px-5 py-4 text-left hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
              >
                <span className="text-3xl">🚀</span>
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">Quick Start</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Get into a game in 2 clicks</p>
                </div>
              </button>

              <button
                disabled
                className="w-full flex items-center gap-4 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-5 py-4 text-left opacity-50 cursor-not-allowed"
              >
                <span className="text-3xl">🗺</span>
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">Show me around</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Guided tour — coming soon</p>
                </div>
              </button>
            </div>

            <button
              onClick={skipOnboarding}
              className="mt-4 w-full text-center text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              Skip for now
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-6">
              <button
                onClick={() => setStep(1)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xl transition-colors"
                aria-label="Back"
              >
                ←
              </button>
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
                Choose a game
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-3 mb-6">
              {BOT_GAMES.map((game) => (
                <button
                  key={game.type}
                  onClick={() => setSelectedGame(game.type)}
                  className={`flex items-center gap-4 rounded-2xl border-2 px-5 py-4 text-left transition-colors ${
                    selectedGame === game.type
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                      : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500/50'
                  }`}
                >
                  <span className="text-3xl">{game.icon}</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{game.label}</span>
                </button>
              ))}
            </div>

            <button
              onClick={handleQuickStart}
              disabled={!selectedGame || loading}
              className="w-full rounded-2xl bg-blue-600 px-6 py-3 font-bold text-white shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Starting...' : 'Start playing →'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
