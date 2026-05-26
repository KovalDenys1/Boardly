import type { Metadata } from 'next'
import Link from 'next/link'
import GuideLayout, { GuideSection, GuideChecklist } from '../components/GuideLayout'

export const metadata: Metadata = {
  title: 'Best Games to Play on Zoom — Free, No Download',
  description:
    'The best free browser games to play while on a Zoom call. No app needed — just share the link in chat and everyone joins instantly. Works with any video call.',
  keywords: [
    'best games to play on zoom',
    'zoom games free',
    'games to play on video call',
    'online games for zoom calls',
    'zoom game night ideas',
    'free games to play on video call with friends',
    'games to play while on facetime',
  ],
  openGraph: {
    title: 'Best Games to Play on Zoom | Boardly',
    description: 'Free browser games that work perfectly on Zoom — share a link in chat and play together instantly.',
    url: 'https://boardly.online/guides/best-games-to-play-on-zoom',
    type: 'article',
  },
  alternates: { canonical: 'https://boardly.online/guides/best-games-to-play-on-zoom' },
}

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Best Games to Play on Zoom — Free, No Download',
  description: 'Free browser games that work perfectly alongside any video call.',
  url: 'https://boardly.online/guides/best-games-to-play-on-zoom',
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
    { '@type': 'ListItem', position: 3, name: 'Best Games to Play on Zoom', item: 'https://boardly.online/guides/best-games-to-play-on-zoom' },
  ],
}

const games = [
  {
    rank: 1, emoji: '🕵️', name: 'Guess the Spy', players: '3–10 players', href: '/games/spy',
    why: 'Made for video calls. Players ask each other questions out loud — the conversation happens on Zoom, the roles happen in the browser. Nobody needs to share screens. Everyone just opens the same lobby link.',
    zoom: 'Ask questions verbally on the call, vote by speaking up',
  },
  {
    rank: 2, emoji: '🗣️', name: 'Alias', players: '4–16 players', href: '/games/alias',
    why: 'The Describer talks, the team yells guesses — all of it happens naturally on the call. The browser just handles the words and the score. Great for groups who want something loud and energetic.',
    zoom: 'Describer talks, team shouts guesses — all on the call',
  },
  {
    rank: 3, emoji: '🎲', name: 'Yahtzee', players: '2–4 players', href: '/games/yahtzee',
    why: 'Each player controls their own dice on their own screen. No screen sharing needed. You can chat between turns, which is the best part of Yahtzee anyway. Works well for 2–4 people on a casual call.',
    zoom: 'Everyone plays on their own screen, chat between turns',
  },
  {
    rank: 4, emoji: '🧠', name: 'Memory Card Game', players: '2–4 players', href: '/games/memory',
    why: 'Everyone sees the same board in their browser. When someone flips cards, you can react out loud on the call. Short rounds mean you can easily fit multiple games into a call.',
    zoom: 'React to each other\'s moves out loud — the game is in the browser',
  },
  {
    rank: 5, emoji: '⭕', name: 'Tic Tac Toe', players: '2 players', href: '/games/tic-tac-toe',
    why: 'Quick 1v1 rounds while everyone else watches on the call. Play a best-of-5 series and let the winner take on the next challenger. Each round takes under a minute.',
    zoom: 'Quick 1v1 while others watch and comment on the call',
  },
]

export default function BestGamesToPlayOnZoomGuide() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <GuideLayout
        emoji="💻"
        title="Best Games to Play on Zoom — Free, No Download"
        subtitle="4 min read · Works with Zoom, Google Meet, FaceTime, and any video call"
        breadcrumbLabel="Best Games to Play on Zoom"
        accentColor="var(--bd-sky)"
        cta={{ href: '/games', label: 'Browse All Games', detail: 'Pick a game, share the link in your call chat, and start.' }}
        related={[
          { href: '/guides/best-online-games-for-game-night', label: 'Best Online Games for Game Night' },
          { href: '/guides/best-party-games-online', label: 'Best Party Games Online — Free to Play' },
          { href: '/guides/best-free-multiplayer-browser-games', label: 'Best Free Multiplayer Browser Games in 2026' },
          { href: '/guides/how-to-play-spy-game-online', label: 'How to Play Guess the Spy Online' },
        ]}
      >
        <GuideSection title="Why Browser Games Work So Well on Video Calls">
          <p className="mb-3 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            The problem with most Zoom games is they require screen sharing, a separate app, or someone to run a host setup. Browser games solve all of this.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            With Boardly, the host creates a lobby and drops the link in the Zoom chat. Everyone clicks it and joins in their own browser tab — no screen sharing needed, no downloads, no accounts. The video call stays open for talking; the game runs in the browser.
          </p>
        </GuideSection>

        <GuideSection title="The Best Games for Zoom Calls">
          <div className="space-y-4">
            {games.map(({ rank, emoji, name, players, href, why, zoom }) => (
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
                  <strong style={{ color: 'var(--bd-ink-soft)' }}>On Zoom:</strong> {zoom}
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

        <GuideSection title="How to Start Playing on a Zoom Call">
          <GuideChecklist items={[
            '1. Open boardly.online and pick a game',
            '2. Create a lobby — takes about 10 seconds',
            '3. Copy the lobby link and paste it into your Zoom chat',
            '4. Everyone clicks the link and joins in their browser',
            '5. Start the game — no accounts, no downloads for anyone',
          ]} />
        </GuideSection>
      </GuideLayout>
    </>
  )
}
