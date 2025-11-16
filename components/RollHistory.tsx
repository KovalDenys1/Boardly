'use client'

import React from 'react'

export interface RollHistoryEntry {
  id: string
  turnNumber: number
  playerName: string
  rollNumber: number
  dice: number[]
  held: number[]
  timestamp: number
  isBot: boolean
}

interface RollHistoryProps {
  entries: RollHistoryEntry[]
  compact?: boolean
}

export default function RollHistory({ entries, compact = false }: RollHistoryProps) {
  if (entries.length === 0) {
    return (
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">📜</span>
          <h3 className="font-bold text-gray-900 dark:text-white">Roll History</h3>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
          No rolls yet. Start playing to see history!
        </p>
      </div>
    )
  }

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">📜</span>
        <h3 className="font-bold text-gray-900 dark:text-white">Recent Rolls</h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          ({entries.length} {entries.length === 1 ? 'roll' : 'rolls'})
        </span>
      </div>

      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className={`
              p-3 rounded-lg transition-all
              ${
                entry.isBot
                  ? 'bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800'
                  : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
              }
            `}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">{entry.isBot ? '🤖' : '🎲'}</span>
                <span className="font-semibold text-sm text-gray-900 dark:text-white">
                  {entry.playerName}
                </span>
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Turn {entry.turnNumber} • Roll {entry.rollNumber}/3
              </div>
            </div>

            {/* Dice Display */}
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {entry.dice.map((die, index) => {
                  const isHeld = entry.held.includes(index)
                  return (
                    <div
                      key={index}
                      className={`
                        w-8 h-8 rounded flex items-center justify-center
                        text-sm font-bold transition-all
                        ${
                          isHeld
                            ? 'bg-yellow-400 dark:bg-yellow-500 text-gray-900 ring-2 ring-yellow-600 scale-105'
                            : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600'
                        }
                      `}
                    >
                      {die}
                    </div>
                  )
                })}
              </div>

              {/* Held indicator */}
              {entry.held.length > 0 && (
                <div className="text-xs text-yellow-700 dark:text-yellow-400 font-medium">
                  🔒 Held {entry.held.length}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
