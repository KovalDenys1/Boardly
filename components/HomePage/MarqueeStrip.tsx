'use client'

const ITEMS = [
  { txt: 'Roll the dice',        icon: '🎲', color: 'var(--bd-coral)' },
  { txt: 'Catch the spy',        icon: '🕵️', color: 'var(--bd-lav)'   },
  { txt: 'Checkmate',            icon: '♟',  color: 'var(--bd-mint)'  },
  { txt: 'Yahtzee!',             icon: '⭐', color: 'var(--bd-sun)'   },
  { txt: 'Play with friends',    icon: '👯', color: 'var(--bd-sky)'   },
  { txt: 'No download needed',   icon: '⚡', color: 'var(--bd-coral)' },
  { txt: 'Free forever',         icon: '🆓', color: 'var(--bd-mint)'  },
  { txt: 'Bring on game night',  icon: '🎉', color: 'var(--bd-sun)'   },
  { txt: 'Open source',          icon: '⚙️', color: 'var(--bd-lav)'   },
  { txt: '180K players online',  icon: '🌍', color: 'var(--bd-sky)'   },
]

const LOOP = [...ITEMS, ...ITEMS]

export default function MarqueeStrip() {
  return (
    <section
      aria-hidden
      style={{
        margin: '24px 0',
        padding: '20px 0',
        background: 'var(--bd-ink)',
        color: 'var(--bd-bg)',
        borderTop: '3px solid var(--bd-ink)',
        borderBottom: '3px solid var(--bd-ink)',
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
              fontFamily: 'var(--bd-font-display)',
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: 26 }}>{item.icon}</span>
            <span style={{ color: i % 3 === 0 ? item.color : 'var(--bd-bg)' }}>{item.txt}</span>
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
