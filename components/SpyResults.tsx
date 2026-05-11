'use client'

import { useTranslation } from '@/lib/i18n-helpers'
import { Player } from '@/lib/game-engine'

type SpyPlayer = Player & { isPremium?: boolean }

interface SpyResultsProps {
  players: SpyPlayer[]
  votes: Record<string, string>
  eliminatedId: string
  spyId: string
  location: string
  spyGuessedLocation?: string
  scores: Record<string, number>
  currentRound: number
  totalRounds: number
  onNextRound?: () => void
  onPlayAgain?: () => void
  onRequestRematch?: () => void
  isRequestRematchPending?: boolean
  onBackToLobby?: () => void
}

export default function SpyResults({
  players,
  votes,
  eliminatedId,
  spyId,
  location,
  spyGuessedLocation,
  scores,
  currentRound,
  totalRounds,
  onNextRound,
  onPlayAgain,
  onRequestRematch,
  isRequestRematchPending = false,
  onBackToLobby,
}: SpyResultsProps) {
  const { t } = useTranslation()

  const wasGuessRound = spyGuessedLocation !== undefined
  const guessWasCorrect = spyGuessedLocation === location
  const spyWon = wasGuessRound ? guessWasCorrect : eliminatedId !== spyId
  const eliminatedPlayer = players.find((p) => p.id === eliminatedId)
  const spyPlayer = players.find((p) => p.id === spyId)
  const noElimination = !wasGuessRound && eliminatedId.length === 0

  // Count votes for each player
  const voteCounts: Record<string, number> = {}
  Object.values(votes).forEach((targetId) => {
    voteCounts[targetId] = (voteCounts[targetId] || 0) + 1
  })

  // Sort players by vote count
  const sortedByVotes = [...players].sort((a, b) => {
    return (voteCounts[b.id] || 0) - (voteCounts[a.id] || 0)
  })

  // Sort players by score
  const sortedByScore = [...players].sort((a, b) => {
    return (scores[b.id] || 0) - (scores[a.id] || 0)
  })

  const isGameOver = currentRound >= totalRounds

  return (
    <div className="spy-stage">
      <div className="spy-results-card">
        <div className="text-center">
          <p className="bd-kicker">{t('spy.phases.results')}</p>
          <h2 className={`mt-1 text-3xl font-black sm:text-4xl ${spyWon ? 'text-[var(--bd-coral-deep)]' : 'text-[var(--bd-mint-deep)]'}`}>
            {spyWon ? t('spy.spyWins') : t('spy.regularsWin')}
          </h2>
          {wasGuessRound ? (
            <p className="mt-2 text-base font-semibold text-[var(--bd-ink-soft)]">
              {guessWasCorrect
                ? t('spy.guessCorrect', { player: spyPlayer?.name })
                : t('spy.guessWrong', { player: spyPlayer?.name, guess: spyGuessedLocation })}
            </p>
          ) : !noElimination ? (
            <p className="mt-2 text-base font-semibold text-[var(--bd-ink-soft)]">
              {spyWon
                ? t('spy.wasInnocent', { player: eliminatedPlayer?.name })
                : t('spy.wasSpy', { player: spyPlayer?.name })}
            </p>
          ) : (
            <p className="mt-2 text-base font-semibold text-[var(--bd-ink-soft)]">{t('spy.tieNoElimination')}</p>
          )}
          <div className="mx-auto mt-4 inline-flex rounded-xl border border-[var(--bd-line)] bg-[var(--bd-card-warm)] px-4 py-2 text-sm font-bold text-[var(--bd-ink)]">
            {t('spy.locationRevealed', { location })}
          </div>
        </div>

        <div className="mt-7 grid gap-4 lg:grid-cols-[1fr_0.9fr]">
          <section className="spy-subpanel">
            <h3 className="spy-section-title">{t('spy.votes')}</h3>
            <div className="mt-3 space-y-2">
              {sortedByVotes.map((player) => {
                const voteCount = voteCounts[player.id] || 0
                const wasEliminated = player.id === eliminatedId
                const wasSpy = player.id === spyId

                return (
                  <div key={player.id} className={`spy-result-row ${wasEliminated ? 'spy-result-row-danger' : ''}`}>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`bd-avatar h-9 w-9 ${wasSpy ? 'bd-avatar-coral' : 'bd-avatar-lav'}`}>
                        {player.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="flex items-center gap-1 truncate font-bold text-[var(--bd-ink)]">
                          {player.name}
                          {player.isPremium && <span className="shrink-0 text-xs" title="Premium">👑</span>}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {wasSpy && <span className="bd-chip bd-chip-coral py-1 text-[11px]">{t('spy.roles.spy')}</span>}
                          {wasEliminated && <span className="bd-chip bd-chip-sun py-1 text-[11px]">{t('spy.votedOutShort')}</span>}
                        </div>
                      </div>
                    </div>
                    <span className="rounded-lg bg-[var(--bd-bg2)] px-2.5 py-1 text-sm font-black text-[var(--bd-ink)]">
                      {voteCount} {voteCount === 1 ? t('spy.voteLabel') : t('spy.votesLabel')}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="spy-subpanel">
            <h3 className="spy-section-title">{t('spy.scores')}</h3>
            <div className="mt-3 space-y-2">
              {sortedByScore.map((player, index) => (
                <div key={player.id} className="spy-score-row">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--bd-ink)] text-xs font-black text-[var(--bd-bg)]">
                      {index + 1}
                    </span>
                    <span className="flex items-center gap-1 truncate font-bold text-[var(--bd-ink)]">
                      {player.name}
                      {player.isPremium && <span className="shrink-0 text-xs" title="Premium">👑</span>}
                    </span>
                  </div>
                  <span className="text-lg font-black text-[var(--bd-mint-deep)]">
                    {scores[player.id] || 0} {t('profile.gameResults.points')}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {!isGameOver && (
          <p className="mt-5 text-center text-sm font-semibold text-[var(--bd-ink-muted)]">
            {t('spy.round', { current: currentRound, total: totalRounds })}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          {!isGameOver && onNextRound && (
            <button onClick={onNextRound} className="bd-btn bd-btn-primary flex-1 justify-center">
              {t('spy.nextRound')}
            </button>
          )}

          {isGameOver && (
            <>
              {onPlayAgain && (
                <button onClick={onPlayAgain} className="bd-btn bd-btn-primary flex-1 justify-center">
                  {t('spy.playAgain')}
                </button>
              )}
              {onRequestRematch && (
                <button
                  onClick={onRequestRematch}
                  disabled={isRequestRematchPending}
                  className="bd-btn bd-btn-coral flex-1 justify-center disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isRequestRematchPending ? t('common.loading') : t('spy.requestRematch')}
                </button>
              )}
              {onBackToLobby && (
                <button onClick={onBackToLobby} className="bd-btn bd-btn-soft flex-1 justify-center">
                  {t('spy.backToLobby')}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
