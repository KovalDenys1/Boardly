import LoadingSpinner from '@/components/LoadingSpinner'
import { useRouter } from 'next/navigation'
import { getGameMetadata } from '@/lib/game-catalog'
import { useTranslation } from '@/lib/i18n-helpers'
import { getGameLobbiesRoute } from '@/lib/public-game-access'

type JoinViewerMode = 'anonymous' | 'authenticated' | 'guest'

interface JoinPromptProps {
  lobby: {
    code?: string
    name?: string
    isPrivate?: boolean
    gameType?: string
    allowSpectators?: boolean
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
  onWatchAsSpectator?: () => void
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
  onWatchAsSpectator,
}: JoinPromptProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const gameMeta = typeof lobby.gameType === 'string' ? getGameMetadata(lobby.gameType) : null
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
      <div className="bd-card relative overflow-hidden p-6 text-center sm:p-8">
        <div className="bd-dot-grid pointer-events-none absolute inset-0 opacity-35" />
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-bd-sun/25" />
        <div className="pointer-events-none absolute -bottom-14 left-10 h-28 w-28 rotate-12 rounded-[1.75rem] bg-bd-lav/20" />

        <div className="relative">
          <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl border-2 border-bd-ink bg-bd-sun text-3xl shadow-bd-ink-4">
            <span>{gameMeta?.icon ?? '🎮'}</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
            <span className="bd-chip border-bd-ink bg-bd-ink font-mono text-bd-bg">
              {lobby.code}
            </span>
            <span
              className={`bd-chip ${
                lobby.isPrivate
                  ? 'border-bd-coral/50 bg-bd-coral/15 text-bd-coral-deep'
                  : 'bd-chip-mint'
              }`}
            >
              {lobby.isPrivate ? t('lobby.privateLobby') : t('lobby.publicLobby')}
            </span>
          </div>

        <h2
          className="mb-2 text-2xl font-extrabold tracking-[-0.01em] text-bd-ink sm:text-3xl"
          style={{ fontFamily: 'var(--bd-font-display)' }}
        >
          {t('lobby.joinSection.title')}
        </h2>
        <p className="mx-auto mb-6 max-w-lg text-sm leading-6 text-bd-ink-soft sm:text-base">
          {lobby.isPrivate
            ? t('lobby.joinPromptPrivate', { lobby: lobby.name })
            : t('lobby.joinPromptPublic', { lobby: lobby.name })}
        </p>

        {isAnonymousViewer && (
          <div className="text-left mb-4">
            <label className="mb-2 block text-sm font-semibold text-bd-ink">
              {t('guest.enterName')}
            </label>
            <input
              type="text"
              className="bd-input"
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
            <p className="mt-2 text-xs text-bd-ink-muted">
              {t('guest.nameDescription')}
            </p>
          </div>
        )}

        {requiresPassword && (
          <div className="text-left mb-6">
            <label className="mb-2 block text-sm font-semibold text-bd-ink">
              🔒 {t('lobby.joinSection.password')}
            </label>
            <input
              type="password"
              className="bd-input"
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
          <div className="mb-6 animate-shake rounded-xl border border-bd-coral/35 bg-bd-coral/10 px-4 py-3 text-bd-coral-deep">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              <p className="font-semibold text-sm">{error}</p>
            </div>
            {error === 'Lobby is full' && lobby.allowSpectators && onWatchAsSpectator && (
              <button
                type="button"
                onClick={onWatchAsSpectator}
                className="mt-3 w-full rounded-xl border-2 border-bd-coral-deep bg-[var(--bd-card-warm)] px-4 py-2 text-sm font-bold text-bd-coral-deep transition-colors hover:bg-bd-coral/10"
              >
                👁 Watch as spectator instead →
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => router.push(getGameLobbiesRoute(lobby?.gameType) ?? '/games')}
            className="bd-btn bd-btn-ghost w-full justify-center"
            disabled={isJoining}
          >
            {t('lobby.backToGames')}
          </button>
          <button
            type="button"
            onClick={primaryAction}
            disabled={primaryActionDisabled}
            className="bd-btn bd-btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="inline-flex items-center justify-center gap-2">
              {isJoining ? <LoadingSpinner /> : <span>→</span>}
              <span>{primaryActionLabel}</span>
            </span>
          </button>
        </div>

        {isAnonymousViewer && (
          <>
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-bd-line"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-bd-bg px-4 text-bd-ink-muted">or</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={onLogin}
                disabled={isJoining}
                className="bd-btn bd-btn-soft w-full justify-center disabled:opacity-60"
              >
                {t('auth.login.submit')}
              </button>
              <button
                type="button"
                onClick={onRegister}
                disabled={isJoining}
                className="bd-btn bd-btn-ghost w-full justify-center disabled:opacity-60"
              >
                {t('auth.register.title')}
              </button>
            </div>
          </>
        )}

        <p className="mt-4 text-xs text-bd-ink-muted">
          💡 {t('lobby.joinPromptHint')}
        </p>
        </div>
      </div>
    </div>
  )
}
