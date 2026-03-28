'use client'

import Link from 'next/link'
import { useTranslation } from '@/lib/i18n-helpers'

export default function GamesShowcase() {
  const { t } = useTranslation()

  const games = [
    {
      emoji: '🎲',
      name: 'Yahtzee',
      description: t('showcase.games.yahtzee.description'),
      players: t('showcase.games.yahtzee.players'),
      href: '/games/yahtzee',
      color: 'from-blue-500 to-purple-600',
    },
    {
      emoji: '❌',
      name: 'Tic Tac Toe',
      description: t('showcase.games.ticTacToe.description'),
      players: t('showcase.games.ticTacToe.players'),
      href: '/games/tic-tac-toe',
      color: 'from-yellow-400 to-orange-500',
    },
    {
      emoji: '🧠',
      name: 'Memory',
      description: t('showcase.games.memory.description'),
      players: t('showcase.games.memory.players'),
      href: '/games/memory',
      color: 'from-green-400 to-teal-500',
    },
    {
      emoji: '🕵️',
      name: 'Guess the Spy',
      description: t('showcase.games.spy.description'),
      players: t('showcase.games.spy.players'),
      href: '/games/spy',
      color: 'from-red-500 to-pink-600',
    },
  ]

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-3xl p-6 md:p-8 text-white">
      <h2 className="text-3xl md:text-4xl font-bold text-center mb-2">
        {t('showcase.title')}
      </h2>
      <p className="text-white/70 text-center mb-8 text-sm">
        {t('showcase.subtitle')}
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
          {t('showcase.browseAll')}
        </Link>
      </div>
    </div>
  )
}
