import { useState } from 'react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from '@/components/LoadingSpinner'
import GameIcon from '@/components/GameIcon'
import { Icon } from '@/components/icons'
import { getGameMetadata } from '@/lib/game-catalog'
import { getGameLobbiesRoute } from '@/lib/public-game-access'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { useTranslation, type TranslationKeys } from '@/lib/i18n-helpers'
import { useGuest } from '@/contexts/GuestContext'

type ViewerMode = 'anonymous' | 'authenticated' | 'guest'

interface LastGamePlayer {
  userId?: string
  isWinner?: boolean
  user?: { username?: string | null } | null
}

interface ReopenTablePanelProps {
  lobby: {
    code?: unknown
    gameType?: unknown
    isPrivate?: unknown
    [key: string]: unknown
  }
  lastGame: { status?: unknown; players?: unknown } | null
  viewerMode: ViewerMode
  /** The table is open now – reopened by this visitor, or by someone a moment earlier. */
  onTableOpen: (reopenedHere: boolean) => void
  onTooOld: () => void
}

function lastResultKey(status: unknown, winner: LastGamePlayer | undefined): TranslationKeys | null {
  if (status === 'finished') return winner ? 'lobby.reopen.lastGameWinner' : 'lobby.reopen.lastGameDraw'
  if (status === 'abandoned') return 'lobby.reopen.lastGameUnfinished'
  if (status === 'cancelled') return 'lobby.reopen.lastGameNotStarted'
  return null
}

