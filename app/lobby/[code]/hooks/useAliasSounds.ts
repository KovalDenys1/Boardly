'use client'

import type { GameOutcome } from '@/components/game-chrome/GameStatusBanner'
import { useLiveCues, type CuePlay } from '@/hooks/useLiveCues'
import { TURN_AFTER_MOVE_MS } from '@/hooks/useTurnSounds'
import { useTurnTimerSounds } from '@/hooks/useTurnTimerSounds'
import type { AliasGameData } from '@/lib/games/alias'
import { resultCue } from '@/lib/game-outcome'

/** One update settles a word or two; more is a snapshot catching up. */
const ONE_MOVE_WORDS = 2

export interface AliasSnapshot {
  /** The turn's server stamp, which _endTurn keeps, so a turn's last word and its results compare. */
  turn: number | null
  phase: AliasGameData['phase']
  /** The describer of this turn; once it ends the engine has already moved its team to the next one. */
  describer: string | null
  words: ('guessed' | 'skipped')[]
  /** state.lastMoveAt: every move stamps it, the timeout fallback skipping the rest of the card does not. */
  moveAt: number | null
}

export function aliasSnapshot(data: AliasGameData, lastMoveAt: number | null = null): AliasSnapshot {
  const team = data.teams?.[data.currentTeamIndex]
  const ended = data.phase === 'turn_results'
  return {
    turn: data.turnStartedAt ?? null,
    phase: data.phase,
    describer: ended ? data.lastTurnResult?.describerId ?? null : team?.playerIds[team.describerIndex ?? 0] ?? null,
    words: (ended ? data.lastTurnResult?.wordResults ?? [] : data.phase === 'turn_active' ? data.currentCardResults : []).map((r) => r.result),
    moveAt: lastMoveAt,
  }
}

export function aliasCues(prev: AliasSnapshot, next: AliasSnapshot, { viewerId, isSpectator }: { viewerId: string | null | undefined; isSpectator: boolean }): CuePlay[] {
  const ownId = isSpectator ? null : viewerId ?? null
  const cues: CuePlay[] = []
  const sameTurn = next.turn === prev.turn
  // A turn's start and its first word can arrive in one update, so a new turn counts its words from none.
  const settled = next.words.length - (sameTurn ? prev.words.length : 0)
  const moved = next.moveAt !== prev.moveAt
  if (moved && settled > 0 && settled <= ONE_MOVE_WORDS && next.describer !== ownId) {
    cues.push({ cue: next.words[next.words.length - 1] === 'guessed' ? 'card.correct' : 'card.skip', options: { remote: true } })
  }
  if (next.phase === 'turn_results' && (prev.phase !== 'turn_results' || !sameTurn)) {
    cues.push({ cue: 'round.end', options: { delayMs: TURN_AFTER_MOVE_MS } })
  }
  return cues
}

export interface UseAliasSoundsOptions {
  /** The server's state while the game is playing, so nothing sounds for an optimistic move the server refuses. */
  data: AliasGameData | undefined
  lastMoveAt: number | null
  /** The server's game row: its status, never the optimistic engine's, decides the finish. */
  game: { id: string; status: string } | null
  outcome: GameOutcome | undefined
  viewerId: string | null | undefined
  isSpectator: boolean
  /** The turn clock's seconds left. */
  remaining: number
}

/** Others' words, the turn's results, the clock and the result: Alias has no GameResultOverlay, so its result plays here. */
export function useAliasSounds({ data, lastMoveAt, game, outcome, viewerId, isSpectator, remaining }: UseAliasSoundsOptions): void {
  useLiveCues(data ? aliasSnapshot(data, lastMoveAt) : null, (prev, next) => aliasCues(prev, next, { viewerId, isSpectator }), { scope: game?.id })

  const team = data?.teams?.[data.currentTeamIndex]
  const onTurnTeam = !isSpectator && !!viewerId && !!team?.playerIds.includes(viewerId)
  useTurnTimerSounds(remaining, data?.phase === 'turn_active' && onTurnTeam)

  useLiveCues(
    game ? { id: game.id, finished: game.status === 'finished', outcome: outcome ?? null } : null,
    (prev, next) => (!prev.finished && next.finished ? [{ cue: resultCue(next.outcome ?? undefined, isSpectator), options: { gameId: next.id } }] : []),
    { scope: game?.id },
  )
}
