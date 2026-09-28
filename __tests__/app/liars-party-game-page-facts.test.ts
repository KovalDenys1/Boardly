import { readFileSync } from 'node:fs'
import path from 'node:path'

import { getCatalogGames } from '@/lib/game-catalog'
import { getGameMetadata } from '@/lib/game-registry'
import { FREE_MAX_PLAYERS } from '@/lib/lobby-create-query'
import { LiarsPartyGame, type LiarsPartyGameData, type LiarsPartyRoundResult } from '@/lib/games/liars-party-game'
import en from '@/locales/en'

/**
 * #1240, the #973 pattern: /games/liars-party states numbers and rules, and each
 * one is recomputed here from the catalog, the registry and the engine, so a
 * change there fails this file instead of leaving the page describing a game
 * that no longer exists.
 */

const lp = en.games.liars_party
const detail = lp.detail
const entry = getCatalogGames().find((game) => game.gameType === 'liars_party')!
const config = entry.lobbyCreateConfig!
const PLAYERS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']

/** '+20' → 20, '−12' (U+2212) → -12. */
function points(value: string): number {
  return Number(value.replace('−', '-').replace('+', ''))
}

function startedGame(playerCount = 4) {
  // No `rules`: the page promises the defaults, which is what every lobby gets.
  const engine = new LiarsPartyGame('liars-facts')
  for (const id of PLAYERS.slice(0, playerCount)) engine.addPlayer({ id, name: id })
  expect(engine.startGame()).toBe(true)
  return engine
}

const data = (engine: LiarsPartyGame) => engine.getState().data as LiarsPartyGameData
const move = (engine: LiarsPartyGame, playerId: string, type: string, payload: Record<string, unknown> = {}) =>
  engine.makeMove({ playerId, type, data: payload, timestamp: new Date() })

/** Plays one full round: the claimant claims, each voter votes, anyone advances. */
function playRound(engine: LiarsPartyGame, isBluff: boolean, votes: Record<string, 'challenge' | 'believe'>): LiarsPartyRoundResult {
  const claimant = data(engine).currentClaimantId
  expect(move(engine, claimant, 'submit-claim', { claim: 'I once met a famous chef', isBluff })).toBe(true)
  for (const [voter, decision] of Object.entries(votes)) expect(move(engine, voter, 'submit-challenge', { decision })).toBe(true)
  expect(data(engine).phase).toBe('reveal')
  expect(move(engine, Object.keys(votes)[0], 'advance-round')).toBe(true)
  return data(engine).roundResults.at(-1)!
}

describe('the Liar\'s Party table against the catalog and the registry (#1240)', () => {
  it('seats 4 to 12, 8 by default, with more than ten behind Premium', () => {
    const meta = getGameMetadata('liars_party')!
    expect([meta.minPlayers, meta.maxPlayers]).toEqual([4, 12])
    expect(config.allowedPlayers).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(config.defaultMaxPlayers).toBe(8)
    expect(FREE_MAX_PLAYERS).toBe(10)
    expect(detail.modes.tableSize.desc).toMatch(/4 to 12 seats, 8 by default; more than ten needs a Premium host/)
    expect(entry.players).toBe('4-12')
  })

  it('has no bots, as the page says', () => {
    expect(getGameMetadata('liars_party')!.supportsBots).toBe(false)
    expect(detail.multiplayer.botsAndSolo.desc).toMatch(/no bots/)
  })

  it('offers no clock on the create form, so every room starts on the 60-second default', () => {
    expect(config.turnTimer).toBeUndefined()
    const create = readFileSync(path.join(process.cwd(), 'app/lobby/create/page.tsx'), 'utf8')
    expect(create).toContain('turnTimer: GAME_INFO[selectedGameType].settings.defaultTurnTimer || 60')
    const panel = readFileSync(path.join(process.cwd(), 'app/lobby/[code]/components/LobbySettingsPanel.tsx'), 'utf8')
    expect(panel).toContain('const baseOptions = [30, 60, 90, 120, 150, 180]')
    expect(detail.modes.phaseClock.desc).toMatch(/60 seconds; before the start, the host can pick 30 to 180/)
  })
})

