'use client'

import { useTranslation } from '@/lib/i18n-helpers'

// JSON-LD stays in English for SEO regardless of user language
const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    { '@type': 'Question', name: 'Is Boardly free to play?', acceptedAnswer: { '@type': 'Answer', text: 'Yes, Boardly is completely free. There are no subscriptions, no ads, and no paywalls. All games are available at no cost.' } },
    { '@type': 'Question', name: 'Do I need an account to play?', acceptedAnswer: { '@type': 'Answer', text: 'No account is required. You can jump in as a guest instantly. Creating an account lets you save your stats and history across sessions.' } },
    { '@type': 'Question', name: 'What games are available on Boardly?', acceptedAnswer: { '@type': 'Answer', text: 'Boardly currently offers Yahtzee, Tic Tac Toe, Connect Four, Memory card game, and Guess the Spy. More games are in development, including Alias, Sketch & Guess, Telephone Doodle, and others.' } },
    { '@type': 'Question', name: 'Can I play solo?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Yahtzee, Tic Tac Toe, and Connect Four can add computer players, so you can start even when friends are offline.' } },
    { '@type': 'Question', name: 'How do I play with friends online?', acceptedAnswer: { '@type': 'Answer', text: 'Create a room, then share the room code or link with your friends. They join instantly — no account or download needed on their end either.' } },
    { '@type': 'Question', name: 'Does Boardly work on mobile?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Boardly runs in any modern browser on desktop, tablet, and mobile. You can also install it from your browser if you want an app-like shortcut.' } },
    { '@type': 'Question', name: 'How many players can play at once?', acceptedAnswer: { '@type': 'Answer', text: 'It depends on the game. Tic Tac Toe and Connect Four support 2 players, Yahtzee and Memory support up to 4, and Guess the Spy supports up to 10 players in one room.' } },
    { '@type': 'Question', name: 'Is there anything to download or install?', acceptedAnswer: { '@type': 'Answer', text: 'Nothing to download. Boardly runs entirely in your browser. Just open the site and start playing.' } },
  ],
}

const FAQ_KEYS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'] as const
const FAQ_COLORS = [
  'var(--bd-coral)',
  'var(--bd-mint)',
  'var(--bd-sun)',
  'var(--bd-lav)',
] as const

export default function FaqSection() {
  const { t } = useTranslation()

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <section className="home-faq-section" aria-labelledby="home-faq-title">
        <div className="home-faq-intro">
          <span className="home-faq-kicker">FAQ</span>
          <h2 id="home-faq-title">{t('faq.title')}</h2>
          <p>Quick answers before you start a room, invite friends, or play as a guest.</p>
        </div>

        <dl className="home-faq-list">
          {FAQ_KEYS.map((key, index) => (
            <div key={key} className="home-faq-item">
              <dt>
                <span style={{ background: FAQ_COLORS[index % FAQ_COLORS.length] }}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                {t(`faq.${key}.question`)}
              </dt>
              <dd>{t(`faq.${key}.answer`)}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  )
}
