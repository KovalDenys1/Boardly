import { useTranslation } from '@/lib/i18n-helpers'
import type { Game, Lobby, GamePlayer } from '@/types/game'
import type { GameEngine } from '@/lib/game-engine'
import type { BotDifficulty } from '@/lib/bot-profiles'
import { getLobbyTheme, type LobbyTheme } from '@/lib/lobby-themes'
import LobbyThemeBanner, { RICH_BANNER_THEMES } from '@/components/LobbyThemeBanner'

interface WaitingRoomProps {
  game: Game | null
  lobby: Lobby
  gameEngine: GameEngine | null
  minPlayers: number
  getCurrentUserId: () => string | null | undefined
  canManageBots?: boolean
  canKickPlayers?: boolean
  onKickBot?: (botPlayerId: string) => void
  onKickPlayer?: (playerId: string) => void
  onProfileClick?: (userId: string) => void
}

export default function WaitingRoom({
  game,
  lobby,
  minPlayers,
  getCurrentUserId,
  canManageBots,
  canKickPlayers,
  onKickBot,
  onKickPlayer,
  onProfileClick,
}: WaitingRoomProps) {
  const { t } = useTranslation()

  const playerCount = game?.players?.length || 0
  const maxPlayers = lobby?.maxPlayers || 4
  const openSlots = Math.max(maxPlayers - playerCount, 0)
  const missingPlayers = Math.max(minPlayers - playerCount, 0)
  const lobbyTheme = getLobbyTheme(lobby?.theme)
  const hasCustomTheme = lobby?.theme && lobby.theme !== 'default'

  return (
    <div className="space-y-2 px-4 py-4 sm:px-6">
      {/* Theme banner */}
      {hasCustomTheme && (
        <LobbyThemeBanner theme={lobby.theme as LobbyTheme} />
      )}

      {/* Players */}
      {game?.players?.map((p: GamePlayer, index: number) => {
        const isBot = !!p.user?.bot
        const playerName = p.user?.username || p.name || (isBot ? t('game.ui.aiBot') : t('game.ui.player'))
        const isCurrentUser = p.userId === getCurrentUserId()
        const isPremium = !isBot && !!(p.user as { isPremium?: boolean } | undefined)?.isPremium
        const botDifficulty = p.user?.bot?.difficulty as BotDifficulty | undefined
        const difficultyLabel = botDifficulty ? t(`game.ui.botDifficulty${botDifficulty.charAt(0).toUpperCase() + botDifficulty.slice(1)}` as Parameters<typeof t>[0]) : null
        const avatarSrc = p.user?.avatarUrl ?? p.user?.image ?? null
        const canClickProfile = onProfileClick && !isBot

        // Colored ring classes for avatar
        const avatarRingClass = isCurrentUser
          ? 'ring-2 ring-bd-mint ring-offset-2 ring-offset-bd-card-warm'
          : isBot
            ? 'ring-2 ring-bd-lav ring-offset-2 ring-offset-bd-card-warm'
            : ''

        return (
          <div
            key={p.id}
            onClick={canClickProfile ? () => onProfileClick(p.userId) : undefined}
            role={canClickProfile ? 'button' : undefined}
            className={`flex items-center gap-3 rounded-xl border px-3 py-4 sm:px-4 ${
              isCurrentUser
                ? 'border-bd-mint/45 bg-bd-mint/15'
                : isBot
                  ? 'border-bd-lav/35 bg-bd-lav/10'
                  : 'border-bd-line bg-bd-card-warm'
            } ${canClickProfile ? 'cursor-pointer transition-colors hover:border-bd-ink hover:bg-bd-card-warm' : ''}`}
          >
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt={playerName}
                className={`h-11 w-11 shrink-0 rounded-xl border-2 border-bd-ink object-cover shadow-[2px_2px_0_var(--bd-ink)] ${avatarRingClass}`}
              />
            ) : (
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-bd-ink bg-bd-sun text-sm font-extrabold text-bd-ink shadow-[2px_2px_0_var(--bd-ink)] ${avatarRingClass}`}>
                {index + 1}
              </div>
            )}

            <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5">
              <span className={`truncate text-sm font-bold ${isPremium ? 'text-bd-premium' : 'text-bd-ink'}`}>{playerName}</span>
              {isPremium && (
                <span className="shrink-0 text-[11px]" title="Premium">👑</span>
              )}
              {isCurrentUser && !isBot && (
                <span className="rounded-full bg-bd-mint px-1.5 py-0.5 text-[10px] font-bold text-bd-mint-deep">
                  {t('game.ui.you')}
                </span>
              )}
              {isBot && (
                <span className="rounded-full bg-bd-lav px-1.5 py-0.5 text-[10px] font-bold text-white">
                  AI
                </span>
              )}
              {isBot && difficultyLabel && (
                <span className="rounded-full bg-bd-bg2 px-1.5 py-0.5 text-[10px] font-bold text-bd-ink-soft">
                  {difficultyLabel}
                </span>
              )}
            </div>

            {/* Kick bot button */}
            {isBot && canManageBots && onKickBot && (
              <button
                onClick={() => onKickBot(p.id)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-bd-ink-muted transition-all hover:bg-bd-coral/15 hover:text-bd-coral-deep"
                title="Remove bot"
              >
                ✕
              </button>
            )}
            {/* Kick player button */}
            {!isBot && !isCurrentUser && canKickPlayers && onKickPlayer && (
              <button
                onClick={(e) => { e.stopPropagation(); onKickPlayer(p.id) }}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-bd-ink-muted transition-all hover:bg-bd-coral/15 hover:text-bd-coral-deep"
                title={t('game.ui.kickPlayer')}
              >
                ✕
              </button>
            )}
          </div>
        )
      })}

      {/* Empty slots */}
      {Array.from({ length: openSlots }).map((_, i) => {
        const isRequired = i < missingPlayers
        const isPulse = isRequired && i === 0
        return (
          <div
            key={`empty-${i}`}
            className="flex items-center gap-3 rounded-xl border border-dashed border-bd-line bg-bd-bg2/60 px-3 py-4 sm:px-4"
          >
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-dashed text-sm font-bold ${
              isPulse
                ? 'animate-pulse border-bd-sun/60 bg-bd-sun/10 text-bd-sun-deep'
                : 'border-bd-line bg-bd-bg2 text-bd-ink-muted'
            }`}>
              {playerCount + i + 1}
            </div>
            <span className={`text-sm italic ${isRequired ? 'text-bd-ink-soft' : 'text-bd-ink-muted'}`}>
              {isRequired ? t('game.ui.waitingForPlayer') : t('game.ui.openSlot')}
            </span>
          </div>
        )
      })}
    </div>
  )
}
