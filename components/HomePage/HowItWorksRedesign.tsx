'use client'

import { useTranslation } from '@/lib/i18n-helpers'

export default function HowItWorksRedesign() {
  const { t } = useTranslation()

  // The step number used to be tinted per-step (coral/mint/sun) — at 56px
  // bold on bd-card-warm none of those, nor their -deep variants, reach the
  // large-text 3:1 AA minimum (bd-mint measured 1.94:1, bd-sun 1.5:1;
  // bd-mint-deep and bd-sun-deep still fall short at 2.84:1 / 1.99:1).
  // bd-ink is the only token in the palette that clears it here (#1171).
  const steps = [
    { n: '01', color: 'var(--bd-ink)', title: t('home.howItWorks.step1.title'), body: t('home.howItWorks.step1.description') },
    { n: '02', color: 'var(--bd-ink)', title: t('home.howItWorks.step2.title'), body: t('home.howItWorks.step2.description') },
    { n: '03', color: 'var(--bd-ink)', title: t('home.howItWorks.step3.title'), body: t('home.howItWorks.step3.description') },
  ]

  return (
    <section className="home-section home-section-steps">
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <span
          style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 12,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            // bd-ink-muted was 3.86:1 here — AA large-text only (DESIGN.md
            // "Contrast"), and this kicker is normal-size (#1171).
            color: 'var(--bd-ink-soft)',
          }}
        >
          {t('home.howItWorks.kicker')}
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
          {t('home.howItWorks.title')}
        </h2>
      </div>

      <div className="home-steps-grid">
        {steps.map((s) => (
          <div
            key={s.n}
            style={{
              background: 'var(--bd-card-warm)',
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
