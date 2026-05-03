'use client'

import LoadingSpinner from '@/components/LoadingSpinner'
import { useTranslation } from '@/lib/i18n-helpers'

export function LobbyPageLoadingFallback() {
  return (
    <div className="bd-page flex min-h-[calc(100dvh-64px)] items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  )
}

export function LobbyPageErrorFallback() {
  const { t } = useTranslation()

  return (
    <div className="bd-page flex min-h-[calc(100dvh-64px)] items-center justify-center px-4">
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
