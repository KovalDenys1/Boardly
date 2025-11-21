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
      <div className="mb-4 flex items-center gap-2 text-white/80 text-sm">
        <button 
          onClick={() => router.push('/')}
          className="hover:text-white transition-colors"
        >
          🏠 Home
        </button>
        <span>›</span>
        <button 
          onClick={() => router.push('/games')}
          className="hover:text-white transition-colors"
        >
          🎮 Games
        </button>
        <span>›</span>
        <button 
          onClick={() => router.push(`/games/${lobby.gameType}/lobbies`)}
          className="hover:text-white transition-colors"
        >
          🎲 Yahtzee
        </button>
        <span>›</span>
        <span className="text-white font-semibold">{lobby.code}</span>
      </div>

      {/* Lobby Header */}
      <div className="card mb-4">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-3xl font-bold">{lobby.name}</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Code: <span className="font-mono font-bold text-lg">{lobby.code}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={onSoundToggle} 
              className="btn btn-secondary"
              title={soundEnabled ? 'Disable sound' : 'Enable sound'}
            >
              {soundEnabled ? '🔊' : '🔇'}
            </button>
            <button onClick={onLeave} className="btn btn-secondary">
              Leave
            </button>
          </div>
        </div>
        
        {/* Invite Link */}
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-2 border-blue-300 dark:border-blue-600 rounded-lg p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-1">
                🔗 Invite Friends
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={typeof window !== 'undefined' ? `${window.location.origin}/lobby/join/${lobby.code}` : ''}
                  className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-600 rounded-lg font-mono text-sm"
                />
                <button
                  onClick={handleCopyInvite}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors whitespace-nowrap"
                >
                  📋 Copy
                </button>
              </div>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                Share this link with friends to invite them to this lobby
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
