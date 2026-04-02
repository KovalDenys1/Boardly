'use client'

import { useTranslation } from '@/lib/i18n-helpers'

// JSON-LD stays in English for SEO regardless of user language
const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    { '@type': 'Question', name: 'Is Boardly free to play?', acceptedAnswer: { '@type': 'Answer', text: 'Yes, Boardly is completely free. There are no subscriptions, no ads, and no paywalls. All games are available at no cost.' } },
    { '@type': 'Question', name: 'Do I need an account to play?', acceptedAnswer: { '@type': 'Answer', text: 'No account is required. You can jump in as a guest instantly. Creating an account lets you save your stats and history across sessions.' } },
    { '@type': 'Question', name: 'What games are available on Boardly?', acceptedAnswer: { '@type': 'Answer', text: 'Boardly currently offers Yahtzee, Tic Tac Toe, Memory card game, and Guess the Spy. More games are in development, including Alias, Sketch & Guess, Telephone Doodle, and others.' } },
    { '@type': 'Question', name: 'Can I play against AI bots?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Yahtzee and Tic Tac Toe support AI opponents, so you can play solo or fill empty spots when friends are offline.' } },
    { '@type': 'Question', name: 'How do I play with friends online?', acceptedAnswer: { '@type': 'Answer', text: 'Create a lobby, then share the room code or link with your friends. They join instantly — no account or download needed on their end either.' } },
    { '@type': 'Question', name: 'Does Boardly work on mobile?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Boardly runs in any modern browser on desktop, tablet, and mobile. There is also a Progressive Web App (PWA) you can install from your browser for a native-app feel.' } },
    { '@type': 'Question', name: 'How many players can play at once?', acceptedAnswer: { '@type': 'Answer', text: 'It depends on the game. Tic Tac Toe supports 2 players, Yahtzee and Memory support up to 4, and Guess the Spy supports up to 10 players in one lobby.' } },
    { '@type': 'Question', name: 'Is there anything to download or install?', acceptedAnswer: { '@type': 'Answer', text: 'Nothing to download. Boardly runs entirely in your browser. Just open the site and start playing.' } },
  ],
}

const FAQ_KEYS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'] as const

export default function FaqSection() {
  const { t } = useTranslation()

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div className="bg-white/10 backdrop-blur-md rounded-3xl p-6 md:p-8 text-white">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-8">
          {t('faq.title')}
        </h2>
        <dl className="space-y-6 max-w-3xl mx-auto">
          {FAQ_KEYS.map((key) => (
            <div key={key} className="border-b border-white/20 pb-6 last:border-0 last:pb-0">
              <dt className="text-lg font-semibold mb-2">{t(`faq.${key}.question`)}</dt>
              <dd className="text-white/80 text-sm leading-relaxed">{t(`faq.${key}.answer`)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  )
}