describe('the Liar\'s Party rules against the engine (#1240)', () => {
  it('plays ten rounds with two strikes when the lobby sets nothing', () => {
    const engine = startedGame()
    expect([data(engine).maxRounds, data(engine).eliminationThreshold]).toEqual([10, 2])
    expect(detail.modes.roundsAndStrikes.desc).toMatch(/^Ten rounds and two strikes; no lobby setting changes them/)
    expect(detail.rules.strikesAndEnd).toMatch(/^Two caught bluffs put you out\. The game ends after ten rounds/)
  })

  it('takes claims of 5 to 180 characters', () => {
    const engine = startedGame()
    const claim = (text: string) => engine.validateMove({ playerId: 'p1', type: 'submit-claim', data: { claim: text, isBluff: false }, timestamp: new Date() })
    expect([claim('abcd'), claim('abcde'), claim('x'.repeat(180)), claim('x'.repeat(181))]).toEqual([false, true, true, false])
    expect(detail.faq.whatCanIClaim.a).toMatch(/5 to 180 characters/)
  })

  it('lets an even split through, so a bluff is caught only when challengers outnumber believers', () => {
    const engine = startedGame(5)
    const tie = playRound(engine, true, { p2: 'challenge', p3: 'challenge', p4: 'believe', p5: 'believe' })
    expect(tie.bluffCaught).toBe(false)
    const majority = playRound(engine, true, { p1: 'challenge', p3: 'challenge', p4: 'challenge', p5: 'believe' })
    expect(majority.bluffCaught).toBe(true)
    expect(detail.rules.caughtNeedsMore).toMatch(/an even split lets it through/)
  })

  it('ranks players still in above anyone knocked out, whatever the scores', () => {
    const engine = startedGame(5)
    // p1 fools the whole table and leads by 44 points; p2 is out on two caught bluffs.
    playRound(engine, true, { p2: 'believe', p3: 'believe', p4: 'believe', p5: 'believe' })
    playRound(engine, true, { p1: 'challenge', p3: 'challenge', p4: 'challenge', p5: 'believe' })
    for (const claimant of ['p3', 'p4', 'p5', 'p1']) {
      const voters = PLAYERS.slice(0, 5).filter((id) => id !== claimant && id !== 'p2')
      expect(data(engine).currentClaimantId).toBe(claimant)
      playRound(engine, false, Object.fromEntries([...voters, 'p2'].map((id) => [id, 'believe'])))
    }
    playRound(engine, true, { p1: 'challenge', p3: 'challenge', p4: 'challenge', p5: 'believe' })
    expect(data(engine).eliminatedPlayerIds).toEqual(['p2'])

    // Now p1 leaves while leading: out of the game, and ranked below the three still in.
    expect(data(engine).scores.p1).toBeGreaterThan(Math.max(data(engine).scores.p3, data(engine).scores.p4, data(engine).scores.p5))
    expect(engine.handlePlayerLeave('p1')).toBe(true)
    expect(data(engine).ranking.slice(0, 3).sort()).toEqual(['p3', 'p4', 'p5'])
    expect(detail.strategy.stayInToWin.desc).toMatch(/ranks above anyone knocked out, whatever the scores/)
    expect(detail.faq.playerLeaves.a).toMatch(/They are out and rank below everyone still in/)
  })

  it('passes the claim on when the claimant leaves before claiming', () => {
    const engine = startedGame(5)
    expect(engine.handlePlayerLeave('p1')).toBe(true)
    expect(data(engine).activePlayerIds).not.toContain('p1')
    expect(data(engine).currentClaimantId).toBe('p2')
    expect(detail.rules.floorRotates).toMatch(/in turn, skipping anyone who is out/)
  })
})

