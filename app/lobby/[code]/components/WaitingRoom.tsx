import { useState } from 'react'
import LoadingSpinner from '@/components/LoadingSpinner'
import { sounds } from '@/lib/sounds'
import { getGameMetadata, hasBotSupport } from '@/lib/game-catalog'
import { BOT_DIFFICULTIES, type BotDifficulty } from '@/lib/bot-profiles'
import { useTranslation } from '@/lib/i18n-helpers'
import type { Game, Lobby, GamePlayer } from '@/types/game'
import type { GameEngine } from '@/lib/game-engine'

interface WaitingRoomProps {
  game: Game | null
  lobby: Lobby
  gameEngine: GameEngine | null
  minPlayers: number
  botDifficulty: BotDifficulty
  canStartGame: boolean
  startingGame: boolean
  onStartGame: () => void
  onAddBot: () => void
  onBotDifficultyChange: (difficulty: BotDifficulty) => void
  onInviteFriends?: () => void
  getCurrentUserId: () => string | null | undefined
  lobbyCode?: string
  isPrivate?: boolean
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
  lobbyCode,
  isPrivate,
}: WaitingRoomProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const handleCopyInviteLink = async () => {
    if (!lobbyCode) return
    const url = `${window.location.origin}/lobby/${lobbyCode}`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Join my game on Boardly', url })
      } else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch {
      // clipboard write may be denied silently
    }
  }
  const playerCount = game?.players?.length || 0
  const maxPlayers = lobby?.maxPlayers || 4
  const openSlots = Math.max(maxPlayers - playerCount, 0)
  const missingPlayers = Math.max(minPlayers - playerCount, 0)
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
    <div className="max-w-5xl mx-auto w-full px-1 py-4 space-y-4">
      {/* Players section — merged status + player list */}
      <section className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-bold text-white">{t('game.ui.playersInLobbyTitle')}</h2>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                canStartImmediately
                  ? 'border-emerald-300/40 bg-emerald-500/20 text-emerald-200'
                  : 'border-amber-300/40 bg-amber-500/20 text-amber-200'
              }`}
            >
              <span>{canStartImmediately ? '🟢' : '🟡'}</span>
              <span>{canStartImmediately ? t('game.ui.readyToStart') : t('game.ui.waiting')}</span>
            </span>
          </div>
          <span className="text-sm font-semibold text-white/60">
            {playerCount}/{maxPlayers}
          </span>
        </div>

        <div className="space-y-2">
          {game?.players?.map((p: GamePlayer, index: number) => {
            const isBot = !!p.user?.bot
            const playerName = p.user?.username || p.user?.email || (isBot ? t('game.ui.aiBot') : t('game.ui.player'))
            const isCurrentUser = p.userId === getCurrentUserId()
            const botDifficultyValue = p.user?.bot?.difficulty as BotDifficulty | undefined
            const botDifficultyLabel = botDifficultyValue ? difficultyLabelMap[botDifficultyValue] : null

            return (
              <div
                key={p.id}
                className={`flex items-center gap-3 rounded-xl px-3 sm:px-4 py-2.5 border ${
                  isCurrentUser
                    ? 'bg-emerald-500/15 border-emerald-300/40'
                    : isBot
                      ? 'bg-violet-500/15 border-violet-300/35'
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
                  {isBot && botDifficultyLabel && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-500/75 text-white">
                      {botDifficultyLabel}
                    </span>
                  )}
                </div>
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

        {!canStartImmediately && missingPlayers > 0 && (
          <p className="mt-3 text-xs text-amber-200/70">
            {t('game.ui.needMorePlayers', { count: missingPlayers })}
          </p>
        )}
      </section>

      {/* Actions */}
      <section className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md p-5">
        {canStartGame ? (
          <div className="space-y-3">
            <button
              onClick={() => {
                sounds.play('click')
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
              <div className="rounded-xl border border-blue-300/30 bg-blue-500/10 px-4 py-2.5">
                <p className="text-blue-100 text-xs">
                  💡 <strong>{t('game.ui.tip')}:</strong> {t('game.ui.botAutoAddTip')}
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2.5">
              {supportsBots && canAddMorePlayers && (
                <button
                  onClick={() => {
                    sounds.play('click')
                    onAddBot()
                  }}
                  disabled={!canAddMorePlayers}
                  className="flex-1 px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed border border-white/20"
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
                    sounds.play('click')
                    onInviteFriends()
                  }}
                  disabled={!canAddMorePlayers}
                  className="flex-1 px-4 py-3 bg-white/20 hover:bg-white/30 text-white rounded-xl font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed border border-white/20"
                  title={!canAddMorePlayers ? t('game.ui.lobbyFull') : t('game.ui.inviteFriendsToJoin')}
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    <span>👥</span>
                    <span>{t('game.ui.inviteFriends')}</span>
                  </span>
                </button>
              )}
            </div>

            {lobbyCode && (
              <button
                onClick={handleCopyInviteLink}
                className="w-full px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-semibold transition-all duration-200 border border-white/20"
              >
                <span className="inline-flex items-center justify-center gap-2">
                  <span>{copied ? '✅' : '🔗'}</span>
                  <span>{copied ? t('lobby.inviteLinkCopied') : (isPrivate ? t('lobby.copyInviteLinkPrivate') : t('lobby.copyInviteLink'))}</span>
                </span>
              </button>
            )}
            {canConfigureBots && (
              <div className="rounded-xl border border-white/15 bg-white/5 px-4 py-3">
                <p className="text-white/70 text-xs font-semibold uppercase tracking-wide mb-2">{t('game.ui.botDifficulty')}</p>
                <div className="grid grid-cols-3 gap-2">
                  {BOT_DIFFICULTIES.map((difficulty) => (
                    <button
                      key={difficulty}
                      type="button"
                      onClick={() => {
                        sounds.play('click')
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
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-4 py-4">
              <span className="text-2xl shrink-0">⌛</span>
              <div className="min-w-0">
                <p className="text-white font-bold text-sm">{t('game.ui.waitingForHost')}</p>
                <p className="text-white/55 text-xs mt-0.5">
                  {t('game.ui.host')}: <span className="font-semibold text-white/75">{creatorName}</span>
                </p>
              </div>
            </div>
            {lobbyCode && (
              <button
                onClick={handleCopyInviteLink}
                className="w-full px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-semibold transition-all duration-200 border border-white/20"
              >
                <span className="inline-flex items-center justify-center gap-2">
                  <span>{copied ? '✅' : '🔗'}</span>
                  <span>{copied ? t('lobby.inviteLinkCopied') : (isPrivate ? t('lobby.copyInviteLinkPrivate') : t('lobby.copyInviteLink'))}</span>
                </span>
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
