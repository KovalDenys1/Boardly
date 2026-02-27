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
  const maxPlayers = lobby?.maxPlayers || 4
  const openSlots = Math.max(maxPlayers - playerCount, 0)
  const missingPlayers = Math.max(minPlayers - playerCount, 0)
  const hasBot = game?.players?.some((p: any) => !!p.user?.bot)
  const supportsBots = hasBotSupport(lobby.gameType)
  const canAddMorePlayers = playerCount < maxPlayers
  const canConfigureBots = supportsBots && canAddMorePlayers
  const canStartWithAutoBot = supportsBots && !hasBot && playerCount > 0 && playerCount < minPlayers && canAddMorePlayers
  const canStartImmediately = playerCount >= minPlayers || canStartWithAutoBot
  const creatorName = lobby?.creator?.username || lobby?.creator?.email || t('lobby.ownerFallback')
  const occupancyPercent = Math.min(100, Math.round((playerCount / Math.max(maxPlayers, 1)) * 100))
  const quickRuleByGameType: Record<string, string> = {
    yahtzee: t('game.ui.howToPlayRuleYahtzee'),
    guess_the_spy: t('game.ui.howToPlayRuleSpy'),
    tic_tac_toe: t('game.ui.howToPlayRuleTicTacToe'),
    rock_paper_scissors: t('game.ui.howToPlayRuleRps'),
  }
  const quickRule = quickRuleByGameType[lobby?.gameType as string] || t('game.ui.howToPlayRuleFallback')
  const difficultyLabelMap: Record<BotDifficulty, string> = {
    easy: t('game.ui.botDifficultyEasy'),
    medium: t('game.ui.botDifficultyMedium'),
    hard: t('game.ui.botDifficultyHard'),
  }

  // Show loading overlay when starting game
  if (startingGame) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl px-8 py-10 text-center max-w-md w-full">
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
    <div className="max-w-5xl mx-auto w-full px-1 py-4 space-y-5">
      <section className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white/80 mb-3">
              <span>{canStartImmediately ? '🟢' : '🟡'}</span>
              <span>{canStartImmediately ? t('game.ui.readyToStart') : t('game.ui.waiting')}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-1">{t('game.ui.readyToPlay')}</h2>
            <p className="text-sm text-white/70">
              {canStartImmediately ? t('game.ui.addBotOrWait') : t('game.ui.needMorePlayers', { count: missingPlayers })}
            </p>
          </div>

          <div className="w-full lg:w-80 rounded-xl border border-white/20 bg-white/5 p-3">
            <div className="flex items-center justify-between text-xs text-white/70 mb-2">
              <span>{t('game.ui.playersInLobbyTitle')}</span>
              <span>
                {playerCount}/{maxPlayers}
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/15 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500" style={{ width: `${occupancyPercent}%` }} />
            </div>
            <p className="mt-2 text-xs text-white/65">
              {t('game.ui.availableSlots')}: {openSlots}
            </p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md p-4">
          <p className="text-xs uppercase tracking-wider text-white/55 mb-1">{t('game.ui.playersInLobbyTitle')}</p>
          <p className="text-lg font-bold text-white">{t('game.ui.playersInLobby', { count: playerCount })}</p>
        </div>
        <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md p-4">
          <p className="text-xs uppercase tracking-wider text-white/55 mb-1">{t('game.ui.readyToPlay')}</p>
          <p className="text-lg font-bold text-white">
            {canStartImmediately ? t('game.ui.readyToStart') : t('game.ui.needMorePlayers', { count: missingPlayers })}
          </p>
        </div>
        <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md p-4">
          <p className="text-xs uppercase tracking-wider text-white/55 mb-1">{t('game.ui.timeLimit')}</p>
          <p className="text-lg font-bold text-white">{lobby?.turnTimer ? `${lobby.turnTimer}s ${t('game.ui.perTurn')}` : '—'}</p>
        </div>
        <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md p-4">
          <p className="text-xs uppercase tracking-wider text-white/55 mb-1">{t('game.ui.spectatorsLabel')}</p>
          <p className="text-lg font-bold text-white">
            {lobby?.allowSpectators
              ? t('lobby.spectators', { count: lobby?.spectatorCount ?? 0, max: lobby?.maxSpectators ?? 0 })
              : t('game.ui.spectatorsDisabled')}
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md p-5">
        <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider mb-2">
          {t('game.ui.howToPlayTitle')}
        </h3>
        <p className="text-sm text-white/65 mb-3">{t('game.ui.howToPlayDescription')}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          <div className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white/85">
            1. {t('game.ui.howToPlayReady')}
          </div>
          <div className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white/85">
            2. {quickRule}
          </div>
          <div className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white/85">
            3. {t('game.ui.howToPlayStart')}
          </div>
        </div>
      </section>

      {game?.players && game.players.length > 0 && (
        <section className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white/75 uppercase tracking-wider">{t('game.ui.playersInLobbyTitle')}</h3>
            <span className="text-xs text-white/60">
              {playerCount}/{maxPlayers}
            </span>
          </div>

          <div className="space-y-2.5">
            {game.players.map((p: any, index: number) => {
              const isBot = !!p.user?.bot
              const playerName = p.user.name || p.user.username || p.user.email || (isBot ? t('game.ui.aiBot') : t('game.ui.player'))
              const isCurrentUser = p.userId === getCurrentUserId()
              const botDifficultyValue = p.user?.bot?.difficulty as BotDifficulty | undefined
              const botDifficultyLabel = botDifficultyValue ? difficultyLabelMap[botDifficultyValue] : null

              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 rounded-xl px-3 sm:px-4 py-3 border ${
                    isCurrentUser
                      ? 'bg-emerald-500/15 border-emerald-300/45'
                      : isBot
                        ? 'bg-violet-500/15 border-violet-300/40'
                        : 'bg-white/5 border-white/15'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-bold">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white text-sm truncate">{playerName}</span>
                      {isCurrentUser && !isBot && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/85 text-white">
                          {t('game.ui.you')}
                        </span>
                      )}
                      {isBot && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/85 text-white">
                          AI
                        </span>
                      )}
                      {isBot && botDifficultyLabel && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/80 text-white">
                          {botDifficultyLabel}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-emerald-300 text-lg">✓</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md p-5">
        {canStartGame ? (
          <div className="space-y-4">
            <button
              onClick={() => {
                soundManager.play('click')
                onStartGame()
              }}
              disabled={!canStartImmediately}
              className="w-full px-5 sm:px-8 py-3.5 sm:py-4 bg-gradient-to-r from-blue-600 via-cyan-500 to-teal-500 text-white rounded-xl font-bold text-base sm:text-lg shadow-2xl hover:shadow-cyan-400/40 hover:scale-[1.01] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:from-gray-600 disabled:to-gray-700"
            >
              <span className="inline-flex items-center justify-center gap-2 min-w-0">
                <span className="text-xl shrink-0">🎮</span>
                <span className="truncate">{t('game.ui.startGame')}</span>
              </span>
            </button>

            {supportsBots && playerCount === 1 && !hasBot && (
              <div className="rounded-xl border border-blue-300/35 bg-blue-500/10 px-4 py-3">
                <p className="text-blue-100 text-xs">
                  💡 <strong>{t('game.ui.tip')}:</strong> {t('game.ui.botAutoAddTip')}
                </p>
              </div>
            )}

            {canConfigureBots && (
              <div className="rounded-xl border border-white/20 bg-white/5 px-4 py-3">
                <p className="text-white/80 text-xs font-semibold uppercase tracking-wide mb-2">{t('game.ui.botDifficulty')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                          ? 'bg-cyan-500/80 border-cyan-300 text-white shadow'
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {supportsBots && canAddMorePlayers && (
                <button
                  onClick={() => {
                    soundManager.play('click')
                    onAddBot()
                  }}
                  disabled={!canAddMorePlayers}
                  className="w-full px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed border border-white/20"
                  title={!canAddMorePlayers ? t('game.ui.lobbyFull') : t('game.ui.addAiOpponent')}
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    <span>🤖</span>
                    <span>{t('game.ui.addBotPlayer')}</span>
                  </span>
                </button>
              )}

              {onInviteFriends && canAddMorePlayers && (
                <button
                  onClick={() => {
                    soundManager.play('click')
                    onInviteFriends()
                  }}
                  disabled={!canAddMorePlayers}
                  className="w-full px-4 py-3 bg-white/20 hover:bg-white/30 text-white rounded-xl font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed border border-white/20"
                  title={!canAddMorePlayers ? t('game.ui.lobbyFull') : t('game.ui.inviteFriendsToJoin')}
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    <span>👥</span>
                    <span>{t('game.ui.inviteFriends')}</span>
                  </span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-white/20 bg-white/5 px-4 py-5 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="text-xl">⌛</span>
              <p className="text-white font-bold text-base">{t('game.ui.waitingForHost')}</p>
            </div>
            <p className="text-white/60 text-sm">
              {t('game.ui.host')}: <span className="font-semibold text-white/80">{creatorName}</span>
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
