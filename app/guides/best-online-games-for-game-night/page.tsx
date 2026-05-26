import type { Metadata } from 'next'
import Link from 'next/link'
import GuideLayout, { GuideSection, GuideChecklist } from '../components/GuideLayout'

export const metadata: Metadata = {
  title: 'Best Online Games for Game Night — Free, No Download',
  description:
    'The best games to play online with friends on game night. No app, no setup — just share a link and start playing. Free browser games for groups of 2–10.',
  keywords: [
    'best online games for game night',
    'game night games online',
    'online game night ideas',
    'virtual game night games free',
    'online games to play with friends at home',
    'best multiplayer games for game night',
  ],
  openGraph: {
    title: 'Best Online Games for Game Night | Boardly',
    description: 'Top free browser games for your next online game night — no download, no account needed.',
    url: 'https://boardly.online/guides/best-online-games-for-game-night',
    type: 'article',
  },
  alternates: { canonical: 'https://boardly.online/guides/best-online-games-for-game-night' },
}

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Best Online Games for Game Night — Free, No Download',
  description: 'Top free browser games for online game nights with friends.',
  url: 'https://boardly.online/guides/best-online-games-for-game-night',
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
    { '@type': 'ListItem', position: 3, name: 'Best Online Games for Game Night', item: 'https://boardly.online/guides/best-online-games-for-game-night' },
  ],
}

const games = [
  {
    rank: 1, emoji: '🕵️', name: 'Guess the Spy', players: '3–10 players', href: '/games/spy',
    why: 'The best game night opener. One player is secretly the spy, everyone else knows the location. Players ask each other questions and try to figure out who does not belong. Rounds take 5–8 minutes, so you can play several back to back.',
    best: 'Groups of 5 or more who want laughs and arguments',
  },
  {
    rank: 2, emoji: '🗣️', name: 'Alias', players: '4–16 players', href: '/games/alias',
    why: 'Split into two teams and race to guess words from your teammate\'s descriptions. High energy, fast-paced, and gets louder as the night goes on. Works great when you have a bigger group to split.',
    best: 'Competitive groups, team-based fun, 6+ players',
  },
  {
    rank: 3, emoji: '🎲', name: 'Yahtzee', players: '2–4 players', href: '/games/yahtzee',
    why: 'The classic dice game everyone knows. Roll five dice, fill 15 scoring categories, beat your opponents. Rounds take 15–20 minutes. Slower than the others but great for more relaxed sessions where you want to chat between turns.',
    best: 'Smaller groups, laid-back sessions, Yahtzee fans',
  },
  {
    rank: 4, emoji: '🧠', name: 'Memory Card Game', players: '2–4 players', href: '/games/memory',
    why: 'Everyone flips the same cards — when your opponent misses a pair, you see exactly where it went. Fast rounds, three difficulty levels. Easy to teach anyone in 30 seconds.',
    best: 'Smaller groups, quick filler rounds between bigger games',
  },
  {
    rank: 5, emoji: '🔴', name: 'Connect Four', players: '2 players', href: '/games/connect-four',
    why: 'Great for head-to-head matchups while the rest of the group watches. Run a bracket tournament and let the winner take on the next challenger. Rounds take under 5 minutes.',
    best: 'Tournaments, 1v1 while others watch, quick elimination rounds',
  },
]

export default function BestOnlineGamesForGameNightGuide() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <GuideLayout
        emoji="🎉"
        title="Best Online Games for Game Night"
        subtitle="5 min read · All games free on Boardly · No download required"
        breadcrumbLabel="Best Online Games for Game Night"
        accentColor="var(--bd-lav)"
        cta={{ href: '/games', label: 'Browse All Games', detail: 'Pick your first game and share the link.' }}
        related={[
          { href: '/guides/best-games-to-play-on-zoom', label: 'Best Games to Play on Zoom — Free, No Download' },
          { href: '/guides/best-party-games-online', label: 'Best Party Games Online — Free to Play' },
          { href: '/guides/best-free-multiplayer-browser-games', label: 'Best Free Multiplayer Browser Games in 2026' },
          { href: '/guides/how-to-play-spy-game-online', label: 'How to Play Guess the Spy Online' },
        ]}
      >
        <GuideSection title="What Makes a Good Game Night Game?">
          <GuideChecklist items={[
            '✅ Easy to explain — everyone should be playing within 2 minutes',
            '✅ Works for your group size — check the player count before picking',
            '✅ No download needed — you lose half the group at that step',
            '✅ Rounds are short enough to play again if someone wants a rematch',
          ]} />
        </GuideSection>

        <GuideSection title="The Best Games for Game Night">
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

        <GuideSection title="Tips for Hosting an Online Game Night">
          <GuideChecklist items={[
            '✅ Pick 2–3 games in advance and share the links before the call starts',
            '✅ Start with Guess the Spy — it gets everyone talking immediately',
            '✅ Switch games every 2–3 rounds to keep the energy up',
            '✅ Let the group vote on the next game between rounds',
            '✅ Keep a group chat open to share lobby links easily',
          ]} />
        </GuideSection>
      </GuideLayout>
    </>
  )
}
