'use client'

import { useEffect, useState } from 'react'
import { PlayerResults } from '@/lib/yahtzee-results'
import { useTranslation } from '@/lib/i18n-helpers'
import { ALL_CATEGORIES } from '@/lib/yahtzee'
import GuestConversionNudge from './GuestConversionNudge'

interface YahtzeeResultsProps {
  results: PlayerResults[]
  currentUserId: string | null
  canStartGame: boolean
  canRequestRematch?: boolean
  isRequestRematchPending?: boolean
  onPlayAgain: () => void
  onRequestRematch?: () => void
  onBackToLobby: () => void
  onReturnToLobbyRoom?: () => void
  autoReturnAt?: number | null
  isGuest?: boolean
  registerUrl?: string
}

function getRankIcon(rank: number) {
  if (rank === 0) return '🥇'
  if (rank === 1) return '🥈'
  if (rank === 2) return '🥉'
  return `#${rank + 1}`
}

function getPlacementCardClass(rank: number) {
  if (rank === 0) {
    return 'shadow-sm'
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
  autoReturnAt = null,
  isGuest = false,
  registerUrl = '/auth/register',
}: YahtzeeResultsProps) {
  const { t } = useTranslation()
  const totalRounds = ALL_CATEGORIES.length
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!autoReturnAt) {
      return
    }

    setNow(Date.now())
    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => window.clearInterval(timer)
  }, [autoReturnAt])

  if (results.length === 0) {
    return null
  }

  const winner = results[0]
  const isWinner = winner.playerId === currentUserId
  const secondPlace = results[1] ?? null
  const winnerMargin = secondPlace ? winner.totalScore - secondPlace.totalScore : winner.totalScore
  const winnerScoreBase = Math.max(1, winner.totalScore)
  const autoReturnSeconds = autoReturnAt ? Math.max(0, Math.ceil((autoReturnAt - now) / 1000)) : null

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
                <div className="bd-kicker">Match Complete</div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] border-2 border-bd-ink bg-bd-sun shadow-bd-ink-4 sm:h-20 sm:w-20">
                    <span className="text-4xl sm:text-5xl">🏆</span>
                  </div>
                  <div className="min-w-0">
                    <h2
                      className="text-3xl font-extrabold text-bd-ink sm:text-4xl"
                      style={{ fontFamily: 'var(--bd-font-display)' }}
                    >
                      {t('yahtzee.results.gameOver')}
                    </h2>
                    <p className="mt-1 text-sm text-bd-ink-soft sm:text-base">
                      {t('yahtzee.results.roundsCompleted', { count: totalRounds })} • {results.length}{' '}
                      {t('yahtzee.results.players', { count: results.length })}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <span className="bd-chip bd-chip-sun px-3 py-1.5 text-[11px]">Winner {winner.totalScore}</span>
                <span className="bd-chip bd-chip-mint px-3 py-1.5 text-[11px]">Margin +{winnerMargin}</span>
                <span className="bd-chip bd-chip-lav px-3 py-1.5 text-[11px]">{results.length} players</span>
                {autoReturnSeconds !== null && (
                  <span className="bd-chip px-3 py-1.5 text-[11px]">
                    Lobby in {autoReturnSeconds}s
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4 px-4 py-4 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)]">
            <section
              className="rounded-[24px] border p-4 sm:p-5"
              style={{
                borderColor: 'rgba(255,196,77,0.32)',
                background:
                  'linear-gradient(180deg, rgba(255,244,213,0.68) 0%, var(--bd-bg) 100%)',
              }}
            >
              <div className="flex items-center gap-2 text-[var(--bd-coral-deep)]">
                <span className="text-xl">👑</span>
                <span className="bd-kicker">Winner</span>
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

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border px-3 py-3" style={{ borderColor: 'var(--bd-line)', background: 'var(--bd-bg)' }}>
                  <div className="bd-kicker">Upper</div>
                  <div className="mt-1 text-2xl font-bold text-bd-ink">
                    {winner.upperSectionScore}
                    {winner.bonusAchieved && (
                      <span className="ml-1 text-sm font-semibold text-[var(--bd-mint-deep)]">+{winner.bonusPoints}</span>
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border px-3 py-3" style={{ borderColor: 'var(--bd-line)', background: 'var(--bd-bg)' }}>
                  <div className="bd-kicker">Lower</div>
                  <div className="mt-1 text-2xl font-bold text-bd-ink">{winner.lowerSectionScore}</div>
                </div>
              </div>

              {winner.achievements.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {winner.achievements.map((achievement, idx) => (
                    <span
                      key={idx}
                      className="bd-chip bd-chip-lav px-3 py-1.5 text-[11px]"
                    >
                      {achievement.icon} {achievement.label}
                    </span>
                  ))}
                </div>
              )}
            </section>

            <section>
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
                    className="bd-btn bd-btn-soft !rounded-xl !px-3 !py-2 !text-xs"
                  >
                    Return to Lobby
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
                    isCurrentUser ? 'ring-2 ring-[var(--bd-sky)] ring-offset-2 ring-offset-[var(--bd-bg)]' : ''
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
                        <span className="text-xl font-bold sm:text-2xl">{getRankIcon(player.rank)}</span>
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
                            WINNER
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
                        player.rank === 0 ? 'bg-[var(--bd-sun-deep)]' : player.rank === 1 ? 'bg-[var(--bd-lav-deep)]' : player.rank === 2 ? 'bg-[var(--bd-coral)]' : 'bg-[var(--bd-sky)]'
                      }`}
                      style={{ width: `${scorePercent}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-2 text-sm text-bd-ink-soft sm:grid-cols-2">
                    <div>
                      <span className="font-medium">{t('yahtzee.results.upper')}</span>{' '}
                      <span className="font-semibold text-bd-ink">{player.upperSectionScore}</span>
                      {player.bonusAchieved && (
                        <span className="ml-1 text-[var(--bd-mint-deep)]">
                          {t('yahtzee.results.bonus', { count: player.bonusPoints })}
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="font-medium">{t('yahtzee.results.lower')}</span>{' '}
                      <span className="font-semibold text-bd-ink">{player.lowerSectionScore}</span>
                    </div>
                  </div>

                  {player.achievements.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {player.achievements.map((achievement, idx) => (
                        <span
                          key={idx}
                          className="bd-chip bd-chip-lav px-2 py-1 text-[11px]"
                        >
                          <span>{achievement.icon}</span>
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

          <div
            className="border-t px-4 py-4 sm:px-6"
            style={{
              borderColor: 'var(--bd-line)',
              background: 'var(--bd-bg2)',
            }}
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="bd-kicker">Next Step</div>
                <p className="mt-1 text-sm font-medium text-bd-ink">
                  {autoReturnSeconds !== null
                    ? `You can review the table for a few more seconds before we return to the lobby.`
                    : `Start another round, ask for a rematch, or head back to the lobbies.`}
                </p>
                {!canStartGame && (
                  <p className="mt-1 text-xs text-bd-ink-muted">
                    {t('yahtzee.results.hostCanStartNextRound')}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={onPlayAgain}
                  disabled={!canStartGame}
                  className="bd-btn bd-btn-primary flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="text-lg">🔄</span>
                  <span>{t('yahtzee.results.playAgain')}</span>
                </button>
                {onRequestRematch && canRequestRematch && (
                  <button
                    onClick={onRequestRematch}
                    disabled={isRequestRematchPending}
                    className="bd-btn bd-btn-soft flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="text-lg">📣</span>
                    <span>{isRequestRematchPending ? t('common.loading') : t('yahtzee.results.requestRematch')}</span>
                  </button>
                )}
                <button
                  onClick={onBackToLobby}
                  className="bd-btn bd-btn-coral flex items-center justify-center gap-2"
                >
                  <span className="text-lg">↩️</span>
                  <span>{t('yahtzee.results.backToLobbies')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {isGuest && (
          <div className="mt-4">
            <GuestConversionNudge registerUrl={registerUrl} />
          </div>
        )}
      </div>
    </div>
  )
}
