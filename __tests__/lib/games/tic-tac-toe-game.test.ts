import { TicTacToeGame, TicTacToeGameData } from '@/lib/games/tic-tac-toe-game'
import { Player } from '@/lib/game-engine'

// Helper to get typed game data
const getGameData = (game: TicTacToeGame): TicTacToeGameData => {
    return game.getState().data as TicTacToeGameData
}

describe('TicTacToeGame', () => {
    let game: TicTacToeGame
    const gameId = 'test-tic-tac-toe-game'
    const testPlayers: Player[] = [
        { id: 'player-x', name: 'Player X' },
        { id: 'player-o', name: 'Player O' },
    ]

    beforeEach(() => {
        game = new TicTacToeGame(gameId)
    })

    describe('initialization', () => {
        it('should initialize with correct default state', () => {
            const initialData = game.getInitialGameData()

            expect(initialData.board).toEqual([
                [null, null, null],
                [null, null, null],
                [null, null, null]
            ])
            expect(initialData.currentSymbol).toBe('X')
            expect(initialData.winner).toBeNull()
            expect(initialData.winningLine).toBeNull()
            expect(initialData.moveCount).toBe(0)
        })

        it('should require exactly 2 players', () => {
            const config = game.getConfig()
            expect(config.maxPlayers).toBe(2)
            expect(config.minPlayers).toBe(2)
        })

        it('should have game type ticTacToe', () => {
            const state = game.getState()
            expect(state.gameType).toBe('ticTacToe')
        })
    })

    describe('player management', () => {
        it('should add two players successfully', () => {
            expect(game.addPlayer(testPlayers[0])).toBe(true)
            expect(game.addPlayer(testPlayers[1])).toBe(true)
            expect(game.getPlayers()).toHaveLength(2)
        })

        it('should not allow more than 2 players', () => {
            game.addPlayer(testPlayers[0])
            game.addPlayer(testPlayers[1])

            const thirdPlayer = { id: 'player-3', name: 'Player 3' }
            expect(game.addPlayer(thirdPlayer)).toBe(false)
            expect(game.getPlayers()).toHaveLength(2)
        })

        it('should start game with 2 players', () => {
            game.addPlayer(testPlayers[0])
            game.addPlayer(testPlayers[1])

            expect(game.startGame()).toBe(true)
            expect(game.getState().status).toBe('playing')
        })

        it('should not start game with less than 2 players', () => {
            game.addPlayer(testPlayers[0])

            expect(game.startGame()).toBe(false)
            expect(game.getState().status).toBe('waiting')
        })
    })

    describe('validateMove', () => {
        beforeEach(() => {
            testPlayers.forEach(player => game.addPlayer(player))
            game.startGame()
        })

        it('should accept valid move for current player', () => {
            const move = {
                playerId: 'player-x', // First player (X)
                type: 'place',
                data: { row: 0, col: 0 },
                timestamp: new Date()
            }

            expect(game.validateMove(move)).toBe(true)
        })

        it('should reject move from non-current player', () => {
            const move = {
                playerId: 'player-o', // Second player trying to move first
                type: 'place',
                data: { row: 0, col: 0 },
                timestamp: new Date()
            }

            expect(game.validateMove(move)).toBe(false)
        })

        it('should reject move with invalid coordinates (negative)', () => {
            const move = {
                playerId: 'player-x',
                type: 'place',
                data: { row: -1, col: 0 },
                timestamp: new Date()
            }

            expect(game.validateMove(move)).toBe(false)
        })

        it('should reject move with invalid coordinates (too large)', () => {
            const move = {
                playerId: 'player-x',
                type: 'place',
                data: { row: 0, col: 3 },
                timestamp: new Date()
            }

            expect(game.validateMove(move)).toBe(false)
        })

        it('should reject move on occupied cell', () => {
            const data = getGameData(game)
            data.board[1][1] = 'X'

            const move = {
                playerId: 'player-x',
                type: 'place',
                data: { row: 1, col: 1 },
                timestamp: new Date()
            }

            expect(game.validateMove(move)).toBe(false)
        })

        it('should reject move when game is finished', () => {
            const data = getGameData(game)
            data.winner = 'X'

            const move = {
                playerId: 'player-x',
                type: 'place',
                data: { row: 0, col: 0 },
                timestamp: new Date()
            }

            expect(game.validateMove(move)).toBe(false)
        })

        it('should reject move with invalid type', () => {
            const move = {
                playerId: 'player-x',
                type: 'invalid-action',
                data: { row: 0, col: 0 },
                timestamp: new Date()
            }

            expect(game.validateMove(move)).toBe(false)
        })

        it('should reject move when game is not playing', () => {
            // Create a new game that hasn't been started
            const notStartedGame = new TicTacToeGame('not-started-game')
            notStartedGame.addPlayer(testPlayers[0])
            notStartedGame.addPlayer(testPlayers[1])
            // Don't start the game - status should be 'waiting'

            const move = {
                playerId: 'player-x',
                type: 'place',
                data: { row: 0, col: 0 },
                timestamp: new Date()
            }

            expect(notStartedGame.validateMove(move)).toBe(false)
            expect(notStartedGame.getState().status).toBe('waiting')
        })
    })

    describe('processMove', () => {
        beforeEach(() => {
            testPlayers.forEach(player => game.addPlayer(player))
            game.startGame()
        })

        it('should place X mark and switch to O', () => {
            const move = {
                playerId: 'player-x',
                type: 'place',
                data: { row: 0, col: 0 },
                timestamp: new Date()
            }

            game.makeMove(move)
            const data = getGameData(game)

            expect(data.board[0][0]).toBe('X')
            expect(data.currentSymbol).toBe('O')
            expect(data.moveCount).toBe(1)
            expect(game.getState().currentPlayerIndex).toBe(1)
        })

        it('should place O mark and switch to X', () => {
            // First move (X)
            game.makeMove({
                playerId: 'player-x',
                type: 'place',
                data: { row: 0, col: 0 },
                timestamp: new Date()
            })

            // Second move (O)
            game.makeMove({
                playerId: 'player-o',
                type: 'place',
                data: { row: 1, col: 1 },
                timestamp: new Date()
            })

            const data = getGameData(game)
            expect(data.board[1][1]).toBe('O')
            expect(data.currentSymbol).toBe('X')
            expect(data.moveCount).toBe(2)
        })

        it('should increment move count correctly', () => {
            game.makeMove({
                playerId: 'player-x',
                type: 'place',
                data: { row: 0, col: 0 },
                timestamp: new Date()
            })

            const data = getGameData(game)
            expect(data.moveCount).toBe(1)

            game.makeMove({
                playerId: 'player-o',
                type: 'place',
                data: { row: 0, col: 1 },
                timestamp: new Date()
            })

            expect(data.moveCount).toBe(2)
        })
    })

    describe('win detection - horizontal', () => {
        beforeEach(() => {
            testPlayers.forEach(player => game.addPlayer(player))
            game.startGame()
        })

        it('should detect winner with horizontal line (top row)', () => {
            // X X X
            // O O .
            // . . .
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 0, col: 0 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-o', type: 'place', data: { row: 1, col: 0 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 0, col: 1 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-o', type: 'place', data: { row: 1, col: 1 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 0, col: 2 }, timestamp: new Date() })

            const data = getGameData(game)
            expect(data.winner).toBe('X')
            expect(data.winningLine).toEqual([[0, 0], [0, 1], [0, 2]])
            expect(game.getState().status).toBe('finished')
            expect(game.checkWinCondition()).toEqual(testPlayers[0])
        })

        it('should detect winner with horizontal line (middle row)', () => {
            // X X O
            // O O O
            // X . .
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 0, col: 0 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-o', type: 'place', data: { row: 1, col: 0 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 0, col: 1 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-o', type: 'place', data: { row: 1, col: 1 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 2, col: 0 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-o', type: 'place', data: { row: 1, col: 2 }, timestamp: new Date() })

            const data = getGameData(game)
            expect(data.winner).toBe('O')
            expect(data.winningLine).toEqual([[1, 0], [1, 1], [1, 2]])
        })

        it('should detect winner with horizontal line (bottom row)', () => {
            // O O .
            // O X .
            // X X X
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 2, col: 0 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-o', type: 'place', data: { row: 0, col: 0 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 2, col: 1 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-o', type: 'place', data: { row: 0, col: 1 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 1, col: 1 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-o', type: 'place', data: { row: 1, col: 0 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 2, col: 2 }, timestamp: new Date() })

            const data = getGameData(game)
            expect(data.winner).toBe('X')
            expect(data.winningLine).toEqual([[2, 0], [2, 1], [2, 2]])
        })
    })

    describe('win detection - vertical', () => {
        beforeEach(() => {
            testPlayers.forEach(player => game.addPlayer(player))
            game.startGame()
        })

        it('should detect winner with vertical line (left column)', () => {
            // X O O
            // X . .
            // X . .
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 0, col: 0 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-o', type: 'place', data: { row: 0, col: 1 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 1, col: 0 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-o', type: 'place', data: { row: 0, col: 2 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 2, col: 0 }, timestamp: new Date() })

            const data = getGameData(game)
            expect(data.winner).toBe('X')
            expect(data.winningLine).toEqual([[0, 0], [1, 0], [2, 0]])
        })

        it('should detect winner with vertical line (middle column)', () => {
            // X O X
            // . O .
            // . O .
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 0, col: 0 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-o', type: 'place', data: { row: 0, col: 1 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 0, col: 2 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-o', type: 'place', data: { row: 1, col: 1 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 1, col: 0 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-o', type: 'place', data: { row: 2, col: 1 }, timestamp: new Date() })

            const data = getGameData(game)
            expect(data.winner).toBe('O')
            expect(data.winningLine).toEqual([[0, 1], [1, 1], [2, 1]])
        })

        it('should detect winner with vertical line (right column)', () => {
            // O O X
            // . . X
            // . . X
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 0, col: 2 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-o', type: 'place', data: { row: 0, col: 0 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 1, col: 2 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-o', type: 'place', data: { row: 0, col: 1 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 2, col: 2 }, timestamp: new Date() })

            const data = getGameData(game)
            expect(data.winner).toBe('X')
            expect(data.winningLine).toEqual([[0, 2], [1, 2], [2, 2]])
        })
    })

    describe('win detection - diagonal', () => {
        beforeEach(() => {
            testPlayers.forEach(player => game.addPlayer(player))
            game.startGame()
        })

        it('should detect winner with main diagonal (top-left to bottom-right)', () => {
            // X O O
            // . X .
            // . . X
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 0, col: 0 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-o', type: 'place', data: { row: 0, col: 1 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 1, col: 1 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-o', type: 'place', data: { row: 0, col: 2 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 2, col: 2 }, timestamp: new Date() })

            const data = getGameData(game)
            expect(data.winner).toBe('X')
            expect(data.winningLine).toEqual([[0, 0], [1, 1], [2, 2]])
        })

        it('should detect winner with anti-diagonal (top-right to bottom-left)', () => {
            // X X O
            // . O .
            // O . .
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 0, col: 0 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-o', type: 'place', data: { row: 0, col: 2 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 0, col: 1 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-o', type: 'place', data: { row: 1, col: 1 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 1, col: 0 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-o', type: 'place', data: { row: 2, col: 0 }, timestamp: new Date() })

            const data = getGameData(game)
            expect(data.winner).toBe('O')
            expect(data.winningLine).toEqual([[0, 2], [1, 1], [2, 0]])
        })
    })

    describe('draw detection', () => {
        beforeEach(() => {
            testPlayers.forEach(player => game.addPlayer(player))
            game.startGame()
        })

        it('should detect draw when board is full with no winner', () => {
            // X O X
            // O O X
            // X X O
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 0, col: 0 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-o', type: 'place', data: { row: 0, col: 1 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 0, col: 2 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-o', type: 'place', data: { row: 1, col: 0 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 1, col: 2 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-o', type: 'place', data: { row: 1, col: 1 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 2, col: 0 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-o', type: 'place', data: { row: 2, col: 2 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 2, col: 1 }, timestamp: new Date() })

            const data = getGameData(game)
            expect(data.winner).toBe('draw')
            expect(data.moveCount).toBe(9)
            expect(game.checkWinCondition()).toBeNull()
            expect(game.getState().status).toBe('finished')
        })
    })

    describe('match progression', () => {
        const playXWinRound = () => {
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 0, col: 0 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-o', type: 'place', data: { row: 1, col: 0 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 0, col: 1 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-o', type: 'place', data: { row: 1, col: 1 }, timestamp: new Date() })
            game.makeMove({ playerId: 'player-x', type: 'place', data: { row: 0, col: 2 }, timestamp: new Date() })
        }

        beforeEach(() => {
            testPlayers.forEach(player => game.addPlayer(player))
            game.startGame()
        })

        it('initializes match state with unlimited rounds by default', () => {
            const data = getGameData(game)
            expect(data.match).toEqual({
                targetRounds: null,
                roundsPlayed: 0,
                winsBySymbol: { X: 0, O: 0 },
                draws: 0,
            })
        })

        it('records wins and starts the next round without creating a new game', () => {
            playXWinRound()

            const finishedData = getGameData(game)
            expect(finishedData.match?.roundsPlayed).toBe(1)
            expect(finishedData.match?.winsBySymbol.X).toBe(1)
            expect(finishedData.match?.winsBySymbol.O).toBe(0)
            expect(game.getPlayers()[0].score).toBe(1)
            expect(game.getPlayers()[1].score).toBe(0)

            const nextRoundMove = {
                playerId: 'player-o',
                type: 'next-round',
                data: {},
                timestamp: new Date(),
            }

            expect(game.validateMove(nextRoundMove)).toBe(true)
            expect(game.makeMove(nextRoundMove)).toBe(true)

            const nextRoundData = getGameData(game)
            expect(game.getState().status).toBe('playing')
            expect(game.getState().currentPlayerIndex).toBe(1)
            expect(nextRoundData.currentSymbol).toBe('O')
            expect(nextRoundData.moveCount).toBe(0)
            expect(nextRoundData.winner).toBeNull()
            expect(nextRoundData.board).toEqual([
                [null, null, null],
                [null, null, null],
                [null, null, null]
            ])
        })

        it('prevents next-round when configured target rounds are complete', () => {
            const cappedGame = new TicTacToeGame('capped-game', {
                maxPlayers: 2,
                minPlayers: 2,
                rules: { targetRounds: 1 },
            })
            testPlayers.forEach(player => cappedGame.addPlayer(player))
            cappedGame.startGame()

            cappedGame.makeMove({ playerId: 'player-x', type: 'place', data: { row: 0, col: 0 }, timestamp: new Date() })
            cappedGame.makeMove({ playerId: 'player-o', type: 'place', data: { row: 1, col: 0 }, timestamp: new Date() })
            cappedGame.makeMove({ playerId: 'player-x', type: 'place', data: { row: 0, col: 1 }, timestamp: new Date() })
            cappedGame.makeMove({ playerId: 'player-o', type: 'place', data: { row: 1, col: 1 }, timestamp: new Date() })
            cappedGame.makeMove({ playerId: 'player-x', type: 'place', data: { row: 0, col: 2 }, timestamp: new Date() })

            const nextRoundMove = {
                playerId: 'player-x',
                type: 'next-round',
                data: {},
                timestamp: new Date(),
            }

            expect(cappedGame.validateMove(nextRoundMove)).toBe(false)
            expect(cappedGame.makeMove(nextRoundMove)).toBe(false)
        })
    })

    describe('getGameRules', () => {
        it('should return array of game rules', () => {
            const rules = game.getGameRules()

            expect(Array.isArray(rules)).toBe(true)
            expect(rules.length).toBeGreaterThan(0)
            expect(rules[0]).toContain('Two players')
        })
    })

    describe('state restoration', () => {
        it('should restore game state correctly', () => {
            const savedState = {
                id: 'restored-game',
                gameType: 'ticTacToe',
                players: testPlayers,
                currentPlayerIndex: 1,
                status: 'playing' as const,
                data: {
                    board: [
                        ['X', 'O', null],
                        ['X', null, null],
                        [null, null, null]
                    ],
                    currentSymbol: 'O' as const,
                    winner: null,
                    winningLine: null,
                    moveCount: 3
                },
                createdAt: new Date(),
                updatedAt: new Date()
            }

            game.restoreState(savedState)
            const state = game.getState()
            const data = getGameData(game)

            expect(state.id).toBe('restored-game')
            expect(state.currentPlayerIndex).toBe(1)
            expect(data.board[0][0]).toBe('X')
            expect(data.board[0][1]).toBe('O')
            expect(data.moveCount).toBe(3)
        })
    })

    describe('edge cases', () => {
        beforeEach(() => {
            testPlayers.forEach(player => game.addPlayer(player))
            game.startGame()
        })

        it('should not allow moves after game is won', () => {
            // Set up winning state
            const data = getGameData(game)
            data.board = [
                ['X', 'X', 'X'],
                ['O', 'O', null],
                [null, null, null]
            ]
            data.winner = 'X'

            const move = {
                playerId: 'player-o',
                type: 'place',
                data: { row: 1, col: 2 },
                timestamp: new Date()
            }

            expect(game.validateMove(move)).toBe(false)
        })

        it('should handle makeMove with invalid move gracefully', () => {
            const move = {
                playerId: 'player-o', // Not their turn
                type: 'place',
                data: { row: 0, col: 0 },
                timestamp: new Date()
            }

            const result = game.makeMove(move)
            expect(result).toBe(false)

            const data = getGameData(game)
            expect(data.board[0][0]).toBeNull()
            expect(data.moveCount).toBe(0)
        })

        it('should not change board state when move is invalid', () => {
            const initialBoard = getGameData(game).board.map(row => [...row])

            const invalidMove = {
                playerId: 'player-x',
                type: 'place',
                data: { row: 5, col: 5 }, // Invalid coordinates
                timestamp: new Date()
            }

            game.makeMove(invalidMove)
            const finalBoard = getGameData(game).board

            expect(finalBoard).toEqual(initialBoard)
        })
    })
})
