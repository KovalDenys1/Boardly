const STEPS = [
  {
    n: '01',
    color: 'var(--bd-coral)',
    title: 'Pick a game',
    body: 'Choose Yahtzee, Guess the Spy, Tic Tac Toe, Memory, or another game from the list.',
  },
  {
    n: '02',
    color: 'var(--bd-mint)',
    title: 'Invite a friend or add a bot',
    body: 'Create a room, send the link to a friend, or add a computer player when you want to start right away.',
  },
  {
    n: '03',
    color: 'var(--bd-sun)',
    title: 'Start playing',
    body: 'Everyone sees the same board, scores, and turns in their browser. No download needed.',
  },
]

export default function HowItWorksRedesign() {
  return (
    <section className="home-section home-section-steps">
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
            fontSize: 36,
            fontWeight: 700,
            color: 'var(--bd-ink)',
            marginTop: 8,
            letterSpacing: 0,
          }}
        >
          Three steps to play
        </h2>
      </div>

      <div className="home-steps-grid">
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
                letterSpacing: 0,
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
