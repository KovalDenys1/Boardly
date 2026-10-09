'use client'

import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import type { RollHistoryEntry } from '@/components/RollHistory'

/** The newest `rows` entries, newest first, padded with empty slots to exactly `rows`. */
export function eventSlots(entries: readonly RollHistoryEntry[], rows: number): Array<RollHistoryEntry | null> {
  const newest = entries.slice(-rows).reverse()
  return [...newest, ...Array.from({ length: rows - newest.length }, () => null)]
}

/**
 * Recent events as a fixed number of one-line rows (#1363): the card never
 * scrolls and never changes height, so nothing in it can be clipped.
 */
export default function YahtzeeEventLog({
  entries,
  rows,
  fill = false,
}: {
  entries: readonly RollHistoryEntry[]
  rows: number
  /** Stretch to the column's height (bot games, where no chat shares it). */
  fill?: boolean
}) {
  const { t } = useTranslation()
  const slots = eventSlots(entries, rows)

  return (
    <section className={`ttt-history-card yz-events${fill ? ' ttt-history-card--fill' : ''}`} aria-label={t('yahtzee.history.title')}>
      <div className="yz-events__head">
        <h3 className="yz-events__title">{t('yahtzee.history.title')}</h3>
        <span className="yz-events__count">{entries.length}</span>
      </div>
      <ol className="yz-events__list" style={{ ['--yz-event-rows' as string]: rows }}>
        {slots.map((entry, index) => {
          if (!entry) {
            return (
              <li key={`empty-${index}`} className="yz-event yz-event--empty" aria-hidden={index > 0 || entries.length > 0}>
                {index === 0 && entries.length === 0 ? t('yahtzee.history.empty') : null}
              </li>
            )
          }
          const isScore = entry.type === 'score'
          const isBot = !!(entry.isBot || entry.botId)
          const held = entry.held ?? []
          return (
            <li key={entry.id} className={`yz-event${isScore ? ' yz-event--score' : ''}${isBot ? ' yz-event--bot' : ''}`}>
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
    </section>
  )
}
