import type { SpectatorViewProps } from '.'

export default function YahtzeeView({ state, players }: SpectatorViewProps) {
  const data = (state.data as Record<string, any>) ?? {}
  const dice = Array.isArray(data.dice) ? data.dice : []
  const held = Array.isArray(data.held) ? data.held : []
  const scores = Array.isArray(data.scores) ? data.scores : []
  const currentPlayerIndex = typeof state.currentPlayerIndex === 'number' ? state.currentPlayerIndex : null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-2">
        {dice.map((die: unknown, index: number) => (
          <div
            key={`${index}-${die}`}
            className={`rounded-2xl border-[1.5px] p-3 text-center text-xl font-black shadow-[0_2px_0_var(--bd-line)] ${
              held[index] ? 'border-bd-sun bg-bd-sun/25 text-bd-sun-deep' : 'border-bd-line bg-[var(--bd-bg2)] text-bd-ink'
            }`}
          >
            {Number(die) || '-'}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl border border-bd-line bg-bd-card-warm p-3 font-semibold text-bd-ink-soft">
          Rolls Left: {typeof data.rollsLeft === 'number' ? data.rollsLeft : '-'}
        </div>
        <div className="rounded-2xl border border-bd-line bg-bd-card-warm p-3 font-semibold text-bd-ink-soft">
          Current Turn:{' '}
          {currentPlayerIndex !== null && players[currentPlayerIndex]
            ? players[currentPlayerIndex].user?.username || players[currentPlayerIndex].name || `Player ${currentPlayerIndex + 1}`
            : '-'}
        </div>
      </div>
      <div className="rounded-2xl border border-bd-line bg-[var(--bd-bg)] p-3">
        <h3 className="mb-2 font-bold text-bd-ink">Scorecards</h3>
        <div className="space-y-2">
          {players.map((player, index) => {
            const scorecard = typeof scores[index] === 'object' && scores[index] !== null ? scores[index] as Record<string, unknown> : {}
            const filled = Object.keys(scorecard).length
            const total = Object.values(scorecard).reduce(
              (sum: number, value) => sum + (typeof value === 'number' ? value : 0),
              0
            )
            return (
              <div key={player.id} className="flex items-center justify-between rounded-xl border border-bd-line bg-bd-card-warm px-3 py-2 text-sm">
                <span>
                  {player.user?.username || player.name || `Player ${index + 1}`}
                  {currentPlayerIndex === index ? ' • turn' : ''}
                </span>
                <span className="text-bd-ink-muted">
                  score {total} • filled {filled}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
