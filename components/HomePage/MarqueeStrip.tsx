'use client'

const ITEMS = [
  { txt: 'Roll the dice',        icon: '🎲', color: '#FF6B5B' },
  { txt: 'Catch the spy',        icon: '🕵️', color: '#9B8CFF' },
  { txt: 'Checkmate',            icon: '♟',  color: '#4FC9A6' },
  { txt: 'Yahtzee!',             icon: '⭐', color: '#FFC44D' },
  { txt: 'Play with friends',    icon: '👯', color: '#6BC1F0' },
  { txt: 'No download needed',   icon: '⚡', color: '#FF6B5B' },
  { txt: 'Free forever',         icon: '🆓', color: '#4FC9A6' },
  { txt: 'Bring on game night',  icon: '🎉', color: '#FFC44D' },
  { txt: 'Open source',          icon: '⚙️', color: '#9B8CFF' },
  { txt: '180K players online',  icon: '🌍', color: '#6BC1F0' },
]

const LOOP = [...ITEMS, ...ITEMS]

export default function MarqueeStrip() {
  return (
    <section
      aria-hidden
      style={{
        margin: '24px 0',
        padding: '20px 0',
        background: '#1F1B16',
        color: '#FBF6EE',
        borderTop: '3px solid #1F1B16',
        borderBottom: '3px solid #1F1B16',
        overflow: 'hidden',
        transform: 'rotate(-1.2deg)',
        position: 'relative',
      }}
    >
      <style>{`
        @keyframes boardly-marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .bd-marquee-track {
          display: flex;
          gap: 48px;
          width: max-content;
          animation: boardly-marquee 40s linear infinite;
          will-change: transform;
        }
        @media (prefers-reduced-motion: reduce) {
          .bd-marquee-track { animation: none; }
        }
        .bd-marquee-track:hover { animation-play-state: paused; }
      `}</style>
      <div className="bd-marquee-track">
        {LOOP.map((item, i) => (
          <span
            key={i}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 14,
              fontFamily: "'Bricolage Grotesque', Georgia, serif",
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: 26 }}>{item.icon}</span>
            <span style={{ color: i % 3 === 0 ? item.color : '#FBF6EE' }}>{item.txt}</span>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: item.color,
                flexShrink: 0,
                display: 'inline-block',
              }}
            />
          </span>
        ))}
      </div>
    </section>
  )
}
