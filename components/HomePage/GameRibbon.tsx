import Link from 'next/link'
import Die from '@/components/ui/Die'
import { getCatalogGames, type GameCatalogEntry } from '@/lib/game-catalog'
import { getGameLobbiesRoute } from '@/lib/public-game-access'

type CardStatus = GameCatalogEntry['availability']

interface GameCardProps {
  name: string
  tag: string
  players: string
  time: string
  diff: string
  desc: string
  href: string | null
  status: CardStatus
  accentBg: string
  illustration: React.ReactNode
}

function GameCard({ name, tag, players, time, diff, desc, href, status, accentBg, illustration }: GameCardProps) {
  const badge = {
    available: { txt: 'Play now', bg: 'rgba(79,201,166,0.18)', color: 'var(--bd-mint-deep)' },
    'in-development': { txt: 'Coming later', bg: 'rgba(255,196,77,0.22)', color: 'var(--bd-ink-soft)' },
    planned: { txt: 'On the list', bg: 'rgba(155,140,255,0.18)', color: 'var(--bd-lav-deep)' },
  }[status]

  return (
    <div
      style={{
        background: 'white',
        borderRadius: 24,
        border: '1.5px solid var(--bd-line)',
        boxShadow: '0 6px 0 rgba(31,27,22,0.08), 0 14px 28px -10px rgba(31,27,22,0.18)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* illustration area */}
      <div style={{ background: accentBg, padding: '24px 16px', height: 160, display: 'grid', placeItems: 'center' }}>
        {illustration}
      </div>

      {/* content */}
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3
            style={{
              fontFamily: 'var(--bd-font-display)',
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--bd-ink)',
            }}
          >
            {name}
          </h3>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              background: badge.bg,
              color: badge.color,
            }}
          >
            {badge.txt}
          </span>
        </div>

        <p style={{ fontSize: 14, color: 'var(--bd-ink-soft)', lineHeight: 1.5, flex: 1 }}>{desc}</p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[`👥 ${players}`, `⏱ ${time}`, diff, tag].map((chip) => (
            <span
              key={chip}
              style={{
                padding: '5px 10px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                background: 'var(--bd-bg2)',
                color: 'var(--bd-ink-soft)',
              }}
            >
              {chip}
            </span>
          ))}
        </div>

        {status === 'available' && href ? (
          <Link
            href={href}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '12px 20px',
              borderRadius: 14,
              fontWeight: 600,
              fontSize: 15,
              background: 'var(--bd-ink)',
              color: 'var(--bd-bg)',
              boxShadow: '0 4px 0 var(--bd-coral)',
              textDecoration: 'none',
              marginTop: 4,
            }}
          >
            Find a room →
          </Link>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '12px 20px',
              borderRadius: 14,
              fontWeight: 600,
              fontSize: 15,
              background: 'var(--bd-bg2)',
              color: 'var(--bd-ink-muted)',
              marginTop: 4,
            }}
          >
            {status === 'in-development' ? 'Coming later' : 'On the list'}
          </div>
        )}
      </div>
    </div>
  )
}

const GAME_DETAILS: Record<string, Omit<GameCardProps, 'href' | 'status' | 'illustration'>> = {
  yahtzee: {
    name: 'Yahtzee',
    tag: 'Dice',
    players: '2-4',
    time: '15 min',
    diff: 'Easy',
    desc: 'Roll five dice, fill the scorecard, and chase the best combinations. You can play with friends or start a quick solo-friendly match.',
    accentBg: 'rgba(255,107,91,0.10)',
  },
  spy: {
    name: 'Guess the Spy',
    tag: 'Deduction',
    players: '3-8',
    time: '10 min',
    diff: 'Medium',
    desc: 'Everyone gets the same location except the spy. Ask questions, listen closely, and vote.',
    accentBg: 'rgba(155,140,255,0.12)',
  },
  'tic-tac-toe': {
    name: 'Tic Tac Toe',
    tag: 'Strategy',
    players: '2',
    time: '5 min',
    diff: 'Easy',
    desc: 'A fast two-player classic. Play with a friend or start a quick game when you only have a minute.',
    accentBg: 'rgba(79,201,166,0.12)',
  },
  memory: {
    name: 'Memory',
    tag: 'Cards',
    players: '2-4',
    time: '10 min',
    diff: 'Easy',
    desc: 'Flip cards, remember positions, and match pairs across easy, medium, or hard boards.',
    accentBg: 'rgba(255,196,77,0.14)',
  },
}

