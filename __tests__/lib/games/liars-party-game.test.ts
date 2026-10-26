import { Move } from '@/lib/game-engine'
import { LIARS_REVEAL_HOLD_MS, LiarsPartyGame, LiarsPartyGameData, sanitizeLiarsPartyStateForBroadcast } from '@/lib/games/liars-party-game'

const createMove = (playerId: string, type: string, data: Record<string, unknown>): Move => ({
  playerId,
  type,
  data,
  timestamp: new Date(),
})

const getData = (game: LiarsPartyGame): LiarsPartyGameData =>
  game.getState().data as LiarsPartyGameData

const addDefaultPlayers = (game: LiarsPartyGame): void => {
  game.addPlayer({ id: 'player1', name: 'Player 1' })
  game.addPlayer({ id: 'player2', name: 'Player 2' })
  game.addPlayer({ id: 'player3', name: 'Player 3' })
  game.addPlayer({ id: 'player4', name: 'Player 4' })
}

let clock = 1_000_000
let nowSpy: jest.SpyInstance<number, []>

beforeEach(() => {
  clock = 1_000_000
  nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => clock)
})

afterEach(() => {
  nowSpy.mockRestore()
})

/** The reveal holds about three seconds before Next Round is taken (#1379). */
const pastRevealHold = (): void => {
  clock += 3_000
}

