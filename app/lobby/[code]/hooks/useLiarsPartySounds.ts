'use client'

import { motionCues, useLiveCues, type CuePlay } from '@/hooks/useLiveCues'
import type { LiarsPartyGameData } from '@/lib/games/liars-party-game'
import { prefersReducedMotion } from '@/lib/motion'
import { LIARS_BREAKDOWN_FIRST_STEP, LIARS_REVEAL_MS, LIARS_VERDICT_STEP, liarsRevealLastStep, staggerDelayMs } from '@/lib/social-motion'

export interface LiarsPartySnapshot {
  round: number
  phase: string
  claimBy: string | null
  /** The claimant said nothing in time; there is no verdict for a claim nobody made. */
  claimTimedOut: boolean
  /** Only known once the reveal shows it. */
  bluff: boolean | null
  /** In the order the vote rows are drawn. */
  votes: { id: string; challenge: boolean }[]
  /** Struck out by the rounds: a player who leaves is eliminated too, but with the strikes they had. */
  struckOut: string[]
  /** The reveal on screen carries its round's points, so the standings move during it. */
  scored: boolean
}

export interface LiarsPartyCueContext {
  viewerId: string | null | undefined
  isSpectator: boolean
  reducedMotion?: boolean
}

export function liarsPartySnapshot(data: LiarsPartyGameData): LiarsPartySnapshot {
  const resolved = data.roundResults.find((result) => result.round === data.currentRound)
  return {
    round: data.currentRound,
    phase: data.phase,
    claimBy: data.claim?.playerId ?? null,
    claimTimedOut: !!data.claim?.autoSubmitted,
    bluff: data.phase === 'reveal' ? resolved?.wasBluff ?? data.claim?.isBluff ?? false : null,
    votes: data.challengeVotes.map((vote) => ({ id: vote.playerId, challenge: vote.decision === 'challenge' })),
    struckOut: data.eliminatedPlayerIds.filter((id) => (data.strikes[id] ?? 0) >= data.eliminationThreshold).sort(),
    scored: data.phase === 'reveal' && !!resolved,
  }
}

function revealCues(s: LiarsPartySnapshot, ownId: string | null): CuePlay[] {
  if (!s.claimBy || s.claimTimedOut) return []
  const lastStep = liarsRevealLastStep(s.votes.length)
  const cues: CuePlay[] = [{ cue: 'verdict.stamp', options: { delayMs: staggerDelayMs(LIARS_VERDICT_STEP, lastStep) } }]
  if (!ownId) return cues
  if (s.claimBy === ownId) {
    const challengers = s.votes.filter((vote) => vote.challenge).length
    const caught = !!s.bluff && challengers > s.votes.length - challengers
    cues.push({ cue: caught ? 'round.lost' : 'round.won', options: { delayMs: staggerDelayMs(LIARS_BREAKDOWN_FIRST_STEP, lastStep) } })
    return cues
  }
  const row = s.votes.findIndex((vote) => vote.id === ownId)
  if (row >= 0) {
    const calledIt = s.votes[row].challenge === !!s.bluff
    cues.push({ cue: calledIt ? 'round.won' : 'round.lost', options: { delayMs: staggerDelayMs(LIARS_BREAKDOWN_FIRST_STEP + row, lastStep) } })
  }
  return cues
}

export function liarsPartyCues(prev: LiarsPartySnapshot, next: LiarsPartySnapshot, { viewerId, isSpectator, reducedMotion = false }: LiarsPartyCueContext): CuePlay[] {
  const ownId = isSpectator ? null : viewerId ?? null
  const sameRound = prev.round === next.round
  const cues: CuePlay[] = []
  if (sameRound && !prev.claimBy && next.claimBy && next.claimBy !== ownId && !next.claimTimedOut) {
    cues.push({ cue: 'card.place', options: { remote: true } })
  }
  if (sameRound && next.votes.some((vote) => vote.id !== ownId && !prev.votes.some((seen) => seen.id === vote.id))) {
    cues.push({ cue: 'vote.cast', options: { remote: true } })
  }
  const revealStarts = next.phase === 'reveal' && !(sameRound && prev.phase === 'reveal')
  if (revealStarts) cues.push(...revealCues(next, ownId))
  // The engine strikes a player out as the reveal starts, where the eliminated card lands last; a reveal saved before that strikes them out on the way out.
  if (next.struckOut.some((id) => !prev.struckOut.includes(id))) {
    const lastStep = liarsRevealLastStep(next.votes.length)
    cues.push(revealStarts ? { cue: 'player.out', options: { delayMs: staggerDelayMs(lastStep, lastStep) } } : { cue: 'player.out' })
  }
  if (revealStarts && next.scored) cues.push({ cue: 'score.add', options: { delayMs: LIARS_REVEAL_MS } })
  return motionCues(cues, reducedMotion)
}

/** Others' claims and votes, the reveal and who is struck out; my own claim and vote play once the server accepts them. */
export function useLiarsPartySounds(
  data: LiarsPartyGameData | undefined,
  { gameId, viewerId, isSpectator }: Omit<LiarsPartyCueContext, 'reducedMotion'> & { gameId: string | null | undefined },
): void {
  useLiveCues(data ? liarsPartySnapshot(data) : null, (prev, next) => liarsPartyCues(prev, next, { viewerId, isSpectator, reducedMotion: prefersReducedMotion() }), {
    scope: gameId,
  })
}