function fallbackName(id: string) {
  return id
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getIllustration(gameId: string, emoji: string) {
  switch (gameId) {
    case 'yahtzee':
      return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
        <div className="bd-float" style={{ animationDelay: '0s' }}><Die value={5} size={48} rotate="-8deg" /></div>
        <div className="bd-float" style={{ animationDelay: '0.4s' }}><Die value={6} size={56} /></div>
        <div className="bd-float" style={{ animationDelay: '0.8s' }}><Die value={3} size={48} rotate="-2deg" /></div>
      </div>
      )
    case 'spy':
      return (
      <div className="bd-float" style={{ animationDelay: '0s', position: 'relative' }}>
        <div
          style={{
            width: 78,
            height: 78,
            borderRadius: '50%',
            background: 'var(--bd-lav)',
            border: '3px solid var(--bd-ink)',
            boxShadow: '4px 4px 0 var(--bd-ink)',
            display: 'grid',
            placeItems: 'center',
            fontSize: 38,
          }}
        >
          🕵
        </div>
      </div>
      )
    case 'tic-tac-toe':
      return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 6,
          width: 108,
          height: 108,
          border: '3px solid var(--bd-ink)',
          borderRadius: 12,
          boxShadow: '3px 3px 0 var(--bd-ink)',
          background: 'white',
          padding: 8,
        }}
        className="bd-float"
      >
        {['❌','','⭕','','❌','','⭕','','❌'].map((s, i) => (
          <div key={i} style={{ display: 'grid', placeItems: 'center', fontSize: 20 }}>{s}</div>
        ))}
      </div>
      )
    case 'memory':
      return (
        <div className="bd-float" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {['?', '★', '?', '●', '●', '?', '★', '?'].map((symbol, index) => (
            <span
              key={`${symbol}-${index}`}
              style={{
                display: 'grid',
                placeItems: 'center',
                width: 34,
                height: 42,
                borderRadius: 8,
                border: '2px solid var(--bd-ink)',
                background: symbol === '?' ? 'var(--bd-sun)' : 'white',
                boxShadow: '2px 2px 0 var(--bd-ink)',
                fontFamily: 'var(--bd-font-display)',
                fontWeight: 800,
                color: 'var(--bd-ink)',
              }}
            >
              {symbol}
            </span>
          ))}
        </div>
      )
    default:
      return <div className="bd-float" style={{ fontSize: 64 }}>{emoji}</div>
  }
}

export default function GameRibbon() {
  const catalogGames = getCatalogGames()
  const availableGames = catalogGames.filter((game) => game.availability === 'available')
  const inDevelopmentCount = catalogGames.filter((game) => game.availability === 'in-development').length
  const plannedCount = catalogGames.filter((game) => game.availability === 'planned').length
  const cards: GameCardProps[] = availableGames.map((game) => {
    const details = GAME_DETAILS[game.id] ?? {
      name: fallbackName(game.id),
      tag: 'Catalog',
      players: game.players,
      time: 'Varies',
      diff: 'Varies',
      desc: 'Pick the game, create a room, and invite people with a link.',
      accentBg: 'rgba(155,140,255,0.12)',
    }
    const href = game.route ?? getGameLobbiesRoute(game.gameType)

    return {
      ...details,
      href,
      status: game.availability,
      illustration: getIllustration(game.id, game.emoji),
    }
  })

  return (
    <section className="home-section home-section-games">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <span
            style={{
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 12,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--bd-ink-muted)',
            }}
          >
            Games
          </span>
          <h2
            style={{
              fontFamily: 'var(--bd-font-display)',
              fontSize: 36,
              fontWeight: 700,
              color: 'var(--bd-ink)',
              marginTop: 8,
              letterSpacing: 0,
            }}
          >
            Choose what to play
          </h2>
          <p style={{ marginTop: 10, color: 'var(--bd-ink-soft)', fontSize: 15, maxWidth: 560, lineHeight: 1.5 }}>
            {availableGames.length} games are ready today. {inDevelopmentCount + plannedCount} more are being explored for future game nights.
          </p>
        </div>
        <Link
          href="/games"
          style={{
            padding: '12px 20px',
            borderRadius: 14,
            fontWeight: 600,
            fontSize: 15,
            background: 'var(--bd-card-warm)',
            color: 'var(--bd-ink)',
            border: '1px solid var(--bd-line)',
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          See all games →
        </Link>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
          gap: 20,
        }}
      >
        {cards.map((g) => (
          <GameCard key={g.name} {...g} />
        ))}
      </div>
    </section>
  )
}
