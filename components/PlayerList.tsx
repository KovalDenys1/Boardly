'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import type { BotDifficulty } from '@/lib/bot-profiles'
import Modal from './Modal'
import { sounds } from '@/lib/sounds'

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
  onProfileClick?: (userId: string) => void
  selectedPlayerId?: string
}

const PlayerList = React.memo(function PlayerList({ players, currentTurn, currentUserId, onPlayerClick, onProfileClick, selectedPlayerId }: PlayerListProps) {
  const { t } = useTranslation()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const difficultyLabelMap: Record<BotDifficulty, string> = {
    easy: t('game.ui.botDifficultyEasy'),
    medium: t('game.ui.botDifficultyMedium'),
    hard: t('game.ui.botDifficultyHard'),
  }

  // Sort by score (descending), then by position (ascending) if scores are equal
  const sortedPlayers = [...players].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score // Higher score first
    }
    return a.position - b.position // If scores equal, use original position
  })
  const [animatingScores, setAnimatingScores] = useState<Record<string, boolean>>({})
  const prevScoresRef = useRef<Record<string, number>>({})
  const scoreResetTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    const activePlayerIds = new Set(players.map((player) => player.id))
    const currentScores: Record<string, number> = {}
    const newAnimating: Record<string, boolean> = {}

    players.forEach((player) => {
      currentScores[player.id] = player.score
      if (
        prevScoresRef.current[player.id] !== undefined &&
        prevScoresRef.current[player.id] !== player.score
      ) {
        newAnimating[player.id] = true

        const existingTimeout = scoreResetTimeoutsRef.current[player.id]
        if (existingTimeout) {
          clearTimeout(existingTimeout)
        }

        scoreResetTimeoutsRef.current[player.id] = setTimeout(() => {
          setAnimatingScores((prev) => ({ ...prev, [player.id]: false }))
          delete scoreResetTimeoutsRef.current[player.id]
        }, 1000)
      }
    })

    Object.entries(scoreResetTimeoutsRef.current).forEach(([playerId, timeoutId]) => {
      if (!activePlayerIds.has(playerId)) {
        clearTimeout(timeoutId)
        delete scoreResetTimeoutsRef.current[playerId]
      }
    })

    setAnimatingScores((prev) => {
      const next: Record<string, boolean> = {}

      Object.entries(prev).forEach(([playerId, isAnimating]) => {
        if (activePlayerIds.has(playerId) && isAnimating) {
          next[playerId] = true
        }
      })

      Object.entries(newAnimating).forEach(([playerId, isAnimating]) => {
        if (isAnimating) {
          next[playerId] = true
        }
      })

      return next
    })

    prevScoresRef.current = currentScores
  }, [players])

  useEffect(() => {
    return () => {
      Object.values(scoreResetTimeoutsRef.current).forEach((timeoutId) => clearTimeout(timeoutId))
      scoreResetTimeoutsRef.current = {}
    }
  }, [])

  return (
    <>
      <div
        className="bd-card animate-fade-in h-auto md:h-full flex flex-col p-4"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, var(--bd-card-warm) 100%)' }}
      >
        <button
          onClick={() => {
            sounds.play('click', { force: true })
            setIsModalOpen(true)
          }}
          className="mb-3 flex w-full flex-shrink-0 items-center gap-2 text-left text-sm font-bold transition-opacity hover:opacity-70 cursor-pointer"
        >
          <span className="text-lg">👥</span>
          <span className="truncate">{t('lobby.players.title', 'Players')}</span>
          {onPlayerClick && (
            <span className="text-xs font-normal text-bd-ink-muted dark:text-gray-300 ml-auto shrink-0">
              {t('lobby.players.clickToView', 'Click')}
            </span>
          )}
        </button>
        <div className="space-y-1.5 overflow-visible md:overflow-y-auto pr-1 flex-1 custom-scrollbar snap-y snap-mandatory">
          {sortedPlayers.map((player, index) => {
            // Use player.position (actual game index) instead of sorted index
            const isCurrentTurn = player.position === currentTurn
            const isCurrentUser = player.userId === currentUserId
            const isSelected = selectedPlayerId === player.userId
            const isBot = !!player.user.bot
            const isClickable = !!onPlayerClick
            const playerName = player.user.name || player.user.username || player.user.email || (isBot ? t('game.ui.aiBot') : t('game.ui.player'))
            const botDifficulty = player.user.bot?.difficulty as BotDifficulty | undefined
            const botDifficultyLabel = botDifficulty ? difficultyLabelMap[botDifficulty] : null
            const handlePlayerActivate = () => {
              if (!onPlayerClick) return
              sounds.play('click', { force: true })
              onPlayerClick(player.userId)
            }

            return (
              <div
                key={`player-${player.id}-${player.userId}`}
                onClick={isClickable ? handlePlayerActivate : undefined}
                onKeyDown={isClickable ? (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    handlePlayerActivate()
                  }
                } : undefined}
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
                className={`
                w-full text-left p-2.5 rounded-2xl transition-all duration-200 shadow-sm snap-start border
                ${isCurrentTurn
                    ? 'shadow-md'
                    : ''
                  }
                ${isCurrentUser ? '!border-green-500' : ''}
                ${isSelected ? '!border-purple-400' : ''}
                ${isClickable ? 'cursor-pointer hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400' : ''}
              `}
                style={{
                  background: isBot
                    ? 'linear-gradient(90deg, rgba(155,140,255,0.12) 0%, rgba(255,255,255,0.92) 100%)'
                    : isCurrentTurn
                    ? 'linear-gradient(90deg, rgba(107,193,240,0.16) 0%, rgba(79,201,166,0.12) 100%)'
                    : 'rgba(255,255,255,0.82)',
                  borderColor:
                    isCurrentTurn
                      ? 'rgba(107,193,240,0.28)'
                      : 'var(--bd-line)',
                }}
                aria-pressed={isClickable ? isSelected : undefined}
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
                  `} style={{ width: 'clamp(24px, 2.4vw, 30px)', height: 'clamp(24px, 2.4vw, 30px)', fontSize: 'clamp(11px, 0.85vw, 13px)' }}>
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                    </div>

                    {/* Player Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center flex-wrap" style={{ gap: 'clamp(3px, 0.3vw, 6px)', marginBottom: 'clamp(1px, 0.1vh, 3px)' }}>
                        <span className="font-semibold truncate text-bd-ink dark:text-white" style={{ fontSize: 'clamp(12px, 0.95vw, 15px)' }}>
                          {playerName}
                        </span>
                        {isBot && (
                          <span className="bd-chip bd-chip-lav shrink-0 shadow-sm" style={{ fontSize: 'clamp(9px, 0.72vw, 11px)', padding: 'clamp(1px, 0.15vh, 3px) clamp(5px, 0.45vw, 8px)' }}>
                            AI
                          </span>
                        )}
                        {isBot && botDifficultyLabel && (
                          <span className="bd-chip shrink-0 shadow-sm" style={{ fontSize: 'clamp(9px, 0.72vw, 11px)', padding: 'clamp(1px, 0.15vh, 3px) clamp(5px, 0.45vw, 8px)' }}>
                            {botDifficultyLabel}
                          </span>
                        )}
                        {isCurrentUser && !isBot && (
                          <span className="bd-chip bd-chip-mint shrink-0 shadow-sm" style={{ fontSize: 'clamp(9px, 0.72vw, 11px)', padding: 'clamp(1px, 0.15vh, 3px) clamp(5px, 0.45vw, 8px)' }}>
                            {t('game.ui.you')}
                          </span>
                        )}
                        {isCurrentTurn && (
                          <span className="animate-bounce shrink-0" style={{ fontSize: 'clamp(12px, 0.95vw, 15px)' }}>
                            🎲
                          </span>
                        )}
                      </div>
                      <div className="flex items-center" style={{ gap: 'clamp(3px, 0.3vw, 6px)' }}>
                        <span className="text-bd-ink-muted dark:text-gray-400" style={{ fontSize: 'clamp(10px, 0.78vw, 12px)' }}>{t('game.ui.score')}:</span>
                        <span className={`font-bold ${animatingScores[player.id]
                            ? 'text-green-600 dark:text-green-400 animate-pulse'
                            : 'text-bd-ink dark:text-white'
                          }`} style={{ fontSize: 'clamp(12px, 0.95vw, 15px)' }}>
                          {player.score}
                          {animatingScores[player.id] && (
                            <span className="text-green-500" style={{ marginLeft: 'clamp(2px, 0.2vw, 4px)', fontSize: 'clamp(10px, 0.78vw, 12px)' }}>✨</span>
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

                  {/* Profile icon */}
                  {onProfileClick && !isBot && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        sounds.play('click', { force: true })
                        onProfileClick(player.userId)
                      }}
                      className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full text-bd-ink-muted hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/30 transition-all"
                      title="View profile"
                      aria-label="View player profile"
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                        <path d="M10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.465 14.493a1.23 1.23 0 0 0 .41 1.412A9.957 9.957 0 0 0 10 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 0 0-13.074.003Z" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
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
            const playerName = player.user.name || player.user.username || player.user.email || (isBot ? t('game.ui.aiBot') : t('game.ui.player'))
            const botDifficulty = player.user.bot?.difficulty as BotDifficulty | undefined
            const botDifficultyLabel = botDifficulty ? difficultyLabelMap[botDifficulty] : null

            return (
              <div
                key={`player-modal-${player.id}-${player.userId}`}
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
                        {isBot && botDifficultyLabel && (
                          <span className="text-xs bg-gradient-to-r from-indigo-500 to-blue-500 text-white px-2 py-1 rounded-full shrink-0 shadow-sm font-semibold">
                            {botDifficultyLabel}
                          </span>
                        )}
                        {isCurrentUser && !isBot && (
                          <span className="text-xs bg-gradient-to-r from-green-500 to-emerald-500 text-white px-2 py-1 rounded-full shrink-0 shadow-sm font-semibold">
                            {t('game.ui.you')}
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
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{t('game.ui.score')}</div>
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">
                        {player.score}
                      </div>
                    </div>

                    {/* View Profile Button */}
                    {onProfileClick && !player.user.bot && (
                      <button
                        onClick={() => {
                          onProfileClick(player.userId)
                          setIsModalOpen(false)
                        }}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 rounded-lg font-semibold transition-colors shadow-md hover:shadow-lg"
                      >
                        👤 Profile
                      </button>
                    )}

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
