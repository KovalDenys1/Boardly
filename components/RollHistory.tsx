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
  isBot?: boolean  // Optional for backwards compatibility, use botId instead
  botId?: string | null  // New: null = human, string = bot user ID
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
    <div className="bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700 h-full flex flex-col" style={{ borderRadius: 'clamp(12px, 1.2vw, 20px)', padding: 'clamp(10px, 1vh, 18px)' }}>
      <div className="flex items-center flex-shrink-0" style={{ gap: 'clamp(5px, 0.5vw, 10px)', marginBottom: 'clamp(8px, 0.8vh, 14px)' }}>
        <span style={{ fontSize: 'clamp(14px, 1vw, 20px)' }}>📜</span>
        <h3 className="font-bold text-gray-900 dark:text-white truncate" style={{ fontSize: 'clamp(12px, 0.9vw, 16px)' }}>Recent Rolls</h3>
        <span className="bg-gray-200 dark:bg-gray-700 rounded-full text-gray-600 dark:text-gray-400 shrink-0" style={{ fontSize: 'clamp(9px, 0.75vw, 12px)', padding: 'clamp(2px, 0.2vh, 3px) clamp(5px, 0.5vw, 8px)' }}>
          {entries.length}
        </span>
      </div>

      <div className="overflow-y-auto pr-1 flex-1 custom-scrollbar snap-y snap-mandatory" style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(5px, 0.5vh, 10px)' }}>
        {[...entries].reverse().map((entry) => (
          <div
            key={entry.id}
            className={`
              rounded-lg transition-all shadow-sm border-2 snap-start
              ${
                (entry.isBot || entry.botId)
                  ? 'bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30 border-purple-200 dark:border-purple-700'
                  : 'bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/30 dark:to-cyan-900/30 border-blue-200 dark:border-blue-700'
              }
            `}
            style={{ padding: 'clamp(7px, 0.7vh, 12px)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between" style={{ marginBottom: 'clamp(4px, 0.4vh, 7px)' }}>
              <div className="flex items-center min-w-0 flex-1" style={{ gap: 'clamp(3px, 0.3vw, 6px)' }}>
                <span style={{ fontSize: 'clamp(11px, 0.85vw, 14px)', flexShrink: 0 }}>{(entry.isBot || entry.botId) ? '🤖' : '🎲'}</span>
                <span className="font-bold text-gray-900 dark:text-white truncate" style={{ fontSize: 'clamp(10px, 0.8vw, 13px)' }}>
                  {entry.playerName}
                </span>
              </div>
              <div className="bg-white/50 dark:bg-gray-900/50 rounded-full text-gray-700 dark:text-gray-300 shrink-0" style={{ fontSize: 'clamp(8px, 0.65vw, 11px)', padding: 'clamp(1px, 0.15vh, 3px) clamp(4px, 0.4vw, 7px)' }}>
                T{entry.turnNumber} • R{entry.rollNumber}
              </div>
            </div>

            {/* Dice Display */}
            <div className="flex items-center" style={{ gap: 'clamp(4px, 0.4vw, 8px)' }}>
              <div className="flex flex-wrap flex-1" style={{ gap: 'clamp(2px, 0.2vw, 4px)' }}>
                {entry.dice.map((die, index) => {
                  const isHeld = entry.held.includes(index)
                  return (
                    <div
                      key={index}
                      className={`
                        rounded-md flex items-center justify-center
                        font-bold transition-all shadow-sm
                        ${
                          isHeld
                            ? 'bg-gradient-to-br from-yellow-400 to-amber-500 text-gray-900 ring-2 ring-yellow-600'
                            : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-2 border-gray-300 dark:border-gray-600'
                        }
                      `}
                      style={{ width: 'clamp(18px, 1.8vw, 24px)', height: 'clamp(18px, 1.8vw, 24px)', fontSize: 'clamp(9px, 0.7vw, 11px)' }}
                    >
                      {die}
                    </div>
                  )
                })}
              </div>

              {/* Held indicator */}
              {entry.held.length > 0 && (
                <div className="bg-yellow-500/20 dark:bg-yellow-500/30 rounded-lg text-yellow-800 dark:text-yellow-300 font-bold shrink-0 flex items-center" style={{ fontSize: 'clamp(8px, 0.65vw, 11px)', padding: 'clamp(1px, 0.15vh, 3px) clamp(4px, 0.4vw, 7px)', gap: 'clamp(2px, 0.2vw, 4px)' }}>
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
