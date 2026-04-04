import { AliasGame, type AliasGameData } from '@/lib/games/alias'
import type { Move, Player } from '@/lib/game-engine'

function createMove(type: string, playerId: string, payload: Record<string, unknown> = {}): Move {
  return { type, playerId, data: payload, timestamp: new Date() }
}

function getData(game: AliasGame): AliasGameData {
  return game.getState().data as AliasGameData
}

function addFourPlayers(game: AliasGame) {
  game.addPlayer({ id: 'p1', name: 'Alice', score: 0, isActive: true })
  game.addPlayer({ id: 'p2', name: 'Bob', score: 0, isActive: true })
  game.addPlayer({ id: 'p3', name: 'Carol', score: 0, isActive: true })
  game.addPlayer({ id: 'p4', name: 'Dave', score: 0, isActive: true })
}

describe('AliasGame', () => {
  describe('initialization', () => {
    it('starts with two empty teams and team_assignment phase', () => {
      const game = new AliasGame('g1')
      const data = getData(game)
      expect(data.phase).toBe('team_assignment')
      expect(data.teams).toHaveLength(2)
      expect(data.teams[0].id).toBe('team-1')
      expect(data.teams[1].id).toBe('team-2')
      expect(data.teams[0].playerIds).toHaveLength(0)
      expect(data.teams[1].playerIds).toHaveLength(0)
    })
  })

  describe('addPlayer', () => {
    it('distributes players round-robin across teams', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      const data = getData(game)
      expect(data.teams[0].playerIds).toEqual(['p1', 'p3'])
      expect(data.teams[1].playerIds).toEqual(['p2', 'p4'])
    })

    it('puts 5th player on smaller team', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      game.addPlayer({ id: 'p5', name: 'Eve', score: 0, isActive: true })
      const data = getData(game)
      // team-1 has p1,p3; team-2 has p2,p4; p5 goes to team-1 (tied, picks first)
      expect(data.teams[0].playerIds).toContain('p5')
    })
  })

  describe('startGame', () => {
    it('rejects start when a team has fewer than 2 players', () => {
      const game = new AliasGame('g1')
      game.addPlayer({ id: 'p1', name: 'Alice', score: 0, isActive: true })
      game.addPlayer({ id: 'p2', name: 'Bob', score: 0, isActive: true })
      game.addPlayer({ id: 'p3', name: 'Carol', score: 0, isActive: true })
      const result = game.startGame()
      expect(result).toBe(false)
    })

    it('starts the game and enters turn_active with a 10-word card', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      const result = game.startGame()
      expect(result).toBe(true)
      const data = getData(game)
      expect(data.phase).toBe('turn_active')
      expect(data.currentCard).toHaveLength(10)
      expect(data.currentCardIndex).toBe(0)
      expect(data.turnStartedAt).not.toBeNull()
    })
  })

  describe('validateMove', () => {
    it('rejects word_action when not in turn_active phase', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      // game is still in waiting status / team_assignment phase
      expect(game.validateMove(createMove('word_action', 'p1', { action: 'guess' }))).toBe(false)
    })

    it('rejects word_action when caller is not the describer', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      game.startGame()
      const data = getData(game)
      const describerId = data.teams[0].playerIds[0] // 'p1'
      const notDescriber = data.teams[0].playerIds[1]  // 'p3'
      expect(game.validateMove(createMove('word_action', notDescriber, { action: 'guess' }))).toBe(false)
      expect(game.validateMove(createMove('word_action', describerId, { action: 'guess' }))).toBe(true)
    })

    it('rejects word_action with invalid action value', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      game.startGame()
      const data = getData(game)
      const describerId = data.teams[0].playerIds[0]
      expect(game.validateMove(createMove('word_action', describerId, { action: 'wrong' }))).toBe(false)
    })

    it('accepts end_turn from current describer', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      game.startGame()
      const data = getData(game)
      const describerId = data.teams[0].playerIds[0]
      expect(game.validateMove(createMove('end_turn', describerId))).toBe(true)
    })

    it('rejects next_turn when not in turn_results phase', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      game.startGame()
      expect(game.validateMove(createMove('next_turn', 'p1'))).toBe(false)
    })
  })

  describe('processMove: word_action', () => {
    it('records guess and increments card index', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      game.startGame()
      const describerId = getData(game).teams[0].playerIds[0]
      game.makeMove(createMove('word_action', describerId, { action: 'guess' }))
      const data = getData(game)
      expect(data.currentCardIndex).toBe(1)
      expect(data.currentCardResults[0].result).toBe('guessed')
    })

    it('records skip and increments card index', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      game.startGame()
      const describerId = getData(game).teams[0].playerIds[0]
      game.makeMove(createMove('word_action', describerId, { action: 'skip' }))
      const data = getData(game)
      expect(data.currentCardResults[0].result).toBe('skipped')
    })

    it('ends turn automatically after 10 word actions', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      game.startGame()
      const describerId = getData(game).teams[0].playerIds[0]
      for (let i = 0; i < 10; i++) {
        game.makeMove(createMove('word_action', describerId, { action: 'guess' }))
      }
      expect(getData(game).phase).toBe('turn_results')
    })
  })

  describe('processMove: end_turn', () => {
    it('transitions to turn_results and records lastTurnResult', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      game.startGame()
      const describerId = getData(game).teams[0].playerIds[0]
      game.makeMove(createMove('word_action', describerId, { action: 'guess' }))
      game.makeMove(createMove('word_action', describerId, { action: 'skip' }))
      game.makeMove(createMove('end_turn', describerId))
      const data = getData(game)
      expect(data.phase).toBe('turn_results')
      expect(data.lastTurnResult).not.toBeNull()
      expect(data.lastTurnResult!.scoreDelta).toBe(0) // 1 guess - 1 skip = 0
      expect(data.teams[0].score).toBe(0)
    })

    it('calculates score correctly: 3 guessed - 1 skipped = +2', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      game.startGame()
      const describerId = getData(game).teams[0].playerIds[0]
      game.makeMove(createMove('word_action', describerId, { action: 'guess' }))
      game.makeMove(createMove('word_action', describerId, { action: 'guess' }))
      game.makeMove(createMove('word_action', describerId, { action: 'guess' }))
      game.makeMove(createMove('word_action', describerId, { action: 'skip' }))
      game.makeMove(createMove('end_turn', describerId))
      expect(getData(game).teams[0].score).toBe(2)
    })
  })

  describe('processMove: next_turn', () => {
    function endTurn(game: AliasGame) {
      const data = getData(game)
      const team = data.teams[data.currentTeamIndex]
      const describerId = team.playerIds[team.describerIndex]
      game.makeMove(createMove('end_turn', describerId))
    }

    it('switches to the other team and deals a new card', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      game.startGame()
      endTurn(game)
      expect(getData(game).currentTeamIndex).toBe(0)
      game.makeMove(createMove('next_turn', 'p1'))
      const data = getData(game)
      expect(data.currentTeamIndex).toBe(1)
      expect(data.phase).toBe('turn_active')
      expect(data.currentCard).toHaveLength(10)
    })

    it('finishes game after all 6 turns (3 per team)', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      game.startGame()
      // 6 turns total: team0, team1, team0, team1, team0, team1
      for (let i = 0; i < 6; i++) {
        endTurn(game)
        if (i < 5) {
          game.makeMove(createMove('next_turn', 'p1'))
        }
      }
      expect(getData(game).phase).toBe('game_over')
      expect(game.getState().status).toBe('finished')
      expect(getData(game).winnerId).not.toBeNull()
    })

    it('picks winning team based on higher score', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      game.startGame()
      // Give team-1 a point on first turn
      const describerId = getData(game).teams[0].playerIds[0]
      game.makeMove(createMove('word_action', describerId, { action: 'guess' }))
      endTurn(game)
      // Advance through all remaining turns with 0 score
      for (let i = 0; i < 5; i++) {
        game.makeMove(createMove('next_turn', 'p1'))
        endTurn(game)
      }
      expect(getData(game).winnerId).toBe('team-1')
    })

    it('sets winnerId to "tie" when scores are equal', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      game.startGame()
      for (let i = 0; i < 6; i++) {
        endTurn(game)
        if (i < 5) game.makeMove(createMove('next_turn', 'p1'))
      }
      expect(getData(game).winnerId).toBe('tie')
    })
  })

  describe('applyTimeoutFallback', () => {
    it('returns changed: false when phase is not turn_active', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      // Still in team_assignment / waiting
      expect(game.applyTimeoutFallback(60).changed).toBe(false)
    })

    it('returns changed: false when timer has not expired', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      game.startGame()
      const now = Date.now()
      expect(game.applyTimeoutFallback(60, now).changed).toBe(false)
    })

    it('skips remaining words and ends turn when timer expires', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      game.startGame()
      const pastTime = Date.now() + 61_000 // 61s in the future = timer expired
      const result = game.applyTimeoutFallback(60, pastTime)
      expect(result.changed).toBe(true)
      expect(getData(game).phase).toBe('turn_results')
      expect(getData(game).lastTurnResult!.wordResults).toHaveLength(10)
      expect(getData(game).lastTurnResult!.wordResults.every(r => r.result === 'skipped')).toBe(true)
    })
  })
})
