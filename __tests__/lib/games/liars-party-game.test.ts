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
