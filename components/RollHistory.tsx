'use client'

import React from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
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
          <Icon name="clipboard" size={20} />
          <div>
            <div className="bd-kicker">{t('yahtzee.history.kicker')}</div>
            <h3 className="text-base font-bold text-bd-ink">{t('yahtzee.history.title')}</h3>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-bd-ink-soft">
            {t('yahtzee.history.empty')}
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
        <Icon name="clipboard" size={20} />
        <div className="min-w-0 flex-1">
          <div className="bd-kicker">{t('yahtzee.history.kicker')}</div>
          <h3 className="truncate text-base font-bold text-bd-ink">{t('yahtzee.history.title')}</h3>
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
                    <Icon name={entryType === 'score' ? 'flag' : isBotEntry ? 'robot' : 'dice'} size={14} />
                    <span className="truncate text-sm font-bold text-bd-ink">
                      {entry.playerName}
                    </span>
                    {isBotEntry && (
                      <span className="bd-chip bd-chip-lav px-2 py-0.5 text-[10px]">{t('game.ui.botBadge')}</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-bd-ink-soft">
                    {entryType === 'score'
                      ? t('yahtzee.history.scoredCategory', { category: categoryLabel })
                      : t('yahtzee.history.rollOfTurn', { roll: entry.rollNumber ?? 1, turn: entry.turnNumber })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="bd-chip px-2 py-0.5 text-[10px]">
                    {t('yahtzee.history.turnBadge', { turn: entry.turnNumber })}
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
                    {entry.scoredPoints === 0
                      ? t('yahtzee.history.burned')
                      : t('yahtzee.history.banked', { points: entry.scoredPoints ?? 0, category: categoryLabel })}
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
                        ? t('yahtzee.history.heldForNext', { count: heldCount })
                        : t('yahtzee.history.freshRoll')}
                    </p>
                    {heldCount > 0 && (
                      <span className="bd-chip bd-chip-sun px-2 py-0.5 text-[10px] font-bold">
                        {t('yahtzee.history.holdBadge', { count: heldCount })}
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
