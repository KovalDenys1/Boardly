'use client'

import { Suspense, useState } from 'react'
import { useSession } from 'next-auth/react'
import Footer from '@/components/Footer'
import LoadingSkeleton from '@/components/LoadingSkeleton'
import LobbyFilters from '@/components/LobbyFilters'
import LobbyCard from '@/components/LobbyCard'
import { AuthGateModal } from '@/components/AuthGateModal'
import { useGuest } from '@/contexts/GuestContext'
import i18n from '@/i18n'
import { useLobbyList } from './use-lobby-list'

function LobbyListPageContent() {
  const {
    t,
    ready,
    router,
    lobbies,
    stats,
    loading,
    hasLoadError,
    hasActiveFilters,
    filters,
    setFilters,
    handleRefresh,
    clearAllFilters,
    isManualRefreshing,
    isAutoRefreshing,
    isRefreshUpdated,
    isRefreshLocked,
  } = useLobbyList()

  const { status } = useSession()
  const { isGuest } = useGuest()
  const isAuthenticated = status === 'authenticated' || isGuest
  const [authGateDest, setAuthGateDest] = useState<string | null>(null)

  const handleCreateLobby = () => {
    if (!isAuthenticated) {
      setAuthGateDest('/lobby/create')
      return
    }
    router.push('/lobby/create')
  }

  if (!ready || !i18n.isInitialized) return <LoadingSkeleton />

  return (
    <>
    {authGateDest && (
      <AuthGateModal dest={authGateDest} onClose={() => setAuthGateDest(null)} />
    )}
    <div className="bd-page bd-screen flex min-h-[calc(100dvh-64px)] flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[1280px] grow px-8 pb-10 pt-10">

        {/* Page header */}
        <div
          className="bd-card relative mb-6 overflow-hidden p-7 sm:p-8"
          style={{ background: 'linear-gradient(120deg, white 0%, rgba(155,140,255,0.08) 100%)' }}
        >
          <div className="bd-dot-grid absolute inset-0 opacity-35" />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-stretch">

            {/* Left: nav + title + stats */}
            <div className="flex flex-1 flex-col">
              <div className="mb-5">
                <button
                  type="button"
                  onClick={() => router.push('/games')}
                  className="bd-btn bd-btn-soft px-3.5 py-2 text-sm"
                >
                  ← {t('lobby.backToGames')}
                </button>
              </div>
              <span className="bd-kicker mb-2 block">Lobbies</span>
              <h1
                className="mb-2 text-[clamp(32px,4vw,52px)] font-extrabold leading-none tracking-tight text-bd-ink"
                style={{ fontFamily: 'var(--bd-font-display)' }}
              >
                {t('lobby.title')}
              </h1>
              <p className="text-[15px] text-bd-ink-soft">
                {t('lobby.subtitle')}
              </p>
              <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-bd-line pt-4">
                <span className="bd-chip">
                  <span className="bd-live-dot h-1.5 w-1.5" />
                  {t('lobby.lobbiesCount', { count: lobbies.length })}
                </span>
                <span className="bd-chip">⏳ {stats.waitingLobbies} {t('lobby.status.waiting')}</span>
                <span className="bd-chip bd-chip-mint">🎲 {stats.playingLobbies} {t('lobby.status.playing')}</span>
                <span className="bd-chip">👥 {stats.totalPlayers} {t('lobby.stats.players')}</span>
              </div>
            </div>

            {/* Right: full-height create button */}
            <button
              type="button"
              onClick={handleCreateLobby}
              className="flex min-h-[80px] w-full shrink-0 flex-row items-center justify-center gap-3 rounded-3xl border-2 border-bd-ink bg-bd-coral text-white shadow-[4px_4px_0_var(--bd-ink)] transition-all hover:-translate-y-0.5 hover:shadow-[4px_6px_0_var(--bd-ink)] active:translate-y-0.5 active:shadow-[4px_2px_0_var(--bd-ink)] sm:w-[220px] sm:flex-col sm:min-h-0"
            >
              <span className="text-4xl">✨</span>
              <span
                className="text-center text-[18px] font-extrabold leading-tight"
                style={{ fontFamily: 'var(--bd-font-display)' }}
              >
                {t('lobby.createNew')}
              </span>
              <span className="text-sm font-bold opacity-80">{t('lobby.getStarted')} →</span>
            </button>

          </div>
        </div>

        {/* Lobbies list */}
        <div className="bd-card p-6">
          <div className="mb-5 border-b border-bd-line pb-5">
            <LobbyFilters embedded filters={filters} onFiltersChange={setFilters} />
          </div>

          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2
                className="text-[22px] font-bold text-bd-ink"
                style={{ fontFamily: 'var(--bd-font-display)' }}
              >
                {t('lobby.activeLobbies')}
              </h2>
              <p className="mt-0.5 text-[13px] text-bd-ink-muted">
                {t('lobby.lobbiesCount', { count: lobbies.length })}
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshLocked}
              className={`bd-btn bd-btn-soft px-4 py-2.5 text-[13px] ${
                isRefreshUpdated ? 'border-[rgba(79,201,166,0.4)] bg-[rgba(79,201,166,0.15)] text-bd-mint-deep' : ''
              }`}
              title={t('lobby.refresh')}
            >
              <span
                className="inline-block transition-transform duration-300"
                style={{ transform: isManualRefreshing || isAutoRefreshing ? 'rotate(360deg)' : 'none' }}
              >
                {isRefreshUpdated ? '✓' : '↻'}
              </span>
              {isManualRefreshing ? t('lobby.refreshing') : isRefreshUpdated ? t('lobby.updated') : t('lobby.refresh')}
              <span className="sr-only" aria-live="polite">
                {isAutoRefreshing ? t('lobby.refreshing') : isRefreshUpdated ? t('lobby.updated') : ''}
              </span>
            </button>
          </div>

          {hasLoadError && (
            <div className="mb-4 rounded-xl border-[1.5px] border-[rgba(255,196,77,0.3)] bg-[rgba(255,196,77,0.12)] px-4 py-3 text-sm text-bd-sun-deep">
              {t('lobby.loadFailed')}
            </div>
          )}

          {loading ? (
            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="h-[120px] animate-pulse rounded-[18px] border-[1.5px] border-bd-line bg-bd-bg2"
                />
              ))}
            </div>
          ) : lobbies.length === 0 ? (
            <div className="px-8 py-[60px] text-center">
              <div className="mb-4 text-[56px]">🎲</div>
              <h3
                className="mb-2 text-2xl font-bold text-bd-ink"
                style={{ fontFamily: 'var(--bd-font-display)' }}
              >
                {hasActiveFilters ? t('lobby.noFilterMatches') : t('lobby.noLobbies')}
              </h3>
              <p className="mx-auto mb-6 max-w-[400px] text-[15px] text-bd-ink-muted">
                {hasActiveFilters ? t('lobby.noFilterMatchesDescription') : t('lobby.noLobbiesDescription')}
              </p>
              <button
                onClick={hasActiveFilters ? clearAllFilters : handleCreateLobby}
                className="bd-btn bd-btn-coral bd-btn-lg"
              >
                {hasActiveFilters ? t('lobby.filters.clearAll') : t('lobby.createFirst')}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {lobbies.map((lobby, index) => (
                <LobbyCard
                  key={lobby.id}
                  lobby={lobby}
                  index={index}
                  onOpenLobby={(code) => router.push(`/lobby/${code}`)}
                  onWatchLobby={(code) => router.push(`/lobby/${code}/spectate`)}
                />
              ))}
            </div>
          )}
        </div>

      </div>
      <Footer />
    </div>
    </>
  )
}

export default function LobbyListPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <LobbyListPageContent />
    </Suspense>
  )
}
