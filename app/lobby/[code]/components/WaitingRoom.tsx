import LoadingSpinner from '@/components/LoadingSpinner'
import { soundManager } from '@/lib/sounds'
import { hasBotSupport } from '@/lib/game-registry'
import { BOT_DIFFICULTIES, type BotDifficulty } from '@/lib/bot-profiles'
import { useTranslation } from '@/lib/i18n-helpers'

interface WaitingRoomProps {
  game: any
  lobby: any
  gameEngine: any
  minPlayers: number
  botDifficulty: BotDifficulty
  canStartGame: boolean
  startingGame: boolean
  onStartGame: () => void
  onAddBot: () => void
  onBotDifficultyChange: (difficulty: BotDifficulty) => void
  onInviteFriends?: () => void
  getCurrentUserId: () => string | null | undefined
}

export default function WaitingRoom({
  game,
  lobby,
  gameEngine,
  minPlayers,
  botDifficulty,
  canStartGame,
  startingGame,
  onStartGame,
  onAddBot,
  onBotDifficultyChange,
  onInviteFriends,
  getCurrentUserId,
}: WaitingRoomProps) {
  const { t } = useTranslation()
  const playerCount = game?.players?.length || 0
  const hasBot = game?.players?.some((p: any) => !!p.user?.bot)
  const canAddMorePlayers = playerCount < (lobby?.maxPlayers || 4)
  const canConfigureBots = hasBotSupport(lobby.gameType) && canAddMorePlayers
  const difficultyLabelMap: Record<BotDifficulty, string> = {
    easy: t('game.ui.botDifficultyEasy'),
    medium: t('game.ui.botDifficultyMedium'),
    hard: t('game.ui.botDifficultyHard'),
  }

  // Show loading overlay when starting game
  if (startingGame) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <h3 className="text-2xl font-extrabold text-white mt-6 mb-2 drop-shadow-lg">
            {t('game.ui.startingGame')}
          </h3>
          <p className="text-white/60 text-sm">
            {playerCount === 1 ? t('game.ui.addingBot') : t('game.ui.preparingDice')}
          </p>
          <div className="flex items-center justify-center gap-2 mt-4 text-white/40 text-sm">
            <div className="animate-pulse">⏳</div>
            <span>{t('game.ui.willTakeAMoment')}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto w-full px-4 py-6 space-y-6">
        {/* Header Section */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/15 backdrop-blur-sm mb-4 animate-pulse shadow-2xl">
            <span className="text-5xl">🎲</span>
          </div>
          <h2 className="text-3xl font-extrabold text-white mb-2 drop-shadow-lg">
            {t('game.ui.readyToPlay')}
          </h2>
          <p className="text-white/70 text-sm">
            {t('game.ui.addBotOrWait')}
          </p>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {/* Player Count Card */}
          <div
            className={`bg-white/10 backdrop-blur-md border rounded-2xl p-4 ${
              playerCount < minPlayers
                ? 'border-yellow-400/30'
                : 'border-green-400/30'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${
                playerCount < minPlayers
                  ? 'bg-yellow-500/20'
                  : 'bg-green-500/20'
              }`}>
                <span className="text-2xl">👥</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-bold text-sm mb-1 ${
                  playerCount < minPlayers ? 'text-yellow-200' : 'text-green-200'
                }`}>
                  {t('game.ui.playersInLobby', { count: playerCount })}
                </p>
                {playerCount < minPlayers ? (
                  <p className="text-xs text-white/60">
                    Need {minPlayers - playerCount} more player{minPlayers - playerCount === 1 ? '' : 's'} to start
                  </p>
                ) : (
                  <p className="text-xs text-white/60">
                    {t('game.ui.readyToStart')}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Turn Timer Card */}
          {lobby?.turnTimer && (
            <div className="bg-white/10 backdrop-blur-md border border-blue-400/30 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                  <span className="text-2xl">⏱️</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-blue-200 mb-1">
                    {lobby.turnTimer}s {t('game.ui.perTurn')}
                  </p>
                  <p className="text-xs text-white/60">
                    {t('game.ui.timeLimit')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Players List */}
        {game?.players && game.players.length > 0 && (
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-5 mb-6">
            <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-4">
              {t('game.ui.playersInLobbyTitle')}
            </h3>
            <div className="flex flex-col gap-3">
              {game.players.map((p: any, index: number) => {
                const isBot = !!p.user?.bot
                const playerName = p.user.name || p.user.username || p.user.email || (isBot ? t('game.ui.aiBot') : t('game.ui.player'))
                const isCurrentUser = p.userId === getCurrentUserId()
                const botDifficultyValue = p.user?.bot?.difficulty as BotDifficulty | undefined
                const botDifficultyLabel = botDifficultyValue
                  ? difficultyLabelMap[botDifficultyValue]
                  : null

                return (
                  <div
                    key={p.id}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-all ${
                      isCurrentUser
                        ? 'bg-green-500/15 border border-green-400/40'
                        : isBot
                        ? 'bg-purple-500/15 border border-purple-400/40'
                        : 'bg-white/5 border border-white/10'
                    }`}
                  >
                    {/* Position */}
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white ${
                        index === 0 ? 'bg-yellow-500' : 'bg-white/20'
                      }`}
                    >
                      {index + 1}
                    </div>

                    {/* Player Info */}
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white text-sm truncate">
                          {playerName}
                        </span>
                        {isBot && (
                          <span className="bg-purple-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                            AI
                          </span>
                        )}
                        {isBot && botDifficultyLabel && (
                          <span className="bg-indigo-500/80 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                            {botDifficultyLabel}
                          </span>
                        )}
                        {isCurrentUser && !isBot && (
                          <span className="bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                            {t('game.ui.you')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Ready Status */}
                    <span className="text-green-400 text-lg">✓</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Action Section */}
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-5">
        {canStartGame ? (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => {
                soundManager.play('click')
                onStartGame()
              }}
              disabled={playerCount < minPlayers}
              className="w-full px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-bold text-lg shadow-2xl hover:shadow-blue-500/50 hover:scale-[1.02] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:from-gray-600 disabled:to-gray-700"
            >
              <span className="mr-2 text-xl">🎮</span>
              {t('game.ui.startGame')}
            </button>

            {hasBotSupport(lobby.gameType) && playerCount === 1 && !hasBot && (
              <div className="bg-blue-500/10 border border-blue-400/30 rounded-xl px-4 py-2.5">
                <p className="text-blue-200 text-xs">
                  💡 <strong>{t('game.ui.tip')}:</strong> {t('game.ui.botAutoAddTip')}
                </p>
              </div>
            )}

            {canConfigureBots && (
              <div className="bg-white/5 border border-white/15 rounded-xl px-4 py-3">
                <p className="text-white/80 text-xs font-semibold uppercase tracking-wide mb-2">
                  {t('game.ui.botDifficulty')}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {BOT_DIFFICULTIES.map((difficulty) => (
                    <button
                      key={difficulty}
                      type="button"
                      onClick={() => {
                        soundManager.play('click')
                        onBotDifficultyChange(difficulty)
                      }}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                        botDifficulty === difficulty
                          ? 'bg-blue-500/80 border-blue-300 text-white shadow'
                          : 'bg-white/5 border-white/20 text-white/80 hover:bg-white/15'
                      }`}
                      aria-pressed={botDifficulty === difficulty}
                    >
                      {difficultyLabelMap[difficulty]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Add Bot Button */}
            {hasBotSupport(lobby.gameType) && canAddMorePlayers && (
              <button
                onClick={() => {
                  soundManager.play('click')
                  onAddBot()
                }}
                disabled={!canAddMorePlayers}
                className="w-full px-6 py-3.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed border border-white/20"
                title={!canAddMorePlayers ? t('game.ui.lobbyFull') : t('game.ui.addAiOpponent')}
              >
                <span className="mr-2 text-lg">🤖</span>
                {t('game.ui.addBotPlayer')}
                <span className="ml-2 text-xs opacity-80">
                  ({difficultyLabelMap[botDifficulty]})
                </span>
                {canAddMorePlayers && (
                  <span className="ml-2 text-xs opacity-60">
                    ({playerCount}/{lobby?.maxPlayers || 4})
                  </span>
                )}
              </button>
            )}

            {/* Invite Friends Button */}
            {onInviteFriends && canAddMorePlayers && (
              <button
                onClick={() => {
                  soundManager.play('click')
                  onInviteFriends()
                }}
                disabled={!canAddMorePlayers}
                className="w-full px-6 py-3.5 bg-white/20 hover:bg-white/30 text-white rounded-xl font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed border border-white/20"
                title={!canAddMorePlayers ? t('game.ui.lobbyFull') : t('game.ui.inviteFriendsToJoin')}
              >
                <span className="mr-2 text-lg">👥</span>
                {t('game.ui.inviteFriends')}
                {canAddMorePlayers && (
                  <span className="ml-2 text-xs opacity-60">
                    ({playerCount}/{lobby?.maxPlayers || 4})
                  </span>
                )}
              </button>
            )}
          </div>
        ) : (
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="text-2xl animate-bounce">⌛</span>
              <p className="text-white font-bold text-base">
                {t('game.ui.waitingForHost')}
              </p>
            </div>
            <p className="text-white/60 text-sm">
              {t('game.ui.host')}: <span className="font-semibold text-white/80">{lobby?.creator?.username || lobby?.creator?.email || 'Unknown'}</span>
            </p>
          </div>
        )}
        </div>
      </div>
  )
}
