import type { SpectatorViewProps } from '.'

interface MemoryCard {
  id: string
  value: string
  isMatched: boolean
  isFlipped: boolean
}

export default function MemoryView({ state, players }: SpectatorViewProps) {
  const data = (state.data as Record<string, any>) ?? {}
  const cards: MemoryCard[] = Array.isArray(data.cards) ? data.cards : []
  const gridColumns: number = typeof data.gridColumns === 'number' ? data.gridColumns : 4
  const scores = (typeof data.scores === 'object' && data.scores !== null ? data.scores : {}) as Record<string, number>
  const winnerId = typeof data.winnerId === 'string' ? data.winnerId : null
  const currentPlayerIndex = typeof state.currentPlayerIndex === 'number' ? state.currentPlayerIndex : 0
  const isFinished = state.status === 'finished' || winnerId !== null

  const playerName = (p: (typeof players)[number]) => p.user?.username ?? p.name

  const winner = winnerId ? players.find((p) => p.userId === winnerId || p.id === winnerId) : null
  const statusText = isFinished
    ? winner ? `${playerName(winner)} wins!` : 'Game over!'
    : `${playerName(players[currentPlayerIndex] ?? players[0])}'s turn`

  return (
    <div className="space-y-4">
      <div
        className="rounded-2xl p-3 text-center text-sm font-bold"
        style={{
          background: isFinished ? 'var(--bd-ink)' : 'var(--bd-mint)',
          color: isFinished ? 'var(--bd-bg)' : 'var(--bd-ink)',
          boxShadow: isFinished ? '0 4px 0 var(--bd-coral)' : '0 4px 0 var(--bd-line)',
        }}
      >
        {statusText}
      </div>

      {/* Scores */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        {players.map((player, index) => {
          const pairs = typeof scores[player.userId] === 'number' ? scores[player.userId] : 0
          const isActive = !isFinished && currentPlayerIndex === index
          return (
            <div
              key={player.id}
              className="flex items-center justify-between rounded-2xl border bg-bd-card p-3"
              style={{ borderColor: isActive ? 'var(--bd-ink)' : 'var(--bd-line)', boxShadow: isActive ? '0 3px 0 var(--bd-ink)' : 'none' }}
            >
              <span className="truncate font-semibold">{playerName(player)}</span>
              <span className="ml-2 shrink-0 font-bold text-bd-ink">{pairs} pairs</span>
            </div>
          )
        })}
      </div>

      {/* Card grid — spectators see all cards: matched face-up, active flip face-up, rest face-down */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${gridColumns}, 1fr)`,
          gap: 4,
          maxWidth: 380,
          margin: '0 auto',
        }}
      >
        {cards.map((card) => {
          const faceUp = card.isMatched || card.isFlipped
          return (
            <div
              key={card.id}
              style={{
                aspectRatio: '1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 10,
                fontSize: gridColumns <= 4 ? 22 : 16,
                background: card.isMatched
                  ? 'var(--bd-mint)'
                  : card.isFlipped
                    ? 'var(--bd-sun)'
                    : 'var(--bd-ink)',
                border: card.isMatched ? '2px solid var(--bd-ink)' : '1.5px solid transparent',
                color: faceUp ? 'var(--bd-ink)' : 'transparent',
                userSelect: 'none',
              }}
            >
              {faceUp ? card.value : ''}
            </div>
          )
        })}
      </div>

      <div className="text-center text-xs text-bd-ink-muted">
        {cards.filter((c) => c.isMatched).length / 2} / {cards.length / 2} pairs found
      </div>
    </div>
  )
}
