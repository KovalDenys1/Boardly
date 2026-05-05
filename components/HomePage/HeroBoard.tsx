'use client'

import { useState, useEffect } from 'react'
import HeroDemoTicTacToe from './HeroDemoTicTacToe'
import HeroDemoMemory from './HeroDemoMemory'
import HeroDemoConnectFour from './HeroDemoConnectFour'

const DEMOS = [
  {
    component: HeroDemoTicTacToe,
    badge: 'TIC-TAC-TOE',
    rotate: '10deg',
    color: 'var(--bd-coral)',
    textColor: 'white',
  },
  {
    component: HeroDemoMemory,
    badge: 'MEMORY',
    rotate: '-8deg',
    color: 'var(--bd-sun)',
    textColor: 'var(--bd-ink)',
  },
  {
    component: HeroDemoConnectFour,
    badge: 'CONNECT FOUR',
    rotate: '12deg',
    color: 'var(--bd-lav)',
    textColor: 'var(--bd-ink)',
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
      <div className="home-hero-board-surface">
        <Demo />
      </div>

      {/* game badge sticker */}
      <div
        className="bd-float"
        style={{
          position: 'absolute',
          top: '3%',
          right: '3%',
          transform: `rotate(${demo.rotate})`,
          background: demo.color,
          color: demo.textColor,
          border: '2px solid var(--bd-ink)',
          boxShadow: '2px 2px 0 var(--bd-ink)',
          borderRadius: 999,
          padding: '6px 14px',
          fontFamily: 'var(--bd-font-display)',
          fontWeight: 700,
          fontSize: 13,
          animationDelay: '0.3s',
          whiteSpace: 'nowrap',
        }}
      >
        {demo.badge}
      </div>

      {/* squiggle decoration */}
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
      <div className="home-hero-board-surface" />
      <div
        className="bd-float"
        style={{
          position: 'absolute',
          top: '4%',
          right: '4%',
          transform: 'rotate(12deg)',
          background: 'var(--bd-sun)',
          color: 'var(--bd-ink)',
          border: '2px solid var(--bd-ink)',
          boxShadow: '2px 2px 0 var(--bd-ink)',
          borderRadius: 999,
          padding: '6px 14px',
          fontFamily: 'var(--bd-font-display)',
          fontWeight: 700,
          fontSize: 13,
        }}
      >
        BOARDLY
      </div>
    </div>
  )
}
