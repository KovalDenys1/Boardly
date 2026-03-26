const faqs = [
  {
    question: 'Is Boardly free to play?',
    answer:
      'Yes, Boardly is completely free. There are no subscriptions, no ads, and no paywalls. All games are available at no cost.',
  },
  {
    question: 'Do I need an account to play?',
    answer:
      'No account is required. You can jump in as a guest instantly. Creating an account lets you save your stats and history across sessions.',
  },
  {
    question: 'What games are available on Boardly?',
    answer:
      'Boardly currently offers Yahtzee, Tic Tac Toe, Memory card game, and Guess the Spy. More games are in development, including Alias, Sketch & Guess, Telephone Doodle, and others.',
  },
  {
    question: 'Can I play against AI bots?',
    answer:
      'Yes. Yahtzee and Tic Tac Toe support AI opponents, so you can play solo or fill empty spots when friends are offline.',
  },
  {
    question: 'How do I play with friends online?',
    answer:
      'Create a lobby, then share the room code or link with your friends. They join instantly — no account or download needed on their end either.',
  },
  {
    question: 'Does Boardly work on mobile?',
    answer:
      'Yes. Boardly runs in any modern browser on desktop, tablet, and mobile. There is also a Progressive Web App (PWA) you can install from your browser for a native-app feel.',
  },
  {
    question: 'How many players can play at once?',
    answer:
      'It depends on the game. Tic Tac Toe supports 2 players, Yahtzee and Memory support up to 4, and Guess the Spy supports up to 10 players in one lobby.',
  },
  {
    question: 'Is there anything to download or install?',
    answer:
      'Nothing to download. Boardly runs entirely in your browser. Just open the site and start playing.',
  },
]

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map(({ question, answer }) => ({
    '@type': 'Question',
    name: question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: answer,
    },
  })),
}

export default function FaqSection() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div className="bg-white/10 backdrop-blur-md rounded-3xl p-6 md:p-8 text-white">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-8">
          Frequently Asked Questions
        </h2>
        <dl className="space-y-6 max-w-3xl mx-auto">
          {faqs.map(({ question, answer }) => (
            <div key={question} className="border-b border-white/20 pb-6 last:border-0 last:pb-0">
              <dt className="text-lg font-semibold mb-2">{question}</dt>
              <dd className="text-white/80 text-sm leading-relaxed">{answer}</dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  )
}
