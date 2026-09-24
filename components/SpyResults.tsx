'use client'

import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import { Player } from '@/lib/game-engine'
import AfterGameActions from '@/components/game-chrome/AfterGameActions'
import { resolveSpyGameResult, resolveSpyOutcome } from '@/lib/games/spy-outcome'
import { onOwnAnimationEnd, staggerStyle } from '@/lib/social-motion'

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
  isHost?: boolean
  onRequestRematch?: () => void
  isRequestRematchPending?: boolean
  onBackToLobby?: () => void
  /**
   * `state.winner` as the engine left it, or null on a tie (#905 review). The
   * heading above is the ROUND verdict; on the last round this panel is also
   * the end of the game, and the game is decided by the cumulative scores
   * listed right here - so the game result is named rather than left to be
   * inferred from a sorted list.
   */
  gameWinnerId?: string | null
  /** Host-only: put the lobby back in its waiting room. */
  onReturnToWaiting?: () => void
  isReturningToWaiting?: boolean
  isGuest?: boolean
  registerUrl?: string
  /** Lobby code for the after-game share button (#982). Omit it and only the Discord line shows. */
  lobbyCode?: string
  /** Decided by the caller — a spectator is neither registered here nor a guest (#982). */
  isRegistered?: boolean
  /**
   * Stagger the round's reveal in (#1115): the verdict, then the spy, then the
   * vote rows. True only while this round's result is fresh (SpyGameBoard's
   * useFreshKey), so a reload or a tab switch shows it settled.
   */
  reveal?: boolean
  onRevealEnd?: () => void
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
  isHost = false,
  onRequestRematch,
  isRequestRematchPending = false,
  onBackToLobby,
  gameWinnerId,
  onReturnToWaiting,
  isReturningToWaiting = false,
  isGuest = false,
  registerUrl = '/auth/register',
  lobbyCode,
  isRegistered = false,
  reveal = false,
  onRevealEnd,
}: SpyResultsProps) {
  const { t } = useTranslation()

  // Class and delay for the `step`-th element of the reveal, or nothing.
  const rise = (step: number, className = 'social-rise') =>
    reveal ? { className, style: staggerStyle(step) } : { className: '', style: undefined }

  const { wasGuessRound, guessWasCorrect, spyWon, noElimination } = resolveSpyOutcome({
    spyGuessedLocation,
    location,
    eliminatedId,
    spyId,
  })
  const eliminatedPlayer = players.find((p) => p.id === eliminatedId)
  const spyPlayer = players.find((p) => p.id === spyId)

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

  // The game result, which on the last round is a different statement from the
  // round result above and used to be printed nowhere (#905 review).
  const gameResult = resolveSpyGameResult({ winnerId: gameWinnerId })
  const gameWinnerName = players.find((player) => player.id === gameResult.winnerId)?.name ?? ''

  return (
    <div className="spy-stage">
      <div className="spy-results-card">
        <div className="text-center">
          <p className="bd-kicker">{t('spy.phases.results')}</p>
          <h2
            className={`mt-1 text-3xl font-black sm:text-4xl ${spyWon ? 'text-[var(--bd-coral-deep)]' : 'text-[var(--bd-mint-deep)]'} ${rise(0, 'social-reveal').className}`}
            style={rise(0, 'social-reveal').style}
          >
            {spyWon ? t('spy.spyWins') : t('spy.regularsWin')}
          </h2>
          {wasGuessRound ? (
            <p className={`mt-2 text-base font-semibold text-[var(--bd-ink-soft)] ${rise(2).className}`} style={rise(2).style}>
              {guessWasCorrect
                ? t('spy.guessCorrect', { player: spyPlayer?.name })
                : t('spy.guessWrong', { player: spyPlayer?.name, guess: spyGuessedLocation })}
            </p>
          ) : !noElimination ? (
            <p className={`mt-2 text-base font-semibold text-[var(--bd-ink-soft)] ${rise(2).className}`} style={rise(2).style}>
              {spyWon
                ? t('spy.wasInnocent', { player: eliminatedPlayer?.name })
                : t('spy.wasSpy', { player: spyPlayer?.name })}
            </p>
          ) : (
            <p className={`mt-2 text-base font-semibold text-[var(--bd-ink-soft)] ${rise(2).className}`} style={rise(2).style}>{t('spy.tieNoElimination')}</p>
          )}
          <div style={rise(3).style} className={`mx-auto mt-4 inline-flex ${rise(3).className} rounded-xl border border-[var(--bd-line)] bg-[var(--bd-card-warm)] px-4 py-2 text-sm font-bold text-[var(--bd-ink)]`}>
            {t('spy.locationRevealed', { location })}
          </div>
        </div>

        <div className="mt-7 grid gap-4 lg:grid-cols-[1fr_0.9fr]">
          <section className="spy-subpanel">
            <h3 className="spy-section-title">{t('spy.votes')}</h3>
            <div className="mt-3 space-y-2">
              {sortedByVotes.map((player, index) => {
                const voteCount = voteCounts[player.id] || 0
                const wasEliminated = player.id === eliminatedId
                const wasSpy = player.id === spyId

                return (
                  <div
                    key={player.id}
                    // The spy's row lands with an overshoot: that is the unmasking.
                    // Same duration as a plain row, so the last score row still ends last.
                    className={`spy-result-row ${wasEliminated ? 'spy-result-row-danger' : ''} ${rise(4 + index, wasSpy ? 'social-entry-hit' : 'social-rise').className}`}
                    style={rise(4 + index).style}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`bd-avatar h-9 w-9 ${wasSpy ? 'bd-avatar-coral' : 'bd-avatar-lav'}`}>
                        {player.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="flex items-center gap-1 truncate font-bold text-[var(--bd-ink)]">
                          {player.name}
                          {player.isPremium && <Icon name="crown" size={13} tone="premium" label="Premium" className="shrink-0" />}
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
                <div
                  key={player.id}
                  className={`spy-score-row ${rise(4 + index).className}`}
                  style={rise(4 + index).style}
                  onAnimationEnd={reveal && onRevealEnd && index === sortedByScore.length - 1 ? onOwnAnimationEnd(onRevealEnd) : undefined}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--bd-ink)] text-xs font-black text-[var(--bd-bg)]">
                      {index + 1}
                    </span>
                    <span className="flex items-center gap-1 truncate font-bold text-[var(--bd-ink)]">
                      {player.name}
                      {player.isPremium && <Icon name="crown" size={13} tone="premium" label="Premium" className="shrink-0" />}
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

        {isGameOver && (
          <div
            data-testid="spy-game-result"
            className="mx-auto mt-5 flex w-full max-w-md items-center justify-center gap-2 rounded-2xl border border-[var(--bd-line)] bg-[var(--bd-card-warm)] px-4 py-3 text-center text-base font-black text-[var(--bd-ink)]"
          >
            <Icon name={gameResult.isDraw ? 'handshake' : 'trophy'} size={18} />
            {gameResult.isDraw ? t('spy.gameTie') : t('spy.gameWinner', { player: gameWinnerName })}
          </div>
        )}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          {!isGameOver && onNextRound && (
            <button onClick={onNextRound} className="bd-btn bd-btn-primary flex-1 justify-center">
              {t('spy.nextRound')}
            </button>
          )}

          {isGameOver && (
            <>
              {onPlayAgain !== undefined && (
                isHost ? (
                  <button onClick={onPlayAgain} className="bd-btn bd-btn-primary flex-1 justify-center">
                    {t('spy.playAgain')}
                  </button>
                ) : (
                  <div className="flex-1 rounded-2xl border border-[var(--bd-line)] px-4 py-3 text-center text-sm font-semibold text-bd-ink-muted">
                    {t('game.ui.waitingForHost')}
                  </div>
                )
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
              {onReturnToWaiting && (
                <button
                  onClick={onReturnToWaiting}
                  disabled={isReturningToWaiting}
                  className="bd-btn bd-btn-soft flex-1 justify-center disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t('game.ui.returnToLobby')}
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

        {isGameOver && (
          <div className="mx-auto mt-4 w-full max-w-sm">
            <AfterGameActions
              variant="card"
              inviteCode={lobbyCode}
              gameType="guess_the_spy"
              isGuest={isGuest}
              isRegistered={isRegistered}
              registerUrl={registerUrl}
            />
          </div>
        )}
      </div>
    </div>
  )
}
