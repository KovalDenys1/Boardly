'use client'

import { useTranslation } from 'react-i18next'

interface LobbyStatsProps {
  totalLobbies: number
  waitingLobbies: number
  playingLobbies: number
  totalPlayers: number
}

export default function LobbyStats({ totalLobbies, waitingLobbies, playingLobbies, totalPlayers }: LobbyStatsProps) {
  const { t } = useTranslation()

  const stats = [
    {
      label: t('lobby.stats.total'),
      value: totalLobbies,
      icon: '🎮',
      color: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300',
    },
    {
      label: t('lobby.stats.waiting'),
      value: waitingLobbies,
      icon: '⏳',
      color: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300',
    },
    {
      label: t('lobby.stats.playing'),
      value: playingLobbies,
      icon: '🎲',
      color: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300',
    },
    {
      label: t('lobby.stats.players'),
      value: totalPlayers,
      icon: '👥',
      color: 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 hover:shadow-xl transition-all hover:-translate-y-1 animate-fade-in"
          style={{ animationDelay: `${index * 0.1}s` }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl">{stat.icon}</span>
            <span className={`px-2 py-1 rounded-full text-xs font-bold ${stat.color}`}>
              {stat.value}
            </span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">{stat.label}</p>
        </div>
      ))}
    </div>
  )
}
