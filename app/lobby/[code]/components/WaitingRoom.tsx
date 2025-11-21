import PlayerList from '@/components/PlayerList'
import { soundManager } from '@/lib/sounds'

interface WaitingRoomProps {
  game: any
  lobby: any
  gameEngine: any
  canStartGame: boolean
  onStartGame: () => void
  onAddBot: () => void
  getCurrentUserId: () => string | undefined
}

export default function WaitingRoom({
  game,
  lobby,
  gameEngine,
  canStartGame,
  onStartGame,
  onAddBot,
  getCurrentUserId,
}: WaitingRoomProps) {
  const playerCount = game?.players?.length || 0
  const hasBot = game?.players?.some((p: any) => p.user?.isBot)

  return (
    <>
      {/* Player List */}
      {game?.players && game.players.length > 0 && (
        <PlayerList
          players={game.players.map((p: any, index: number) => ({
            id: p.id,
            userId: p.userId,
            user: {
              username: p.user.username,
              email: p.user.email,
            },
            score: gameEngine ? gameEngine.getPlayers()[index]?.score || 0 : 0,
            position: p.position || game.players.indexOf(p),
            isReady: true,
          }))}
          currentTurn={gameEngine?.getState().currentPlayerIndex ?? -1}
          currentUserId={getCurrentUserId() || undefined}
        />
      )}

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
              You're the only human player right now. We'll auto-add an AI opponent once you start.
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
            {playerCount < 2 && (
              <p className="text-xs text-gray-500 text-center">
                An AI bot will join automatically if no other players are present.
              </p>
            )}

            {/* Add Bot Button */}
            {lobby.gameType === 'yahtzee' && playerCount < lobby.maxPlayers && (
              <button
                onClick={() => {
                  soundManager.play('click')
                  onAddBot()
                }}
                disabled={hasBot}
                className="btn btn-secondary text-lg px-8 py-3 w-full disabled:opacity-50 disabled:cursor-not-allowed"
                title={hasBot ? 'Bot already added' : 'Add AI opponent'}
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
    </>
  )
}
