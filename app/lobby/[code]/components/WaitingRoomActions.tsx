import LoadingSpinner from '@/components/LoadingSpinner'
import { sounds } from '@/lib/sounds'
import { hasBotSupport } from '@/lib/game-catalog'
import { BOT_DIFFICULTIES, type BotDifficulty } from '@/lib/bot-profiles'
import { useTranslation } from '@/lib/i18n-helpers'
import type { Game, Lobby, GamePlayer } from '@/types/game'

interface WaitingRoomActionsProps {
  game: Game | null
  lobby: Lobby
  minPlayers: number
  botDifficulty: BotDifficulty
  canStartGame: boolean
  startingGame: boolean
  onStartGame: () => void
  onAddBot: () => void
  onBotDifficultyChange: (difficulty: BotDifficulty) => void
  onInviteFriends?: () => void
}

export default function WaitingRoomActions({
  game,
  lobby,
  minPlayers,
  botDifficulty,
  canStartGame,
  startingGame,
  onStartGame,
  onAddBot,
  onBotDifficultyChange,
  onInviteFriends,
}: WaitingRoomActionsProps) {
  const { t } = useTranslation()

  const playerCount = game?.players?.length || 0
  const maxPlayers = lobby?.maxPlayers || 4
  const hasBot = game?.players?.some((p: GamePlayer) => !!p.user?.bot)
  const supportsBots = hasBotSupport(lobby.gameType)
  const canAddMorePlayers = playerCount < maxPlayers
  const canConfigureBots = supportsBots && canAddMorePlayers
  const canStartWithAutoBot = supportsBots && !hasBot && playerCount > 0 && playerCount < minPlayers && canAddMorePlayers
  const canStartImmediately = playerCount >= minPlayers || canStartWithAutoBot
  const creatorName = lobby?.creator?.username || lobby?.creator?.email || t('lobby.ownerFallback')
  const difficultyLabelMap: Record<BotDifficulty, string> = {
    easy: t('game.ui.botDifficultyEasy'),
    medium: t('game.ui.botDifficultyMedium'),
    hard: t('game.ui.botDifficultyHard'),
  }

  if (startingGame) {
    return (
      <div className="flex-shrink-0 border-t border-white/10 px-3 sm:px-5 py-4">
        <div className="flex items-center justify-center gap-3 text-white">
          <LoadingSpinner size="sm" />
          <div>
            <p className="font-bold text-sm">{t('game.ui.startingGame')}</p>
            <p className="text-white/60 text-xs mt-0.5">
              {playerCount === 1 ? t('game.ui.addingBot') : t('game.ui.preparingDice')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (!canStartGame) {
    // Non-host view
    return (
      <div className="flex-shrink-0 border-t border-white/10 px-3 sm:px-5 py-4">
        <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-4 py-3">
          <span className="text-xl shrink-0">⌛</span>
          <div className="min-w-0">
            <p className="text-white font-bold text-sm">{t('game.ui.waitingForHost')}</p>
            <p className="text-white/55 text-xs mt-0.5">
              {t('game.ui.host')}: <span className="font-semibold text-white/75">{creatorName}</span>
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Host view — secondary actions on top, Start Game pinned at bottom
  return (
    <div className="flex-shrink-0 border-t border-white/10 px-3 sm:px-5 py-4 space-y-3">
      {/* Bot tip */}
      {supportsBots && playerCount === 1 && !hasBot && (
        <div className="rounded-xl border border-blue-300/30 bg-blue-500/10 px-3 py-2">
          <p className="text-blue-100 text-xs">
            💡 <strong>{t('game.ui.tip')}:</strong> {t('game.ui.botAutoAddTip')}
          </p>
        </div>
      )}

      {/* Secondary actions row OR lobby-full badge */}
      {canAddMorePlayers ? (
        (supportsBots || onInviteFriends) && (
          <div className="flex gap-2">
            {supportsBots && (
              <button
                onClick={() => {
                  sounds.play('click')
                  onAddBot()
                }}
                className="flex-1 px-3 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-semibold transition-all text-sm border border-white/20"
              >
                <span className="inline-flex items-center justify-center gap-1.5">
                  <span>🤖</span>
                  <span>{t('game.ui.addBotPlayer')}</span>
                </span>
              </button>
            )}
            {onInviteFriends && (
              <button
                onClick={() => {
                  sounds.play('click')
                  onInviteFriends()
                }}
                className="flex-1 px-3 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-semibold transition-all text-sm border border-white/20"
              >
                <span className="inline-flex items-center justify-center gap-1.5">
                  <span>👥</span>
                  <span>{t('game.ui.inviteFriends')}</span>
                </span>
              </button>
            )}
          </div>
        )
      ) : (
        <div className="flex items-center justify-between rounded-xl border border-emerald-300/30 bg-emerald-500/10 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
            <span className="text-emerald-200 text-sm font-semibold">{t('game.ui.lobbyFull')}</span>
          </div>
          <span className="text-emerald-300/70 text-xs">{playerCount}/{maxPlayers}</span>
        </div>
      )}

      {/* Bot difficulty — for next bot to be added */}
      {canConfigureBots && (
        <div className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5">
          <p className="text-white/60 text-[11px] font-semibold uppercase tracking-wide mb-2">{t('game.ui.botDifficulty')}</p>
          <div className="grid grid-cols-3 gap-2">
            {BOT_DIFFICULTIES.map((difficulty) => (
              <button
                key={difficulty}
                type="button"
                onClick={() => {
                  sounds.play('click')
                  onBotDifficultyChange(difficulty)
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
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

      {/* Status hint */}
      {!canStartImmediately && (
        <p className="text-xs text-amber-200/70 text-center">
          {t('game.ui.needMorePlayers', { count: Math.max(minPlayers - playerCount, 0) })}
        </p>
      )}

      {/* Primary: Start Game — always at the bottom */}
      <button
        onClick={() => {
          sounds.play('click')
          onStartGame()
        }}
        disabled={!canStartImmediately}
        className="w-full px-5 py-3.5 bg-gradient-to-r from-blue-600 via-cyan-500 to-teal-500 text-white rounded-xl font-bold text-base shadow-2xl hover:shadow-cyan-400/40 hover:scale-[1.01] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:from-gray-600 disabled:to-gray-700"
      >
        <span className="inline-flex items-center justify-center gap-2">
          <span className="text-xl">🎮</span>
          <span>{t('game.ui.startGame')}</span>
        </span>
      </button>
    </div>
  )
}
