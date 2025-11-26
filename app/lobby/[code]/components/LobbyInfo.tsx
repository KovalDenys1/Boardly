import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

interface LobbyInfoProps {
  lobby: any
  soundEnabled: boolean
  onSoundToggle: () => void
  onLeave: () => void
}

export default function LobbyInfo({ lobby, soundEnabled, onSoundToggle, onLeave }: LobbyInfoProps) {
  const router = useRouter()

  const handleCopyInvite = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(`${window.location.origin}/lobby/join/${lobby.code}`)
      toast.success('📋 Invite link copied to clipboard!')
    }
  }

  return (
    <>
      {/* Breadcrumbs */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-white/80 text-xs sm:text-sm">
        <button 
          onClick={() => router.push('/')}
          aria-label="Navigate to home"
          className="hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded px-1"
        >
          🏠 Home
        </button>
        <span aria-hidden="true">›</span>
        <button 
          onClick={() => router.push('/games')}
          aria-label="Navigate to games"
          className="hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded px-1"
        >
          🎮 Games
        </button>
        <span aria-hidden="true">›</span>
        <button 
          onClick={() => router.push(`/games/${lobby.gameType}/lobbies`)}
          aria-label="Navigate to Yahtzee lobbies"
          className="hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded px-1"
        >
          🎲 Yahtzee
        </button>
        <span aria-hidden="true">›</span>
        <span className="text-white font-semibold">{lobby.code}</span>
      </div>

      {/* Lobby Header */}
      <div className="card mb-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold truncate">{lobby.name}</h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm sm:text-base">
              Code: <span className="font-mono font-bold text-base sm:text-lg">{lobby.code}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button 
              onClick={onSoundToggle}
              aria-label={soundEnabled ? 'Disable sound effects' : 'Enable sound effects'}
              aria-pressed={soundEnabled}
              className="btn btn-secondary flex-1 sm:flex-none"
              title={soundEnabled ? 'Disable sound' : 'Enable sound'}
            >
              {soundEnabled ? '🔊' : '🔇'}
            </button>
            <button 
              onClick={onLeave}
              aria-label="Leave lobby"
              className="btn btn-secondary flex-1 sm:flex-none"
            >
              Leave
            </button>
          </div>
        </div>
        
        {/* Invite Link */}
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-2 border-blue-300 dark:border-blue-600 rounded-lg p-4">
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-1">
                🔗 Invite Friends
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400">
                Share this link with friends to invite them to this lobby
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                readOnly
                value={typeof window !== 'undefined' ? `${window.location.origin}/lobby/join/${lobby.code}` : ''}
                aria-label="Invite link"
                className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-600 rounded-lg font-mono text-xs sm:text-sm focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
              />
              <button
                onClick={handleCopyInvite}
                aria-label="Copy invite link to clipboard"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors whitespace-nowrap focus-visible:ring-4 focus-visible:ring-blue-400 focus-visible:outline-none"
              >
                📋 Copy
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
