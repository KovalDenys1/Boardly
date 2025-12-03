'use client'

import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

interface Player {
  id: string
  userId: string
  user: {
    name?: string | null
    username: string | null
    email: string | null
    isBot?: boolean
  }
  score: number
  position: number
  isReady: boolean
}

interface PlayerListProps {
  players: Player[]
  currentTurn: number
  currentUserId?: string
  onPlayerClick?: (userId: string) => void
  selectedPlayerId?: string
}

const PlayerList = React.memo(function PlayerList({ players, currentTurn, currentUserId, onPlayerClick, selectedPlayerId }: PlayerListProps) {
  const { t } = useTranslation()
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
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-4 border border-gray-200 dark:border-gray-700 animate-fade-in h-full flex flex-col">
      <h2 className="text-base font-bold mb-3 flex items-center gap-2 flex-shrink-0">
        <span className="text-xl">👥</span>
        <span>{t('lobby.players.title', 'Players')}</span>
        {onPlayerClick && (
          <span className="text-xs font-normal text-gray-500 dark:text-gray-400 ml-auto">
            {t('lobby.players.clickToView', 'Click to view cards')}
          </span>
        )}
      </h2>
      <div className="space-y-2 overflow-y-auto pr-1 flex-1 custom-scrollbar snap-y snap-mandatory">
        {sortedPlayers.map((player, index) => {
          // Use player.position (actual game index) instead of sorted index
          const isCurrentTurn = player.position === currentTurn
          const isCurrentUser = player.userId === currentUserId
          const isSelected = selectedPlayerId === player.userId
          const isBot = player.user.isBot === true
          const playerName = isBot 
            ? '🤖 AI Bot' 
            : player.user.name || player.user.username || player.user.email || 'Player'

          return (
            <button
              key={player.id}
              onClick={() => onPlayerClick?.(player.userId)}
              className={`
                w-full text-left p-2.5 rounded-xl transition-all duration-200 shadow-sm snap-start
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {/* Position Badge - Shows current rank by score */}
                  <div className={`
                    w-7 h-7 rounded-full flex items-center justify-center font-bold text-white text-xs shrink-0 shadow-md
                    ${index === 0 ? 'bg-gradient-to-br from-yellow-400 to-yellow-600' : ''}
                    ${index === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-500' : ''}
                    ${index === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-600' : ''}
                    ${index >= 3 ? 'bg-gradient-to-br from-gray-400 to-gray-600' : ''}
                  `}>
                    {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                  </div>

                  {/* Player Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <span className="font-bold text-xs truncate">
                        {playerName}
                      </span>
                      {isBot && (
                        <span className="text-xs bg-gradient-to-r from-purple-500 to-pink-500 text-white px-1.5 py-0.5 rounded-full shrink-0 shadow-sm">
                          AI
                        </span>
                      )}
                      {isCurrentUser && !isBot && (
                        <span className="text-xs bg-gradient-to-r from-green-500 to-emerald-500 text-white px-1.5 py-0.5 rounded-full shrink-0 shadow-sm">
                          You
                        </span>
                      )}
                      {isCurrentTurn && (
                        <span className="text-sm animate-bounce shrink-0">
                          🎲
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-500 dark:text-gray-400">Score:</span>
                      <span className={`font-bold text-sm ${
                        animatingScores[player.id] 
                          ? 'text-green-600 dark:text-green-400 animate-pulse' 
                          : 'text-gray-900 dark:text-white'
                      }`}>
                        {player.score}
                        {animatingScores[player.id] && (
                          <span className="ml-1 text-green-500 text-xs">✨</span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Ready Status */}
                {player.isReady && (
                  <div className="text-green-500 font-bold text-base ml-2">
                    ✓
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
})

export default PlayerList
