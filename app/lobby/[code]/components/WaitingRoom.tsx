import { useTranslation } from '@/lib/i18n-helpers'
import type { Game, Lobby, GamePlayer } from '@/types/game'
import type { GameEngine } from '@/lib/game-engine'
import type { BotDifficulty } from '@/lib/bot-profiles'

interface WaitingRoomProps {
  game: Game | null
  lobby: Lobby
  gameEngine: GameEngine | null
  minPlayers: number
  getCurrentUserId: () => string | null | undefined
  canManageBots?: boolean
  onKickBot?: (botPlayerId: string) => void
}

export default function WaitingRoom({
  game,
  lobby,
  minPlayers,
  getCurrentUserId,
  canManageBots,
  onKickBot,
}: WaitingRoomProps) {
  const { t } = useTranslation()

  const playerCount = game?.players?.length || 0
  const maxPlayers = lobby?.maxPlayers || 4
  const openSlots = Math.max(maxPlayers - playerCount, 0)
  const missingPlayers = Math.max(minPlayers - playerCount, 0)

  return (
    <div className="px-3 sm:px-5 py-4 space-y-1.5">
      {/* Players */}
      {game?.players?.map((p: GamePlayer, index: number) => {
        const isBot = !!p.user?.bot
        const playerName = p.user?.username || p.user?.email || (isBot ? t('game.ui.aiBot') : t('game.ui.player'))
        const isCurrentUser = p.userId === getCurrentUserId()
        const botDifficulty = p.user?.bot?.difficulty as BotDifficulty | undefined
        const difficultyLabel = botDifficulty ? t(`game.ui.botDifficulty${botDifficulty.charAt(0).toUpperCase() + botDifficulty.slice(1)}` as Parameters<typeof t>[0]) : null

        return (
          <div
            key={p.id}
            className={`flex items-center gap-3 rounded-xl px-3 sm:px-4 py-2.5 border ${
              isCurrentUser
                ? 'bg-emerald-500/15 border-emerald-300/40'
                : isBot
                  ? 'bg-violet-500/12 border-violet-300/25'
                  : 'bg-white/5 border-white/12'
            }`}
          >
            <div className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center text-white/80 text-xs font-bold shrink-0">
              {index + 1}
            </div>
            <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-white text-sm truncate">{playerName}</span>
              {isCurrentUser && !isBot && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/80 text-white">
                  {t('game.ui.you')}
                </span>
              )}
              {isBot && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-500/80 text-white">
                  AI
                </span>
              )}
              {isBot && difficultyLabel && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-500/75 text-white">
                  {difficultyLabel}
                </span>
              )}
            </div>

            {/* Kick bot button */}
            {isBot && canManageBots && onKickBot && (
              <button
                onClick={() => onKickBot(p.id)}
                className="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg text-white/35 hover:text-rose-300 hover:bg-rose-500/20 transition-all text-xs font-bold"
                title="Remove bot"
              >
                ✕
              </button>
            )}
          </div>
        )
      })}

      {/* Empty slots */}
      {Array.from({ length: openSlots }).map((_, i) => (
        <div
          key={`empty-${i}`}
          className="flex items-center gap-3 rounded-xl px-3 sm:px-4 py-2.5 border border-white/8 border-dashed"
        >
          <div className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center text-white/30 text-xs font-bold shrink-0">
            {playerCount + i + 1}
          </div>
          <span className="text-sm text-white/30 italic">
            {i < missingPlayers ? t('game.ui.waitingForPlayer') : t('game.ui.openSlot')}
          </span>
        </div>
      ))}
    </div>
  )
}
