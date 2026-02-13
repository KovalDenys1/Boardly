import { useRouter } from 'next/navigation'
import { showToast } from '@/lib/i18n-toast'
import { getGameMetadata } from '@/lib/game-registry'

interface LobbyInfoProps {
  lobby: any
  soundEnabled: boolean
  onSoundToggle: () => void
  onLeave: () => void
}

export default function LobbyInfo({ lobby, soundEnabled, onSoundToggle, onLeave }: LobbyInfoProps) {
  const router = useRouter()
  const gameMeta = lobby.gameType ? getGameMetadata(lobby.gameType) : null

  const handleCopyInvite = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(`${window.location.origin}/lobby/join/${lobby.code}`)
      showToast.success('toast.linkCopied')
    }
  }

  return (
    <div className="flex-shrink-0 sticky top-0 z-10 bg-gradient-to-r from-white/10 to-white/5 backdrop-blur-xl border-b border-white/20 px-4 sm:px-6 py-4 shadow-lg">
      {/* Breadcrumbs */}
      <nav className="flex flex-wrap items-center gap-1.5 text-xs text-white/60 mb-3">
        <button
          onClick={() => router.push('/')}
          aria-label="Navigate to home"
          className="hover:text-white transition-colors rounded px-1 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        >
          🏠 Home
        </button>
        <span aria-hidden="true" className="text-white/30">›</span>
        <button
          onClick={() => router.push('/games')}
          aria-label="Navigate to games"
          className="hover:text-white transition-colors rounded px-1 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        >
          🎮 Games
        </button>
        <span aria-hidden="true" className="text-white/30">›</span>
        <button
          onClick={() => router.push(`/games/${lobby.gameType}/lobbies`)}
          aria-label={`Navigate to ${gameMeta?.name ?? 'game'} lobbies`}
          className="hover:text-white transition-colors rounded px-1 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        >
          {gameMeta?.icon ?? '🎮'} {gameMeta?.name ?? 'Game'}
        </button>
        <span aria-hidden="true" className="text-white/30">›</span>
        <span className="text-white/80 font-semibold">{lobby.code}</span>
      </nav>

      {/* Lobby Header Row */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-extrabold text-white truncate drop-shadow-lg">
            {lobby.name}
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-white/50 text-xs">
              Code: <span className="font-mono font-bold text-white/80 text-sm tracking-wider">{lobby.code}</span>
            </p>
            {/* Invite link - inline */}
            <button
              onClick={handleCopyInvite}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg transition-all text-xs font-semibold text-white"
            >
              🔗 Copy Invite
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onSoundToggle}
            aria-label={soundEnabled ? 'Disable sound effects' : 'Enable sound effects'}
            aria-pressed={soundEnabled}
            className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all duration-200 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none"
            title={soundEnabled ? 'Disable sound' : 'Enable sound'}
          >
            {soundEnabled ? '🔊' : '🔇'}
          </button>
          <button
            onClick={onLeave}
            aria-label="Leave lobby"
            className="px-4 py-2 bg-red-500/30 hover:bg-red-500/50 text-white rounded-xl font-medium text-sm transition-all duration-200 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none"
          >
            🚪 Leave
          </button>
        </div>
      </div>
    </div>
  )
}
