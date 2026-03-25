import Link from 'next/link'

const games = [
  {
    emoji: '🎲',
    name: 'Yahtzee',
    description: 'Roll dice, score combinations, beat your friends.',
    players: '1–4 players',
    href: '/games/yahtzee',
    color: 'from-blue-500 to-purple-600',
  },
  {
    emoji: '❌',
    name: 'Tic Tac Toe',
    description: 'Classic 3×3 strategy. Match mode available.',
    players: '2 players',
    href: '/games/tic-tac-toe',
    color: 'from-yellow-400 to-orange-500',
  },
  {
    emoji: '🧠',
    name: 'Memory',
    description: 'Flip cards, find pairs. Three difficulty levels.',
    players: '2–4 players',
    href: '/games/memory',
    color: 'from-green-400 to-teal-500',
  },
  {
    emoji: '🕵️',
    name: 'Guess the Spy',
    description: 'One spy, one secret location. Can you find them?',
    players: '3–10 players',
    href: '/games/spy',
    color: 'from-red-500 to-pink-600',
  },
]

export default function GamesShowcase() {
  return (
    <div className="bg-white/10 backdrop-blur-md rounded-3xl p-6 md:p-8 text-white">
      <h2 className="text-3xl md:text-4xl font-bold text-center mb-2">
        Play Now — Free
      </h2>
      <p className="text-white/70 text-center mb-8 text-sm">
        No download. No account required.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {games.map(({ emoji, name, description, players, href, color }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col bg-white/10 hover:bg-white/20 rounded-2xl p-5 transition-all duration-300 hover:scale-105"
          >
            <div className={`inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br ${color} mb-4 shadow-lg`}>
              <span className="text-3xl">{emoji}</span>
            </div>
            <h3 className="font-bold text-lg mb-1">{name}</h3>
            <p className="text-white/70 text-sm flex-grow mb-3">{description}</p>
            <span className="text-white/50 text-xs">{players}</span>
          </Link>
        ))}
      </div>
      <div className="text-center">
        <Link
          href="/games"
          className="inline-block px-6 py-3 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-semibold transition-all duration-300"
        >
          Browse all games →
        </Link>
      </div>
    </div>
  )
}
