import PlayerList from '@/components/PlayerList'
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
      <div className="space-y-4">
        {/* Player List - keep visible during loading */}
        {game?.players && game.players.length > 0 && (
          <PlayerList
            players={game.players.map((p: any) => ({
              id: p.id,
              userId: p.userId,
              user: {
                username: p.user.username,
                email: p.user.email,
              },
              score: 0,
              position: p.position || game.players.indexOf(p),
              isReady: true,
            }))}
            currentTurn={-1}
            currentUserId={getCurrentUserId() || undefined}
          />
        )}

        {/* Loading Card */}
        <div className="card text-center animate-scale-in">
          <div className="flex flex-col items-center justify-center py-12">
            <LoadingSpinner size="lg" />
            <h3 className="text-2xl font-bold mt-6 mb-2">Starting Game...</h3>
            <p className="text-gray-600 dark:text-gray-400">
              {playerCount === 1 ? '🤖 Adding bot player...' : '🎲 Preparing the dice...'}
            </p>
            <div className="mt-6 flex items-center gap-2 text-sm text-gray-500">
              <div className="animate-pulse">⏳</div>
              <span>This will only take a moment</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Player List */}
      {game?.players && game.players.length > 0 && (
        <PlayerList
          players={game.players.map((p: any) => ({
            id: p.id,
            userId: p.userId,
            user: {
              username: p.user.username,
              email: p.user.email,
            },
            score: 0, // Game not started yet
            position: p.position || game.players.indexOf(p),
            isReady: true,
          }))}
          currentTurn={-1} // No turns before game starts
          currentUserId={getCurrentUserId() || undefined}
        />
      )}

      {/* Ready to Play Card */}
      <div className="card text-center animate-scale-in">
        <div className="mb-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 mb-4">
            <span className="text-4xl">🎲</span>
          </div>
          <h2 className="text-3xl font-bold mb-2">
            Ready to Play Yahtzee?
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-2">
            {playerCount} player(s) in lobby
          </p>
          {playerCount < 2 ? (
            <p className="text-sm text-yellow-600 dark:text-yellow-400 mb-4">
              You're the only player right now. Add a bot or wait for others to join.
            </p>
          ) : (
            <p className="text-sm text-green-600 dark:text-green-400 mb-4">
              ✅ Ready to start!
            </p>
          )}
          <p className="text-sm text-gray-500 dark:text-gray-500">
            Roll the dice, score big, and have fun!
          </p>
        </div>

        {canStartGame ? (
          <div className="space-y-4">
            <button
              onClick={() => {
                soundManager.play('click')
                onStartGame()
              }}
              disabled={playerCount < 1}
              className="btn btn-success text-lg px-8 py-3 animate-bounce-in disabled:opacity-50 disabled:cursor-not-allowed w-full"
            >
              🎮 Start Yahtzee Game
            </button>
            {playerCount === 1 && !hasBot && (
              <p className="text-xs text-gray-500 text-center">
                💡 Tip: A bot will be auto-added when you start if you're still alone
              </p>
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
                🤖 Add Bot Player
              </button>
            )}
          </div>
        ) : (
          <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-300 dark:border-blue-600 rounded-lg p-4">
            <p className="text-blue-700 dark:text-blue-300 font-semibold">
              ⏳ Waiting for host to start the game...
            </p>
            <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
              Host: {lobby?.creator?.username || lobby?.creator?.email || 'Unknown'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
