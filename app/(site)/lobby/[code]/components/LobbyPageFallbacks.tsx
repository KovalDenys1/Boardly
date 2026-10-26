'use client'

import { useLayoutEffect, useRef } from 'react'
import LoadingSpinner from '@/components/LoadingSpinner'
import { useTranslation } from '@/lib/i18n-helpers'

const serverSpinStart =
  typeof document === 'undefined'
    ? null
    : document.querySelector('[data-lobby-loader] .animate-spin')?.getAnimations?.()[0]?.startTime
const spinStart = typeof serverSpinStart === 'number' ? serverSpinStart : 0

export function LobbyPageLoadingFallback() {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    // Each load stage mounts a new spinner, and a server-rendered one starts at HTML parse; one start time keeps every swap invisible.
    ref.current?.getAnimations?.({ subtree: true }).forEach((animation) => {
      animation.startTime = spinStart
    })
  }, [])

  return (
    <div ref={ref} data-lobby-loader="" className="bd-page flex h-(--game-h) items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  )
}

export function LobbyPageErrorFallback() {
  const { t } = useTranslation()

  return (
    <div className="bd-page flex h-(--game-h) items-center justify-center px-4">
      <div className="bd-card w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-5 inline-flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-bd-ink bg-bd-coral/20">
          <span className="text-3xl">!</span>
        </div>
        <h1
          className="mb-3 text-2xl font-extrabold text-bd-ink"
          style={{ fontFamily: 'var(--bd-font-display)' }}
        >
          {t('games.tictactoe.game.errorTitle')}
        </h1>
        <p className="mb-6 text-sm text-bd-ink-soft">
          {t('games.tictactoe.game.errorDescription')}
        </p>
        <button
          onClick={() => {
            window.location.href = '/games'
          }}
          className="bd-btn bd-btn-primary mx-auto"
        >
          {t('games.tictactoe.game.backToLobbies')}
        </button>
      </div>
    </div>
  )
}