export default function ReopenTablePanel({ lobby, lastGame, viewerMode, onTableOpen, onTooOld }: ReopenTablePanelProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const { setGuestMode } = useGuest()
  const [guestName, setGuestName] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const code = typeof lobby.code === 'string' ? lobby.code : ''
  const gameType = typeof lobby.gameType === 'string' ? lobby.gameType : null
  const gameMeta = gameType ? getGameMetadata(gameType) : null
  const gameName = gameMeta ? t(`games.${gameMeta.translationKey}.name` as TranslationKeys) : t('lobby.gameUnknown')
  const requiresPassword = lobby.isPrivate === true
  const isAnonymousViewer = viewerMode === 'anonymous'
  const players = Array.isArray(lastGame?.players) ? (lastGame.players as LastGamePlayer[]) : []
  const winner = players.find((player) => player.isWinner)
  const playerName = (player: LastGamePlayer | undefined) => player?.user?.username || t('game.ui.player')
  const resultKey = lastResultKey(lastGame?.status, winner)
  const canSubmit = !submitting && (!isAnonymousViewer || guestName.trim().length >= 2)

  const reopen = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      if (isAnonymousViewer) {
        try {
          await setGuestMode(guestName.trim())
        } catch (guestError) {
          const translationKey = (guestError as { translationKey?: string })?.translationKey
          setError(t((translationKey ?? 'guest.startFailed') as TranslationKeys))
          return
        }
      }

      const res = await fetchWithGuest(`/api/lobby/${code}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requiresPassword ? { password } : {}),
      })
      const data = await res.json().catch(() => null)

      if (res.ok) {
        onTableOpen(true)
        return
      }
      if (res.status === 429) {
        setError(t('errors.tooManyRequests'))
        return
      }

      switch (data?.code) {
        case 'LOBBY_NOT_CLOSED':
          onTableOpen(false)
          return
        case 'LOBBY_TOO_OLD':
        case 'GAME_TYPE_UNAVAILABLE':
          onTooOld()
          return
        case 'LOBBY_ALREADY_OPEN':
          if (typeof data.lobbyCode === 'string') {
            router.push(`/lobby/${data.lobbyCode}`)
            return
          }
          break
        case 'KICKED_FROM_LOBBY':
          setError(t('lobby.joinSection.kickedCannotRejoin'))
          return
        case 'INVALID_PASSWORD':
          setError(t('lobby.joinSection.wrongPassword'))
          return
      }
      setError(t('lobby.reopen.failed'))
    } catch {
      setError(t('lobby.reopen.failed'))
    } finally {
      setSubmitting(false)
    }
  }

  const submitOnEnter = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') void reopen()
  }

  return (
    <div className="mx-auto w-full max-w-2xl animate-scale-in">
      <div className="bd-card relative overflow-hidden p-6 text-center sm:p-8">
        <div className="bd-dot-grid pointer-events-none absolute inset-0 opacity-35" />
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-bd-sun/25" />
        <div className="pointer-events-none absolute -bottom-14 left-10 h-28 w-28 rotate-12 rounded-[1.75rem] bg-bd-lav/20" />

        <div className="relative">
          <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl border-2 border-bd-ink bg-bd-sun shadow-bd-ink-4">
            {gameMeta ? (
              <GameIcon gameId={gameMeta.svgId} accentColor="var(--bd-ink-on-accent)" detailColor="var(--bd-sun)" size={34} variant="bare" />
            ) : (
              <Icon name="gamepad" size={34} tone="on-accent" />
            )}
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
            <span className="bd-chip border-bd-ink bg-bd-ink font-mono text-bd-bg">{code}</span>
            <span className="bd-chip bd-chip-mint">{gameName}</span>
          </div>

          <h1
            className="mb-2 text-2xl font-extrabold tracking-[-0.01em] text-bd-ink sm:text-3xl"
            style={{ fontFamily: 'var(--bd-font-display)' }}
          >
            {t('lobby.reopen.title')}
          </h1>
          <p className="mx-auto mb-6 max-w-lg text-sm leading-6 text-bd-ink-soft sm:text-base">
            {t('lobby.reopen.description')}
          </p>

          {resultKey && (
            <div className="mb-6 rounded-xl border border-bd-line bg-bd-card-warm px-4 py-3 text-left">
              <p className="text-xs font-bold uppercase tracking-wide text-bd-ink-muted">{t('lobby.reopen.lastGame')}</p>
              <p className="mt-1 text-sm font-bold text-bd-ink">
                {resultKey === 'lobby.reopen.lastGameWinner' ? t(resultKey, { name: playerName(winner) }) : t(resultKey)}
              </p>
              {players.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {players.map((player, index) => (
                    <li
                      key={player.userId ?? index}
                      className={`inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                        player.isWinner ? 'border-bd-sun/60 bg-bd-sun/15 text-bd-ink' : 'border-bd-line bg-bd-bg text-bd-ink-soft'
                      }`}
                    >
                      {player.isWinner && <Icon name="crown" size={12} tone="premium" />}
                      <span className="truncate">{playerName(player)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {isAnonymousViewer && (
            <div className="mb-4 text-left">
              <label htmlFor="reopen-guest-name" className="mb-2 block text-sm font-semibold text-bd-ink">
                {t('guest.enterName')}
              </label>
              <input
                id="reopen-guest-name"
                type="text"
                className="bd-input"
                placeholder={t('guest.namePlaceholder')}
                value={guestName}
                onChange={(event) => setGuestName(event.target.value)}
                onKeyDown={requiresPassword ? undefined : submitOnEnter}
                autoFocus={!requiresPassword}
                disabled={submitting}
                maxLength={20}
              />
            </div>
          )}

          {requiresPassword && (
            <div className="mb-6 text-left">
              <label htmlFor="reopen-password" className="mb-2 block text-sm font-semibold text-bd-ink">
                <Icon name="lock" size={14} /> {t('lobby.joinSection.password')}
              </label>
              <input
                id="reopen-password"
                type="password"
                className="bd-input"
                placeholder={t('lobby.joinSection.passwordPlaceholder')}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={submitOnEnter}
                autoFocus={!isAnonymousViewer}
                disabled={submitting}
              />
            </div>
          )}

          {error && (
            <div role="alert" className="mb-6 animate-shake rounded-xl border border-bd-coral/35 bg-bd-coral/10 px-4 py-3 text-bd-coral-text">
              <div className="flex items-center gap-2">
                <Icon name="warning" size={18} />
                <p className="text-sm font-semibold">{error}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => router.push(getGameLobbiesRoute(gameType) ?? '/games')}
              className="bd-btn bd-btn-ghost order-2 w-full justify-center sm:order-1"
              disabled={submitting}
            >
              {t('lobby.backToGames')}
            </button>
            <button
              type="button"
              onClick={() => void reopen()}
              disabled={!canSubmit}
              className="bd-btn bd-btn-primary order-1 w-full justify-center disabled:cursor-not-allowed disabled:opacity-60 sm:order-2"
            >
              <span className="inline-flex items-center justify-center gap-2">
                {submitting ? <LoadingSpinner /> : <Icon name="refresh" size={18} />}
                <span>{t('lobby.reopen.reopen')}</span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