describe("LiarsPartyGame (MVP scaffold)", () => {
  let game: LiarsPartyGame

  beforeEach(() => {
    game = new LiarsPartyGame('liars-test', {
      maxPlayers: 12,
      minPlayers: 4,
      rules: { maxRounds: 2, eliminationStrikes: 2 },
    })
    addDefaultPlayers(game)
  })

  it('initializes claimant order and active players on start', () => {
    expect(game.startGame()).toBe(true)

    const data = getData(game)
    expect(data.phase).toBe('claim')
    expect(data.currentRound).toBe(1)
    expect(data.currentClaimantId).toBe('player1')
    expect(data.activePlayerIds).toEqual(['player1', 'player2', 'player3', 'player4'])
    expect(data.isMvpScaffold).toBe(true)
  })

  it('rejects duplicate submit-challenge from the same player in one round', () => {
    expect(game.startGame()).toBe(true)
    expect(
      game.makeMove(
        createMove('player1', 'submit-claim', {
          claim: 'I rolled triple sixes',
          isBluff: false,
        })
      )
    ).toBe(true)

    const firstVote = createMove('player2', 'submit-challenge', { decision: 'challenge' })
    const duplicateVote = createMove('player2', 'submit-challenge', { decision: 'believe' })

    expect(game.validateMove(firstVote)).toBe(true)
    expect(game.makeMove(firstVote)).toBe(true)
    expect(game.validateMove(duplicateVote)).toBe(false)
  })

  it('progresses claim -> challenge -> reveal -> next round with deterministic scoring', () => {
    expect(game.startGame()).toBe(true)
    expect(
      game.makeMove(
        createMove('player1', 'submit-claim', {
          claim: 'I have exactly five points',
          isBluff: true,
        })
      )
    ).toBe(true)

    expect(game.makeMove(createMove('player2', 'submit-challenge', { decision: 'challenge' }))).toBe(true)
    expect(game.makeMove(createMove('player3', 'submit-challenge', { decision: 'believe' }))).toBe(true)
    expect(game.makeMove(createMove('player4', 'submit-challenge', { decision: 'believe' }))).toBe(true)

    expect(getData(game).phase).toBe('reveal')
    pastRevealHold()
    expect(game.makeMove(createMove('player3', 'advance-round', {}))).toBe(true)

    const data = getData(game)
    expect(data.currentRound).toBe(2)
    expect(data.currentClaimantId).toBe('player2')
    expect(data.phase).toBe('claim')
    expect(data.scores.player1).toBe(32)
    expect(data.scores.player2).toBe(14)
    expect(data.scores.player3).toBe(0)
    expect(data.scores.player4).toBe(0)
    expect(data.roundResults).toHaveLength(1)
    expect(data.roundResults[0].bluffCaught).toBe(false)
  })

  it('exposes pending challenge players for reconnect-safe clients', () => {
    expect(game.startGame()).toBe(true)
    expect(
      game.makeMove(
        createMove('player1', 'submit-claim', {
          claim: 'This is my claim text',
          isBluff: false,
        })
      )
    ).toBe(true)

    expect(game.getPendingChallengePlayerIds()).toEqual(['player2', 'player3', 'player4'])
    expect(game.makeMove(createMove('player2', 'submit-challenge', { decision: 'challenge' }))).toBe(true)
    expect(game.getPendingChallengePlayerIds()).toEqual(['player3', 'player4'])
  })

  it('applies timeout fallback across all phases and auto-finishes a one-round game', () => {
    const oneRoundGame = new LiarsPartyGame('liars-timeout', {
      maxPlayers: 12,
      minPlayers: 4,
      rules: { maxRounds: 1, eliminationStrikes: 2 },
    })
    addDefaultPlayers(oneRoundGame)
    expect(oneRoundGame.startGame()).toBe(true)

    const phaseStartAt = oneRoundGame.getState().lastMoveAt as number
    const timeoutResult = oneRoundGame.applyTimeoutFallback(30, phaseStartAt + 90_000)
    const data = getData(oneRoundGame)

    // #1202: a claimant who times out has made no claim, so there is
    // nothing to vote on – claim goes straight to reveal, and nobody is scored
    // for a vote that never happened.
    expect(timeoutResult.changed).toBe(true)
    expect(timeoutResult.timeoutWindowsConsumed).toBe(2)
    expect(timeoutResult.phaseTransitions).toBe(1)
    expect(timeoutResult.revealAdvances).toBe(1)
    expect(timeoutResult.autoSubmittedClaims).toBe(1)
    expect(timeoutResult.autoSubmittedChallenges).toBe(0)
    expect(oneRoundGame.getState().status).toBe('finished')
    expect(data.completionReason).toBe('max-rounds-reached')
    expect(data.scores.player1).toBe(0)
    expect(data.scores.player2).toBe(0)
    expect(data.scores.player3).toBe(0)
    expect(data.scores.player4).toBe(0)
    expect(data.roundResults[0]).toEqual(expect.objectContaining({
      claimantId: 'player1',
      claimTimedOut: true,
      challengedBy: [],
      believedBy: [],
      voterScoreDeltas: {},
    }))
  })

  it('never puts a user id or an English debug string into a timed-out claim (#1202)', () => {
    const timedOut = new LiarsPartyGame('liars-timeout-text', {
      maxPlayers: 12,
      minPlayers: 4,
      rules: { maxRounds: 3, eliminationStrikes: 2 },
    })
    addDefaultPlayers(timedOut)
    expect(timedOut.startGame()).toBe(true)
    const phaseStartAt = timedOut.getState().lastMoveAt as number

    // One window: the claim times out and the round moves to reveal, not to a vote.
    timedOut.applyTimeoutFallback(30, phaseStartAt + 30_000)
    const data = getData(timedOut)

    expect(data.phase).toBe('reveal')
    expect(data.claim).toEqual(expect.objectContaining({ playerId: 'player1', autoSubmitted: true, text: '' }))
    expect(JSON.stringify(data)).not.toContain('AUTO TIMEOUT')
    expect(data.challengeVotes).toEqual([])
    // A vote cannot be forced in either.
    expect(timedOut.makeMove(createMove('player2', 'submit-challenge', { decision: 'challenge' }))).toBe(false)
  })

  describe('additional coverage', () => {
    it('getGameRules returns a non-empty array of strings', () => {
      expect(game.startGame()).toBe(true)
      const rules = game.getGameRules()
      expect(Array.isArray(rules)).toBe(true)
      expect(rules.length).toBeGreaterThan(0)
      rules.forEach((r) => expect(typeof r).toBe('string'))
    })

    it('validateMove returns false for an unknown move type', () => {
      expect(game.startGame()).toBe(true)
      expect(
        game.validateMove(createMove('player1', 'unknown-type', {}))
      ).toBe(false)
    })

    it('validateMove returns false for a non-player ID submitting a claim', () => {
      expect(game.startGame()).toBe(true)
      expect(
        game.validateMove(createMove('stranger', 'submit-claim', {
          claim: 'I am not a player at all',
          isBluff: false,
        }))
      ).toBe(false)
    })

    it('submit-challenge is rejected in the claim phase', () => {
      expect(game.startGame()).toBe(true)
      expect(getData(game).phase).toBe('claim')
      expect(
        game.validateMove(createMove('player2', 'submit-challenge', { decision: 'challenge' }))
      ).toBe(false)
    })

    it('bluff is NOT caught when challengers equal believers (not a strict majority)', () => {
      // 4 players: 1 claimant + 3 voters. We need exactly 1 challenger and 2 believers (not majority)
      // Or 2 claimants... with 4 players: claimant + 3 voters → tie is impossible (odd)
      // Use 5 players: claimant + 4 voters → 2 challenge + 2 believe = tie → bluff NOT caught
      const game5 = new LiarsPartyGame('liars-majority', {
        maxPlayers: 12,
        minPlayers: 4,
        rules: { maxRounds: 2, eliminationStrikes: 2 },
      })
      game5.addPlayer({ id: 'p1', name: 'P1' })
      game5.addPlayer({ id: 'p2', name: 'P2' })
      game5.addPlayer({ id: 'p3', name: 'P3' })
      game5.addPlayer({ id: 'p4', name: 'P4' })
      game5.addPlayer({ id: 'p5', name: 'P5' })
      expect(game5.startGame()).toBe(true)
      game5.makeMove(createMove('p1', 'submit-claim', { claim: 'I am bluffing here now', isBluff: true }))
      game5.makeMove(createMove('p2', 'submit-challenge', { decision: 'challenge' }))
      game5.makeMove(createMove('p3', 'submit-challenge', { decision: 'challenge' }))
      game5.makeMove(createMove('p4', 'submit-challenge', { decision: 'believe' }))
      game5.makeMove(createMove('p5', 'submit-challenge', { decision: 'believe' }))
      pastRevealHold()
      game5.makeMove(createMove('p2', 'advance-round', {}))
      const data = getData(game5)
      // Bluff NOT caught: claimant should have positive score from successful bluff
      expect(data.scores.p1).toBeGreaterThan(0)
      expect(data.strikes.p1 ?? 0).toBe(0)
    })

    it('a timed-out claim costs the claimant points instead of paying the truth bonus', () => {
      // It used to be scored as a believed truth: 12 - SCORE_AUTO_SUBMISSION_PENALTY (4) = +8,
      // so the player who said nothing won a one-round game (#1202).
      const game2 = new LiarsPartyGame('liars-auto', {
        maxPlayers: 12,
        minPlayers: 4,
        rules: { maxRounds: 2, eliminationStrikes: 2 },
      })
      addDefaultPlayers(game2)
      expect(game2.startGame()).toBe(true)
      // Round 1 honest: player1 earns the believed-truth bonus.
      game2.makeMove(createMove('player1', 'submit-claim', { claim: 'This is the truth', isBluff: false }))
      game2.makeMove(createMove('player2', 'submit-challenge', { decision: 'believe' }))
      game2.makeMove(createMove('player3', 'submit-challenge', { decision: 'believe' }))
      game2.makeMove(createMove('player4', 'submit-challenge', { decision: 'believe' }))
      pastRevealHold()
      game2.makeMove(createMove('player2', 'advance-round', {}))
      expect(getData(game2).scores.player2).toBe(getData(game2).scores.player3)
      const before = { ...getData(game2).scores }

      // Round 2: player2 is the claimant and says nothing.
      const phaseStart = game2.getState().lastMoveAt as number
      game2.applyTimeoutFallback(30, phaseStart + 60_000)
      const after = getData(game2).scores

      expect(after.player2).toBe(Math.max(0, before.player2 - 4))
      expect(after.player1).toBe(before.player1)
      expect(after.player3).toBe(before.player3)
      expect(after.player4).toBe(before.player4)
    })

    it('claimant rotates from player1 to player2 after round 1 advances', () => {
      expect(game.startGame()).toBe(true)
      expect(getData(game).currentClaimantId).toBe('player1')
      game.makeMove(createMove('player1', 'submit-claim', { claim: 'First round claim text', isBluff: false }))
      game.makeMove(createMove('player2', 'submit-challenge', { decision: 'believe' }))
      game.makeMove(createMove('player3', 'submit-challenge', { decision: 'believe' }))
      game.makeMove(createMove('player4', 'submit-challenge', { decision: 'believe' }))
      pastRevealHold()
      game.makeMove(createMove('player2', 'advance-round', {}))
      expect(getData(game).currentClaimantId).toBe('player2')
    })

    it('ranking after finish is in descending score order', () => {
      const oneRound = new LiarsPartyGame('liars-rank', {
        maxPlayers: 12,
        minPlayers: 4,
        rules: { maxRounds: 1, eliminationStrikes: 2 },
      })
      addDefaultPlayers(oneRound)
      expect(oneRound.startGame()).toBe(true)
      // player1 bluffs, everyone challenges → bluff caught → player1 loses points; challengers gain
      oneRound.makeMove(createMove('player1', 'submit-claim', { claim: 'I am telling a lie here', isBluff: true }))
      oneRound.makeMove(createMove('player2', 'submit-challenge', { decision: 'challenge' }))
      oneRound.makeMove(createMove('player3', 'submit-challenge', { decision: 'challenge' }))
      oneRound.makeMove(createMove('player4', 'submit-challenge', { decision: 'challenge' }))
      pastRevealHold()
      oneRound.makeMove(createMove('player2', 'advance-round', {}))
      const data = getData(oneRound)
      const ranking = data.ranking
      // Verify descending order
      for (let i = 0; i < ranking.length - 1; i++) {
        expect(data.scores[ranking[i]] ?? 0).toBeGreaterThanOrEqual(data.scores[ranking[i + 1]] ?? 0)
      }
    })
  })

  it('applies bluff strike elimination and prevents eliminated players from voting', () => {
    const eliminationGame = new LiarsPartyGame('liars-elimination', {
      maxPlayers: 12,
      minPlayers: 4,
      rules: { maxRounds: 3, eliminationStrikes: 1 },
    })
    addDefaultPlayers(eliminationGame)
    expect(eliminationGame.startGame()).toBe(true)

    expect(
      eliminationGame.makeMove(
        createMove('player1', 'submit-claim', {
          claim: 'I am telling the truth',
          isBluff: true,
        })
      )
    ).toBe(true)
    expect(eliminationGame.makeMove(createMove('player2', 'submit-challenge', { decision: 'challenge' }))).toBe(true)
    expect(eliminationGame.makeMove(createMove('player3', 'submit-challenge', { decision: 'challenge' }))).toBe(true)
    expect(eliminationGame.makeMove(createMove('player4', 'submit-challenge', { decision: 'challenge' }))).toBe(true)
    pastRevealHold()
    expect(eliminationGame.makeMove(createMove('player2', 'advance-round', {}))).toBe(true)

    const data = getData(eliminationGame)
    expect(data.strikes.player1).toBe(1)
    expect(data.eliminatedPlayerIds).toContain('player1')
    expect(data.activePlayerIds).toEqual(['player2', 'player3', 'player4'])
    expect(data.currentClaimantId).toBe('player2')
    expect(data.phase).toBe('claim')

    expect(
      eliminationGame.makeMove(
        createMove('player2', 'submit-claim', {
          claim: 'Round two claim text',
          isBluff: false,
        })
      )
    ).toBe(true)

    expect(
      eliminationGame.validateMove(createMove('player1', 'submit-challenge', { decision: 'challenge' }))
    ).toBe(false)
  })
})

