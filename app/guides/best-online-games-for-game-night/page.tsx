import type { Metadata } from 'next'
import Link from 'next/link'
import GuideLayout, { GuideSection, GuideChecklist, GuideFaqList, buildGuideFaqJsonLd, type GuideFaqItem } from '../components/GuideLayout'
import { getGuideBySlug } from '@/lib/guides-catalog'
import GameIcon from '@/components/GameIcon'

export const metadata: Metadata = {
  title: 'Best Online Games for Game Night — Free, No Download',
  description:
    'The best games to play online with friends on game night, from three players to a full party. No app, no setup – share a link and start playing. Free browser games for groups of 2–10.',
  keywords: [
    'best online games for game night',
    'game night games online',
    'online game night ideas',
    'virtual game night games free',
    'online games to play with friends at home',
    'best multiplayer games for game night',
    'best party games online',
    'online party games free',
    'best 3 player games online',
    'online games for 3 players',
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
  dateModified: getGuideBySlug('best-online-games-for-game-night').updated,
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
    rank: 1, gameId: 'spy', accent: 'var(--bd-lav)', name: 'Guess the Spy', players: '3–10 players', href: '/games/spy',
    why: 'The best game night opener. One player is secretly the spy, everyone else knows the location. Players ask each other questions and try to figure out who does not belong. Rounds take 5–8 minutes, so you can play several back to back.',
    best: 'Groups of 5 or more who want laughs and arguments',
  },
  {
    rank: 2, gameId: 'alias', accent: 'var(--bd-coral)', name: 'Alias', players: '3–16 players', href: '/games/alias',
    why: 'Split into two teams and race to guess words from your teammate\'s descriptions. High energy, fast-paced, and gets louder as the night goes on. Works great when you have a bigger group to split.',
    best: 'Competitive groups, team-based fun, 6+ players',
  },
  {
    rank: 3, gameId: 'yahtzee', accent: 'var(--bd-sky)', name: 'Yahtzee', players: '2–4 players', href: '/games/yahtzee',
    why: 'The classic dice game everyone knows. Roll five dice, fill 15 scoring categories, beat your opponents. Rounds take 15–20 minutes. Slower than the others but great for more relaxed sessions where you want to chat between turns.',
    best: 'Smaller groups, laid-back sessions, Yahtzee fans',
  },
  {
    rank: 4, gameId: 'memory', accent: 'var(--bd-mint)', name: 'Memory Card Game', players: '2–4 players', href: '/games/memory',
    why: 'Everyone flips the same cards — when your opponent misses a pair, you see exactly where it went. Fast rounds, three difficulty levels. Easy to teach anyone in 30 seconds.',
    best: 'Smaller groups, quick filler rounds between bigger games',
  },
  {
    rank: 5, gameId: 'connect-four', accent: 'var(--bd-coral)', name: 'Connect Four', players: '2 players', href: '/games/connect-four',
    why: 'Great for head-to-head matchups while the rest of the group watches. Run a bracket tournament and let the winner take on the next challenger. Rounds take under 5 minutes.',
    best: 'Tournaments, 1v1 while others watch, quick elimination rounds',
  },
]

const groupSizes = [
  {
    size: '2 players',
    pick: 'Connect Four, Memory, Yahtzee',
    why: 'Head to head, no teams, no waiting. Connect Four is the shortest of the three and the easiest to replay until somebody stops losing.',
  },
  {
    size: '3 players',
    pick: 'Guess the Spy, Yahtzee, Memory',
    why: 'Three is the minimum for Guess the Spy and it plays tighter than a big table: every question counts and the spy has nowhere to hide. Yahtzee at three runs 20–25 minutes, and Alias takes three as well – each of you is your own team.',
  },
  {
    size: '4–6 players',
    pick: 'Alias, Guess the Spy',
    why: 'The sweet spot for a party. Four is the smallest Alias lobby that splits into two teams, and Guess the Spy at five or six gives the spy room to bluff without the round dragging.',
  },
  {
    size: '7 or more',
    pick: 'Guess the Spy, Alias',
    why: 'Both scale up – Guess the Spy to ten, Alias to sixteen. Run the quieter games as a side bracket so nobody is stuck watching for twenty minutes.',
  },
]

/**
 * Rendered by `GuideFaqList` below and fed to the FAQPage schema from the same
 * array (#964), so the markup can never describe a question the page does not
 * show.
 */
