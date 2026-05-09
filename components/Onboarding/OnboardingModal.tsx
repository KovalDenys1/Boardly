'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useOnboarding } from '@/contexts/OnboardingContext'
import { useTranslation } from '@/lib/i18n-helpers'
import { showToast } from '@/lib/i18n-toast'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { getPublicRegisteredGameTypes, getGameLobbiesRoute } from '@/lib/public-game-access'
import { getGameMetadata, hasBotSupport } from '@/lib/game-catalog'

export function OnboardingModal() {
  const router = useRouter()
  const { t } = useTranslation()
  const { showModal, completeOnboarding, skipOnboarding } = useOnboarding()
  const [selectedGame, setSelectedGame] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const games = useMemo(
    () => getPublicRegisteredGameTypes().map((type) => ({ type, meta: getGameMetadata(type)! })),
    []
  )

  if (!showModal) return null

  const handleStart = async () => {
    if (!selectedGame || loading) return
    setLoading(true)
    try {
      if (hasBotSupport(selectedGame)) {
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
      } else {
        const route = getGameLobbiesRoute(selectedGame)
        await completeOnboarding()
        router.push(route ?? '/games')
      }
    } catch {
      showToast.error('common.error')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:p-4">
      <div className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 shadow-2xl px-5 pt-6 pb-8 sm:px-7 sm:py-8 max-h-[92dvh] overflow-y-auto">

        {/* Drag handle — mobile only */}
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-[var(--bd-line)] dark:bg-slate-700 sm:hidden" />

        {/* Header */}
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl text-3xl"
            style={{ background: 'rgba(155,140,255,0.12)' }}>
            🎲
          </div>
          <h2
            className="text-[20px] font-extrabold text-bd-ink dark:text-white"
            style={{ fontFamily: 'var(--bd-font-display)' }}
          >
            {t('onboarding.title')}
          </h2>
          <p className="mt-1 text-[13px] text-bd-ink-muted dark:text-slate-400">
            {t('onboarding.subtitle')}
          </p>
        </div>

        {/* Game grid */}
        <div className="mb-5 grid grid-cols-2 gap-2">
          {games.map(({ type, meta }) => (
            <button
              key={type}
              onClick={() => setSelectedGame(type)}
              className={`flex flex-col items-center gap-2 rounded-2xl border-[1.5px] px-3 py-4 text-center transition-all ${
                selectedGame === type
                  ? 'border-[var(--bd-lav)] bg-[rgba(155,140,255,0.08)] dark:bg-[rgba(155,140,255,0.12)]'
                  : 'border-[var(--bd-line)] bg-white dark:bg-slate-800/60 dark:border-slate-700 hover:border-[var(--bd-lav-mid)] dark:hover:border-slate-500'
              }`}
            >
              <span className="text-3xl leading-none">{meta.icon}</span>
              <span className="text-[13px] font-semibold leading-tight text-bd-ink dark:text-white">{meta.name}</span>
            </button>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={handleStart}
          disabled={!selectedGame || loading}
          className="w-full rounded-2xl py-3.5 text-[15px] font-bold text-white transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'var(--bd-lav)' }}
        >
          {loading ? t('onboarding.starting') : t('onboarding.startPlaying')}
        </button>

        <button
          onClick={skipOnboarding}
          className="mt-4 w-full text-center text-[13px] text-bd-ink-muted hover:text-bd-ink-soft dark:text-slate-400 dark:hover:text-slate-300 transition-colors"
        >
          {t('onboarding.skip')}
        </button>
      </div>
    </div>
  )
}
