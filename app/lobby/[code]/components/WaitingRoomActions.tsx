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
  const creatorName = lobby?.creator?.username || t('lobby.ownerFallback')
  const difficultyLabelMap: Record<BotDifficulty, string> = {
    easy: t('game.ui.botDifficultyEasy'),
    medium: t('game.ui.botDifficultyMedium'),
    hard: t('game.ui.botDifficultyHard'),
  }

  if (startingGame) {
    return (
      <div className="flex-shrink-0 border-t border-bd-line bg-bd-card-warm px-4 py-5 pb-[max(1.25rem,calc(1.25rem+env(safe-area-inset-bottom)))] sm:px-6">
        <div className="flex items-center justify-center gap-3">
          {/* Sun-colored loading badge */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-bd-ink bg-bd-sun shadow-[2px_2px_0_var(--bd-ink)]">
            <LoadingSpinner size="sm" />
          </div>
          <div>
            <p className="font-bold text-sm text-bd-ink">{t('game.ui.startingGame')}</p>
            <p className="mt-0.5 text-xs text-bd-ink-muted">
              {playerCount === 1 ? t('game.ui.addingBot') : t('game.ui.preparingDice')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (!canStartGame) {
    // Non-host view — warm amber pulse dot
    return (
      <div className="flex-shrink-0 border-t border-bd-line bg-bd-card-warm px-4 py-4 pb-[max(1rem,calc(1rem+env(safe-area-inset-bottom)))] sm:px-6">
        <div className="flex items-center gap-3 rounded-xl border border-bd-sun/40 bg-bd-sun/10 px-4 py-3.5">
          {/* Pulsing amber dot */}
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-bd-sun opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-bd-sun" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-bd-ink">{t('game.ui.waitingForHost')}</p>
            <p className="mt-0.5 text-xs text-bd-ink-muted">
              {t('game.ui.host')}: <span className="font-semibold text-bd-ink-soft">{creatorName}</span>
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Host view
  return (
    <div className="flex-shrink-0 space-y-3 border-t border-bd-line bg-bd-card-warm px-4 py-4 pb-[max(1rem,calc(1rem+env(safe-area-inset-bottom)))] sm:px-6">
      {/* Bot tip */}
      {supportsBots && playerCount === 1 && !hasBot && (
        <div className="rounded-xl border border-bd-sky/35 bg-bd-sky/10 px-3 py-2">
          <p className="text-xs text-bd-ink-soft">
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
                className="bd-btn bd-btn-soft flex-1 justify-center px-3 py-2.5 text-sm"
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
                className="bd-btn bd-btn-soft flex-1 justify-center px-3 py-2.5 text-sm"
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
        <div className="flex items-center justify-between rounded-xl border border-bd-mint/45 bg-bd-mint/15 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-bd-mint opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-bd-mint" />
            </span>
            <span className="text-sm font-semibold text-bd-mint-deep">{t('game.ui.lobbyFull')}</span>
          </div>
          <span className="text-xs text-bd-mint-deep/75">{playerCount}/{maxPlayers}</span>
        </div>
      )}

      {/* Bot difficulty — segmented control */}
      {canConfigureBots && (
        <div className="rounded-xl border border-bd-line bg-bd-card-warm px-3 py-2.5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-bd-ink-muted">{t('game.ui.botDifficulty')}</p>
          {/* Single container, shared border, no gaps between segments */}
          <div className="flex rounded-lg border border-bd-line bg-bd-bg2 p-0.5">
            {BOT_DIFFICULTIES.map((difficulty) => (
              <button
                key={difficulty}
                type="button"
                onClick={() => {
                  sounds.play('click')
                  onBotDifficultyChange(difficulty)
                }}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-all ${
                  botDifficulty === difficulty
                    ? 'bg-bd-ink text-bd-bg shadow-sm'
                    : 'text-bd-ink-soft hover:text-bd-ink'
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
        <p className="text-center text-xs text-bd-sun-deep">
          {t('game.ui.needMorePlayers', { count: Math.max(minPlayers - playerCount, 0) })}
        </p>
      )}

      {/* Primary: Start Game */}
      <button
        onClick={() => {
          sounds.play('click')
          onStartGame()
        }}
        disabled={!canStartImmediately}
        className="bd-btn bd-btn-primary w-full justify-center px-5 py-3.5 text-base transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span className="inline-flex items-center justify-center gap-2">
          <span className="text-xl">▶</span>
          <span>{t('game.ui.startGame')}</span>
        </span>
      </button>
    </div>
  )
}
