'use client'

import React from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import type { RollHistoryEntry } from '@/components/RollHistory'

export default function YahtzeeEventLog({ entries }: { entries: readonly RollHistoryEntry[] }) {
  const { t } = useTranslation()
  const newest = [...entries].reverse()
  // Entries already there on mount are history; only a new one slides in.
  const [newestOnMount] = React.useState(newest[0]?.id ?? null)

  return (
    <section className="ttt-history-card yz-events" aria-label={t('yahtzee.history.title')}>
      <div className="yz-events__head">
        <h3 className="yz-events__title">{t('yahtzee.history.title')}</h3>
        <span className="yz-events__count">{entries.length}</span>
      </div>
      {newest.length === 0 ? (
        <p className="yz-events__empty">{t('yahtzee.history.empty')}</p>
      ) : (
        <ol className="yz-events__list">
          {newest.map((entry, index) => {
            const isScore = entry.type === 'score'
            const isBot = !!(entry.isBot || entry.botId)
            const held = entry.held ?? []
            const className = [
              'yz-event',
              isScore ? 'yz-event--score' : '',
              isBot ? 'yz-event--bot' : '',
              index === 0 && entry.id !== newestOnMount ? 'ttt-history-row-in' : '',
            ].filter(Boolean).join(' ')
            return (
              <li key={entry.id} className={className}>
                <span className="yz-event__icon" aria-hidden>
                  <Icon name={isScore ? 'flag' : isBot ? 'robot' : 'dice'} size={14} />
                </span>
                <span className="yz-event__name">{entry.playerName}</span>
                {isScore ? (
                  <>
                    <span className="yz-event__what">
                      {entry.category ? t(`yahtzee.categories.${entry.category}`) : ''}
                    </span>
                    <span className={`yz-event__points${entry.scoredPoints ? '' : ' yz-event__points--zero'}`}>
                      +{entry.scoredPoints ?? 0}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="yz-event__what">{t('yahtzee.history.rollShort', { roll: entry.rollNumber ?? 1 })}</span>
                    <span className="yz-event__dice">
                      {(entry.dice ?? []).map((die, i) => (
                        <span key={i} className={`yz-event__die${held.includes(i) ? ' yz-event__die--held' : ''}`}>{die}</span>
                      ))}
                    </span>
                  </>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
