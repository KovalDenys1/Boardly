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
    const full = next.every((row) => row.every(Boolean))
    if (full) { setBoard(next); setWinner('draw'); return }

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
    : winner === 'draw' ? "It's a draw!"
    : 'Drop a piece ↓'

  const CELL = 33
  const GAP = 5

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 8px' }}>
      {/* Coming soon badge */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'var(--bd-sun)', border: '2px solid var(--bd-ink)',
        borderRadius: 999, padding: '3px 10px',
        fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 11, color: 'var(--bd-ink)',
        boxShadow: '2px 2px 0 var(--bd-ink)',
      }}>
        🚧 Connect Four — coming soon
      </div>

      <div style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 13, color: 'rgba(31,27,22,0.65)', minHeight: 18 }}>
        {statusText}
      </div>

      {/* Column click targets */}
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', gap: GAP, marginBottom: 4, paddingLeft: 7, paddingRight: 7 }}>
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
                fontSize: 12,
                color: hoverCol === c && !board[0][c] && !winner ? 'var(--bd-coral)' : 'transparent',
                transition: 'color 0.1s',
                fontWeight: 900,
              }}
            >
              ▼
            </div>
          ))}
        </div>

        {/* Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${COLS}, ${CELL}px)`,
          gridTemplateRows: `repeat(${ROWS}, ${CELL}px)`,
          gap: GAP,
          background: 'rgba(255,255,255,0.3)',
          border: '2.5px solid var(--bd-ink)',
          borderRadius: 14,
          padding: 7,
          boxShadow: '0 3px 0 rgba(31,27,22,0.15)',
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
                        ? 'rgba(255,107,91,0.2)'
                        : 'rgba(255,255,255,0.5)',
                  border: `2px solid ${cell ? 'var(--bd-ink)' : 'rgba(31,27,22,0.2)'}`,
                  cursor: winner || board[0][c] ? 'default' : 'pointer',
                  transition: 'background 0.1s',
                  boxShadow: cell ? '0 2px 0 rgba(31,27,22,0.2)' : 'none',
                }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
