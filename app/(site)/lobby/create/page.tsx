'use client'

import { useState, useEffect, useMemo, useRef, Suspense, type KeyboardEvent, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import dynamic from 'next/dynamic'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { clientLogger } from '@/lib/client-logger'
import { useTranslation, type TranslationKeys } from '@/lib/i18n-helpers'
import { Icon, type IconName } from '@/components/icons'
import { getCatalogGames, getGameMetadata, isAvailableCatalogEntry, type SupportedCatalogGameType } from '@/lib/game-catalog'
import GameIcon from '@/components/GameIcon'
import { isTemporarilyUnavailableGameType } from '@/lib/public-game-access'
import { showToast } from '@/lib/i18n-toast'
import { trackPremiumCta } from '@/lib/analytics'
import {
  trackLobbyCreateRequest,
  type AnalyticsGameType,
} from '@/lib/analytics'
import { markPendingLobbyCreateMetric } from '@/lib/lobby-create-metrics'
import { resolveRequestedMaxPlayers } from '@/lib/lobby-create-query'
import { AuthGateModal } from '@/components/AuthGateModal'
import TermsConsentPanel from '@/components/TermsConsentPanel'
import { acceptTerms } from '@/lib/client/terms-consent'
import { LOBBY_THEMES, LOBBY_THEME_IDS, getLobbyTheme, getThemePageStyle, type LobbyTheme } from '@/lib/lobby-themes'
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport'
import GameArt from './GameArt'
import { useSoundConsumer } from '@/hooks/useSoundConsumer'
import { playCue } from '@/lib/sound-engine'
import type { CueId } from '@/lib/sound-map'

type GameType = SupportedCatalogGameType
type MemoryDifficulty = 'easy' | 'medium' | 'hard'
type YahtzeeGameMode = 'classic' | 'short'
type LudoGameMode = 'quick' | 'classic'
// The catalog lists a game's modes as plain strings; each game's form field keeps
// its own union, so a Ludo mode can never be sent as a Yahtzee one (#1102).
const asYahtzeeMode = (value: string | undefined): YahtzeeGameMode => (value === 'short' ? 'short' : 'classic')
const asLudoMode = (value: string | undefined): LudoGameMode => (value === 'classic' ? 'classic' : 'quick')

type GameSettings = {
  hasTurnTimer?: boolean
  hasGameModes?: boolean
  gameModeOptions?: string[]
  defaultGameMode?: string
  hasRoundSelection?: boolean
  hasDifficultySelection?: boolean
  turnTimerOptions?: number[]
  defaultTurnTimer?: number
  roundOptions?: number[]
  defaultRounds?: number | null
  difficultyOptions?: MemoryDifficulty[]
  defaultDifficulty?: MemoryDifficulty
}

type GameInfo = {
  nameKey: string
  descriptionKey: string
  svgId: string
  accentColor: string
  gradient: string
  allowedPlayers: number[]
  defaultMaxPlayers: number
  settings: GameSettings
}

function buildGameInfoFromCatalog(): Record<string, GameInfo> {
  return Object.fromEntries(
    getCatalogGames()
      .filter(isAvailableCatalogEntry)
      .map((g) => [
        g.gameType,
        {
          nameKey: g.nameKey,
          descriptionKey: g.descriptionKey,
          svgId: g.id,
          accentColor: getGameMetadata(g.gameType)?.accentColor ?? 'var(--bd-coral)',
          gradient: g.lobbyCreateConfig.gradient,
          allowedPlayers: g.lobbyCreateConfig.allowedPlayers,
          defaultMaxPlayers: g.lobbyCreateConfig.defaultMaxPlayers,
          settings: {
            hasTurnTimer: !!g.lobbyCreateConfig.turnTimer,
            turnTimerOptions: g.lobbyCreateConfig.turnTimer?.options,
            defaultTurnTimer: g.lobbyCreateConfig.turnTimer?.default,
            hasGameModes: !!g.lobbyCreateConfig.gameModes,
            gameModeOptions: g.lobbyCreateConfig.gameModes?.options,
            defaultGameMode: g.lobbyCreateConfig.gameModes?.default,
            hasRoundSelection: !!g.lobbyCreateConfig.rounds,
            roundOptions: g.lobbyCreateConfig.rounds?.options,
            defaultRounds: g.lobbyCreateConfig.rounds?.default ?? null,
            hasDifficultySelection: !!g.lobbyCreateConfig.difficulty,
            difficultyOptions: g.lobbyCreateConfig.difficulty?.options as MemoryDifficulty[] | undefined,
            defaultDifficulty: g.lobbyCreateConfig.difficulty?.default as MemoryDifficulty | undefined,
          },
        } satisfies GameInfo,
      ])
  )
}

const GAME_INFO = buildGameInfoFromCatalog()

function isSelectableGameType(value: string | null | undefined): value is GameType {
  if (typeof value !== 'string' || !(value in GAME_INFO)) {
    return false
  }
  return !isTemporarilyUnavailableGameType(value)
}

const FriendsListModal = dynamic(() => import('@/components/FriendsListModal'))

// One path – the game, then Create. The game list and (on a phone) the settings are
// side views that replace the summary rather than expand under it: never animate height.
type View = 'summary' | 'games' | 'options'

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav-deep'

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 border-t border-bd-line pt-5">
      <h3 className="text-[13px] font-bold text-bd-ink-soft">{title}</h3>
      {children}
    </section>
  )
}

function FieldLabel({ icon, htmlFor, children }: { icon: IconName; htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-sm font-semibold text-bd-ink">
      <span className="text-bd-ink-muted"><Icon name={icon} size={14} /></span>
      {children}
    </label>
  )
}

const CREATE_SOUND_CUES: readonly CueId[] = ['ui.confirm', 'ui.error']

