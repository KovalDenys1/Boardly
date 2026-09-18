'use client'

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import LoadingSpinner from '@/components/LoadingSpinner'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { sounds } from '@/lib/sounds'
import { useConfetti } from '@/hooks/useConfetti'
import type { RollHistoryEntry } from '@/components/RollHistory'
import { detectCelebration, CelebrationEvent } from '@/lib/celebrations'
import { analyzeResults } from '@/lib/yahtzee-results'
import { clientLogger } from '@/lib/client-logger'
import { Game, GamePlayer, GameUpdatePayload, PlayerJoinedPayload, GameStartedPayload, LobbyUpdatePayload, ChatMessagePayload, PlayerTypingPayload, BotMoveStep, Lobby } from '@/types/game'
import type { BaseBotActionEvent, YahtzeeBotActionEvent } from '@/lib/bots'
import { selectBestAvailableCategory, calculateScore, YahtzeeCategory, ALL_CATEGORIES, getActiveCategories } from '@/lib/yahtzee'
import { GameEngine } from '@/lib/game-engine'
import { DEFAULT_GAME_TYPE } from '@/lib/game-catalog'
import { canCreateLobbyForGameType, getGameLobbiesRoute, getLobbyCreateRoute } from '@/lib/public-game-access'
import { restoreGameEngineClient } from '@/lib/restore-game-engine-client'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import { readLocal, removeLocal, writeLocal } from '@/lib/safe-storage'
import { createFreshnessWatermark, decideFreshness, readGameStateId, resetFreshnessWatermark } from '@/lib/game-state-freshness'

const CATEGORY_DISPLAY_NAMES: Record<YahtzeeCategory, string> = {
  ones: 'Ones',
  twos: 'Twos',
  threes: 'Threes',
  fours: 'Fours',
  fives: 'Fives',
  sixes: 'Sixes',
  onePair: 'One Pair',
  twoPairs: 'Two Pairs',
  threeOfKind: 'Three of a Kind',
  fourOfKind: 'Four of a Kind',
  fullHouse: 'Full House',
  smallStraight: 'Small Straight',
  largeStraight: 'Large Straight',
  yahtzee: 'Yahtzee',
  chance: 'Chance'
}

function normalizeHeldIndexes(rawHeld: unknown): number[] {
  if (!Array.isArray(rawHeld)) return []

  if (rawHeld.length > 0 && typeof rawHeld[0] === 'boolean') {
    return (rawHeld as boolean[])
      .map((isHeld, index) => (isHeld ? index : -1))
      .filter((index) => index !== -1)
  }

  return rawHeld
    .filter((value): value is number => Number.isInteger(value) && Number(value) >= 0)
    .map((value) => Number(value))
}

function getYahtzeeTurnNumberFromScorecard(scorecard: Partial<Record<YahtzeeCategory, number>> | null | undefined): number {
  const filledCount = ALL_CATEGORIES.filter((category) => scorecard?.[category] !== undefined).length
  return Math.min(ALL_CATEGORIES.length, filledCount + 1)
}

interface DBPlayer {
  id: string
  userId: string
  score: number
  placement?: number | null
  user: {
    id: string
    username: string | null
    name?: string | null
    bot?: {
      id: string
      userId: string
      botType: string
      difficulty: string
    } | null
  }
}

import { useRealtimeConnection } from './hooks/useRealtimeConnection'
import { useLobbyChat, useLobbyChatHistory } from './hooks/useLobbyChat'
import { useLobbyHeartbeat } from './hooks/useLobbyHeartbeat'
import { useGameTimer } from './hooks/useGameTimer'
import { useGameActions, AutoActionContext } from './hooks/useGameActions'
import { useLobbyActions } from './hooks/useLobbyActions'
import { useKickedPlayers } from './hooks/useKickedPlayers'
import { useBotTurn } from './hooks/useBotTurn'
import type { TabId } from './components/MobileTabs'
import { LobbyPageErrorFallback, LobbyPageLoadingFallback } from './components/LobbyPageFallbacks'
import { showToast } from '@/lib/i18n-toast'
import { showYahtzeeCategoryToast } from '@/lib/yahtzee-notifications'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { getLobbyPlayerRequirements } from '@/lib/lobby-player-requirements'
import { useLobbyRouteState } from './hooks/useLobbyRouteState'
import { useLeaveLobby } from './hooks/useLeaveLobby'
import type { BotDifficulty } from '@/lib/bot-profiles'
import { isTerminalGameStatus, resolveLifecycleRedirectReason } from '@/lib/lobby-lifecycle'
import { trackInviteOpened, trackLobbyLeaveRedirect } from '@/lib/analytics'
import { parseInviteAttribution, readDocumentNavigation, stripInviteMarker } from '@/lib/invite-attribution'
import { ReactionOverlay } from '@/components/ReactionOverlay'
import { resolveDedicatedLobbyPageGameType } from '@/lib/lobby-page-routing'
import { getLobbyTheme, getThemePageStyle } from '@/lib/lobby-themes'
import LeaveIcon from '@/components/LeaveIcon'
import { MOBILE_MAX_MEDIA_QUERY } from '@/lib/responsive-tokens'
import { createStuckTurnRecovery, turnSignatureOf } from '@/lib/stuck-turn-recovery'

