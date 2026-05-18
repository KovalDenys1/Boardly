'use client'

import React from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { YahtzeeCategory } from '@/lib/yahtzee'

export interface RollHistoryEntry {
  id: string
  turnNumber: number
  playerName: string
  rollNumber?: number
  dice?: number[]
  held?: number[]
  timestamp: number
  isBot?: boolean
  botId?: string | null
  type?: 'roll' | 'score'
  category?: YahtzeeCategory
  scoredPoints?: number
}

interface RollHistoryProps {
  entries: RollHistoryEntry[]
  compact?: boolean
}

export default function RollHistory({ entries }: RollHistoryProps) {
  const { t } = useTranslation()

  if (entries.length === 0) {
    return (
      <div
        className="bd-card h-full flex flex-col p-4"
        style={{ background: 'linear-gradient(180deg, var(--bd-bg) 0%, var(--bd-card-warm) 100%)' }}
      >
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xl">🧾</span>
          <div>
            <div className="bd-kicker">Recent Activity</div>
            <h3 className="text-base font-bold text-bd-ink">Recent Rolls</h3>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-bd-ink-soft">
            No rolls yet
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="bd-card h-full flex flex-col p-4"
      style={{ background: 'linear-gradient(180deg, var(--bd-bg) 0%, var(--bd-card-warm) 100%)' }}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xl">🧾</span>
        <div className="min-w-0 flex-1">
          <div className="bd-kicker">Recent Activity</div>
          <h3 className="truncate text-base font-bold text-bd-ink">Recent Rolls</h3>
        </div>
        <span className="bd-chip px-2 py-0.5 text-xs">
          {entries.length}
        </span>
      </div>

      <div className="custom-scrollbar flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {[...entries].reverse().map((entry) => {
          const entryType = entry.type || 'roll'
          const held = entry.held || []
          const dice = entry.dice || []
          const isBotEntry = !!(entry.isBot || entry.botId)
          const categoryLabel = entry.category ? t(`yahtzee.categories.${entry.category}`) : 'Category'
          const heldCount = held.length

          return (
            <div
              key={entry.id}
              className="rounded-2xl border p-3 shadow-sm"
              style={{
                background:
                  entryType === 'score'
                    ? isBotEntry
                      ? 'linear-gradient(90deg, rgba(155,140,255,0.12) 0%, var(--bd-bg) 100%)'
                      : 'linear-gradient(90deg, rgba(79,201,166,0.14) 0%, var(--bd-bg) 100%)'
                    : isBotEntry
                      ? 'linear-gradient(90deg, rgba(155,140,255,0.1) 0%, var(--bd-bg2) 100%)'
                      : 'linear-gradient(90deg, rgba(107,193,240,0.12) 0%, var(--bd-bg2) 100%)',
                borderColor:
                  entryType === 'score'
                    ? isBotEntry
                      ? 'rgba(155,140,255,0.28)'
                      : 'rgba(79,201,166,0.28)'
                    : isBotEntry
                      ? 'rgba(155,140,255,0.22)'
                      : 'rgba(107,193,240,0.22)',
              }}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{entryType === 'score' ? '🏁' : isBotEntry ? '🤖' : '🎲'}</span>
                    <span className="truncate text-sm font-bold text-bd-ink">
                      {entry.playerName}
                    </span>
                    {isBotEntry && (
                      <span className="bd-chip bd-chip-lav px-2 py-0.5 text-[10px]">AI</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-bd-ink-soft">
                    {entryType === 'score'
                      ? `Scored ${categoryLabel}`
                      : `Roll ${entry.rollNumber ?? 1} of turn ${entry.turnNumber}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="bd-chip px-2 py-0.5 text-[10px]">
                    Turn {entry.turnNumber}
                  </span>
                  {entryType === 'score' && (
                    <span className="bd-chip bd-chip-mint px-2 py-0.5 text-[10px] font-bold">
                      +{entry.scoredPoints ?? 0}
                    </span>
                  )}
                </div>
              </div>

              {entryType === 'score' ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-bd-ink-soft">
                    {entry.scoredPoints === 0 ? 'Burned this category to keep the turn moving.' : `${entry.scoredPoints ?? 0} points banked in ${categoryLabel}.`}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {dice.map((die, index) => {
                      const isHeld = held.includes(index)
                      return (
                        <div
                          key={`${entry.id}-die-${index}`}
                          className="flex h-8 w-8 items-center justify-center rounded-xl border text-sm font-bold"
                          style={
                            isHeld
                              ? {
                                  background: 'var(--bd-sun)',
                                  borderColor: 'var(--bd-ink)',
                                  color: 'var(--bd-ink)',
                                }
                              : {
                                  background: 'var(--bd-bg2)',
                                  borderColor: 'var(--bd-line)',
                                  color: 'var(--bd-ink)',
                                }
                          }
                        >
                          {die}
                        </div>
                      )
                    })}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-bd-ink-soft">
                      {heldCount > 0
                        ? `${heldCount} dice held for the next decision.`
                        : 'Fresh roll with no dice held.'}
                    </p>
                    {heldCount > 0 && (
                      <span className="bd-chip bd-chip-sun px-2 py-0.5 text-[10px] font-bold">
                        Hold {heldCount}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
