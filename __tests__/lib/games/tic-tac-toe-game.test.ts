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

        // Plays a round where whoever currently has the turn (the round's
        // starting symbol) wins row 0 in 5 moves.
        const playRoundStarterWins = (g: TicTacToeGame) => {
            const state = g.getState()
            const starterId = state.players[state.currentPlayerIndex].id
            const otherId = state.players[state.currentPlayerIndex === 0 ? 1 : 0].id
            g.makeMove({ playerId: starterId, type: 'place', data: { row: 0, col: 0 }, timestamp: new Date() })
            g.makeMove({ playerId: otherId, type: 'place', data: { row: 1, col: 0 }, timestamp: new Date() })
            g.makeMove({ playerId: starterId, type: 'place', data: { row: 0, col: 1 }, timestamp: new Date() })
            g.makeMove({ playerId: otherId, type: 'place', data: { row: 1, col: 1 }, timestamp: new Date() })
            g.makeMove({ playerId: starterId, type: 'place', data: { row: 0, col: 2 }, timestamp: new Date() })
        }

        // Plays a round where the player who does NOT start wins row 0,
        // in 6 moves, without the starter accidentally completing a line first.
        const playRoundOtherWins = (g: TicTacToeGame) => {
            const state = g.getState()
            const starterId = state.players[state.currentPlayerIndex].id
            const otherId = state.players[state.currentPlayerIndex === 0 ? 1 : 0].id
            g.makeMove({ playerId: starterId, type: 'place', data: { row: 2, col: 0 }, timestamp: new Date() })
            g.makeMove({ playerId: otherId, type: 'place', data: { row: 0, col: 0 }, timestamp: new Date() })
            g.makeMove({ playerId: starterId, type: 'place', data: { row: 2, col: 1 }, timestamp: new Date() })
            g.makeMove({ playerId: otherId, type: 'place', data: { row: 0, col: 1 }, timestamp: new Date() })
            g.makeMove({ playerId: starterId, type: 'place', data: { row: 1, col: 2 }, timestamp: new Date() })
            g.makeMove({ playerId: otherId, type: 'place', data: { row: 0, col: 2 }, timestamp: new Date() })
        }

        const playNextRound = (g: TicTacToeGame) => {
            const state = g.getState()
            g.makeMove({
                playerId: state.players[0].id,
                type: 'next-round',
                data: {},
                timestamp: new Date(),
            })
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

        describe('best-of-N early stop', () => {
            it('ends a best-of-3 series 2-0 without playing the 3rd round', () => {
                const bo3 = new TicTacToeGame('bo3-sweep', {
                    maxPlayers: 2,
                    minPlayers: 2,
                    rules: { targetRounds: 3 },
                })
                testPlayers.forEach(player => bo3.addPlayer(player))
                bo3.startGame()

                playRoundStarterWins(bo3) // round 1: X starts and wins -> X:1
                playNextRound(bo3)
                playRoundOtherWins(bo3) // round 2: O starts, X (other) wins -> X:2

                expect(bo3.isSeriesComplete()).toBe(true)
                expect(getGameData(bo3).match.roundsPlayed).toBe(2)

                const nextRoundMove = { playerId: 'player-x', type: 'next-round', data: {}, timestamp: new Date() }
                expect(bo3.validateMove(nextRoundMove)).toBe(false)

                const winner = bo3.checkWinCondition()
                expect(winner?.id).toBe('player-x')
            })

            it('requires a 3rd round in a best-of-3 series tied 1-1', () => {
                const bo3 = new TicTacToeGame('bo3-tied', {
                    maxPlayers: 2,
                    minPlayers: 2,
                    rules: { targetRounds: 3 },
                })
                testPlayers.forEach(player => bo3.addPlayer(player))
                bo3.startGame()

                playRoundStarterWins(bo3) // round 1: X starts and wins -> X:1
                playNextRound(bo3)
                playRoundStarterWins(bo3) // round 2: O starts and wins -> O:1

                expect(bo3.isSeriesComplete()).toBe(false)
                expect(getGameData(bo3).match.roundsPlayed).toBe(2)

                const nextRoundMove = { playerId: 'player-x', type: 'next-round', data: {}, timestamp: new Date() }
                expect(bo3.validateMove(nextRoundMove)).toBe(true)
            })

            it('ends a best-of-5 series 3-0 without playing rounds 4-5', () => {
                const bo5 = new TicTacToeGame('bo5-sweep', {
                    maxPlayers: 2,
                    minPlayers: 2,
                    rules: { targetRounds: 5 },
                })
                testPlayers.forEach(player => bo5.addPlayer(player))
                bo5.startGame()

                playRoundStarterWins(bo5) // round 1: X starts and wins -> X:1
                playNextRound(bo5)
                playRoundOtherWins(bo5) // round 2: O starts, X (other) wins -> X:2
                playNextRound(bo5)
                playRoundStarterWins(bo5) // round 3: X starts and wins -> X:3

                expect(bo5.isSeriesComplete()).toBe(true)
                expect(getGameData(bo5).match.roundsPlayed).toBe(3)
            })

            it('does not early-stop a single-game match (targetRounds=1)', () => {
                const single = new TicTacToeGame('single-game', {
                    maxPlayers: 2,
                    minPlayers: 2,
                    rules: { targetRounds: 1 },
                })
                testPlayers.forEach(player => single.addPlayer(player))
                single.startGame()

                playRoundStarterWins(single)

                expect(single.isSeriesComplete()).toBe(true)
                expect(getGameData(single).match.roundsPlayed).toBe(1)
            })

            it('never early-stops an unlimited-rounds match (targetRounds=null)', () => {
                playRoundStarterWins(game)
                playNextRound(game)
                playRoundOtherWins(game)

                expect(game.isSeriesComplete()).toBe(false)

                const nextRoundMove = { playerId: 'player-x', type: 'next-round', data: {}, timestamp: new Date() }
                expect(game.validateMove(nextRoundMove)).toBe(true)
            })
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

    describe('undo and draw requests', () => {
        beforeEach(() => {
            testPlayers.forEach(player => game.addPlayer(player))
            game.startGame()
        })

        it('should undo the last move after the opponent accepts the request', () => {
            game.makeMove({
                playerId: 'player-x',
                type: 'place',
                data: { row: 0, col: 0 },
                timestamp: new Date()
            })
            game.makeMove({
                playerId: 'player-o',
                type: 'place',
                data: { row: 1, col: 1 },
                timestamp: new Date()
            })

            expect(game.makeMove({
                playerId: 'player-x',
                type: 'request-undo',
                data: {},
                timestamp: new Date()
            })).toBe(true)

            const pendingRequest = game.getPendingRequest()
            expect(pendingRequest).toMatchObject({
                type: 'undo',
                requesterId: 'player-x',
                responderId: 'player-o',
            })

            expect(game.makeMove({
                playerId: 'player-o',
                type: 'respond-undo',
                data: { accept: true },
                timestamp: new Date()
            })).toBe(true)

            const data = getGameData(game)
            expect(data.board).toEqual([
                ['X', null, null],
                [null, null, null],
                [null, null, null],
            ])
            expect(data.moveCount).toBe(1)
            expect(data.currentSymbol).toBe('O')
            expect(data.moveHistory).toEqual([
                expect.objectContaining({
                    playerId: 'player-x',
                    symbol: 'X',
                    row: 0,
                    col: 0,
                }),
            ])
            expect(data.pendingRequest).toBeNull()
            expect(game.getState().status).toBe('playing')
            expect(game.getState().currentPlayerIndex).toBe(1)
        })

        it('should finish the round as a draw when a draw offer is accepted', () => {
            game.makeMove({
                playerId: 'player-x',
                type: 'place',
                data: { row: 0, col: 0 },
                timestamp: new Date()
            })
            game.makeMove({
                playerId: 'player-o',
                type: 'place',
                data: { row: 1, col: 1 },
                timestamp: new Date()
            })

            expect(game.makeMove({
                playerId: 'player-x',
                type: 'request-draw',
                data: {},
                timestamp: new Date()
            })).toBe(true)
            expect(game.makeMove({
                playerId: 'player-o',
                type: 'respond-draw',
                data: { accept: true },
                timestamp: new Date()
            })).toBe(true)

            const data = getGameData(game)
            expect(data.winner).toBe('draw')
            expect(game.getState().status).toBe('finished')
            expect(data.match?.draws).toBe(1)
            expect(data.match?.roundsPlayed).toBe(1)
            expect(data.pendingRequest).toBeNull()
        })

        it('should award the round to the opponent when the active player times out', () => {
            game.makeMove({
                playerId: 'player-x',
                type: 'place',
                data: { row: 0, col: 0 },
                timestamp: new Date()
            })

            expect(game.makeMove({
                playerId: 'player-o',
                type: 'timeout-forfeit',
                data: {},
                timestamp: new Date()
            })).toBe(true)

            const data = getGameData(game)
            expect(data.winner).toBe('X')
            expect(data.winningLine).toBeNull()
            expect(data.match?.winsBySymbol.X).toBe(1)
            expect(data.match?.winsBySymbol.O).toBe(0)
            expect(data.match?.roundsPlayed).toBe(1)
            expect(game.getState().status).toBe('finished')
            expect(game.getState().winner).toBe('player-x')
        })

        it('should recognize when the remaining position is a theoretical draw', () => {
            game.restoreState({
                ...game.getState(),
                players: testPlayers,
                currentPlayerIndex: 0,
                status: 'playing',
                data: {
                    board: [
                        ['X', 'O', 'X'],
                        ['X', 'O', null],
                        ['O', 'X', null],
                    ],
                    currentSymbol: 'X',
                    winner: null,
                    winningLine: null,
                    moveCount: 7,
                    match: {
                        targetRounds: null,
                        roundsPlayed: 0,
                        winsBySymbol: { X: 0, O: 0 },
                        draws: 0,
                    },
                    moveHistory: [
                        { playerId: 'player-x', symbol: 'X', row: 0, col: 0, timestamp: Date.now() - 7000 },
                        { playerId: 'player-o', symbol: 'O', row: 0, col: 1, timestamp: Date.now() - 6000 },
                        { playerId: 'player-x', symbol: 'X', row: 0, col: 2, timestamp: Date.now() - 5000 },
                        { playerId: 'player-o', symbol: 'O', row: 1, col: 1, timestamp: Date.now() - 4000 },
                        { playerId: 'player-x', symbol: 'X', row: 1, col: 0, timestamp: Date.now() - 3000 },
                        { playerId: 'player-o', symbol: 'O', row: 2, col: 0, timestamp: Date.now() - 2000 },
                        { playerId: 'player-x', symbol: 'X', row: 2, col: 1, timestamp: Date.now() - 1000 },
                    ],
                    undoSnapshots: [],
                    pendingRequest: null,
                },
                createdAt: new Date(),
                updatedAt: new Date(),
            })

            expect(game.isTheoreticalDraw()).toBe(true)
        })
    })
})