const faq: GuideFaqItem[] = [
  {
    question: 'What can we play with exactly three people?',
    answer: 'Guess the Spy works at three and is sharper than it sounds – with nobody to hide behind, every question a player asks is evidence. Yahtzee and Memory also seat three, and both finish fast enough that the loser gets a rematch. Alias takes three too, played as three teams of one with the describer rotating, though it is a livelier game once there are enough of you for two proper teams.',
  },
  {
    question: 'Which of these is the best online party game?',
    answer: 'Alias, once you have six or more people. Two teams, a word to describe, a clock running – it is the loudest game on the list and the one that needs the least explaining. Guess the Spy is the better opener when the group is still warming up.',
  },
  {
    question: 'Do we need a video call to play?',
    answer: 'No. Guess the Spy and Alias are better with voice, because the whole game is people talking, and any call works – Zoom, Discord, Meet, a group phone call. Yahtzee, Memory and Connect Four need no voice at all; the in-game chat is enough.',
  },
  {
    question: 'Does everyone need an account?',
    answer: 'No. The host opens a lobby and shares the link, and everyone else joins as a guest with a name they type in. An account only buys you a saved profile and stats, and nobody needs one to sit down at the table.',
  },
  {
    question: 'How long does an online game night usually run?',
    answer: 'Two hours covers a good one: a couple of rounds of Guess the Spy to start, a longer stretch of Alias once everyone is warm, and a short game while people drop off. Switching every two or three rounds keeps the energy up better than one long session of anything.',
  },
  {
    question: 'What if someone drops out halfway through?',
    answer: 'Pick the next game around the people still there rather than waiting. Connect Four and Memory are the useful fallbacks – they seat two to four, start instantly, and give a shrinking group something to do without restarting the night.',
  },
]

const faqJsonLd = buildGuideFaqJsonLd(faq)

export default function BestOnlineGamesForGameNightGuide() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <GuideLayout
        icon={{ glyph: 'party' }}
        slug="best-online-games-for-game-night"
        title="Best Online Games for Game Night"
        subtitle="6 min read · All games free on Boardly · No download required"
        question="What are the best online games for game night?"
        answer="Guess the Spy for a group of five or more, Alias once you have enough people for two teams, and Yahtzee, Memory or Connect Four for a smaller or quieter night – all five run in the browser, need no account, and start from a link you paste into the group chat."
        breadcrumbLabel="Best Online Games for Game Night"
        accentColor="var(--bd-lav)"
        cta={{ href: '/games', label: 'Browse All Games', detail: 'Pick your first game and share the link.' }}
        related={[
          { href: '/guides/best-games-to-play-on-zoom', label: 'Best Games to Play on Zoom — Free, No Download' },
          { href: '/guides/best-2-player-games-online', label: 'Best 2 Player Games Online — Free, No Download' },
          { href: '/guides/how-to-play-spy-game-online', label: 'How to Play Guess the Spy Online' },
          { href: '/guides/how-to-play-alias-online', label: 'How to Play Alias Online' },
        ]}
      >
        <GuideSection title="What Makes a Good Game Night Game?">
          <GuideChecklist items={[
            { mark: 'yes', text: 'Easy to explain — everyone should be playing within 2 minutes' },
            { mark: 'yes', text: 'Works for your group size — check the player count before picking' },
            { mark: 'yes', text: 'No download needed — you lose half the group at that step' },
            { mark: 'yes', text: 'Rounds are short enough to play again if someone wants a rematch' },
          ]} />
        </GuideSection>

        <GuideSection title="The Best Games for Game Night">
          <div className="space-y-4">
            {games.map(({ rank, gameId, accent, name, players, href, why, best }) => (
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

        <GuideSection title="Which Games Work at Which Group Size">
          <p className="mb-4 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            Group size decides the night more than anything else on this list. A social deduction
            game with three people is a different game from the same one with nine, and a dice game
            that is tense at four drags at eight. Pick from the row that matches who actually turned
            up, not from who said they would.
          </p>
          <div className="space-y-3">
            {groupSizes.map(({ size, pick, why }) => (
              <div
                key={size}
                className="rounded-2xl border p-4"
                style={{ borderColor: 'var(--bd-line)', background: 'var(--bd-bg2)' }}
              >
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm" style={{ color: 'var(--bd-ink)' }}>{size}</strong>
                  <span className="text-xs" style={{ color: 'var(--bd-ink-muted)' }}>{pick}</span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--bd-ink-muted)' }}>{why}</p>
              </div>
            ))}
          </div>
        </GuideSection>

        <GuideSection title="Tips for Hosting an Online Game Night">
          <GuideChecklist items={[
            { mark: 'yes', text: 'Pick 2–3 games in advance and share the links before the call starts' },
            { mark: 'yes', text: 'Start with Guess the Spy — it gets everyone talking immediately' },
            { mark: 'yes', text: 'Switch games every 2–3 rounds to keep the energy up' },
            { mark: 'yes', text: 'Let the group vote on the next game between rounds' },
            { mark: 'yes', text: 'Keep a group chat open to share lobby links easily' },
          ]} />
        </GuideSection>

        <GuideSection title="Game Night Questions">
          <GuideFaqList items={faq} />
        </GuideSection>
      </GuideLayout>
    </>
  )
}
