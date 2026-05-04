'use client'

import React, { useState, useEffect, useCallback, Suspense } from 'react'
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
import { selectBestAvailableCategory, calculateScore, YahtzeeCategory, ALL_CATEGORIES } from '@/lib/yahtzee'
import { GameEngine } from '@/lib/game-engine'
import { DEFAULT_GAME_TYPE } from '@/lib/game-catalog'
import { getGameLobbiesRoute } from '@/lib/public-game-access'
import { restoreGameEngineClient } from '@/lib/restore-game-engine-client'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useTranslation } from '@/lib/i18n-helpers'

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

import { useSocketConnection } from './hooks/useSocketConnection'
import { useGameTimer } from './hooks/useGameTimer'
import { useGameActions, AutoActionContext } from './hooks/useGameActions'
import { useLobbyActions } from './hooks/useLobbyActions'
import { useBotTurn } from './hooks/useBotTurn'
import type { TabId } from './components/MobileTabs'
import { LobbyPageErrorFallback, LobbyPageLoadingFallback } from './components/LobbyPageFallbacks'
import { showToast } from '@/lib/i18n-toast'
import { showYahtzeeCategoryToast } from '@/lib/yahtzee-notifications'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { getLobbyPlayerRequirements } from '@/lib/lobby-player-requirements'
import { useLobbyRouteState } from './hooks/useLobbyRouteState'
import type { BotDifficulty } from '@/lib/bot-profiles'
import { isTerminalGameStatus, resolveLifecycleRedirectReason } from '@/lib/lobby-lifecycle'
import { trackLobbyLeaveRedirect } from '@/lib/analytics'
import { ReactionOverlay } from '@/components/ReactionOverlay'
import { resolveDedicatedLobbyPageGameType } from '@/lib/lobby-page-routing'

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
const LobbyInfo = dynamic(() => import('./components/LobbyInfo'))
const WaitingRoom = dynamic(() => import('./components/WaitingRoom'))
const WaitingRoomActions = dynamic(() => import('./components/WaitingRoomActions'))
const JoinPrompt = dynamic(() => import('./components/JoinPrompt'))
const FriendsListModal = dynamic(() => import('@/components/FriendsListModal'))
const ConfirmModal = dynamic(() => import('@/components/ConfirmModal'))
const GameBoard = dynamic(() => import('./components/YahtzeeGameBoard'), {
  loading: () => (
    <div className="h-full min-h-[280px] rounded-xl border border-white/15 bg-white/5">
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

const LEAVE_REQUEST_TIMEOUT_MS = 2500
const LEAVE_REDIRECT_FALLBACK_MS = 1500
const LIFECYCLE_REDIRECT_FALLBACK_MS = 1600
const WAITING_LOBBY_SYNC_INTERVAL_MS = 2000
const YAHTZEE_RESULTS_HOLD_MS = 12000
type LeaveApiOutcome = 'pending' | 'ok' | 'non_ok' | 'timeout' | 'error'

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
    const totalCategories = ALL_CATEGORIES.length
    if (!gameEngine || !(gameEngine instanceof YahtzeeGame)) return { current: 1, total: totalCategories }
    const players = gameEngine.getPlayers()
    const filledCounts = players.map(p => {
      const scorecard = gameEngine.getScorecard(p.id)
      return scorecard
        ? ALL_CATEGORIES.filter((category) => scorecard[category] !== undefined).length
        : 0
    })
    const maxFilled = filledCounts.length ? Math.max(...filledCounts) : 0
    const current = Math.min(totalCategories, maxFilled + 1)
    return { current, total: totalCategories }
  }, [gameEngine])

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessagePayload[]>([])
  const [chatMinimized, setChatMinimized] = useState(true) // Chat minimized by default
  const [unreadMessageCount, setUnreadMessageCount] = useState(0)
  const [someoneTyping, setSomeoneTyping] = useState(false)

  // Bot visualization state
  const [botMoveSteps, setBotMoveSteps] = useState<BotMoveStep[]>([])
  const [currentBotStepIndex, setCurrentBotStepIndex] = useState(0)
  const [botPlayerName, setBotPlayerName] = useState('')
  const [showingBotOverlay, setShowingBotOverlay] = useState(false)

  // Roll history and celebrations - with localStorage persistence
  const [rollHistory, setRollHistory] = useState<RollHistoryEntry[]>(() => {
    // Load from localStorage on mount
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`rollHistory_${code}`)
      if (saved) {
        try {
          return JSON.parse(saved)
        } catch (e) {
          clientLogger.error('Failed to parse saved roll history:', e)
        }
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

  // Persist roll history to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined' && rollHistory.length > 0) {
      localStorage.setItem(`rollHistory_${code}`, JSON.stringify(rollHistory))
    }
  }, [rollHistory, code])

  // Clear roll history from localStorage when game finishes
  useEffect(() => {
    if (gameEngine?.isGameFinished() && typeof window !== 'undefined') {
      localStorage.removeItem(`rollHistory_${code}`)
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

  // Track if this is initial page load to prevent sounds during hydration
  const isInitialLoadRef = React.useRef(true)
  const isLeavingLobbyRef = React.useRef(false)
  const lifecycleRedirectInFlightRef = React.useRef(false)
  const finishedGameSoundPlayedForRef = React.useRef<string | null>(null)
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
  const leaveStartedAtRef = React.useRef<number | null>(null)
  const leaveApiOutcomeRef = React.useRef<LeaveApiOutcome>('pending')
  const leaveApiStatusCodeRef = React.useRef<number | null>(null)

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
    [isGuest, lobby?.gameType]
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
    [router, lifecycleRedirectTarget, code]
  )

  // Helper functions
  const getCurrentUserId = useCallback(() => {
    if (isGuest) return guestId
    return session?.user?.id
  }, [isGuest, guestId, session?.user?.id])

  const getCurrentUserName = useCallback(() => {
    if (isGuest) return guestName
    return (session?.user as { username?: string })?.username || session?.user?.email || session?.user?.name || 'You'
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
  const loadLobbyRef = React.useRef<(() => Promise<void>) | null>(null)

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
          const gt = lobby?.gameType as string || DEFAULT_GAME_TYPE
          const newEngine = await restoreGameEngineClient(gt, game.id, parsedState)
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

          // Update game object with new state
          setGame((prevGame) => {
            if (!prevGame) return prevGame
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

            // Safety check: ensure player exists and has required data
            if (player && Array.isArray(lastRoll.dice) && lastRoll.timestamp) {
              const turnNumber = getYahtzeeTurnNumberFromScorecard(
                newEngine instanceof YahtzeeGame ? newEngine.getScorecard(lastRoll.playerId) : null
              )
              const currentUserId = getCurrentUserId()
              const rollEntryId = `${lastRoll.playerId}-${lastRoll.timestamp}`

              setRollHistory(prev => {
                const exists = prev.some((entry) => entry.id === rollEntryId)

                if (exists) return prev

                // Play dice roll sound for other players' rolls (not our own)
                if (lastRoll.playerId !== currentUserId) {
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
                  isBot: !!(player.user?.bot || player.bot),
                  botId: player.user?.bot ? player.userId : null,
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

  const onChatMessage = useCallback((message: ChatMessagePayload) => {
    setChatMessages(prev => [...prev, message])
    if (chatMinimized) {
      setUnreadMessageCount(prev => prev + 1)
    }
  }, [chatMinimized])

  const typingTimeoutRef = React.useRef<NodeJS.Timeout | undefined>(undefined)

  const onPlayerTyping = useCallback((data: PlayerTypingPayload) => {
    const currentUserId = isGuest ? guestId : session?.user?.id
    if (data.userId !== currentUserId) {
      setSomeoneTyping(true)

      // Clear previous timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }

      typingTimeoutRef.current = setTimeout(() => {
        setSomeoneTyping(false)
      }, 3000)
    }
  }, [isGuest, guestId, session?.user?.id])

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

  const onGameAbandoned = useCallback((data: { gameId: string; reason?: string }) => {
    clientLogger.log('📡 Game abandoned:', data)

    if (isLeavingLobbyRef.current) {
      clientLogger.log('Skipping game-abandoned handling during manual leave')
      return
    }

    if (loadLobbyRef.current) {
      void loadLobbyRef.current()
    }

    triggerLifecycleRedirect(`game-abandoned:${data.reason || 'unknown'}`, {
      toastKey: 'lobby.gameAbandoned',
    })
  }, [triggerLifecycleRedirect])

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
  }) => {
    clientLogger.log('📡 Player left:', data)

    if (isLeavingLobbyRef.current) {
      return
    }

    const departedPlayerName = data.username || data.playerName
    if (departedPlayerName) {
      showToast.info('toast.playerLeft', undefined, { player: departedPlayerName })
    }

    if (data.nextCreatorId) {
      const currentUserId = isGuest ? guestId : session?.user?.id
      if (data.nextCreatorId === currentUserId) {
        showToast.success('toast.youAreNowHost')
      } else if (data.nextCreatorName) {
        showToast.info('toast.hostReassigned', undefined, { player: data.nextCreatorName })
      }
    }

    if (typeof data.remainingPlayers === 'number' && data.remainingPlayers < minPlayersRequired) {
      triggerLifecycleRedirect('player-left:insufficient-players', {
        toastKey: 'lobby.gameAbandoned',
      })
      return
    }

    // Refresh lobby data
    if (loadLobbyRef.current) {
      void loadLobbyRef.current()
    }
  }, [isGuest, guestId, session?.user?.id, minPlayersRequired, triggerLifecycleRedirect])

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

  // Socket connection hook - must be before useLobbyActions
  const { socket, isConnected, isReconnecting, reconnectAttempt, emitWhenConnected } = useSocketConnection({
    code,
    session,
    isGuest,
    guestId,
    guestName,
    guestToken,
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
    // State sync callback - automatically refreshes lobby data after reconnection
    onStateSync: async () => {
      if (loadLobbyRef.current) {
        await loadLobbyRef.current()
      }
    },
  })

  // Calculate once to avoid calling functions repeatedly
  const userId = getCurrentUserId()
  const username = getCurrentUserName()

  // Lobby actions hook - after socket is initialized
  const {
    loadLobby,
    addBotToLobby,
    kickBot,
    changeBotDifficulty,
    handleJoinLobby,
    handleGuestJoinLobby,
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
    setGame,
    setLobby,
    setGameEngine,
    setTimerActive: (active) => { }, // Will be set by timer hook
    setTimeLeft: (time) => { },
    setRollHistory,
    setCelebrationEvent,
    setChatMessages,
    socket, // Now socket is available
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
    await loadLobbyRef.current()
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
  }, [error, game?.status, lobby?.id, startingGame])

  // Bot turn automation hook
  const { triggerBotTurn } = useBotTurn({
    game,
    gameEngine,
    code,
    isGameStarted: game?.status === 'playing',
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
      if (!gameEngine || !(gameEngine instanceof YahtzeeGame)) {
        return true
      }

      const mine = isMyTurn()
      const hasYahtzeeEngine = true
      const scoreHandler = handleScoreRef.current
      const hasScoreHandler = !!scoreHandler

      if (!mine) {
        if (hasYahtzeeEngine && game?.id && Array.isArray(game?.players)) {
          const currentPlayer = gameEngine.getCurrentPlayer()
          const currentGamePlayer = currentPlayer
            ? game.players.find((player) => player.userId === currentPlayer.id)
            : null
          const isBotTurn = !!currentGamePlayer?.user?.bot
          const rollsLeft = gameEngine.getRollsLeft()

          // Fail-safe: if bot turn is stuck, force-trigger bot logic.
          // This is safe with server-side locking/idempotency guards.
          if (isBotTurn && currentPlayer?.id) {
            clientLogger.warn('⏰ Timer expired on bot turn, triggering fallback bot action', {
              botUserId: currentPlayer.id,
              gameId: game.id,
              currentPlayerIndex: gameEngine.getState().currentPlayerIndex,
              rollsLeft,
            })
            void triggerBotTurn(currentPlayer.id, game.id)
            return false
          }
        }

        return true
      }

      if (!hasYahtzeeEngine || !hasScoreHandler) {
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
      const bestCategory = selectBestAvailableCategory(finalDice, scorecard)
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
              '⏱️',
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
    emitWhenConnected,
    code,
    setRollHistory,
    setCelebrationEvent,
    setTimerActive: () => { }, // Timer managed by useGameTimer
    celebrate,
    fireworks,
    reconcileWithServerSnapshot,
  })

  // Update refs for timer
  React.useEffect(() => {
    handleScoreRef.current = handleScore
    handleRollDiceRef.current = handleRollDice
  }, [handleScore, handleRollDice])

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
  const chatHistoryLoadedRef = React.useRef(false)
  useEffect(() => {
    if (!isConnected) return
    if (status === 'loading') return
    if (isGuest && !guestToken) return

    // On reconnect, always reload; on first connect, only once
    if (chatHistoryLoadedRef.current && !isReconnecting) return
    chatHistoryLoadedRef.current = true

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (isGuest && guestId && guestToken) {
      headers['X-Guest-Id'] = guestId
      headers['X-Guest-Token'] = guestToken
      if (username) headers['X-Guest-Name'] = username
    }

    fetch(`/api/lobby/${code}/chat`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.messages && Array.isArray(data.messages) && data.messages.length > 0) {
          setChatMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id))
            const fresh = (data.messages as ChatMessagePayload[]).filter((m) => !existingIds.has(m.id))
            return fresh.length > 0 ? [...fresh, ...prev] : prev
          })
        }
      })
      .catch(() => {
        // non-critical; ignore
      })
  }, [isConnected, isReconnecting, status, isGuest, guestToken, guestId, username, code])

  useEffect(() => {
    if (lobby?.gameType === 'memory' && game?.status === 'playing') {
      setUnreadMessageCount(0)
    }
  }, [chatMessages.length, game?.status, lobby?.gameType])

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
    }
  }, [])

  const handleLeaveLobby = async () => {
    if (isLeavingLobbyRef.current) {
      return
    }

    isLeavingLobbyRef.current = true
    setShowLeaveConfirmModal(false)
    leaveStartedAtRef.current = Date.now()
    leaveApiOutcomeRef.current = 'pending'
    leaveApiStatusCodeRef.current = null

    if (socket) {
      socket.emit('leave-lobby', code)
      socket.disconnect()
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), LEAVE_REQUEST_TIMEOUT_MS)

    void fetchWithGuest(`/api/lobby/${code}/leave`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      keepalive: true,
      signal: controller.signal,
    })
      .then(async (res) => {
        clearTimeout(timeoutId)
        leaveApiStatusCodeRef.current = res.status
        const data = await res.json().catch(() => null)

        if (!res.ok) {
          leaveApiOutcomeRef.current = 'non_ok'
          clientLogger.warn('Leave lobby API returned non-ok status; using local redirect fallback', {
            code,
            status: res.status,
            error: data,
          })
          return
        }

        leaveApiOutcomeRef.current = 'ok'
        if (data?.gameAbandoned) {
          showToast.info('lobby.gameAbandoned', undefined, undefined, { id: 'leave-lobby-result' })
          return
        }

        showToast.success('lobby.leftLobby', undefined, undefined, { id: 'leave-lobby-result' })
      })
      .catch((error) => {
        clearTimeout(timeoutId)
        if ((error as Error)?.name === 'AbortError') {
          leaveApiOutcomeRef.current = 'timeout'
          clientLogger.warn('Leave lobby API timed out; local redirect already performed', {
            code,
            timeoutMs: LEAVE_REQUEST_TIMEOUT_MS,
          })
          return
        }

        leaveApiOutcomeRef.current = 'error'
        clientLogger.warn('Leave lobby API failed; local redirect fallback used', {
          code,
          error,
        })
      })

    navigateAfterLeave()
  }

  const handleAddBot = async () => {
    await addBotToLobby({ difficulty: selectedBotDifficulty })
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
  const playerCount = game?.players?.length || 0
  // Can start game if user is creator (single player games are allowed - bot will be auto-added)
  const canStartGame = isCreator
  const isInGame = game?.players?.some(p =>
    p.userId === getCurrentUserId() ||
    (isGuest && p.userId === guestId)
  )
  const isGameStarted = game?.status === 'playing'
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
  }, [game?.status, lobby, triggerLifecycleRedirect])

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
    setUnreadMessageCount(0)
    setRollHistory([])
  }, [lobby?.gameType, isGameStarted, game?.id])

  useEffect(() => {
    if (
      lobby?.gameType !== 'yahtzee' ||
      !isGameStarted ||
      !(gameEngine instanceof YahtzeeGame) ||
      typeof window === 'undefined'
    ) {
      return
    }

    const isMobileViewport = window.matchMedia('(max-width: 767px)').matches
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
        bot: player.user?.bot || null,
      },
      score: enginePlayers.find((enginePlayer) => enginePlayer.id === player.userId)?.score || 0,
      position: positionByUserId.get(player.userId) ?? 0,
      isReady: true,
    }))
  }, [game?.players, gameEngine])

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

  // Stabilize viewport/layout when game view mounts on mobile/tablet.
  // Avoid hard reflow hacks (e.g. toggling body display) that can cause horizontal drift on iOS.
  useEffect(() => {
    if (!isGameStarted || typeof window === 'undefined') return

    const { documentElement, body } = document
    const prevHtmlOverflowX = documentElement.style.overflowX
    const prevBodyOverflowX = body.style.overflowX
    const prevHtmlOverflowY = documentElement.style.overflowY
    const prevBodyOverflowY = body.style.overflowY

    // Prevent page scroll while the fixed full-screen game viewport is active.
    // Locking overflowY stops mobile Safari from toggling the address bar,
    // which causes dvh to change and shifts the fixed game panel off-screen.
    documentElement.style.overflowX = 'hidden'
    body.style.overflowX = 'hidden'
    documentElement.style.overflowY = 'hidden'
    body.style.overflowY = 'hidden'

    let raf1 = 0
    let raf2 = 0

    // Wait until layout settles, then normalize viewport scroll and notify listeners.
    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
        documentElement.scrollLeft = 0
        body.scrollLeft = 0
        window.dispatchEvent(new Event('resize'))
      })
    })

    return () => {
      window.cancelAnimationFrame(raf1)
      window.cancelAnimationFrame(raf2)
      documentElement.style.overflowX = prevHtmlOverflowX
      body.style.overflowX = prevBodyOverflowX
      documentElement.style.overflowY = prevHtmlOverflowY
      body.style.overflowY = prevBodyOverflowY
    }
  }, [isGameStarted])

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
            <span className="text-3xl">🔍</span>
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

  return (
    <div className={`${!isGameStarted ? 'bd-page bd-screen min-h-[calc(100dvh-64px)]' : ''}`}>
     <div className={`mx-auto max-w-7xl ${!isGameStarted ? 'flex min-h-[calc(100dvh-64px)] flex-col px-4 py-5 sm:px-6 sm:py-7 lg:px-8' : 'px-4 sm:px-6 lg:px-8 py-8'}`}>

      {!isInGame && !isGameStarted ? (
        /* Join Prompt - centered in full height */
        <div className="flex-1 flex items-center justify-center">
          {showAutoJoinLoadingState ? (
            <div className="max-w-xl mx-auto w-full animate-scale-in">
              <div className="bd-card p-6 text-center sm:p-8">
                <div className="mx-auto mb-5 inline-flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-bd-ink bg-bd-sun shadow-bd-ink-4">
                  <span className="text-3xl">🎮</span>
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
              isJoining={isJoiningLobby}
              onJoin={handleJoinLobby}
              onJoinAsGuest={handleGuestJoinLobby}
              onLogin={() => router.push(`/auth/login?returnUrl=${encodeURIComponent(`/lobby/${code}`)}`)}
              onRegister={() => router.push(`/auth/register?returnUrl=${encodeURIComponent(`/lobby/${code}`)}`)}
            />
          )}
        </div>
      ) : shouldShowHeldYahtzeeResults ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <YahtzeeResults
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
            autoReturnAt={yahtzeeResultsHold?.releaseAt ?? null}
            isGuest={isGuest}
            registerUrl={`/auth/register?returnUrl=${encodeURIComponent(`/lobby/${code}`)}`}
          />
        </div>
      ) : !isGameStarted ? (
        /* Waiting Room - unified card with pinned actions */
        <div className="bd-card flex min-h-0 flex-1 flex-col overflow-hidden">
          <LobbyInfo
            variant="header"
            lobby={lobby}
            game={game}
            soundEnabled={soundEnabled}
            canEditSettings={isCreator && !startingGame}
            onUpdateSettings={updateLobbySettings}
            onSoundToggle={() => {
              sounds.toggle()
              setSoundEnabled(sounds.isEnabled())
              showToast.success(sounds.isEnabled() ? 'game.ui.soundOn' : 'game.ui.soundOff')
            }}
            onLeave={handleLeaveLobby}
          />

          {/* Scrollable player list */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <WaitingRoom
              game={game}
              lobby={lobby}
              gameEngine={gameEngine}
              minPlayers={minPlayersRequired}
              getCurrentUserId={getCurrentUserId}
              canManageBots={canStartGame}
              onKickBot={kickBot}
              onProfileClick={setProfileUserId}
            />
          </div>

          <WaitingRoomActions
            game={game}
            lobby={lobby}
            minPlayers={minPlayersRequired}
            botDifficulty={selectedBotDifficulty}
            canStartGame={canStartGame}
            startingGame={startingGame}
            onStartGame={handleStartGame}
            onAddBot={handleAddBot}
            onBotDifficultyChange={setSelectedBotDifficulty}
            onInviteFriends={!isGuest ? () => setShowFriendsModal(true) : undefined}
          />
        </div>
      ) : (
        // Game Started - Mobile-optimized viewport
        <div
          className="flex flex-col overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50/50 to-purple-50/50 dark:from-slate-900 dark:via-blue-950/30 dark:to-purple-950/30"
          style={{
            position: 'fixed' as const,
            top: '4rem',
            left: 0,
            right: 0,
            bottom: 0,
            width: '100%',
            height: 'calc(100dvh - 4rem)',
            overscrollBehavior: 'none',
          }}
        >
          {gameEngine?.isGameFinished() && gameEngine instanceof YahtzeeGame ? (
            <YahtzeeResults
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
              isGuest={isGuest}
              registerUrl={`/auth/register?returnUrl=${encodeURIComponent(`/lobby/${code}`)}`}
            />
          ) : gameEngine && gameEngine instanceof YahtzeeGame ? (
            <>
              {/* Top Status Bar - Responsive */}
              <div className="flex-shrink-0 mb-3 px-2 sm:px-4">
                <div
                  className="bd-card rounded-2xl px-3 sm:px-5 py-2.5 text-bd-ink"
                  style={{
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, var(--bd-card-warm) 100%)',
                  }}
                >
                  {/* Mobile: Compact 2-row layout */}
                  <div className="md:hidden">
                    {/* Row 1: Game Info */}
                    <div className="mb-2 flex items-center justify-between border-b pb-2" style={{ borderColor: 'var(--bd-line)' }}>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <span className="text-base">🎯</span>
                          <span className="text-sm font-bold text-bd-ink">
                            {t('game.ui.round')}: {roundInfo.current}/{roundInfo.total}
                          </span>
                        </div>
                        <div className="h-4 w-px" style={{ background: 'var(--bd-line)' }}></div>
                        <div className="flex items-center gap-1 max-w-[120px]">
                          <span className="text-base">👤</span>
                          <span className="truncate text-sm font-bold text-bd-ink">
                            {gameEngine.getCurrentPlayer()?.name || t('game.ui.playerFallback')}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-base">🏆</span>
                        <span className="text-sm font-bold text-bd-ink">
                          {gameEngine.getPlayers().find(p => p.id === getCurrentUserId())?.score || 0}
                        </span>
                      </div>
                    </div>

                    {/* Row 2: Actions */}
                    <div className="flex items-center justify-between">
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
                        className="bd-btn bd-btn-soft !rounded-xl !px-2.5 !py-1.5 !text-sm flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
                        title={soundEnabled ? t('game.ui.disableSound') : t('game.ui.enableSound')}
                      >
                        <span className="text-base">{soundEnabled ? '🔊' : '🔇'}</span>
                      </button>
                      <button
                        onClick={() => {
                          sounds.play('click', { force: true })
                          setShowLeaveConfirmModal(true)
                        }}
                        aria-label={t('game.ui.leave')}
                        className="bd-btn bd-btn-coral !rounded-xl !px-3 !py-1.5 !text-xs flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
                      >
                        <span className="text-base">🚪</span>
                        <span>{t('game.ui.leave')}</span>
                      </button>
                    </div>
                  </div>

                  {/* Desktop/Tablet: Original layout */}
                  <div className="hidden md:flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xl">🎯</span>
                        <div>
                          <div className="bd-kicker leading-tight">{t('game.ui.round')}</div>
                          <div className="text-base font-bold leading-tight text-bd-ink">
                            {roundInfo.current}/{roundInfo.total}
                          </div>
                        </div>
                      </div>
                      <div className="h-6 w-px" style={{ background: 'var(--bd-line)' }}></div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xl">👤</span>
                        <div>
                          <div className="bd-kicker leading-tight">{t('game.ui.turn')}</div>
                          <div className="max-w-[100px] truncate text-base font-bold leading-tight text-bd-ink sm:max-w-[150px]">
                            {gameEngine.getCurrentPlayer()?.name || t('game.ui.playerFallback')}
                          </div>
                        </div>
                      </div>
                      <div className="h-6 w-px" style={{ background: 'var(--bd-line)' }}></div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xl">🏆</span>
                        <div>
                          <div className="bd-kicker leading-tight">Your Score</div>
                          <div className="text-base font-bold leading-tight text-bd-ink">
                            {gameEngine.getPlayers().find(p => p.id === getCurrentUserId())?.score || 0}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
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
                        aria-label={soundEnabled ? 'Disable sound effects' : 'Enable sound effects'}
                        className="bd-btn bd-btn-soft !rounded-xl !px-3 !py-1.5 !text-base flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
                        title={soundEnabled ? 'Disable sound' : 'Enable sound'}
                      >
                        <span className="text-lg">{soundEnabled ? '🔊' : '🔇'}</span>
                        <span className="hidden sm:inline text-xs">Sound</span>
                      </button>
                      <button
                        onClick={() => {
                          sounds.play('click', { force: true })
                          setShowLeaveConfirmModal(true)
                        }}
                        aria-label="Leave game"
                        className="bd-btn bd-btn-coral !rounded-xl !px-3 !py-1.5 !text-xs flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
                      >
                        <span className="text-base">🚪</span>
                        <span>Leave</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Main Game Area - More spacing between columns */}
              <div className="flex-1 relative overflow-x-hidden" style={{ minHeight: 0, height: '100%' }}>
                {/* Desktop: Grid Layout */}
                <div className="hidden md:grid grid-cols-1 lg:grid-cols-12 gap-6 px-4 pb-4 h-full overflow-hidden">
                  {/* Left: Dice Controls - 3 columns, Fixed Height */}
                  <div className="lg:col-span-3 min-w-0 flex flex-col h-full overflow-hidden">
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
                  <div className="lg:col-span-6 min-w-0 h-full overflow-hidden">
                    {(() => {
                      // Show selected player's scorecard or current player's scorecard
                      const currentUserId = getCurrentUserId()
                      const viewingPlayerId = selectedPlayerId || gameEngine.getCurrentPlayer()?.id
                      const scorecard = gameEngine.getScorecard(viewingPlayerId || '')
                      const isViewingOtherPlayer = viewingPlayerId !== currentUserId

                      if (!scorecard) return null

                      return (
                        <div className="h-full flex flex-col">
                          <div className="flex-1 min-h-0">
                            <Scorecard
                              scorecard={scorecard}
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
                                // Set to current user's ID instead of null
                                setSelectedPlayerId(currentUserId || null)
                              } : undefined}
                              showBackButton={isViewingOtherPlayer}
                              onGoToCurrentTurn={() => {
                                // Go back to viewing current player's turn
                                setSelectedPlayerId(null)
                              }}
                              showCurrentTurnButton={!isViewingOtherPlayer && !isMyTurn()}
                            />
                          </div>
                        </div>
                      )
                    })()}
                  </div>

                  {/* Right: Players & History - 3 columns, Internal Scroll Only */}
                  <div className="lg:col-span-3 min-w-0 h-full overflow-hidden flex flex-col gap-3">
                    {/* Players List - 40% of space */}
                    <div className="flex-1 min-h-0 overflow-hidden">
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
                      />
                    </div>

                    {/* Roll History - 60% of space */}
                    {rollHistory.length > 0 && (
                      <div className="flex-1 min-h-0 overflow-hidden">
                        <RollHistory entries={rollHistory} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Mobile: Tabbed Layout */}
                <div
                  key={game?.id || 'yahtzee-mobile-tabs'}
                  className="md:hidden relative"
                  style={{
                    height: '100%',
                    minHeight: 0,
                    overflow: 'hidden',
                  }}
                >
                  {/* Game Tab */}
                  <MobileTabPanel id="game" activeTab={mobileActiveTab}>
                    <div className="h-full min-h-0 p-4">
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
                    <div className="p-4">
                      {(() => {
                        const currentUserId = getCurrentUserId()
                        const viewingPlayerId = selectedPlayerId || gameEngine.getCurrentPlayer()?.id
                        const scorecard = gameEngine.getScorecard(viewingPlayerId || '')
                        const isViewingOtherPlayer = viewingPlayerId !== currentUserId

                        if (!scorecard) return null

                        return (
                          <Scorecard
                            scorecard={scorecard}
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
                      })()}
                    </div>
                  </MobileTabPanel>

                  {/* Players Tab */}
                  <MobileTabPanel id="players" activeTab={mobileActiveTab}>
                    <div className="p-4 space-y-4">
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
                      />

                      {rollHistory.length > 0 && (
                        <div className="mt-4">
                          <h3 className="text-lg font-bold mb-2 text-gray-900 dark:text-white">Roll History</h3>
                          <RollHistory entries={rollHistory} />
                        </div>
                      )}
                    </div>
                  </MobileTabPanel>

                  {/* Chat Tab */}
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
                          emitWhenConnected('send-chat-message', {
                            lobbyCode: code,
                            message,
                            userId: getCurrentUserId(),
                            username: getCurrentUserName(),
                          })
                        }}
                        currentUserId={getCurrentUserId()}
                        isMinimized={false}
                        onToggleMinimize={() => { }}
                        unreadCount={0}
                        someoneTyping={someoneTyping}
                        fullScreen={true}
                      />
                    </div>
                  </MobileTabPanel>
                </div>
              </div>

              {/* Desktop Chat - Minimized Button */}
              <div className="hidden md:block">
                {isInGame && (
                  <Chat
                    messages={chatMessages}
                    onSendMessage={(message) => {
                      emitWhenConnected('send-chat-message', {
                        lobbyCode: code,
                        message,
                        userId: getCurrentUserId(),
                        username: getCurrentUserName(),
                      })
                    }}
                    currentUserId={getCurrentUserId()}
                    isMinimized={chatMinimized}
                    onToggleMinimize={() => {
                      setChatMinimized(!chatMinimized)
                      if (chatMinimized) {
                        setUnreadMessageCount(0)
                      }
                    }}
                    unreadCount={unreadMessageCount}
                    someoneTyping={someoneTyping}
                  />
                )}
              </div>

              {/* Mobile Bottom Navigation */}
              <MobileTabs
                activeTab={mobileActiveTab}
                onTabChange={(tab) => {
                  setMobileActiveTab(tab)
                  if (tab === 'chat') {
                    setUnreadMessageCount(0)
                  }
                }}
                tabs={[
                  { id: 'game', label: 'Game', icon: '🎲' },
                  { id: 'scorecard', label: 'Score', icon: '📊', badge: yahtzeeScoreTabBadge },
                  { id: 'players', label: 'Players', icon: '👥' },
                  { id: 'chat', label: 'Chat', icon: '💬', badge: unreadMessageCount },
                ]}
                unreadChatCount={unreadMessageCount}
              />
            </>
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
              onLeave={() => setShowLeaveConfirmModal(true)}
              chatMessages={chatMessages}
              onSendChatMessage={(message) => {
                emitWhenConnected('send-chat-message', {
                  lobbyCode: code,
                  message,
                  userId: getCurrentUserId(),
                  username: getCurrentUserName(),
                })
              }}
              chatUnreadCount={unreadMessageCount}
              someoneTyping={someoneTyping}
            />
          ) : gameEngine ? (
            <div className="flex h-full items-center justify-center p-4">
              <div className="w-full max-w-2xl bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-8 text-center">
                <h2 className="mb-3 text-2xl font-extrabold text-white">Game Started</h2>
                <p className="text-white/70">
                  The game type <code className="rounded bg-white/10 px-2 py-0.5 text-white">{String(lobby?.gameType || DEFAULT_GAME_TYPE)}</code> is active.
                </p>
                <p className="mt-2 text-sm text-white/50">
                  This lobby view currently has no dedicated in-game renderer for it.
                </p>
              </div>
            </div>
          ) : null}
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
        icon="🚪"
      />

      {isGameStarted && socket && (
        <ReactionOverlay socket={socket} lobbyCode={code} />
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
  const { gameType, gameStatus, loading, handleGameStarted } = useLobbyRouteState({
    code,
    status,
    isGuest,
    guestToken,
  })

  if (loading) {
    return <LobbyPageLoadingFallback />
  }

  // Route to dedicated pages only when the game is active or just finished.
  const dedicatedGameType = resolveDedicatedLobbyPageGameType(gameType, gameStatus)

  if (dedicatedGameType === 'tic_tac_toe') {
    return <TicTacToeLobbyPage code={code} />
  }

  if (dedicatedGameType === 'rock_paper_scissors') {
    return <RockPaperScissorsLobbyPage code={code} />
  }

  if (dedicatedGameType === 'alias') {
    return <AliasLobbyPage code={code} />
  }

  if (dedicatedGameType === 'liars_party') {
    return <LiarsPartyLobbyPage code={code} />
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
