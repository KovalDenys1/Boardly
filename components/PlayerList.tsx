'use client'

import React, { useState, useEffect } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import Modal from './Modal'

interface Player {
  id: string
  userId: string
  user: {
    name?: string | null
    username: string | null
    email: string | null
    isBot?: boolean
    bot?: {
      id: string
      userId: string
      botType: string
      difficulty: string
    } | null
  }
  score: number
  position: number
  isReady: boolean
}

interface PlayerListProps {
  players: Player[]
  currentTurn: number
  currentUserId?: string | null
  onPlayerClick?: (userId: string) => void
  selectedPlayerId?: string
}

const PlayerList = React.memo(function PlayerList({ players, currentTurn, currentUserId, onPlayerClick, selectedPlayerId }: PlayerListProps) {
  const { t } = useTranslation()
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Sort by score (descending), then by position (ascending) if scores are equal
  const sortedPlayers = [...players].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score // Higher score first
    }
    return a.position - b.position // If scores equal, use original position
  })
  const [prevScores, setPrevScores] = useState<Record<string, number>>({})
  const [animatingScores, setAnimatingScores] = useState<Record<string, boolean>>({})

  useEffect(() => {
    // Check if scores have changed
    const newAnimating: Record<string, boolean> = {}
    players.forEach(player => {
      if (prevScores[player.id] !== undefined && prevScores[player.id] !== player.score) {
        newAnimating[player.id] = true
        setTimeout(() => {
          setAnimatingScores(prev => ({ ...prev, [player.id]: false }))
        }, 1000)
      }
    })

    if (Object.keys(newAnimating).length > 0) {
      setAnimatingScores(newAnimating)
    }

    // Update previous scores
    const newPrevScores: Record<string, number> = {}
    players.forEach(player => {
      newPrevScores[player.id] = player.score
    })
    setPrevScores(newPrevScores)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players.map(p => p.score).join(',')]) // Track score changes

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-4 border border-gray-200 dark:border-gray-700 animate-fade-in h-full flex flex-col">
        <button
          onClick={() => setIsModalOpen(true)}
          className="text-sm font-bold mb-3 flex items-center gap-2 flex-shrink-0 w-full text-left hover:opacity-70 transition-opacity cursor-pointer"
        >
          <span className="text-lg">👥</span>
          <span className="truncate">{t('lobby.players.title', 'Players')}</span>
          {onPlayerClick && (
            <span className="text-xs font-normal text-gray-500 dark:text-gray-400 ml-auto shrink-0">
              {t('lobby.players.clickToView', 'Click')}
            </span>
          )}
        </button>
        <div className="space-y-1.5 overflow-y-auto pr-1 flex-1 custom-scrollbar snap-y snap-mandatory">
          {sortedPlayers.map((player, index) => {
            // Use player.position (actual game index) instead of sorted index
            const isCurrentTurn = player.position === currentTurn
            const isCurrentUser = player.userId === currentUserId
            const isSelected = selectedPlayerId === player.userId
            const isBot = !!player.user.bot
            const playerName = isBot
              ? t('yahtzee.ui.aiBot')
              : player.user.name || player.user.username || player.user.email || t('yahtzee.ui.player')

            return (
              <button
                key={player.id}
                onClick={() => onPlayerClick?.(player.userId)}
                className={`
                w-full text-left p-2 rounded-lg transition-all duration-200 shadow-sm snap-start
                ${isCurrentTurn
                    ? 'bg-gradient-to-r from-blue-100 to-cyan-100 dark:from-blue-900/40 dark:to-cyan-900/40 border-2 border-blue-400 dark:border-blue-500 shadow-md'
                    : 'bg-gray-50 dark:bg-gray-700/50 border-2 border-transparent'
                  }
                ${isCurrentUser ? 'border-2 !border-green-500 dark:!border-green-400' : ''}
                ${isSelected ? 'border-2 !border-purple-500 dark:!border-purple-400' : ''}
                ${isBot ? 'bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30' : ''}
                ${onPlayerClick ? 'cursor-pointer hover:shadow-lg' : ''}
              `}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center min-w-0 flex-1" style={{ gap: 'clamp(6px, 0.6vw, 10px)' }}>
                    {/* Position Badge - Shows current rank by score */}
                    <div className={`
                    rounded-full flex items-center justify-center font-bold text-white shrink-0 shadow-md text-center
                    ${index === 0 ? 'bg-gradient-to-br from-yellow-400 to-yellow-600' : ''}
                    ${index === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-500' : ''}
                    ${index === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-600' : ''}
                    ${index >= 3 ? 'bg-gradient-to-br from-gray-400 to-gray-600' : ''}
                  `} style={{ width: 'clamp(22px, 2.2vw, 28px)', height: 'clamp(22px, 2.2vw, 28px)', fontSize: 'clamp(10px, 0.75vw, 12px)' }}>
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                    </div>

                    {/* Player Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center flex-wrap" style={{ gap: 'clamp(3px, 0.3vw, 6px)', marginBottom: 'clamp(1px, 0.1vh, 3px)' }}>
                        <span className="font-semibold truncate" style={{ fontSize: 'clamp(10px, 0.8vw, 13px)' }}>
                          {playerName}
                        </span>
                        {isBot && (
                          <span className="bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full shrink-0 shadow-sm" style={{ fontSize: 'clamp(8px, 0.65vw, 11px)', padding: 'clamp(1px, 0.15vh, 3px) clamp(4px, 0.4vw, 7px)' }}>
                            AI
                          </span>
                        )}
                        {isCurrentUser && !isBot && (
                          <span className="bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-full shrink-0 shadow-sm" style={{ fontSize: 'clamp(8px, 0.65vw, 11px)', padding: 'clamp(1px, 0.15vh, 3px) clamp(4px, 0.4vw, 7px)' }}>
                            {t('yahtzee.ui.you')}
                          </span>
                        )}
                        {isCurrentTurn && (
                          <span className="animate-bounce shrink-0" style={{ fontSize: 'clamp(11px, 0.85vw, 14px)' }}>
                            🎲
                          </span>
                        )}
                      </div>
                      <div className="flex items-center" style={{ gap: 'clamp(3px, 0.3vw, 6px)' }}>
                        <span className="text-gray-500 dark:text-gray-400" style={{ fontSize: 'clamp(9px, 0.7vw, 11px)' }}>{t('yahtzee.actions.score')}:</span>
                        <span className={`font-bold ${animatingScores[player.id]
                            ? 'text-green-600 dark:text-green-400 animate-pulse'
                            : 'text-gray-900 dark:text-white'
                          }`} style={{ fontSize: 'clamp(11px, 0.85vw, 14px)' }}>
                          {player.score}
                          {animatingScores[player.id] && (
                            <span className="text-green-500" style={{ marginLeft: 'clamp(2px, 0.2vw, 4px)', fontSize: 'clamp(9px, 0.7vw, 11px)' }}>✨</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Ready Status */}
                  {player.isReady && (
                    <div className="text-green-500 font-bold text-sm ml-1 shrink-0">
                      ✓
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Full Players List Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={t('lobby.players.fullList', 'All Players')}
        maxWidth="2xl"
      >
        <div className="space-y-3">
          {sortedPlayers.map((player, index) => {
            const isCurrentTurn = player.position === currentTurn
            const isCurrentUser = player.userId === currentUserId
            const isSelected = selectedPlayerId === player.userId
            const isBot = !!player.user.bot
            const playerName = isBot
              ? t('yahtzee.ui.aiBot')
              : player.user.name || player.user.username || player.user.email || t('yahtzee.ui.player')

            return (
              <div
                key={player.id}
                className={`
                p-4 rounded-xl transition-all shadow-md border-2
                ${isCurrentTurn
                    ? 'bg-gradient-to-r from-blue-100 to-cyan-100 dark:from-blue-900/40 dark:to-cyan-900/40 border-blue-400 dark:border-blue-500'
                    : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600'
                  }
                ${isCurrentUser ? '!border-green-500 dark:!border-green-400' : ''}
                ${isSelected ? '!border-purple-500 dark:!border-purple-400' : ''}
                ${isBot ? 'bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30' : ''}
              `}
              >
                <div className="flex items-center justify-between gap-4">
                  {/* Left: Position & Player Info */}
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    {/* Position Badge */}
                    <div className={`
                    w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-lg shrink-0 shadow-lg
                    ${index === 0 ? 'bg-gradient-to-br from-yellow-400 to-yellow-600' : ''}
                    ${index === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-500' : ''}
                    ${index === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-600' : ''}
                    ${index >= 3 ? 'bg-gradient-to-br from-gray-400 to-gray-600' : ''}
                  `}>
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                    </div>

                    {/* Player Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-bold text-base truncate">
                          {playerName}
                        </span>
                        {isBot && (
                          <span className="text-xs bg-gradient-to-r from-purple-500 to-pink-500 text-white px-2 py-1 rounded-full shrink-0 shadow-sm font-semibold">
                            AI
                          </span>
                        )}
                        {isCurrentUser && !isBot && (
                          <span className="text-xs bg-gradient-to-r from-green-500 to-emerald-500 text-white px-2 py-1 rounded-full shrink-0 shadow-sm font-semibold">
                            {t('yahtzee.ui.you')}
                          </span>
                        )}
                        {isCurrentTurn && (
                          <span className="text-lg animate-bounce shrink-0">
                            🎲
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-1.5">
                          <span>{t('lobby.players.position')}:</span>
                          <span className="font-semibold">{player.position + 1}</span>
                        </div>
                        {player.isReady && (
                          <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                            <span>✓</span>
                            <span className="font-semibold">{t('lobby.players.ready')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Score & Action */}
                  <div className="flex items-center gap-4">
                    {/* Score Display */}
                    <div className="text-right">
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{t('yahtzee.actions.score')}</div>
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">
                        {player.score}
                      </div>
                    </div>

                    {/* View Cards Button */}
                    {onPlayerClick && (
                      <button
                        onClick={() => {
                          onPlayerClick(player.userId)
                          setIsModalOpen(false)
                        }}
                        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold transition-colors shadow-md hover:shadow-lg"
                      >
                        {t('lobby.players.viewCards')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </Modal>
    </>
  )
})

export default PlayerList
