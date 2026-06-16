import type { SpectatorViewProps } from '.'

interface MemoryCard {
  id: string
  value: string
  isMatched: boolean
  isFlipped: boolean
}

interface MemoryMoveRecord {
  playerId: string
  card1Value: string
  card2Value: string
  isMatch: boolean
  timestamp: number
}

export default function MemoryView({ state, players }: SpectatorViewProps) {
  const data = (state.data as Record<string, unknown>) ?? {}
  const cards: MemoryCard[] = Array.isArray(data.cards) ? (data.cards as MemoryCard[]) : []
  const gridColumns: number = typeof data.gridColumns === 'number' ? data.gridColumns : 4
  const scores = (typeof data.scores === 'object' && data.scores !== null ? data.scores : {}) as Record<string, number>
  const moveHistory: MemoryMoveRecord[] = Array.isArray(data.moveHistory) ? (data.moveHistory as MemoryMoveRecord[]) : []
  const winnerId = typeof data.winnerId === 'string' ? data.winnerId : null
  const currentPlayerIndex = typeof state.currentPlayerIndex === 'number' ? state.currentPlayerIndex : 0
  const isFinished = state.status === 'finished' || winnerId !== null

  const playerName = (p: (typeof players)[number]) => p.user?.username ?? p.name ?? 'Player'

  const getNameById = (id: string) => {
    const p = players.find((pl) => pl.userId === id || pl.id === id)
    return p ? playerName(p) : 'Player'
  }

  const winner = winnerId ? players.find((p) => p.userId === winnerId || p.id === winnerId) : null
  const statusText = isFinished
    ? winner ? `${playerName(winner)} wins!` : 'Draw!'
    : `${playerName(players[currentPlayerIndex] ?? players[0])}'s turn`

  const matchedPairs = cards.filter((c) => c.isMatched).length / 2
  const totalPairs = Math.max(1, cards.length / 2)

  return (
    <div className="space-y-4">
      {/* Status banner */}
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

      {/* Player scores */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        {players.map((player, index) => {
          const pairs = scores[player.userId] ?? scores[player.id] ?? 0
          const isActive = !isFinished && currentPlayerIndex === index
          return (
            <div
              key={player.id}
              className="flex items-center justify-between rounded-2xl border bg-bd-card p-3"
              style={{
                borderColor: isActive ? 'var(--bd-ink)' : 'var(--bd-line)',
                boxShadow: isActive ? '0 3px 0 var(--bd-ink)' : 'none',
              }}
            >
              <span className="truncate font-semibold">{playerName(player)}</span>
              <span className="ml-2 shrink-0 font-bold text-bd-ink">{pairs} pairs</span>
            </div>
          )
        })}
      </div>

      {/* Card grid */}
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
                  ? 'rgba(79,201,166,0.15)'
                  : card.isFlipped
                    ? 'var(--bd-sun)'
                    : 'var(--bd-lav)',
                border: card.isMatched
                  ? '2px solid rgba(47,167,135,0.35)'
                  : card.isFlipped
                    ? '1.5px solid var(--bd-ink)'
                    : '1.5px solid transparent',
                color: faceUp ? 'var(--bd-ink)' : 'rgba(255,255,255,0.5)',
                fontWeight: faceUp ? 'normal' : '900',
                userSelect: 'none',
              }}
            >
              {faceUp ? card.value : '✦'}
            </div>
          )
        })}
      </div>

      <div className="text-center text-xs text-bd-ink-muted">
        {matchedPairs} / {totalPairs} pairs found
      </div>

      {/* Move history */}
      {moveHistory.length > 0 && (
        <div
          style={{
            background: 'white',
            borderRadius: 16,
            border: '1.5px solid var(--bd-line)',
            padding: '12px 14px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--bd-ink)' }}>Moves</span>
            <span style={{ fontSize: 11, color: 'var(--bd-ink-soft)', background: 'var(--bd-bg2)', padding: '2px 8px', borderRadius: 999 }}>
              {moveHistory.length}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
            {moveHistory.slice().reverse().map((m, index) => (
              <div
                key={m.timestamp}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 8, background: 'var(--bd-card-warm)', fontSize: 12 }}
              >
                <span style={{ color: 'var(--bd-ink-muted)', fontFamily: 'ui-monospace,monospace', fontSize: 11, flexShrink: 0 }}>
                  #{String(moveHistory.length - index).padStart(2, '0')}
                </span>
                <span style={{ flex: 1, color: 'var(--bd-ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {getNameById(m.playerId)}
                </span>
                <span style={{ fontWeight: 700, flexShrink: 0, color: m.isMatch ? 'var(--bd-mint-deep)' : 'var(--bd-coral)' }}>
                  {m.isMatch ? '✓' : '✗'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
