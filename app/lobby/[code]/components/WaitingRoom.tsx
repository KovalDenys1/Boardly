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
      <div style={{ maxWidth: 'min(672px, 90vw)', margin: '0 auto' }}>
        {/* Loading Card */}
        <div className="card text-center animate-scale-in">
          <div
            className="flex flex-col items-center justify-center"
            style={{ paddingTop: `clamp(48px, 5vh, 80px)`, paddingBottom: `clamp(48px, 5vh, 80px)` }}
          >
            <LoadingSpinner size="lg" />
            <h3
              className="font-bold"
              style={{
                fontSize: `clamp(24px, 2.5vw, 36px)`,
                marginTop: `clamp(24px, 2.5vh, 40px)`,
                marginBottom: `clamp(10px, 1vh, 16px)`,
              }}
            >
              Starting Game...
            </h3>
            <p
              className="text-gray-600 dark:text-gray-400"
              style={{ fontSize: `clamp(14px, 1.4vw, 20px)` }}
            >
              {playerCount === 1 ? '🤖 Adding bot player...' : '🎲 Preparing the dice...'}
            </p>
            <div
              className="flex items-center text-gray-500"
              style={{
                marginTop: `clamp(24px, 2.5vh, 40px)`,
                gap: `clamp(6px, 0.6vw, 10px)`,
                fontSize: `clamp(12px, 1.1vw, 14px)`,
              }}
            >
              <div className="animate-pulse">⏳</div>
              <span>This will only take a moment</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 'min(672px, 90vw)', margin: '0 auto' }}>
      {/* Main Waiting Card */}
      <div className="card text-center animate-scale-in">
        {/* Header Section */}
        <div style={{ marginBottom: `clamp(24px, 2.5vh, 40px)` }}>
          <div
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500 animate-pulse shadow-2xl"
            style={{
              width: `clamp(80px, 8vw, 120px)`,
              height: `clamp(80px, 8vw, 120px)`,
              marginBottom: `clamp(20px, 2vh, 32px)`,
            }}
          >
            <span style={{ fontSize: `clamp(36px, 4vw, 60px)` }}>🎲</span>
          </div>
          <h2
            className="font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent"
            style={{
              fontSize: `clamp(28px, 3vw, 44px)`,
              marginBottom: `clamp(10px, 1vh, 16px)`,
            }}
          >
            Ready to Play Yahtzee?
          </h2>
          <p
            className="text-gray-600 dark:text-gray-400"
            style={{
              fontSize: `clamp(14px, 1.4vw, 20px)`,
              marginBottom: `clamp(12px, 1.2vh, 20px)`,
            }}
          >
            Roll the dice, score big, and have fun!
          </p>
        </div>

        {/* Player Count Status */}
        <div style={{ marginBottom: `clamp(24px, 2.5vh, 40px)` }}>
          <div
            className={`inline-flex items-center rounded-full ${
              playerCount < 2
                ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-600'
                : 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-600'
            }`}
            style={{
              gap: `clamp(10px, 1vw, 16px)`,
              padding: `clamp(10px, 1vh, 16px) clamp(20px, 2vw, 32px)`,
              borderWidth: `clamp(1.5px, 0.15vw, 2.5px)`,
            }}
          >
            <span style={{ fontSize: `clamp(20px, 2vw, 28px)` }}>👥</span>
            <div className="text-left">
              <p
                className={`font-bold ${
                  playerCount < 2
                    ? 'text-yellow-700 dark:text-yellow-300'
                    : 'text-green-700 dark:text-green-300'
                }`}
                style={{ fontSize: `clamp(14px, 1.4vw, 20px)` }}
              >
                {playerCount} Player{playerCount !== 1 ? 's' : ''} in Lobby
              </p>
              {playerCount < 2 ? (
                <p
                  className="text-yellow-600 dark:text-yellow-400"
                  style={{ fontSize: `clamp(11px, 1vw, 14px)` }}
                >
                  Add a bot or wait for others to join
                </p>
              ) : (
                <p
                  className="text-green-600 dark:text-green-400"
                  style={{ fontSize: `clamp(11px, 1vw, 14px)` }}
                >
                  ✅ Ready to start the game!
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Players List - Compact View */}
        {game?.players && game.players.length > 0 && (
          <div
            className="bg-gray-50 dark:bg-gray-800/50 rounded-xl"
            style={{
              marginBottom: `clamp(24px, 2.5vh, 40px)`,
              padding: `clamp(20px, 2vh, 32px)`,
            }}
          >
            <h3
              className="font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide"
              style={{
                fontSize: `clamp(11px, 1vw, 13px)`,
                marginBottom: `clamp(12px, 1.2vh, 20px)`,
              }}
            >
              Players in Lobby
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: `clamp(10px, 1vh, 16px)` }}>
              {game.players.map((p: any, index: number) => {
                const isBot = p.user?.isBot === true
                const playerName = isBot 
                  ? '🤖 AI Bot' 
                  : p.user.name || p.user.username || p.user.email || 'Player'
                const isCurrentUser = p.userId === getCurrentUserId()

                return (
                  <div
                    key={p.id}
                    className={`flex items-center rounded-lg transition-all ${
                      isCurrentUser
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                    } ${
                      isBot ? 'bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20' : ''
                    }`}
                    style={{
                      gap: `clamp(10px, 1vw, 16px)`,
                      padding: `clamp(12px, 1.2vh, 20px)`,
                      borderWidth: `clamp(1.5px, 0.15vw, 2.5px)`,
                    }}
                  >
                    {/* Position */}
                    <div
                      className={`rounded-full flex items-center justify-center font-bold text-white ${
                        index === 0 ? 'bg-yellow-500' : 'bg-gray-400'
                      }`}
                      style={{
                        width: `clamp(32px, 3.5vw, 48px)`,
                        height: `clamp(32px, 3.5vw, 48px)`,
                      }}
                    >
                      {index + 1}
                    </div>

                    {/* Player Info */}
                    <div className="flex-1 text-left">
                      <div
                        className="flex items-center"
                        style={{ gap: `clamp(6px, 0.6vw, 10px)` }}
                      >
                        <span
                          className="font-semibold truncate"
                          style={{ fontSize: `clamp(13px, 1.3vw, 16px)` }}
                        >
                          {playerName}
                        </span>
                        {isBot && (
                          <span
                            className="bg-purple-500 text-white rounded-full"
                            style={{
                              fontSize: `clamp(9px, 0.85vw, 11px)`,
                              padding: `clamp(2px, 0.2vh, 3px) clamp(6px, 0.6vw, 10px)`,
                            }}
                          >
                            AI
                          </span>
                        )}
                        {isCurrentUser && !isBot && (
                          <span
                            className="bg-green-500 text-white rounded-full"
                            style={{
                              fontSize: `clamp(9px, 0.85vw, 11px)`,
                              padding: `clamp(2px, 0.2vh, 3px) clamp(6px, 0.6vw, 10px)`,
                            }}
                          >
                            You
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Ready Status */}
                    <div
                      className="text-green-500"
                      style={{ fontSize: `clamp(16px, 1.6vw, 24px)` }}
                    >
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: `clamp(12px, 1.2vh, 20px)` }}>
            <button
              onClick={() => {
                soundManager.play('click')
                onStartGame()
              }}
              disabled={playerCount < 1}
              className="btn btn-success animate-bounce-in disabled:opacity-50 disabled:cursor-not-allowed w-full shadow-xl hover:shadow-2xl transition-shadow"
              style={{
                fontSize: `clamp(16px, 1.6vw, 24px)`,
                padding: `clamp(12px, 1.2vh, 20px) clamp(32px, 3.2vw, 52px)`,
              }}
            >
              <span style={{ fontSize: `clamp(20px, 2vw, 28px)`, marginRight: `clamp(6px, 0.6vw, 10px)` }}>🎮</span>
              Start Yahtzee Game
            </button>
            
            {playerCount === 1 && !hasBot && (
              <div
                className="bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-600 rounded-lg"
                style={{ padding: `clamp(10px, 1vh, 16px)` }}
              >
                <p
                  className="text-blue-700 dark:text-blue-300"
                  style={{ fontSize: `clamp(11px, 1vw, 14px)` }}
                >
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
                className="btn btn-secondary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  fontSize: `clamp(14px, 1.4vw, 20px)`,
                  padding: `clamp(10px, 1vh, 16px) clamp(24px, 2.4vw, 40px)`,
                }}
                title={!canAddMorePlayers ? 'Lobby is full' : 'Add AI opponent'}
              >
                <span style={{ fontSize: `clamp(16px, 1.6vw, 24px)`, marginRight: `clamp(6px, 0.6vw, 10px)` }}>🤖</span>
                Add Bot Player
                {canAddMorePlayers && (
                  <span style={{ marginLeft: `clamp(6px, 0.6vw, 10px)`, fontSize: `clamp(11px, 1vw, 14px)`, opacity: 0.75 }}>
                    ({playerCount}/{lobby?.maxPlayers || 4})
                  </span>
                )}
              </button>
            )}
          </div>
        ) : (
          <div
            className="bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-600 rounded-xl"
            style={{
              borderWidth: `clamp(1.5px, 0.15vw, 2.5px)`,
              padding: `clamp(20px, 2vh, 32px)`,
            }}
          >
            <div
              className="flex items-center justify-center"
              style={{
                gap: `clamp(10px, 1vw, 16px)`,
                marginBottom: `clamp(10px, 1vh, 16px)`,
              }}
            >
              <span
                className="animate-bounce"
                style={{ fontSize: `clamp(24px, 2.5vw, 36px)` }}
              >⌛</span>
              <p
                className="text-blue-700 dark:text-blue-300 font-bold"
                style={{ fontSize: `clamp(16px, 1.6vw, 24px)` }}
              >
                Waiting for host to start...
              </p>
            </div>
            <p
              className="text-blue-600 dark:text-blue-400"
              style={{ fontSize: `clamp(11px, 1vw, 14px)` }}
            >
              Host: <span className="font-semibold">{lobby?.creator?.username || lobby?.creator?.email || 'Unknown'}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
