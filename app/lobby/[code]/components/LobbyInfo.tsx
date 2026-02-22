import { useRouter } from 'next/navigation'
import { showToast } from '@/lib/i18n-toast'
import { getGameMetadata } from '@/lib/game-registry'
import { useTranslation } from '@/lib/i18n-helpers'

interface LobbyInfoProps {
  lobby: any
  soundEnabled: boolean
  onSoundToggle: () => void
  onLeave: () => void
}

export default function LobbyInfo({ lobby, soundEnabled, onSoundToggle, onLeave }: LobbyInfoProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const gameMeta = lobby.gameType ? getGameMetadata(lobby.gameType) : null

  const handleCopyInvite = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard
        .writeText(`${window.location.origin}/lobby/join/${lobby.code}`)
        .then(() => showToast.success('toast.linkCopied'))
        .catch(() => showToast.error('toast.error'))
    }
  }

  return (
    <div className="flex-shrink-0 sticky top-0 z-10 bg-gradient-to-r from-white/10 to-white/5 backdrop-blur-xl border-b border-white/20 px-3 sm:px-6 py-3.5 sm:py-4 shadow-lg">
      {/* Breadcrumbs */}
      <nav className="flex flex-wrap items-center gap-1.5 text-[11px] sm:text-xs text-white/60 mb-2.5 sm:mb-3">
        <button
          onClick={() => router.push('/')}
          aria-label={t('common.goHome')}
          className="hover:text-white transition-colors rounded px-1 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        >
          🏠 {t('breadcrumbs.home')}
        </button>
        <span aria-hidden="true" className="text-white/30">›</span>
        <button
          onClick={() => router.push('/games')}
          aria-label={t('games.title')}
          className="hover:text-white transition-colors rounded px-1 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        >
          🎮 {t('breadcrumbs.games')}
        </button>
        <span aria-hidden="true" className="text-white/30">›</span>
        <button
          onClick={() => router.push(`/games/${lobby.gameType}/lobbies`)}
          aria-label={t('lobby.activeLobbies')}
          className="hidden sm:inline-flex hover:text-white transition-colors rounded px-1 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        >
          {gameMeta?.icon ?? '🎮'} {gameMeta?.name ?? 'Game'}
        </button>
        <span aria-hidden="true" className="hidden sm:inline text-white/30">›</span>
        <span className="text-white/80 font-semibold tracking-wide">{lobby.code}</span>
      </nav>

      {/* Lobby Header Row */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-2xl font-extrabold text-white truncate drop-shadow-lg">
            {lobby.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1">
            <p className="text-white/50 text-xs sm:text-sm">
              {t('game.ui.code')}: <span className="font-mono font-bold text-white/80 text-sm tracking-wider">{lobby.code}</span>
            </p>
            <button
              onClick={handleCopyInvite}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg transition-all text-[11px] sm:text-xs font-semibold text-white max-w-full"
            >
              <span className="shrink-0">🔗</span>
              <span className="truncate">{t('game.ui.copyInvite')}</span>
            </button>
          </div>
        </div>
        <div className="flex w-full sm:w-auto items-center gap-2">
          <button
            onClick={onSoundToggle}
            aria-label={soundEnabled ? t('game.ui.disableSound') : t('game.ui.enableSound')}
            aria-pressed={soundEnabled}
            className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all duration-200 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none flex-1 sm:flex-none"
            title={soundEnabled ? t('game.ui.disableSound') : t('game.ui.enableSound')}
          >
            {soundEnabled ? '🔊' : '🔇'}
          </button>
          <button
            onClick={onLeave}
            aria-label={t('game.ui.leave')}
            className="px-4 py-2 bg-red-500/30 hover:bg-red-500/50 text-white rounded-xl font-medium text-sm transition-all duration-200 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none flex-1 sm:flex-none"
          >
            🚪 {t('game.ui.leave')}
          </button>
        </div>
      </div>
    </div>
  )
}
