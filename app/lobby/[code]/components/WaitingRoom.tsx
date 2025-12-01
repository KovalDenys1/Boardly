import LoadingSpinner from '@/components/LoadingSpinner'
import { soundManager } from '@/lib/sounds'

interface WaitingRoomProps {
  game: any
  lobby: any
  gameEngine: any
  canStartGame: boolean
  startingGame: boolean
  onStartGame: () => void
  onAddBot: () => void
  getCurrentUserId: () => string | undefined
}

export default function WaitingRoom({
  game,
  lobby,
  gameEngine,
  canStartGame,
  startingGame,
  onStartGame,
  onAddBot,
  getCurrentUserId,
}: WaitingRoomProps) {
  const playerCount = game?.players?.length || 0
  const hasBot = game?.players?.some((p: any) => p.user?.isBot)
  const canAddMorePlayers = playerCount < (lobby?.maxPlayers || 4)

  // Show loading overlay when starting game
  if (startingGame) {
    return (
      <div className="max-w-2xl mx-auto">
        {/* Loading Card */}
        <div className="card text-center animate-scale-in">
          <div className="flex flex-col items-center justify-center py-16">
            <LoadingSpinner size="lg" />
            <h3 className="text-3xl font-bold mt-8 mb-3">Starting Game...</h3>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              {playerCount === 1 ? '🤖 Adding bot player...' : '🎲 Preparing the dice...'}
            </p>
            <div className="mt-8 flex items-center gap-2 text-sm text-gray-500">
              <div className="animate-pulse">⏳</div>
              <span>This will only take a moment</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Main Waiting Card */}
      <div className="card text-center animate-scale-in">
        {/* Header Section */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500 mb-6 animate-pulse shadow-2xl">
            <span className="text-5xl">🎲</span>
          </div>
          <h2 className="text-4xl font-bold mb-3 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Ready to Play Yahtzee?
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">
            Roll the dice, score big, and have fun!
          </p>
        </div>

        {/* Player Count Status */}
        <div className="mb-8">
          <div className={`inline-flex items-center gap-3 px-6 py-3 rounded-full ${
            playerCount < 2 
              ? 'bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-300 dark:border-yellow-600' 
              : 'bg-green-50 dark:bg-green-900/20 border-2 border-green-300 dark:border-green-600'
          }`}>
            <span className="text-2xl">👥</span>
            <div className="text-left">
              <p className={`font-bold text-lg ${
                playerCount < 2 
                  ? 'text-yellow-700 dark:text-yellow-300' 
                  : 'text-green-700 dark:text-green-300'
              }`}>
                {playerCount} Player{playerCount !== 1 ? 's' : ''} in Lobby
              </p>
              {playerCount < 2 ? (
                <p className="text-sm text-yellow-600 dark:text-yellow-400">
                  Add a bot or wait for others to join
                </p>
              ) : (
                <p className="text-sm text-green-600 dark:text-green-400">
                  ✅ Ready to start the game!
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Players List - Compact View */}
        {game?.players && game.players.length > 0 && (
          <div className="mb-8 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
              Players in Lobby
            </h3>
            <div className="space-y-3">
              {game.players.map((p: any, index: number) => {
                const isBot = p.user?.isBot === true
                const playerName = isBot 
                  ? '🤖 AI Bot' 
                  : p.user.name || p.user.username || p.user.email || 'Player'
                const isCurrentUser = p.userId === getCurrentUserId()

                return (
                  <div
                    key={p.id}
                    className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                      isCurrentUser 
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20' 
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                    } ${isBot ? 'bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20' : ''}`}
                  >
                    {/* Position */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${
                      index === 0 ? 'bg-yellow-500' : 'bg-gray-400'
                    }`}>
                      {index + 1}
                    </div>

                    {/* Player Info */}
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-base truncate">
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
                      </div>
                    </div>

                    {/* Ready Status */}
                    <div className="text-green-500 text-xl">
                      ✓
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {canStartGame ? (
          <div className="space-y-4">
            <button
              onClick={() => {
                soundManager.play('click')
                onStartGame()
              }}
              disabled={playerCount < 1}
              className="btn btn-success text-xl px-10 py-4 animate-bounce-in disabled:opacity-50 disabled:cursor-not-allowed w-full shadow-xl hover:shadow-2xl transition-shadow"
            >
              <span className="text-2xl mr-2">🎮</span>
              Start Yahtzee Game
            </button>
            
            {playerCount === 1 && !hasBot && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-600 rounded-lg p-3">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  💡 <strong>Tip:</strong> A bot will be auto-added when you start if you're still alone
                </p>
              </div>
            )}

            {/* Add Bot Button */}
            {lobby.gameType === 'yahtzee' && canAddMorePlayers && (
              <button
                onClick={() => {
                  soundManager.play('click')
                  onAddBot()
                }}
                disabled={!canAddMorePlayers}
                className="btn btn-secondary text-lg px-8 py-3 w-full disabled:opacity-50 disabled:cursor-not-allowed"
                title={!canAddMorePlayers ? 'Lobby is full' : 'Add AI opponent'}
              >
                <span className="text-xl mr-2">🤖</span>
                Add Bot Player
                {canAddMorePlayers && (
                  <span className="ml-2 text-sm opacity-75">
                    ({playerCount}/{lobby?.maxPlayers || 4})
                  </span>
                )}
              </button>
            )}
          </div>
        ) : (
          <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-300 dark:border-blue-600 rounded-xl p-6">
            <div className="flex items-center justify-center gap-3 mb-3">
              <span className="text-3xl animate-bounce">⏳</span>
              <p className="text-blue-700 dark:text-blue-300 font-bold text-xl">
                Waiting for host to start...
              </p>
            </div>
            <p className="text-sm text-blue-600 dark:text-blue-400">
              Host: <span className="font-semibold">{lobby?.creator?.username || lobby?.creator?.email || 'Unknown'}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
