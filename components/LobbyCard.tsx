'use client'

import { useTranslation } from '@/lib/i18n-helpers'

export interface LobbyCardData {
  id: string
  code: string
  name: string
  gameType?: string
  isPrivate?: boolean
  maxPlayers: number
  allowSpectators?: boolean
  maxSpectators?: number
  spectatorCount?: number
  creator: {
    username: string | null
    email: string | null
  }
  games: {
    id: string
    status: string
    _count: {
      players: number
    }
  }[]
}

interface LobbyCardProps {
  lobby: LobbyCardData
  index: number
  onOpenLobby: (code: string) => void
  onWatchLobby: (code: string) => void
}

export default function LobbyCard({ lobby, index, onOpenLobby, onWatchLobby }: LobbyCardProps) {
  const { t } = useTranslation()
  const getGamePresentation = (gameType: string | undefined): { icon: string; label: string } => {
    switch (gameType) {
      case 'yahtzee':
        return { icon: '🎲', label: t('games.yahtzee.title', 'Yahtzee') }
      case 'guess_the_spy':
        return { icon: '🕵️', label: t('games.spy.name', 'Guess the Spy') }
      case 'tic_tac_toe':
        return { icon: '❌⭕', label: t('games.tictactoe.name', 'Tic-Tac-Toe') }
      case 'rock_paper_scissors':
        return { icon: '✊✋✌️', label: t('games.rock_paper_scissors.name', 'Rock Paper Scissors') }
      default:
        return { icon: '🎮', label: t('lobby.gameUnknown') }
    }
  }

  const activeGame = lobby.games[0]
  const isPlaying = activeGame?.status === 'playing'
  const playerCount = activeGame?._count?.players ?? 0
  const canSpectate = Boolean(lobby.allowSpectators && isPlaying)
  const creatorName = lobby.creator.username || t('lobby.ownerFallback')
  const gamePresentation = getGamePresentation(lobby.gameType)
  const occupancyPercent = lobby.maxPlayers > 0 ? Math.min(100, Math.round((playerCount / lobby.maxPlayers) * 100)) : 0
  const statusClass = isPlaying
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
    : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'

  return (
    <article
      className="group relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md dark:border-slate-700/60 dark:bg-slate-900/60 dark:hover:border-blue-500/30"
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-blue-500 via-indigo-500 to-purple-500 opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-xl shadow-sm dark:bg-slate-800/80">
              {gamePresentation.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="max-w-full truncate text-lg font-bold text-slate-900 dark:text-white" title={lobby.name}>
                  {lobby.name}
                </h3>
                <span className="rounded-full bg-blue-100 px-2.5 py-1 font-mono text-xs font-bold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                  {lobby.code}
                </span>
              </div>
              <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
                {creatorName}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2.5 py-1 font-semibold ${statusClass}`}>
              {isPlaying ? t('lobby.status.playing') : t('lobby.status.waiting')}
            </span>
            <span className="rounded-full bg-indigo-100 px-2.5 py-1 font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
              {gamePresentation.label}
            </span>
            <span
              className={`rounded-full px-2.5 py-1 font-semibold ${
                lobby.isPrivate
                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
              }`}
            >
              {lobby.isPrivate ? t('lobby.privateLobby') : t('lobby.publicLobby')}
            </span>
            {lobby.allowSpectators && (
              <span className="rounded-full bg-sky-100 px-2.5 py-1 font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                {t('lobby.spectators', {
                  count: lobby.spectatorCount ?? 0,
                })}
              </span>
            )}
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-500 dark:text-slate-400">
                {t('lobby.playerOccupancy', {
                  current: playerCount,
                  max: lobby.maxPlayers,
                })}
              </span>
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {occupancyPercent}%
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 transition-all"
                style={{ width: `${occupancyPercent}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 lg:w-auto lg:min-w-[180px] lg:items-end">
          <div className="flex w-full gap-2 lg:w-auto">
            {canSpectate && (
              <button
                type="button"
                onClick={() => onWatchLobby(lobby.code)}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-800 lg:flex-none"
              >
                <span className="block truncate">{t('lobby.watch')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenLobby(lobby.code)}
              className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:from-blue-700 hover:to-indigo-700 hover:shadow lg:flex-none"
            >
              <span className="block truncate">{t('lobby.openLobby')}</span>
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}
