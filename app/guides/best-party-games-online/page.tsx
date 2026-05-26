import type { Metadata } from 'next'
import Link from 'next/link'
import GuideLayout, { GuideSection, GuideChecklist } from '../components/GuideLayout'

export const metadata: Metadata = {
  title: 'Best Party Games Online — Free to Play, No Download',
  description:
    'The best free online party games for groups of 4 or more. No app needed — share a link and everyone joins instantly. Perfect for game nights, birthdays, and group hangouts.',
  keywords: [
    'best party games online',
    'online party games free',
    'free multiplayer party games browser',
    'party games to play online with friends',
    'virtual party games free no download',
    'online games for groups free',
  ],
  openGraph: {
    title: 'Best Party Games Online | Boardly',
    description: 'Top free browser party games for groups — share a link, everyone joins instantly, no download needed.',
    url: 'https://boardly.online/guides/best-party-games-online',
    type: 'article',
  },
  alternates: { canonical: 'https://boardly.online/guides/best-party-games-online' },
}

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Best Party Games Online — Free to Play, No Download',
  description: 'Top free browser party games for groups of 4 or more.',
  url: 'https://boardly.online/guides/best-party-games-online',
  image: 'https://boardly.online/opengraph-image',
  datePublished: '2026-05-26',
  dateModified: '2026-05-26',
  author: { '@type': 'Organization', name: 'Boardly', url: 'https://boardly.online' },
  publisher: { '@type': 'Organization', name: 'Boardly', url: 'https://boardly.online' },
}

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://boardly.online' },
    { '@type': 'ListItem', position: 2, name: 'Guides', item: 'https://boardly.online/guides' },
    { '@type': 'ListItem', position: 3, name: 'Best Party Games Online', item: 'https://boardly.online/guides/best-party-games-online' },
  ],
}

const games = [
  {
    rank: 1, emoji: '🕵️', name: 'Guess the Spy', players: '3–10 players', href: '/games/spy',
    why: 'The top party game on Boardly. One person is secretly the spy — the rest know the location and try to catch them through questions. Gets loud fast. Every round is different. Works for any group that can agree on nothing except that they want to play something.',
    best: 'Any group of 5–8, especially people who have never played together before',
  },
  {
    rank: 2, emoji: '🗣️', name: 'Alias', players: '4–16 players', href: '/games/alias',
    why: 'Teams compete to guess as many words as possible from one player\'s descriptions. The bigger the group, the better this gets. It brings out personalities fast — some people are surprisingly bad at describing obvious things, which is half the fun.',
    best: 'Groups of 6 or more, team competition, high energy sessions',
  },
  {
    rank: 3, emoji: '🎲', name: 'Yahtzee', players: '2–4 players', href: '/games/yahtzee',
    why: 'A more relaxed option when you want something to do while catching up. Supports up to 4 players, takes 15–20 minutes, and everyone is always watching even between turns because they care about the scorecard.',
    best: 'Smaller subgroups, casual sessions, classic game fans',
  },
]

export default function BestPartyGamesOnlineGuide() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <GuideLayout
        emoji="🎊"
        title="Best Party Games Online — Free, No Download"
        subtitle="4 min read · All games free on Boardly · No account required"
        breadcrumbLabel="Best Party Games Online"
        accentColor="var(--bd-coral)"
        cta={{ href: '/games', label: 'Browse All Games', detail: 'Start your first game in under a minute.' }}
        related={[
          { href: '/guides/best-online-games-for-game-night', label: 'Best Online Games for Game Night' },
          { href: '/guides/best-games-to-play-on-zoom', label: 'Best Games to Play on Zoom — Free, No Download' },
          { href: '/guides/best-free-multiplayer-browser-games', label: 'Best Free Multiplayer Browser Games in 2026' },
          { href: '/guides/how-to-play-spy-game-online', label: 'How to Play Guess the Spy Online' },
        ]}
      >
        <GuideSection title="What Makes a Good Online Party Game?">
          <GuideChecklist items={[
            '✅ Works for 4 or more people without slowing down',
            '✅ Easy enough that someone new can join mid-session',
            '✅ Short rounds — nobody wants to wait 30 minutes to play again',
            '✅ No downloads or accounts — you lose guests at that step',
            '✅ Creates moments people will talk about after',
          ]} />
        </GuideSection>

        <GuideSection title="The Best Party Games Available Now">
          <div className="space-y-4">
            {games.map(({ rank, emoji, name, players, href, why, best }) => (
              <div
                key={name}
                className="rounded-2xl border p-5"
                style={{ borderColor: 'var(--bd-line)', background: 'var(--bd-bg2)' }}
              >
                <div className="mb-3 flex items-center gap-3">
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 text-xs font-black shadow-[1px_1px_0_var(--bd-ink)]"
                    style={{ borderColor: 'var(--bd-ink)', background: 'var(--bd-sun)', color: 'var(--bd-ink)', fontFamily: 'var(--bd-font-display)' }}
                  >
                    {rank}
                  </span>
                  <span className="text-xl">{emoji}</span>
                  <strong className="text-sm" style={{ color: 'var(--bd-ink)' }}>{name}</strong>
                  <span className="text-xs" style={{ color: 'var(--bd-ink-muted)' }}>{players}</span>
                </div>
                <p className="mb-2 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>{why}</p>
                <p className="mb-3 text-xs" style={{ color: 'var(--bd-ink-muted)' }}>
                  <strong style={{ color: 'var(--bd-ink-soft)' }}>Best for:</strong> {best}
                </p>
                <Link
                  href={href}
                  className="inline-flex items-center rounded-xl px-4 py-2 text-xs font-semibold transition-colors hover:text-bd-coral"
                  style={{ background: 'var(--bd-card-warm)', border: '1px solid var(--bd-line)', color: 'var(--bd-ink)' }}
                >
                  Play {name} →
                </Link>
              </div>
            ))}
          </div>
        </GuideSection>

        <GuideSection title="How to Start a Party Game Online">
          <p className="mb-4 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            One person opens Boardly, picks a game, and creates a lobby. They share the lobby link — in a group chat, in a Zoom chat, anywhere. Everyone clicks it and joins immediately. No accounts, no installs, no waiting.
          </p>
          <GuideChecklist items={[
            '✅ The host creates a lobby and sets the max players',
            '✅ Share the link however your group communicates',
            '✅ Everyone joins with a guest name — no sign-up',
            '✅ Start the game when the group is ready',
          ]} />
        </GuideSection>
      </GuideLayout>
    </>
  )
}
