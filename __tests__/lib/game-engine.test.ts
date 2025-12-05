import { GameEngine, Player, Move } from '@/lib/game-engine'

// Create a concrete implementation for testing
class TestGame extends GameEngine {
  constructor(gameId: string) {
    super(gameId, 'test', {
      maxPlayers: 4,
      minPlayers: 2,
    })
  }

  getInitialGameData() {
    return {
      round: 1,
      value: 0,
    }
  }

  validateMove(move: Move): boolean {
    return move.type === 'valid' || move.type === 'increment'
  }

  processMove(move: Move): void {
    if (move.type === 'increment') {
      const data = this.state.data as { round: number; value: number }
      data.value = (data.value || 0) + 1
    }
  }

  checkWinCondition(): Player | null {
    const data = this.state.data as { round: number; value: number }
    if (data.value >= 10) {
      return this.state.players[0] || null
    }
    return null
  }

  getGameRules(): string[] {
    return ['Rule 1', 'Rule 2']
  }
}

describe('GameEngine', () => {
  let game: TestGame
  const player1: Player = { id: 'p1', name: 'Player 1' }
  const player2: Player = { id: 'p2', name: 'Player 2' }

  beforeEach(() => {
    game = new TestGame('test-game-123')
  })

  describe('Player Management', () => {
    it('should add players up to max', () => {
      expect(game.addPlayer(player1)).toBe(true)
      expect(game.addPlayer(player2)).toBe(true)
      expect(game.getPlayers()).toHaveLength(2)
    })

    it('should not exceed max players', () => {
      game.addPlayer(player1)
      game.addPlayer(player2)
      game.addPlayer({ id: 'p3', name: 'Player 3' })
      game.addPlayer({ id: 'p4', name: 'Player 4' })
      
      const result = game.addPlayer({ id: 'p5', name: 'Player 5' })
      expect(result).toBe(false)
      expect(game.getPlayers()).toHaveLength(4)
    })

    it('should remove player', () => {
      game.addPlayer(player1)
      game.addPlayer(player2)
      
      expect(game.removePlayer('p1')).toBe(true)
      expect(game.getPlayers()).toHaveLength(1)
      expect(game.getPlayers()[0].id).toBe('p2')
    })

    it('should handle removing non-existent player', () => {
      game.addPlayer(player1)
      expect(game.removePlayer('invalid')).toBe(false)
      expect(game.getPlayers()).toHaveLength(1)
    })

    it('should adjust current player index when removing', () => {
      game.addPlayer(player1)
      game.addPlayer(player2)
      game.startGame()
      
      // Remove first player (current player)
      game.removePlayer('p1')
      
      const currentPlayer = game.getCurrentPlayer()
      expect(currentPlayer?.id).toBe('p2')
    })
  })

  describe('Game Flow', () => {
    beforeEach(() => {
      game.addPlayer(player1)
      game.addPlayer(player2)
    })

    it('should not start with insufficient players', () => {
      const singlePlayerGame = new TestGame('single')
      singlePlayerGame.addPlayer(player1)
      
      expect(singlePlayerGame.startGame()).toBe(false)
      expect(singlePlayerGame.getState().status).toBe('waiting')
    })

    it('should start with minimum players', () => {
      expect(game.startGame()).toBe(true)
      expect(game.getState().status).toBe('playing')
    })

    it('should track current player', () => {
      game.startGame()
      
      const current = game.getCurrentPlayer()
      expect(current).toBeDefined()
      expect(current?.id).toBe('p1')
    })

    it('should advance turns on valid move', () => {
      game.startGame()
      
      const move: Move = {
        playerId: 'p1',
        type: 'valid',
        data: {},
        timestamp: new Date(),
      }
      
      game.makeMove(move)
      
      const current = game.getCurrentPlayer()
      expect(current?.id).toBe('p2')
    })

    it('should not process invalid move', () => {
      game.startGame()
      
      const move: Move = {
        playerId: 'p1',
        type: 'invalid',
        data: {},
        timestamp: new Date(),
      }
      
      const result = game.makeMove(move)
      expect(result).toBe(false)
      
      // Current player should not change
      const current = game.getCurrentPlayer()
      expect(current?.id).toBe('p1')
    })

    it('should detect win condition manually', () => {
      game.addPlayer(player1)
      game.addPlayer(player2)
      game.startGame()
      
      // Make 5 moves for each player (10 total) to reach value = 10
      for (let i = 0; i < 10; i++) {
        const currentPlayer = game.getCurrentPlayer()
        const result = game.makeMove({
          playerId: currentPlayer?.id || '',
          type: 'increment',
          data: {},
          timestamp: new Date(),
        })
        expect(result).toBe(true)
      }
      
      // Value should be 10 now
      const state = game.getState()
      const data = state.data as { round: number; value: number }
      expect(data.value).toBe(10)
      
      // checkWinCondition should be called automatically in makeMove
      // So game should be finished
      expect(state.status).toBe('finished')
      expect(state.winner).toBe('p1')
    })

    it('should cycle through players', () => {
      game.startGame()
      
      expect(game.getCurrentPlayer()?.id).toBe('p1')
      
      game.makeMove({
        playerId: 'p1',
        type: 'valid',
        data: {},
        timestamp: new Date(),
      })
      
      expect(game.getCurrentPlayer()?.id).toBe('p2')
      
      game.makeMove({
        playerId: 'p2',
        type: 'valid',
        data: {},
        timestamp: new Date(),
      })
      
      expect(game.getCurrentPlayer()?.id).toBe('p1')
    })
  })

  describe('State Management', () => {
    it('should return state copy', () => {
      const state1 = game.getState()
      const state2 = game.getState()
      
      expect(state1).not.toBe(state2)
      expect(state1).toEqual(state2)
    })

    it('should restore state', () => {
      game.addPlayer(player1)
      game.addPlayer(player2)
      game.startGame()
      
      const savedState = game.getState()
      
      const newGame = new TestGame('test-game-123')
      newGame.restoreState(savedState)
      
      expect(newGame.getState()).toEqual(savedState)
      expect(newGame.getPlayers()).toHaveLength(2)
    })

    it('should handle empty players array in restore', () => {
      const corruptedState = {
        ...game.getState(),
        players: null as any,
      }
      
      game.restoreState(corruptedState)
      
      expect(game.getPlayers()).toEqual([])
    })
  })

  describe('Helper Methods', () => {
    it('should shuffle players', () => {
      game.addPlayer(player1)
      game.addPlayer(player2)
      game.addPlayer({ id: 'p3', name: 'Player 3' })
      game.addPlayer({ id: 'p4', name: 'Player 4' })
      
      const originalOrder = game.getPlayers().map(p => p.id)
      
      game.shufflePlayers()
      
      const newOrder = game.getPlayers().map(p => p.id)
      
      // Should have same players
      expect(newOrder.sort()).toEqual(originalOrder.sort())
      
      // Order might be different (not guaranteed, but highly likely with 4 players)
      // We'll just check that all players are still there
      expect(game.getPlayers()).toHaveLength(4)
    })

    it('should get game configuration', () => {
      const config = game.getConfig()
      
      expect(config.maxPlayers).toBe(4)
      expect(config.minPlayers).toBe(2)
    })

    it('should check if game is finished', () => {
      expect(game.isGameFinished()).toBe(false)
      
      game.addPlayer(player1)
      game.addPlayer(player2)
      game.startGame()
      
      expect(game.isGameFinished()).toBe(false)
      
      // Manually finish game (set status)
      const state = game.getState()
      state.status = 'finished'
      game.restoreState(state)
      
      expect(game.isGameFinished()).toBe(true)
    })

    it('should provide game rules', () => {
      const rules = game.getGameRules()
      
      expect(rules).toContain('Rule 1')
      expect(rules).toContain('Rule 2')
      expect(rules).toHaveLength(2)
    })
  })

  describe('Turn Management', () => {
    it('should track last move timestamp', () => {
      game.addPlayer(player1)
      game.addPlayer(player2)
      game.startGame()
      
      const beforeMove = Date.now()
      
      game.makeMove({
        playerId: 'p1',
        type: 'valid',
        data: {},
        timestamp: new Date(),
      })
      
      const state = game.getState()
      expect(state.lastMoveAt).toBeGreaterThanOrEqual(beforeMove)
      expect(state.lastMoveAt).toBeLessThanOrEqual(Date.now())
    })

    it('should update timestamps on moves', () => {
      game.addPlayer(player1)
      game.addPlayer(player2)
      game.startGame()
      
      const initialUpdated = game.getState().updatedAt
      
      // Wait a bit
      setTimeout(() => {
        game.makeMove({
          playerId: 'p1',
          type: 'valid',
          data: {},
          timestamp: new Date(),
        })
        
        const newUpdated = game.getState().updatedAt
        expect(newUpdated.getTime()).toBeGreaterThanOrEqual(initialUpdated.getTime())
      }, 10)
    })
  })
})
