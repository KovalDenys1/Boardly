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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 shadow-2xl px-7 py-8">

        {/* Header */}
        <div className="mb-7 text-center">
          <div className="mb-3 text-5xl">🎲</div>
          <h2
            className="text-[22px] font-extrabold text-bd-ink dark:text-white"
            style={{ fontFamily: 'var(--bd-font-display)' }}
          >
            {t('onboarding.title')}
          </h2>
          <p className="mt-1.5 text-[13px] text-bd-ink-muted dark:text-slate-400">
            {t('onboarding.subtitle')}
          </p>
        </div>

        {/* Game list */}
        <div className="mb-6 flex flex-col gap-2.5">
          {games.map(({ type, meta }) => (
            <button
              key={type}
              onClick={() => setSelectedGame(type)}
              className={`flex items-center gap-3 rounded-2xl border-[1.5px] px-4 py-3.5 text-left transition-all ${
                selectedGame === type
                  ? 'border-[var(--bd-lav)] bg-[rgba(155,140,255,0.08)]'
                  : 'border-[var(--bd-line)] bg-white dark:bg-slate-800/60 dark:border-slate-700 hover:border-[var(--bd-lav-mid)] dark:hover:border-slate-500'
              }`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--bd-bg2)] dark:bg-slate-700 text-2xl">
                {meta.icon}
              </span>
              <span className="text-[15px] font-semibold text-bd-ink dark:text-white">{meta.name}</span>
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
