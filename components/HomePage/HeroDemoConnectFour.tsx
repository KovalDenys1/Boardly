'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'

const COLS = 6
const ROWS = 5

type Cell = 'red' | 'yellow' | null
type Board = Cell[][]

function makeBoard(): Board {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null))
}

function getNextRow(board: Board, col: number): number | null {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (!board[r][col]) return r
  }
  return null
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
  const [animatingDisc, setAnimatingDisc] = useState<{ row: number; col: number; player: Cell } | null>(null)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    setIsMobile(window.innerWidth <= 767)
  }, [])

  const reset = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    setBoard(makeBoard())
    setWinner(null)
    setAnimatingDisc(null)
  }, [])

  useEffect(() => {
    if (!winner) return
    const t = setTimeout(reset, 2400)
    return () => clearTimeout(t)
  }, [winner, reset])

  const CELL = isMobile ? 22 : 28
  const GAP = isMobile ? 3 : 4
  const PADDING = isMobile ? 5 : 7

  const getAnimDuration = useCallback((row: number) => {
    return 180 + Math.round((row + 1) * (CELL + GAP) * 0.7)
  }, [CELL, GAP])

  function handleColClick(col: number) {
    if (winner || board[0][col] || animatingDisc) return

    const playerRow = getNextRow(board, col)
    if (playerRow === null) return
    const playerBoard = dropPiece(board, col, 'red')
    if (!playerBoard) return

    setBoard(playerBoard)
    setAnimatingDisc({ row: playerRow, col, player: 'red' })
    const playerDur = getAnimDuration(playerRow)

    if (checkWin(playerBoard, 'red')) {
      const t = setTimeout(() => { setWinner('red'); setAnimatingDisc(null) }, playerDur + 50)
      timersRef.current.push(t)
      return
    }
    if (playerBoard.every((row) => row.every(Boolean))) {
      setWinner('draw'); setAnimatingDisc(null); return
    }

    const botCol = botMove(playerBoard)
    const botRow = getNextRow(playerBoard, botCol)
    if (botRow === null) return
    const botBoard = dropPiece(playerBoard, botCol, 'yellow')
    if (!botBoard) return

    const t1 = setTimeout(() => {
      setBoard(botBoard)
      setAnimatingDisc({ row: botRow, col: botCol, player: 'yellow' })
      const botDur = getAnimDuration(botRow)
      const t2 = setTimeout(() => {
        setAnimatingDisc(null)
        if (checkWin(botBoard, 'yellow')) setWinner('yellow')
        else if (botBoard.every((r) => r.every(Boolean))) setWinner('draw')
      }, botDur + 50)
      timersRef.current.push(t2)
    }, playerDur + 100)
    timersRef.current.push(t1)
  }

  const statusText =
    winner === 'red' ? '🎉 You win!'
    : winner === 'yellow' ? 'Bot wins!'
    : winner === 'draw' ? 'Draw!'
    : 'Drop a piece'

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: isMobile ? 6 : 8, padding: isMobile ? '6px 8px' : '10px 8px',
    }}>
      <div style={{
        fontFamily: 'var(--bd-font-display)', fontWeight: 600, fontSize: 11,
        color: 'var(--bd-ink-muted)', minHeight: isMobile ? 0 : 16, textAlign: 'center', width: '100%',
      }}>
        {statusText}
      </div>

      <div style={{ position: 'relative' }}>
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
                  cursor: winner || board[0][c] || animatingDisc ? 'default' : 'pointer',
                  fontSize: 13, fontWeight: 900,
                  color: hoverCol === c && !board[0][c] && !winner && !animatingDisc ? 'var(--bd-coral)' : 'transparent',
                  transition: 'color 0.1s',
                }}
              >
                ▼
              </div>
            ))}
          </div>
        )}

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
            row.map((cell, c) => {
              const isAnimating = !!(
                animatingDisc &&
                animatingDisc.row === r &&
                animatingDisc.col === c &&
                animatingDisc.player === cell
              )
              const fallDist = isAnimating ? (animatingDisc!.row + 1) * (CELL + GAP) : 0
              const durationMs = 180 + Math.round(fallDist * 0.7)
              const discColor = cell === 'red' ? 'var(--bd-coral)' : cell === 'yellow' ? 'var(--bd-sun)' : null
              const emptyBg = hoverCol === c && !board[0][c] && !winner && !animatingDisc
                ? 'rgba(255,255,255,0.55)'
                : 'rgba(255,255,255,0.35)'

              return (
                <div
                  key={`${r}-${c}`}
                  onClick={() => handleColClick(c)}
                  style={{
                    position: 'relative',
                    width: CELL, height: CELL,
                    overflow: 'visible',
                    cursor: winner || board[0][c] || !!animatingDisc ? 'default' : 'pointer',
                  }}
                >
                  <div style={{
                    position: 'absolute', inset: 0,
                    borderRadius: '50%',
                    background: cell && !isAnimating ? discColor! : emptyBg,
                    border: cell && !isAnimating
                      ? '2.5px solid var(--bd-ink)'
                      : '2px solid rgba(31,27,22,0.2)',
                    boxShadow: cell && !isAnimating
                      ? '0 2px 0 rgba(31,27,22,0.25)'
                      : 'inset 0 2px 4px rgba(31,27,22,0.1)',
                  }} />
                  {isAnimating && (
                    <div style={{
                      position: 'absolute', inset: 0,
                      borderRadius: '50%',
                      background: discColor!,
                      border: '2.5px solid var(--bd-ink)',
                      boxShadow: '0 2px 0 rgba(31,27,22,0.25)',
                      animation: `c4-drop-simple ${durationMs}ms cubic-bezier(0.4, 0, 0.6, 1) both`,
                      '--c4-fall-dist': `${fallDist}px`,
                    } as React.CSSProperties} />
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      <Link
        href="/games/connect-four"
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
