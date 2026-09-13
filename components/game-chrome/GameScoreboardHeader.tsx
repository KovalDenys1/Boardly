'use client'

import React from 'react'

/**
 * Shared two-player scoreboard row (#736 phase 3): left card, game-specific
 * center block, right card, optional trailing control (e.g. Memory's Leave
 * button). The decorated background card around it stays per-game — the
 * shared part is the 1fr/auto/1fr row every game was hand-rolling.
 */
export default function GameScoreboardHeader({
  leftCard,
  center,
  rightCard,
  trailing,
}: {
  leftCard: React.ReactNode
  center: React.ReactNode
  rightCard: React.ReactNode
  trailing?: React.ReactNode
}) {
  // Every column is minmax(0, …): with a bare `auto` the centre could not
  // shrink, so as the header narrowed the two 1fr cells collapsed toward zero
  // and the score block ran out over both player cards (#874).
  return (
    <div style={{
      position: 'relative', display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, auto) minmax(0, 1fr)',
      alignItems: 'center', gap: 12,
    }}>
      {leftCard}
      <div style={{ textAlign: 'center', minWidth: 0, overflow: 'hidden' }}>{center}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, minWidth: 0 }}>
        {/* The left card fills its grid cell; in this flex cell the right card
            would shrink to its text, so it is told to fill too – two cards of
            the same kind must be the same size (layout DoD). */}
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>{rightCard}</div>
        {trailing}
      </div>
    </div>
  )
}
