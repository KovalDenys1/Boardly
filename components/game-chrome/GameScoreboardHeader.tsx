'use client'

import React from 'react'
import GameIcon from '@/components/GameIcon'
import GameHeaderActions, { type GameHeaderActionsProps } from '@/components/game-chrome/GameHeaderActions'

/** The game and room the header names, and what its actions need. */
export interface GameHeaderRoom extends GameHeaderActionsProps {
  /** Catalog id, drawn with the game's own GameIcon. */
  gameId: string
  /** Already-translated game name. */
  title: string
}

/**
 * The one in-game header (#736 phase 3, #1577): the game and room, the
 * players, and the actions (invite, Leave) as one unit. On a wide header they
 * share one row; narrower, the game and the actions share the first row and the
 * players take the second. The geometry lives in app/globals.css
 * (`.game-header*`, `.game-scoreboard-*`): an inline style beats any stylesheet
 * rule, so a breakpoint could not tighten it.
 *
 * Players come either as a two-seat row – left card, game-specific centre, right
 * card – or as `players`, one equal track per seat, so the player whose turn it
 * is is marked where they sit and never moved.
 */
export default function GameScoreboardHeader({
  room,
  leftCard,
  center,
  centerCompact,
  rightCard,
  trailing,
  players,
}: {
  room?: GameHeaderRoom
  leftCard?: React.ReactNode
  center?: React.ReactNode
  /**
   * The centre for narrow rows and the phone-landscape side column (#901): two
   * player cards plus a full score block need more than ~300px. Both are
   * rendered into the same grid cell and CSS picks one, so the swap costs no
   * height; games that pass none keep the full block everywhere.
   */
  centerCompact?: React.ReactNode
  rightCard?: React.ReactNode
  /** A control beside the right card, for a header without a room (the replay's way back). */
  trailing?: React.ReactNode
  /** Every seat in seat order, for games that show the whole table (Ludo, Yahtzee). */
  players?: React.ReactNode[]
}) {
  const seats = players ? (
    <div
      className="game-scoreboard-players"
      style={{ '--game-header-seats': String(players.length) } as React.CSSProperties}
    >
      {players.map((card, index) => (
        <div key={index} className="game-scoreboard-player">{card}</div>
      ))}
    </div>
  ) : (
    // Every column is minmax(0, …): with a bare `auto` the centre could not
    // shrink, so the two 1fr cells collapsed toward zero and the score ran out
    // over both player cards (#874).
    <div className={`game-scoreboard-header${centerCompact === undefined ? '' : ' game-scoreboard-header--has-compact'}`}>
      <div className="game-scoreboard-cell game-scoreboard-cell--left">{leftCard}</div>
      <div className="game-scoreboard-cell game-scoreboard-center">{center}</div>
      {centerCompact !== undefined && (
        <div className="game-scoreboard-cell game-scoreboard-center game-scoreboard-center--compact">
          {centerCompact}
        </div>
      )}
      <div className="game-scoreboard-cell game-scoreboard-cell--right">
        {/* Told to fill its cell: two cards of the same kind are the same size (layout DoD). */}
        <div className="game-scoreboard-right-card">{rightCard}</div>
        {trailing}
      </div>
    </div>
  )

  if (!room) return seats

  const { gameId, title, ...actions } = room
  return (
    <div className="game-header">
      <div className="game-header__layout">
        <div className="game-header__bar">
          <div className="game-header__title">
            <span className="game-header__icon" aria-hidden>
              <GameIcon gameId={gameId} accentColor="currentColor" detailColor="var(--bd-bg2)" size={18} variant="bare" />
            </span>
            <span className="game-header__text">
              <span className="game-header__name">{title}</span>
              <span className="game-header__code">#{actions.code}</span>
            </span>
          </div>
          <GameHeaderActions {...actions} />
        </div>
        {seats}
      </div>
    </div>
  )
}
