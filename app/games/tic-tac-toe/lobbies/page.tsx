'use client'

import { Metadata } from 'next'

/**
 * Tic-Tac-Toe Game Lobbies Page
 * Lists available Tic-Tac-Toe lobbies and allows creating new ones
 */
export default function TicTacToeLobbies() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-4">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-white mb-2">
                        ❌ Tic-Tac-Toe
                    </h1>
                    <p className="text-gray-300">
                        Simple and fast game. Get three in a row to win!
                    </p>
                </div>

                {/* Game Info */}
                <div className="grid md:grid-cols-3 gap-6 mb-12">
                    <div className="bg-slate-700 rounded-lg p-6">
                        <h3 className="text-lg font-semibold text-white mb-2">Players</h3>
                        <p className="text-2xl font-bold text-blue-400">2</p>
                    </div>
                    <div className="bg-slate-700 rounded-lg p-6">
                        <h3 className="text-lg font-semibold text-white mb-2">Duration</h3>
                        <p className="text-2xl font-bold text-blue-400">1-3 min</p>
                    </div>
                    <div className="bg-slate-700 rounded-lg p-6">
                        <h3 className="text-lg font-semibold text-white mb-2">Difficulty</h3>
                        <p className="text-2xl font-bold text-blue-400">Easy</p>
                    </div>
                </div>

                {/* Game Rules */}
                <div className="bg-slate-700 rounded-lg p-6 mb-12">
                    <h2 className="text-2xl font-bold text-white mb-4">How to Play</h2>
                    <ul className="space-y-2 text-gray-300 list-disc list-inside">
                        <li>Two players take turns</li>
                        <li>Mark any empty cell on the 3×3 grid</li>
                        <li>First to get 3 in a row wins (horizontal, vertical, or diagonal)</li>
                        <li>If all 9 cells are filled with no winner, the game is a draw</li>
                    </ul>
                </div>

                {/* Coming Soon Message */}
                <div className="bg-blue-900 border border-blue-700 rounded-lg p-8 text-center">
                    <p className="text-lg text-blue-100 mb-4">
                        Tic-Tac-Toe lobbies are coming soon in the next update!
                    </p>
                    <p className="text-sm text-blue-300">
                        Game logic is ready, UI implementation is in progress.
                    </p>
                </div>
            </div>
        </div>
    )
}
