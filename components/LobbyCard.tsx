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
  const statusClass = isPlaying
    ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
    : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'

  return (
    <article
      className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-700 dark:to-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 transition-all hover:shadow-lg animate-fade-in"
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h3 className="max-w-full truncate font-bold text-lg text-gray-900 dark:text-white" title={lobby.name}>
              {lobby.name}
            </h3>
            <span className="font-mono bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded font-bold text-sm">
              {lobby.code}
            </span>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                lobby.isPrivate
                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
              }`}
            >
              {lobby.isPrivate ? t('lobby.privateLobby') : t('lobby.publicLobby')}
            </span>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400 truncate">👤 {creatorName}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className={`px-2.5 py-1 rounded-full font-semibold ${statusClass}`}>
              {isPlaying ? t('lobby.status.playing') : t('lobby.status.waiting')}
            </span>
            <span className="max-w-full truncate px-2.5 py-1 rounded-full font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
              {gamePresentation.icon + ' '}
              {gamePresentation.label}
            </span>
            {lobby.allowSpectators && (
              <span className="px-2.5 py-1 rounded-full font-semibold bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300">
                {t('lobby.spectators', {
                  count: lobby.spectatorCount ?? 0,
                })}
              </span>
            )}
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 lg:w-auto lg:items-end">
          <span className="text-sm text-gray-600 dark:text-gray-300 font-medium">
            {t('lobby.playerOccupancy', {
              current: playerCount,
              max: lobby.maxPlayers,
            })}
          </span>
          <div className="flex w-full gap-2 lg:w-auto">
            {canSpectate && (
              <button
                type="button"
                onClick={() => onWatchLobby(lobby.code)}
                className="flex-1 lg:flex-none px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold"
              >
                <span className="block truncate">{t('lobby.watch')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenLobby(lobby.code)}
              className="flex-1 lg:flex-none px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
            >
              <span className="block truncate">{t('lobby.openLobby')}</span>
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}
