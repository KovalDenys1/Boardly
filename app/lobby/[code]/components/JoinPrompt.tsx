import LoadingSpinner from '@/components/LoadingSpinner'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n-helpers'

type JoinViewerMode = 'anonymous' | 'authenticated' | 'guest'

interface JoinPromptProps {
  lobby: {
    code?: string
    name?: string
    isPrivate?: boolean
    gameType?: string
    [key: string]: unknown
  }
  viewerMode: JoinViewerMode
  guestName: string
  setGuestName: (name: string) => void
  password: string
  setPassword: (password: string) => void
  error: string | null
  isJoining: boolean
  onJoin: () => void
  onJoinAsGuest: () => void
  onLogin: () => void
  onRegister: () => void
}

export default function JoinPrompt({
  lobby,
  viewerMode,
  guestName,
  setGuestName,
  password,
  setPassword,
  error,
  isJoining,
  onJoin,
  onJoinAsGuest,
  onLogin,
  onRegister,
}: JoinPromptProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const isAnonymousViewer = viewerMode === 'anonymous'
  const requiresPassword = Boolean(lobby.isPrivate)
  const primaryAction = isAnonymousViewer ? onJoinAsGuest : onJoin
  const primaryActionLabel = isAnonymousViewer
    ? t('guest.playAsGuest')
    : t('lobby.joinSection.join')
  const primaryActionDisabled =
    isJoining || (isAnonymousViewer && guestName.trim().length < 2)

  return (
    <div className="max-w-2xl mx-auto w-full animate-scale-in">
      <div className="rounded-2xl border border-white/20 bg-slate-900/55 backdrop-blur-xl p-6 sm:p-8 text-center shadow-2xl">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/10 border border-white/20 mb-5">
          <span className="text-3xl">🎮</span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
          <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-cyan-500/20 text-cyan-100 border border-cyan-300/30 font-mono">
            {lobby.code}
          </span>
          <span
            className={`text-xs font-semibold px-2 py-1 rounded-lg border ${
              lobby.isPrivate
                ? 'bg-rose-500/20 text-rose-100 border-rose-300/35'
                : 'bg-emerald-500/20 text-emerald-100 border-emerald-300/35'
            }`}
          >
            {lobby.isPrivate ? t('lobby.privateLobby') : t('lobby.publicLobby')}
          </span>
        </div>

        <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">{t('lobby.joinSection.title')}</h2>
        <p className="text-white/65 text-sm sm:text-base mb-6">
          {lobby.isPrivate
            ? t('lobby.joinPromptPrivate', { lobby: lobby.name })
            : t('lobby.joinPromptPublic', { lobby: lobby.name })}
        </p>

        {isAnonymousViewer && (
          <div className="text-left mb-4">
            <label className="block font-semibold text-white/80 text-sm mb-2">
              {t('guest.enterName')}
            </label>
            <input
              type="text"
              className="w-full bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-white/30 px-4 py-3 focus:ring-2 focus:ring-white/40 focus:border-transparent transition-all focus-visible:outline-none"
              placeholder={t('guest.namePlaceholder')}
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !requiresPassword) {
                  primaryAction()
                }
              }}
              autoFocus={!requiresPassword}
              disabled={isJoining}
              maxLength={20}
            />
            <p className="text-white/45 text-xs mt-2">
              {t('guest.nameDescription')}
            </p>
          </div>
        )}

        {requiresPassword && (
          <div className="text-left mb-6">
            <label className="block font-semibold text-white/80 text-sm mb-2">
              🔒 {t('lobby.joinSection.password')}
            </label>
            <input
              type="password"
              className="w-full bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-white/30 px-4 py-3 focus:ring-2 focus:ring-white/40 focus:border-transparent transition-all focus-visible:outline-none"
              placeholder={t('lobby.joinSection.passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  primaryAction()
                }
              }}
              autoFocus
              disabled={isJoining}
            />
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-400/30 text-red-200 rounded-xl px-4 py-3 mb-6 animate-shake">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              <p className="font-semibold text-sm">{error}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => router.push(lobby?.gameType ? `/games/${lobby.gameType}/lobbies` : '/games')}
            className="w-full px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-semibold border border-white/20 transition-all disabled:opacity-60"
            disabled={isJoining}
          >
            {t('lobby.backToGames')}
          </button>
          <button
            type="button"
            onClick={primaryAction}
            disabled={primaryActionDisabled}
            className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl font-bold shadow-xl hover:brightness-110 transition-all disabled:cursor-not-allowed disabled:opacity-70"
          >
            <span className="inline-flex items-center justify-center gap-2">
              {isJoining ? <LoadingSpinner /> : <span>🚀</span>}
              <span>{primaryActionLabel}</span>
            </span>
          </button>
        </div>

        {isAnonymousViewer && (
          <>
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-slate-900/80 text-white/45">or</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={onLogin}
                disabled={isJoining}
                className="w-full px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-semibold border border-white/20 transition-all disabled:opacity-60"
              >
                {t('auth.login.submit')}
              </button>
              <button
                type="button"
                onClick={onRegister}
                disabled={isJoining}
                className="w-full px-4 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-semibold border border-white/20 transition-all disabled:opacity-60"
              >
                {t('auth.register.title')}
              </button>
            </div>
          </>
        )}

        <p className="text-white/45 text-xs mt-4">
          💡 {t('lobby.joinPromptHint')}
        </p>
      </div>
    </div>
  )
}
