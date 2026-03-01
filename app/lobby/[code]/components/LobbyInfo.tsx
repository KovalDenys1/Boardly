import { useMemo, useState, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { showToast } from '@/lib/i18n-toast'
import { getGameMetadata } from '@/lib/game-catalog'
import { useTranslation } from '@/lib/i18n-helpers'

interface LobbyInfoProps {
  lobby: any
  game: any
  soundEnabled: boolean
  canEditSettings?: boolean
  onUpdateSettings?: (updates: {
    maxPlayers?: number
    turnTimer?: number
    allowSpectators?: boolean
  }) => Promise<unknown>
  onSoundToggle: () => void
  onLeave: () => void
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
        .writeText(`${window.location.origin}/lobby/join/${lobby.code}`)
        .then(() => showToast.success('toast.linkCopied'))
        .catch(() => showToast.error('toast.error'))
    }
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

  return (
    <div className="flex-shrink-0 sticky top-0 z-10 pt-2 pb-3">
      <div className="rounded-2xl border border-white/20 bg-slate-900/55 backdrop-blur-xl shadow-xl px-3 sm:px-5 py-3 sm:py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <nav className="flex flex-wrap items-center gap-1.5 text-[11px] sm:text-xs text-white/65 mb-3">
              <button
                onClick={() => router.push('/')}
                aria-label={t('common.goHome')}
                className="hover:text-white transition-colors rounded px-1 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                🏠 {t('breadcrumbs.home')}
              </button>
              <span aria-hidden="true" className="text-white/30">
                ›
              </span>
              <button
                onClick={() => router.push('/games')}
                aria-label={t('games.title')}
                className="hover:text-white transition-colors rounded px-1 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                🎮 {t('breadcrumbs.games')}
              </button>
              <span aria-hidden="true" className="text-white/30">
                ›
              </span>
              <button
                onClick={() => router.push(lobby?.gameType ? `/games/${lobby.gameType}/lobbies` : '/games')}
                aria-label={t('lobby.activeLobbies')}
                className="hover:text-white transition-colors rounded px-1 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                {gameMeta?.icon ?? '🎮'} {gameMeta?.name ?? 'Game'}
              </button>
            </nav>

            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h1 className="text-lg sm:text-2xl font-extrabold text-white truncate">{lobby.name}</h1>
              <span className="font-mono text-xs sm:text-sm font-bold tracking-wider text-cyan-100 bg-cyan-500/20 border border-cyan-300/30 px-2 py-1 rounded-lg">
                {lobby.code}
              </span>
              <span
                className={`text-xs font-semibold px-2 py-1 rounded-lg ${
                  isPrivate
                    ? 'bg-rose-500/25 text-rose-100 border border-rose-300/35'
                    : 'bg-emerald-500/25 text-emerald-100 border border-emerald-300/35'
                }`}
              >
                {isPrivate ? t('lobby.privateLobby') : t('lobby.publicLobby')}
              </span>
              <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-white/10 text-white/85 border border-white/20">
                {isPlaying ? t('lobby.status.playing') : t('lobby.status.waiting')}
              </span>
            </div>

            <p className="text-xs sm:text-sm text-white/70 truncate">
              👤 {creatorName}
            </p>
          </div>

          <div className="flex w-full lg:w-auto items-center gap-2">
            <button
              onClick={handleCopyInvite}
              className="inline-flex flex-1 lg:flex-none items-center justify-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl transition-all text-xs sm:text-sm font-semibold text-white"
            >
              <span className="shrink-0">🔗</span>
              <span className="truncate">{t('game.ui.copyInvite')}</span>
            </button>
            <button
              onClick={onSoundToggle}
              aria-label={soundEnabled ? t('game.ui.disableSound') : t('game.ui.enableSound')}
              aria-pressed={soundEnabled}
              className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all duration-200 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none"
              title={soundEnabled ? t('game.ui.disableSound') : t('game.ui.enableSound')}
            >
              {soundEnabled ? '🔊' : '🔇'}
            </button>
            <button
              onClick={onLeave}
              aria-label={t('game.ui.leave')}
              className="px-4 py-2 bg-red-500/35 hover:bg-red-500/55 text-white rounded-xl font-medium text-sm transition-all duration-200 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none"
            >
              🚪 {t('game.ui.leave')}
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
          <div
            className={`rounded-xl border border-white/15 bg-white/5 px-3 py-2 ${
              canEditLobbySettings
                ? 'cursor-pointer hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70'
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
            <p className="text-[11px] uppercase tracking-wider text-white/50">{t('game.ui.playersInLobbyTitle')}</p>
            <p className="mt-1 text-sm font-semibold text-white">
              {t('lobby.playerOccupancy', { current: currentPlayers, max: maxPlayers })}
            </p>
          </div>
          <div className="rounded-xl border border-white/15 bg-white/5 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wider text-white/50">{t('game.ui.gameTypeLabel')}</p>
            <p className="mt-1 text-sm font-semibold text-white">{gameMeta?.name ?? t('lobby.gameUnknown')}</p>
          </div>
          <div
            className={`rounded-xl border border-white/15 bg-white/5 px-3 py-2 ${
              canEditLobbySettings
                ? 'cursor-pointer hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70'
                : ''
            }`}
            onClick={() => openEditor('turnTimer')}
            onKeyDown={(event) => handleCardKeyDown(event, 'turnTimer')}
            role={canEditLobbySettings ? 'button' : undefined}
            tabIndex={canEditLobbySettings ? 0 : undefined}
            aria-label={canEditLobbySettings ? t('game.ui.timeLimit') : undefined}
          >
            <p className="text-[11px] uppercase tracking-wider text-white/50">{t('game.ui.timeLimit')}</p>
            <p className="mt-1 text-sm font-semibold text-white">
              {lobby?.turnTimer ? `${lobby.turnTimer}s ${t('game.ui.perTurn')}` : '—'}
            </p>
          </div>
          <div
            className={`rounded-xl border border-white/15 bg-white/5 px-3 py-2 ${
              canEditLobbySettings
                ? 'cursor-pointer hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70'
                : ''
            }`}
            onClick={() => openEditor('allowSpectators')}
            onKeyDown={(event) => handleCardKeyDown(event, 'allowSpectators')}
            role={canEditLobbySettings ? 'button' : undefined}
            tabIndex={canEditLobbySettings ? 0 : undefined}
            aria-label={canEditLobbySettings ? t('game.ui.spectatorsLabel') : undefined}
          >
            <p className="text-[11px] uppercase tracking-wider text-white/50">{t('game.ui.spectatorsLabel')}</p>
            <p className="mt-1 text-sm font-semibold text-white">{spectatorsLabel}</p>
          </div>
        </div>

        {canEditLobbySettings && activeSettingEditor && (
          <div className="mt-3 rounded-xl border border-cyan-300/35 bg-cyan-500/10 px-3 py-3">
            {activeSettingEditor === 'maxPlayers' && (
              <>
                <p className="text-xs font-semibold text-cyan-100 mb-2">
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
                          ? 'bg-cyan-500/80 border-cyan-300 text-white'
                          : 'bg-white/5 border-white/25 text-white/85 hover:bg-white/15'
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
                <p className="text-xs font-semibold text-cyan-100 mb-2">
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
                          ? 'bg-cyan-500/80 border-cyan-300 text-white'
                          : 'bg-white/5 border-white/25 text-white/85 hover:bg-white/15'
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
                <p className="text-xs font-semibold text-cyan-100 mb-2">
                  {t('game.ui.spectatorsLabel')}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={updatingSetting === 'allowSpectators' || lobby?.allowSpectators === true}
                    onClick={() => void applySettingUpdate('allowSpectators', { allowSpectators: true })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      lobby?.allowSpectators
                        ? 'bg-cyan-500/80 border-cyan-300 text-white'
                        : 'bg-white/5 border-white/25 text-white/85 hover:bg-white/15'
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
                        ? 'bg-cyan-500/80 border-cyan-300 text-white'
                        : 'bg-white/5 border-white/25 text-white/85 hover:bg-white/15'
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
    </div>
  )
}
