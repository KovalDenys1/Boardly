import { Move } from '@/lib/game-engine'
import { LiarsPartyGame, LiarsPartyGameData } from '@/lib/games/liars-party-game'

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

    expect(timeoutResult.changed).toBe(true)
    expect(timeoutResult.timeoutWindowsConsumed).toBe(3)
    expect(timeoutResult.phaseTransitions).toBe(2)
    expect(timeoutResult.revealAdvances).toBe(1)
    expect(timeoutResult.autoSubmittedClaims).toBe(1)
    expect(timeoutResult.autoSubmittedChallenges).toBe(3)
    expect(oneRoundGame.getState().status).toBe('finished')
    expect(data.completionReason).toBe('max-rounds-reached')
    expect(data.scores.player1).toBe(8)
    expect(data.scores.player2).toBe(6)
    expect(data.scores.player3).toBe(6)
    expect(data.scores.player4).toBe(6)
    expect(data.ranking).toEqual(['player1', 'player2', 'player3', 'player4'])
    expect(data.winnerId).toBe('player1')
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
      game5.makeMove(createMove('p2', 'advance-round', {}))
      const data = getData(game5)
      // Bluff NOT caught: claimant should have positive score from successful bluff
      expect(data.scores.p1).toBeGreaterThan(0)
      expect(data.strikes.p1 ?? 0).toBe(0)
    })

    it('auto-submitted claim yields lower score than manual claim for truth-teller', () => {
      // Manual truth + all believe → SCORE_TRUTH_BELIEVED_BONUS = 12
      // Auto truth + all believe → 12 - SCORE_AUTO_SUBMISSION_PENALTY (4) = 8
      const manualGame = new LiarsPartyGame('liars-manual', {
        maxPlayers: 12,
        minPlayers: 4,
        rules: { maxRounds: 1, eliminationStrikes: 2 },
      })
      addDefaultPlayers(manualGame)
      expect(manualGame.startGame()).toBe(true)
      manualGame.makeMove(createMove('player1', 'submit-claim', { claim: 'This is the truth', isBluff: false }))
      manualGame.makeMove(createMove('player2', 'submit-challenge', { decision: 'believe' }))
      manualGame.makeMove(createMove('player3', 'submit-challenge', { decision: 'believe' }))
      manualGame.makeMove(createMove('player4', 'submit-challenge', { decision: 'believe' }))
      manualGame.makeMove(createMove('player2', 'advance-round', {}))
      const manualScore = getData(manualGame).scores.player1

      const autoGame = new LiarsPartyGame('liars-auto', {
        maxPlayers: 12,
        minPlayers: 4,
        rules: { maxRounds: 1, eliminationStrikes: 2 },
      })
      addDefaultPlayers(autoGame)
      expect(autoGame.startGame()).toBe(true)
      const phaseStart = autoGame.getState().lastMoveAt as number
      // Trigger full timeout to auto-submit claim and auto-believe for all voters
      autoGame.applyTimeoutFallback(30, phaseStart + 90_000)
      const autoScore = getData(autoGame).scores.player1

      expect(autoScore).toBeLessThan(manualScore)
    })

    it('claimant rotates from player1 to player2 after round 1 advances', () => {
      expect(game.startGame()).toBe(true)
      expect(getData(game).currentClaimantId).toBe('player1')
      game.makeMove(createMove('player1', 'submit-claim', { claim: 'First round claim text', isBluff: false }))
      game.makeMove(createMove('player2', 'submit-challenge', { decision: 'believe' }))
      game.makeMove(createMove('player3', 'submit-challenge', { decision: 'believe' }))
      game.makeMove(createMove('player4', 'submit-challenge', { decision: 'believe' }))
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
