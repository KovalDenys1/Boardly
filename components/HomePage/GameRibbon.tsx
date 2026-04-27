import Link from 'next/link'
import Die from '@/components/ui/Die'

interface GameCardProps {
  name: string
  tag: string
  players: string
  time: string
  diff: string
  desc: string
  href: string
  status: 'live' | 'beta' | 'soon'
  accent: string
  accentBg: string
  illustration: React.ReactNode
}

function GameCard({ name, tag, players, time, diff, desc, href, status, accentBg, illustration }: GameCardProps) {
  const badge = {
    live: { txt: 'Live',  bg: 'rgba(79,201,166,0.18)',  color: '#2FA787' },
    beta: { txt: 'Beta',  bg: 'rgba(255,196,77,0.22)',  color: '#E5A82E' },
    soon: { txt: 'Soon',  bg: 'rgba(155,140,255,0.18)', color: '#7867E8' },
  }[status]

  return (
    <div
      style={{
        background: 'white',
        borderRadius: 24,
        border: '1.5px solid #E8DDC8',
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
              fontFamily: "'Bricolage Grotesque', Georgia, serif",
              fontSize: 22,
              fontWeight: 700,
              color: '#1F1B16',
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

        <p style={{ fontSize: 14, color: '#4A3F33', lineHeight: 1.5, flex: 1 }}>{desc}</p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[`👥 ${players}`, `⏱ ${time}`, diff, tag].map((chip) => (
            <span
              key={chip}
              style={{
                padding: '5px 10px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                background: '#F2E9D8',
                color: '#4A3F33',
              }}
            >
              {chip}
            </span>
          ))}
        </div>

        {status === 'live' ? (
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
              background: '#1F1B16',
              color: '#FBF6EE',
              boxShadow: '0 4px 0 #FF6B5B',
              textDecoration: 'none',
              marginTop: 4,
            }}
          >
            Play →
          </Link>
        ) : status === 'beta' ? (
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
              background: '#FFF8EC',
              color: '#1F1B16',
              border: '1px solid #E8DDC8',
              textDecoration: 'none',
              marginTop: 4,
            }}
          >
            Try beta
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
              background: '#F2E9D8',
              color: '#8A7A66',
              marginTop: 4,
            }}
          >
            Coming soon
          </div>
        )}
      </div>
    </div>
  )
}

const GAMES: GameCardProps[] = [
  {
    name: 'Yahtzee',
    tag: 'Dice',
    players: '2–4',
    time: '15 min',
    diff: 'Easy',
    desc: 'A classic of luck and strategy. Roll the dice, fill combinations, score points.',
    href: '/games/yahtzee',
    status: 'live',
    accent: '#FF6B5B',
    accentBg: 'rgba(255,107,91,0.10)',
    illustration: (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
        <div className="bd-float" style={{ animationDelay: '0s' }}><Die value={5} size={48} rotate="-8deg" /></div>
        <div className="bd-float" style={{ animationDelay: '0.4s' }}><Die value={6} size={56} /></div>
        <div className="bd-float" style={{ animationDelay: '0.8s' }}><Die value={3} size={48} rotate="-2deg" /></div>
      </div>
    ),
  },
  {
    name: 'Guess the Spy',
    tag: 'Deduction',
    players: '4–10',
    time: '10 min',
    diff: 'Medium',
    desc: 'One spy hides among friends. Ask questions and figure out the impostor.',
    href: '/games/spy',
    status: 'live',
    accent: '#9B8CFF',
    accentBg: 'rgba(155,140,255,0.12)',
    illustration: (
      <div className="bd-float" style={{ animationDelay: '0s', position: 'relative' }}>
        <div
          style={{
            width: 78,
            height: 78,
            borderRadius: '50%',
            background: '#9B8CFF',
            border: '3px solid #1F1B16',
            boxShadow: '4px 4px 0 #1F1B16',
            display: 'grid',
            placeItems: 'center',
            fontSize: 38,
          }}
        >
          🕵
        </div>
      </div>
    ),
  },
  {
    name: 'Tic Tac Toe',
    tag: 'Strategy',
    players: '2',
    time: '5 min',
    diff: 'Easy',
    desc: 'The timeless classic. Three in a row wins. Play solo vs AI or with a friend.',
    href: '/games/tic-tac-toe',
    status: 'live',
    accent: '#4FC9A6',
    accentBg: 'rgba(79,201,166,0.12)',
    illustration: (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 6,
          width: 108,
          height: 108,
          border: '3px solid #1F1B16',
          borderRadius: 12,
          boxShadow: '3px 3px 0 #1F1B16',
          background: 'white',
          padding: 8,
        }}
        className="bd-float"
      >
        {['❌','','⭕','','❌','','⭕','','❌'].map((s, i) => (
          <div key={i} style={{ display: 'grid', placeItems: 'center', fontSize: 20 }}>{s}</div>
        ))}
      </div>
    ),
  },
]

export default function GameRibbon() {
  return (
    <section style={{ padding: '40px clamp(16px, 4vw, 48px)', maxWidth: 1280, margin: '0 auto' }}>
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
              color: '#8A7A66',
            }}
          >
            Catalog
          </span>
          <h2
            style={{
              fontFamily: "'Bricolage Grotesque', Georgia, serif",
              fontSize: 'clamp(28px, 4vw, 44px)',
              fontWeight: 700,
              color: '#1F1B16',
              marginTop: 8,
              letterSpacing: '-0.02em',
            }}
          >
            What shall we play?
          </h2>
        </div>
        <Link
          href="/games"
          style={{
            padding: '12px 20px',
            borderRadius: 14,
            fontWeight: 600,
            fontSize: 15,
            background: '#FFF8EC',
            color: '#1F1B16',
            border: '1px solid #E8DDC8',
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          All games →
        </Link>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
          gap: 20,
        }}
      >
        {GAMES.map((g) => (
          <GameCard key={g.name} {...g} />
        ))}
      </div>
    </section>
  )
}
