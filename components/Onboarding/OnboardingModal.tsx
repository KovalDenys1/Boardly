'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useOnboarding } from '@/contexts/OnboardingContext'
import { useTour } from '@/contexts/TourContext'
import { useTranslation } from '@/lib/i18n-helpers'
import { showToast } from '@/lib/i18n-toast'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { getPublicRegisteredGameTypes } from '@/lib/public-game-access'
import { getGameMetadata, hasBotSupport } from '@/lib/game-catalog'

type Flow = 'choose' | 'quick-start'

export function OnboardingModal() {
  const router = useRouter()
  const { t } = useTranslation()
  const { showModal, completeOnboarding, skipOnboarding } = useOnboarding()
  const { isActive: tourActive, startTour } = useTour()
  const [flow, setFlow] = useState<Flow>('choose')
  const [selectedGame, setSelectedGame] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const botGames = useMemo(
    () =>
      getPublicRegisteredGameTypes()
        .filter(hasBotSupport)
        .map((type) => ({ type, meta: getGameMetadata(type)! })),
    []
  )

  if (!showModal || tourActive) return null

  const handleStartTour = () => {
    skipOnboarding()
    startTour()
  }

  const handleStart = async () => {
    if (!selectedGame || loading) return
    setLoading(true)
    try {
      const lobbyRes = await fetchWithGuest('/api/lobby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: selectedGame, maxPlayers: 2 }),
      })
      if (!lobbyRes.ok) throw new Error('Failed to create lobby')
      const { lobby } = (await lobbyRes.json()) as { lobby: { code: string } }

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
        <div className="text-center mb-6">
          <span className="text-5xl">🎲</span>
          <h2 className="mt-3 text-2xl font-extrabold text-slate-900 dark:text-white">
            {t('onboarding.title')}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t('onboarding.subtitle')}
          </p>
        </div>

        {flow === 'choose' ? (
          <>
            <div className="grid grid-cols-1 gap-3 mb-4">
              <button
                onClick={handleStartTour}
                className="flex items-center gap-4 rounded-2xl border-2 border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-500/10 px-5 py-4 text-left transition-colors hover:border-indigo-400 dark:hover:border-indigo-500"
              >
                <span className="text-3xl">🗺️</span>
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">{t('onboarding.showMeAround')}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('onboarding.showMeAroundDesc')}</p>
                </div>
              </button>

              <button
                onClick={() => setFlow('quick-start')}
                className="flex items-center gap-4 rounded-2xl border-2 border-slate-200 dark:border-slate-700 px-5 py-4 text-left transition-colors hover:border-blue-300 dark:hover:border-blue-500/50"
              >
                <span className="text-3xl">⚡</span>
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">{t('onboarding.quickStart')}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('onboarding.quickStartDesc')}</p>
                </div>
              </button>
            </div>

            <button
              onClick={skipOnboarding}
              className="mt-2 w-full text-center text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              {t('onboarding.skip')}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setFlow('choose')}
              className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              <span>←</span> {t('common.back')}
            </button>

            <div className="grid grid-cols-1 gap-3 mb-6">
              {botGames.map(({ type, meta }) => (
                <button
                  key={type}
                  onClick={() => setSelectedGame(type)}
                  className={`flex items-center gap-4 rounded-2xl border-2 px-5 py-4 text-left transition-colors ${
                    selectedGame === type
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                      : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500/50'
                  }`}
                >
                  <span className="text-3xl">{meta.icon}</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{meta.name}</span>
                </button>
              ))}
            </div>

            <button
              onClick={handleStart}
              disabled={!selectedGame || loading}
              className="w-full rounded-2xl bg-blue-600 px-6 py-3 font-bold text-white shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t('onboarding.starting') : t('onboarding.startPlaying')}
            </button>

            <button
              onClick={skipOnboarding}
              className="mt-4 w-full text-center text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              {t('onboarding.skip')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
