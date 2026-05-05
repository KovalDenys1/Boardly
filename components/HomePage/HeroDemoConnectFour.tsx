'use client'

import { useState, useEffect, useCallback } from 'react'

const COLS = 6
const ROWS = 5

type Cell = 'red' | 'yellow' | null
type Board = Cell[][]

function makeBoard(): Board {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null))
}

function dropPiece(board: Board, col: number, player: Cell): Board | null {
  for (let row = ROWS - 1; row >= 0; row--) {
    if (!board[row][col]) {
      const next = board.map((r) => [...r])
      next[row][col] = player
      return next
    }
  }
  return null
}

function checkWin(board: Board, player: Cell): boolean {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (
        (c + 3 < COLS && [0,1,2,3].every((i) => board[r][c + i] === player)) ||
        (r + 3 < ROWS && [0,1,2,3].every((i) => board[r + i][c] === player)) ||
        (r + 3 < ROWS && c + 3 < COLS && [0,1,2,3].every((i) => board[r + i][c + i] === player)) ||
        (r + 3 < ROWS && c - 3 >= 0 && [0,1,2,3].every((i) => board[r + i][c - i] === player))
      ) return true
    }
  }
  return false
}

function botMove(board: Board): number {
  for (let c = 0; c < COLS; c++) {
    const b = dropPiece(board, c, 'yellow')
    if (b && checkWin(b, 'yellow')) return c
  }
  for (let c = 0; c < COLS; c++) {
    const b = dropPiece(board, c, 'red')
    if (b && checkWin(b, 'red')) return c
  }
  const available = Array.from({ length: COLS }, (_, i) => i).filter((c) => !board[0][c])
  return available[Math.floor(Math.random() * available.length)]
}

export default function HeroDemoConnectFour() {
  const [board, setBoard] = useState<Board>(makeBoard)
  const [winner, setWinner] = useState<'red' | 'yellow' | 'draw' | null>(null)
  const [hoverCol, setHoverCol] = useState<number | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setIsMobile(window.innerWidth <= 767)
  }, [])

  const reset = useCallback(() => {
    setBoard(makeBoard())
    setWinner(null)
  }, [])

  useEffect(() => {
    if (!winner) return
    const t = setTimeout(reset, 2400)
    return () => clearTimeout(t)
  }, [winner, reset])

  function handleColClick(col: number) {
    if (winner || board[0][col]) return
    let next = dropPiece(board, col, 'red')
    if (!next) return
    if (checkWin(next, 'red')) { setBoard(next); setWinner('red'); return }
    if (next.every((row) => row.every(Boolean))) { setBoard(next); setWinner('draw'); return }

    const bot = botMove(next)
    if (bot >= 0) {
      next = dropPiece(next, bot, 'yellow') ?? next
      if (checkWin(next, 'yellow')) { setBoard(next); setWinner('yellow'); return }
    }
    setBoard(next)
  }

  const statusText =
    winner === 'red' ? '🎉 You win!'
    : winner === 'yellow' ? 'Bot wins!'
    : winner === 'draw' ? "Draw!"
    : 'Drop a piece'

  const CELL = isMobile ? 22 : 28
  const GAP = isMobile ? 3 : 4
  const PADDING = isMobile ? 5 : 7

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: isMobile ? 6 : 8, padding: isMobile ? '6px 8px' : '10px 8px',
    }}>
      {/* coming soon badge */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        background: 'rgba(255,255,255,0.9)', border: '2px solid var(--bd-ink)',
        borderRadius: 999, padding: '4px 12px',
        fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 11, color: 'var(--bd-ink)',
        boxShadow: '2px 2px 0 var(--bd-ink)',
      }}>
        🚧 Coming soon
      </div>

      <div style={{
        fontFamily: 'var(--bd-font-display)', fontWeight: 600, fontSize: 11,
        color: 'rgba(31,27,22,0.55)', minHeight: isMobile ? 0 : 16, textAlign: 'center', width: '100%',
      }}>
        {statusText}
      </div>

      <div style={{ position: 'relative' }}>
        {/* drop indicators — hidden on mobile (no hover on touch) */}
        {!isMobile && (
          <div style={{ display: 'flex', gap: GAP, marginBottom: 4, paddingLeft: PADDING, paddingRight: PADDING }}>
            {Array.from({ length: COLS }, (_, c) => (
              <div
                key={c}
                onClick={() => handleColClick(c)}
                onMouseEnter={() => setHoverCol(c)}
                onMouseLeave={() => setHoverCol(null)}
                style={{
                  width: CELL, height: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: winner || board[0][c] ? 'default' : 'pointer',
                  fontSize: 13, fontWeight: 900,
                  color: hoverCol === c && !board[0][c] && !winner ? 'var(--bd-coral)' : 'transparent',
                  transition: 'color 0.1s',
                }}
              >
                ▼
              </div>
            ))}
          </div>
        )}

        {/* grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${COLS}, ${CELL}px)`,
          gridTemplateRows: `repeat(${ROWS}, ${CELL}px)`,
          gap: GAP,
          background: 'rgba(31,27,22,0.15)',
          border: '2.5px solid var(--bd-ink)',
          borderRadius: 14,
          padding: PADDING,
          boxShadow: '0 4px 0 rgba(31,27,22,0.2)',
        }}>
          {board.map((row, r) =>
            row.map((cell, c) => (
              <div
                key={`${r}-${c}`}
                onClick={() => handleColClick(c)}
                style={{
                  width: CELL, height: CELL,
                  borderRadius: '50%',
                  background: cell === 'red'
                    ? 'var(--bd-coral)'
                    : cell === 'yellow'
                      ? 'var(--bd-sun)'
                      : hoverCol === c && !board[0][c] && !winner
                        ? 'rgba(255,255,255,0.55)'
                        : 'rgba(255,255,255,0.35)',
                  border: cell
                    ? '2.5px solid var(--bd-ink)'
                    : '2px solid rgba(31,27,22,0.2)',
                  cursor: winner || board[0][c] ? 'default' : 'pointer',
                  transition: 'background 0.12s',
                  boxShadow: cell ? '0 2px 0 rgba(31,27,22,0.25)' : 'inset 0 2px 4px rgba(31,27,22,0.1)',
                }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
