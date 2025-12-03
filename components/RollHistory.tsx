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
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-4 border border-gray-200 dark:border-gray-700 h-full flex flex-col">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">📜</span>
          <h3 className="font-bold text-base text-gray-900 dark:text-white">Roll History</h3>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            No rolls yet
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-4 border border-gray-200 dark:border-gray-700 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <span className="text-xl">📜</span>
        <h3 className="font-bold text-base text-gray-900 dark:text-white">Recent Rolls</h3>
        <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded-full text-gray-600 dark:text-gray-400">
          {entries.length}
        </span>
      </div>

      <div className="space-y-2 overflow-y-auto pr-1 flex-1 custom-scrollbar snap-y snap-mandatory">
        {[...entries].reverse().map((entry) => (
          <div
            key={entry.id}
            className={`
              p-2.5 rounded-xl transition-all shadow-sm border-2 snap-start
              ${
                entry.isBot
                  ? 'bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30 border-purple-200 dark:border-purple-700'
                  : 'bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/30 dark:to-cyan-900/30 border-blue-200 dark:border-blue-700'
              }
            `}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-sm">{entry.isBot ? '🤖' : '🎲'}</span>
                <span className="font-bold text-xs text-gray-900 dark:text-white truncate">
                  {entry.playerName}
                </span>
              </div>
              <div className="text-xs px-1.5 py-0.5 bg-white/50 dark:bg-gray-900/50 rounded-full text-gray-700 dark:text-gray-300 shrink-0">
                T{entry.turnNumber} • R{entry.rollNumber}
              </div>
            </div>

            {/* Dice Display */}
            <div className="flex items-center gap-2">
              <div className="flex gap-1 flex-wrap flex-1">
                {entry.dice.map((die, index) => {
                  const isHeld = entry.held.includes(index)
                  return (
                    <div
                      key={index}
                      className={`
                        w-6 h-6 rounded-md flex items-center justify-center
                        text-xs font-bold transition-all shadow-sm
                        ${
                          isHeld
                            ? 'bg-gradient-to-br from-yellow-400 to-amber-500 text-gray-900 ring-2 ring-yellow-600'
                            : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-2 border-gray-300 dark:border-gray-600'
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
                <div className="text-xs px-1.5 py-0.5 bg-yellow-500/20 dark:bg-yellow-500/30 rounded-lg text-yellow-800 dark:text-yellow-300 font-bold shrink-0 flex items-center gap-0.5">
                  <span>🔒</span>
                  <span>{entry.held.length}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
