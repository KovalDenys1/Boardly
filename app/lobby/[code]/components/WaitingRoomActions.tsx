import LoadingSpinner from '@/components/LoadingSpinner'
import { sounds } from '@/lib/sounds'
import { hasBotSupport } from '@/lib/game-catalog'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import type { Game, Lobby, GamePlayer } from '@/types/game'

interface WaitingRoomActionsProps {
  game: Game | null
  lobby: Lobby
  minPlayers: number
  canStartGame: boolean
  startingGame: boolean
  onStartGame: () => void
}

export default function WaitingRoomActions({
  game,
  lobby,
  minPlayers,
  canStartGame,
  startingGame,
  onStartGame,
}: WaitingRoomActionsProps) {
  const { t } = useTranslation()

  const playerCount = game?.players?.length || 0
  const maxPlayers = lobby?.maxPlayers || 4
  const hasBot = game?.players?.some((p: GamePlayer) => !!p.user?.bot)
  const supportsBots = hasBotSupport(lobby.gameType)
  const canAddMorePlayers = playerCount < maxPlayers
  const canStartWithAutoBot = supportsBots && !hasBot && playerCount > 0 && playerCount < minPlayers && canAddMorePlayers
  const canStartImmediately = playerCount >= minPlayers || canStartWithAutoBot
  const isAloneAndCanStart = playerCount === 1 && canStartImmediately
  const creatorName = lobby?.creator?.username || t('lobby.ownerFallback')

  if (startingGame) {
    return (
      <div className="shrink-0 border-t border-bd-line bg-bd-card-warm px-4 py-5 pb-[max(1.25rem,calc(1.25rem+env(safe-area-inset-bottom)))] sm:px-6">
        <div className="flex items-center justify-center gap-3">
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
    return (
      <div className="shrink-0 border-t border-bd-line bg-bd-card-warm px-4 py-4 pb-[max(1rem,calc(1rem+env(safe-area-inset-bottom)))] sm:px-6">
        <div className="flex items-center gap-3 rounded-xl border border-bd-sun/40 bg-bd-sun/10 px-4 py-3.5">
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

  // Host view — invite/add-bot live inline in the player list's empty slots
  // (WaitingRoom.tsx); this bar only carries lobby status + Start Game.
  return (
    <div className="shrink-0 space-y-3 border-t border-bd-line bg-bd-card-warm px-4 py-4 pb-[max(1rem,calc(1rem+env(safe-area-inset-bottom)))] sm:px-6">
      {!canAddMorePlayers && (
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

      {/* Status hint */}
      {!canStartImmediately && (
        <p className="text-center text-xs text-bd-sun-deep">
          {t('game.ui.needMorePlayers', { count: Math.max(minPlayers - playerCount, 0) })}
        </p>
      )}

      {/* A host sitting alone can already start — a bot is added automatically,
          or the game allows one player. Nothing said so, so 193 of 221 lobbies
          that never started had exactly one person in them, and not one of them
          used the add-bot action buried in the empty player slot (#814). */}
      {isAloneAndCanStart && (
        <p className="text-center text-xs font-semibold text-bd-mint-deep">
          {canStartWithAutoBot ? t('game.ui.botAutoAddTip') : t('game.ui.startSoloTip')}
        </p>
      )}

      {/* Start Game */}
      <button
        onClick={() => {
          sounds.play('click')
          onStartGame()
        }}
        disabled={!canStartImmediately}
        className="bd-btn bd-btn-primary w-full justify-center px-5 py-3.5 text-base transition-transform active:scale-[0.98] active:transform-none! disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span className="inline-flex items-center justify-center gap-2">
          <Icon name="play" size={18} />
          <span>{t('game.ui.startGame')}</span>
        </span>
      </button>
    </div>
  )
}