function CenteredLoadingFallback() {
  return (
    <div className="bd-page page-shell flex items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  )
}

const PlayerList = dynamic(() => import('@/components/PlayerList'))
const PlayerProfileCard = dynamic(() => import('@/components/PlayerProfileCard'))
const Scorecard = dynamic(() => import('@/components/Scorecard'))
const Chat = dynamic(() => import('@/components/Chat'))
const BotMoveOverlay = dynamic(() => import('@/components/BotMoveOverlay'))
const RollHistory = dynamic(() => import('@/components/RollHistory'))
const YahtzeeResults = dynamic(() => import('@/components/YahtzeeResults'))
const SpyGameBoard = dynamic(() => import('./components/SpyGameBoard'))
const MemoryGameBoard = dynamic(() => import('./components/MemoryGameBoard'))
const MobileTabs = dynamic(() => import('./components/MobileTabs'))
const MobileTabPanel = dynamic(() => import('./components/MobileTabPanel'))
const GameInterruptedOverlay = dynamic(() => import('./components/GameInterruptedOverlay'))
const LobbyInfo = dynamic(() => import('./components/LobbyInfo'))
const WaitingRoom = dynamic(() => import('./components/WaitingRoom'))
const WaitingRoomActions = dynamic(() => import('./components/WaitingRoomActions'))
const LobbySettingsPanel = dynamic(() => import('./components/LobbySettingsPanel'))
const JoinPrompt = dynamic(() => import('./components/JoinPrompt'))
const FriendsListModal = dynamic(() => import('@/components/FriendsListModal'))
const ConfirmModal = dynamic(() => import('@/components/ConfirmModal'))
const GameBoard = dynamic(() => import('./components/YahtzeeGameBoard'), {
  loading: () => (
    <div className="h-full min-h-[280px] rounded-xl border border-[var(--bd-line)] bg-[var(--bd-bg2)]">
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    </div>
  ),
})
const TicTacToeLobbyPage = dynamic(() => import('./tic-tac-toe-page'), {
  loading: () => <CenteredLoadingFallback />,
})
const RockPaperScissorsLobbyPage = dynamic(() => import('./rock-paper-scissors-page'), {
  loading: () => <CenteredLoadingFallback />,
})
const AliasLobbyPage = dynamic(
  () => import('./alias-page'),
  { loading: () => <CenteredLoadingFallback /> }
)
const LiarsPartyLobbyPage = dynamic(
  () => import('./liars-party-page'),
  { loading: () => <CenteredLoadingFallback /> }
)
const ConnectFourLobbyPage = dynamic(
  () => import('./connect-four-page'),
  { loading: () => <CenteredLoadingFallback /> }
)
const SketchAndGuessLobbyPage = dynamic(
  () => import('./sketch-and-guess-page'),
  { loading: () => <CenteredLoadingFallback /> }
)

const LEAVE_REDIRECT_FALLBACK_MS = 1500
const LIFECYCLE_REDIRECT_FALLBACK_MS = 1600
const WAITING_LOBBY_SYNC_INTERVAL_MS = 2000
const YAHTZEE_RESULTS_HOLD_MS = 12000

function LobbyPageContent({ onSwitchToDedicatedPage }: { onSwitchToDedicatedPage?: (gameType: string) => void }) {
  const router = useRouter()
  const params = useParams()
  const { data: session, status } = useSession()
  const { isGuest, guestId, guestName, guestToken, setGuestMode } = useGuest()
  const code = params.code as string

  // Core state
  const [lobby, setLobby] = useState<Lobby | null>(null)
  const [game, setGame] = useState<Game | null>(null)
  const [gameEngine, setGameEngine] = useState<GameEngine | null>(null)
  const [loading, setLoading] = useState(true)
  const [startingGame, setStartingGame] = useState(false)
  const [error, setError] = useState('')
  const [soundEnabled, setSoundEnabled] = useState(true)
  const { celebrate, fireworks } = useConfetti()
  const { t } = useTranslation()

  const roundInfo = React.useMemo(() => {
    if (!gameEngine || !(gameEngine instanceof YahtzeeGame)) return { current: 1, total: getActiveCategories().length }
    const activeCategories = getActiveCategories(gameEngine.getMode())
    const totalCategories = activeCategories.length
    const players = gameEngine.getPlayers()
    const filledCounts = players.map(p => {
      const scorecard = gameEngine.getScorecard(p.id)
      return scorecard
        ? activeCategories.filter((category) => scorecard[category] !== undefined).length
        : 0
    })
    const maxFilled = filledCounts.length ? Math.max(...filledCounts) : 0
    const current = Math.min(totalCategories, maxFilled + 1)
    return { current, total: totalCategories }
  }, [gameEngine])

  // Chat state — messages/unread/typing live in useLobbyChat (#736), called
  // below once playAmbientSound is in scope
  const [chatMinimized, setChatMinimized] = useState(true) // Chat minimized by default
  const [waitingRoomTab, setWaitingRoomTab] = useState<'players' | 'chat'>('players')
  const [showLobbySettings, setShowLobbySettings] = useState(false)

  // Bot visualization state
  const [botMoveSteps, setBotMoveSteps] = useState<BotMoveStep[]>([])
  const [currentBotStepIndex, setCurrentBotStepIndex] = useState(0)
  const [botPlayerName, setBotPlayerName] = useState('')
  const [showingBotOverlay, setShowingBotOverlay] = useState(false)

  // Roll history and celebrations - with localStorage persistence
  const [rollHistory, setRollHistory] = useState<RollHistoryEntry[]>(() => {
    // Load from localStorage on mount
    const saved = readLocal(`rollHistory_${code}`)
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch (e) {
        clientLogger.error('Failed to parse saved roll history:', e)
      }
    }
    return []
  })
  const [celebrationEvent, setCelebrationEvent] = useState<CelebrationEvent | null>(null)
  const handleCelebrationComplete = useCallback(() => setCelebrationEvent(null), [])
  const [yahtzeeResultsHold, setYahtzeeResultsHold] = useState<{ gameId: string; releaseAt: number } | null>(null)

  // Mobile tabs state
  const [mobileActiveTab, setMobileActiveTab] = useState<TabId>('game')

  // Selected player for viewing their scorecard
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [profileUserId, setProfileUserId] = useState<string | null>(null)

  // Friends invite modal state
  const [showFriendsModal, setShowFriendsModal] = useState(false)
  const [selectedBotDifficulty, setSelectedBotDifficulty] = useState<BotDifficulty>('medium')
  const [isRequestingRematch, setIsRequestingRematch] = useState(false)

  // Leave confirmation modal state
  const [showLeaveConfirmModal, setShowLeaveConfirmModal] = useState(false)

  // Game interrupted overlay (player left → insufficient players, or game abandoned)
  const [gameInterruptedInfo, setGameInterruptedInfo] = useState<{
    playerName?: string
    reason: 'player_left' | 'abandoned'
  } | null>(null)

  // Players who have left mid-game (still shown in UI but greyed out)
  const [departedPlayerIds, setDepartedPlayerIds] = useState<Set<string>>(new Set())

  // Persist roll history to localStorage whenever it changes
  useEffect(() => {
    if (rollHistory.length > 0) {
      writeLocal(`rollHistory_${code}`, JSON.stringify(rollHistory))
    }
  }, [rollHistory, code])

  // Clear roll history from localStorage when game finishes
  useEffect(() => {
    if (gameEngine?.isGameFinished()) {
      removeLocal(`rollHistory_${code}`)
    }
  }, [gameEngine, code])

  useEffect(() => {
    if (
      lobby?.gameType !== 'yahtzee' ||
      !(gameEngine instanceof YahtzeeGame) ||
      !game?.id ||
      !gameEngine.isGameFinished()
    ) {
      return
    }

    setYahtzeeResultsHold((prev) => {
      if (prev?.gameId === game.id) {
        return prev
      }

      return {
        gameId: game.id,
        releaseAt: Date.now() + YAHTZEE_RESULTS_HOLD_MS,
      }
    })
  }, [game?.id, gameEngine, lobby?.gameType])

  useEffect(() => {
    if (!yahtzeeResultsHold || typeof window === 'undefined') {
      return
    }

    const remainingMs = Math.max(0, yahtzeeResultsHold.releaseAt - Date.now())
    const timer = window.setTimeout(() => {
      setYahtzeeResultsHold((prev) =>
        prev?.gameId === yahtzeeResultsHold.gameId ? null : prev
      )
    }, remainingMs)

    return () => window.clearTimeout(timer)
  }, [yahtzeeResultsHold])

  // Apply theme CSS variables to the lobby portal root so portaled components (e.g. Modal)
  // inherit them. We do NOT set these on <html> to avoid contaminating the global header/nav.
  useEffect(() => {
    const theme = lobby?.theme
    const el = document.getElementById('bd-lobby-portal')
    if (!el || !theme || theme === 'default') return
    const style = getThemePageStyle(theme) as Record<string, string>
    const vars = Object.entries(style).filter(([k]) => k.startsWith('--'))
    vars.forEach(([k, v]) => el.style.setProperty(k, v))
    return () => {
      vars.forEach(([k]) => el.style.removeProperty(k))
    }
  }, [lobby?.theme])

  // Track if this is initial page load to prevent sounds during hydration
  const isInitialLoadRef = React.useRef(true)
  const { isLeavingLobbyRef, leaveStartedAtRef, leaveApiOutcomeRef, leaveApiStatusCodeRef, leaveLobby } = useLeaveLobby(code, 'Leave lobby')
  const lifecycleRedirectInFlightRef = React.useRef(false)
  const stuckTurnRecoveryRef = React.useRef(createStuckTurnRecovery())
  const finishedGameSoundPlayedForRef = React.useRef<string | null>(null)
  const winSoundPlayedForRef = React.useRef<string | null>(null)
  const initializedMobileUiGameIdRef = React.useRef<string | null>(null)
  const yahtzeeMobileTurnStateRef = React.useRef<{
    currentPlayerId: string | null
    wasMyTurn: boolean
    rollsLeft: number | null
  }>({
    currentPlayerId: null,
    wasMyTurn: false,
    rollsLeft: null,
  })
  const hasLobbyPageInteractionRef = React.useRef(false)
  // #994: Yahtzee, Spy and Memory all render through this file, and until now it
  // applied every snapshot it was handed. The watermark and the in-flight flag
  // are owned here because the broadcast handler, the move submits and the lobby
  // snapshot all have to be judged against the same one.
  const freshnessRef = React.useRef(createFreshnessWatermark())
  const moveInFlightRef = React.useRef(false)

  // Mark initial load as complete after 2 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      isInitialLoadRef.current = false
    }, 2000)
    return () => clearTimeout(timer)
  }, [])

  // Require an interaction on this page (not just a previous page) before ambient sounds.
  useEffect(() => {
    if (typeof window === 'undefined') return

    const markInteracted = () => {
      hasLobbyPageInteractionRef.current = true
      window.removeEventListener('pointerdown', markInteracted)
      window.removeEventListener('keydown', markInteracted)
      window.removeEventListener('touchstart', markInteracted)
    }

    window.addEventListener('pointerdown', markInteracted, { once: true })
    window.addEventListener('keydown', markInteracted, { once: true })
    window.addEventListener('touchstart', markInteracted, { once: true })

    return () => {
      window.removeEventListener('pointerdown', markInteracted)
      window.removeEventListener('keydown', markInteracted)
      window.removeEventListener('touchstart', markInteracted)
    }
  }, [])

  // Sync soundEnabled state with sounds on mount
  useEffect(() => {
    setSoundEnabled(sounds.isEnabled())
  }, [])

  const playAmbientSound = useCallback(
    (soundName: string, options?: { volume?: number; loop?: boolean; force?: boolean }) => {
      if (isInitialLoadRef.current) return
      if (!sounds.hasUserInteracted()) return
      if (!hasLobbyPageInteractionRef.current) return
      sounds.play(soundName, options)
    },
    []
  )

  // Shared chat pipeline (#736) — history loading is wired up after
  // useRealtimeConnection below, which supplies isConnected.
  const {
    chatMessages,
    sendChatMessage,
    unreadCount: unreadMessageCount,
    resetUnread,
    someoneTyping,
    onChatMessage,
    onPlayerTyping,
    mergeHistoryMessages,
    setChatMessages,
  } = useLobbyChat({
    code,
    isChatVisible: !chatMinimized || mobileActiveTab === 'chat',
    onIncomingMessageSound: () => playAmbientSound('message'),
  })

  const lifecycleRedirectTarget = React.useMemo(
    () => getGameLobbiesRoute((lobby?.gameType as string) || DEFAULT_GAME_TYPE) ?? '/games',
    [lobby?.gameType]
  )

  const trackLeaveRedirectEvent = React.useCallback(
    (navigation: 'router_replace' | 'window_assign_fallback') => {
      const leaveStartedAt = leaveStartedAtRef.current
      if (leaveStartedAt === null) return

      trackLobbyLeaveRedirect({
        durationMs: Date.now() - leaveStartedAt,
        isGuest,
        source: 'lobby_page',
        navigation,
        apiOutcome: leaveApiOutcomeRef.current,
        ...(typeof leaveApiStatusCodeRef.current === 'number'
          ? { statusCode: leaveApiStatusCodeRef.current }
          : {}),
        ...(typeof lobby?.gameType === 'string' ? { gameType: lobby.gameType } : {}),
      })
    },
    [isGuest, lobby?.gameType, leaveApiOutcomeRef, leaveApiStatusCodeRef, leaveStartedAtRef]
  )

  const navigateAfterLeave = React.useCallback(() => {
    router.replace(lifecycleRedirectTarget)
    trackLeaveRedirectEvent('router_replace')

    if (typeof window === 'undefined') {
      return
    }

    window.setTimeout(() => {
      if (window.location.pathname.startsWith(`/lobby/${code}`)) {
        trackLeaveRedirectEvent('window_assign_fallback')
        window.location.assign(lifecycleRedirectTarget)
      }
    }, LEAVE_REDIRECT_FALLBACK_MS)
  }, [router, lifecycleRedirectTarget, code, trackLeaveRedirectEvent])

  useEffect(() => {
    void router.prefetch(lifecycleRedirectTarget)
  }, [router, lifecycleRedirectTarget])

  const triggerLifecycleRedirect = React.useCallback(
    (reason: string, options?: { toastKey?: string }) => {
      if (isLeavingLobbyRef.current || lifecycleRedirectInFlightRef.current) {
        return
      }

      lifecycleRedirectInFlightRef.current = true

      if (options?.toastKey) {
        showToast.error(options.toastKey, undefined, undefined, { id: 'lifecycle-redirect' })
      }

      clientLogger.warn('Triggering lobby lifecycle redirect', {
        code,
        reason,
        target: lifecycleRedirectTarget,
      })

      router.replace(lifecycleRedirectTarget)

      if (typeof window !== 'undefined') {
        window.setTimeout(() => {
          if (window.location.pathname.startsWith(`/lobby/${code}`)) {
            window.location.assign(lifecycleRedirectTarget)
          }
        }, LIFECYCLE_REDIRECT_FALLBACK_MS)
      }
    },
    [router, lifecycleRedirectTarget, code, isLeavingLobbyRef]
  )

  // Helper functions
  const getCurrentUserId = useCallback(() => {
    if (isGuest) return guestId
    return session?.user?.id
  }, [isGuest, guestId, session?.user?.id])

  const getCurrentUserName = useCallback(() => {
    if (isGuest) return guestName
    return (session?.user as { username?: string })?.username || session?.user?.name || 'You'
  }, [isGuest, guestName, session?.user])

  const isMyTurn = useCallback(() => {
    if (!gameEngine || !game) return false
    const currentPlayer = gameEngine.getCurrentPlayer()
    return currentPlayer?.id === getCurrentUserId()
  }, [gameEngine, game, getCurrentUserId])

  // Track previous current player to detect turn changes
  const prevCurrentPlayerIdRef = React.useRef<string | undefined>(undefined)

  // Auto-reset selectedPlayerId when turn changes (only if viewing current player's card automatically)
  useEffect(() => {
    if (gameEngine) {
      const currentPlayerId = gameEngine.getCurrentPlayer()?.id
      const currentUserId = getCurrentUserId()

      // Detect turn change
      const turnChanged = prevCurrentPlayerIdRef.current !== undefined &&
        prevCurrentPlayerIdRef.current !== currentPlayerId

      // Only reset if:
      // 1. Turn actually changed
      // 2. selectedPlayerId is null (auto-viewing current player) OR
      // 3. selectedPlayerId matches the previous current player (was following the turn automatically)
      if (turnChanged &&
        (selectedPlayerId === null || selectedPlayerId === prevCurrentPlayerIdRef.current)) {
        setSelectedPlayerId(null) // Reset to show new current player
      }

      // Update ref
      prevCurrentPlayerIdRef.current = currentPlayerId
    }
  }, [gameEngine, getCurrentUserId, selectedPlayerId])

  // Separate effect to track the complex expression
  const currentPlayerId = gameEngine?.getCurrentPlayer()?.id
  const prevPlayerIdRef = React.useRef<string | undefined>(undefined)

  useEffect(() => {
    // Track changes to current player ID and play sound when turn changes
    if (currentPlayerId && prevPlayerIdRef.current && currentPlayerId !== prevPlayerIdRef.current) {
      const currentUserId = getCurrentUserId()
      // Play sound for turn change
      if (currentPlayerId === currentUserId) {
        // It's now our turn - play turn change sound
        playAmbientSound('turnChange')
      } else if (prevPlayerIdRef.current === currentUserId) {
        // Turn moved away from us to another player - play turn change sound
        playAmbientSound('turnChange')
      }
    }
    prevPlayerIdRef.current = currentPlayerId
  }, [currentPlayerId, getCurrentUserId, playAmbientSound])

  // Create ref for loadLobby to avoid circular dependency
  const loadLobbyRef = React.useRef<((options?: { fresh?: boolean }) => Promise<void>) | null>(null)

  // Memoize socket event handlers to prevent infinite loops
  const onGameUpdate = useCallback(async (payload: GameUpdatePayload) => {
    clientLogger.log('📡 Received game-update:', payload)

    // Extract state from payload structure: { action: 'state-change', payload: { state: ... } }
    let state: unknown
    if ('state' in payload.payload && payload.payload.state) {
      state = payload.payload.state
    } else if (payload.state) {
      state = payload.state
    } else {
      state = payload.payload
    }

    if (state) {
      try {
        const parsedState = typeof state === 'string'
          ? JSON.parse(state)
          : state

        const parsedStatus =
          typeof parsedState?.status === 'string' ? parsedState.status : null
        if (isTerminalGameStatus(parsedStatus)) {
          triggerLifecycleRedirect(`game-update:${parsedStatus}`, {
            toastKey: 'lobby.gameAbandoned',
          })
          return
        }

        if (game?.id) {
          const gameId = game.id
          // A rematch is a different row; its state must not be written into the
          // game on screen, nor move that game's watermark.
          const payloadGameId = readGameStateId(parsedState)
          if (payloadGameId && payloadGameId !== gameId) {
            clientLogger.debug('Ignoring game-update for another game', { gameId, payloadGameId })
            return
          }
          // #994: broadcasts are fire-and-forget and take two hops the move
          // response does not, so one routinely lands after the state that
          // supersedes it. Applying it rewound the board - and in Yahtzee a
          // snapshot with rollsLeft 3 also wipes the local held dice, which
          // nothing ever restores.
          const freshness = decideFreshness(freshnessRef.current, parsedState, {
            moveInFlight: moveInFlightRef.current,
          })
          if (!freshness.accept) {
            clientLogger.debug('Ignoring stale game state', { gameId, reason: freshness.reason })
            return
          }
          const gt = lobby?.gameType as string || DEFAULT_GAME_TYPE
          const newEngine = await restoreGameEngineClient(gt, gameId, parsedState)
          setGameEngine(newEngine)

          if (
            newEngine instanceof YahtzeeGame &&
            gameEngine instanceof YahtzeeGame &&
            game?.players &&
            Array.isArray(game.players)
          ) {
            const scoreEventTimestamp =
              typeof parsedState.lastMoveAt === 'number' ? parsedState.lastMoveAt : Date.now()
            const scoredCategoryEntries: RollHistoryEntry[] = []

            for (const enginePlayer of newEngine.getPlayers()) {
              const previousScorecard = gameEngine.getScorecard(enginePlayer.id)
              const nextScorecard = newEngine.getScorecard(enginePlayer.id)
              const dbPlayer = game.players.find(
                (candidate) =>
                  candidate.userId === enginePlayer.id || candidate.id === enginePlayer.id
              )
              const playerName =
                dbPlayer?.user?.username ||
                dbPlayer?.name ||
                enginePlayer.name ||
                'Unknown'
              const isBot = !!(dbPlayer?.user?.bot || dbPlayer?.bot)
              const botId = dbPlayer?.user?.bot ? dbPlayer.userId : null
              const turnNumber = ALL_CATEGORIES.filter(
                (category) => nextScorecard?.[category] !== undefined
              ).length

              for (const category of ALL_CATEGORIES) {
                if (
                  previousScorecard?.[category] === undefined &&
                  nextScorecard?.[category] !== undefined
                ) {
                  scoredCategoryEntries.push({
                    id: `score-${enginePlayer.id}-${category}-${scoreEventTimestamp}`,
                    type: 'score',
                    playerName,
                    turnNumber,
                    category,
                    scoredPoints: nextScorecard[category] ?? 0,
                    isBot,
                    botId,
                    timestamp: scoreEventTimestamp,
                  })
                }
              }
            }

            if (scoredCategoryEntries.length > 0) {
              setRollHistory((prev) => {
                const existingIds = new Set(prev.map((entry) => entry.id))
                const uniqueEntries = scoredCategoryEntries.filter(
                  (entry) => !existingIds.has(entry.id)
                )
                if (uniqueEntries.length === 0) return prev
                return [...prev, ...uniqueEntries].slice(-20)
              })
            }
          }

          // Play win sound for Memory/Spy (Yahtzee handled in useGameActions)
          if (!(newEngine instanceof YahtzeeGame) && newEngine.isGameFinished()) {
            const winner = newEngine.checkWinCondition()
            const currentUserId = getCurrentUserId()
            if (winner && winner.id === currentUserId && winSoundPlayedForRef.current !== game.id) {
              winSoundPlayedForRef.current = game.id
              playAmbientSound('win')
            }
          }

          // Update game object with new state
          setGame((prevGame) => {
            if (!prevGame || prevGame.id !== gameId) return prevGame
            return {
              ...prevGame,
              state: JSON.stringify(parsedState),
            }
          })

          // Sync roll history from game state
          if (parsedState.data?.lastRoll && game?.players && Array.isArray(game.players)) {
            const lastRoll = parsedState.data.lastRoll
            // Find player with proper type checking
            const player = game.players.find(
              (p) => p.userId === lastRoll.playerId || p.id === lastRoll.playerId
            )

            const playerIsBot = !!(player?.user?.bot || player?.bot)
            if (player && Array.isArray(lastRoll.dice) && lastRoll.timestamp) {
              const turnNumber = getYahtzeeTurnNumberFromScorecard(
                newEngine instanceof YahtzeeGame ? newEngine.getScorecard(lastRoll.playerId) : null
              )
              const currentUserId = getCurrentUserId()
              const rollEntryId = `${lastRoll.playerId}-${lastRoll.timestamp}`

              setRollHistory(prev => {
                const exists = prev.some((entry) => entry.id === rollEntryId)

                if (exists) return prev

                if (!playerIsBot && lastRoll.playerId !== currentUserId) {
                  playAmbientSound('diceRoll', { force: true })
                }

                const newRollEntry: RollHistoryEntry = {
                  id: rollEntryId,
                  type: 'roll',
                  playerName: player.user?.username || player.name || 'Unknown',
                  dice: lastRoll.dice,
                  rollNumber: lastRoll.rollNumber,
                  turnNumber: turnNumber,
                  held: normalizeHeldIndexes(lastRoll.held),
                  isBot: playerIsBot,
                  botId: playerIsBot ? (player.userId ?? null) : null,
                  timestamp: lastRoll.timestamp,
                }

                return [...prev, newRollEntry].slice(-20)
              })
            }
          }
        }

        // Bot move detection is handled through server-emitted bot-action events.
      } catch (e) {
        clientLogger.error('Failed to parse game state:', e)
      }
    } else {
      clientLogger.warn('📡 game-update received but no state found:', payload)
    }
  }, [game?.id, game?.players, gameEngine, getCurrentUserId, lobby?.gameType, playAmbientSound, triggerLifecycleRedirect])

  const onLobbyUpdate = useCallback((data: LobbyUpdatePayload) => {
    clientLogger.log('📡 Received lobby-update:', data)
    // Use ref to avoid circular dependency
    if (loadLobbyRef.current) {
      loadLobbyRef.current()
    }
  }, [])

  const onPlayerJoined = useCallback((data: PlayerJoinedPayload) => {
    clientLogger.log('📡 Player joined:', data)
    // Use ref to avoid circular dependency
    if (loadLobbyRef.current) {
      loadLobbyRef.current()
    }

    // Bots show their own toast from addBot() — skip the generic joined toast
    if (data.isBot) return

    // Show notification and play sound only after initial load
    const currentUserId = isGuest ? guestId : session?.user?.id
    if (data.username && data.userId !== currentUserId) {
      showToast.success('toast.playerJoined', undefined, { player: data.username })
      playAmbientSound('playerJoin')
    }
  }, [isGuest, guestId, session?.user?.id, playAmbientSound])

  const onGameStarted = useCallback((data: GameStartedPayload) => {
    clientLogger.log('📡 Game started:', data)
    // Use ref to avoid circular dependency
    if (loadLobbyRef.current) {
      loadLobbyRef.current()
    }

    // Show toast for non-host players (host already saw it in handleStartGame)
    const currentUserId = isGuest ? guestId : session?.user?.id
    const isHost = lobby?.creatorId === currentUserId
    if (!isHost && data.firstPlayerName) {
      showToast.success('toast.gameStarted', undefined, { player: data.firstPlayerName })
    }

    playAmbientSound('gameStart')
  }, [isGuest, guestId, session?.user?.id, lobby?.creatorId, playAmbientSound])

  const onBotAction = useCallback((event: BaseBotActionEvent) => {
    clientLogger.log('🤖 Received bot-action:', event)

    const botName = event.botName || 'Bot'

    // Roll history is synced from authoritative game-update snapshots.
    // Avoid duplicating bot rolls here with optimistic local entries.
    if (event.type === 'roll' && event.data?.dice) {
      playAmbientSound('diceRoll', { force: true })
    }

    if (event.type === 'hold' && Array.isArray((event as YahtzeeBotActionEvent).data?.held) && ((event as YahtzeeBotActionEvent).data?.held?.length ?? 0) > 0) {
      playAmbientSound('click', { force: true })
    }

    // Only show toast for final scoring action - skip thinking/hold/roll toasts
    if (event.type === 'score') {
      const scoreEvent = event as YahtzeeBotActionEvent
      const category = scoreEvent.data?.category
      const score = scoreEvent.data?.score

      if (typeof category === 'string' && typeof score === 'number') {
        const celebration = detectCelebration(
          Array.isArray(scoreEvent.data?.dice) ? scoreEvent.data.dice as number[] : [],
          category,
          score
        )
        const shown = showYahtzeeCategoryToast({
          category,
          score,
          playerName: botName,
          celebration,
          id: `yahtzee-bot-score-${botName}-${category}-${score}`,
        })

        if (!shown) {
          showToast.successText(event.message)
        }
      } else {
        showToast.successText(event.message)
      }

      playAmbientSound('score')
    }

    // Log all actions to console for debugging
    clientLogger.log(`🤖 ${event.message}`)
  }, [playAmbientSound])

  const prevSpectatorCountRef = useRef(0)
  const onSpectatorCountChange = useCallback((count: number) => {
    setLobby((prev) => {
      if (!prev) return prev
      if (count > 0 && prevSpectatorCountRef.current === 0 && prev.spectatorCount === 0) {
        showToast.info('lobby.spectatorWatching')
      }
      prevSpectatorCountRef.current = count
      return { ...prev, spectatorCount: count }
    })
  }, [])

  const onGameAbandoned = useCallback((data: { gameId: string; reason?: string }) => {
    clientLogger.log('📡 Game abandoned:', data)

    if (isLeavingLobbyRef.current) {
      clientLogger.log('Skipping game-abandoned handling during manual leave')
      return
    }

    if (loadLobbyRef.current) {
      void loadLobbyRef.current()
    }

    setGameInterruptedInfo({ reason: 'abandoned' })
  }, [isLeavingLobbyRef])

  const minPlayersRequired = React.useMemo(() => {
    return getLobbyPlayerRequirements(lobby?.gameType as string | undefined).minPlayersRequired
  }, [lobby?.gameType])

  const onPlayerLeft = useCallback((data: {
    userId: string
    username?: string
    playerName?: string
    remainingPlayers?: number
    nextCreatorId?: string
    nextCreatorName?: string
    hostLeft?: boolean
    isBot?: boolean
    gameTerminal?: boolean
    kicked?: boolean
  }) => {
    clientLogger.log('📡 Player left:', data)

    if (isLeavingLobbyRef.current) {
      return
    }

    // Bot kick already toasted from kickBot() — skip the generic left toast + sound
    if (data.isBot) {
      if (loadLobbyRef.current) void loadLobbyRef.current()
      return
    }

    // Kicked player: redirect them out, others see a toast
    if (data.kicked) {
      const currentUserId = isGuest ? guestId : session?.user?.id
      if (data.userId === currentUserId) {
        showToast.error('toast.youWereKicked')
        triggerLifecycleRedirect('kicked')
        return
      }
      const departedName = data.username || data.playerName
      if (departedName) {
        showToast.info('toast.playerWasKicked', undefined, { player: departedName })
      }
      if (loadLobbyRef.current) void loadLobbyRef.current()
      return
    }

    const departedPlayerName = data.username || data.playerName
    playAmbientSound('playerLeave')

    // Track departed player for grey UI display
    if (data.userId) {
      setDepartedPlayerIds(prev => new Set([...prev, data.userId]))
    }

    // Host left post-game and nobody could take the seat (#1012) — when somebody did,
    // the server sends nextCreatorId instead and the branch below announces the new host.
    if (data.hostLeft) {
      showToast.info('toast.hostLeftSession')
      if (loadLobbyRef.current) {
        void loadLobbyRef.current()
      }
      return
    }

    if (data.nextCreatorId) {
      const currentUserId = isGuest ? guestId : session?.user?.id
      if (data.nextCreatorId === currentUserId) {
        showToast.success('toast.youAreNowHost')
      } else if (data.nextCreatorName) {
        showToast.info('toast.hostReassigned', undefined, { player: data.nextCreatorName })
      }
    }

    if (!data.gameTerminal && typeof data.remainingPlayers === 'number' && data.remainingPlayers < minPlayersRequired) {
      setGameInterruptedInfo({ playerName: departedPlayerName, reason: 'player_left' })
      return
    }

    // Game continues — show a toast and refresh
    if (departedPlayerName) {
      showToast.info('toast.playerLeft', undefined, { player: departedPlayerName })
    }
    if (loadLobbyRef.current) {
      void loadLobbyRef.current()
    }
  }, [isGuest, guestId, session?.user?.id, minPlayersRequired, triggerLifecycleRedirect, playAmbientSound, isLeavingLobbyRef])

  const currentUserIdForMembership = isGuest ? guestId : session?.user?.id
  const canJoinSocketLobbyRoom = React.useMemo(() => {
    if (!lobby || !currentUserIdForMembership) {
      return false
    }

    const lobbyData = lobby
    if (lobbyData?.creatorId === currentUserIdForMembership) {
      return true
    }

    const activeGameFromState =
      game && ['waiting', 'playing', 'finished'].includes(String(game.status))
        ? game
        : null
    const activeGameFromLobby = Array.isArray(lobbyData?.games)
      ? lobbyData.games!.find((candidate: Game) => ['waiting', 'playing'].includes(String(candidate?.status)))
      : null
    const activeGame = activeGameFromState || activeGameFromLobby
    const players = Array.isArray(activeGame?.players) ? activeGame.players : []

    return players.some((player: GamePlayer) => player?.userId === currentUserIdForMembership)
  }, [lobby, game, currentUserIdForMembership])

  const handleGameReset = useCallback(() => {
    // A rematch starts a new series, so the old game's stamps must not gate it.
    resetFreshnessWatermark(freshnessRef.current)
    if (loadLobbyRef.current) void loadLobbyRef.current({ fresh: true })
  }, [])

  // Realtime connection hook - must be before useLobbyActions
  const { isConnected, isReconnecting, reconnectAttempt } = useRealtimeConnection({
    code,
    shouldJoinLobbyRoom: canJoinSocketLobbyRoom,
    onGameUpdate,
    onChatMessage,
    onPlayerTyping,
    onLobbyUpdate,
    onPlayerJoined,
    onGameStarted,
    onGameAbandoned,
    onPlayerLeft,
    onBotAction,
    onSpectatorCountChange,
    onStateSync: async () => {
      if (loadLobbyRef.current) {
        // Reconnect resync (#987): the gap is exactly when an in-flight
        // snapshot is too old to answer with (#996).
        await loadLobbyRef.current({ fresh: true })
      }
    },
    onGameReset: handleGameReset,
  })

  useLobbyChatHistory({ code, isConnected, isReconnecting, mergeHistoryMessages })

  const [isReturningToWaiting, setIsReturningToWaiting] = React.useState(false)

  const handleReturnToWaiting = useCallback(async () => {
    setIsReturningToWaiting(true)
    try {
      const res = await fetchWithGuest(`/api/lobby/${code}/return-to-waiting`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to return to waiting room')
      if (loadLobbyRef.current) await loadLobbyRef.current()
    } catch (error) {
      console.error('Failed to return to waiting room:', error)
    } finally {
      setIsReturningToWaiting(false)
    }
  }, [code])

  // Calculate once to avoid calling functions repeatedly
  const userId = getCurrentUserId()
  const username = getCurrentUserName()

  // Lobby actions hook - after socket is initialized
  const {
    loadLobby,
    addBotToLobby,
    kickBot,
    kickPlayer,
    unkickPlayer,
    changeBotDifficulty,
    handleJoinLobby,
    handleGuestJoinLobby,
    joinRefusalCode,
    handleStartGame,
    updateLobbySettings,
    guestNameInput,
    setGuestNameInput,
    isJoiningLobby,
    password,
    setPassword,
  } = useLobbyActions({
    code,
    lobby,
    game,
    freshnessRef,
    setGame,
    setLobby,
    setGameEngine,
    setTimerActive: (active) => { }, // Will be set by timer hook
    setTimeLeft: (time) => { },
    setRollHistory,
    setCelebrationEvent,
    setChatMessages,
    isGuest,
    guestId,
    guestName,
    guestToken,
    userId,
    username,
    setGuestMode,
    setError,
    setLoading,
    setStartingGame,
    selectedBotDifficulty,
  })

  // Update ref with loadLobby function
  React.useEffect(() => {
    loadLobbyRef.current = loadLobby
  })

  const reconcileWithServerSnapshot = React.useCallback(async () => {
    if (!loadLobbyRef.current) return
    // Every caller of this means "read the truth as of now": a bot turn that
    // just committed, a move that just failed, a turn that looks stuck. A
    // snapshot request that was already in flight cannot answer that (#996).
    await loadLobbyRef.current({ fresh: true })
  }, [])

  useEffect(() => {
    if (!lobby?.id || !loadLobbyRef.current) {
      return
    }

    if (game?.status !== 'waiting' || startingGame || error) {
      return
    }

    const syncFromServer = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return
      }
      if (isLeavingLobbyRef.current || !loadLobbyRef.current) {
        return
      }
      void loadLobbyRef.current().catch((syncError) => {
        clientLogger.warn(
          'Waiting lobby fallback sync failed:',
          syncError instanceof Error ? syncError.message : String(syncError)
        )
      })
    }

    const intervalId = window.setInterval(syncFromServer, WAITING_LOBBY_SYNC_INTERVAL_MS)
    window.addEventListener('focus', syncFromServer)
    document.addEventListener('visibilitychange', syncFromServer)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', syncFromServer)
      document.removeEventListener('visibilitychange', syncFromServer)
    }
  }, [error, game?.status, lobby?.id, startingGame, isLeavingLobbyRef])

  // Bot turn automation hook
  const { triggerBotTurn } = useBotTurn({
    game,
    gameEngine,
    code,
    isGameStarted: game?.status === 'playing',
    isSpectator: game?.status === 'playing' && !game?.players?.some(
      p => p.userId === getCurrentUserId() || (isGuest && p.userId === guestId)
    ),
    reconcileWithServerSnapshot,
  })

  // Create refs for game actions to use in timer callback
  const handleScoreRef = React.useRef<((category: YahtzeeCategory, autoActionContext?: AutoActionContext) => Promise<GameEngine | null>) | null>(null)
  const handleRollDiceRef = React.useRef<((autoActionContext?: AutoActionContext) => Promise<GameEngine | null>) | null>(null)

  const buildAutoActionContext = React.useCallback(
    (engine: GameEngine, playerId: string, existingDebounceKey?: string): AutoActionContext => {
      const state = engine.getState()
      const debounceKey =
        existingDebounceKey ||
        `${game?.id || 'unknown'}:${playerId}:${state.currentPlayerIndex}:${state.lastMoveAt ?? 'none'}`

      return {
        source: 'turn-timeout',
        debounceKey,
        turnSnapshot: {
          currentPlayerId: playerId,
          currentPlayerIndex: state.currentPlayerIndex,
          lastMoveAt: typeof state.lastMoveAt === 'number' ? state.lastMoveAt : null,
          rollsLeft: engine instanceof YahtzeeGame ? engine.getRollsLeft() : 0,
          updatedAt: state.updatedAt ? String(state.updatedAt) : null,
        },
      }
    },
    [game?.id]
  )

  // Game timer hook - pass turnTimerLimit from lobby settings
  const turnTimerLimit = (lobby?.turnTimer as number) || 60
  const { timeLeft, timerActive } = useGameTimer({
    isMyTurn: isMyTurn(),
    gameState: gameEngine?.getState() || null,
    turnTimerLimit,
    onTimeout: async (): Promise<boolean> => {
      const mine = isMyTurn()

      if (!mine) {
        if (gameEngine && game?.id && Array.isArray(game?.players)) {
          const currentPlayer = gameEngine.getCurrentPlayer()
          const currentGamePlayer = currentPlayer
            ? game.players.find((player) => player.userId === currentPlayer.id)
            : null
          const isBotTurn = !!(currentGamePlayer?.user?.bot || currentGamePlayer?.bot)

          // Fail-safe: if bot turn is stuck, force-trigger bot logic.
          // This is safe with server-side locking/idempotency guards.
          if (isBotTurn && currentPlayer?.id) {
            clientLogger.warn('⏰ Timer expired on bot turn, triggering fallback bot action', {
              botUserId: currentPlayer.id,
              gameId: game.id,
              currentPlayerIndex: gameEngine.getState().currentPlayerIndex,
            })
            void triggerBotTurn(currentPlayer.id, game.id)
            return false
          }
        }

        // #989: the clock ran out on a human who is not here. Only their own
        // browser submits a timeout and Yahtzee has no server-side fallback, so
        // the table sat on a dead turn until somebody reloaded — which abandons
        // the game and loses the scorecards. A lobby GET sweeps them once their
        // heartbeat is 30s stale and the leave path steps the turn off the seat
        // (#992). Throttled, and it gives up after a minute.
        const decision = stuckTurnRecoveryRef.current.decide(
          turnSignatureOf(gameEngine?.getState().currentPlayerIndex, gameEngine?.getState().lastMoveAt),
          Date.now()
        )
        if (decision === 'give-up') return true
        if (decision === 'resync') {
          clientLogger.warn('⏰ Turn timer expired on an absent player, asking the server', { code })
          void reconcileWithServerSnapshot()
        }
        return false
      }

      if (!gameEngine || !(gameEngine instanceof YahtzeeGame)) {
        return true
      }

      const scoreHandler = handleScoreRef.current
      const hasScoreHandler = !!scoreHandler

      if (!hasScoreHandler) {
        clientLogger.warn('⏰ Timer expired but conditions not met', {
          isMyTurn: mine,
          hasGameEngine: !!gameEngine,
          hasHandleScore: hasScoreHandler
        })
        // Transient state race (engine/handler not ready) - retry.
        return false
      }

      clientLogger.warn('⏰ Timer expired, auto-selecting best available category')

      let workingEngine: YahtzeeGame = gameEngine
      const currentPlayer = workingEngine.getCurrentPlayer()

      if (!currentPlayer) {
        clientLogger.error('⏰ No current player found')
        return false
      }

      const initialContext = buildAutoActionContext(workingEngine, currentPlayer.id)
      let autoActionContext = initialContext

      // If player hasn't rolled yet (rollsLeft === 3), we MUST roll first
      // This is a Yahtzee rule - you can't score without rolling
      if (workingEngine.getRollsLeft() === 3) {
        if (!handleRollDiceRef.current) {
          clientLogger.error('⏰ Player hasn\'t rolled but handleRollDice not available')
          showToast.error('toast.timerRollFirst')
          return false
        }

        clientLogger.log('⏰ Player hasn\'t rolled - auto-rolling once before scoring')
        try {
          // Roll once with server-side debounce/guard context
          const rolledEngine = await handleRollDiceRef.current(autoActionContext)
          if (!rolledEngine) {
            clientLogger.log('⏰ Auto-roll skipped by server guard')
            return false
          }
          if (!(rolledEngine instanceof YahtzeeGame)) {
            clientLogger.log('⏰ Auto-roll returned non-Yahtzee engine')
            return false
          }
          workingEngine = rolledEngine

          // Keep the same debounce key, but refresh turn snapshot after roll.
          const postRollPlayer = workingEngine.getCurrentPlayer()
          if (!postRollPlayer || postRollPlayer.id !== currentPlayer.id) {
            clientLogger.log('⏰ Turn changed after auto-roll, skipping auto-score')
            return true
          }
          autoActionContext = buildAutoActionContext(workingEngine, postRollPlayer.id, initialContext.debounceKey)
        } catch (error) {
          clientLogger.error('⏰ Failed to auto-roll:', error)
          return false
        }
      }

      // Get final state from authoritative engine after potential auto-roll
      const finalDice = workingEngine.getDice()
      const scorecard = workingEngine.getScorecard(currentPlayer.id)

      if (!scorecard) {
        clientLogger.error('⏰ No scorecard found')
        return false
      }

      // Use smart category selection
      const bestCategory = selectBestAvailableCategory(finalDice, scorecard, workingEngine.getMode())
      const score = calculateScore(finalDice, bestCategory)

      clientLogger.log('⏰ Auto-scoring:', {
        category: bestCategory,
        score,
        dice: finalDice,
        rollsUsed: 3 - workingEngine.getRollsLeft()
      })

      try {
        const scoredEngine = await scoreHandler(bestCategory, autoActionContext)
        if (!scoredEngine) {
          // Server returned 409 (TURN_ALREADY_ENDED) — turn already advanced server-side.
          // Reconcile to pull fresh state so the client unsticks immediately.
          clientLogger.log('⏰ Auto-score skipped by server guard, reconciling state')
          try { await reconcileWithServerSnapshot() } catch {}
          return true
        }

        const appliedEngine = scoredEngine instanceof YahtzeeGame ? scoredEngine : null
        const updatedScorecard = appliedEngine?.getScorecard(currentPlayer.id)

        // Show timer toast only after the auto-score was actually applied.
        if (updatedScorecard && updatedScorecard[bestCategory] !== undefined) {
          const displayName = CATEGORY_DISPLAY_NAMES[bestCategory]

          if (score === 0) {
            showToast.error(
              'toast.timerScoredZero',
              undefined,
              { category: displayName },
              { duration: 4000 }
            )
          } else {
            showToast.custom(
              'toast.timerScored',
              <Icon name="clock" size={18} />,
              undefined,
              { score, category: displayName },
              { duration: 4000 }
            )
          }
        } else {
          clientLogger.log('⏰ Auto-score applied without expected category fill, skipping timer toast', {
            category: bestCategory,
            playerId: currentPlayer.id,
          })
        }

        return true
      } catch (error) {
        clientLogger.error('⏰ Failed to auto-score:', error)
        return false
      }
    },
  })

  // Game actions hook
  const {
    handleRollDice,
    handleToggleHold,
    handleScore,
    isMoveInProgress,
    isRolling,
    isScoring,
    isStateReverting,
    held, // Local held state for dice locking
  } = useGameActions({
    game,
    gameEngine,
    setGameEngine,
    isGuest,
    guestId,
    guestName,
    guestToken,
    userId,
    username,
    isMyTurn: isMyTurn(),
    code,
    setRollHistory,
    setCelebrationEvent,
    setTimerActive: () => { }, // Timer managed by useGameTimer
    celebrate,
    fireworks,
    reconcileWithServerSnapshot,
    freshnessRef,
    moveInFlightRef,
  })

  // Update refs for timer
  React.useEffect(() => {
    handleScoreRef.current = handleScore
    handleRollDiceRef.current = handleRollDice
  }, [handleScore, handleRollDice])

  // Countdown tick for last 3 seconds of turn timer
  React.useEffect(() => {
    if (timerActive && isMyTurn() && timeLeft > 0 && timeLeft <= 3) {
      playAmbientSound('countdown')
    }
  }, [timeLeft, timerActive, playAmbientSound])

  // Load lobby on mount
  useEffect(() => {
    if (status === 'loading') return
    if (isGuest && !guestToken) {
      return
    }

    // Call via ref to avoid dependency on loadLobby function
    if (loadLobbyRef.current) {
      void loadLobbyRef.current()
    }
  }, [status, isGuest, guestToken, code])

  // Load chat history on initial connect (and re-load on reconnect)
  useEffect(() => {
    if (lobby?.gameType === 'memory' && game?.status === 'playing') {
      resetUnread()
    }
  }, [chatMessages.length, game?.status, lobby?.gameType, resetUnread])

  // Handle bot overlay progression
  useEffect(() => {
    if (!showingBotOverlay || botMoveSteps.length === 0) return

    let timer: NodeJS.Timeout

    if (currentBotStepIndex < botMoveSteps.length - 1) {
      timer = setTimeout(() => {
        setCurrentBotStepIndex(prev => prev + 1)
      }, 2000)
    } else {
      timer = setTimeout(() => {
        setShowingBotOverlay(false)
        setBotMoveSteps([])
        setCurrentBotStepIndex(0)
      }, 2500)
    }

    return () => clearTimeout(timer)
  }, [showingBotOverlay, currentBotStepIndex, botMoveSteps])

  // Handle celebration detection on game updates
  useEffect(() => {
    if (!gameEngine || !game || !(gameEngine instanceof YahtzeeGame)) return

    if (gameEngine.isGameFinished()) {
      if (finishedGameSoundPlayedForRef.current === game.id) {
        return
      }

      const dice = gameEngine.getDice()
      const celebration = detectCelebration(dice)
      if (celebration) {
        setCelebrationEvent(celebration)
        playAmbientSound('celebration')
        finishedGameSoundPlayedForRef.current = game.id
      }
    }
  }, [gameEngine, game, playAmbientSound])

  const handleLeaveLobby = () => {
    if (isLeavingLobbyRef.current) {
      return
    }

    setShowLeaveConfirmModal(false)

    leaveLobby((result) => {
      if (result.outcome !== 'ok') return
      const data = result.payload as { gameAbandoned?: boolean } | null
      if (data?.gameAbandoned) {
        showToast.info('lobby.gameAbandoned', undefined, undefined, { id: 'leave-lobby-result' })
        return
      }
      showToast.success('lobby.leftLobby', undefined, undefined, { id: 'leave-lobby-result' })
    })

    navigateAfterLeave()
  }

  const handleAddBot = async (difficulty: BotDifficulty) => {
    // Remember the choice so the auto-bot on Start Game uses the same level.
    setSelectedBotDifficulty(difficulty)
    await addBotToLobby({ difficulty })
  }

  const handleInviteFriends = useCallback(async (friendIds: string[]) => {
    if (!lobby || friendIds.length === 0) {
      return { invitedCount: 0, skippedCount: 0 }
    }

    clientLogger.log('Inviting friends to lobby', { friendIds, lobbyCode: code })

    try {
      const response = await fetchWithGuest(`/api/lobby/${code}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ friendIds }),
      })

      const result = await response.json().catch(() => null)
      if (!response.ok) {
        const inviteError = new Error(
          (typeof result?.error === 'string' && result.error) || 'Failed to send invites'
        ) as Error & { translationKey?: string }
        if (typeof result?.translationKey === 'string') {
          inviteError.translationKey = result.translationKey
        }
        throw inviteError
      }

      const invitedCount =
        typeof result?.invitedCount === 'number' ? result.invitedCount : friendIds.length
      const skippedCount = Array.isArray(result?.skippedFriendIds) ? result.skippedFriendIds.length : 0

      clientLogger.log('Lobby invites sent', {
        lobbyCode: code,
        invitedCount,
        skippedCount,
      })
      return { invitedCount, skippedCount }
    } catch (error) {
      clientLogger.error('Failed to invite friends', error as Error)
      throw error
    }
  }, [lobby, code])

  const handleRequestRematch = useCallback(async () => {
    if (isRequestingRematch) {
      return
    }

    setIsRequestingRematch(true)
    showToast.loading('toast.rematchRequestSending', undefined, undefined, { id: 'rematch-request' })

    try {
      const response = await fetchWithGuest(`/api/lobby/${code}/rematch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const result = await response.json().catch(() => null)
      if (!response.ok) {
        const translationKey =
          typeof result?.translationKey === 'string' ? result.translationKey : null
        const fallbackMessage =
          (typeof result?.error === 'string' && result.error) || 'Failed to request rematch'

        if (translationKey) {
          showToast.error(translationKey, undefined, undefined, { id: 'rematch-request' })
        } else {
          showToast.error(
            'toast.rematchRequestFailed',
            undefined,
            { message: fallbackMessage },
            { id: 'rematch-request' }
          )
        }
        return
      }

      const notifiedCount =
        typeof result?.notifiedCount === 'number' ? result.notifiedCount : 0

      if (notifiedCount > 0) {
        showToast.success('toast.rematchRequestSent', undefined, { count: notifiedCount }, { id: 'rematch-request' })
      } else {
        showToast.info('toast.rematchNoPlayers', undefined, undefined, { id: 'rematch-request' })
      }
    } catch (error) {
      clientLogger.error('Failed to request rematch', error as Error)
      showToast.errorFrom(error, 'toast.rematchRequestFailed', { id: 'rematch-request' })
    } finally {
      setIsRequestingRematch(false)
    }
  }, [code, isRequestingRematch])

  const isCreator = lobby?.creatorId === session?.user?.id ||
    (isGuest && lobby?.creatorId === guestId)
  const isCurrentUserPremium = !!(game?.players?.find(p => p.userId === getCurrentUserId())?.user as { isPremium?: boolean } | undefined)?.isPremium
  const playerCount = game?.players?.length || 0
  // Can start game if user is creator (single player games are allowed - bot will be auto-added)
  const canStartGame = isCreator
  const isInGame = game?.players?.some(p =>
    p.userId === getCurrentUserId() ||
    (isGuest && p.userId === guestId)
  )
  const isGameStarted = game?.status === 'playing'
  const isSpectator = isGameStarted && !isInGame

  // #1024's undo needs the host to see who was removed, and the waiting room is the
  // only screen with room for it (#899). Nobody but the host is offered the list.
  const { kickedPlayers, refreshKickedPlayers } = useKickedPlayers({
    code,
    enabled: isCreator && !isGameStarted,
    isGuest,
    guestId,
    guestName,
    guestToken,
  })
  const handleKickPlayer = useCallback(async (playerId: string) => {
    await kickPlayer(playerId)
    void refreshKickedPlayers()
  }, [kickPlayer, refreshKickedPlayers])
  const handleUnkickPlayer = useCallback(async (kickedUserId: string) => {
    await unkickPlayer(kickedUserId)
    void refreshKickedPlayers()
  }, [unkickPlayer, refreshKickedPlayers])

  // Zero-signal disconnect detection (#675) — only real participants (not
  // spectators, who aren't Players rows) need to heartbeat.
  useLobbyHeartbeat(code, Boolean(isInGame))
  const finishedYahtzeeEngine =
    lobby?.gameType === 'yahtzee' &&
    gameEngine instanceof YahtzeeGame &&
    gameEngine.isGameFinished()
      ? gameEngine
      : null
  const shouldShowHeldYahtzeeResults = Boolean(
    finishedYahtzeeEngine &&
    game?.id &&
    yahtzeeResultsHold?.gameId === game.id
  )
  const joinViewerMode = status === 'authenticated'
    ? 'authenticated'
    : isGuest
      ? 'guest'
      : 'anonymous'
  // #957: an invite outlives the free seat it was shared for. The room fills in the
  // seconds between the share and the tap, and in a two-seat game (tic-tac-toe, connect
  // four, RPS) the result overlay's "Play again with friends" is always shared from a
  // full room. So a refused visitor is offered the same game in a room of their own
  // rather than the lobbies list. The guard has to be the create page's own, not
  // isTemporarilyUnavailableGameType: that one is false for every type it has never
  // heard of, and the page would answer the button with the default game's form.
  const fullLobbyCreateRoute = canCreateLobbyForGameType(lobby?.gameType)
    ? getLobbyCreateRoute(lobby?.gameType)
    : null

  // /lobby/create sends an anonymous viewer back to the home page, so the name they
  // already typed into this form becomes their guest session instead of being asked for
  // a second time. JoinPrompt disables the button until that name is usable.
  const createOwnLobbyInFlightRef = useRef(false)
  const handleCreateOwnLobby = useCallback(async () => {
    if (!fullLobbyCreateRoute) return
    // The button carries the join button's disabled rule, and that rule turns on
    // `isJoining`, which nothing here sets – so a second tap while the guest session is
    // still being minted would mint a second one. The ref stays set on success: the push
    // that follows is the last thing this screen does.
    if (createOwnLobbyInFlightRef.current) return
    createOwnLobbyInFlightRef.current = true

    if (joinViewerMode === 'anonymous') {
      try {
        await setGuestMode(guestNameInput.trim())
      } catch (error) {
        createOwnLobbyInFlightRef.current = false
        // The reason is worth showing: a name already in use answers 409 with its own
        // translation key, and a generic failure toast would leave the visitor tapping
        // the same rejected name again.
        const err = error as Error & { translationKey?: string }
        if (err?.translationKey) {
          showToast.error(err.translationKey)
        } else {
          showToast.errorFrom(err, 'guest.startFailed')
        }
        return
      }
    }
    router.push(fullLobbyCreateRoute)
  }, [fullLobbyCreateRoute, guestNameInput, joinViewerMode, router, setGuestMode])

  const joinIdentityKey = status === 'authenticated'
    ? `user:${session?.user?.id || 'authenticated'}`
    : isGuest && guestId
      ? `guest:${guestId}`
      : null
  const autoJoinAttemptKey = joinIdentityKey ? `${code}:${joinIdentityKey}` : null
  const autoJoinAttemptedRef = React.useRef<string | null>(null)
  const shouldAutoJoinPublicLobby = Boolean(
    lobby &&
    !lobby.isPrivate &&
    !isInGame &&
    !isGameStarted &&
    autoJoinAttemptKey
  )
  const showAutoJoinLoadingState = Boolean(
    shouldAutoJoinPublicLobby &&
    autoJoinAttemptKey &&
    autoJoinAttemptedRef.current === autoJoinAttemptKey &&
    !error
  )

  useEffect(() => {
    if (!shouldAutoJoinPublicLobby || !autoJoinAttemptKey || isJoiningLobby) {
      return
    }

    if (autoJoinAttemptedRef.current === autoJoinAttemptKey) {
      return
    }

    autoJoinAttemptedRef.current = autoJoinAttemptKey
    void handleJoinLobby()
  }, [autoJoinAttemptKey, handleJoinLobby, isJoiningLobby, shouldAutoJoinPublicLobby])

  useEffect(() => {
    if (isLeavingLobbyRef.current) {
      return
    }

    const redirectReason = resolveLifecycleRedirectReason({
      gameStatus: game?.status,
      lobbyIsActive: lobby?.isActive,
    })

    if (redirectReason) {
      triggerLifecycleRedirect(redirectReason, {
        toastKey: 'lobby.gameAbandoned',
      })
    }
  }, [game?.status, lobby, triggerLifecycleRedirect, isLeavingLobbyRef])

  // Reset mobile-only UI state when a new Yahtzee game starts without a page reload
  // (e.g. host starts game, rematch starts, or socket-driven transition).
  useEffect(() => {
    if (lobby?.gameType !== 'yahtzee' || !isGameStarted || !game?.id) {
      return
    }

    if (initializedMobileUiGameIdRef.current === game.id) {
      return
    }

    initializedMobileUiGameIdRef.current = game.id
    setMobileActiveTab('game')
    setSelectedPlayerId(null)
    resetUnread()
    setRollHistory([])
  }, [lobby?.gameType, isGameStarted, game?.id, resetUnread])

  useEffect(() => {
    if (
      lobby?.gameType !== 'yahtzee' ||
      !isGameStarted ||
      !(gameEngine instanceof YahtzeeGame) ||
      typeof window === 'undefined'
    ) {
      return
    }

    const isMobileViewport = window.matchMedia(MOBILE_MAX_MEDIA_QUERY).matches
    if (!isMobileViewport) {
      return
    }

    const currentPlayer = gameEngine.getCurrentPlayer()
    const currentPlayerId = currentPlayer?.id ?? null
    const rollsLeft = gameEngine.getRollsLeft()
    const mine = isMyTurn()
    const prev = yahtzeeMobileTurnStateRef.current

    if (!currentPlayerId) {
      yahtzeeMobileTurnStateRef.current = {
        currentPlayerId: null,
        wasMyTurn: mine,
        rollsLeft,
      }
      return
    }

    if (!prev.wasMyTurn && mine && mobileActiveTab !== 'chat') {
      setMobileActiveTab('game')
      setSelectedPlayerId(null)
    }

    const ranOutOfRollsThisTurn =
      mine &&
      prev.currentPlayerId === currentPlayerId &&
      prev.rollsLeft !== null &&
      prev.rollsLeft > 0 &&
      rollsLeft === 0

    if (ranOutOfRollsThisTurn && mobileActiveTab === 'game') {
      setMobileActiveTab('scorecard')
      setSelectedPlayerId(null)
    }

    yahtzeeMobileTurnStateRef.current = {
      currentPlayerId,
      wasMyTurn: mine,
      rollsLeft,
    }
  }, [game?.id, gameEngine, isGameStarted, isMyTurn, lobby?.gameType, mobileActiveTab])

  const playersForLeaderboard = React.useMemo(() => {
    if (!gameEngine || !Array.isArray(game?.players)) {
      return []
    }

    const enginePlayers = gameEngine.getPlayers()
    const positionByUserId = new Map<string, number>()

    enginePlayers.forEach((player, index) => {
      positionByUserId.set(player.id, index)
    })

    return game.players.map((player) => ({
      id: player.id,
      userId: player.userId,
      user: {
        name: player.user?.username || null,
        username: player.user?.username || null,
        email: null,
        isPremium: !!player.user?.isPremium,
        bot: player.user?.bot || null,
      },
      score: enginePlayers.find((enginePlayer) => enginePlayer.id === player.userId)?.score || 0,
      position: positionByUserId.get(player.userId) ?? 0,
      isReady: true,
    }))
  }, [game?.players, gameEngine])

  const hasMultipleHumans = React.useMemo(() => {
    if (!game?.players) return false
    return game.players.filter((p) => !p.user?.bot && !p.bot).length >= 2
  }, [game?.players])

  const chatPlayerProfiles = React.useMemo(() => {
    if (!game?.players) return undefined
    const map = new Map<string, { avatarUrl?: string | null; isPremium?: boolean }>()
    for (const p of game.players) {
      if (p.userId) {
        map.set(p.userId, {
          avatarUrl: p.user?.avatarUrl ?? p.user?.image ?? null,
          isPremium: !!p.user?.isPremium,
        })
      }
    }
    return map
  }, [game?.players])

  const yahtzeeScoreTabBadge = React.useMemo(() => {
    if (
      lobby?.gameType !== 'yahtzee' ||
      !isGameStarted ||
      !(gameEngine instanceof YahtzeeGame) ||
      !isMyTurn()
    ) {
      return undefined
    }

    return gameEngine.getRollsLeft() < 3 ? '!' : undefined
  }, [gameEngine, isGameStarted, isMyTurn, lobby?.gameType])

  // When a game with a dedicated active-game page starts, notify parent to switch.
  useEffect(() => {
    if (isGameStarted && lobby?.gameType && onSwitchToDedicatedPage) {
      const dedicatedGameType = resolveDedicatedLobbyPageGameType(lobby.gameType as string, 'playing')
      if (dedicatedGameType) {
        onSwitchToDedicatedPage(dedicatedGameType)
      }
    }
  }, [isGameStarted, lobby?.gameType, onSwitchToDedicatedPage])

  // Show loading while session is being fetched (for non-guest users)
  if (!isGuest && status === 'loading') {
    return (
      <div className="bd-page page-shell flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <LoadingSpinner size="lg" />
          <p className="text-bd-ink-muted">Loading session...</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bd-page page-shell flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!lobby) {
    return (
      <div className="bd-page page-shell flex items-center justify-center px-4">
        <div className="bd-card w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-5 inline-flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-bd-ink bg-bd-sun shadow-bd-ink-4">
            <Icon name="search" size={30} tone="on-accent" />
          </div>
          <h1
            className="mb-3 text-2xl font-extrabold text-bd-ink"
            style={{ fontFamily: 'var(--bd-font-display)' }}
          >
            Lobby Not Found
          </h1>
          <p className="mb-6 text-sm text-bd-ink-soft">
            The lobby you're looking for doesn't exist or has been closed.
          </p>
          <button
            onClick={() => router.push('/games')}
            className="bd-btn bd-btn-primary mx-auto"
          >
            Back to Games
          </button>
        </div>
      </div>
    )
  }

  // Shared between the sub-640px top status bar and the phone-landscape
  // side pane (#751) — the persistent top bars sit above Main Game Area and
  // silently ate into the landscape height budget, so landscape shows this
  // same compact content inside the pane instead of a separate bar.
  const compactStatusBar = gameEngine instanceof YahtzeeGame ? (
    <div
      className="flex items-center justify-between gap-2 rounded-xl border px-3 py-1.5"
      style={{ borderColor: 'var(--bd-line)', background: 'var(--bd-bg2)' }}
    >
      <div className="flex min-w-0 items-center gap-2.5 overflow-hidden text-[11px] font-bold text-bd-ink">
        <span className="flex shrink-0 items-center gap-1"><Icon name="target" size={13} /> {roundInfo.current}/{roundInfo.total}</span>
        <span className="flex min-w-0 items-center gap-1 truncate"><Icon name="user" size={13} /> {gameEngine.getCurrentPlayer()?.name || t('game.ui.playerFallback')}</span>
        <span className="flex shrink-0 items-center gap-1"><Icon name="trophy" size={13} /> {gameEngine.getPlayers().find(p => p.id === getCurrentUserId())?.score || 0}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={() => {
            sounds.play('click', { force: true })
            const newState = sounds.toggle()
            setSoundEnabled(newState)
            showToast.success(newState ? 'game.ui.soundOn' : 'game.ui.soundOff', undefined, undefined, {
              duration: 2000,
              position: 'top-center',
            })
          }}
          aria-label={soundEnabled ? t('game.ui.disableSound') : t('game.ui.enableSound')}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-sm focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
          style={{ background: 'var(--bd-bg)', border: '1px solid var(--bd-line)' }}
        >
          <Icon name={soundEnabled ? 'sound-on' : 'sound-off'} size={15} />
        </button>
        <button
          onClick={() => {
            sounds.play('click', { force: true })
            setShowLeaveConfirmModal(true)
          }}
          aria-label={t('game.ui.leave')}
          className="bd-btn-coral flex h-7 w-7 items-center justify-center !rounded-lg text-sm focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
        >
          <LeaveIcon />
        </button>
      </div>
    </div>
  ) : null

  // Shared between the desktop grid, the mobile scorecard tab, and the
  // phone-landscape side pane (#751).
  const scorecardSection = gameEngine instanceof YahtzeeGame ? (() => {
    const currentUserId = getCurrentUserId()
    const viewingPlayerId = selectedPlayerId || gameEngine.getCurrentPlayer()?.id
    const scorecard = gameEngine.getScorecard(viewingPlayerId || '')
    const isViewingOtherPlayer = viewingPlayerId !== currentUserId

    if (!scorecard) return null

    return (
      <Scorecard
        scorecard={scorecard}
        mode={gameEngine.getMode()}
        currentDice={gameEngine.getDice()}
        rollsLeft={gameEngine.getRollsLeft()}
        onSelectCategory={handleScore}
        canSelectCategory={!isMoveInProgress && gameEngine.getRollsLeft() < 3 && !isViewingOtherPlayer}
        isCurrentPlayer={isMyTurn() && !isViewingOtherPlayer}
        isLoading={isScoring}
        playerName={(() => {
          const dbPlayer = game?.players?.find(p => p.userId === viewingPlayerId)
          if (!dbPlayer) return undefined
          return dbPlayer.user?.username || dbPlayer.name || 'Player'
        })()}
        onBackToMyCards={isViewingOtherPlayer ? () => {
          setSelectedPlayerId(currentUserId || null)
        } : undefined}
        showBackButton={isViewingOtherPlayer}
        onGoToCurrentTurn={() => {
          setSelectedPlayerId(null)
        }}
        showCurrentTurnButton={!isViewingOtherPlayer && !isMyTurn()}
      />
    )
  })() : null

  return (
    <div className={`${!isGameStarted ? 'bd-page bd-screen min-h-[var(--game-h)]' : ''}`} style={getThemePageStyle(lobby?.theme)}>
      {/* Portal target for Modal — lives inside the themed container so portaled components inherit theme CSS vars without contaminating the global <html> */}
      <div id="bd-lobby-portal" className="contents" />
     <div className={!isGameStarted ? 'mx-auto max-w-7xl flex min-h-[var(--game-h)] flex-col px-4 py-5 sm:px-6 sm:py-7 lg:px-8' : ''}>

      {!isInGame && !isGameStarted ? (
        /* Join Prompt - centered in full height */
        <div className="flex-1 flex items-center justify-center">
          {showAutoJoinLoadingState ? (
            <div className="max-w-xl mx-auto w-full animate-scale-in">
              <div className="bd-card p-6 text-center sm:p-8">
                <div className="mx-auto mb-5 inline-flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-bd-ink bg-bd-sun shadow-bd-ink-4">
                  <Icon name="gamepad" size={30} tone="on-accent" />
                </div>
                <h2
                  className="mb-2 text-2xl font-extrabold text-bd-ink sm:text-3xl"
                  style={{ fontFamily: 'var(--bd-font-display)' }}
                >
                  {t('lobby.joinSection.title')}
                </h2>
                <p className="mb-6 text-sm text-bd-ink-soft sm:text-base">
                  {t('lobby.joinPromptPublic', { lobby: lobby.name })}
                </p>
                <div className="flex items-center justify-center gap-3 text-bd-ink">
                  <LoadingSpinner />
                  <span>{t('lobby.joinSection.join')}</span>
                </div>
              </div>
            </div>
          ) : (
            <JoinPrompt
              lobby={lobby}
              viewerMode={joinViewerMode}
              guestName={guestNameInput}
              setGuestName={setGuestNameInput}
              password={password}
              setPassword={setPassword}
              error={error}
              errorCode={joinRefusalCode}
              isJoining={isJoiningLobby}
              onJoin={handleJoinLobby}
              onJoinAsGuest={handleGuestJoinLobby}
              onLogin={() => router.push(`/auth/login?returnUrl=${encodeURIComponent(`/lobby/${code}`)}`)}
              onRegister={() => router.push(`/auth/register?returnUrl=${encodeURIComponent(`/lobby/${code}`)}`)}
              onWatchAsSpectator={lobby?.allowSpectators ? () => router.push(`/lobby/${code}/spectate`) : undefined}
              onCreateOwnLobby={fullLobbyCreateRoute ? handleCreateOwnLobby : undefined}
            />
          )}
        </div>
      ) : shouldShowHeldYahtzeeResults ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <YahtzeeResults
            mode={finishedYahtzeeEngine!.getMode()}
            results={analyzeResults(
              finishedYahtzeeEngine!.getPlayers().map(p => ({ ...p, score: p.score || 0 })),
              (id) => finishedYahtzeeEngine!.getScorecard(id)
            )}
            currentUserId={getCurrentUserId() || null}
            canStartGame={!!canStartGame}
            canRequestRematch={!!isInGame}
            isRequestRematchPending={isRequestingRematch}
            onPlayAgain={handleStartGame}
            onRequestRematch={handleRequestRematch}
            onBackToLobby={() => router.push(getGameLobbiesRoute(lobby.gameType) ?? '/games')}
            onReturnToLobbyRoom={() => setYahtzeeResultsHold(null)}
            onReturnToWaiting={canStartGame ? handleReturnToWaiting : undefined}
            autoReturnAt={yahtzeeResultsHold?.releaseAt ?? null}
            isGuest={isGuest}
            registerUrl={`/auth/register?returnUrl=${encodeURIComponent(`/lobby/${code}`)}`}
          />
        </div>
      ) : !isGameStarted ? (
        /* Waiting Room - unified card with pinned actions */
        <div className="bd-card flex min-h-0 flex-1 flex-col overflow-hidden">
          <LobbyInfo
            lobby={lobby}
            game={game}
            settingsOpen={showLobbySettings}
            onToggleSettings={() => setShowLobbySettings((value) => !value)}
            onLeave={handleLeaveLobby}
          />

          {/* Tab selector (mobile only) */}
          <div className="flex border-b sm:hidden" style={{ borderColor: 'var(--bd-line)' }}>
            {(['players', ...(hasMultipleHumans ? ['chat'] : [])] as ('players' | 'chat')[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setShowLobbySettings(false)
                  setWaitingRoomTab(tab)
                  if (tab === 'chat') resetUnread()
                }}
                className={`flex flex-1 items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-colors ${
                  waitingRoomTab === tab && !showLobbySettings
                    ? 'border-b-2 border-bd-ink text-bd-ink'
                    : 'text-bd-ink-soft'
                }`}
              >
                <Icon name={tab === 'players' ? 'users' : 'chat'} size={16} />
                <span>{tab === 'players' ? t('game.ui.tabPlayers') : t('game.ui.tabChat')}</span>
                {tab === 'chat' && unreadMessageCount > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-bd-coral px-1 text-[11px] font-bold text-white">
                    {unreadMessageCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Scrollable area: players/chat crossfades with the settings view */}
          <div className="relative flex-1 min-h-0 overflow-hidden">
            <div
              aria-hidden={showLobbySettings}
              className={`absolute inset-0 transition-opacity duration-200 motion-reduce:transition-none ${
                showLobbySettings ? 'pointer-events-none opacity-0' : 'opacity-100'
              }`}
            >
              {/* Players list - hidden on mobile when chat tab active */}
              <div className={`h-full overflow-y-auto ${waitingRoomTab === 'chat' ? 'hidden sm:block' : ''}`}>
                <WaitingRoom
                  game={game}
                  lobby={lobby}
                  gameEngine={gameEngine}
                  minPlayers={minPlayersRequired}
                  getCurrentUserId={getCurrentUserId}
                  canManageBots={canStartGame}
                  canKickPlayers={isCreator}
                  onKickBot={kickBot}
                  onKickPlayer={handleKickPlayer}
                  onProfileClick={setProfileUserId}
                  onInviteFriends={canStartGame && !isGuest ? () => setShowFriendsModal(true) : undefined}
                  onAddBot={canStartGame ? handleAddBot : undefined}
                  kickedPlayers={kickedPlayers}
                  onUnkickPlayer={isCreator ? handleUnkickPlayer : undefined}
                />
              </div>
              {/* Chat - mobile only, inside card */}
              {hasMultipleHumans && waitingRoomTab === 'chat' && (
                <div className="h-full sm:hidden">
                  <Chat
                    messages={chatMessages}
                    onSendMessage={(message) => {
                      sendChatMessage(message)
                    }}
                    currentUserId={getCurrentUserId()}
                    playerProfiles={chatPlayerProfiles}
                    isMinimized={false}
                    onToggleMinimize={() => {}}
                    unreadCount={0}
                    someoneTyping={someoneTyping}
                    fullScreen={true}
                    onProfileClick={setProfileUserId}
                  />
                </div>
              )}
            </div>
            <div
              aria-hidden={!showLobbySettings}
              className={`absolute inset-0 overflow-y-auto transition-opacity duration-200 motion-reduce:transition-none ${
                showLobbySettings ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
            >
              <LobbySettingsPanel
                lobby={lobby}
                game={game}
                isPremium={isCurrentUserPremium}
                canEdit={isCreator && !startingGame}
                onUpdateSettings={updateLobbySettings}
                onClose={() => setShowLobbySettings(false)}
              />
            </div>
          </div>

          <WaitingRoomActions
            game={game}
            lobby={lobby}
            minPlayers={minPlayersRequired}
            canStartGame={canStartGame}
            startingGame={startingGame}
            onStartGame={handleStartGame}
          />
        </div>
      ) : (
        // Game Started - the shared .game-screen shell owns the viewport
        // height (docs/RESPONSIVE.md) - no position:fixed, no scroll-lock.
        <div
          className="game-screen flex flex-col"
          style={{
            background: 'var(--bd-bg)',
            overscrollBehavior: 'none',
          }}
        >
          {/* Game interrupted overlay */}
          {gameInterruptedInfo && (
            <GameInterruptedOverlay
              playerName={gameInterruptedInfo.playerName}
              reason={gameInterruptedInfo.reason}
              onRedirect={() => {
                setGameInterruptedInfo(null)
                triggerLifecycleRedirect('game-interrupted-overlay')
              }}
            />
          )}

          {/* Spectator banner */}
          {isSpectator && (
            <div className="flex-shrink-0 flex items-center justify-between gap-2 px-4 py-2 text-sm font-semibold text-bd-ink bg-bd-sun/80 border-b border-bd-ink/20">
              <div className="flex items-center gap-2">
                <Icon name="eye" size={16} />
                <span>{t('lobby.spectatingBanner')}</span>
              </div>
              {lobby?.allowSpectators && (
                <button
                  type="button"
                  onClick={() => router.push(`/lobby/${code}/spectate`)}
                  className="shrink-0 rounded-xl border-2 border-bd-ink bg-[var(--bd-bg2)] px-3 py-1 text-xs font-bold text-bd-ink hover:bg-bd-sun/60 transition-colors"
                >
                  Open spectator view →
                </button>
              )}
            </div>
          )}
          {gameEngine?.isGameFinished() && gameEngine instanceof YahtzeeGame ? (
            <YahtzeeResults
              mode={gameEngine.getMode()}
              results={analyzeResults(
                gameEngine.getPlayers().map(p => ({ ...p, score: p.score || 0 })),
                (id) => gameEngine.getScorecard(id)
              )}
              currentUserId={getCurrentUserId() || null}
              canStartGame={!!canStartGame}
              canRequestRematch={!!isInGame}
              isRequestRematchPending={isRequestingRematch}
              onPlayAgain={handleStartGame}
              onRequestRematch={handleRequestRematch}
              onBackToLobby={() => router.push(getGameLobbiesRoute(lobby.gameType) ?? '/games')}
              onReturnToWaiting={canStartGame ? handleReturnToWaiting : undefined}
              isGuest={isGuest}
              registerUrl={`/auth/register?returnUrl=${encodeURIComponent(`/lobby/${code}`)}`}
            />
          ) : gameEngine && gameEngine instanceof YahtzeeGame ? (
            <div className="yahtzee-screen flex flex-col flex-1 min-h-0">
              {/* Top Status Bar — compact single-row variant below sm (640px),
                  where this card's own flex-col stacking used to add a
                  second row of chrome height on top of an already-cramped
                  mobile Game/Score view. Unchanged at sm and up.
                  yahtzee-top-status-bar (#751): also hidden in phone
                  landscape — .yahtzee-landscape-side renders the same
                  content (compactStatusBar below) inside the pane instead,
                  since this bar sits above Main Game Area and was silently
                  eating into the landscape height budget. */}
              <div className="sm:hidden flex-shrink-0 pt-2 px-2 yahtzee-top-status-bar">
                {compactStatusBar}
              </div>

              {/* Top Status Bar — unchanged at sm (640px) and up.
                  yahtzee-top-status-bar (#751): hidden in phone landscape,
                  see the narrow-variant comment above for why. */}
              <div className="hidden sm:block flex-shrink-0 pt-2 mb-3 px-2 sm:px-4 yahtzee-top-status-bar">
                <div
                  className="bd-card rounded-2xl px-3 sm:px-5 py-2.5 text-bd-ink"
                  style={{
                    background: 'linear-gradient(180deg, var(--bd-bg) 0%, var(--bd-card-warm) 100%)',
                  }}
                >
                  {/* Single responsive row: stacks below sm, one row from sm up */}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    {/* Stats group - wraps internally, no hard-coded row break */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Icon name="target" size={20} />
                        <span className="text-sm sm:text-base font-bold text-bd-ink">
                          {roundInfo.current}/{roundInfo.total}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 max-w-[140px] sm:max-w-[150px]">
                        <Icon name="user" size={20} />
                        <span className="truncate text-sm sm:text-base font-bold text-bd-ink">
                          {gameEngine.getCurrentPlayer()?.name || t('game.ui.playerFallback')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Icon name="trophy" size={20} />
                        <span className="text-sm sm:text-base font-bold text-bd-ink">
                          {gameEngine.getPlayers().find(p => p.id === getCurrentUserId())?.score || 0}
                        </span>
                      </div>
                    </div>

                    {/* Actions group */}
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <button
                        onClick={() => {
                          sounds.play('click', { force: true })
                          const newState = sounds.toggle()
                          setSoundEnabled(newState)
                          showToast.success(newState ? 'game.ui.soundOn' : 'game.ui.soundOff', undefined, undefined, {
                            duration: 2000,
                            position: 'top-center',
                          })
                        }}
                        aria-label={soundEnabled ? t('game.ui.disableSound') : t('game.ui.enableSound')}
                        title={soundEnabled ? t('game.ui.disableSound') : t('game.ui.enableSound')}
                        className="bd-btn bd-btn-soft bd-btn-icon sm:!w-auto sm:!aspect-auto sm:!px-3 sm:!py-1.5 !rounded-xl flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
                      >
                        <Icon name={soundEnabled ? 'sound-on' : 'sound-off'} size={18} />
                        <span className="hidden sm:inline text-xs">{t('game.ui.sound')}</span>
                      </button>
                      <button
                        onClick={() => {
                          sounds.play('click', { force: true })
                          setShowLeaveConfirmModal(true)
                        }}
                        aria-label={t('game.ui.leave')}
                        className="bd-btn bd-btn-coral !rounded-xl !px-3 !py-1.5 !text-xs flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
                      >
                        <LeaveIcon />
                        <span>{t('game.ui.leave')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Main Game Area - More spacing between columns */}
              <div className="flex-1 relative overflow-x-hidden" style={{ minHeight: 0, height: '100%' }}>
                {/* Desktop: Grid Layout */}
                <div className="hidden desk:grid grid-cols-1 desk:grid-cols-12 gap-6 px-4 pb-4 h-full overflow-hidden">
                  {/* Left: Dice Controls - 3 columns, Fixed Height */}
                  <div className="lg:col-span-3 min-w-0 flex flex-col h-full">
                    <GameBoard
                      gameEngine={gameEngine}
                      game={game}
                      isMyTurn={isMyTurn()}
                      timeLeft={timeLeft}
                      turnTimerLimit={turnTimerLimit}
                      isMoveInProgress={isMoveInProgress}
                      isRolling={isRolling}
                      isScoring={isScoring}
                      isStateReverting={isStateReverting}
                      celebrationEvent={celebrationEvent}
                      held={held}
                      getCurrentUserId={getCurrentUserId}
                      onRollDice={handleRollDice}
                      onToggleHold={handleToggleHold}
                      onScore={handleScore}
                      onCelebrationComplete={handleCelebrationComplete}
                    />
                  </div>

                  {/* Center: Scorecard - 6 columns, Internal Scroll Only */}
                  <div className="lg:col-span-6 min-w-0 h-full">
                    <div className="h-full flex flex-col">
                      <div className="flex-1 min-h-0">
                        {scorecardSection}
                      </div>
                    </div>
                  </div>

                  {/* Right: Players & History - 3 columns, Internal Scroll Only */}
                  <div className="lg:col-span-3 min-w-0 h-full flex flex-col gap-3">
                    {/* Players List - 40% of space */}
                    <div className="flex-1 min-h-0">
                      <PlayerList
                        players={playersForLeaderboard}
                        currentTurn={gameEngine.getState().currentPlayerIndex}
                        currentUserId={getCurrentUserId()}
                        onPlayerClick={(userId) => {
                          // Toggle selection: if clicking same player, deselect; otherwise select
                          setSelectedPlayerId(prev => prev === userId ? null : userId)
                        }}
                        onProfileClick={setProfileUserId}
                        selectedPlayerId={selectedPlayerId || undefined}
                        departedPlayerIds={departedPlayerIds}
                      />
                    </div>

                    {/* Roll History - 60% of space. Always rendered to prevent layout jump on first roll. */}
                    <div className="flex-1 min-h-0">
                      <RollHistory entries={rollHistory} />
                    </div>
                  </div>
                </div>

                {/* Mobile: Tabbed Layout */}
                <div
                  key={game?.id || 'yahtzee-mobile-tabs'}
                  className="desk:hidden relative yahtzee-mobile-layout"
                  style={{
                    height: '100%',
                    minHeight: 0,
                    overflow: 'hidden',
                  }}
                >
                  {/* Game Tab */}
                  <MobileTabPanel id="game" activeTab={mobileActiveTab}>
                    <div className="h-full min-h-0 p-3">
                      <GameBoard
                        gameEngine={gameEngine}
                        game={game}
                        isMyTurn={isMyTurn()}
                        timeLeft={timeLeft}
                        turnTimerLimit={turnTimerLimit}
                        isMoveInProgress={isMoveInProgress}
                        isRolling={isRolling}
                        isScoring={isScoring}
                        isStateReverting={isStateReverting}
                        celebrationEvent={celebrationEvent}
                        held={held}
                        getCurrentUserId={getCurrentUserId}
                        onRollDice={handleRollDice}
                        onToggleHold={handleToggleHold}
                        onScore={handleScore}
                        onCelebrationComplete={handleCelebrationComplete}
                        onReviewScorecard={() => setMobileActiveTab('scorecard')}
                        showReviewScorecardButton={true}
                      />
                    </div>
                  </MobileTabPanel>

                  {/* Scorecard Tab */}
                  <MobileTabPanel id="scorecard" activeTab={mobileActiveTab}>
                    <div className="h-full p-3">
                      {scorecardSection}
                    </div>
                  </MobileTabPanel>

                  {/* Players Tab */}
                  <MobileTabPanel id="players" activeTab={mobileActiveTab}>
                    <div className="p-3 space-y-3">
                      <PlayerList
                        players={playersForLeaderboard}
                        currentTurn={gameEngine.getState().currentPlayerIndex}
                        currentUserId={getCurrentUserId()}
                        onPlayerClick={(userId) => {
                          setSelectedPlayerId(prev => prev === userId ? null : userId)
                          // Switch to scorecard tab when clicking player
                          setMobileActiveTab('scorecard')
                        }}
                        onProfileClick={setProfileUserId}
                        selectedPlayerId={selectedPlayerId || undefined}
                        departedPlayerIds={departedPlayerIds}
                      />
                      <RollHistory entries={rollHistory} />
                    </div>
                  </MobileTabPanel>

                  {/* Chat Tab */}
                  {hasMultipleHumans && (
                  <MobileTabPanel id="chat" activeTab={mobileActiveTab}>
                    <div
                      className="min-h-full"
                      style={{
                        height: '100%',
                      }}
                    >
                      <Chat
                        messages={chatMessages}
                        onSendMessage={(message) => {
                          sendChatMessage(message)
                        }}
                        currentUserId={getCurrentUserId()}
                        playerProfiles={chatPlayerProfiles}
                        isMinimized={false}
                        onToggleMinimize={() => { }}
                        unreadCount={0}
                        someoneTyping={someoneTyping}
                        fullScreen={true}
                        onProfileClick={setProfileUserId}
                      />
                    </div>
                  </MobileTabPanel>
                  )}
                </div>

                {/* Phone landscape (#751): board pane left (compact dice,
                    Roll button always above the fold), Scorecard pane right
                    — Scorecard is functionally required to bank a roll, so
                    unlike TTT's history it isn't droppable from this tree.
                    Players/RollHistory/Chat stay reachable in portrait. */}
                <div className="game-landscape-layout yahtzee-landscape-layout">
                  <div className="game-landscape-board">
                    <GameBoard
                      gameEngine={gameEngine}
                      game={game}
                      isMyTurn={isMyTurn()}
                      timeLeft={timeLeft}
                      turnTimerLimit={turnTimerLimit}
                      isMoveInProgress={isMoveInProgress}
                      isRolling={isRolling}
                      isScoring={isScoring}
                      isStateReverting={isStateReverting}
                      celebrationEvent={celebrationEvent}
                      held={held}
                      getCurrentUserId={getCurrentUserId}
                      onRollDice={handleRollDice}
                      onToggleHold={handleToggleHold}
                      onScore={handleScore}
                      onCelebrationComplete={handleCelebrationComplete}
                      compact
                      showReviewScorecardButton={false}
                    />
                  </div>
                  <div className="game-landscape-side yahtzee-landscape-side">
                    <div className="flex-shrink-0">{compactStatusBar}</div>
                    <div className="flex-1 min-h-0 overflow-y-auto">{scorecardSection}</div>
                  </div>
                </div>
              </div>

              {/* Desktop Chat - Minimized Button */}
              {hasMultipleHumans && (
              <div className="hidden desk:block">
                <Chat
                  messages={chatMessages}
                  onSendMessage={(message) => {
                    sendChatMessage(message)
                  }}
                  currentUserId={getCurrentUserId()}
                  playerProfiles={chatPlayerProfiles}
                  isMinimized={chatMinimized}
                  onToggleMinimize={() => {
                    setChatMinimized(!chatMinimized)
                    if (chatMinimized) {
                      resetUnread()
                    }
                  }}
                  unreadCount={unreadMessageCount}
                  someoneTyping={someoneTyping}
                  onProfileClick={setProfileUserId}
                />
              </div>
              )}

              {/* Mobile Bottom Navigation */}
              <div className="yahtzee-mobile-layout flex-shrink-0">
                <MobileTabs
                  activeTab={mobileActiveTab}
                  onTabChange={(tab) => {
                    setMobileActiveTab(tab)
                    if (tab === 'chat') {
                      resetUnread()
                    }
                  }}
                  tabs={[
                    { id: 'game' as const, label: 'Game', icon: 'dice' as const },
                    { id: 'scorecard' as const, label: 'Score', icon: 'chart' as const, badge: yahtzeeScoreTabBadge },
                    { id: 'players' as const, label: t('game.ui.tabPlayers'), icon: 'users' as const },
                    ...(hasMultipleHumans ? [{ id: 'chat' as const, label: t('game.ui.tabChat'), icon: 'chat' as const, badge: unreadMessageCount }] : []),
                  ]}
                  unreadChatCount={unreadMessageCount}
                />
              </div>
            </div>
          ) : gameEngine && (lobby?.gameType as string) === 'guess_the_spy' && game?.id ? (
            <SpyGameBoard
              gameId={game.id}
              lobbyCode={code}
              lobbyCreatorId={typeof lobby?.creatorId === 'string' ? lobby.creatorId : null}
              players={Array.isArray(game.players) ? game.players : []}
              state={gameEngine.getState()}
              currentUserId={getCurrentUserId()}
              isGuest={isGuest}
              guestId={guestId}
              guestName={guestName}
              guestToken={guestToken}
              onRefresh={async () => {
                if (loadLobbyRef.current) {
                  await loadLobbyRef.current()
                }
              }}
              isRequestingRematch={isRequestingRematch}
              onPlayAgain={handleStartGame}
              onRequestRematch={handleRequestRematch}
              onBackToLobby={() => router.push(getGameLobbiesRoute(lobby.gameType) ?? '/games')}
              onLeave={() => setShowLeaveConfirmModal(true)}
              registerUrl={`/auth/register?returnUrl=${encodeURIComponent(`/lobby/${code}`)}`}
            />
          ) : gameEngine && (lobby?.gameType as string) === 'memory' && game?.id ? (
            <MemoryGameBoard
              gameId={game.id}
              lobbyCode={code}
              players={Array.isArray(game.players) ? game.players : []}
              state={gameEngine.getState()}
              currentUserId={getCurrentUserId()}
              turnTimerLimit={turnTimerLimit}
              canStartGame={!!canStartGame}
              onPlayAgain={handleStartGame}
              onReturnToWaiting={canStartGame ? handleReturnToWaiting : undefined}
              onLeave={() => setShowLeaveConfirmModal(true)}
              isRestarting={startingGame || isReturningToWaiting}
              chatMessages={hasMultipleHumans ? chatMessages : undefined}
              onSendChatMessage={hasMultipleHumans ? (message) => { sendChatMessage(message) } : undefined}
              chatUnreadCount={unreadMessageCount}
              someoneTyping={someoneTyping}
              playerProfiles={chatPlayerProfiles}
              onProfileClick={setProfileUserId}
              isGuest={isGuest}
              registerUrl={`/auth/register?returnUrl=${encodeURIComponent(`/lobby/${code}`)}`}
              reconcileWithServerSnapshot={reconcileWithServerSnapshot}
            />
          ) : gameEngine ? (
            <div className="flex h-full items-center justify-center p-4">
              <div className="w-full max-w-2xl bg-[var(--bd-bg2)] border border-[var(--bd-line)] rounded-2xl p-8 text-center">
                <h2 className="mb-3 text-2xl font-extrabold text-bd-ink">Game Started</h2>
                <p className="text-bd-ink-soft">
                  The game type <code className="rounded bg-[var(--bd-bg)] px-2 py-0.5 text-bd-ink">{String(lobby?.gameType || DEFAULT_GAME_TYPE)}</code> is active.
                </p>
                <p className="mt-2 text-sm text-white/50">
                  This lobby view currently has no dedicated in-game renderer for it.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Desktop Chat - waiting room (sm+) */}
      {!isGameStarted && isInGame && hasMultipleHumans && (
        <div className="hidden sm:block">
          <Chat
            messages={chatMessages}
            onSendMessage={(message) => {
              sendChatMessage(message)
            }}
            currentUserId={getCurrentUserId()}
            playerProfiles={chatPlayerProfiles}
            isMinimized={chatMinimized}
            onToggleMinimize={() => {
              setChatMinimized(!chatMinimized)
              if (chatMinimized) {
                resetUnread()
              }
            }}
            unreadCount={unreadMessageCount}
            someoneTyping={someoneTyping}
            onProfileClick={setProfileUserId}
          />
        </div>
      )}

      {/* Bot Move Overlay */}
      {showingBotOverlay && botMoveSteps.length > 0 && (
        <BotMoveOverlay
          steps={botMoveSteps}
          currentStepIndex={currentBotStepIndex}
          botName={botPlayerName}
        />
      )}

      {/* Connection Status Indicator */}
      <ConnectionStatus
        isConnected={isConnected}
        isReconnecting={isReconnecting}
        reconnectAttempt={reconnectAttempt}
      />

      {/* Friends Invite Modal */}
      {!isGuest && (
        <FriendsListModal
          isOpen={showFriendsModal}
          onClose={() => setShowFriendsModal(false)}
          onInvite={handleInviteFriends}
          lobbyCode={code}
        />
      )}

      {/* Leave Confirmation Modal */}
      <ConfirmModal
        isOpen={showLeaveConfirmModal}
        onClose={() => setShowLeaveConfirmModal(false)}
        onConfirm={handleLeaveLobby}
        title={t('game.ui.leave')}
        message={t('game.ui.leaveConfirm')}
        confirmText={t('common.confirm')}
        cancelText={t('common.cancel')}
        variant="danger"
        icon={<LeaveIcon size={28} />}
      />

      {isGameStarted && (
        <ReactionOverlay lobbyCode={code} />
      )}

      <PlayerProfileCard
        userId={profileUserId}
        onClose={() => setProfileUserId(null)}
      />
     </div>
    </div>
  )
}

export default function LobbyPage() {
  const params = useParams()
  const { status } = useSession()
  const { isGuest, guestToken } = useGuest()
  const code = params.code as string
  const { gameType, gameStatus, loading, handleGameStarted, handleGameReset } = useLobbyRouteState({
    code,
    status,
    isGuest,
    guestToken,
  })

  // Invite attribution (#920): once per page mount, before any routing, so it counts the
  // same whichever game page the lobby resolves to. The share marker is then removed
  // from the address bar so a refresh is not a second open. The referrer fallback is
  // trusted only when this document was created at the lobby URL by a normal navigation –
  // document.referrer survives soft navigation and reloads, the Navigation Timing entry
  // says where the document actually started.
  const inviteOpenTracked = useRef(false)
  useEffect(() => {
    if (inviteOpenTracked.current || typeof window === 'undefined' || !code) return
    inviteOpenTracked.current = true
    const attribution = parseInviteAttribution({
      code,
      search: window.location.search,
      referrer: document.referrer,
      currentHostname: window.location.hostname,
      navigation: readDocumentNavigation(),
    })
    if (!attribution) return
    trackInviteOpened(attribution, code)
    if (attribution.via === 'share_link') {
      const cleaned = stripInviteMarker(window.location.href)
      if (cleaned !== window.location.href) {
        window.history.replaceState(window.history.state, '', cleaned)
      }
    }
  }, [code])

  if (loading) {
    return <LobbyPageLoadingFallback />
  }

  // Route to dedicated pages only when the game is active or just finished.
  const dedicatedGameType = resolveDedicatedLobbyPageGameType(gameType, gameStatus)

  if (dedicatedGameType === 'tic_tac_toe') {
    return <TicTacToeLobbyPage code={code} onGameReset={handleGameReset} />
  }

  if (dedicatedGameType === 'rock_paper_scissors') {
    return <RockPaperScissorsLobbyPage code={code} onGameReset={handleGameReset} />
  }

  if (dedicatedGameType === 'alias') {
    return <AliasLobbyPage code={code} onGameReset={handleGameReset} />
  }

  if (dedicatedGameType === 'liars_party') {
    return <LiarsPartyLobbyPage code={code} onGameReset={handleGameReset} />
  }

  if (dedicatedGameType === 'connect_four') {
    return <ConnectFourLobbyPage code={code} onGameReset={handleGameReset} />
  }

  if (dedicatedGameType === 'sketch_and_guess') {
    return <SketchAndGuessLobbyPage code={code} onGameReset={handleGameReset} />
  }

  // For all other cases, including all waiting rooms, use the shared lobby shell.
  return (
    <ErrorBoundary fallback={<LobbyPageErrorFallback />}>
      <Suspense fallback={<LoadingSpinner size="lg" />}>
        <LobbyPageContent onSwitchToDedicatedPage={handleGameStarted} />
      </Suspense>
    </ErrorBoundary>
  )
}
