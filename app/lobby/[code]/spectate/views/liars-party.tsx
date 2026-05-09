import type { SpectatorViewProps } from '.'

type Phase = 'claim' | 'challenge' | 'reveal'

interface Claim {
  playerId: string
  text: string
  isBluff: boolean
  submittedAt: number
}

interface ChallengeVote {
  playerId: string
  decision: 'challenge' | 'believe'
}

export default function LiarsPartyView({ state, players }: SpectatorViewProps) {
  const data = (state.data as Record<string, any>) ?? {}
  const phase = (data.phase ?? 'claim') as Phase
  const currentRound: number = typeof data.currentRound === 'number' ? data.currentRound : 1
  const maxRounds: number = typeof data.maxRounds === 'number' ? data.maxRounds : 10
  const currentClaimantId: string = typeof data.currentClaimantId === 'string' ? data.currentClaimantId : ''
  const claim: Claim | null = typeof data.claim === 'object' && data.claim !== null ? data.claim as Claim : null
  const challengeVotes: ChallengeVote[] = Array.isArray(data.challengeVotes) ? data.challengeVotes : []
  const submittedPlayerIds: string[] = Array.isArray(data.submittedPlayerIds) ? data.submittedPlayerIds : []
  const activePlayerIds: string[] = Array.isArray(data.activePlayerIds) ? data.activePlayerIds : []
  const eliminatedPlayerIds: string[] = Array.isArray(data.eliminatedPlayerIds) ? data.eliminatedPlayerIds : []
  const scores = (typeof data.scores === 'object' && data.scores !== null ? data.scores : {}) as Record<string, number>
  const strikes = (typeof data.strikes === 'object' && data.strikes !== null ? data.strikes : {}) as Record<string, number>
  const winnerId: string | null = typeof data.winnerId === 'string' ? data.winnerId : null

  const playerName = (id: string) => {
    const p = players.find((pl) => pl.userId === id || pl.id === id)
    return p?.user?.username ?? p?.user?.email ?? p?.name ?? id
  }

  const claimantName = playerName(currentClaimantId)
  const challenged = challengeVotes.filter((v) => v.decision === 'challenge').length
  const believed = challengeVotes.filter((v) => v.decision === 'believe').length
  const votersNeeded = activePlayerIds.length - 1 // claimant doesn't vote

  const PHASE_LABELS: Record<Phase, string> = {
    claim: 'Making a claim',
    challenge: 'Voting',
    reveal: 'Reveal',
  }

  const PHASE_COLORS: Record<Phase, string> = {
    claim: 'var(--bd-sun)',
    challenge: 'var(--bd-coral)',
    reveal: 'var(--bd-mint)',
  }

  return (
    <div className="space-y-3">
      {/* Round + phase header */}
      <div className="flex items-center gap-2">
        <div className="rounded-2xl border border-bd-line bg-bd-card-warm px-3 py-2 text-sm font-bold text-bd-ink">
          Round {currentRound} / {maxRounds}
        </div>
        <div
          className="rounded-2xl px-3 py-2 text-sm font-bold"
          style={{ background: PHASE_COLORS[phase], color: 'var(--bd-ink)', border: '2px solid var(--bd-ink)' }}
        >
          {PHASE_LABELS[phase]}
        </div>
        {winnerId && (
          <div className="rounded-2xl px-3 py-2 text-sm font-bold" style={{ background: 'var(--bd-ink)', color: 'var(--bd-bg)' }}>
            {playerName(winnerId)} wins!
          </div>
        )}
      </div>

      {/* Claimant */}
      <div className="rounded-2xl border border-bd-line bg-bd-card p-3 text-sm">
        <span className="text-bd-ink-muted">Claimant: </span>
        <span className="font-bold text-bd-ink">{claimantName}</span>
      </div>

      {/* Claim text */}
      {claim ? (
        <div
          className="rounded-2xl border-2 p-4"
          style={{ borderColor: 'var(--bd-ink)', background: 'var(--bd-card-warm)', boxShadow: '0 4px 0 var(--bd-ink)' }}
        >
          <div className="mb-1 text-xs font-semibold text-bd-ink-muted uppercase tracking-wide">Claim</div>
          <div className="text-base font-semibold text-bd-ink">{claim.text}</div>
          {/* Show isBluff only after reveal phase — don't spoil during challenge */}
          {phase === 'reveal' && (
            <div
              className="mt-2 inline-block rounded-xl px-2 py-1 text-xs font-bold"
              style={{
                background: claim.isBluff ? 'var(--bd-coral)' : 'var(--bd-mint)',
                color: 'var(--bd-ink)',
                border: '1.5px solid var(--bd-ink)',
              }}
            >
              {claim.isBluff ? 'BLUFF' : 'TRUTH'}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-bd-line bg-bd-card-warm p-4 text-center text-sm text-bd-ink-muted">
          Waiting for claim…
        </div>
      )}

      {/* Vote progress (challenge phase) */}
      {(phase === 'challenge' || phase === 'reveal') && (
        <div className="rounded-2xl border border-bd-line bg-white p-3">
          <div className="mb-2 text-sm font-bold">
            Votes {submittedPlayerIds.length} / {votersNeeded}
          </div>
          <div className="flex gap-2 text-sm">
            <div
              className="flex-1 rounded-xl p-2 text-center font-bold"
              style={{ background: 'var(--bd-coral)', color: 'var(--bd-ink)', border: '1.5px solid var(--bd-ink)' }}
            >
              Challenge {challenged}
            </div>
            <div
              className="flex-1 rounded-xl p-2 text-center font-bold"
              style={{ background: 'var(--bd-mint)', color: 'var(--bd-ink)', border: '1.5px solid var(--bd-ink)' }}
            >
              Believe {believed}
            </div>
          </div>
        </div>
      )}

      {/* Player list */}
      <div className="rounded-2xl border border-bd-line bg-white p-3">
        <div className="mb-2 text-sm font-bold">Players</div>
        <div className="space-y-1.5">
          {players.map((player) => {
            const uid = player.userId || player.id
            const isEliminated = eliminatedPlayerIds.includes(uid)
            const isClaimant = uid === currentClaimantId
            const playerScore = typeof scores[uid] === 'number' ? scores[uid] : 0
            const playerStrikes = typeof strikes[uid] === 'number' ? strikes[uid] : 0
            return (
              <div
                key={player.id}
                className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
                style={{
                  borderColor: isClaimant ? 'var(--bd-ink)' : 'var(--bd-line)',
                  background: isEliminated ? 'var(--bd-bg2)' : 'var(--bd-card-warm)',
                  opacity: isEliminated ? 0.5 : 1,
                }}
              >
                <span className="font-semibold flex-1 truncate" style={{ color: isEliminated ? 'var(--bd-ink-muted)' : 'var(--bd-ink)' }}>
                  {playerName(uid)}
                  {isClaimant && <span className="ml-1 text-xs">✦</span>}
                </span>
                <span className="text-bd-ink-muted text-xs">{playerScore} pts</span>
                {playerStrikes > 0 && (
                  <span className="text-xs" style={{ color: 'var(--bd-coral)' }}>
                    {'⚡'.repeat(Math.min(playerStrikes, 3))}
                  </span>
                )}
                {isEliminated && <span className="text-xs text-bd-ink-muted">out</span>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
