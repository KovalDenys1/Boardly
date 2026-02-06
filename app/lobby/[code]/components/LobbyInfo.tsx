import { useRouter } from 'next/navigation'
import { showToast } from '@/lib/i18n-toast'

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
      showToast.success('toast.linkCopied')
    }
  }

  return (
    <>
      {/* Breadcrumbs */}
      <div
        className="flex flex-wrap items-center text-white/80"
        style={{
          marginBottom: `clamp(12px, 1.2vh, 20px)`,
          gap: `clamp(6px, 0.6vw, 10px)`,
          fontSize: `clamp(11px, 1vw, 14px)`,
        }}
      >
        <button
          onClick={() => router.push('/')}
          aria-label="Navigate to home"
          className="hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded"
          style={{ padding: `clamp(2px, 0.2vh, 4px)` }}
        >
          🏠 Home
        </button>
        <span aria-hidden="true">›</span>
        <button
          onClick={() => router.push('/games')}
          aria-label="Navigate to games"
          className="hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded"
          style={{ padding: `clamp(2px, 0.2vh, 4px)` }}
        >
          🎮 Games
        </button>
        <span aria-hidden="true">›</span>
        <button
          onClick={() => router.push(`/games/${lobby.gameType}/lobbies`)}
          aria-label="Navigate to Yahtzee lobbies"
          className="hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded"
          style={{ padding: `clamp(2px, 0.2vh, 4px)` }}
        >
          🎲 Yahtzee
        </button>
        <span aria-hidden="true">›</span>
        <span className="text-white font-semibold">{lobby.code}</span>
      </div>

      {/* Lobby Header */}
      <div className="card" style={{ marginBottom: `clamp(12px, 1.2vh, 20px)` }}>
        <div
          className="flex flex-col sm:flex-row justify-between items-start sm:items-center"
          style={{
            gap: `clamp(12px, 1.2vw, 20px)`,
            marginBottom: `clamp(12px, 1.2vh, 20px)`,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1
              className="font-bold truncate"
              style={{ fontSize: `clamp(20px, 2vw, 32px)` }}
            >
              {lobby.name}
            </h1>
            <p
              className="text-gray-600 dark:text-gray-400"
              style={{ fontSize: `clamp(12px, 1.2vw, 16px)` }}
            >
              Code: <span className="font-mono font-bold" style={{ fontSize: `clamp(13px, 1.3vw, 18px)` }}>{lobby.code}</span>
            </p>
          </div>
          <div
            className="flex items-center w-full sm:w-auto"
            style={{ gap: `clamp(6px, 0.6vw, 10px)` }}
          >
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
        <div
          className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-blue-300 dark:border-blue-600 rounded-lg"
          style={{
            borderWidth: `clamp(1.5px, 0.15vw, 2.5px)`,
            padding: `clamp(12px, 1.2vh, 20px)`,
          }}
        >
          <div
            className="flex flex-col"
            style={{ gap: `clamp(10px, 1vw, 16px)` }}
          >
            <div>
              <p
                className="font-semibold text-blue-700 dark:text-blue-300"
                style={{
                  fontSize: `clamp(11px, 1vw, 14px)`,
                  marginBottom: `clamp(3px, 0.3vh, 5px)`,
                }}
              >
                🔗 Invite Friends
              </p>
              <p
                className="text-blue-600 dark:text-blue-400"
                style={{ fontSize: `clamp(10px, 0.9vw, 12px)` }}
              >
                Share this link with friends to invite them to this lobby
              </p>
            </div>
            <div
              className="flex flex-col sm:flex-row items-stretch sm:items-center"
              style={{ gap: `clamp(6px, 0.6vw, 10px)` }}
            >
              <input
                type="text"
                readOnly
                value={typeof window !== 'undefined' ? `${window.location.origin}/lobby/join/${lobby.code}` : ''}
                aria-label="Invite link"
                className="flex-1 bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-600 rounded-lg font-mono focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
                style={{
                  padding: `clamp(6px, 0.6vh, 10px) clamp(10px, 1vw, 16px)`,
                  fontSize: `clamp(10px, 0.9vw, 14px)`,
                }}
              />
              <button
                onClick={handleCopyInvite}
                aria-label="Copy invite link to clipboard"
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors whitespace-nowrap focus-visible:ring-4 focus-visible:ring-blue-400 focus-visible:outline-none"
                style={{
                  padding: `clamp(6px, 0.6vh, 10px) clamp(12px, 1.2vw, 20px)`,
                }}
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
