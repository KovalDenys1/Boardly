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
  centerCompact,
  rightCard,
  trailing,
}: {
  leftCard: React.ReactNode
  center: React.ReactNode
  /**
   * The center block for the phone-landscape side column (#901). That column
   * is `min(300px, 42vw)` wide, and two player cards plus a full score block
   * need more than it has: the three columns collided and the score ran out
   * over both cards. A short center — the score and nothing else — is what
   * fits. Both are rendered into the same grid cell and CSS picks one, so the
   * swap costs no height; games that pass none keep the full block everywhere.
   */
  centerCompact?: React.ReactNode
  rightCard: React.ReactNode
  trailing?: React.ReactNode
}) {
  // Every column is minmax(0, …): with a bare `auto` the centre could not
  // shrink, so as the header narrowed the two 1fr cells collapsed toward zero
  // and the score block ran out over both player cards (#874).
  // The geometry lives in app/globals.css (.game-scoreboard-*) rather than in
  // a style prop: an inline style beats any stylesheet rule, so while it was
  // here the phone-landscape breakpoint could not tighten the row at all.
  return (
    <div className={`game-scoreboard-header${centerCompact === undefined ? '' : ' game-scoreboard-header--has-compact'}`}>
      <div className="game-scoreboard-cell game-scoreboard-cell--left">{leftCard}</div>
      <div className="game-scoreboard-cell game-scoreboard-center">{center}</div>
      {centerCompact !== undefined && (
        <div className="game-scoreboard-cell game-scoreboard-center game-scoreboard-center--compact">
          {centerCompact}
        </div>
      )}
      <div className="game-scoreboard-cell game-scoreboard-cell--right">
        {/* The left card fills its grid cell; in this flex cell the right card
            would shrink to its text, so it is told to fill too – two cards of
            the same kind must be the same size (layout DoD). */}
        <div className="game-scoreboard-right-card">{rightCard}</div>
        {trailing}
      </div>
    </div>
  )
}
