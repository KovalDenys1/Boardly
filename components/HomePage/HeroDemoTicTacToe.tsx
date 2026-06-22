'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

type Cell = 'X' | 'O' | null

const WINS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]

function checkWinner(board: Cell[]): Cell | 'draw' | null {
  for (const [a, b, c] of WINS) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a]
  }
  if (board.every(Boolean)) return 'draw'
  return null
}

function botMove(board: Cell[]): number {
  for (const [a, b, c] of WINS) {
    if (board[a] === 'O' && board[b] === 'O' && !board[c]) return c
    if (board[a] === 'O' && !board[b] && board[c] === 'O') return b
    if (!board[a] && board[b] === 'O' && board[c] === 'O') return a
  }
  for (const [a, b, c] of WINS) {
    if (board[a] === 'X' && board[b] === 'X' && !board[c]) return c
    if (board[a] === 'X' && !board[b] && board[c] === 'X') return b
    if (!board[a] && board[b] === 'X' && board[c] === 'X') return a
  }
  if (!board[4]) return 4
  const empty = board.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0)
  return empty[Math.floor(Math.random() * empty.length)]
}

const EMPTY: Cell[] = Array(9).fill(null)

export default function HeroDemoTicTacToe() {
  const [board, setBoard] = useState<Cell[]>(EMPTY)
  const [winner, setWinner] = useState<Cell | 'draw' | null>(null)

  const reset = useCallback(() => {
    setBoard(EMPTY)
    setWinner(null)
  }, [])

  function handleClick(i: number) {
    if (board[i] || winner) return
    const next = [...board]
    next[i] = 'X'
    const w = checkWinner(next)
    if (!w) {
      const bot = botMove(next)
      if (bot >= 0) next[bot] = 'O'
    }
    setBoard(next)
    setWinner(checkWinner(next))
  }

  useEffect(() => {
    if (!winner) return
    const t = setTimeout(reset, 2200)
    return () => clearTimeout(t)
  }, [winner, reset])

  const statusText =
    winner === 'X' ? '🎉 You win!'
    : winner === 'O' ? 'Bot wins!'
    : winner === 'draw' ? "Draw!"
    : 'Your turn (X)'

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 12, padding: '16px 8px',
    }}>
      <div style={{
        fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 14,
        color: 'var(--bd-ink-muted)', minHeight: 22,
      }}>
        {statusText}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 64px)', gridTemplateRows: 'repeat(3, 64px)', gap: 8 }}>
        {board.map((cell, i) => (
          <button
            key={i}
            onClick={() => handleClick(i)}
            style={{
              width: 64, height: 64,
              background: 'var(--bd-input-bg)',
              border: '2.5px solid var(--bd-ink)',
              borderRadius: 14,
              fontSize: 28,
              fontWeight: 900,
              fontFamily: 'var(--bd-font-display)',
              color: cell === 'X' ? 'var(--bd-coral)' : 'var(--bd-ink)',
              cursor: cell || winner ? 'default' : 'pointer',
              boxShadow: cell ? 'none' : '0 4px 0 rgba(31,27,22,0.2)',
              transition: 'box-shadow 0.08s, transform 0.08s',
              lineHeight: 1,
              padding: 0,
            }}
          >
            {cell}
          </button>
        ))}
      </div>

      <Link
        href="/games/tic-tac-toe"
        style={{
          fontSize: 12, fontWeight: 600,
          color: 'var(--bd-ink-muted)', textDecoration: 'underline', marginTop: 2,
        }}
      >
        Play full game →
      </Link>
    </div>
  )
}
