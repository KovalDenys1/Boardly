'use client'

import { PlayerResults } from '@/lib/yahtzee-results'

interface YahtzeeResultsProps {
  results: PlayerResults[]
  currentUserId: string | null
  canStartGame: boolean
  onPlayAgain: () => void
  onBackToLobby: () => void
}

export default function YahtzeeResults({
  results,
  currentUserId,
  canStartGame,
  onPlayAgain,
  onBackToLobby
}: YahtzeeResultsProps) {
  if (results.length === 0) {
    return null
  }
  
  const winner = results[0]
  const isWinner = winner.playerId === currentUserId
  
  return (
    <div className="card text-center animate-scale-in max-w-4xl mx-auto">
      {/* Header Section */}
      <div className="mb-6">
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 mb-4 animate-bounce-in shadow-2xl">
          <span className="text-6xl">🏆</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold mb-2 bg-gradient-to-r from-yellow-600 to-orange-600 bg-clip-text text-transparent">
          Game Over!
        </h2>
        <p className="text-gray-600 dark:text-gray-400 text-base sm:text-lg">
          13 rounds completed • {results.length} {results.length === 1 ? 'player' : 'players'}
        </p>
      </div>
      
      {/* Winner Spotlight */}
      <div className="mb-8 p-4 sm:p-6 bg-gradient-to-r from-yellow-100 to-orange-100 dark:from-yellow-900/30 dark:to-orange-900/30 rounded-xl border-4 border-yellow-400 dark:border-yellow-600 shadow-xl">
        <div className="text-center mb-4">
          <p className="text-2xl sm:text-3xl font-bold mb-2">
            {isWinner ? '🎊 You Won! 🎊' : `🏆 ${winner.playerName} Wins! 🏆`}
          </p>
          <p className="text-4xl sm:text-5xl font-bold text-yellow-600 dark:text-yellow-400">
            {winner.totalScore} points
          </p>
        </div>
        
        {/* Winner's score breakdown */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 mt-4">
          <div className="bg-white/50 dark:bg-gray-800/50 p-3 rounded-lg">
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-1">Upper Section</p>
            <p className="text-xl sm:text-2xl font-bold">
              {winner.upperSectionScore}
              {winner.bonusAchieved && (
                <span className="text-green-600 dark:text-green-400 text-base sm:text-lg ml-2">
                  +{winner.bonusPoints}
                </span>
              )}
            </p>
          </div>
          <div className="bg-white/50 dark:bg-gray-800/50 p-3 rounded-lg">
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-1">Lower Section</p>
            <p className="text-xl sm:text-2xl font-bold">{winner.lowerSectionScore}</p>
          </div>
        </div>
        
        {/* Winner's achievements */}
        {winner.achievements.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 justify-center">
            {winner.achievements.map((achievement, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-xs sm:text-sm font-semibold shadow-sm"
              >
                <span className="text-base sm:text-lg">{achievement.icon}</span>
                <span>{achievement.label}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      
      {/* Final Standings */}
      <div className="mb-6">
        <h3 className="text-xl sm:text-2xl font-bold mb-4">Final Standings</h3>
        <div className="space-y-3">
          {results.map((player) => {
            const isCurrentUser = player.playerId === currentUserId
            
            return (
              <div
                key={player.playerId}
                className={`
                  p-3 sm:p-4 rounded-xl transition-all duration-300 border-2 text-left
                  ${player.rank === 0 ? 'bg-gradient-to-r from-yellow-400/20 to-yellow-600/20 border-yellow-500 shadow-lg scale-[1.02]' : ''}
                  ${player.rank === 1 ? 'bg-gradient-to-r from-gray-300/20 to-gray-400/20 border-gray-400' : ''}
                  ${player.rank === 2 ? 'bg-gradient-to-r from-orange-300/20 to-orange-400/20 border-orange-400' : ''}
                  ${player.rank > 2 ? 'bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600' : ''}
                  ${isCurrentUser ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-gray-900' : ''}
                `}
              >
                {/* Player header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <span className="text-2xl sm:text-3xl font-bold">
                      {player.rank === 0 ? '🥇' : player.rank === 1 ? '🥈' : player.rank === 2 ? '🥉' : `#${player.rank + 1}`}
                    </span>
                    <div>
                      <p className="text-base sm:text-xl font-bold flex items-center gap-2">
                        <span className="truncate max-w-[150px] sm:max-w-none">{player.playerName}</span>
                        {isCurrentUser && (
                          <span className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 font-normal">
                            (You)
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl sm:text-3xl font-bold">{player.totalScore}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">points</p>
                  </div>
                </div>
                
                {/* Score breakdown */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 sm:gap-2 text-xs sm:text-sm mb-2">
                  <div className="text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Upper:</span>{' '}
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      {player.upperSectionScore}
                    </span>
                    {player.bonusAchieved && (
                      <span className="text-green-600 dark:text-green-400 ml-1">
                        (+{player.bonusPoints} bonus)
                      </span>
                    )}
                  </div>
                  <div className="text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Lower:</span>{' '}
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      {player.lowerSectionScore}
                    </span>
                  </div>
                </div>
                
                {/* Achievements */}
                {player.achievements.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {player.achievements.map((achievement, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs font-semibold"
                      >
                        <span>{achievement.icon}</span>
                        <span className="hidden sm:inline">{achievement.label}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      
      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center mt-8">
        <div className="flex flex-col items-center">
          <button
            onClick={onPlayAgain}
            disabled={!canStartGame}
            className="btn btn-success text-base sm:text-lg px-6 sm:px-8 py-3 flex items-center gap-2 justify-center hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="text-xl">🔄</span>
            <span>Play Again</span>
          </button>
          {!canStartGame && (
            <p className="text-xs text-gray-500 mt-2 text-center">
              Only the lobby host can start the next round.
            </p>
          )}
        </div>
        <button
          onClick={onBackToLobby}
          className="btn btn-secondary text-base sm:text-lg px-6 sm:px-8 py-3 flex items-center gap-2 justify-center hover:scale-105 transition-transform"
        >
          <span className="text-xl">↩️</span>
          <span>Back to Lobbies</span>
        </button>
      </div>
    </div>
  )
}
