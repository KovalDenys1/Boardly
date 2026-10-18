'use client'

import { useCallback, useRef } from 'react'
import { motionCues, useLiveCues, type CuePlay } from '@/hooks/useLiveCues'
import { faceUpCardIds, matchedCardIds, takeRemoteFlips, type MemoryCardLike } from '@/lib/memory-motion'
import { prefersReducedMotion } from '@/lib/motion'
import { playCue } from '@/lib/sound-engine'

/** Must equal the memory-match-pop delay in app/globals.css. */
export const MATCH_POP_DELAY_MS = 400

/** One move turns over at most a pair; a bigger difference is a snapshot catching up. */
const ONE_MOVE_CARDS = 2

export interface MemorySnapshot {
  faceUp: string[]
  matched: string[]
  /** Whose turn it was: the player who made the next change. */
  turn: string | null
}

export interface MemoryCueContext {
  viewerId: string | null | undefined
  isSpectator: boolean
  /** Cards the viewer turned, already heard at the click; ids found here are removed. */
  ownFlips: Set<string>
  reducedMotion?: boolean
}

export function memorySnapshot(cards: readonly MemoryCardLike[], currentPlayerId: string | null): MemorySnapshot | null {
  if (cards.length === 0) return null
  return { faceUp: faceUpCardIds(cards), matched: matchedCardIds(cards), turn: currentPlayerId }
}

export function memoryCues(prev: MemorySnapshot, next: MemorySnapshot, { viewerId, isSpectator, ownFlips, reducedMotion = false }: MemoryCueContext): CuePlay[] {
  const wasUp = new Set(prev.faceUp)
  const isUp = new Set(next.faceUp)
  const wasMatched = new Set(prev.matched)
  const arrived = next.faceUp.filter((id) => !wasUp.has(id))
  const turnedDown = prev.faceUp.filter((id) => !isUp.has(id))
  const matched = next.matched.filter((id) => !wasMatched.has(id))
  const remoteFlips = takeRemoteFlips(arrived, ownFlips)
  if (arrived.length > ONE_MOVE_CARDS || turnedDown.length > ONE_MOVE_CARDS || matched.length > ONE_MOVE_CARDS) return []

  const remote = isSpectator || !viewerId || prev.turn !== viewerId
  const cues: CuePlay[] = []
  if (remoteFlips.length > 0) cues.push({ cue: 'card.flip', options: { remote: true } })
  if (turnedDown.length > 0) cues.push({ cue: 'card.down', options: { remote } })
  if (matched.length > 0) cues.push({ cue: 'card.collect', options: { remote, delayMs: MATCH_POP_DELAY_MS } })
  return motionCues(cues, reducedMotion)
}

export interface UseMemorySoundsOptions {
  gameId: string
  cards: readonly MemoryCardLike[]
  currentPlayerId: string | null
  viewerId: string | null | undefined
  isSpectator: boolean
}

/** Someone else's flip, a pair turning back and a match; the viewer's own flip plays at the click and its echo stays silent. */
export function useMemorySounds({ gameId, cards, currentPlayerId, viewerId, isSpectator }: UseMemorySoundsOptions) {
  const ownFlipsRef = useRef<Set<string>>(new Set())
  useLiveCues(
    memorySnapshot(cards, currentPlayerId),
    (prev, next) => memoryCues(prev, next, { viewerId, isSpectator, ownFlips: ownFlipsRef.current, reducedMotion: prefersReducedMotion() }),
    { scope: gameId, scoped: [ownFlipsRef.current] },
  )
  const playOwnFlip = useCallback((cardId: string) => {
    ownFlipsRef.current.add(cardId)
    playCue('card.flip')
  }, [])
  const forgetOwnFlip = useCallback((cardId: string) => {
    ownFlipsRef.current.delete(cardId)
  }, [])
  return { playOwnFlip, forgetOwnFlip }
}
