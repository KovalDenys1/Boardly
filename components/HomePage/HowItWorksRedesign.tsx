const STEPS = [
  {
    n: '01',
    color: 'var(--bd-coral)',
    title: 'Create a lobby',
    body: 'Pick a game, set up the room, add a password if you want.',
  },
  {
    n: '02',
    color: 'var(--bd-mint)',
    title: 'Invite friends',
    body: 'Drop a link or code into any chat — friends join with one click.',
  },
  {
    n: '03',
    color: 'var(--bd-sun)',
    title: 'Play together!',
    body: 'Voice chat, emotes, stats. No boring loading screens.',
  },
]

export default function HowItWorksRedesign() {
  return (
    <section style={{ padding: '60px clamp(16px, 4vw, 48px)', maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <span
          style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 12,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--bd-ink-muted)',
          }}
        >
          How it works
        </span>
        <h2
          style={{
            fontFamily: 'var(--bd-font-display)',
            fontSize: 'clamp(28px, 4vw, 44px)',
            fontWeight: 700,
            color: 'var(--bd-ink)',
            marginTop: 8,
            letterSpacing: '-0.02em',
          }}
        >
          Three steps to play
        </h2>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
          gap: 20,
        }}
      >
        {STEPS.map((s) => (
          <div
            key={s.n}
            style={{
              background: 'white',
              borderRadius: 24,
              border: '1.5px solid var(--bd-line)',
              boxShadow: '0 6px 0 rgba(31,27,22,0.08)',
              padding: 28,
              position: 'relative',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--bd-font-display)',
                fontSize: 56,
                fontWeight: 800,
                color: s.color,
                lineHeight: 1,
                marginBottom: 12,
                letterSpacing: '-0.04em',
              }}
            >
              {s.n}
            </div>
            <h3
              style={{
                fontFamily: 'var(--bd-font-display)',
                fontSize: 22,
                fontWeight: 700,
                color: 'var(--bd-ink)',
                marginBottom: 8,
              }}
            >
              {s.title}
            </h3>
            <p style={{ color: 'var(--bd-ink-soft)', fontSize: 15, lineHeight: 1.5 }}>{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
