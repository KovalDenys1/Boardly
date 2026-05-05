'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

const PAIRS = ['🎲', '🃏', '🏆', '⭐', '🎮', '🎯']

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5)
}

type Card = { id: number; emoji: string; matched: boolean }

function makeCards(): Card[] {
  return shuffle([...PAIRS, ...PAIRS]).map((emoji, i) => ({ id: i, emoji, matched: false }))
}

export default function HeroDemoMemory() {
  const [cards, setCards] = useState<Card[]>(makeCards)
  const [flipped, setFlipped] = useState<number[]>([])
  const [locked, setLocked] = useState(false)

  const reset = useCallback(() => {
    setCards(makeCards())
    setFlipped([])
    setLocked(false)
  }, [])

  const allMatched = cards.every((c) => c.matched)
  const matchedCount = cards.filter((c) => c.matched).length / 2

  useEffect(() => {
    if (!allMatched) return
    const t = setTimeout(reset, 2000)
    return () => clearTimeout(t)
  }, [allMatched, reset])

  function handleFlip(idx: number) {
    if (locked || cards[idx].matched || flipped.includes(idx)) return
    const next = [...flipped, idx]
    setFlipped(next)

    if (next.length === 2) {
      setLocked(true)
      const [a, b] = next
      if (cards[a].emoji === cards[b].emoji) {
        setCards((prev) => prev.map((c, i) => (i === a || i === b ? { ...c, matched: true } : c)))
        setFlipped([])
        setLocked(false)
      } else {
        setTimeout(() => { setFlipped([]); setLocked(false) }, 900)
      }
    }
  }

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 12, padding: '16px 8px',
    }}>
      <div style={{
        fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 14,
        color: 'rgba(31,27,22,0.8)', minHeight: 22,
      }}>
        {allMatched ? '🎉 All matched!' : `${matchedCount} / ${PAIRS.length} pairs`}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 48px)', gridTemplateRows: 'repeat(3, 54px)', gap: 7 }}>
        {cards.map((card, i) => {
          const isFlipped = flipped.includes(i) || card.matched
          return (
            <button
              key={card.id + '-' + i}
              onClick={() => handleFlip(i)}
              style={{
                width: 48, height: 54,
                background: card.matched
                  ? 'rgba(255,255,255,0.85)'
                  : isFlipped
                    ? '#fff'
                    : 'var(--bd-ink)',
                border: `2.5px solid ${card.matched ? 'rgba(31,27,22,0.2)' : 'var(--bd-ink)'}`,
                borderRadius: 10,
                fontSize: isFlipped ? 24 : 16,
                color: isFlipped ? 'var(--bd-ink)' : 'rgba(255,255,255,0.35)',
                cursor: card.matched || locked ? 'default' : 'pointer',
                boxShadow: isFlipped ? 'none' : '0 4px 0 rgba(31,27,22,0.35)',
                transition: 'background 0.18s, box-shadow 0.18s, font-size 0.12s',
                lineHeight: 1,
                padding: 0,
              }}
            >
              {isFlipped ? card.emoji : '?'}
            </button>
          )
        })}
      </div>

      <Link
        href="/games/memory"
        style={{
          fontSize: 12, fontWeight: 600,
          color: 'rgba(31,27,22,0.6)', textDecoration: 'underline', marginTop: 2,
        }}
      >
        Play full game →
      </Link>
    </div>
  )
}
