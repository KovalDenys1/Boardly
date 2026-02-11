'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { useGuest } from '@/contexts/GuestContext'

interface Game {
  id: string
  nameKey: string
  emoji: string
  descriptionKey: string
  players: string
  difficultyKey: string
  status: 'available' | 'coming-soon'
  route?: string
  color: string
}

export default function GamesPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const { isGuest } = useGuest()
  const { t } = useTranslation()
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'available' | 'coming-soon'>('all')

  const games: Game[] = [
    {
      id: 'yahtzee',
      nameKey: 'games.yahtzee.name',
      emoji: '🎲',
      descriptionKey: 'games.yahtzee.description',
      players: '2-8',
      difficultyKey: 'games.yahtzee.difficulty',
      status: 'available',
      route: '/lobby/create?gameType=yahtzee',
      color: 'from-blue-500 to-purple-600'
    },
    {
      id: 'spy',
      nameKey: 'games.spy.name',
      emoji: '🕵️',
      descriptionKey: 'games.spy.description',
      players: '3-10',
      difficultyKey: 'games.spy.difficulty',
      status: 'available',
      route: '/lobby/create?gameType=guess_the_spy',
      color: 'from-red-500 to-pink-600'
    },
    {
      id: 'tic-tac-toe',
      nameKey: 'games.tictactoe.name',
      emoji: '❌',
      descriptionKey: 'games.tictactoe.description',
      players: '2',
      difficultyKey: 'games.tictactoe.difficulty',
      status: 'available',
      route: '/lobby/create?gameType=tic_tac_toe',
      color: 'from-yellow-400 to-orange-500'
    },
    {
      id: 'memory',
      nameKey: 'games.memory.name',
      emoji: '🧠',
      descriptionKey: 'games.memory.description',
      players: '2-4',
      difficultyKey: 'games.memory.difficulty',
      status: 'coming-soon',
      color: 'from-green-400 to-teal-500'
    },
    {
      id: 'rps',
      nameKey: 'games.rock_paper_scissors.name',
      emoji: '🍂',
      descriptionKey: 'games.rock_paper_scissors.description',
      players: '2',
      difficultyKey: 'games.rock_paper_scissors.difficulty',
      status: 'available',
      route: '/lobby/create?gameType=rock_paper_scissors',
      color: 'from-indigo-400 to-purple-500'
    },
    {
      id: 'alias',
      nameKey: 'games.alias.name',
      emoji: '🗣️',
      descriptionKey: 'games.alias.description',
      players: '4-16',
      difficultyKey: 'games.alias.difficulty',
      status: 'coming-soon',
      color: 'from-orange-400 to-red-500'
    },
    {
      id: 'words-mines',
      nameKey: 'games.wordsmines.name',
      emoji: '💣',
      descriptionKey: 'games.wordsmines.description',
      players: '2-8',
      difficultyKey: 'games.wordsmines.difficulty',
      status: 'coming-soon',
      color: 'from-gray-400 to-black'
    },
    {
      id: 'anagrams',
      nameKey: 'games.anagrams.name',
      emoji: '🔀',
      descriptionKey: 'games.anagrams.description',
      players: '2-8',
      difficultyKey: 'games.anagrams.difficulty',
      status: 'coming-soon',
      color: 'from-blue-300 to-indigo-500'
    },
    {
      id: 'crocodile',
      nameKey: 'games.crocodile.name',
      emoji: '🐊',
      descriptionKey: 'games.crocodile.description',
      players: '3-12',
      difficultyKey: 'games.crocodile.difficulty',
      status: 'coming-soon',
      color: 'from-green-600 to-lime-400'
    },
  ]

  // Handle authentication redirect in useEffect to avoid hydration issues
  useEffect(() => {
    // Don't redirect guests - they can access games page
    if (status === 'unauthenticated' && !isGuest) {
      router.push('/auth/login')
    }
  }, [status, isGuest, router])

  // Show loading state or redirect without flickering
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500 flex items-center justify-center">
        <div className="text-white text-2xl">Loading...</div>
      </div>
    )
  }

  // Allow access if authenticated OR guest
  if (status === 'unauthenticated' && !isGuest) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500 flex items-center justify-center">
        <div className="text-white text-2xl">Redirecting...</div>
      </div>
    )
  }

  const filteredGames = games.filter(game => {
    if (selectedFilter === 'all') return true
    return game.status === selectedFilter
  })

  const handleGameClick = (game: Game) => {
    if (game.status === 'available' && game.route) {
      router.push(game.route)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="text-center mb-12 animate-scale-in">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm mb-6 animate-bounce-in">
            <span className="text-5xl">🎮</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold text-white mb-4 drop-shadow-lg">
            {t('games.title')}
          </h1>
          <p className="text-xl text-white/90 max-w-2xl mx-auto">
            {t('games.subtitle')}
          </p>
        </div>

        {/* Filter Buttons */}
        <div className="flex flex-wrap justify-center gap-4 mb-12 animate-fade-in">
          <button
            onClick={() => setSelectedFilter('all')}
            className={`px-4 sm:px-6 py-3 rounded-xl font-semibold transition-all duration-300 whitespace-nowrap ${selectedFilter === 'all'
              ? 'bg-white text-blue-600 shadow-lg scale-105'
              : 'bg-white/20 text-white hover:bg-white/30'
              }`}
          >
            {t('common.filter')} - {t('common.all', 'All')}
          </button>
          <button
            onClick={() => setSelectedFilter('available')}
            className={`px-4 sm:px-6 py-3 rounded-xl font-semibold transition-all duration-300 whitespace-nowrap ${selectedFilter === 'available'
              ? 'bg-white text-blue-600 shadow-lg scale-105'
              : 'bg-white/20 text-white hover:bg-white/30'
              }`}
          >
            {t('games.available')}
          </button>
          <button
            onClick={() => setSelectedFilter('coming-soon')}
            className={`px-4 sm:px-6 py-3 rounded-xl font-semibold transition-all duration-300 whitespace-nowrap ${selectedFilter === 'coming-soon'
              ? 'bg-white text-blue-600 shadow-lg scale-105'
              : 'bg-white/20 text-white hover:bg-white/30'
              }`}
          >
            {t('games.comingSoon')}
          </button>
        </div>

        {/* Games Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
          {filteredGames.map((game, index) => (
            <div
              key={game.id}
              onClick={() => handleGameClick(game)}
              className={`
                relative bg-white/10 backdrop-blur-md rounded-2xl p-8 text-white 
                transition-all duration-300 hover:scale-105 hover:shadow-2xl
                flex flex-col
                ${game.status === 'available' ? 'cursor-pointer hover:bg-white/20' : 'opacity-75'}
              `}
            >
              {/* Status Badge */}
              {game.status === 'coming-soon' && (
                <div className="absolute top-4 right-4 bg-yellow-500 text-white px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap">
                  {t('games.comingSoon')}
                </div>
              )}
              {game.status === 'available' && (
                <div className="absolute top-4 right-4 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap">
                  {t('games.available')}
                </div>
              )}

              {/* Game Icon */}
              <div className={`
                inline-flex items-center justify-center w-20 h-20 rounded-2xl 
                bg-gradient-to-br ${game.color} mb-6 shadow-lg
                ${game.emoji.length > 2 ? 'px-2' : ''}
              `}>
                <span
                  className={
                    game.emoji.length > 2
                      ? 'text-3xl flex flex-wrap justify-center items-center w-full h-full'
                      : 'text-5xl'
                  }
                  style={game.emoji.length > 2 ? { lineHeight: '1.1', letterSpacing: '0.05em' } : {}}
                >
                  {game.emoji}
                </span>
              </div>

              {/* Game Info */}
              <h3 className="text-2xl font-bold mb-2 break-words">{t(game.nameKey as any)}</h3>
              <p className="text-white/80 text-sm mb-4 break-words leading-relaxed flex-grow">{t(game.descriptionKey as any)}</p>

              {/* Game Details */}
              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-white/60">👥</span>
                  <span className="text-white/90 break-words">{game.players} {t('games.players')}</span>
                </div>
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <span className="text-white/60">⚡</span>
                  <span className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-500/30 text-blue-200 break-words">
                    {t('games.difficulty')}: {t(game.difficultyKey as any)}
                  </span>
                </div>
              </div>

              {/* Play Button */}
              {game.status === 'available' && (
                <button className="w-full mt-auto px-6 py-3 bg-white text-blue-600 rounded-xl font-bold hover:bg-blue-50 transition-all duration-300 shadow-lg hover:shadow-xl">
                  {t('games.playNow')} →
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Back Button */}
        <div className="text-center animate-fade-in">
          <button
            onClick={() => router.push('/')}
            className="px-8 py-4 bg-white/20 backdrop-blur-md text-white rounded-xl font-semibold hover:bg-white/30 transition-all duration-300"
          >
            ← Back to Home
          </button>
        </div>

        {/* Stats Section */}
        <div className="mt-16 bg-white/10 backdrop-blur-md rounded-3xl p-8 text-white animate-slide-in-up">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold mb-2">
                {games.filter(g => g.status === 'available').length}
              </div>
              <div className="text-white/80">Available Games</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">
                {games.filter(g => g.status === 'coming-soon').length}
              </div>
              <div className="text-white/80">Coming Soon</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">{games.length}</div>
              <div className="text-white/80">Total Games</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
