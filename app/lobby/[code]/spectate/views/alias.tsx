import type { SpectatorViewProps } from '.'

interface AliasTeam {
  id: string
  name: string
  playerIds: string[]
  score: number
  describerIndex: number
}

interface WordResult {
  word: string
  result: 'guessed' | 'skipped'
}

const TURN_DURATION_SECS = 60

export default function AliasView({ state, players }: SpectatorViewProps) {
  const data = (state.data as Record<string, any>) ?? {}
  const phase: string = data.phase ?? 'team_assignment'
  const teams: AliasTeam[] = Array.isArray(data.teams) ? data.teams : []
  const currentTeamIndex: number = typeof data.currentTeamIndex === 'number' ? data.currentTeamIndex : 0
  const currentCard: string[] | null = Array.isArray(data.currentCard) ? data.currentCard : null
  const currentCardIndex: number = typeof data.currentCardIndex === 'number' ? data.currentCardIndex : 0
  const currentCardResults: WordResult[] = Array.isArray(data.currentCardResults) ? data.currentCardResults : []
  const turnStartedAt: number | null = typeof data.turnStartedAt === 'number' ? data.turnStartedAt : null
  const winnerId: string | null = typeof data.winnerId === 'string' ? data.winnerId : null

  const playerName = (userId: string) => {
    const p = players.find((pl) => pl.userId === userId || pl.id === userId)
    return p?.user?.username ?? p?.user?.email ?? p?.name ?? userId
  }

  const currentTeam = teams[currentTeamIndex]
  const describerId = currentTeam ? currentTeam.playerIds[currentTeam.describerIndex] : null

  const secondsRemaining = (() => {
    if (!turnStartedAt || phase !== 'turn_active') return null
    const elapsed = Math.floor((Date.now() - turnStartedAt) / 1000)
    return Math.max(0, TURN_DURATION_SECS - elapsed)
  })()

  const guessed = currentCardResults.filter((r) => r.result === 'guessed').length
  const skipped = currentCardResults.filter((r) => r.result === 'skipped').length

  if (phase === 'team_assignment') {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-bd-line bg-bd-card-warm p-4 text-center text-sm font-semibold text-bd-ink-muted">
          Waiting for teams to be assigned…
        </div>
        <TeamScores teams={teams} />
      </div>
    )
  }

  if (phase === 'game_over') {
    const winnerTeam = teams.find((t) => t.playerIds.includes(winnerId ?? '')) ?? teams.reduce((a, b) => (a.score >= b.score ? a : b), teams[0])
    return (
      <div className="space-y-3">
        <div
          className="rounded-2xl p-4 text-center font-bold"
          style={{ background: 'var(--bd-ink)', color: 'var(--bd-bg)', boxShadow: '0 4px 0 var(--bd-sun)', fontSize: 15 }}
        >
          {winnerTeam?.name ?? 'Team'} wins!
        </div>
        <TeamScores teams={teams} />
      </div>
    )
  }

  if (phase === 'turn_results' && data.lastTurnResult) {
    const lastResult = data.lastTurnResult as { teamId: string; wordResults: WordResult[]; scoreDelta: number }
    const lastTeam = teams.find((t) => t.id === lastResult.teamId)
    return (
      <div className="space-y-3">
        <div
          className="rounded-2xl p-3 text-center text-sm font-bold"
          style={{ background: 'var(--bd-mint)', color: 'var(--bd-ink)', boxShadow: '0 3px 0 var(--bd-line)' }}
        >
          {lastTeam?.name ?? 'Team'} turn ended — {lastResult.scoreDelta >= 0 ? '+' : ''}{lastResult.scoreDelta} pts
        </div>
        <TeamScores teams={teams} />
        <div className="rounded-2xl border border-bd-line bg-white p-3">
          <div className="mb-2 text-sm font-bold">Last turn words</div>
          <div className="space-y-1 text-sm">
            {lastResult.wordResults.map((r, i) => (
              <div key={`${i}-${r.word}`} className="flex items-center gap-2 rounded-xl border border-bd-line bg-bd-card-warm px-3 py-1.5">
                <span style={{ color: r.result === 'guessed' ? 'var(--bd-mint-deep)' : 'var(--bd-coral)', fontWeight: 700, fontSize: 12 }}>
                  {r.result === 'guessed' ? '+1' : '−1'}
                </span>
                <span>{r.word}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // turn_active
  const currentWord = currentCard?.[currentCardIndex] ?? null
  return (
    <div className="space-y-3">
      {/* Timer + progress */}
      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-2xl border border-bd-line bg-bd-card-warm p-3">
          <div className="text-xs text-bd-ink-muted">Time left</div>
          <div
            className="mt-0.5 text-lg font-black"
            style={{ color: (secondsRemaining ?? 60) <= 10 ? 'var(--bd-coral)' : 'var(--bd-ink)' }}
          >
            {secondsRemaining ?? '—'}s
          </div>
        </div>
        <div className="rounded-2xl border border-bd-line bg-bd-card-warm p-3">
          <div className="text-xs text-bd-ink-muted">Guessed</div>
          <div className="mt-0.5 text-lg font-black" style={{ color: 'var(--bd-mint-deep)' }}>+{guessed}</div>
        </div>
        <div className="rounded-2xl border border-bd-line bg-bd-card-warm p-3">
          <div className="text-xs text-bd-ink-muted">Skipped</div>
          <div className="mt-0.5 text-lg font-black" style={{ color: 'var(--bd-coral)' }}>−{skipped}</div>
        </div>
      </div>

      {/* Team + describer */}
      <div
        className="rounded-2xl p-3 text-sm"
        style={{ background: 'var(--bd-ink)', color: 'var(--bd-bg)' }}
      >
        <span className="font-bold">{currentTeam?.name}</span>
        {describerId && (
          <span className="text-bd-bg/70"> · {playerName(describerId)} describing</span>
        )}
        <span className="ml-auto float-right text-bd-bg/60 text-xs">
          word {currentCardIndex + 1} / {currentCard?.length ?? 10}
        </span>
      </div>

      {/* Current word — spectators see it */}
      <div
        className="rounded-2xl border-2 border-bd-ink p-5 text-center"
        style={{ boxShadow: '0 4px 0 var(--bd-ink)', background: 'var(--bd-sun)' }}
      >
        <div className="text-xs font-semibold text-bd-ink/60 mb-1">Current word</div>
        <div className="text-2xl font-black text-bd-ink">{currentWord ?? '—'}</div>
      </div>

      <TeamScores teams={teams} />
    </div>
  )
}

function TeamScores({ teams }: { teams: AliasTeam[] }) {
  if (teams.length === 0) return null
  return (
    <div className="grid grid-cols-2 gap-2">
      {teams.map((team, i) => (
        <div
          key={team.id}
          className="rounded-2xl border border-bd-line bg-bd-card p-3 text-center text-sm"
          style={{ borderColor: i === 0 ? 'var(--bd-coral)' : 'var(--bd-lav)' }}
        >
          <div className="font-bold text-bd-ink">{team.name}</div>
          <div className="text-xl font-black" style={{ color: i === 0 ? 'var(--bd-coral)' : 'var(--bd-lav)' }}>
            {team.score}
          </div>
        </div>
      ))}
    </div>
  )
}