describe("LiarsPartyGame scores the round at the reveal and holds it (#1379)", () => {
  const newGame = (rules: Record<string, unknown> = { maxRounds: 3, eliminationStrikes: 2 }): LiarsPartyGame => {
    const created = new LiarsPartyGame('liars-reveal', { maxPlayers: 12, minPlayers: 4, rules })
    addDefaultPlayers(created)
    expect(created.startGame()).toBe(true)
    return created
  }
  const claim = (target: LiarsPartyGame, playerId: string, isBluff: boolean) =>
    target.makeMove(createMove(playerId, 'submit-claim', { claim: 'I have exactly five points', isBluff }))
  const vote = (target: LiarsPartyGame, playerId: string, decision: 'challenge' | 'believe') =>
    target.makeMove(createMove(playerId, 'submit-challenge', { decision }))
  const advance = (target: LiarsPartyGame, playerId = 'player3') =>
    target.makeMove(createMove(playerId, 'advance-round', {}))
  const snapshot = (target: LiarsPartyGame) => JSON.parse(JSON.stringify(target.getState()))
  const restored = (state: unknown): LiarsPartyGame => {
    const copy = new LiarsPartyGame('liars-reveal')
    copy.restoreState(state as Parameters<LiarsPartyGame['restoreState']>[0])
    return copy
  }

  /** Round 1: player1 bluffs, one challenge and two believes – the bluff gets through. */
  const toReveal = (target: LiarsPartyGame): void => {
    expect(claim(target, 'player1', true)).toBe(true)
    expect(vote(target, 'player2', 'challenge')).toBe(true)
    expect(vote(target, 'player3', 'believe')).toBe(true)
    expect(vote(target, 'player4', 'believe')).toBe(true)
  }
  const ROUND_ONE_SCORES = { player1: 32, player2: 14, player3: 0, player4: 0 }

  const expectScoredOnEntry = (target: LiarsPartyGame, revealAt: number): void => {
    const data = getData(target)
    expect(data.phase).toBe('reveal')
    expect(data.currentRoundResolved).toBe(true)
    expect(data.roundResults).toHaveLength(1)
    expect(data.roundResults[0]).toEqual(expect.objectContaining({ round: data.currentRound, resolvedAt: revealAt }))
    expect(data.advanceOpensAt).toBe(revealAt + LIARS_REVEAL_HOLD_MS)
  }

  it('applies the round score as the last vote lands, before anyone presses Next Round', () => {
    const game = newGame()
    toReveal(game)

    expectScoredOnEntry(game, clock)
    const data = getData(game)
    expect(data.scores).toEqual(ROUND_ONE_SCORES)
    expect(data.roundResults[0].voterScoreDeltas).toEqual({ player2: 14, player3: -8, player4: -8 })
    expect(data.roundResults[0].claimantScoreDelta).toBe(32)
    expect(game.getState().players.find((player) => player.id === 'player1')?.score).toBe(32)
  })

  it('strikes a caught bluffer out at the reveal, not on the way out of it', () => {
    const game = newGame({ maxRounds: 3, eliminationStrikes: 1 })
    expect(claim(game, 'player1', true)).toBe(true)
    for (const voter of ['player2', 'player3', 'player4']) expect(vote(game, voter, 'challenge')).toBe(true)

    expectScoredOnEntry(game, clock)
    const data = getData(game)
    expect(data.roundResults[0]).toEqual(expect.objectContaining({ bluffCaught: true, claimantScoreDelta: -12, claimantStrikeDelta: 1 }))
    expect(data.strikes.player1).toBe(1)
    expect(data.eliminatedPlayerIds).toEqual(['player1'])
    expect(data.eliminatedAtRound.player1).toBe(1)
  })

  it('scores the round when the vote clock runs out', () => {
    const game = newGame()
    expect(claim(game, 'player1', false)).toBe(true)
    expect(vote(game, 'player2', 'challenge')).toBe(true)
    const revealAt = (game.getState().lastMoveAt as number) + 60_000
    game.applyTimeoutFallback(60, revealAt)

    expectScoredOnEntry(game, revealAt)
    // player3 and player4 said nothing: counted as Believe, 4 down.
    expect(getData(game).roundResults[0].voterScoreDeltas).toEqual({ player2: -6, player3: 6, player4: 6 })
    expect(getData(game).scores).toEqual({ player1: 12, player2: 0, player3: 6, player4: 6 })
  })

  it('scores a claim that timed out as it goes to the reveal', () => {
    const game = newGame()
    const revealAt = (game.getState().lastMoveAt as number) + 60_000
    game.applyTimeoutFallback(60, revealAt)

    expectScoredOnEntry(game, revealAt)
    expect(getData(game).roundResults[0]).toEqual(expect.objectContaining({ claimTimedOut: true, claimantScoreDelta: -4 }))
  })

  it('scores the round when the last voter still owing a vote leaves', () => {
    const game = newGame()
    expect(claim(game, 'player1', false)).toBe(true)
    expect(vote(game, 'player2', 'believe')).toBe(true)
    expect(vote(game, 'player3', 'believe')).toBe(true)
    expect(game.handlePlayerLeave('player4')).toBe(true)

    expectScoredOnEntry(game, clock)
    expect(getData(game).roundResults[0].voterScoreDeltas).toEqual({ player2: 10, player3: 10 })
  })

  it('refuses Next Round from anyone until the hold is over, then takes it', () => {
    const game = newGame()
    toReveal(game)
    const revealAt = clock
    expect(LIARS_REVEAL_HOLD_MS).toBeGreaterThanOrEqual(2_000)
    expect(LIARS_REVEAL_HOLD_MS).toBeLessThanOrEqual(3_000)

    clock = revealAt + LIARS_REVEAL_HOLD_MS - 1
    for (const playerId of ['player1', 'player2', 'player3', 'player4']) {
      expect(game.validateMove(createMove(playerId, 'advance-round', {}))).toBe(false)
    }
    expect(advance(game)).toBe(false)
    expect(getData(game).phase).toBe('reveal')

    clock = revealAt + LIARS_REVEAL_HOLD_MS
    expect(advance(game)).toBe(true)
    expect(getData(game).phase).toBe('claim')
    expect(getData(game).currentRound).toBe(2)
    expect(getData(game).advanceOpensAt).toBeNull()
  })

  it('holds a reveal reached by a timed-out claim as well', () => {
    const game = newGame()
    const revealAt = (game.getState().lastMoveAt as number) + 60_000
    game.applyTimeoutFallback(60, revealAt)

    clock = revealAt + 1_000
    expect(advance(game)).toBe(false)
    clock = revealAt + LIARS_REVEAL_HOLD_MS
    expect(advance(game)).toBe(true)
  })

  it('does not score the round again when Next Round is pressed', () => {
    const game = newGame()
    toReveal(game)
    pastRevealHold()
    expect(advance(game)).toBe(true)

    const data = getData(game)
    expect(data.roundResults).toHaveLength(1)
    expect(data.scores).toEqual(ROUND_ONE_SCORES)
    expect(data.currentRoundResolved).toBe(false)
  })

  it('scores a reveal the old code left unresolved exactly once, on Next Round', () => {
    // What a game saved before #1379 looks like: every vote in, phase reveal, nothing scored, no hold stamped.
    const game = newGame()
    expect(claim(game, 'player1', true)).toBe(true)
    expect(vote(game, 'player2', 'challenge')).toBe(true)
    expect(vote(game, 'player3', 'believe')).toBe(true)
    const legacy = snapshot(game)
    legacy.data.challengeVotes.push({ playerId: 'player4', decision: 'believe', submittedAt: clock })
    legacy.data.submittedPlayerIds = []
    legacy.data.phase = 'reveal'
    delete legacy.data.advanceOpensAt
    expect(legacy.data.currentRoundResolved).toBe(false)

    const first = restored(legacy)
    const second = restored(legacy)
    expect(advance(first)).toBe(true)
    expect(advance(second, 'player4')).toBe(true)

    for (const copy of [first, second]) {
      const data = getData(copy)
      expect(data.roundResults).toHaveLength(1)
      expect(data.roundResults[0].round).toBe(1)
      expect(data.scores).toEqual(ROUND_ONE_SCORES)
      expect(data.currentRound).toBe(2)
      expect(data.phase).toBe('claim')
    }
    expect(advance(first)).toBe(false)
    expect(getData(first).scores).toEqual(ROUND_ONE_SCORES)
  })

  it('scores the round once when two clients press Next Round on the same reveal', () => {
    const game = newGame()
    toReveal(game)
    const atReveal = snapshot(game)
    pastRevealHold()

    const first = restored(atReveal)
    const second = restored(atReveal)
    expect(advance(first, 'player2')).toBe(true)
    expect(advance(second, 'player4')).toBe(true)
    expect(getData(first)).toEqual(getData(second))
    expect(getData(first).roundResults).toHaveLength(1)
    expect(getData(first).scores).toEqual(ROUND_ONE_SCORES)

    // The later of the two lands on the next claim, where Next Round means nothing.
    expect(advance(first, 'player4')).toBe(false)
    expect(getData(first).scores).toEqual(ROUND_ONE_SCORES)
    expect(getData(first).currentRound).toBe(2)
  })

  it('lets the reveal clock advance after the hold without scoring the round twice', () => {
    const game = newGame()
    toReveal(game)
    const revealAt = clock
    const result = game.applyTimeoutFallback(60, revealAt + 60_000)

    expect(result.revealAdvances).toBe(1)
    const data = getData(game)
    expect(data.phase).toBe('claim')
    expect(data.currentRound).toBe(2)
    expect(data.roundResults).toHaveLength(1)
    expect(data.scores).toEqual(ROUND_ONE_SCORES)
  })

  it('changes nothing when the reveal clock fires after somebody already pressed Next Round', () => {
    const game = newGame()
    toReveal(game)
    const revealAt = clock
    clock = revealAt + LIARS_REVEAL_HOLD_MS + 1_000
    expect(advance(game)).toBe(true)
    const afterAdvance = snapshot(game)

    // A stale reader that saw the reveal would have fired at revealAt + 60 s; the next claim began at the press.
    const result = game.applyTimeoutFallback(60, revealAt + 60_000)
    expect(result.changed).toBe(false)
    expect(snapshot(game).data).toEqual(afterAdvance.data)
    expect(getData(game).roundResults).toHaveLength(1)
  })

  it('never ends a reveal before its hold, even on a clock shorter than the hold', () => {
    const game = newGame()
    toReveal(game)
    const revealAt = clock

    game.applyTimeoutFallback(1, revealAt + 1_500)
    expect(getData(game).phase).toBe('reveal')

    game.applyTimeoutFallback(1, revealAt + LIARS_REVEAL_HOLD_MS)
    expect(getData(game).phase).toBe('claim')
    expect(getData(game).roundResults).toHaveLength(1)
  })

  it('keeps the round result out of every payload until the reveal', () => {
    const game = newGame()
    expect(claim(game, 'player1', true)).toBe(true)
    expect(vote(game, 'player2', 'challenge')).toBe(true)
    expect(vote(game, 'player3', 'believe')).toBe(true)

    for (const viewer of ['player1', 'player2', 'player4', null]) {
      const sanitized = sanitizeLiarsPartyStateForBroadcast(snapshot(game), viewer)
      expect(sanitized.data.roundResults).toEqual([])
      expect(sanitized.data.scores).toEqual({ player1: 0, player2: 0, player3: 0, player4: 0 })
      expect(sanitized.data.currentRoundResolved).toBe(false)
    }
  })
})
