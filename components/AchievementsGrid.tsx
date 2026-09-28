'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon, type IconName } from '@/components/icons'

export type AchievementGridItem = {
  id: string
  icon: IconName
  /** Tile fill, from ACHIEVEMENT_CATEGORY_ACCENT. */
  accent: string
  label: string
  description: string
  unlockedOnLabel: string | null
  earned: boolean
}

// One desktop row (6 fit at ~1280px with the 9.5rem min cell); everything past
// this hides behind the "Show all" toggle so the block stays compact as the
// achievement set grows.
const COLLAPSED_COUNT = 6

// auto-fill (not auto-fit) so a partially filled row keeps the same column
// width as a full one — the collapsible section renders as a separate grid
// and its columns must line up with the main grid.
const GRID_CLASSES = 'grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3'

function Badge({
  item,
  pinned,
  onTogglePin,
}: {
  item: AchievementGridItem
  pinned: boolean
  onTogglePin: () => void
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label={`${item.label} — ${item.description}`}
        onClick={onTogglePin}
        className={`flex min-h-28 w-full cursor-help flex-col rounded-2xl border-[1.5px] p-3 text-left transition-opacity ${
          item.earned
            ? 'border-bd-line bg-bd-card-warm opacity-100'
            : 'border-bd-line bg-transparent opacity-50'
        }`}
      >
        <span
          className={`grid h-10 w-10 place-items-center rounded-xl border-2 border-bd-ink shadow-[2px_2px_0_var(--bd-ink-on-accent)] ${
            item.earned ? '' : 'bg-bd-bg2 grayscale'
          }`}
          style={item.earned ? { background: item.accent } : undefined}
        >
          <Icon
            name={item.earned ? item.icon : 'lock'}
            size={20}
            tone={item.earned ? 'on-accent' : 'muted'}
          />
        </span>
        <span className="mt-auto pt-3 text-sm font-bold leading-tight text-bd-ink">
          {item.label}
        </span>
      </button>
      <div
        role="tooltip"
        className={`pointer-events-none absolute inset-x-0 bottom-full z-20 mb-2 rounded-xl border-[1.5px] border-bd-line bg-bd-bg p-3 shadow-[0_6px_0_0_rgba(31,27,22,0.08),0_14px_28px_-10px_rgba(31,27,22,0.28)] transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 ${
          pinned ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <p className="text-sm font-bold leading-tight text-bd-ink">{item.label}</p>
        <p className="mt-1 text-xs leading-snug text-bd-ink-soft">{item.description}</p>
        {item.unlockedOnLabel && (
          <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-bd-ink-soft">
            <span className="text-bd-mint-deep"><Icon name="check" size={12} /></span> {item.unlockedOnLabel}
          </p>
        )}
      </div>
    </div>
  )
}

export default function AchievementsGrid({ items }: { items: AchievementGridItem[] }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  // Tap/click fallback for touch devices, where hover doesn't exist and iOS
  // Safari doesn't reliably focus buttons on tap.
  const [pinnedId, setPinnedId] = useState<string | null>(null)
  // The collapsible wrapper needs overflow:hidden while animating (the 0fr
  // height trick), but overflow:visible at rest so badge popovers can escape.
  const [overflowVisible, setOverflowVisible] = useState(false)
  useEffect(() => {
    if (!expanded) {
      setOverflowVisible(false)
      return
    }
    const timer = setTimeout(() => setOverflowVisible(true), 320)
    return () => clearTimeout(timer)
  }, [expanded])
  const hasOverflow = items.length > COLLAPSED_COUNT
  const alwaysVisible = hasOverflow ? items.slice(0, COLLAPSED_COUNT) : items
  const collapsible = hasOverflow ? items.slice(COLLAPSED_COUNT) : []
  const earnedCount = items.filter((item) => item.earned).length

  const togglePin = (id: string) => setPinnedId((current) => (current === id ? null : id))

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold text-bd-ink">
          {t('profile.achievements.title')}
        </h2>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-bd-bg2 px-3 py-1 text-xs font-bold text-bd-ink-soft">
            {earnedCount} / {items.length}
          </span>
          {hasOverflow && (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
              className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-bd-line bg-bd-card-warm px-3 py-1 text-xs font-bold text-bd-ink-soft transition-colors hover:text-bd-ink"
            >
              {expanded
                ? t('profile.achievements.showLess')
                : t('profile.achievements.showAll', { count: items.length })}
              <svg
                aria-hidden
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                className={`transition-transform duration-300 motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`}
              >
                <path d="M3 6L8 11L13 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className={`mt-4 ${GRID_CLASSES}`}>
        {alwaysVisible.map((item) => (
          <Badge key={item.id} item={item} pinned={pinnedId === item.id} onTogglePin={() => togglePin(item.id)} />
        ))}
      </div>
      {hasOverflow && (
        // height:auto animation via the grid-template-rows 0fr -> 1fr trick
        <div
          className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
          style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
        >
          <div className={`min-h-0 ${overflowVisible ? 'overflow-visible' : 'overflow-hidden'}`}>
            <div
              className={`pt-3 ${GRID_CLASSES} transition-opacity duration-300 motion-reduce:transition-none ${
                expanded ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {collapsible.map((item) => (
                <Badge key={item.id} item={item} pinned={pinnedId === item.id} onTogglePin={() => togglePin(item.id)} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
