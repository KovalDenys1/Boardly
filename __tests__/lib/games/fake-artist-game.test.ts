import { Move } from '@/lib/game-engine'
import { FakeArtistGame, FakeArtistGameData } from '@/lib/games/fake-artist-game'

const createMove = (playerId: string, type: string, data: Record<string, unknown>): Move => ({
  playerId,
  type,
  data,
  timestamp: new Date(),
})

const getData = (game: FakeArtistGame): FakeArtistGameData =>
  game.getState().data as FakeArtistGameData

const addDefaultPlayers = (game: FakeArtistGame): void => {
  game.addPlayer({ id: 'player1', name: 'Player 1' })
  game.addPlayer({ id: 'player2', name: 'Player 2' })
  game.addPlayer({ id: 'player3', name: 'Player 3' })
  game.addPlayer({ id: 'player4', name: 'Player 4' })
}

describe('FakeArtistGame (MVP scaffold)', () => {
  let game: FakeArtistGame

  beforeEach(() => {
    game = new FakeArtistGame('fake-artist-test', {
      maxPlayers: 10,
      minPlayers: 4,
      rules: { rounds: 2, strokesPerPlayer: 1 },
    })
    addDefaultPlayers(game)
  })

  it('initializes deterministic role assignment and drawing turn order', () => {
    expect(game.startGame()).toBe(true)

    const data = getData(game)
    expect(data.phase).toBe('drawing')
    expect(data.currentRound).toBe(1)
    expect(data.fakeArtistId).toBe('player1')
    expect(data.currentTurnIndex).toBe(0)
    expect(data.totalTurnCount).toBe(4)
    expect(game.getCurrentTurnPlayerId()).toBe('player1')
    expect(data.isMvpScaffold).toBe(true)
  })

  it('enforces one stroke per deterministic turn', () => {
    expect(game.startGame()).toBe(true)

    expect(
      game.validateMove(createMove('player2', 'submit-stroke', { content: '{"d":1}' }))
    ).toBe(false)

    expect(
      game.makeMove(createMove('player1', 'submit-stroke', { content: '{"d":1}' }))
    ).toBe(true)

    expect(
      game.validateMove(createMove('player1', 'submit-stroke', { content: '{"d":2}' }))
    ).toBe(false)
    expect(game.getCurrentTurnPlayerId()).toBe('player2')
  })

  it('progresses drawing -> discussion -> voting -> reveal -> next round with deterministic scoring', () => {
    expect(game.startGame()).toBe(true)

    expect(game.makeMove(createMove('player1', 'submit-stroke', { content: '{"s":1}' }))).toBe(true)
    expect(game.makeMove(createMove('player2', 'submit-stroke', { content: '{"s":2}' }))).toBe(true)
    expect(game.makeMove(createMove('player3', 'submit-stroke', { content: '{"s":3}' }))).toBe(true)
    expect(game.makeMove(createMove('player4', 'submit-stroke', { content: '{"s":4}' }))).toBe(true)
    expect(getData(game).phase).toBe('discussion')

    expect(game.makeMove(createMove('player1', 'advance-phase', {}))).toBe(true)
    expect(getData(game).phase).toBe('voting')

    expect(game.makeMove(createMove('player1', 'submit-vote', { suspectPlayerId: 'player2' }))).toBe(true)
    expect(game.makeMove(createMove('player2', 'submit-vote', { suspectPlayerId: 'player1' }))).toBe(true)
    expect(game.makeMove(createMove('player3', 'submit-vote', { suspectPlayerId: 'player1' }))).toBe(true)
    expect(game.makeMove(createMove('player4', 'submit-vote', { suspectPlayerId: 'player2' }))).toBe(true)
    expect(getData(game).phase).toBe('reveal')

    expect(game.makeMove(createMove('player1', 'advance-round', {}))).toBe(true)

    const data = getData(game)
    expect(data.currentRound).toBe(2)
    expect(data.phase).toBe('drawing')
    expect(data.fakeArtistId).toBe('player2')
    expect(data.roundResults).toHaveLength(1)
    expect(data.roundResults[0].fakeCaught).toBe(true)
    expect(data.scores.player1).toBe(0)
    expect(data.scores.player2).toBe(12)
    expect(data.scores.player3).toBe(12)
    expect(data.scores.player4).toBe(0)
    expect(data.ranking).toEqual(['player2', 'player3', 'player1', 'player4'])
  })

  it('tracks pending voters for reconnect-safe clients and rejects duplicate votes', () => {
    expect(game.startGame()).toBe(true)

    game.makeMove(createMove('player1', 'submit-stroke', { content: '{"s":1}' }))
    game.makeMove(createMove('player2', 'submit-stroke', { content: '{"s":2}' }))
    game.makeMove(createMove('player3', 'submit-stroke', { content: '{"s":3}' }))
    game.makeMove(createMove('player4', 'submit-stroke', { content: '{"s":4}' }))
    game.makeMove(createMove('player1', 'advance-phase', {}))

    expect(game.getPendingVotePlayerIds()).toEqual(['player1', 'player2', 'player3', 'player4'])
    expect(game.makeMove(createMove('player1', 'submit-vote', { suspectPlayerId: 'player2' }))).toBe(true)
    expect(game.getPendingVotePlayerIds()).toEqual(['player2', 'player3', 'player4'])
    expect(game.validateMove(createMove('player1', 'submit-vote', { suspectPlayerId: 'player3' }))).toBe(false)
  })

  it('applies timeout fallback across all phases and auto-finishes one-round game', () => {
    const oneRoundGame = new FakeArtistGame('fake-artist-timeout', {
      maxPlayers: 10,
      minPlayers: 4,
      rules: { rounds: 1, strokesPerPlayer: 1 },
    })
    addDefaultPlayers(oneRoundGame)
    expect(oneRoundGame.startGame()).toBe(true)

    const startedAt = oneRoundGame.getState().lastMoveAt as number
    const timeoutResult = oneRoundGame.applyTimeoutFallback(30, startedAt + 210_000)
    const data = getData(oneRoundGame)

    expect(timeoutResult.changed).toBe(true)
    expect(timeoutResult.timeoutWindowsConsumed).toBe(7)
    expect(timeoutResult.phaseTransitions).toBe(3)
    expect(timeoutResult.revealAdvances).toBe(1)
    expect(timeoutResult.autoSubmittedStrokes).toBe(4)
    expect(timeoutResult.autoSubmittedVotes).toBe(4)
    expect(oneRoundGame.getState().status).toBe('finished')
    expect(data.completionReason).toBe('all-rounds-finished')
    expect(data.roundResults).toHaveLength(1)
    expect(data.roundResults[0].fakeCaught).toBe(true)
    expect(data.scores.player1).toBe(0)
    expect(data.scores.player2).toBe(0)
    expect(data.scores.player3).toBe(0)
    expect(data.scores.player4).toBe(4)
    expect(data.winnerId).toBe('player4')
  })
})
