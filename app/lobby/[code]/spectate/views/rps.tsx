import type { SpectatorViewProps } from '.'

export default function RpsView({ state, players }: SpectatorViewProps) {
  const data = (state.data as Record<string, any>) ?? {}
  const scores = (typeof data.scores === 'object' && data.scores !== null ? data.scores : {}) as Record<string, unknown>
  const rounds = Array.isArray(data.rounds) ? data.rounds : []

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2">
        {players.map((player, index) => (
          <div key={player.id} className="flex items-center justify-between rounded-2xl border border-bd-line bg-bd-card-warm p-3 text-sm">
            <span>{player.user?.username || player.user?.email || `Player ${index + 1}`}</span>
            <span className="font-bold text-bd-ink">
              Score: {typeof scores[player.userId] === 'number' ? scores[player.userId] : 0}
            </span>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-bd-line bg-white p-3">
        <div className="mb-2 text-sm font-bold">Recent Rounds ({rounds.length})</div>
        <div className="space-y-2 text-sm">
          {rounds.slice(-5).map((round: Record<string, unknown>, index: number) => (
            <div
              key={`${index}-${typeof round.winner === 'string' ? round.winner : 'none'}`}
              className="rounded-xl border border-bd-line bg-bd-card-warm px-3 py-2"
            >
              Winner: {typeof round.winner === 'string' ? round.winner : 'pending'}
            </div>
          ))}
          {rounds.length === 0 && <div className="text-bd-ink-muted">No completed rounds yet</div>}
        </div>
      </div>
    </div>
  )
}
