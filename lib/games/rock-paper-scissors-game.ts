import { GameEngine, Player, Move, GameConfig } from '../game-engine'

export type RPSChoice = 'rock' | 'paper' | 'scissors'
export type BestOfMode = 'best-of-3' | 'best-of-5'

/** From a round's reveal to the next round: about a second of reveal, then two seconds to read it. */
export const RPS_ROUND_HOLD_MS = 3_000

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
    nextRoundAt?: number | null  // Server time the next round opens; null before the first reveal and after the last
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
            nextRoundAt: null,
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
            'Best of three: the first to win two rounds takes the match',
            'First to win majority of rounds wins the game',
        ]
    }

    protected shouldAdvanceTurn(_move: Move): boolean {
        // No turn advancement - simultaneous game
        return false
    }

    protected restartsTurnClock(_move: Move): boolean {
        // A reveal has already set the next round's clock to nextRoundAt.
        return (this.state.data as RockPaperScissorsGameData).playersReady.length > 0
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
        gameData.scores[player1.id] ??= 0
        gameData.scores[player2.id] ??= 0

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
            gameData.nextRoundAt = Date.now() + RPS_ROUND_HOLD_MS
            this.state.turnStartedAt = gameData.nextRoundAt
        } else {
            gameData.nextRoundAt = null
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

/**
 * Hide a still-pending (submitted-but-not-yet-revealed) choice from anyone
 * but the player who made it — otherwise a poll, realtime broadcast, or the
 * opponent's own page reload between the two submissions would leak the
 * first player's committed choice, defeating simultaneous reveal.
 *
 * Once both players have submitted, `revealRound()` runs synchronously in
 * the same move and either resets `playerChoices` to null (round continues)
 * or leaves the final round's choices intact with `status: 'finished'` —
 * both are safe to show as-is, so this only ever redacts the narrow window
 * where exactly one player has locked in and the other hasn't.
 *
 * `viewerUserId` lets the direct HTTP response to the submitting player keep
 * their own just-submitted choice visible (they already know what they
 * picked); pass `null` for the broadcast payload shared with everyone else.
 */
export function sanitizeRpsStateForBroadcast<T extends { data?: unknown; status?: string }>(
    state: T,
    viewerUserId: string | null = null
): T {
    const data = state.data as RockPaperScissorsGameData | undefined
    if (!data) return state

    const playersReady = Array.isArray(data.playersReady) ? data.playersReady : []
    const hasPendingUnrevealedChoice = playersReady.length === 1 && state.status !== 'finished'
    if (!hasPendingUnrevealedChoice) return state

    const sanitizedChoices: Record<string, RPSChoice | null> = {}
    for (const [playerId, choice] of Object.entries(data.playerChoices ?? {})) {
        sanitizedChoices[playerId] = playerId === viewerUserId ? choice : null
    }

    return { ...state, data: { ...data, playerChoices: sanitizedChoices } }
}
