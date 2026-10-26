'use client'

import { Icon } from '@/components/icons'
import { useTranslation } from '@/lib/i18n-helpers'
import type { ReplayPlayer } from '@/lib/replay/types'

interface ReplayPlayerRailProps {
  seats: ReplayPlayer[]
  activeId: string | null
  winnerId: string | null
  viewerId: string | null
}

/** Three or more players as one scrolling row of pills; two players use the scoreboard header. */
export default function ReplayPlayerRail({ seats, activeId, winnerId, viewerId }: ReplayPlayerRailProps) {
  const { t } = useTranslation()
  return (
    <ul className="flex min-w-0 gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
      {seats.map((seat) => {
        const active = seat.userId === activeId
        const winner = seat.userId === winnerId
        return (
          <li
            key={seat.userId}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border-[1.5px] px-3 py-1.5 text-sm font-semibold ${
              winner
                ? 'border-bd-sun-deep bg-bd-sun text-bd-ink-on-accent'
                : active
                  ? 'border-bd-ink bg-bd-bg text-bd-ink'
                  : 'border-bd-line bg-bd-card-warm text-bd-ink-soft'
            }`}
            aria-current={active ? 'true' : undefined}
          >
            {winner && <Icon name="crown" size={14} />}
            <span className="max-w-[9rem] truncate">{seat.name}</span>
            {seat.userId === viewerId && <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-bd-ink-muted">{t('profile.gameReplay.youBadge')}</span>}
          </li>
        )
      })}
    </ul>
  )
}
