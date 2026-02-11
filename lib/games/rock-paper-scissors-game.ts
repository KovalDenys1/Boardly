import { GameEngine, Player, Move, GameConfig } from '../game-engine'

export type RPSChoice = 'rock' | 'paper' | 'scissors'
export type BestOfMode = 'best-of-3' | 'best-of-5'

export interface RPSRound {
    choices: Record<string, RPSChoice>  // playerId -> choice (empty while waiting for opponent)
    winner: string | 'draw' | null      // playerId or 'draw'
}

export interface RockPaperScissorsGameData {
    mode: BestOfMode
    rounds: RPSRound[]
    playerChoices: Record<string, RPSChoice | null>  // Current round choices (null = no choice yet)
    scores: Record<string, number>  // playerScores
    playersReady: string[]  // Players who submitted their choice for current round
    gameWinner: string | null  // Player ID of game winner
}

export class RockPaperScissorsGame extends GameEngine {
    constructor(gameId: string, config: GameConfig = { maxPlayers: 2, minPlayers: 2 }) {
        super(gameId, 'rockPaperScissors', config)
    }

    getInitialGameData(): RockPaperScissorsGameData {
        return {
            mode: 'best-of-3',
            rounds: [],
            playerChoices: {},
            scores: {},
            playersReady: [],
            gameWinner: null,
        }
    }

    validateMove(move: Move): boolean {
        const gameData = this.state.data as RockPaperScissorsGameData

        // Validate move type
        if (move.type !== 'submit-choice') {
            return false
        }

        // Game must be playing
        if (this.state.status !== 'playing') {
            return false
        }

        // Game must not be finished
        if (gameData.gameWinner !== null) {
            return false
        }

        // Validate choice is one of three options
        const { choice } = move.data as { choice?: unknown }
        if (typeof choice !== 'string' || !['rock', 'paper', 'scissors'].includes(choice)) {
            return false
        }

        // Player must be in game
        const player = this.state.players.find((p) => p.id === move.playerId)
        if (!player) {
            return false
        }

        // Player must not have already submitted choice for this round
        if (gameData.playersReady.includes(move.playerId)) {
            return false
        }

        return true
    }

    processMove(move: Move): void {
        const gameData = this.state.data as RockPaperScissorsGameData
        const { choice } = move.data as { choice: RPSChoice }

        // Record player's choice
        gameData.playerChoices[move.playerId] = choice
        gameData.playersReady.push(move.playerId)

        // Check if both players have submitted
        if (gameData.playersReady.length === this.state.players.length) {
            this.revealRound(gameData)
        }
    }

    checkWinCondition(): Player | null {
        const gameData = this.state.data as RockPaperScissorsGameData

        if (gameData.gameWinner === null) {
            return null
        }

        const winner = this.state.players.find((p) => p.id === gameData.gameWinner)
        return winner || null
    }

    getGameRules(): string[] {
        return [
            'Both players choose Rock, Paper, or Scissors simultaneously',
            'Rock beats Scissors, Scissors beats Paper, Paper beats Rock',
            'If both choose the same, the round is a draw - replay',
            'Best-of-3 or Best-of-5 format (decided at game start)',
            'First to win majority of rounds wins the game',
        ]
    }

    protected shouldAdvanceTurn(_move: Move): boolean {
        // No turn advancement - simultaneous game
        return false
    }

    /**
     * Override startGame to initialize scores for both players
     */
    startGame(): boolean {
        if (!super.startGame()) {
            return false
        }

        const gameData = this.state.data as RockPaperScissorsGameData
        // Initialize scores and player choices for both players
        for (const player of this.state.players) {
            gameData.scores[player.id] = 0
            gameData.playerChoices[player.id] = null
        }

        return true
    }

    /**
     * Calculates round winner and updates scores
     * Called when both players have submitted choices
     */
    private revealRound(gameData: RockPaperScissorsGameData): void {
        const players = this.state.players
        const player1 = players[0]
        const player2 = players[1]

        const choice1 = gameData.playerChoices[player1.id] as RPSChoice | null
        const choice2 = gameData.playerChoices[player2.id] as RPSChoice | null

        if (!choice1 || !choice2) {
            return  // Should not happen if logic is correct
        }

        const roundWinner = this.determineWinner(choice1, choice2)

        // Add round to history
        gameData.rounds.push({
            choices: {
                [player1.id]: choice1,
                [player2.id]: choice2,
            },
            winner: roundWinner,
        })

        // Update scores
        if (!gameData.scores[player1.id]) {
            gameData.scores[player1.id] = 0
        }
        if (!gameData.scores[player2.id]) {
            gameData.scores[player2.id] = 0
        }

        if (roundWinner === player1.id) {
            gameData.scores[player1.id] += 1
        } else if (roundWinner === player2.id) {
            gameData.scores[player2.id] += 1
        }
        // If draw, scores don't change

        // Check if game is won
        const winsNeeded = gameData.mode === 'best-of-3' ? 2 : 3
        for (const player of players) {
            if ((gameData.scores[player.id] || 0) >= winsNeeded) {
                gameData.gameWinner = player.id
                this.state.status = 'finished'
                break
            }
        }

        // Reset choices for next round (if game continues)
        if (!gameData.gameWinner) {
            // Reset playerChoices to null for both players
            for (const player of players) {
                gameData.playerChoices[player.id] = null
            }
            gameData.playersReady = []
        }
    }

    /**
     * Determines winner of a single round
     * Returns player ID or 'draw'
     */
    private determineWinner(choice1: RPSChoice, choice2: RPSChoice): string | 'draw' {
        const player1 = this.state.players[0]
        const player2 = this.state.players[1]

        if (choice1 === choice2) {
            return 'draw'
        }

        // Rock beats Scissors
        if (choice1 === 'rock' && choice2 === 'scissors') {
            return player1.id
        }
        if (choice1 === 'scissors' && choice2 === 'rock') {
            return player2.id
        }

        // Scissors beats Paper
        if (choice1 === 'scissors' && choice2 === 'paper') {
            return player1.id
        }
        if (choice1 === 'paper' && choice2 === 'scissors') {
            return player2.id
        }

        // Paper beats Rock
        if (choice1 === 'paper' && choice2 === 'rock') {
            return player1.id
        }
        if (choice1 === 'rock' && choice2 === 'paper') {
            return player2.id
        }

        return 'draw'
    }
}
