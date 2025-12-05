'use client'

import { PlayerResults } from '@/lib/yahtzee-results'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation()
  if (results.length === 0) {
    return null
  }
  
  const winner = results[0]
  const isWinner = winner.playerId === currentUserId
  
  return (
    <div
      className="fixed inset-0 top-20 overflow-y-auto bg-gray-50 dark:bg-gray-900"
      style={{ padding: `clamp(12px, 1.2vw, 20px)` }}
    >
      <div
        className="card text-center animate-scale-in max-w-4xl mx-auto"
        style={{ marginTop: `clamp(12px, 1.2vh, 20px)`, marginBottom: `clamp(12px, 1.2vh, 20px)` }}
      >
        {/* Header Section */}
        <div style={{ marginBottom: `clamp(20px, 2vh, 32px)` }}>
          <div
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 animate-bounce-in shadow-2xl"
            style={{
              width: `clamp(80px, 8vw, 120px)`,
              height: `clamp(80px, 8vw, 120px)`,
              marginBottom: `clamp(12px, 1.2vh, 20px)`,
            }}
          >
            <span style={{ fontSize: `clamp(48px, 5vw, 72px)` }}>🏆</span>
          </div>
          <h2
            className="font-bold bg-gradient-to-r from-yellow-600 to-orange-600 bg-clip-text text-transparent"
            style={{
              fontSize: `clamp(24px, 2.5vw, 40px)`,
              marginBottom: `clamp(6px, 0.6vh, 10px)`,
            }}
          >
            {t('yahtzee.results.gameOver')}
          </h2>
          <p
            className="text-gray-600 dark:text-gray-400"
            style={{ fontSize: `clamp(13px, 1.3vw, 20px)` }}
          >
            {t('yahtzee.results.roundsCompleted', { count: 13 })} • {results.length} {t('yahtzee.results.players', { count: results.length })}
          </p>
        </div>
      
      {/* Winner Spotlight */}
      <div
        className="bg-gradient-to-r from-yellow-100 to-orange-100 dark:from-yellow-900/30 dark:to-orange-900/30 rounded-xl border-yellow-400 dark:border-yellow-600 shadow-xl"
        style={{
          marginBottom: `clamp(24px, 2.5vh, 40px)`,
          padding: `clamp(16px, 1.6vh, 28px)`,
          borderWidth: `clamp(3px, 0.3vw, 5px)`,
        }}
      >
        <div
          className="text-center"
          style={{ marginBottom: `clamp(12px, 1.2vh, 20px)` }}
        >
          <p
            className="font-bold"
            style={{
              fontSize: `clamp(20px, 2vw, 32px)`,
              marginBottom: `clamp(6px, 0.6vh, 10px)`,
            }}
          >
            {isWinner ? t('yahtzee.results.youWon') : t('yahtzee.results.playerWins', { player: winner.playerName })}
          </p>
          <p
            className="font-bold text-yellow-600 dark:text-yellow-400"
            style={{ fontSize: `clamp(32px, 3.5vw, 56px)` }}
          >
            {t('yahtzee.results.points', { count: winner.totalScore })}
          </p>
        </div>
        
        {/* Winner's score breakdown */}
        <div
          className="grid grid-cols-2"
          style={{
            gap: `clamp(10px, 1vw, 20px)`,
            marginTop: `clamp(12px, 1.2vh, 20px)`,
          }}
        >
          <div
            className="bg-white/50 dark:bg-gray-800/50 rounded-lg"
            style={{ padding: `clamp(10px, 1vh, 16px)` }}
          >
            <p
              className="text-gray-600 dark:text-gray-400"
              style={{
                fontSize: `clamp(10px, 0.9vw, 14px)`,
                marginBottom: `clamp(3px, 0.3vh, 5px)`,
              }}
            >
              {t('yahtzee.results.upperSection')}
            </p>
            <p
              className="font-bold"
              style={{ fontSize: `clamp(16px, 1.6vw, 28px)` }}
            >
              {winner.upperSectionScore}
              {winner.bonusAchieved && (
                <span
                  className="text-green-600 dark:text-green-400"
                  style={{
                    fontSize: `clamp(13px, 1.3vw, 20px)`,
                    marginLeft: `clamp(6px, 0.6vw, 10px)`,
                  }}
                >
                  +{winner.bonusPoints}
                </span>
              )}
            </p>
          </div>
          <div
            className="bg-white/50 dark:bg-gray-800/50 rounded-lg"
            style={{ padding: `clamp(10px, 1vh, 16px)` }}
          >
            <p
              className="text-gray-600 dark:text-gray-400"
              style={{
                fontSize: `clamp(10px, 0.9vw, 14px)`,
                marginBottom: `clamp(3px, 0.3vh, 5px)`,
              }}
            >
              {t('yahtzee.results.lowerSection')}
            </p>
            <p
              className="font-bold"
              style={{ fontSize: `clamp(16px, 1.6vw, 28px)` }}
            >
              {winner.lowerSectionScore}
            </p>
          </div>
        </div>
        
        {/* Winner's achievements */}
        {winner.achievements.length > 0 && (
          <div
            className="flex flex-wrap justify-center"
            style={{
              marginTop: `clamp(12px, 1.2vh, 20px)`,
              gap: `clamp(6px, 0.6vw, 10px)`,
            }}
          >
            {winner.achievements.map((achievement, idx) => (
              <span
                key={idx}
                className="inline-flex items-center bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full font-semibold shadow-sm"
                style={{
                  gap: `clamp(3px, 0.3vw, 5px)`,
                  padding: `clamp(5px, 0.5vh, 8px) clamp(10px, 1vw, 16px)`,
                  fontSize: `clamp(10px, 0.9vw, 14px)`,
                }}
              >
                <span style={{ fontSize: `clamp(13px, 1.3vw, 20px)` }}>{achievement.icon}</span>
                <span>{achievement.label}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      
      {/* Final Standings */}
      <div style={{ marginBottom: `clamp(20px, 2vh, 32px)` }}>
        <h3
          className="font-bold"
          style={{
            fontSize: `clamp(18px, 1.8vw, 28px)`,
            marginBottom: `clamp(12px, 1.2vh, 20px)`,
          }}
        >
          {t('yahtzee.results.finalStandings')}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: `clamp(10px, 1vh, 16px)` }}>
          {results.map((player) => {
            const isCurrentUser = player.playerId === currentUserId
            
            return (
              <div
                key={player.playerId}
                className={`rounded-xl transition-all duration-300 text-left ${
                  player.rank === 0 ? 'bg-gradient-to-r from-yellow-400/20 to-yellow-600/20 border-yellow-500 shadow-lg scale-[1.02]' : ''
                } ${
                  player.rank === 1 ? 'bg-gradient-to-r from-gray-300/20 to-gray-400/20 border-gray-400' : ''
                } ${
                  player.rank === 2 ? 'bg-gradient-to-r from-orange-300/20 to-orange-400/20 border-orange-400' : ''
                } ${
                  player.rank > 2 ? 'bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600' : ''
                } ${
                  isCurrentUser ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-gray-900' : ''
                }`}
                style={{
                  padding: `clamp(10px, 1vh, 20px)`,
                  borderWidth: `clamp(1.5px, 0.15vw, 2.5px)`,
                }}
              >
                {/* Player header */}
                <div
                  className="flex items-center justify-between"
                  style={{ marginBottom: `clamp(6px, 0.6vh, 10px)` }}
                >
                  <div
                    className="flex items-center"
                    style={{ gap: `clamp(6px, 0.6vw, 16px)` }}
                  >
                    <span
                      className="font-bold"
                      style={{ fontSize: `clamp(20px, 2vw, 36px)` }}
                    >
                      {player.rank === 0 ? '🥇' : player.rank === 1 ? '🥈' : player.rank === 2 ? '🥉' : `#${player.rank + 1}`}
                    </span>
                    <div>
                      <p
                        className="font-bold flex items-center"
                        style={{
                          fontSize: `clamp(13px, 1.3vw, 24px)`,
                          gap: `clamp(6px, 0.6vw, 10px)`,
                        }}
                      >
                        <span className="truncate max-w-[150px] sm:max-w-none">{player.playerName}</span>
                        {isCurrentUser && (
                          <span
                            className="text-blue-600 dark:text-blue-400 font-normal"
                            style={{ fontSize: `clamp(10px, 0.9vw, 14px)` }}
                          >
                            (You)
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p
                      className="font-bold"
                      style={{ fontSize: `clamp(20px, 2vw, 36px)` }}
                    >
                      {player.totalScore}
                    </p>
                    <p
                      className="text-gray-500 dark:text-gray-400"
                      style={{ fontSize: `clamp(10px, 0.9vw, 12px)` }}
                    >
                      points
                    </p>
                  </div>
                </div>
                
                {/* Score breakdown */}
                <div
                  className="grid grid-cols-1 sm:grid-cols-2"
                  style={{
                    gap: `clamp(3px, 0.3vh, 10px)`,
                    marginBottom: `clamp(6px, 0.6vh, 10px)`,
                    fontSize: `clamp(10px, 0.9vw, 14px)`,
                  }}
                >
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
                  <div
                    className="flex flex-wrap"
                    style={{
                      gap: `clamp(3px, 0.3vw, 5px)`,
                      marginTop: `clamp(6px, 0.6vh, 10px)`,
                    }}
                  >
                    {player.achievements.map((achievement, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded font-semibold"
                        style={{
                          gap: `clamp(3px, 0.3vw, 5px)`,
                          padding: `clamp(2px, 0.2vh, 3px) clamp(6px, 0.6vw, 10px)`,
                          fontSize: `clamp(10px, 0.9vw, 12px)`,
                        }}
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
      <div
        className="flex flex-col sm:flex-row justify-center"
        style={{
          gap: `clamp(10px, 1vw, 20px)`,
          marginTop: `clamp(24px, 2.5vh, 40px)`,
        }}
      >
        <div className="flex flex-col items-center">
          <button
            onClick={onPlayAgain}
            disabled={!canStartGame}
            className="btn btn-success flex items-center justify-center hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              fontSize: `clamp(13px, 1.3vw, 20px)`,
              padding: `clamp(10px, 1vh, 16px) clamp(20px, 2vw, 40px)`,
              gap: `clamp(6px, 0.6vw, 10px)`,
            }}
          >
            <span style={{ fontSize: `clamp(16px, 1.6vw, 24px)` }}>🔄</span>
            <span>Play Again</span>
          </button>
          {!canStartGame && (
            <p
              className="text-gray-500 text-center"
              style={{
                fontSize: `clamp(10px, 0.9vw, 12px)`,
                marginTop: `clamp(6px, 0.6vh, 10px)`,
              }}
            >
              Only the lobby host can start the next round.
            </p>
          )}
        </div>
        <button
          onClick={onBackToLobby}
          className="btn btn-secondary flex items-center justify-center hover:scale-105 transition-transform"
          style={{
            fontSize: `clamp(13px, 1.3vw, 20px)`,
            padding: `clamp(10px, 1vh, 16px) clamp(20px, 2vw, 40px)`,
            gap: `clamp(6px, 0.6vw, 10px)`,
          }}
        >
          <span style={{ fontSize: `clamp(16px, 1.6vw, 24px)` }}>↩️</span>
          <span>Back to Lobbies</span>
        </button>
      </div>
      </div>
    </div>
  )
}