describe('the Liar\'s Party scorecard against the engine (#1240)', () => {
  const claimant = detail.scoring.claimant.rows
  const voters = detail.scoring.voters.rows

  it('pays a bluff that gets through 20 plus 6 per believer, and a caught one −12 and a strike', () => {
    const engine = startedGame(5)
    const through = playRound(engine, true, { p2: 'believe', p3: 'believe', p4: 'believe', p5: 'challenge' })
    expect(through.claimantScoreDelta).toBe(points(claimant.bluffGetsThrough.value) + 3 * 6)
    expect(claimant.bluffGetsThrough.rule).toBe('Plus 6 per believer.')
    expect(points(claimant.bluffGetsThrough.value) + 5 * 6).toBe(50)
    expect(detail.strategy.bluffForTheTable.desc).toMatch(/five believers is worth 50/)

    const caught = playRound(engine, true, { p1: 'challenge', p3: 'challenge', p4: 'challenge', p5: 'believe' })
    expect(caught.claimantScoreDelta).toBe(points(claimant.bluffCaught.value))
    expect(caught.claimantStrikeDelta).toBe(1)
    // The in-game rules card said "repeated caught bluffs add strikes" until #1240.
    expect(en.liarsParty.rule4).toMatch(/each caught bluff adds a strike/)
  })

  it('pays a truth 12 when believed and 4 when the challengers outnumber the believers', () => {
    const engine = startedGame()
    expect(playRound(engine, false, { p2: 'believe', p3: 'believe', p4: 'challenge' }).claimantScoreDelta).toBe(points(claimant.truthBelieved.value))
    expect(playRound(engine, false, { p1: 'challenge', p3: 'challenge', p4: 'believe' }).claimantScoreDelta).toBe(points(claimant.truthChallenged.value))
  })

  it('drops a truth to 4 only when most of the table doubts it; a tie still pays 12', () => {
    const engine = startedGame(5)
    const tie = playRound(engine, false, { p2: 'challenge', p3: 'challenge', p4: 'believe', p5: 'believe' })
    expect(tie.claimantScoreDelta).toBe(12)
    const doubted = playRound(engine, false, { p1: 'challenge', p3: 'challenge', p4: 'challenge', p5: 'believe' })
    expect(doubted.claimantScoreDelta).toBe(4)
    expect(doubted.voterScoreDeltas.p1).toBe(-6)
    expect(detail.strategy.strangeButTrue.desc).toBe('Even if most of the table doubts it, an odd truth still scores 4, while each challenger loses 6.')
  })

  it('scores each voter on the truth, not on the tally', () => {
    const engine = startedGame()
    const bluff = playRound(engine, true, { p2: 'challenge', p3: 'believe', p4: 'believe' })
    expect(bluff.bluffCaught).toBe(false)
    // p2 read it right and is paid in full although the bluff survived.
    expect(bluff.voterScoreDeltas.p2).toBe(points(voters.challengeBluff.value))
    expect(bluff.voterScoreDeltas.p3).toBe(points(voters.believeBluff.value))
    expect(detail.strategy.yourReadScoresAlone.desc).toMatch(/earns 14 even if the bluff survives/)

    const truth = playRound(engine, false, { p1: 'challenge', p3: 'believe', p4: 'believe' })
    expect(truth.voterScoreDeltas.p1).toBe(points(voters.challengeTruth.value))
    expect(truth.voterScoreDeltas.p3).toBe(points(voters.believeTruth.value))
  })

  it('never lets a score drop below zero', () => {
    const engine = startedGame()
    playRound(engine, false, { p2: 'challenge', p3: 'believe', p4: 'believe' })
    expect(data(engine).scores.p2).toBe(0)
    expect(detail.scoring.claimant.note).toBe('No score drops below zero.')
  })

  it('puts the break-even for a challenge at 42 percent', () => {
    const [cBluff, cTruth, bBluff, bTruth] = [voters.challengeBluff, voters.challengeTruth, voters.believeBluff, voters.believeTruth].map((row) => points(row.value))
    // Challenge beats Believe when cBluff·p + cTruth·(1−p) > bBluff·p + bTruth·(1−p).
    const breakEven = (bTruth - cTruth) / ((cBluff - bBluff) + (bTruth - cTruth))
    expect(Math.round(breakEven * 100)).toBe(42)
    expect(detail.strategy.challengeAboveFortyTwo.desc).toMatch(/more than 42 percent likely/)
  })
})

describe('the Liar\'s Party clock against the engine (#1240)', () => {
  it('skips the vote and takes 4 from a claimant who said nothing (#1202)', () => {
    const engine = startedGame()
    const startedAt = engine.getState().lastMoveAt as number
    engine.applyTimeoutFallback(60, startedAt + 60_000)
    expect(data(engine).phase).toBe('reveal')
    expect(move(engine, 'p2', 'advance-round')).toBe(true)
    const result = data(engine).roundResults[0]
    expect(result.claimTimedOut).toBe(true)
    expect(result.claimantScoreDelta).toBe(points(detail.scoring.claimant.rows.noClaimInTime.value))
    expect(result.voterScoreDeltas).toEqual({})
    expect(detail.faq.timerRunsOut.a).toMatch(/A silent claimant loses 4 and the vote is skipped/)
  })

  it('counts a missing vote as Believe, 4 points down', () => {
    const engine = startedGame()
    expect(move(engine, 'p1', 'submit-claim', { claim: 'I have never seen snow', isBluff: false })).toBe(true)
    expect(move(engine, 'p2', 'submit-challenge', { decision: 'challenge' })).toBe(true)
    const claimedAt = engine.getState().lastMoveAt as number
    engine.applyTimeoutFallback(60, claimedAt + 60_000)
    const votes = data(engine).challengeVotes
    expect(votes.filter((vote) => vote.autoSubmitted).map((vote) => vote.decision)).toEqual(['believe', 'believe'])
    expect(move(engine, 'p2', 'advance-round')).toBe(true)
    const result = data(engine).roundResults[0]
    expect(result.voterScoreDeltas.p3).toBe(points(detail.scoring.voters.rows.believeTruth.value) + points(detail.scoring.voters.rows.noVoteInTime.value))
    expect(detail.scoring.voters.rows.noVoteInTime.rule).toBe('Also counted as Believe.')
  })
})
