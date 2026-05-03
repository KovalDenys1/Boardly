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
    { id: 'total',   label: t('lobby.stats.total'),   value: totalLobbies,  icon: '🎮', accent: 'var(--bd-sky)' },
    { id: 'waiting', label: t('lobby.stats.waiting'), value: waitingLobbies, icon: '⏳', accent: 'var(--bd-sun)' },
    { id: 'playing', label: t('lobby.stats.playing'), value: playingLobbies, icon: '🎲', accent: 'var(--bd-mint)' },
    { id: 'players', label: t('lobby.stats.players'), value: totalPlayers,  icon: '👥', accent: 'var(--bd-coral)' },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
      {stats.map(stat => (
        <div key={stat.id} style={{
          padding: '14px 16px', borderRadius: 16,
          background: 'var(--bd-card-warm)', border: '1.5px solid var(--bd-line)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -12, right: -12, width: 48, height: 48, borderRadius: '50%', background: stat.accent, opacity: 0.2 }} />
          <div style={{ fontSize: 22, marginBottom: 8 }}>{stat.icon}</div>
          <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bd-ink-muted)', marginBottom: 4 }}>{stat.label}</div>
          <div style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 800, fontSize: 28, color: stat.accent, lineHeight: 1 }}>{stat.value}</div>
        </div>
      ))}
    </div>
  )
}
