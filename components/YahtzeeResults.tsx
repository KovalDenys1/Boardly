'use client'

import { PlayerResults } from '@/lib/yahtzee-results'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import { YahtzeeMode, getActiveCategories } from '@/lib/yahtzee'
import AfterGameActions from '@/components/game-chrome/AfterGameActions'

interface YahtzeeResultsProps {
  results: PlayerResults[]
  /** 'short' shows 9 rounds instead of 15 (#779) */
  mode?: YahtzeeMode
  currentUserId: string | null
  canStartGame: boolean
  canRequestRematch?: boolean
  isRequestRematchPending?: boolean
  onPlayAgain: () => void
  onRequestRematch?: () => void
  onBackToLobby: () => void
  onReturnToLobbyRoom?: () => void
  onReturnToWaiting?: () => void
  isGuest?: boolean
  registerUrl?: string
  /** Lobby code for the after-game share button (#982). Omit it and only the Discord line shows. */
  lobbyCode?: string
  /** `status === 'authenticated' && !isGuest`, decided by the caller (#982). */
  isRegistered?: boolean
  /** Times each face 1–6 came up this game, from the server's state; null hides the tally (#1085). */
  faceCounts?: number[] | null
}

function RankIcon({ rank }: { rank: number }) {
  if (rank === 0) return <Icon name="medal" size={26} tone="sun" />
  if (rank === 1) return <Icon name="medal" size={26} tone="muted" />
  if (rank === 2) return <Icon name="medal" size={26} tone="coral" />
  return <>{`#${rank + 1}`}</>
}

function getPlacementCardClass(rank: number) {
  if (rank === 0) {
    return 'shadow-xs'
  }
  if (rank === 1) {
    return ''
  }
  if (rank === 2) {
    return ''
  }
  return ''
}

