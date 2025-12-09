import { GameEngine, Player, Move, GameConfig } from '../game-engine'
import { YahtzeeCategory, YahtzeeScorecard, rollDice, calculateScore, calculateTotalScore, isGameFinished } from '../yahtzee'

export interface YahtzeeGameData {
  round: number
  dice: number[] // 5 dice values (1-6)
  held: boolean[] // which dice are held
  rollsLeft: number
  scores: YahtzeeScorecard[]
}

export class YahtzeeGame extends GameEngine {
  constructor(gameId: string, config: GameConfig = { maxPlayers: 4, minPlayers: 1 }) {
    super(gameId, 'yahtzee', config)
  }

  getInitialGameData(): YahtzeeGameData {
    return {
      round: 1,
      dice: [1, 2, 3, 4, 5], // Initial dice values (not rolled yet)
      held: [false, false, false, false, false],
      rollsLeft: 3,
      scores: []
    }
  }

  validateMove(move: Move): boolean {
    const gameData = this.state.data as YahtzeeGameData

    switch (move.type) {
      case 'roll':
        // Check it's player's turn
        const rollPlayerIndex = this.state.players.findIndex(p => p.id === move.playerId)
        if (rollPlayerIndex !== this.state.currentPlayerIndex) return false
        
        // Validate held array if provided (atomic roll)
        if (move.data.held !== undefined) {
          const { held } = move.data
          if (!Array.isArray(held) || held.length !== 5) {
            return false
          }
        }
        
        return gameData.rollsLeft > 0 && this.state.status === 'playing'

      case 'hold':
        // Check it's player's turn
        const holdPlayerIndex = this.state.players.findIndex(p => p.id === move.playerId)
        if (holdPlayerIndex !== this.state.currentPlayerIndex) return false
        
        // Support both formats: diceIndex (toggle one) or held array (set all)
        const { diceIndex, held } = move.data
        
        // If using diceIndex format
        if (diceIndex !== undefined && diceIndex !== null && typeof diceIndex === 'number') {
          return diceIndex >= 0 && diceIndex < 5 && gameData.rollsLeft < 3
        }
        
        // If using held array format
        if (held !== undefined && Array.isArray(held)) {
          return held.length === 5 && gameData.rollsLeft < 3
        }
        
        return false

      case 'score':
        const { category } = move.data as { category: YahtzeeCategory }
        const playerIndex = this.state.players.findIndex(p => p.id === move.playerId)
        if (playerIndex === -1) return false
        
        // Must be player's turn
        if (playerIndex !== this.state.currentPlayerIndex) return false
        
        // Must have rolled at least once
        if (gameData.rollsLeft === 3) return false

        const playerScorecard = gameData.scores[playerIndex] || {}
        return playerScorecard[category] === undefined

      default:
        return false
    }
  }

  processMove(move: Move): void {
    const gameData = this.state.data as YahtzeeGameData

    switch (move.type) {
      case 'roll':
        // Use held array from move data if provided (atomic roll)
        // Otherwise use current held state (backward compatibility)
        const heldState = move.data.held !== undefined && Array.isArray(move.data.held)
          ? move.data.held 
          : gameData.held
        
        // Update held state from move if provided
        if (move.data.held !== undefined && Array.isArray(move.data.held)) {
          gameData.held = [...move.data.held]
        }
        
        // Roll unheld dice - create new array to ensure React detects change
        gameData.dice = gameData.dice.map((die, index) =>
          heldState[index] ? die : Math.floor(Math.random() * 6) + 1
        )
        gameData.rollsLeft--
        break

      case 'hold':
        const { diceIndex, held } = move.data
        
        // Support both formats for backward compatibility
        if (held !== undefined && Array.isArray(held)) {
          // Client sends entire held array - use it directly
          gameData.held = [...held]
        } else if (diceIndex !== undefined) {
          // Client sends index to toggle - toggle that die
          gameData.held = gameData.held.map((isHeld, idx) => 
            idx === diceIndex ? !isHeld : isHeld
          )
        }
        break

      case 'score':
        const { category } = move.data as { category: YahtzeeCategory }
        const playerIndex = this.state.players.findIndex(p => p.id === move.playerId)
        if (playerIndex === -1) return

        // Initialize scorecard if needed
        if (!gameData.scores[playerIndex]) {
          gameData.scores[playerIndex] = {}
        }

        // Calculate and set score - immutable update
        const score = calculateScore(gameData.dice, category)
        gameData.scores[playerIndex] = {
          ...gameData.scores[playerIndex],
          [category]: score
        }

        // Update player score
        this.state.players[playerIndex].score = calculateTotalScore(gameData.scores[playerIndex])

        // Reset for next turn
        gameData.dice = rollDice(5)
        gameData.held = [false, false, false, false, false]
        gameData.rollsLeft = 3
        // Don't increment round - game ends when all players finish all 13 categories
        
        // Note: currentPlayerIndex is advanced by GameEngine.makeMove() after processMove
        break
    }
  }

  checkWinCondition(): Player | null {
    // Yahtzee is finished when all players have completed their scorecards (13 categories each)
    const gameData = this.state.data as YahtzeeGameData
    
    // If not all players have scorecards, game not finished
    if (gameData.scores.length !== this.state.players.length) {
      return null
    }
    
    // Check if all players have filled all categories
    for (let i = 0; i < this.state.players.length; i++) {
      const scorecard = gameData.scores[i]
      if (!scorecard || !isGameFinished(scorecard)) {
        return null // Game not finished
      }
    }

    // Find player with highest score
    let winner: Player | null = null
    let maxScore = -1

    this.state.players.forEach(player => {
      if ((player.score || 0) > maxScore) {
        maxScore = player.score || 0
        winner = player
      }
    })

    return winner
  }

  getGameRules(): string[] {
    return [
      'Roll 5 dice up to 3 times per turn',
      'Hold dice you want to keep between rolls',
      'Score in one of the 13 categories after each turn',
      'Upper section: score sum of dice showing that number',
      'Lower section: special combinations with fixed scores',
      'Bonus 35 points if upper section >= 63',
      'Game ends when all categories are filled',
      'Highest total score wins'
    ]
  }

  // Yahtzee-specific methods
  getDice(): number[] {
    return [...(this.state.data as YahtzeeGameData).dice]
  }

  getHeld(): boolean[] {
    return [...(this.state.data as YahtzeeGameData).held]
  }

  getRollsLeft(): number {
    return (this.state.data as YahtzeeGameData).rollsLeft
  }

  getRound(): number {
    return (this.state.data as YahtzeeGameData).round
  }

  startGame(): boolean {
    if (this.state.players.length < this.config.minPlayers) {
      return false;
    }
    
    // Initialize scorecards for all players
    const gameData = this.state.data as YahtzeeGameData
    gameData.scores = this.state.players.map(() => ({}))
    
    this.state.status = 'playing';
    this.state.updatedAt = new Date();
    return true;
  }

  // Only advance turn on score moves, not on roll or hold
  protected shouldAdvanceTurn(move: Move): boolean {
    return move.type === 'score';
  }

  getScorecard(playerId: string): YahtzeeScorecard {
    const playerIndex = this.state.players.findIndex(p => p.id === playerId)
    if (playerIndex === -1) {
      // Return empty scorecard if player not found
      return {}
    }
    
    const gameData = this.state.data as YahtzeeGameData
    // Return empty object if scorecard doesn't exist yet
    return gameData.scores[playerIndex] || {}
  }
}
