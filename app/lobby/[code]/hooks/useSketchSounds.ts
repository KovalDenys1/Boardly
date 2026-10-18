'use client'

import { useCallback, useRef } from 'react'
import { useLiveCues, type CuePlay } from '@/hooks/useLiveCues'
import { TURN_AFTER_MOVE_MS } from '@/hooks/useTurnSounds'
import { playCue } from '@/lib/sound-engine'

export interface SketchSnapshot {
  round: number
  phase: string
  /** Who has the word this round (the engine's submittedPlayerIds). */
  guessed: string[]
}

export interface SketchCueContext {
  viewerId: string | null | undefined
  isSpectator: boolean
  /** `round:playerId` of correct guesses already heard (mine, or one I accepted); updated here. */
  heard: Set<string>
  /** `round:playerId` of accepts I sent that the server has not answered yet; their echo waits for the answer. */
  pending?: ReadonlySet<string>
}

export function sketchCues(prev: SketchSnapshot, next: SketchSnapshot, ctx: SketchCueContext): CuePlay[] {
  if (prev.round !== next.round) return []
  const ownId = ctx.isSpectator ? null : ctx.viewerId
  const cues: CuePlay[] = []
  for (const id of next.guessed) {
    const key = `${next.round}:${id}`
    if (prev.guessed.includes(id) || ctx.heard.has(key) || ctx.pending?.has(key)) continue
    ctx.heard.add(key)
    if (id === ownId) cues.push({ cue: 'guess.correct' })
    else if (!cues.some((c) => c.cue === 'score.add')) cues.push({ cue: 'score.add', options: { remote: true } })
  }
  if (next.phase === 'reveal' && prev.phase !== 'reveal') {
    cues.push({ cue: 'round.end', options: cues.length > 0 ? { delayMs: TURN_AFTER_MOVE_MS } : undefined })
  }
  return cues
}

export interface UseSketchSoundsOptions {
  gameId: string | null | undefined
  viewerId: string | null | undefined
  isSpectator: boolean
}

/** Others' correct guesses and the round's reveal; my own guess and accept play once the server has answered. */
export function useSketchSounds(snapshot: SketchSnapshot | null, { gameId, viewerId, isSpectator }: UseSketchSoundsOptions) {
  const heardRef = useRef<Set<string>>(new Set())
  const pendingRef = useRef<Set<string>>(new Set())
  useLiveCues(snapshot, (prev, next) => sketchCues(prev, next, { viewerId, isSpectator, heard: heardRef.current, pending: pendingRef.current }), {
    scope: gameId,
    scoped: [heardRef.current, pendingRef.current],
  })
  const round = snapshot?.round ?? null

  const playGuessResult = useCallback(
    (result: { correct: boolean; close: boolean } | undefined) => {
      if (!result || round === null || !viewerId) return
      if (result.correct) {
        const key = `${round}:${viewerId}`
        if (heardRef.current.has(key)) return
        heardRef.current.add(key)
        playCue('guess.correct')
      } else if (result.close) playCue('guess.close')
    },
    [round, viewerId],
  )

  const acceptAloud = useCallback(
    async (playerId: string | undefined, submit: () => Promise<boolean>) => {
      const key = round !== null && playerId ? `${round}:${playerId}` : null
      if (key) pendingRef.current.add(key)
      const accepted = await submit()
      if (key) pendingRef.current.delete(key)
      if (!accepted || (key && heardRef.current.has(key))) return
      if (key) heardRef.current.add(key)
      playCue('score.add')
    },
    [round],
  )

  return { playGuessResult, acceptAloud }
}
