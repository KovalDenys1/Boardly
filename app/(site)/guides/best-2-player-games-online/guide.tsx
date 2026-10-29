import Link from 'next/link'
import GameIcon from '@/components/GameIcon'
import { localizeHref } from '@/lib/seo-locales'
import { GuideChecklist, GuideSection } from '../components/GuideLayout'
import { defineGuide, type GuideBodyProps } from '../components/guide-definition'
import en, { type Best2PlayerGuideBody } from './copy/en'
import no from './copy/no'
import ru from './copy/ru'
import uk from './copy/uk'

const GAMES = [
  { gameId: 'tic-tac-toe', accent: 'var(--bd-coral)', href: '/games/tic-tac-toe', guideHref: '/guides/how-to-play-tic-tac-toe-online' },
  { gameId: 'memory', accent: 'var(--bd-mint)', href: '/games/memory', guideHref: '/guides/how-to-play-memory-card-game-online' },
  { gameId: 'connect-four', accent: 'var(--bd-sun)', href: '/games/connect-four', guideHref: '/guides/how-to-play-connect-four-online' },
  { gameId: 'yahtzee', accent: 'var(--bd-sky)', href: '/games/yahtzee', guideHref: '/guides/how-to-play-yahtzee-online' },
]

function Best2PlayerGuide({ body, locale }: GuideBodyProps<Best2PlayerGuideBody>) {
  const { comparison, games } = body
  return (
    <>
      <GuideSection title={comparison.title}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="text-xs uppercase tracking-wide"
                style={{ borderBottom: '1px solid var(--bd-line)', color: 'var(--bd-ink-muted)' }}
              >
                <th className="text-left py-2 pr-4">{comparison.columns.game}</th>
                <th className="text-left py-2 pr-4">{comparison.columns.length}</th>
                <th className="text-left py-2">{comparison.columns.skill}</th>
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map(({ name, length, skill }) => (
                <tr key={name} style={{ borderBottom: '1px solid var(--bd-line)' }}>
                  <td className="py-3 pr-4 text-sm font-semibold" style={{ color: 'var(--bd-ink)' }}>{name}</td>
                  <td className="py-3 pr-4 text-sm" style={{ color: 'var(--bd-ink-soft)' }}>{length}</td>
                  <td className="py-3 text-sm" style={{ color: 'var(--bd-ink-soft)' }}>{skill}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GuideSection>

      <GuideSection title={games.title}>
        <div className="space-y-4">
          {GAMES.map(({ gameId, accent, href, guideHref }, index) => {
            const { name, play, tagline, why, tip } = games.items[index]
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
                </div>
                <p className="mb-1 text-xs" style={{ color: 'var(--bd-ink-muted)' }}>{tagline}</p>
                <p className="mb-2 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>{why}</p>
                <p className="mb-3 text-xs" style={{ color: 'var(--bd-ink-muted)' }}>
                  <strong style={{ color: 'var(--bd-ink-soft)' }}>{games.tipLabel}</strong> {tip}
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Link
                    href={localizeHref(href, locale)}
                    className="inline-flex items-center rounded-xl px-4 py-2 text-xs font-semibold transition-colors hover:text-bd-coral-text"
                    style={{ background: 'var(--bd-card-warm)', border: '1px solid var(--bd-line)', color: 'var(--bd-ink)' }}
                  >
                    {play} →
                  </Link>
                  <Link
                    href={localizeHref(guideHref, locale)}
                    className="inline-flex items-center rounded-xl px-4 py-2 text-xs font-semibold transition-colors"
                    style={{ border: '1px solid var(--bd-line)', color: 'var(--bd-ink-soft)' }}
                  >
                    {games.fullGuide}
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      </GuideSection>

      <GuideSection title={body.tips.title}>
        <GuideChecklist items={body.tips.items.map((text) => ({ mark: 'yes' as const, text }))} />
      </GuideSection>
    </>
  )
}

export default defineGuide({
  slug: 'best-2-player-games-online',
  icon: { glyph: 'users' },
  accentColor: 'var(--bd-lav)',
  ctaHref: '/games',
  Body: Best2PlayerGuide,
  copy: { en, ru, uk, no },
})
