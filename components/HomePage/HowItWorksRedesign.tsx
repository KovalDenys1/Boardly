'use client'

import { useTranslation } from '@/lib/i18n-helpers'

export default function HowItWorksRedesign() {
  const { t } = useTranslation()

  const steps = [
    { n: '01', color: 'var(--bd-coral)', title: t('home.howItWorks.step1.title'), body: t('home.howItWorks.step1.description') },
    { n: '02', color: 'var(--bd-mint)', title: t('home.howItWorks.step2.title'), body: t('home.howItWorks.step2.description') },
    { n: '03', color: 'var(--bd-sun)', title: t('home.howItWorks.step3.title'), body: t('home.howItWorks.step3.description') },
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
            color: 'var(--bd-ink-muted)',
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
