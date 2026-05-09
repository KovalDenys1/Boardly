import type { SpectatorViewProps } from '.'

const DISC_RED = 'var(--bd-coral)'
const DISC_YELLOW = 'var(--bd-sun)'
const DISC_EMPTY = 'var(--bd-bg2)'
const ROWS = 6
const COLS = 7

export default function ConnectFourView({ state, players }: SpectatorViewProps) {
  const data = (state.data as Record<string, any>) ?? {}
  const board: (1 | 2 | null)[][] = Array.isArray(data.board)
    ? data.board
    : Array.from({ length: ROWS }, () => Array(COLS).fill(null))
  const winner = data.winner as 1 | 2 | 'draw' | null
  const currentDisc = (data.currentDisc ?? 1) as 1 | 2
  const winningLine = Array.isArray(data.winningLine) ? (data.winningLine as [number, number][]) : null
  const lastDroppedRow = typeof data.lastDroppedRow === 'number' ? data.lastDroppedRow : null
  const lastDroppedCol = typeof data.lastDroppedCol === 'number' ? data.lastDroppedCol : null
  const currentPlayerIndex = typeof state.currentPlayerIndex === 'number' ? state.currentPlayerIndex : 0
  const isFinished = state.status === 'finished' || winner !== null

  const isWinCell = (r: number, c: number) => winningLine?.some(([wr, wc]) => wr === r && wc === c) ?? false
  const discColor = (disc: 1 | 2 | null) => (disc === 1 ? DISC_RED : disc === 2 ? DISC_YELLOW : DISC_EMPTY)
  const playerName = (idx: number) => players[idx]?.user?.username ?? players[idx]?.user?.email ?? `Player ${idx + 1}`

  const statusText = (() => {
    if (winner === 'draw') return 'Draw!'
    if (winner === 1) return `${playerName(0)} wins!`
    if (winner === 2) return `${playerName(1)} wins!`
    return `${playerName(currentPlayerIndex)}'s turn`
  })()

  return (
    <div className="space-y-4">
      <div
        style={{
          background: isFinished ? 'var(--bd-ink)' : discColor(currentDisc),
          color: isFinished ? 'var(--bd-bg)' : 'var(--bd-ink)',
          borderRadius: 14,
          padding: '10px 16px',
          fontWeight: 700,
          fontSize: 14,
          textAlign: 'center',
          boxShadow: isFinished ? '0 4px 0 var(--bd-coral)' : '0 4px 0 var(--bd-line)',
        }}
      >
        {statusText}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[0, 1].map((idx) => {
          const disc = (idx + 1) as 1 | 2
          const color = discColor(disc)
          const isActive = !isFinished && currentPlayerIndex === idx
          const isWinner = winner === disc
          return (
            <div
              key={idx}
              style={{
                border: `2px solid ${isActive || isWinner ? 'var(--bd-ink)' : 'var(--bd-line)'}`,
                boxShadow: isActive || isWinner ? '0 4px 0 var(--bd-ink)' : 'none',
                borderRadius: 16,
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: 'var(--bd-card)',
              }}
            >
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: color, border: '2px solid var(--bd-ink)', flexShrink: 0 }} />
              <span style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {playerName(idx)}
              </span>
              {isWinner && (
                <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, background: 'var(--bd-sun)', border: '2px solid var(--bd-ink)', borderRadius: 8, padding: '2px 6px' }}>
                  WIN
                </span>
              )}
            </div>
          )
        })}
      </div>

      <div
        style={{
          background: 'var(--bd-ink)',
          borderRadius: 18,
          padding: 10,
          display: 'grid',
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gridTemplateRows: `repeat(${ROWS}, 1fr)`,
          gap: 6,
          maxWidth: 360,
          margin: '0 auto',
        }}
      >
        {Array.from({ length: ROWS }, (_, r) =>
          Array.from({ length: COLS }, (_, c) => {
            const cell = board[r]?.[c] ?? null
            const win = isWinCell(r, c)
            const isLast = r === lastDroppedRow && c === lastDroppedCol
            return (
              <div
                key={`${r}-${c}`}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: discColor(cell),
                  border: win ? '3px solid var(--bd-sun)' : isLast && cell ? '3px solid white' : 'none',
                  boxShadow: win
                    ? '0 0 8px var(--bd-sun)'
                    : cell === 1
                      ? '0 2px 6px rgba(255,107,91,0.4)'
                      : cell === 2
                        ? '0 2px 6px rgba(255,196,77,0.4)'
                        : 'inset 0 2px 4px rgba(0,0,0,0.3)',
                  transition: 'background 0.15s',
                }}
              />
            )
          })
        )}
      </div>
    </div>
  )
}
