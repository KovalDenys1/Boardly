import type { Metadata } from 'next'
import Link from 'next/link'
import GuideLayout, { GuideSection, GuideChecklist, GuideFaqList, buildGuideFaqJsonLd, type GuideFaqItem } from '../components/GuideLayout'
import { getGuideBySlug } from '@/lib/guides-catalog'
import GameIcon from '@/components/GameIcon'

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
  dateModified: getGuideBySlug('best-games-to-play-on-zoom').updated,
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
    rank: 1, gameId: 'spy', accent: 'var(--bd-lav)', name: 'Guess the Spy', players: '3–10 players', href: '/games/spy',
    why: 'Made for video calls. Players ask each other questions out loud — the conversation happens on Zoom, the roles happen in the browser. Nobody needs to share screens. Everyone just opens the same lobby link.',
    zoom: 'Ask questions verbally on the call, vote by speaking up',
  },
  {
    rank: 2, gameId: 'alias', accent: 'var(--bd-coral)', name: 'Alias', players: '3–16 players', href: '/games/alias',
    why: 'The Describer talks, the team yells guesses — all of it happens naturally on the call. The browser just handles the words and the score. Great for groups who want something loud and energetic.',
    zoom: 'Describer talks, team shouts guesses — all on the call',
  },
  {
    rank: 3, gameId: 'yahtzee', accent: 'var(--bd-sky)', name: 'Yahtzee', players: '2–4 players', href: '/games/yahtzee',
    why: 'Each player controls their own dice on their own screen. No screen sharing needed. You can chat between turns, which is the best part of Yahtzee anyway. Works well for 2–4 people on a casual call.',
    zoom: 'Everyone plays on their own screen, chat between turns',
  },
  {
    rank: 4, gameId: 'memory', accent: 'var(--bd-mint)', name: 'Memory Card Game', players: '2–4 players', href: '/games/memory',
    why: 'Everyone sees the same board in their browser. When someone flips cards, you can react out loud on the call. Short rounds mean you can easily fit multiple games into a call.',
    zoom: 'React to each other\'s moves out loud — the game is in the browser',
  },
  {
    rank: 5, gameId: 'tic-tac-toe', accent: 'var(--bd-coral)', name: 'Tic Tac Toe', players: '2 players', href: '/games/tic-tac-toe',
    why: 'Quick 1v1 rounds while everyone else watches on the call. Play a best-of-5 series and let the winner take on the next challenger. Each round takes under a minute.',
    zoom: 'Quick 1v1 while others watch and comment on the call',
  },
]

/**
 * Rendered by `GuideFaqList` below and fed to the FAQPage schema from the same
 * array (#964), so the markup can never describe a question the page does not
 * show.
 */
const faq: GuideFaqItem[] = [
  {
    question: 'Do I need to share my screen to play?',
    answer: 'No, and you should not. Everyone opens the lobby link in their own browser and sees their own view of the game. Screen sharing would leak the spy in Guess the Spy and slow every other game down for no gain.',
  },
  {
    question: 'Does this work on Google Meet, Teams or FaceTime?',
    answer: 'Yes. Nothing here is specific to Zoom – the call only has to carry voice and a chat box you can paste a link into. Where there is no chat box, send the link in a group message instead.',
  },
  {
    question: 'What is the best Zoom game for a big work call?',
    answer: 'Guess the Spy. It seats up to ten, a round runs five to eight minutes, and it gets people who do not know each other talking without any warm-up. Alias is the better pick if the group is large enough to split into two teams and already knows one another.',
  },
  {
    question: 'Can people join from their phones?',
    answer: 'Yes. The games run in a mobile browser, so a player on a phone joins from the same link. Put the call on speaker and keep the game in the browser – on a phone the two cannot share the screen.',
  },
  {
    question: 'What happens if someone drops off the call mid-game?',
    answer: 'They reopen the lobby link and are back in the same game. The lobby stays open, so a dropped connection costs a player a turn rather than the whole round.',
  },
]

const faqJsonLd = buildGuideFaqJsonLd(faq)

export default function BestGamesToPlayOnZoomGuide() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <GuideLayout
        icon={{ glyph: 'laptop' }}
        slug="best-games-to-play-on-zoom"
        title="Best Games to Play on Zoom — Free, No Download"
        subtitle="5 min read · Works with Zoom, Google Meet, FaceTime, and any video call"
        question="What are the best games to play on a Zoom call?"
        answer="Guess the Spy and Alias, because the whole game is people talking and the call is already doing that work, with Yahtzee, Memory and Tic Tac Toe for a quieter call – the host pastes a lobby link into the Zoom chat and nobody screen shares, downloads or signs in."
        breadcrumbLabel="Best Games to Play on Zoom"
        accentColor="var(--bd-sky)"
        cta={{ href: '/games', label: 'Browse All Games', detail: 'Pick a game, share the link in your call chat, and start.' }}
        related={[
          { href: '/guides/best-online-games-for-game-night', label: 'Best Online Games for Game Night' },
          { href: '/guides/best-2-player-games-online', label: 'Best 2 Player Games Online — Free, No Download' },
          { href: '/guides/how-to-play-alias-online', label: 'How to Play Alias Online' },
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
            {games.map(({ rank, gameId, accent, name, players, href, why, zoom }) => (
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
                  <GameIcon gameId={gameId} accentColor={accent} size={22} variant="bare" />
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
            { text: '1. Open boardly.online and pick a game' },
            { text: '2. Create a lobby — takes about 10 seconds' },
            { text: '3. Copy the lobby link and paste it into your Zoom chat' },
            { text: '4. Everyone clicks the link and joins in their browser' },
            { text: '5. Start the game — no accounts, no downloads for anyone' },
          ]} />
        </GuideSection>

        <GuideSection title="Keeping the Call and the Game Out of Each Other's Way">
          <p className="mb-3 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            The one thing that goes wrong on a video call is the window fight: the game takes the
            whole screen and the faces disappear, or the call stays maximised and half the group
            loses the board. Put the call in its small floating window and the game tab beside it,
            and tell everyone to do the same before the first round rather than during it.
          </p>
          <p className="mb-3 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            On a phone it is the other way round: the browser and the call cannot share the screen,
            so the call goes on speaker in the background and the game takes the display. That works
            for Guess the Spy and Alias, where all you need from the call is voice, and it is the
            reason those two are the picks for a group joining from phones.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            Do not share your screen for any of these games. Screen sharing shows everyone your view
            of the board, which spoils Guess the Spy outright, adds a second or two of lag to
            everything else, and puts one person in charge of what the group can see. Each player in
            their own tab is both simpler and fairer.
          </p>
        </GuideSection>

        <GuideSection title="Zoom Game Questions">
          <GuideFaqList items={faq} />
        </GuideSection>
      </GuideLayout>
    </>
  )
}
