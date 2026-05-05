'use client'

import { useState, useEffect } from 'react'
import HeroDemoTicTacToe from './HeroDemoTicTacToe'
import HeroDemoMemory from './HeroDemoMemory'
import HeroDemoConnectFour from './HeroDemoConnectFour'

type Demo = {
  component: React.ComponentType
  badge: string
  badgeColor: string
  badgeTextColor: string
  boardColor: string
  extra: React.ReactNode
}

const DEMOS: Demo[] = [
  {
    component: HeroDemoTicTacToe,
    badge: 'TIC-TAC-TOE',
    badgeColor: 'var(--bd-coral)',
    badgeTextColor: 'white',
    boardColor: 'var(--bd-card-warm)',
    extra: (
      <>
        <div
          className="bd-float"
          style={{
            position: 'absolute', top: '35%', left: '2%',
            fontSize: 48, fontFamily: 'var(--bd-font-display)', fontWeight: 900,
            color: 'var(--bd-coral)', transform: 'rotate(-14deg)',
            animationDelay: '0.4s', lineHeight: 1, userSelect: 'none',
          }}
        >✕</div>
        <div
          className="bd-float"
          style={{
            position: 'absolute', bottom: '18%', right: '1%',
            fontSize: 38, fontFamily: 'var(--bd-font-display)', fontWeight: 900,
            color: 'var(--bd-ink)', transform: 'rotate(9deg)',
            animationDelay: '1.2s', lineHeight: 1, userSelect: 'none',
          }}
        >○</div>
      </>
    ),
  },
  {
    component: HeroDemoMemory,
    badge: 'MEMORY',
    badgeColor: 'var(--bd-sun)',
    badgeTextColor: 'var(--bd-ink)',
    boardColor: 'var(--bd-sky)',
    extra: (
      <>
        <div
          className="bd-float"
          style={{
            position: 'absolute', top: '38%', left: '2%',
            width: 30, height: 40,
            background: 'var(--bd-lav)', border: '2px solid var(--bd-ink)',
            borderRadius: 6, boxShadow: '2px 2px 0 var(--bd-ink)',
            transform: 'rotate(-13deg)', animationDelay: '0.6s',
          }}
        />
        <div
          className="bd-float"
          style={{
            position: 'absolute', bottom: '18%', right: '1%',
            width: 26, height: 36,
            background: 'var(--bd-coral)', border: '2px solid var(--bd-ink)',
            borderRadius: 6, boxShadow: '2px 2px 0 var(--bd-ink)',
            transform: 'rotate(7deg)', animationDelay: '1.4s',
          }}
        />
      </>
    ),
  },
  {
    component: HeroDemoConnectFour,
    badge: 'CONNECT FOUR',
    badgeColor: 'var(--bd-lav)',
    badgeTextColor: 'white',
    boardColor: 'var(--bd-mint)',
    extra: (
      <>
        <div
          className="bd-float"
          style={{
            position: 'absolute', top: '36%', left: '2%',
            width: 38, height: 38,
            background: 'var(--bd-coral)', border: '3px solid var(--bd-ink)',
            borderRadius: '50%', boxShadow: '2px 2px 0 var(--bd-ink)',
            animationDelay: '0.5s',
          }}
        />
        <div
          className="bd-float"
          style={{
            position: 'absolute', bottom: '18%', right: '1%',
            width: 32, height: 32,
            background: 'var(--bd-sun)', border: '3px solid var(--bd-ink)',
            borderRadius: '50%', boxShadow: '2px 2px 0 var(--bd-ink)',
            animationDelay: '1.3s',
          }}
        />
      </>
    ),
  },
]

export default function HeroBoard() {
  const [demoIndex, setDemoIndex] = useState<number | null>(null)

  useEffect(() => {
    setDemoIndex(Math.floor(Math.random() * DEMOS.length))
  }, [])

  if (demoIndex === null) {
    return <StaticFallback />
  }

  const demo = DEMOS[demoIndex]
  const Demo = demo.component

  return (
    <div className="home-hero-board">
      {/* inner wrapper animates — surface + badge move together */}
      <div className="home-hero-board-inner bd-float-board">
        <div
          className="home-hero-board-surface"
          style={{ background: demo.boardColor }}
        >
          <Demo />
        </div>

        {/* badge attached to the board */}
        <div
          style={{
            position: 'absolute',
            top: '-5%',
            right: '-9%',
            background: demo.badgeColor,
            color: demo.badgeTextColor,
            border: '2px solid var(--bd-ink)',
            boxShadow: '2px 2px 0 var(--bd-ink)',
            borderRadius: 999,
            padding: '6px 14px',
            fontFamily: 'var(--bd-font-display)',
            fontWeight: 700,
            fontSize: 13,
            whiteSpace: 'nowrap',
          }}
        >
          {demo.badge}
        </div>
      </div>

      {/* per-game floating decorations */}
      {demo.extra}

      {/* squiggle */}
      <svg
        style={{ position: 'absolute', bottom: '1%', left: '38%', width: 80, height: 40 }}
        viewBox="0 0 80 40"
      >
        <path
          d="M2 20 Q 12 5, 22 20 T 42 20 T 62 20 T 78 20"
          style={{ stroke: 'var(--bd-lav-deep)' }}
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}

function StaticFallback() {
  return (
    <div className="home-hero-board">
      <div className="home-hero-board-inner bd-float-board">
        <div className="home-hero-board-surface" />
      </div>
    </div>
  )
}
