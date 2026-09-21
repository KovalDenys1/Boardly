import { Fragment, useState } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon, type IconName } from '@/components/icons'
import type { Game, Lobby, GamePlayer } from '@/types/game'
import type { GameEngine } from '@/lib/game-engine'
import { BOT_DIFFICULTIES, type BotDifficulty } from '@/lib/bot-profiles'
import { getLobbyTheme, type LobbyTheme } from '@/lib/lobby-themes'
import { hasBotSupport } from '@/lib/game-catalog'
import { sounds } from '@/lib/sounds'
import { useInviteShare } from '@/hooks/useInviteShare'
import LobbyThemeBanner, { RICH_BANNER_THEMES } from '@/components/LobbyThemeBanner'
import TryBotGamesBanner from './TryBotGamesBanner'
import WaitingRoomDiscordHint from './WaitingRoomDiscordHint'
import WaitingRoomGuide, { type KickedPlayer } from './WaitingRoomGuide'
import { toAnalyticsGameType } from '@/lib/analytics'

const BOT_DIFFICULTY_ICON: Record<BotDifficulty, IconName> = {
  easy: 'bot-easy',
  medium: 'bot-medium',
  hard: 'bot-hard',
}

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
  onInviteFriends?: () => void
  onAddBot?: (difficulty: BotDifficulty) => Promise<void> | void
  /** Host-only; the list is not sent to anyone else. */
  kickedPlayers?: KickedPlayer[]
  onUnkickPlayer?: (userId: string) => void
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
  onInviteFriends,
  onAddBot,
  kickedPlayers,
  onUnkickPlayer,
}: WaitingRoomProps) {
  const { t } = useTranslation()
  const shareInvite = useInviteShare(lobby?.code)
  const [pickingBotDifficulty, setPickingBotDifficulty] = useState(false)
  const [addingBot, setAddingBot] = useState(false)

  const playerCount = game?.players?.length || 0
  const maxPlayers = lobby?.maxPlayers || 4
  const openSlots = Math.max(maxPlayers - playerCount, 0)
  const missingPlayers = Math.max(minPlayers - playerCount, 0)
  const lobbyTheme = getLobbyTheme(lobby?.theme)
  const hasCustomTheme = lobby?.theme && lobby.theme !== 'default'
  const showTryBotGames = missingPlayers > 0 && !!game?.createdAt && !hasBotSupport(lobby?.gameType)
  // The one case the Discord line is for: nobody else has arrived and it is the host's
  // lobby to fill. It disappears by itself the moment a second player joins (#982).
  const isHostAlone = playerCount === 1 && !!lobby?.creatorId && getCurrentUserId() === lobby.creatorId

  // A column that is at least as tall as its scroll area, so the guide below the
  // roster can take the slack instead of leaving it empty (#899).
  return (
    <div className="flex min-h-full flex-col gap-2 px-4 py-4 sm:px-6">
      {/* Theme banner */}
      {hasCustomTheme && (
        <LobbyThemeBanner theme={lobby.theme as LobbyTheme} />
      )}

      {/* Players */}
      {game?.players?.map((p: GamePlayer, index: number) => {
        const isBot = !!p.user?.bot
        const playerName = p.user?.username || p.name || (isBot ? t('game.ui.aiBot') : t('game.ui.player'))
        const isCurrentUser = p.userId === getCurrentUserId()
        const isHost = !isBot && !!lobby.creatorId && p.userId === lobby.creatorId
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
                <Icon name="crown" size={12} tone="premium" label="Premium" className="shrink-0" />
              )}
              {isCurrentUser && !isBot && (
                <span className="rounded-full bg-bd-mint px-1.5 py-0.5 text-[10px] font-bold text-bd-mint-deep">
                  {t('game.ui.you')}
                </span>
              )}
              {isHost && (
                <span className="rounded-full bg-bd-sun px-1.5 py-0.5 text-[10px] font-bold text-bd-ink">
                  {t('game.ui.host')}
                </span>
              )}
              {isBot && (
                <span className="rounded-full bg-bd-lav px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {t('game.ui.botBadge')}
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
                title={t('game.ui.removeBot')}
              >
                <Icon name="close" size={14} />
              </button>
            )}
            {/* Kick player button */}
            {!isBot && !isCurrentUser && canKickPlayers && onKickPlayer && (
              <button
                onClick={(e) => { e.stopPropagation(); onKickPlayer(p.id) }}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-bd-ink-muted transition-all hover:bg-bd-coral/15 hover:text-bd-coral-deep"
                title={t('game.ui.kickPlayer')}
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
        )
      })}

      {/* Empty slots — the first one carries the invite / add-bot actions */}
      {Array.from({ length: openSlots }).map((_, i) => {
        const isRequired = i < missingPlayers
        const isPulse = isRequired && i === 0
        const showBotAction = i === 0 && !!onAddBot && !!canManageBots && hasBotSupport(lobby?.gameType)
        const showInviteAction = i === 0 && !!onInviteFriends
        // Inviting people you already know needs an account, so `onInviteFriends` is absent
        // for guests and non-hosts, and 87 % of lobbies are guest-created, which left the
        // empty slot with no way at all to pull someone in. The share link needs neither
        // (#927). It stands in for the friends button rather than joining it: three buttons
        // do not fit this row at 320 px.
        const showShareAction = i === 0 && !showInviteAction && !!lobby?.code
        const showActions = showBotAction || showInviteAction || showShareAction

        return (
          <Fragment key={`empty-${i}`}>
            <div
              className="flex items-center gap-3 rounded-xl border border-dashed border-bd-line bg-bd-bg2/60 px-3 py-3 sm:px-4"
            >
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-dashed text-sm font-bold ${
                isPulse
                  ? 'animate-pulse border-bd-sun/60 bg-bd-sun/10 text-bd-sun-deep'
                  : 'border-bd-line bg-bd-bg2 text-bd-ink-muted'
              }`}>
                {playerCount + i + 1}
              </div>

              {showActions && pickingBotDifficulty ? (
                /* Bot difficulty choice takes over the row — picking adds the bot */
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  {BOT_DIFFICULTIES.map((difficulty) => (
                    <button
                      key={difficulty}
                      type="button"
                      disabled={addingBot}
                      onClick={async () => {
                        sounds.play('click')
                        setAddingBot(true)
                        try {
                          await onAddBot?.(difficulty)
                        } finally {
                          setAddingBot(false)
                          setPickingBotDifficulty(false)
                        }
                      }}
                      className="flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border border-bd-line bg-bd-bg px-2 py-2 text-xs font-bold text-bd-ink transition-colors hover:border-bd-ink disabled:opacity-50"
                    >
                      <Icon name={BOT_DIFFICULTY_ICON[difficulty]} size={16} />
                      <span className="truncate">
                        {t(`game.ui.botDifficulty${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}` as Parameters<typeof t>[0])}
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={addingBot}
                    onClick={() => setPickingBotDifficulty(false)}
                    aria-label={t('common.cancel')}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-bd-ink-muted transition-colors hover:bg-bd-coral/15 hover:text-bd-coral-deep disabled:opacity-50"
                  >
                    <Icon name="close" size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <span className={`min-w-0 flex-1 truncate text-sm italic ${isRequired ? 'text-bd-ink-soft' : 'text-bd-ink-muted'}`}>
                    {isRequired ? t('game.ui.waitingForPlayer') : t('game.ui.openSlot')}
                  </span>
                  {showActions && (
                    <div className="flex shrink-0 items-center gap-1.5">
                      {showInviteAction && (
                        <button
                          type="button"
                          onClick={() => {
                            sounds.play('click')
                            onInviteFriends?.()
                          }}
                          className="flex items-center gap-1 rounded-lg border border-bd-line bg-bd-bg px-2.5 py-2 text-xs font-bold text-bd-ink transition-colors hover:border-bd-ink"
                        >
                          <Icon name="mail" size={16} />
                          <span>{t('game.ui.slotInvite')}</span>
                        </button>
                      )}
                      {showShareAction && (
                        <button
                          type="button"
                          onClick={() => {
                            sounds.play('click')
                            void shareInvite('waiting_room_slot')
                          }}
                          className="flex items-center gap-1 rounded-lg border border-bd-line bg-bd-bg px-2.5 py-2 text-xs font-bold text-bd-ink transition-colors hover:border-bd-ink"
                        >
                          <Icon name="link" size={16} />
                          <span>{t('game.ui.slotInvite')}</span>
                        </button>
                      )}
                      {showBotAction && (
                        <button
                          type="button"
                          onClick={() => {
                            sounds.play('click')
                            setPickingBotDifficulty(true)
                          }}
                          className="flex items-center gap-1 rounded-lg border border-bd-line bg-bd-bg px-2.5 py-2 text-xs font-bold text-bd-ink transition-colors hover:border-bd-ink"
                        >
                          <Icon name="robot" size={16} />
                          <span>{t('game.ui.slotAddBot')}</span>
                          <span aria-hidden className="text-bd-ink-muted">▾</span>
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
            {/*
              A sibling under the first empty slot rather than a third control inside it:
              that row already cannot fit three at 320 px (see its comment above) (#982).
            */}
            {i === 0 && isHostAlone && !!game?.createdAt && (
              <WaitingRoomDiscordHint
                waitingSinceMs={new Date(game.createdAt).getTime()}
                gameType={toAnalyticsGameType(lobby?.gameType)}
              />
            )}
          </Fragment>
        )
      })}

      {showTryBotGames && game?.createdAt && (
        <TryBotGamesBanner waitingSinceMs={new Date(game.createdAt).getTime()} />
      )}

      <WaitingRoomGuide
        gameType={lobby?.gameType}
        kickedPlayers={kickedPlayers}
        onUnkickPlayer={onUnkickPlayer}
      />
    </div>
  )
}
