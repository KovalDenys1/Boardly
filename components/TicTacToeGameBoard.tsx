'use client'

import React from 'react'
import { TicTacToeGame, TicTacToeGameData, CellValue } from '@/lib/games/tic-tac-toe-game'
import { Move } from '@/lib/game-engine'

interface TicTacToeGameBoardProps {
    game: TicTacToeGame
    currentPlayerId: string
    onMove: (move: Move) => void
    disabled?: boolean
}

/**
 * Tic-Tac-Toe Game Board Component
 * Displays the 3x3 grid and handles player interactions
 */
export function TicTacToeGameBoard({
    game,
    currentPlayerId,
    onMove,
    disabled = false
}: TicTacToeGameBoardProps) {
    const state = game.getState()
    const gameData = state.data as TicTacToeGameData
    const isCurrentPlayer = state.players[state.currentPlayerIndex]?.id === currentPlayerId
    const canMove = !disabled && isCurrentPlayer && state.status === 'playing'

    const handleCellClick = (row: number, col: number) => {
        if (!canMove || gameData.board[row][col] !== null) return

        const move: Move = {
            playerId: currentPlayerId,
            type: 'place',
            data: { row, col },
            timestamp: new Date()
        }

        onMove(move)
    }

    const isCellWinning = (row: number, col: number): boolean => {
        if (!gameData.winningLine) return false
        return gameData.winningLine.some(([r, c]) => r === row && c === col)
    }

    const renderCell = (row: number, col: number) => {
        const value = gameData.board[row][col]
        const isWinning = isCellWinning(row, col)
        const cellKey = `${row}-${col}`

        return (
            <button
                key={cellKey}
                onClick={() => handleCellClick(row, col)}
                disabled={disabled || !canMove || value !== null}
                className={`
          w-20 h-20 sm:w-24 sm:h-24 text-3xl sm:text-5xl font-bold rounded-lg
          transition-all duration-300 cursor-pointer
          border-2 border-slate-600 hover:border-blue-400
          disabled:cursor-not-allowed
          ${isWinning
                        ? 'bg-green-600 text-white scale-105 border-green-400'
                        : value === 'X'
                            ? 'bg-blue-600 text-white'
                            : value === 'O'
                                ? 'bg-red-600 text-white'
                                : 'bg-slate-700 hover:bg-slate-600'
                    }
          ${canMove && value === null ? 'hover:scale-105' : ''}
        `}
                aria-label={`Cell ${row}${col}`}
            >
                {value}
            </button>
        )
    }

    return (
        <div className="flex flex-col items-center gap-6">
            {/* Game Status */}
            <div className="text-center">
                {state.status === 'finished' ? (
                    <div>
                        {gameData.winner === 'draw' ? (
                            <p className="text-2xl font-bold text-yellow-400">Draw!</p>
                        ) : (
                            <p className="text-2xl font-bold text-green-400">
                                Player {gameData.currentSymbol === 'X' ? 'O' : 'X'} Wins! 🎉
                            </p>
                        )}
                    </div>
                ) : (
                    <div>
                        <p className="text-lg text-gray-300 mb-2">
                            Current Turn: <span className="font-bold text-white">{gameData.currentSymbol}</span>
                        </p>
                        <p className={`text-sm ${isCurrentPlayer ? 'text-green-400' : 'text-gray-400'}`}>
                            {isCurrentPlayer ? 'Your turn' : "Waiting for opponent's move"}
                        </p>
                    </div>
                )}
            </div>

            {/* 3x3 Grid */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 bg-slate-900 p-4 sm:p-6 rounded-lg shadow-lg">
                {gameData.board.map((row, rowIdx) =>
                    row.map((cell, colIdx) => renderCell(rowIdx, colIdx))
                )}
            </div>

            {/* Game Info */}
            <div className="text-sm text-gray-400">
                <p>Moves played: {gameData.moveCount}/9</p>
            </div>
        </div>
    )
}

export default TicTacToeGameBoard
