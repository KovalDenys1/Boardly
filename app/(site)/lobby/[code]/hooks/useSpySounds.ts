'use client'

import { useRef } from 'react'
import { motionCues, useLiveCues, type CuePlay } from '@/hooks/useLiveCues'
import { startedJustNow } from '@/hooks/useFreshFor'
import { TURN_AFTER_MOVE_MS } from '@/hooks/useTurnSounds'
import { SpyGamePhase } from '@/lib/games/spy-game'
import { prefersReducedMotion } from '@/lib/motion'

/** Must equal the spy-role-flip delay in app/globals.css. */
export const ROLE_FLIP_DELAY_MS = 300

/** Round 1's roles are dealt inside game creation, so its reveal arrives with the board (useFreshOnArrival's window). */
const DEALT_JUST_NOW_MS = 4000

export interface SpySnapshot {
  phase: string
  round: number
  /** The viewer's role card is on screen, so it turns over. */
  roleCard: boolean
  questioner: string | null
  /** Whom the pending question asks. */
  asked: string | null
  entries: number
  /** Who answered the newest entry: the target, whose action completed it. */
  answeredBy: string | null
  voters: string[]
  /** When the results reveal says who the vote put out; null when nobody went. */
  outAtMs: number | null
}

export interface SpyCueContext {
  viewerId: string | null | undefined
  isSpectator: boolean
  /** Rounds whose deal was heard live, so a role card that loads late still flips aloud; updated here. */
  liveDeals: Set<number>
  reducedMotion?: boolean
}

function dealCues(snapshot: SpySnapshot, ctx: SpyCueContext): CuePlay[] {
  ctx.liveDeals.add(snapshot.round)
  const cues: CuePlay[] = [{ cue: 'card.deal' }]
  if (snapshot.roleCard) cues.push({ cue: 'card.flip', options: { delayMs: ROLE_FLIP_DELAY_MS } })
  return motionCues(cues, !!ctx.reducedMotion)
}

export function spyLoadCues(first: SpySnapshot, phaseStartedAt: number, nowMs: number, ctx: SpyCueContext): CuePlay[] {
  // A spectator was never dealt in, so a page they open on a reveal is only the state they arrived to.
  if (ctx.isSpectator || first.phase !== SpyGamePhase.ROLE_REVEAL || !startedJustNow(phaseStartedAt, nowMs, DEALT_JUST_NOW_MS)) return []
  return dealCues(first, ctx)
}

export function spyCues(prev: SpySnapshot, next: SpySnapshot, ctx: SpyCueContext): CuePlay[] {
  const seated = !ctx.isSpectator && !!ctx.viewerId
  const mine = (id: string | null) => seated && id === ctx.viewerId
  const sameRound = prev.round === next.round
  const samePhase = sameRound && prev.phase === next.phase
  const questioning = (s: SpySnapshot) => s.phase === SpyGamePhase.QUESTIONING
  const myQuestion = (s: SpySnapshot) => (questioning(s) && mine(s.questioner) ? `${s.round}:${s.entries}` : null)
  const myAnswer = (s: SpySnapshot) => (questioning(s) && mine(s.asked) ? `${s.round}:${s.entries}:${s.questioner}` : null)

  if (next.phase === SpyGamePhase.ROLE_REVEAL && !samePhase) return dealCues(next, ctx)

  const cues: CuePlay[] = []
  if (next.phase === SpyGamePhase.ROLE_REVEAL && !prev.roleCard && next.roleCard && ctx.liveDeals.has(next.round)) {
    cues.push({ cue: 'card.flip', options: { delayMs: ROLE_FLIP_DELAY_MS } })
  }
  if (sameRound && next.entries === prev.entries + 1 && !mine(next.answeredBy)) {
    cues.push({ cue: 'card.place', options: { remote: true } })
  }
  const question = myQuestion(next)
  if (question && question !== myQuestion(prev)) cues.push({ cue: 'turn.mine', options: { delayMs: TURN_AFTER_MOVE_MS } })
  const answer = myAnswer(next)
  if (answer && answer !== myAnswer(prev)) cues.push({ cue: 'turn.mine' })
  if (next.phase === SpyGamePhase.VOTING && samePhase && next.voters.some((id) => !prev.voters.includes(id) && !mine(id))) {
    cues.push({ cue: 'vote.cast', options: { remote: true } })
  }
  if (next.phase === SpyGamePhase.RESULTS && !samePhase) {
    cues.push({ cue: 'verdict.stamp' })
    if (next.outAtMs !== null) cues.push({ cue: 'player.out', options: { delayMs: next.outAtMs } })
  }
  return motionCues(cues, !!ctx.reducedMotion)
}

export interface UseSpySoundsOptions {
  gameId: string
  viewerId: string | null | undefined
  isSpectator: boolean
  phaseStartedAt: number
}

/** The table's moves for Guess the Spy; the viewer's own ask, answer, ready and vote play once the server accepts them. */
export function useSpySounds(snapshot: SpySnapshot | null, { gameId, viewerId, isSpectator, phaseStartedAt }: UseSpySoundsOptions): void {
  const liveDealsRef = useRef<Set<number>>(new Set())
  const ctx = { viewerId, isSpectator, liveDeals: liveDealsRef.current, reducedMotion: prefersReducedMotion() }
  useLiveCues(snapshot, (prev, next) => spyCues(prev, next, ctx), {
    scope: gameId,
    scoped: [liveDealsRef.current],
    loadCues: (first) => spyLoadCues(first, phaseStartedAt, Date.now(), ctx),
  })
}
