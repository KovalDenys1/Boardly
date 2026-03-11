'use client'

import { useTranslation } from '@/lib/i18n-helpers'

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
      id: 'total',
      label: t('lobby.stats.total'),
      value: totalLobbies,
      icon: '🎮',
      accent: 'from-blue-500 to-indigo-500',
      dot: 'bg-blue-500 dark:bg-blue-300',
    },
    {
      id: 'waiting',
      label: t('lobby.stats.waiting'),
      value: waitingLobbies,
      icon: '⏳',
      accent: 'from-amber-500 to-orange-500',
      dot: 'bg-amber-500 dark:bg-amber-300',
    },
    {
      id: 'playing',
      label: t('lobby.stats.playing'),
      value: playingLobbies,
      icon: '🎲',
      accent: 'from-emerald-500 to-teal-500',
      dot: 'bg-emerald-500 dark:bg-emerald-300',
    },
    {
      id: 'players',
      label: t('lobby.stats.players'),
      value: totalPlayers,
      icon: '👥',
      accent: 'from-purple-500 to-fuchsia-500',
      dot: 'bg-purple-500 dark:bg-purple-300',
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.id}
          className="group relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white/80 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700/50 dark:bg-slate-800/50"
        >
          <div className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${stat.accent} opacity-0 transition-opacity group-hover:opacity-100`} />
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-xl shadow-sm dark:bg-slate-700/70">
              {stat.icon}
            </div>
            <span className={`mt-1 inline-flex h-2.5 w-2.5 rounded-full ${stat.dot}`} />
          </div>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
            {stat.label}
          </p>
          <p className="mt-2 text-lg font-bold text-slate-900 dark:text-white">
            {stat.value}
          </p>
        </div>
      ))}
    </div>
  )
}
