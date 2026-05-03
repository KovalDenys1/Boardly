'use client'

import { Suspense } from 'react'
import LoadingSkeleton from '@/components/LoadingSkeleton'
import LobbyFilters from '@/components/LobbyFilters'
import LobbyStats from '@/components/LobbyStats'
import LobbyCard from '@/components/LobbyCard'
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

  if (!ready || !i18n.isInitialized) return <LoadingSkeleton />

  return (
    <div className="bd-page bd-screen flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[1280px] px-8 pb-20 pt-10">

        {/* Page header */}
        <div
          className="bd-card relative mb-6 overflow-hidden p-7 sm:p-8"
          style={{ background: 'linear-gradient(120deg, white 0%, rgba(155,140,255,0.08) 100%)' }}
        >
          <div className="bd-dot-grid absolute inset-0 opacity-35" />
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div className="min-w-[280px] flex-1">
              <button
                type="button"
                onClick={() => router.push('/games')}
                className="bd-btn bd-btn-soft mb-4 px-3.5 py-2 text-sm"
              >
                ← {t('lobby.backToGames')}
              </button>
              <span className="bd-kicker mb-2 block">Lobbies</span>
              <h1
                className="mb-2 text-[clamp(32px,4vw,52px)] font-extrabold leading-none tracking-tight text-bd-ink"
                style={{ fontFamily: 'var(--bd-font-display)' }}
              >
                {t('lobby.title')}
              </h1>
              <p className="max-w-[480px] text-[15px] text-bd-ink-soft">
                {t('lobby.subtitle')}
              </p>
              <div className="mt-3">
                <span className="bd-chip">
                  <span className="bd-live-dot h-1.5 w-1.5" />
                  {t('lobby.lobbiesCount', { count: lobbies.length })}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => router.push('/lobby/create')}
              className="flex min-w-[280px] cursor-pointer flex-col gap-2 rounded-3xl border-[3px] border-bd-ink bg-bd-coral p-6 text-left text-white shadow-[6px_6px_0_var(--bd-ink)] transition-all hover:-translate-y-0.5 hover:shadow-[6px_8px_0_var(--bd-ink)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="bd-kicker text-white/75">{t('lobby.createLobby')}</span>
                  <div
                    className="mt-1.5 text-[22px] font-extrabold"
                    style={{ fontFamily: 'var(--bd-font-display)' }}
                  >
                    {t('lobby.createNew')}
                  </div>
                  <div className="mt-1 text-[13px] text-white/80">{t('lobby.createDescription')}</div>
                </div>
                <span className="text-[28px]">✨</span>
              </div>
              <div className="mt-2 text-sm font-bold">{t('lobby.getStarted')} →</div>
            </button>
          </div>

          <div className="mt-6">
            <LobbyStats
              totalLobbies={stats.totalLobbies}
              waitingLobbies={stats.waitingLobbies}
              playingLobbies={stats.playingLobbies}
              totalPlayers={stats.totalPlayers}
            />
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
                onClick={hasActiveFilters ? clearAllFilters : () => router.push('/lobby/create')}
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
    </div>
  )
}

export default function LobbyListPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <LobbyListPageContent />
    </Suspense>
  )
}
