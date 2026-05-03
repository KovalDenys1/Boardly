import { useMemo, useState, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { showToast } from '@/lib/i18n-toast'
import { getGameMetadata } from '@/lib/game-catalog'
import { useTranslation } from '@/lib/i18n-helpers'
import { getGameLobbiesRoute } from '@/lib/public-game-access'
import type { Game, Lobby } from '@/types/game'

interface LobbyInfoProps {
  lobby: Lobby
  game: Game | null
  soundEnabled: boolean
  canEditSettings?: boolean
  onUpdateSettings?: (updates: {
    maxPlayers?: number
    turnTimer?: number
    allowSpectators?: boolean
  }) => Promise<unknown>
  onSoundToggle: () => void
  onLeave: () => void
  /** 'standalone' = sticky card (default). 'header' = flat, rendered inside a parent card. */
  variant?: 'standalone' | 'header'
}

type EditableSettingKey = 'maxPlayers' | 'turnTimer' | 'allowSpectators'

export default function LobbyInfo({
  lobby,
  game,
  soundEnabled,
  canEditSettings = false,
  onUpdateSettings,
  onSoundToggle,
  onLeave,
  variant = 'standalone',
}: LobbyInfoProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const gameMeta = lobby.gameType ? getGameMetadata(lobby.gameType) : null
  const currentPlayers = Array.isArray(game?.players) ? game.players.length : 0
  const maxPlayers = typeof lobby?.maxPlayers === 'number' ? lobby.maxPlayers : 0
  const isPrivate = Boolean(lobby?.isPrivate)
  const isPlaying = game?.status === 'playing'
  const creatorName = lobby?.creator?.username || t('lobby.ownerFallback')
  const spectatorsLabel = lobby?.allowSpectators
    ? t('lobby.spectators', {
        count: lobby?.spectatorCount ?? 0,
      })
    : t('game.ui.spectatorsDisabled')
  const canEditLobbySettings =
    Boolean(canEditSettings && onUpdateSettings) && !isPlaying
  const [activeSettingEditor, setActiveSettingEditor] = useState<EditableSettingKey | null>(null)
  const [updatingSetting, setUpdatingSetting] = useState<EditableSettingKey | null>(null)

  const turnTimerOptions = useMemo(() => {
    const baseOptions = [30, 60, 90, 120, 150, 180]
    if (typeof lobby?.turnTimer === 'number' && !baseOptions.includes(lobby.turnTimer)) {
      return [...baseOptions, lobby.turnTimer].sort((a, b) => a - b)
    }
    return baseOptions
  }, [lobby?.turnTimer])

  const maxPlayersOptions = useMemo(() => {
    const minByGameType = Math.max(2, gameMeta?.minPlayers ?? 2)
    const minValue = Math.max(minByGameType, currentPlayers)
    const maxByGameType = Math.min(10, gameMeta?.maxPlayers ?? 10)
    const maxValue = Math.max(minValue, maxByGameType)
    return Array.from({ length: maxValue - minValue + 1 }, (_, index) => minValue + index)
  }, [currentPlayers, gameMeta?.maxPlayers, gameMeta?.minPlayers])

  const handleCopyInvite = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard
        .writeText(`${window.location.origin}/lobby/${lobby.code}`)
        .then(() => showToast.success('toast.linkCopied'))
        .catch(() => showToast.error('toast.error'))
    }
  }

  const getInviteUrl = () =>
    typeof window !== 'undefined' ? `${window.location.origin}/lobby/${lobby.code}` : ''

  const handleShareTelegram = () => {
    const url = getInviteUrl()
    window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(`Join my ${gameMeta?.name ?? 'game'} lobby on Boardly!`)}`, '_blank')
  }

  const handleShareWhatsApp = () => {
    const url = getInviteUrl()
    window.open(`https://wa.me/?text=${encodeURIComponent(`Join my ${gameMeta?.name ?? 'game'} lobby on Boardly! ${url}`)}`, '_blank')
  }

  const handleShareDiscord = () => {
    const url = getInviteUrl()
    navigator.clipboard
      .writeText(url)
      .then(() => showToast.success('toast.linkCopied'))
      .catch(() => showToast.error('toast.error'))
  }

  const openEditor = (key: EditableSettingKey) => {
    if (!canEditLobbySettings) {
      return
    }
    setActiveSettingEditor((prev) => (prev === key ? null : key))
  }

  const handleCardKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    key: EditableSettingKey,
  ) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }
    event.preventDefault()
    openEditor(key)
  }

  const applySettingUpdate = async (
    key: EditableSettingKey,
    updates: { maxPlayers?: number; turnTimer?: number; allowSpectators?: boolean },
  ) => {
    if (!onUpdateSettings) return

    setUpdatingSetting(key)
    try {
      await onUpdateSettings(updates)
      setActiveSettingEditor(null)
      showToast.success('profile.settings.saved')
    } catch (error) {
      showToast.errorFrom(error, 'toast.error')
    } finally {
      setUpdatingSetting(null)
    }
  }

  const inner = (
      <div className={variant === 'header' ? 'px-4 py-4 sm:px-6 sm:py-5' : 'bd-card px-4 py-4 sm:px-6 sm:py-5'}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-[11px] text-bd-ink-muted sm:text-xs">
              <button
                onClick={() => router.push('/')}
                aria-label={t('common.goHome')}
                className="rounded px-1 py-0.5 transition-colors hover:text-bd-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bd-ink/30"
              >
                🏠 {t('breadcrumbs.home')}
              </button>
              <span aria-hidden="true" className="text-bd-ink-muted/55">
                ›
              </span>
              <button
                onClick={() => router.push('/games')}
                aria-label={t('games.title')}
                className="rounded px-1 py-0.5 transition-colors hover:text-bd-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bd-ink/30"
              >
                🎮 {t('breadcrumbs.games')}
              </button>
              <span aria-hidden="true" className="text-bd-ink-muted/55">
                ›
              </span>
              <button
                onClick={() => router.push(getGameLobbiesRoute(lobby?.gameType) ?? '/games')}
                aria-label={t('lobby.activeLobbies')}
                className="rounded px-1 py-0.5 transition-colors hover:text-bd-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bd-ink/30"
              >
                {gameMeta?.icon ?? '🎮'} {gameMeta?.name ?? 'Game'}
              </button>
            </nav>

            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h1
                className="truncate text-xl font-extrabold tracking-[-0.01em] text-bd-ink sm:text-3xl"
                style={{ fontFamily: 'var(--bd-font-display)' }}
              >
                {lobby.name}
              </h1>
              <span className="bd-chip border-bd-ink bg-bd-ink font-mono text-bd-bg">
                {lobby.code}
              </span>
              <span
                className={`bd-chip ${
                  isPrivate
                    ? 'border-bd-coral/45 bg-bd-coral/15 text-bd-coral-deep'
                    : 'bd-chip-mint'
                }`}
              >
                {isPrivate ? t('lobby.privateLobby') : t('lobby.publicLobby')}
              </span>
              <span className="bd-chip">
                {isPlaying ? t('lobby.status.playing') : t('lobby.status.waiting')}
              </span>
            </div>

            <p className="truncate text-xs text-bd-ink-soft sm:text-sm">
              👤 {creatorName}
            </p>
          </div>

          <div className="flex w-full lg:w-auto flex-wrap sm:flex-nowrap items-center gap-2">
            <button
              onClick={handleCopyInvite}
              className="bd-btn bd-btn-soft min-w-0 flex-1 justify-center px-3 py-2 text-xs sm:text-sm lg:flex-none"
            >
              <span className="shrink-0">🔗</span>
              <span className="truncate">{t('game.ui.copyInvite')}</span>
            </button>
            <button
              onClick={onSoundToggle}
              aria-label={soundEnabled ? t('game.ui.disableSound') : t('game.ui.enableSound')}
              aria-pressed={soundEnabled}
              className="bd-btn bd-btn-soft shrink-0 px-3 py-2"
              title={soundEnabled ? t('game.ui.disableSound') : t('game.ui.enableSound')}
            >
              {soundEnabled ? '🔊' : '🔇'}
            </button>
            <button
              onClick={onLeave}
              aria-label={t('game.ui.leave')}
              className="inline-flex shrink-0 items-center justify-center gap-1 rounded-xl border-[1.5px] border-bd-coral/45 bg-bd-coral/15 px-3 py-2 text-sm font-semibold text-bd-coral-deep transition-all hover:bg-bd-coral hover:text-white sm:px-4"
            >
              <span aria-hidden>🚪</span>
              <span className="hidden sm:inline">{t('game.ui.leave')}</span>
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div
            className={`rounded-xl border border-bd-line bg-bd-bg2 px-3 py-2 ${
              canEditLobbySettings
                ? 'cursor-pointer transition-colors hover:border-bd-ink hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bd-ink/30'
                : ''
            }`}
            onClick={() => openEditor('maxPlayers')}
            onKeyDown={(event) => handleCardKeyDown(event, 'maxPlayers')}
            role={canEditLobbySettings ? 'button' : undefined}
            tabIndex={canEditLobbySettings ? 0 : undefined}
            aria-label={
              canEditLobbySettings ? t('lobby.create.maxPlayers') : undefined
            }
          >
            <p className="text-[11px] font-bold uppercase tracking-wider text-bd-ink-muted">{t('game.ui.playersInLobbyTitle')}</p>
            <p className="mt-1 break-words text-sm font-semibold text-bd-ink">
              {t('lobby.playerOccupancy', { current: currentPlayers, max: maxPlayers })}
            </p>
          </div>
          <div
            className={`rounded-xl border border-bd-line bg-bd-bg2 px-3 py-2 ${
              canEditLobbySettings
                ? 'cursor-pointer transition-colors hover:border-bd-ink hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bd-ink/30'
                : ''
            }`}
            onClick={() => openEditor('turnTimer')}
            onKeyDown={(event) => handleCardKeyDown(event, 'turnTimer')}
            role={canEditLobbySettings ? 'button' : undefined}
            tabIndex={canEditLobbySettings ? 0 : undefined}
            aria-label={canEditLobbySettings ? t('game.ui.timeLimit') : undefined}
          >
            <p className="text-[11px] font-bold uppercase tracking-wider text-bd-ink-muted">{t('game.ui.timeLimit')}</p>
            <p className="mt-1 break-words text-sm font-semibold text-bd-ink">
              {lobby?.turnTimer ? `${lobby.turnTimer}s ${t('game.ui.perTurn')}` : '—'}
            </p>
          </div>
          <div
            className={`rounded-xl border border-bd-line bg-bd-bg2 px-3 py-2 ${
              canEditLobbySettings
                ? 'cursor-pointer transition-colors hover:border-bd-ink hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bd-ink/30'
                : ''
            }`}
            onClick={() => openEditor('allowSpectators')}
            onKeyDown={(event) => handleCardKeyDown(event, 'allowSpectators')}
            role={canEditLobbySettings ? 'button' : undefined}
            tabIndex={canEditLobbySettings ? 0 : undefined}
            aria-label={canEditLobbySettings ? t('game.ui.spectatorsLabel') : undefined}
          >
            <p className="text-[11px] font-bold uppercase tracking-wider text-bd-ink-muted">{t('game.ui.spectatorsLabel')}</p>
            <p className="mt-1 break-words text-sm font-semibold text-bd-ink">{spectatorsLabel}</p>
          </div>
        </div>

        {!isPlaying && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-bd-ink-muted mr-1">Share:</span>
            <button
              onClick={handleShareTelegram}
              className="inline-flex items-center gap-1.5 rounded-xl border border-bd-line bg-bd-card-warm px-3 py-1.5 text-xs font-semibold text-bd-ink transition-colors hover:border-bd-ink hover:bg-white"
            >
              📱 Telegram
            </button>
            <button
              onClick={handleShareWhatsApp}
              className="inline-flex items-center gap-1.5 rounded-xl border border-bd-line bg-bd-card-warm px-3 py-1.5 text-xs font-semibold text-bd-ink transition-colors hover:border-bd-ink hover:bg-white"
            >
              💬 WhatsApp
            </button>
            <button
              onClick={handleShareDiscord}
              className="inline-flex items-center gap-1.5 rounded-xl border border-bd-line bg-bd-card-warm px-3 py-1.5 text-xs font-semibold text-bd-ink transition-colors hover:border-bd-ink hover:bg-white"
              title="Copy link for Discord"
            >
              🎮 Discord
            </button>
          </div>
        )}

        {canEditLobbySettings && activeSettingEditor && (
          <div className="mt-3 rounded-xl border border-bd-mint/45 bg-bd-mint/10 px-3 py-3">
            {activeSettingEditor === 'maxPlayers' && (
              <>
                <p className="mb-2 text-xs font-semibold text-bd-mint-deep">
                  {t('lobby.create.maxPlayers')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {maxPlayersOptions.map((value) => (
                    <button
                      key={value}
                      type="button"
                      disabled={updatingSetting === 'maxPlayers' || value === maxPlayers}
                      onClick={() => void applySettingUpdate('maxPlayers', { maxPlayers: value })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        value === maxPlayers
                          ? 'border-bd-ink bg-bd-ink text-bd-bg'
                          : 'border-bd-line bg-white text-bd-ink hover:border-bd-ink'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </>
            )}

            {activeSettingEditor === 'turnTimer' && (
              <>
                <p className="mb-2 text-xs font-semibold text-bd-mint-deep">
                  {t('game.ui.timeLimit')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {turnTimerOptions.map((seconds) => (
                    <button
                      key={seconds}
                      type="button"
                      disabled={updatingSetting === 'turnTimer' || seconds === lobby?.turnTimer}
                      onClick={() => void applySettingUpdate('turnTimer', { turnTimer: seconds })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        seconds === lobby?.turnTimer
                          ? 'border-bd-ink bg-bd-ink text-bd-bg'
                          : 'border-bd-line bg-white text-bd-ink hover:border-bd-ink'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {seconds}s
                    </button>
                  ))}
                </div>
              </>
            )}

            {activeSettingEditor === 'allowSpectators' && (
              <>
                <p className="mb-2 text-xs font-semibold text-bd-mint-deep">
                  {t('game.ui.spectatorsLabel')}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={updatingSetting === 'allowSpectators' || lobby?.allowSpectators === true}
                    onClick={() => void applySettingUpdate('allowSpectators', { allowSpectators: true })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      lobby?.allowSpectators
                        ? 'border-bd-ink bg-bd-ink text-bd-bg'
                        : 'border-bd-line bg-white text-bd-ink hover:border-bd-ink'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    Enabled
                  </button>
                  <button
                    type="button"
                    disabled={updatingSetting === 'allowSpectators' || lobby?.allowSpectators === false}
                    onClick={() => void applySettingUpdate('allowSpectators', { allowSpectators: false })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      lobby?.allowSpectators === false
                        ? 'border-bd-ink bg-bd-ink text-bd-bg'
                        : 'border-bd-line bg-white text-bd-ink hover:border-bd-ink'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    Disabled
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
  )

  if (variant === 'header') {
    return (
      <div className="flex-shrink-0 border-b border-bd-line bg-white">
        {inner}
      </div>
    )
  }

  return (
    <div className="sticky top-0 z-10 flex-shrink-0 pb-3 pt-2">
      {inner}
    </div>
  )
}