export default function YahtzeeResults({
  results,
  currentUserId,
  canStartGame,
  canRequestRematch = false,
  isRequestRematchPending = false,
  onPlayAgain,
  onRequestRematch,
  onBackToLobby,
  onReturnToLobbyRoom,
  onReturnToWaiting,
  isGuest = false,
  registerUrl = '/auth/register',
  lobbyCode,
  isRegistered = false,
  mode = 'classic',
  faceCounts = null,
}: YahtzeeResultsProps) {
  const { t } = useTranslation()
  const totalRounds = getActiveCategories(mode).length
  // Short mode has no upper section, so an "Upper 0" box is noise (#1187).
  const hasUpperSection = mode !== 'short'
  if (results.length === 0) {
    return null
  }

  const winner = results[0]
  const isWinner = winner.playerId === currentUserId
  const secondPlace = results[1] ?? null
  const winnerMargin = secondPlace ? winner.totalScore - secondPlace.totalScore : winner.totalScore
  const winnerScoreBase = Math.max(1, winner.totalScore)
  const diceRolled = faceCounts ? faceCounts.reduce((sum, n) => sum + n, 0) : 0
  const mostCommonFace = faceCounts ? Math.max(1, ...faceCounts) : 1

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-y-auto px-3 pb-6 pt-4 sm:px-5 sm:pb-8"
      style={{
        background:
          'radial-gradient(circle at top, rgba(255,196,77,0.18), transparent 30%), linear-gradient(180deg, rgba(255,252,247,1) 0%, rgba(252,246,236,1) 100%)',
      }}
    >
      <div className="mx-auto w-full max-w-6xl">
        <div className="bd-card overflow-hidden">
          <div
            className="border-b px-4 py-5 sm:px-6 sm:py-6"
            style={{
              borderColor: 'var(--bd-line)',
              background:
                'linear-gradient(135deg, rgba(255,196,77,0.2) 0%, var(--bd-bg) 46%, rgba(155,140,255,0.14) 100%)',
            }}
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="bd-kicker">{t('yahtzee.results.matchComplete')}</div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] border-2 border-bd-ink bg-bd-sun shadow-bd-ink-4 sm:h-20 sm:w-20">
                    <Icon name="trophy" size={44} tone="on-accent" />
                  </div>
                  <div className="min-w-0">
                    <h2
                      className="text-3xl font-extrabold text-bd-ink sm:text-4xl"
                      style={{ fontFamily: 'var(--bd-font-display)' }}
                    >
                      {t('yahtzee.results.gameOver')}
                    </h2>
                    <p className="mt-1 text-sm text-bd-ink-soft sm:text-base">
                      {/* The player count is the chip beside this; saying it twice
                          printed "2 2 player" (#1187). */}
                      {t('yahtzee.results.roundsCompleted', { count: totalRounds })}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <span className="bd-chip bd-chip-sun px-3 py-1.5 text-[11px]">{t('yahtzee.results.winnerScore', { score: winner.totalScore })}</span>
                <span className="bd-chip bd-chip-mint px-3 py-1.5 text-[11px]">{t('yahtzee.results.marginScore', { margin: winnerMargin })}</span>
                <span className="bd-chip bd-chip-lav px-3 py-1.5 text-[11px]">{t('yahtzee.results.players', { count: results.length })}</span>
              </div>
            </div>
          </div>

          <div
            className="border-b px-4 py-3 sm:px-6 sm:py-4"
            style={{
              borderColor: 'var(--bd-line)',
              background: 'var(--bd-bg2)',
            }}
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className={canStartGame ? 'hidden sm:block' : ''}>
                <div className="hidden sm:block">
                  <div className="bd-kicker">{t('yahtzee.results.nextStep')}</div>
                  <p className="mt-1 text-sm font-medium text-bd-ink">
                    {t('yahtzee.results.nextStepHint')}
                  </p>
                </div>
                {!canStartGame && (
                  <p className="text-xs text-bd-ink-muted sm:mt-1">
                    {t('yahtzee.results.hostCanStartNextRound')}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                <button
                  onClick={onPlayAgain}
                  disabled={!canStartGame}
                  className="bd-btn bd-btn-primary flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Icon name="refresh" size={18} />
                  <span>{t('yahtzee.results.playAgain')}</span>
                </button>
                {onReturnToWaiting && canStartGame && (
                  <button
                    onClick={onReturnToWaiting}
                    className="bd-btn bd-btn-soft flex items-center justify-center gap-2"
                  >
                    <span>{t('game.ui.returnToLobby')}</span>
                  </button>
                )}
                {onRequestRematch && canRequestRematch && (
                  <button
                    onClick={onRequestRematch}
                    disabled={isRequestRematchPending}
                    className="bd-btn bd-btn-soft flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Icon name="megaphone" size={18} />
                    <span>{isRequestRematchPending ? t('common.loading') : t('yahtzee.results.requestRematch')}</span>
                  </button>
                )}
                <button
                  onClick={onBackToLobby}
                  className="bd-btn bd-btn-coral flex items-center justify-center gap-2"
                >
                  <Icon name="arrow-left" size={18} />
                  <span>{t('yahtzee.results.backToLobbies')}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)]">
            <div className="flex min-w-0 flex-col gap-4">
            <section
              className="rounded-bd-lg border p-4 sm:p-5"
              style={{
                borderColor: 'rgba(255,196,77,0.32)',
                background:
                  'linear-gradient(180deg, rgba(255,244,213,0.68) 0%, var(--bd-bg) 100%)',
              }}
            >
              <div className="flex items-center gap-2 text-(--bd-coral-deep)">
                <Icon name="crown" size={20} />
                <span className="bd-kicker">{t('yahtzee.results.winnerLabel')}</span>
              </div>
              <p className="mt-3 text-2xl font-extrabold text-bd-ink sm:text-3xl">
                {isWinner ? t('yahtzee.results.youWon') : t('yahtzee.results.playerWins', { player: winner.playerName })}
              </p>
              <p
                className="mt-2 text-4xl font-black text-bd-ink sm:text-5xl"
                style={{ fontFamily: 'var(--bd-font-display)' }}
              >
                {winner.totalScore}
              </p>
              <p className="mt-1 text-sm text-bd-ink-soft">
                {winner.playerName}
              </p>

              {/* Short mode scores the lower section only, so the split would
                  repeat the total printed just above (#1187). */}
              {hasUpperSection && (
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border px-3 py-3" style={{ borderColor: 'var(--bd-line)', background: 'var(--bd-bg)' }}>
                  <div className="bd-kicker">{t('yahtzee.results.upperSectionShort')}</div>
                  <div className="mt-1 text-2xl font-bold text-bd-ink">
                    {winner.upperSectionScore}
                    {winner.bonusAchieved && (
                      <span className="ml-1 text-sm font-semibold text-(--bd-mint-deep)">+{winner.bonusPoints}</span>
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border px-3 py-3" style={{ borderColor: 'var(--bd-line)', background: 'var(--bd-bg)' }}>
                  <div className="bd-kicker">{t('yahtzee.results.lowerSectionShort')}</div>
                  <div className="mt-1 text-2xl font-bold text-bd-ink">{winner.lowerSectionScore}</div>
                </div>
              </div>
              )}

              {winner.achievements.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {winner.achievements.map((achievement, idx) => (
                    <span
                      key={idx}
                      className="bd-chip bd-chip-lav px-3 py-1.5 text-[11px]"
                    >
                      <Icon name={achievement.icon} size={15} /> {achievement.label}
                    </span>
                  ))}
                </div>
              )}
            </section>

            {faceCounts && diceRolled > 0 && (
              <section
                className="rounded-bd-lg border p-4 sm:p-5"
                style={{ borderColor: 'var(--bd-line)', background: 'var(--bd-bg)' }}
                data-testid="yahtzee-face-tally"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="bd-kicker">{t('yahtzee.results.diceTally')}</span>
                  <span className="text-xs font-semibold text-bd-ink-soft">{t('yahtzee.results.diceRolled', { count: diceRolled })}</span>
                </div>
                <ul className="mt-3 grid grid-cols-6 gap-2">
                  {faceCounts.map((count, index) => (
                    <li
                      key={index}
                      className="flex flex-col items-center gap-1.5"
                      aria-label={t('yahtzee.results.faceCount', { face: index + 1, count })}
                    >
                      <span className="text-xs font-bold text-bd-ink">{count}</span>
                      <div className="flex h-14 w-full items-end overflow-hidden rounded-lg" style={{ background: 'var(--bd-bg2)' }}>
                        <div
                          className="h-full w-full origin-bottom rounded-lg"
                          style={{ background: 'var(--bd-sun)', transform: `scaleY(${count / mostCommonFace})` }}
                        />
                      </div>
                      <span
                        className="grid h-7 w-7 place-items-center rounded-md border text-sm font-extrabold text-bd-ink"
                        style={{ borderColor: 'var(--bd-line)', background: 'var(--bd-card-warm)' }}
                        aria-hidden="true"
                      >
                        {index + 1}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-bd-ink-soft">{t('yahtzee.results.tallyNote')}</p>
              </section>
            )}
            </div>

            <section className="min-w-0">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3
                  className="text-2xl font-extrabold text-bd-ink"
                  style={{ fontFamily: 'var(--bd-font-display)' }}
                >
                  {t('yahtzee.results.finalStandings')}
                </h3>
                {onReturnToLobbyRoom && (
                  <button
                    type="button"
                    onClick={onReturnToLobbyRoom}
                    className="bd-btn bd-btn-soft rounded-xl! px-3! py-2! text-xs!"
                  >
                    {t('game.ui.returnToLobby')}
                  </button>
                )}
              </div>

              <div className="space-y-3">
            {results.map((player) => {
              const isCurrentUser = player.playerId === currentUserId
              const scorePercent = Math.max(0, Math.min(100, Math.round((player.totalScore / winnerScoreBase) * 100)))

              return (
                <div
                  key={player.playerId}
                  className={`rounded-[22px] border p-3 transition-all sm:p-4 ${getPlacementCardClass(player.rank)} ${
                    isCurrentUser ? 'ring-2 ring-inset ring-(--bd-sky)' : ''
                  }`}
                  style={{
                    borderColor:
                      player.rank === 0
                        ? 'rgba(255,196,77,0.34)'
                        : player.rank === 1
                          ? 'rgba(155,140,255,0.24)'
                          : player.rank === 2
                            ? 'rgba(255,107,91,0.22)'
                            : 'var(--bd-line)',
                    background:
                      player.rank === 0
                        ? 'linear-gradient(135deg, rgba(255,244,213,0.8), var(--bd-bg))'
                        : player.rank === 1
                          ? 'linear-gradient(135deg, rgba(155,140,255,0.12), var(--bd-bg))'
                          : player.rank === 2
                            ? 'linear-gradient(135deg, rgba(255,107,91,0.1), var(--bd-bg))'
                            : 'var(--bd-bg)',
                  }}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center text-xl font-bold sm:text-2xl"><RankIcon rank={player.rank} /></span>
                        <p className="truncate text-base font-bold text-bd-ink sm:text-lg">
                          {player.playerName}
                        </p>
                        {isCurrentUser && (
                          <span className="bd-chip px-2 py-1 text-[11px]">
                            {t('yahtzee.results.you')}
                          </span>
                        )}
                        {player.rank === 0 && (
                          <span className="bd-chip bd-chip-sun px-2 py-1 text-[11px]">
                            {t('yahtzee.results.winnerBadge')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-extrabold text-bd-ink sm:text-3xl">{player.totalScore}</p>
                      <p className="text-[11px] text-bd-ink-muted">{t('profile.gameResults.points')}</p>
                    </div>
                  </div>

                  <div className="mb-2 h-2 w-full overflow-hidden rounded-full" style={{ background: 'rgba(41,37,36,0.08)' }}>
                    <div
                      className={`h-full rounded-full ${
                        player.rank === 0 ? 'bg-(--bd-sun-deep)' : player.rank === 1 ? 'bg-(--bd-lav-deep)' : player.rank === 2 ? 'bg-(--bd-coral)' : 'bg-(--bd-sky)'
                      }`}
                      style={{ width: `${scorePercent}%` }}
                    />
                  </div>

                  {/* In short mode every point is lower section: the total says it. */}
                  {hasUpperSection && (
                  <div className="grid grid-cols-1 gap-2 text-sm text-bd-ink-soft sm:grid-cols-2">
                    <div>
                      <span className="font-medium">{t('yahtzee.results.upper')}</span>{' '}
                      <span className="font-semibold text-bd-ink">{player.upperSectionScore}</span>
                      {player.bonusAchieved && (
                        <span className="ml-1 text-(--bd-mint-deep)">
                          {t('yahtzee.results.bonus', { count: player.bonusPoints })}
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="font-medium">{t('yahtzee.results.lower')}</span>{' '}
                      <span className="font-semibold text-bd-ink">{player.lowerSectionScore}</span>
                    </div>
                  </div>
                  )}

                  {player.achievements.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {player.achievements.map((achievement, idx) => (
                        <span
                          key={idx}
                          className="bd-chip bd-chip-lav px-2 py-1 text-[11px]"
                        >
                          <Icon name={achievement.icon} size={15} />
                          <span>{achievement.label}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
              </div>
            </section>
          </div>
        </div>

        <div className="mx-auto mt-4 w-full max-w-sm">
          <AfterGameActions
            variant="card"
            inviteCode={lobbyCode}
            gameType="yahtzee"
            isGuest={isGuest}
            isRegistered={isRegistered}
            registerUrl={registerUrl}
          />
        </div>
      </div>
    </div>
  )
}
