'use client'

import React, { useState, useEffect } from 'react'

interface Player {
  id: string
  userId: string
  user: {
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
}

const PlayerList = React.memo(function PlayerList({ players, currentTurn, currentUserId }: PlayerListProps) {
  const sortedPlayers = [...players].sort((a, b) => a.position - b.position)
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
    <div className="card animate-fade-in">
      <h2 className="text-2xl font-bold mb-4 text-center">👥 Players</h2>
      <div className="space-y-2">
        {sortedPlayers.map((player, index) => {
          const isCurrentTurn = index === currentTurn
          const isCurrentUser = player.userId === currentUserId
          const isBot = player.user.isBot === true
          const playerName = isBot 
            ? '🤖 AI Bot' 
            : player.user.username || player.user.email || 'Player'

          return (
            <div
              key={player.id}
              className={`
                p-4 rounded-lg border-2 transition-all duration-200
                ${isCurrentTurn 
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-lg scale-105 animate-pulse' 
                  : 'border-gray-200 dark:border-gray-700'
                }
                ${isCurrentUser ? 'ring-2 ring-green-500' : ''}
                ${isBot ? 'bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20' : ''}
              `}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Position Badge */}
                  <div className={`
                    w-8 h-8 rounded-full flex items-center justify-center font-bold text-white
                    ${index === 0 ? 'bg-yellow-500' : ''}
                    ${index === 1 ? 'bg-gray-400' : ''}
                    ${index === 2 ? 'bg-orange-600' : ''}
                    ${index >= 3 ? 'bg-gray-500' : ''}
                  `}>
                    {index + 1}
                  </div>

                  {/* Player Info */}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-lg">
                        {playerName}
                      </span>
                      {isBot && (
                        <span className="text-xs bg-purple-500 text-white px-2 py-0.5 rounded-full">
                          AI
                        </span>
                      )}
                      {isCurrentUser && !isBot && (
                        <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">
                          You
                        </span>
                      )}
                      {isCurrentTurn && (
                        <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full animate-bounce-in">
                          🎲 Turn
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Score: <span className={`font-bold text-lg ${
                        animatingScores[player.id] 
                          ? 'text-green-600 dark:text-green-400 animate-pulse scale-110 inline-block' 
                          : ''
                      }`}>
                        {player.score}
                        {animatingScores[player.id] && (
                          <span className="ml-1 text-green-500 animate-bounce-in">✨</span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Ready Status */}
                {player.isReady && (
                  <div className="text-green-500 font-bold">
                    ✓
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})

export default PlayerList