function CreateLobbyPage() {
  const { t } = useTranslation()
  useSoundConsumer(CREATE_SOUND_CUES)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { status } = useSession()
  const { isGuest } = useGuest()
  const isMobile = useIsMobileViewport()

  const requestedGameType = searchParams.get('gameType')
  const [selectedGameType, setSelectedGameType] = useState<GameType>(
    isSelectableGameType(requestedGameType) ? requestedGameType : 'yahtzee'
  )
  const gameInfo = GAME_INFO[selectedGameType]
  const [isPremiumUser, setIsPremiumUser] = useState(false)

  // #943: the Discord `/play <game> [players]` command links here with the seat count in
  // the URL. It belongs to the game the link named, so it is only read while that game is
  // the selected one – switching games in the picker falls back to that game's default.
  // The plan matters too: POST /api/lobby answers 403 above FREE_MAX_PLAYERS, so a free
  // account opens at the largest size it can actually create. `isPremiumUser` is false
  // until the fetch below confirms it, which re-runs the reset effect once for a Premium
  // host on a link asking for more than 10 seats.
  const deepLinkMaxPlayers =
    selectedGameType === requestedGameType
      ? resolveRequestedMaxPlayers(searchParams.get('maxPlayers'), gameInfo?.allowedPlayers, isPremiumUser)
      : null

  const boardSize = 3

  const [formData, setFormData] = useState({
    name: '',
    password: '',
    maxPlayers: deepLinkMaxPlayers ?? GAME_INFO[selectedGameType].defaultMaxPlayers,
    allowSpectators: false,
    turnTimer: GAME_INFO[selectedGameType].settings.defaultTurnTimer || 60,
    yahtzeeMode: asYahtzeeMode(GAME_INFO[selectedGameType].settings.defaultGameMode),
    ludoMode: asLudoMode(GAME_INFO[selectedGameType].settings.defaultGameMode),
    ticTacToeRounds: GAME_INFO[selectedGameType].settings.defaultRounds ?? null,
    memoryDifficulty: GAME_INFO[selectedGameType].settings.defaultDifficulty ?? 'easy',
    gameType: selectedGameType as GameType,
  })
  const LOBBY_NAME_MAX = 22
  const [showNameWarning, setShowNameWarning] = useState(false)
  const [maxPlayersInput, setMaxPlayersInput] = useState(
    (deepLinkMaxPlayers ?? GAME_INFO[selectedGameType].defaultMaxPlayers).toString()
  )
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [termsRequired, setTermsRequired] = useState(false)
  const [showPlayerWarning, setShowPlayerWarning] = useState(false)
  const [showFriendsModal, setShowFriendsModal] = useState(false)
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([])
  const [selectedTheme, setSelectedTheme] = useState<LobbyTheme>('default')
  const [view, setView] = useState<View>('summary')

  const changeGameRef = useRef<HTMLButtonElement>(null)
  const settingsRowRef = useRef<HTMLButtonElement>(null)
  const gamesBackRef = useRef<HTMLButtonElement>(null)
  const optionsBackRef = useRef<HTMLButtonElement>(null)
  const previousView = useRef<View>(view)

  useEffect(() => {
    clientLogger.log('🎮 Game type selected:', selectedGameType)
    if (gameInfo) {
      const nextMaxPlayers = deepLinkMaxPlayers ?? gameInfo.defaultMaxPlayers
      setFormData(prev => ({
        ...prev,
        maxPlayers: nextMaxPlayers,
        turnTimer: gameInfo.settings.defaultTurnTimer || 60,
        yahtzeeMode: asYahtzeeMode(gameInfo.settings.defaultGameMode),
        ludoMode: asLudoMode(gameInfo.settings.defaultGameMode),
        ticTacToeRounds: gameInfo.settings.defaultRounds ?? null,
        memoryDifficulty: gameInfo.settings.defaultDifficulty ?? 'easy',
        gameType: selectedGameType,
      }))
      setMaxPlayersInput(nextMaxPlayers.toString())
      setShowPlayerWarning(false)
    }
  }, [selectedGameType, gameInfo, deepLinkMaxPlayers])

  // A side view takes focus when it opens and hands it back to the control that opened it.
  useEffect(() => {
    const previous = previousView.current
    previousView.current = view
    if (previous === view) return
    const target =
      view === 'games' ? gamesBackRef.current
        : view === 'options' ? optionsBackRef.current
          : previous === 'games' ? changeGameRef.current
            : settingsRowRef.current
    target?.focus({ preventScroll: true })
  }, [view])

  // A logged-out visitor used to be bounced to `/` with no explanation, which
  // is where every shared /lobby/create?gameType=… link landed them. Show the
  // form behind the same gate Play vs Bot uses (#908): guest name, log in or
  // sign up, and back to the page they asked for. Only dismissing it leaves.
  const needsIdentity = status !== 'authenticated' && !isGuest

  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/user/customize', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => { if (d.isPremium) setIsPremiumUser(true) })
        .catch(() => {})
    }
  }, [status])

  const pickerGames = useMemo(
    () =>
      Object.entries(GAME_INFO)
        .filter(([key]) => !isTemporarilyUnavailableGameType(key))
        .sort(([, a], [, b]) => t(a.nameKey as TranslationKeys).localeCompare(t(b.nameKey as TranslationKeys), undefined, { sensitivity: 'base' })),
    [t]
  )

  const handlePartySelection = async (friendIds: string[]) => {
    setSelectedFriendIds(friendIds)
    showToast.success('toast.saved')
  }

  if (!gameInfo) {
    return (
      <div className="bd-page bd-screen flex-1 flex items-center justify-center p-4">
        <div className="bd-card" style={{ padding: 40, maxWidth: 400, width: '100%', textAlign: 'center' }}>
          <div style={{ marginBottom: 16 }}><Icon name="warning" size={52} tone="coral" /></div>
          <h1 style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 800, fontSize: 24, color: 'var(--bd-ink)', marginBottom: 12 }}>
            {t('lobby.create.gameNotFound')}
          </h1>
          <p style={{ color: 'var(--bd-ink-muted)', marginBottom: 24, fontSize: 15 }}>
            {t('lobby.create.gameNotSupported', { gameType: selectedGameType })}
          </p>
          <button
            onClick={() => router.push('/games')}
            className="bd-btn bd-btn-coral bd-btn-lg"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {t('lobby.create.backToGames')}
          </button>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const createStartedAt = Date.now()
    let responseStatus: number | undefined
    let createMetricTracked = false
    let navigating = false

    try {
      // The gate covers the form whenever this is true; this only stops a submit
      // that slips past it from reaching the API with no identity.
      if (needsIdentity) return
      playCue('ui.confirm')

      clientLogger.log('📤 Sending lobby creation request:', formData)

      const payload = {
        name: formData.name,
        password: formData.password,
        maxPlayers: formData.maxPlayers,
        allowSpectators: formData.allowSpectators,
        turnTimer: formData.turnTimer,
        gameType: formData.gameType,
        theme: selectedTheme,
        ...(formData.gameType === 'tic_tac_toe' ? {
          ticTacToeRounds: formData.ticTacToeRounds,
          boardSize,
        } : {}),
        ...(formData.gameType === 'memory' ? { memoryDifficulty: formData.memoryDifficulty } : {}),
        ...(formData.gameType === 'yahtzee' ? { yahtzeeMode: formData.yahtzeeMode } : {}),
        ...(formData.gameType === 'ludo' ? { ludoMode: formData.ludoMode } : {}),
      }

      const res = await fetchWithGuest('/api/lobby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      responseStatus = res.status

      const data = await res.json()
      clientLogger.log('📥 Received response:', { status: res.status, data })

      // One open lobby per person (#907). The answer is not an error — the
      // player has a room already and almost certainly wants to be in it, and
      // they can change the game once they are there.
      if (res.status === 409 && data?.code === 'LOBBY_ALREADY_OPEN' && typeof data?.lobbyCode === 'string') {
        navigating = true
        router.push(`/lobby/${data.lobbyCode}`)
        return
      }

      if (!res.ok) {
        trackLobbyCreateRequest({
          gameType: formData.gameType as AnalyticsGameType,
          durationMs: Date.now() - createStartedAt,
          isGuest,
          success: false,
          statusCode: responseStatus,
        })
        createMetricTracked = true
        if (res.status === 403 && data?.code === 'TERMS_REQUIRED') {
          setTermsRequired(true)
          return
        }
        throw new Error(data.error || 'Failed to create lobby')
      }

      const lobbyCode = typeof data?.lobby?.code === 'string' ? data.lobby.code : null
      if (!lobbyCode) {
        trackLobbyCreateRequest({
          gameType: formData.gameType as AnalyticsGameType,
          durationMs: Date.now() - createStartedAt,
          isGuest,
          success: false,
          statusCode: responseStatus,
        })
        createMetricTracked = true
        throw new Error('Lobby code missing in response')
      }

      trackLobbyCreateRequest({
        gameType: formData.gameType as AnalyticsGameType,
        durationMs: Date.now() - createStartedAt,
        isGuest,
        success: true,
        statusCode: responseStatus,
      })
      createMetricTracked = true

      markPendingLobbyCreateMetric({
        lobbyCode,
        gameType: formData.gameType as AnalyticsGameType,
        startedAt: createStartedAt,
        isGuest,
      })

      if (!isGuest && selectedFriendIds.length > 0) {
        try {
          const inviteResponse = await fetch(`/api/lobby/${lobbyCode}/invite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ friendIds: selectedFriendIds }),
          })
          const inviteResult = await inviteResponse.json().catch(() => null)
          if (!inviteResponse.ok) {
            clientLogger.warn('Lobby created but party invite request failed', {
              lobbyCode, status: inviteResponse.status, error: inviteResult,
            })
          } else {
            clientLogger.log('Party invite flow completed during lobby creation', {
              lobbyCode,
              invitedCount: typeof inviteResult?.invitedCount === 'number' ? inviteResult.invitedCount : selectedFriendIds.length,
              skippedCount: Array.isArray(inviteResult?.skippedFriendIds) ? inviteResult.skippedFriendIds.length : 0,
            })
          }
        } catch (inviteError) {
          clientLogger.warn('Lobby created but party invite request threw an error', { lobbyCode, error: inviteError })
        }
      }

      clientLogger.log('✅ Lobby created successfully, redirecting to:', lobbyCode)
      navigating = true
      router.push(`/lobby/${lobbyCode}`)
    } catch (err) {
      if (!createMetricTracked) {
        trackLobbyCreateRequest({
          gameType: formData.gameType as AnalyticsGameType,
          durationMs: Date.now() - createStartedAt,
          isGuest,
          success: false,
          statusCode: responseStatus,
        })
      }
      clientLogger.error('❌ Lobby creation error:', err)
      playCue('ui.error')
      const errorMessage = err instanceof Error ? err.message : t('lobby.create.errors.failedToCreate')
      setError(errorMessage)
    } finally {
      if (!navigating) setLoading(false)
    }
  }

  const acceptCreateTerms = async () => {
    const accepted = await acceptTerms()
    if (accepted) setTermsRequired(false)
    return accepted
  }

  if (status === 'loading') {
    return (
      <div className="bd-page bd-screen flex-1 flex items-center justify-center">
        <div style={{ color: 'var(--bd-ink-soft)', fontSize: 18 }}>{t('common.loading')}</div>
      </div>
    )
  }

  const sliderPct = gameInfo.allowedPlayers.length > 1
    ? ((formData.maxPlayers - gameInfo.allowedPlayers[0]) / (gameInfo.allowedPlayers[gameInfo.allowedPlayers.length - 1] - gameInfo.allowedPlayers[0])) * 100
    : 0

  const isTTT = selectedGameType === 'tic_tac_toe'
  const gameName = t(gameInfo.nameKey as TranslationKeys)

  const difficultyLabel = (difficulty: MemoryDifficulty) =>
    difficulty === 'easy'
      ? t('lobby.create.difficultyEasy')
      : difficulty === 'medium'
        ? t('lobby.create.difficultyMedium')
        : t('lobby.create.difficultyHard')

  const seatsLabel = (allowed: number[]) =>
    allowed.length > 1
      ? t('lobby.create.playersRange', { range: `${allowed[0]}–${allowed[allowed.length - 1]}` })
      : t('lobby.create.preview.players', { count: allowed[0] })

  const chipOpt = (active: boolean) =>
    `bd-chip flex-1 cursor-pointer justify-center py-2 text-sm transition-[background-color,border-color,color] duration-150 ${FOCUS_RING} ${
      active ? 'border-bd-ink bg-bd-ink text-bd-bg' : 'hover:border-bd-ink'
    }`

  const currentTheme = getLobbyTheme(selectedTheme)

  // The room the defaults make, in one glance: what "just press Create" gives you.
  const facts: { icon: IconName; label: string }[] = [
    {
      icon: 'users',
      label: gameInfo.allowedPlayers.length > 1
        ? t('lobby.create.upToPlayers', { count: formData.maxPlayers })
        : t('lobby.create.preview.players', { count: formData.maxPlayers }),
    },
    formData.password
      ? { icon: 'lock', label: t('lobby.privateLobby') }
      : { icon: 'globe', label: t('lobby.publicLobby') },
  ]
  if (isTTT && gameInfo.settings.hasRoundSelection) {
    facts.push({ icon: 'target', label: formData.ticTacToeRounds ? t('lobby.create.bestOfShort', { rounds: formData.ticTacToeRounds }) : t('lobby.create.unlimitedRounds') })
  }
  if (gameInfo.settings.hasDifficultySelection) {
    facts.push({ icon: 'cards', label: difficultyLabel(formData.memoryDifficulty) })
  }
  if (gameInfo.settings.hasGameModes) {
    facts.push({
      icon: 'dice',
      label: formData.gameType === 'ludo'
        ? (formData.ludoMode === 'quick' ? t('games.ludo.modes.quick') : t('games.ludo.modes.classic'))
        : (formData.yahtzeeMode === 'short' ? t('lobby.create.gameModeShort') : t('lobby.create.gameModeClassic')),
    })
  }
  if (gameInfo.settings.hasTurnTimer) {
    facts.push({ icon: 'clock', label: t('lobby.create.turnSeconds', { seconds: formData.turnTimer }) })
  }
  if (selectedTheme !== 'default') {
    facts.push({ icon: 'palette', label: currentTheme.name })
  }

  const hasGameSettings = isTTT || gameInfo.settings.hasDifficultySelection || gameInfo.settings.hasGameModes || gameInfo.settings.hasTurnTimer

  const closeOnEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      setView('summary')
    }
  }

  const pickGame = (key: GameType) => {
    setSelectedGameType(key)
    setView('summary')
  }

  // Below the desk breakpoint the summary and the settings share one area and swap;
  // on desktop both are on screen, so only the game list ever covers the summary.
  const settingsHidden = isMobile && view !== 'options'
  const stageHidden = isMobile && view === 'options'
  const layerMotion = 'transition-[opacity,translate] duration-200 ease-out'

  return (
    <div className="page-shell bd-page bd-screen" style={getThemePageStyle(selectedTheme)}>
      <form
        id="create-lobby-form"
        onSubmit={handleSubmit}
        className="mx-auto grid min-h-0 w-full max-w-[1120px] flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] desk:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] desk:grid-rows-[minmax(0,1fr)] desk:gap-x-10 desk:px-8 desk:py-6"
      >
        {/* The game and the Create button: a card on desktop; on a phone its two parts sit
            directly in the grid, so the button bar stays put while the area above swaps. */}
        <div className="contents desk:col-start-1 desk:row-start-1 desk:flex desk:h-full desk:max-h-[680px] desk:min-h-0 desk:flex-col desk:self-center desk:overflow-hidden desk:rounded-[28px] desk:border-[1.5px] desk:border-bd-line desk:bg-bd-card-warm desk:shadow-[0_6px_0_0_rgba(31,27,22,0.08),0_14px_28px_-10px_rgba(31,27,22,0.18)]">
          <div
            inert={stageHidden}
            className={`relative col-start-1 row-start-1 min-h-0 desk:flex-1 ${layerMotion} ${
              view === 'options' ? 'max-desk:pointer-events-none max-desk:opacity-0 max-desk:motion-safe:-translate-x-3' : ''
            }`}
          >
            {/* Summary */}
            <div
              inert={view === 'games'}
              className={`absolute inset-0 overflow-y-auto overscroll-contain ${layerMotion} ${
                view === 'games' ? 'pointer-events-none opacity-0 motion-safe:-translate-x-3' : 'opacity-100'
              }`}
            >
              <div className="mx-auto flex min-h-full w-full max-w-[560px] flex-col justify-center gap-4 px-4 pt-4 pb-5 desk:max-w-none desk:px-7 desk:pt-7 desk:pb-6">
                <div
                  className="bd-dot-grid relative flex max-h-[340px] min-h-[200px] flex-1 flex-col rounded-[22px] p-3"
                  style={{ backgroundColor: `color-mix(in srgb, ${gameInfo.accentColor} 18%, var(--bd-card-warm))` }}
                >
                  <div className="flex justify-end">
                    <button
                      ref={changeGameRef}
                      type="button"
                      onClick={() => setView('games')}
                      className={`inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-bd-line bg-bd-card-warm px-3.5 py-2 text-[13px] font-semibold text-bd-ink transition-[border-color] duration-150 hover:border-bd-ink ${FOCUS_RING}`}
                    >
                      <Icon name="gamepad" size={15} />
                      {t('lobby.create.changeGame')}
                    </button>
                  </div>
                  <div className="grid flex-1 place-items-center px-2 pt-2 pb-4">
                    <div key={selectedGameType} className="motion-safe:animate-[bd-screen-in_0.35s_var(--bd-ease-out)] motion-reduce:animate-[fade-in-plain_0.2s_ease-out]">
                      <GameArt
                        gameType={selectedGameType}
                        svgId={gameInfo.svgId}
                        accentColor={gameInfo.accentColor}
                        memoryDifficulty={formData.memoryDifficulty}
                        t={t}
                      />
                    </div>
                  </div>
                </div>

                <div key={`about-${selectedGameType}`} className="space-y-1.5 motion-safe:animate-[bd-screen-in_0.35s_var(--bd-ease-out)] motion-reduce:animate-[fade-in-plain_0.2s_ease-out]">
                  <h1
                    className="text-balance text-[clamp(22px,2.6vw,30px)] font-extrabold leading-tight text-bd-ink"
                    style={{ fontFamily: 'var(--bd-font-display)' }}
                  >
                    {t('lobby.create.setUpRoom', { game: gameName })}
                  </h1>
                  <p className="text-pretty text-[15px] leading-snug text-bd-ink-soft">
                    {t(gameInfo.descriptionKey as TranslationKeys)}
                  </p>
                </div>

                <ul className="flex flex-wrap gap-1.5" aria-label={t('lobby.create.settingsTitle')}>
                  {facts.map((fact) => (
                    <li key={fact.icon} className="bd-chip text-[13px] text-bd-ink">
                      <Icon name={fact.icon} size={13} />
                      {fact.label}
                    </li>
                  ))}
                </ul>

                {/* #945: the Discord feed republishes open public lobbies, so say so where
                    the lobby is made public – a lobby is private only if it has a password. */}
                <p className="flex items-start gap-1.5 text-[13px] leading-snug text-bd-ink-muted">
                  <span className="mt-0.5 shrink-0"><Icon name="globe" size={13} /></span>
                  <span>{t('lobby.create.discordListingNotice')}</span>
                </p>

                <button
                  ref={settingsRowRef}
                  type="button"
                  onClick={() => setView('options')}
                  className={`flex w-full items-center gap-3 rounded-2xl border-[1.5px] border-bd-line bg-bd-card-warm px-4 py-3.5 text-left transition-[border-color] duration-150 hover:border-bd-ink desk:hidden ${FOCUS_RING}`}
                >
                  <span className="text-bd-ink-soft"><Icon name="gear" size={18} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-bd-ink">{t('lobby.create.settingsTitle')}</span>
                    <span className="block truncate text-[13px] text-bd-ink-muted">{t('lobby.create.settingsRowHint')}</span>
                  </span>
                  <span className="text-bd-ink-muted"><Icon name="arrow-right" size={16} /></span>
                </button>
              </div>
            </div>

            {/* Game list: full-width plates in a vertical list, so it scales with the catalog. */}
            <div
              inert={view !== 'games'}
              onKeyDown={closeOnEscape}
              className={`absolute inset-0 overflow-y-auto overscroll-contain ${layerMotion} ${
                view === 'games' ? 'opacity-100' : 'pointer-events-none opacity-0 motion-safe:translate-x-3'
              }`}
            >
              <div className="sticky top-0 z-10 mx-auto flex max-w-[560px] items-center gap-2 bg-bd-bg px-4 py-3 desk:max-w-none desk:bg-bd-card-warm desk:px-7 desk:pt-6">
                <button
                  ref={gamesBackRef}
                  type="button"
                  onClick={() => setView('summary')}
                  aria-label={t('common.back')}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-bd-ink transition-[background-color] duration-150 hover:bg-bd-bg2 ${FOCUS_RING}`}
                >
                  <Icon name="arrow-left" size={18} />
                </button>
                <h2 className="text-lg font-extrabold text-bd-ink" style={{ fontFamily: 'var(--bd-font-display)' }}>
                  {t('lobby.create.chooseGame')}
                </h2>
              </div>
              <ul className="mx-auto max-w-[560px] space-y-2 px-4 pb-5 desk:max-w-none desk:px-7 desk:pb-7">
                {pickerGames.map(([key, info]) => {
                  const isSelected = key === selectedGameType
                  const name = t(info.nameKey as TranslationKeys)
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => pickGame(key as GameType)}
                        aria-pressed={isSelected}
                        aria-label={t('lobby.create.selectGame', { name })}
                        className={`flex w-full items-center gap-3 rounded-2xl border-[1.5px] px-4 py-3 text-left transition-[background-color,border-color,color] duration-150 ${FOCUS_RING} ${
                          isSelected ? 'border-bd-ink bg-bd-ink text-bd-bg' : 'border-bd-line bg-bd-bg text-bd-ink hover:border-bd-ink'
                        }`}
                      >
                        <GameIcon
                          gameId={info.svgId}
                          accentColor={isSelected ? 'currentColor' : info.accentColor}
                          detailColor={isSelected ? 'var(--bd-ink)' : 'white'}
                          size={22}
                          variant="bare"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold">{name}</span>
                          <span className={`block text-[13px] ${isSelected ? 'opacity-70' : 'text-bd-ink-muted'}`}>{seatsLabel(info.allowedPlayers)}</span>
                        </span>
                        {isSelected && <Icon name="check" size={16} />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>

          {/* Create is always on screen: the bottom bar on a phone, the card's foot on desktop. */}
          <div className="col-start-1 row-start-2 border-t border-bd-line bg-bd-card-warm px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] desk:px-7 desk:pt-4 desk:pb-5">
            <div className="mx-auto w-full max-w-[560px] desk:max-w-none">
              {error && (
                <div
                  role="alert"
                  className="mb-3 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm"
                  style={{ background: 'rgba(255,107,91,0.10)', border: '1.5px solid rgba(255,107,91,0.3)', color: 'var(--bd-coral-deep)' }}
                >
                  <Icon name="warning" size={16} />
                  {error}
                </div>
              )}
              {termsRequired && <TermsConsentPanel onAccept={acceptCreateTerms} autoFocus context="play" className="mb-3" />}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => router.push('/games')}
                  className={`bd-btn bd-btn-soft bd-btn-lg shrink-0 ${FOCUS_RING}`}
                  style={{ paddingInline: 18 }}
                >
                  {t('lobby.create.cancel')}
                </button>
                <button
                  type="submit"
                  form="create-lobby-form"
                  disabled={loading}
                  aria-busy={loading}
                  className={`bd-btn bd-btn-lg min-w-0 flex-1 justify-center disabled:cursor-wait ${FOCUS_RING}`}
                  style={{
                    fontWeight: 700,
                    opacity: loading ? 0.7 : 1,
                    background: currentTheme.accent,
                    color: 'var(--bd-ink-on-accent)',
                    boxShadow: `0 4px 0 0 color-mix(in srgb, ${currentTheme.accent} 60%, #1F1B16)`,
                  }}
                >
                  {loading ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                        <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {t('lobby.create.creating')}
                    </>
                  ) : (
                    t('lobby.create.create')
                  )}
                </button>
              </div>
              <p className="mt-2.5 hidden text-center text-xs text-bd-ink-muted desk:block">
                {t('lobby.create.inviteCodeNotice')}
              </p>
            </div>
          </div>
        </div>

        {/* Settings: every field is optional. A drill-down on a phone, a column on desktop. */}
        <div
          inert={settingsHidden}
          onKeyDown={closeOnEscape}
          className={`col-start-1 row-start-1 min-h-0 overflow-y-auto overscroll-contain desk:col-start-2 ${layerMotion} ${
            view === 'options' ? '' : 'max-desk:pointer-events-none max-desk:opacity-0 max-desk:motion-safe:translate-x-3'
          }`}
        >
          <div className="mx-auto flex min-h-full w-full max-w-[560px] flex-col px-4 pt-3 pb-6 desk:max-w-none desk:px-1 desk:py-2">
            <div className="space-y-5 desk:my-auto">
              <div className="flex items-start gap-2">
                <button
                  ref={optionsBackRef}
                  type="button"
                  onClick={() => setView('summary')}
                  aria-label={t('common.back')}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-bd-ink transition-[background-color] duration-150 hover:bg-bd-bg2 desk:hidden ${FOCUS_RING}`}
                >
                  <Icon name="arrow-left" size={18} />
                </button>
                <div className="min-w-0 pt-1.5 desk:pt-0">
                  <h2 className="text-lg font-extrabold leading-tight text-bd-ink desk:text-xl" style={{ fontFamily: 'var(--bd-font-display)' }}>
                    {t('lobby.create.settingsTitle')}
                  </h2>
                  <p className="text-sm text-bd-ink-muted">{t('lobby.create.settingsOptional')}</p>
                </div>
              </div>

              <SettingsGroup title={t('lobby.create.groupRoom')}>
                <div className="space-y-1.5">
                  <FieldLabel icon="tag" htmlFor="create-lobby-name">
                    {t('lobby.create.lobbyName')}
                  </FieldLabel>
                  <input
                    id="create-lobby-name"
                    type="text"
                    placeholder={t('lobby.create.lobbyNamePlaceholder')}
                    maxLength={LOBBY_NAME_MAX}
                    className="bd-input"
                    value={formData.name}
                    onChange={(e) => {
                      let value = e.target.value
                      if (value.length > LOBBY_NAME_MAX) value = value.slice(0, LOBBY_NAME_MAX)
                      setFormData({ ...formData, name: value })
                      setShowNameWarning(value.length >= LOBBY_NAME_MAX)
                    }}
                    onBlur={() => setShowNameWarning(false)}
                  />
                  {showNameWarning && (
                    <p className="text-sm" style={{ color: 'var(--bd-coral-deep)' }}>
                      <Icon name="warning" size={14} /> {t('lobby.create.maxCharacters', { max: LOBBY_NAME_MAX })}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <FieldLabel icon="lock" htmlFor="create-lobby-password">
                    {t('lobby.create.password')}
                  </FieldLabel>
                  <input
                    id="create-lobby-password"
                    type="text"
                    autoComplete="off"
                    placeholder={t('lobby.create.passwordPlaceholder')}
                    className="bd-input"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                </div>

                {gameInfo.allowedPlayers.length > 1 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <FieldLabel icon="users" htmlFor="create-lobby-players">{t('lobby.create.maxPlayers')}</FieldLabel>
                      <span className="text-2xl font-extrabold tabular-nums text-bd-ink" style={{ fontFamily: 'var(--bd-font-display)' }}>
                        {formData.maxPlayers}
                      </span>
                    </div>
                    <input
                      id="create-lobby-players"
                      type="range"
                      min={gameInfo.allowedPlayers[0]}
                      max={gameInfo.allowedPlayers[gameInfo.allowedPlayers.length - 1]}
                      step="1"
                      value={formData.maxPlayers}
                      onChange={(e) => {
                        const value = parseInt(e.target.value)
                        if (gameInfo.allowedPlayers.includes(value)) {
                          setFormData({ ...formData, maxPlayers: value })
                          setMaxPlayersInput(value.toString())
                          setShowPlayerWarning(false)
                        }
                      }}
                      className="slider-thumb w-full"
                      style={{
                        background: `linear-gradient(to right, var(--bd-ink) 0%, var(--bd-ink) ${sliderPct}%, var(--bd-bg2) ${sliderPct}%, var(--bd-bg2) 100%)`,
                      }}
                    />
                    <div className="flex justify-between px-0.5" aria-hidden="true">
                      {gameInfo.allowedPlayers.map((n) => (
                        <span key={n} className={`text-xs font-semibold tabular-nums ${formData.maxPlayers === n ? 'text-bd-ink' : 'text-bd-ink-muted'}`}>
                          {n}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <FieldLabel icon="users">{t('lobby.create.maxPlayers')}</FieldLabel>
                    <span className="bd-chip text-[13px] text-bd-ink" title={t('lobby.create.playerCountHelperExact', { count: gameInfo.allowedPlayers[0] })}>
                      {t('lobby.create.preview.players', { count: gameInfo.allowedPlayers[0] })}
                    </span>
                  </div>
                )}
              </SettingsGroup>

              {hasGameSettings && (
                <SettingsGroup title={t('lobby.create.sectionGameSettings')}>
                  {isTTT && gameInfo.settings.hasRoundSelection && (
                    <div className="space-y-2">
                      <FieldLabel icon="target">{t('lobby.create.bestOf')}</FieldLabel>
                      <div className="flex gap-2">
                        {[3, 5, 10].map((r) => (
                          <button key={r} type="button" aria-pressed={formData.ticTacToeRounds === r} onClick={() => setFormData({ ...formData, ticTacToeRounds: r })} className={chipOpt(formData.ticTacToeRounds === r)}>{t('lobby.create.bestOfShort', { rounds: r })}</button>
                        ))}
                        <button type="button" aria-pressed={formData.ticTacToeRounds === null} aria-label={t('lobby.create.unlimitedRounds')} onClick={() => setFormData({ ...formData, ticTacToeRounds: null })} className={chipOpt(formData.ticTacToeRounds === null)}>∞</button>
                      </div>
                    </div>
                  )}

                  {gameInfo.settings.hasDifficultySelection && (
                    <div className="space-y-2">
                      <FieldLabel icon="cards">{t('lobby.create.memoryDifficulty')}</FieldLabel>
                      <div className="flex gap-2">
                        {(['easy', 'medium', 'hard'] as MemoryDifficulty[]).map((d) => (
                          <button key={d} type="button" aria-pressed={formData.memoryDifficulty === d} onClick={() => setFormData({ ...formData, memoryDifficulty: d })} className={chipOpt(formData.memoryDifficulty === d)}>
                            <Icon name={d === 'easy' ? 'bot-easy' : d === 'medium' ? 'bot-medium' : 'bot-hard'} size={13} />
                            {difficultyLabel(d)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {gameInfo.settings.hasGameModes && (
                    <div className="space-y-2">
                      <FieldLabel icon="dice">{t('lobby.create.gameMode')}</FieldLabel>
                      <div className="flex gap-2">
                        {formData.gameType === 'ludo'
                          ? (gameInfo.settings.gameModeOptions ?? ['quick', 'classic']).map(asLudoMode).map((m) => (
                            <button key={m} type="button" aria-pressed={formData.ludoMode === m} onClick={() => setFormData({ ...formData, ludoMode: m })} className={chipOpt(formData.ludoMode === m)}>
                              {m === 'quick' ? t('games.ludo.modes.quick') : t('games.ludo.modes.classic')}
                            </button>
                          ))
                          : (gameInfo.settings.gameModeOptions ?? ['classic', 'short']).map(asYahtzeeMode).map((m) => (
                            <button key={m} type="button" aria-pressed={formData.yahtzeeMode === m} onClick={() => setFormData({ ...formData, yahtzeeMode: m })} className={chipOpt(formData.yahtzeeMode === m)}>
                              {m === 'short' ? t('lobby.create.gameModeShort') : t('lobby.create.gameModeClassic')}
                            </button>
                          ))}
                      </div>
                      <p className="text-xs text-bd-ink-muted">{formData.gameType === 'ludo' ? t('games.ludo.modes.helper') : t('lobby.create.gameModeShortHelper')}</p>
                    </div>
                  )}

                  {gameInfo.settings.hasTurnTimer && (
                    <div className="space-y-2">
                      <FieldLabel icon="clock">{t('lobby.create.turnTimer')}</FieldLabel>
                      <div className="flex gap-2">
                        {(gameInfo.settings.turnTimerOptions ?? [30, 60, 90, 120]).map((s) => (
                          <button key={s} type="button" aria-pressed={formData.turnTimer === s} onClick={() => setFormData({ ...formData, turnTimer: s })} className={`${chipOpt(formData.turnTimer === s)} tabular-nums`}>{s}s</button>
                        ))}
                      </div>
                    </div>
                  )}
                </SettingsGroup>
              )}

              <SettingsGroup title={t('lobby.create.groupExtras')}>
                {/* Lobby theme — premium */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <FieldLabel icon="palette">{t('lobby.create.themeTitle')}</FieldLabel>
                    {!isPremiumUser && <span className="text-[11px] font-bold text-amber-500"><Icon name="crown" size={11} /> {t('premium.breadcrumb')}</span>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {LOBBY_THEME_IDS.map((themeId) => {
                      const theme = LOBBY_THEMES[themeId]
                      const isPremiumTheme = themeId !== 'default'
                      const isLocked = isPremiumTheme && !isPremiumUser
                      const isSelected = selectedTheme === themeId
                      return (
                        <button
                          key={themeId}
                          type="button"
                          aria-disabled={isLocked}
                          aria-pressed={isSelected}
                          aria-label={isLocked ? t('lobby.create.themePremiumOnly', { name: theme.name }) : theme.name}
                          onClick={() => {
                            if (isLocked) {
                              // Locked controls used to be `disabled`, so a free user's tap was
                              // silent and unmeasurable (#920). Same toast as the lobby settings panel.
                              trackPremiumCta('create_theme')
                              showToast.custom('profile.premiumFeatureLocked', <Icon name="crown" size={18} />)
                              return
                            }
                            setSelectedTheme(themeId)
                          }}
                          title={isLocked ? t('lobby.create.themePremiumOnly', { name: theme.name }) : theme.name}
                          className={FOCUS_RING}
                          style={{
                            position: 'relative',
                            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                            background: theme.bg,
                            border: isSelected ? `3px solid ${theme.accent}` : '2px solid var(--bd-line)',
                            boxShadow: isSelected ? `inset 0 0 0 2px ${theme.accent}40` : undefined,
                            cursor: isLocked ? 'not-allowed' : 'pointer',
                            opacity: isLocked ? 0.5 : 1,
                            overflow: 'hidden',
                            transition: 'border-color 0.15s, box-shadow 0.15s',
                          }}
                        >
                          <span style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0,
                            height: 9, background: theme.accent,
                          }} />
                          {isLocked && <Icon name="crown" size={10} tone="premium" style={{ position: 'absolute', top: 2, right: 2 }} />}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-[12px] text-bd-ink-muted">
                    {selectedTheme === 'default'
                      ? t('lobby.create.themeDefaultHint')
                      : t('lobby.create.themeSelected', { name: LOBBY_THEMES[selectedTheme].name })}
                    {!isPremiumUser && ` · ${t('lobby.create.themeUpgradeHint')}`}
                  </p>
                </div>

                {/* Spectators — premium only */}
                <div className="flex items-center justify-between gap-4 rounded-2xl border-[1.5px] border-bd-line bg-bd-card-warm px-4 py-3.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-bd-ink">{t('game.ui.spectatorsLabel')}</p>
                      {!isPremiumUser && <span className="text-[11px] font-bold text-amber-500"><Icon name="crown" size={11} /> {t('premium.breadcrumb')}</span>}
                    </div>
                    <p className="text-[13px] text-bd-ink-muted">
                      {isPremiumUser ? t('lobby.create.spectatorsAllow') : t('lobby.create.spectatorsUpgrade')}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-disabled={!isPremiumUser}
                    onClick={() => {
                      if (!isPremiumUser) {
                        trackPremiumCta('create_spectators')
                        showToast.custom('profile.premiumFeatureLocked', <Icon name="crown" size={18} />)
                        return
                      }
                      setFormData((prev) => ({ ...prev, allowSpectators: !prev.allowSpectators }))
                    }}
                    aria-pressed={formData.allowSpectators}
                    aria-label={t('lobby.create.spectatorsToggle')}
                    className={FOCUS_RING}
                    style={{
                      position: 'relative', display: 'inline-flex', height: 28, width: 52,
                      alignItems: 'center', borderRadius: 999, border: 'none',
                      cursor: isPremiumUser ? 'pointer' : 'not-allowed',
                      flexShrink: 0, transition: 'background-color 0.2s',
                      background: formData.allowSpectators ? 'var(--bd-mint)' : 'var(--bd-bg2)',
                      opacity: isPremiumUser ? 1 : 0.5,
                    }}
                  >
                    <span style={{
                      display: 'inline-block', width: 20, height: 20, borderRadius: '50%',
                      background: 'white', boxShadow: '0 1px 4px rgba(31,27,22,0.2)',
                      transition: 'transform 0.2s',
                      transform: formData.allowSpectators ? 'translateX(28px)' : 'translateX(4px)',
                    }} />
                  </button>
                </div>

                {/* Invite friends */}
                {!isGuest && (
                  <div className="flex items-center justify-between gap-4 rounded-2xl border-[1.5px] border-bd-line bg-bd-card-warm px-4 py-3.5">
                    <div>
                      <p className="font-semibold text-bd-ink"><Icon name="users" size={14} /> {t('lobby.invite.title')}</p>
                      <p className="text-[13px] text-bd-ink-muted">
                        {selectedFriendIds.length > 0
                          ? <span style={{ color: 'var(--bd-mint-deep)', fontWeight: 600 }}><Icon name="check" size={13} /> {t('lobby.create.friendsSelected', { value: selectedFriendIds.length })}</span>
                          : t('lobby.invite.description')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowFriendsModal(true)}
                      className={`bd-btn bd-btn-soft shrink-0 px-3 py-2 text-sm ${FOCUS_RING}`}
                    >
                      {selectedFriendIds.length > 0 ? t('common.edit') : t('lobby.invite.title')}
                    </button>
                  </div>
                )}
              </SettingsGroup>
            </div>
          </div>
        </div>
      </form>

      {needsIdentity && (
        <AuthGateModal
          dest={`/lobby/create${searchParams.toString() ? `?${searchParams.toString()}` : ''}`}
          // Visibility is derived from the session, so there is nothing to reset:
          // guest play flips isGuest and the gate goes away with the form intact.
          onClose={() => {}}
          onGuestReady={() => {}}
          onDismiss={() => router.push('/')}
        />
      )}

      {!isGuest && (
        <FriendsListModal
          isOpen={showFriendsModal}
          onClose={() => setShowFriendsModal(false)}
          onSelect={handlePartySelection}
          initialSelectedFriendIds={selectedFriendIds}
          confirmLabel={t('common.save')}
          lobbyCode="pending-lobby"
        />
      )}
    </div>
  )
}

export default function CreateLobbyPageWrapper() {
  const { t } = useTranslation()
  // translate="no" (#772): 36% of the Google-Translate-induced removeChild
  // crashes in Sentry came from this route. See app/lobby/[code]/layout.tsx.
  return (
    <div translate="no" className="contents">
      <Suspense fallback={<div className="bd-page bd-screen flex-1 flex items-center justify-center"><div style={{ color: 'var(--bd-ink-soft)', fontSize: 18 }}>{t('common.loading')}</div></div>}>
        <CreateLobbyPage />
      </Suspense>
    </div>
  )
}
