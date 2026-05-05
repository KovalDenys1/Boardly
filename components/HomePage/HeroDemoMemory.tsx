'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

const PAIRS = ['🎲', '🃏', '🏆', '⭐', '🎮', '🎯']
const INITIAL_CARDS = [...PAIRS, ...PAIRS]
  .map((emoji, i) => ({ id: i, emoji, matched: false }))
  .sort(() => Math.random() - 0.5)

type Card = { id: number; emoji: string; matched: boolean }

export default function HeroDemoMemory() {
  const [cards, setCards] = useState<Card[]>(INITIAL_CARDS)
  const [flipped, setFlipped] = useState<number[]>([])
  const [locked, setLocked] = useState(false)

  const reset = useCallback(() => {
    setCards(
      [...PAIRS, ...PAIRS]
        .map((emoji, i) => ({ id: i, emoji, matched: false }))
        .sort(() => Math.random() - 0.5)
    )
    setFlipped([])
    setLocked(false)
  }, [])

  const allMatched = cards.every((c) => c.matched)

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
        setTimeout(() => {
          setFlipped([])
          setLocked(false)
        }, 900)
      }
    }
  }

  const matchedCount = cards.filter((c) => c.matched).length / 2

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '12px 8px' }}>
      <div style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 13, color: 'rgba(31,27,22,0.65)', minHeight: 20 }}>
        {allMatched ? '🎉 All matched!' : `${matchedCount} / ${PAIRS.length} pairs found`}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 46px)', gridTemplateRows: 'repeat(3, 52px)', gap: 7 }}>
        {cards.map((card, i) => {
          const isFlipped = flipped.includes(i) || card.matched
          return (
            <button
              key={card.id + '-' + i}
              onClick={() => handleFlip(i)}
              style={{
                width: 46, height: 52,
                background: card.matched
                  ? 'rgba(255,255,255,0.8)'
                  : isFlipped
                    ? 'rgba(255,255,255,0.7)'
                    : 'var(--bd-ink)',
                border: '2.5px solid var(--bd-ink)',
                borderRadius: 10,
                fontSize: isFlipped ? 22 : 0,
                cursor: card.matched || locked ? 'default' : 'pointer',
                boxShadow: isFlipped ? 'none' : '0 3px 0 rgba(31,27,22,0.3)',
                transition: 'background 0.2s, font-size 0.15s',
                lineHeight: 1,
                padding: 0,
                opacity: card.matched ? 0.55 : 1,
              }}
            >
              {isFlipped ? card.emoji : ''}
            </button>
          )
        })}
      </div>

      <Link
        href="/games/memory"
        style={{ fontSize: 11, fontWeight: 600, color: 'rgba(31,27,22,0.5)', textDecoration: 'underline', marginTop: 4 }}
      >
        Play full game →
      </Link>
    </div>
  )
}
