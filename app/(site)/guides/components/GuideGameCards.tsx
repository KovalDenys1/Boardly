import Link from 'next/link'
import GameIcon from '@/components/GameIcon'
import { localizeHref, type GuideLocale } from '@/lib/seo-locales'

export interface GuideGameCardMeta {
  gameId: string
  accent: string
  href: string
}

export interface GuideGameCardCopy {
  name: string
  play: string
  players: string
  why: string
  /** The bold-labelled line under `why`: who the game suits, or how it runs on a call. */
  note: string
}

/** The ranked game cards of a best-of list: `meta` and `items` line up one to one, in rank order. */
export function GuideGameCards({
  meta,
  items,
  noteLabel,
  locale,
}: {
  meta: GuideGameCardMeta[]
  items: GuideGameCardCopy[]
  noteLabel: string
  locale: GuideLocale
}) {
  return (
    <div className="space-y-4">
      {meta.map(({ gameId, accent, href }, index) => {
        const { name, play, players, why, note } = items[index]
        return (
          <div
            key={name}
            className="rounded-2xl border p-5"
            style={{ borderColor: 'var(--bd-line)', background: 'var(--bd-bg2)' }}
          >
            <div className="mb-3 flex items-center gap-3">
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 text-xs font-black shadow-[1px_1px_0_var(--bd-ink)]"
                style={{ borderColor: 'var(--bd-ink)', background: 'var(--bd-sun)', color: 'var(--bd-ink-on-accent)', fontFamily: 'var(--bd-font-display)' }}
              >
                {index + 1}
              </span>
              <GameIcon gameId={gameId} accentColor={accent} size={22} variant="bare" />
              <strong className="text-sm" style={{ color: 'var(--bd-ink)' }}>{name}</strong>
              <span className="text-xs" style={{ color: 'var(--bd-ink-muted)' }}>{players}</span>
            </div>
            <p className="mb-2 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>{why}</p>
            <p className="mb-3 text-xs" style={{ color: 'var(--bd-ink-muted)' }}>
              <strong style={{ color: 'var(--bd-ink-soft)' }}>{noteLabel}</strong> {note}
            </p>
            <Link
              href={localizeHref(href, locale)}
              className="inline-flex items-center rounded-xl px-4 py-2 text-xs font-semibold transition-colors hover:text-bd-coral-text"
              style={{ background: 'var(--bd-card-warm)', border: '1px solid var(--bd-line)', color: 'var(--bd-ink)' }}
            >
              {play} →
            </Link>
          </div>
        )
      })}
    </div>
  )
}
