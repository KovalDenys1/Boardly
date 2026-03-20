import { useState, useCallback, useRef, useEffect } from 'react'
import { DEFAULT_GAME_TYPE } from '@/lib/game-catalog'
import { restoreGameEngineClient } from '@/lib/restore-game-engine-client'
import { sounds } from '@/lib/sounds'
import { clientLogger } from '@/lib/client-logger'
import { getAuthHeaders } from '@/lib/socket-url'
import {
  trackAuth,
  trackError,
  trackFunnelStep,
  trackLobbyJoined,
  trackGameStarted,
  trackStartAloneAutoBotResult,
  type AnalyticsGameType,
} from '@/lib/analytics'
import { showToast } from '@/lib/i18n-toast'
import { normalizeLobbySnapshotResponse } from '@/lib/lobby-snapshot'
import { getLobbyPlayerRequirements } from '@/lib/lobby-player-requirements'
import { BotDifficulty, normalizeBotDifficulty } from '@/lib/bot-profiles'
import i18n from '@/i18n'
import { finalizePendingLobbyCreateMetric } from '@/lib/lobby-create-metrics'
import type { Socket } from 'socket.io-client'
import type { Game, GamePlayer, Lobby } from '@/types/game'
import type { GameEngine } from '@/lib/game-engine'
import type { RollHistoryEntry } from '@/components/RollHistory'
import type { CelebrationEvent } from '@/lib/celebrations'

interface ChatMessage {
  id: string
  userId: string
  username: string
  message: string
  timestamp: number
  type?: string
}

interface UseLobbyActionsProps {
  code: string
  lobby: Lobby | null
  game: Game | null
  setGame: (game: Game | null) => void
  setLobby: (lobby: Lobby | null) => void
  setGameEngine: (engine: GameEngine | null) => void
  setTimerActive: (active: boolean) => void
  setTimeLeft: (time: number) => void
  setRollHistory: (history: RollHistoryEntry[]) => void
  setCelebrationEvent: (event: CelebrationEvent | null) => void
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  socket: Socket | null
  isGuest: boolean
  guestId: string | null
  guestName: string | null
  guestToken: string | null
  userId: string | null | undefined
  username: string | null
  setGuestMode: (
    name: string,
    options?: {
      guestId?: string
      guestName?: string
      guestToken?: string
    }
  ) => Promise<void>
  setError: (error: string) => void
  setLoading: (loading: boolean) => void
  setStartingGame: (starting: boolean) => void
  selectedBotDifficulty: BotDifficulty
}

interface AddBotOptions {
  auto?: boolean
  difficulty?: BotDifficulty
}

interface AddBotResult {
  success: boolean
  botName?: string
  botDifficulty?: BotDifficulty
}

interface LobbySettingsUpdatePayload {
  maxPlayers?: number
  turnTimer?: number
  allowSpectators?: boolean
}

interface LobbySnapshotResult {
  lobby: Lobby | null
  game: Game | null
}

const ANALYTICS_GAME_TYPES = new Set<AnalyticsGameType>([
  'yahtzee',
  'tic_tac_toe',
  'rock_paper_scissors',
  'guess_the_spy',
  'memory',
])

function normalizeAnalyticsGameType(
  value: unknown,
  fallback: AnalyticsGameType = DEFAULT_GAME_TYPE,
): AnalyticsGameType {
  if (typeof value === 'string' && ANALYTICS_GAME_TYPES.has(value as AnalyticsGameType)) {
    return value as AnalyticsGameType
  }

  return fallback
}

function readFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function coerceGame(value: unknown): Game | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Partial<Game> & {
    state?: unknown
    players?: unknown
    currentTurn?: unknown
  }

  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.status !== 'string' ||
    !('state' in candidate) ||
    !Array.isArray(candidate.players)
  ) {
    return null
  }

  return {
    ...candidate,
    currentTurn: typeof candidate.currentTurn === 'number' ? candidate.currentTurn : 0,
  } as Game
}

export function useLobbyActions(props: UseLobbyActionsProps) {
  const {
    code,
    lobby,
    game,
    setGame,
    setLobby,
    setGameEngine,
    setTimerActive,
    setTimeLeft,
    setRollHistory,
    setCelebrationEvent,
    setChatMessages,
    socket,
    isGuest,
    guestId,
    guestName,
    guestToken,
    username,
    setGuestMode,
    setError,
    setLoading,
    setStartingGame,
    selectedBotDifficulty,
  } = props

  const [password, setPassword] = useState('')
  const [guestNameInput, setGuestNameInput] = useState(guestName || '')
  const [isJoiningLobby, setIsJoiningLobby] = useState(false)

  // Use ref to avoid circular dependencies
  const loadLobbyRef = useRef<(() => Promise<void>) | null>(null)
  const startGameInFlightRef = useRef(false)
  const lobbySnapshotRequestRef = useRef<Promise<LobbySnapshotResult> | null>(null)

  useEffect(() => {
    if (!guestName) {
      return
    }

    setGuestNameInput(guestName)
  }, [guestName])

  const applyLobbySnapshot = useCallback(async (snapshot: LobbySnapshotResult) => {
    const normalizedLobby = snapshot.lobby
    const normalizedGame = snapshot.game

    setLobby(normalizedLobby)
    if (normalizedLobby?.code) {
      finalizePendingLobbyCreateMetric({
        lobbyCode: normalizedLobby.code,
        fallbackGameType: normalizedLobby.gameType || DEFAULT_GAME_TYPE,
      })
    }

    if (normalizedGame) {
      setGame(normalizedGame)
      if (normalizedGame.state) {
        try {
          const parsedState =
            typeof normalizedGame.state === 'string'
              ? JSON.parse(normalizedGame.state)
              : normalizedGame.state

          // Create the correct engine based on game type
          const gt = normalizedLobby?.gameType || DEFAULT_GAME_TYPE
          const engine = await restoreGameEngineClient(gt, normalizedGame.id, parsedState)
          setGameEngine(engine)
        } catch (parseError) {
          clientLogger.error('Failed to parse game state:', parseError)
          setError('Game state is corrupted. Please start a new game.')
        }
      }
    }
  }, [setGame, setGameEngine, setError, setLobby])

  const requestLobbySnapshot = useCallback(async (): Promise<LobbySnapshotResult> => {
    if (lobbySnapshotRequestRef.current) {
      return await lobbySnapshotRequestRef.current
    }

    const request = (async (): Promise<LobbySnapshotResult> => {
      const headers = getAuthHeaders(isGuest, guestId, guestName, guestToken, {
        includeContentType: false,
      })

      const res = await fetch(`/api/lobby/${code}?includeFinished=true`, {
      headers,
      cache: 'no-store',
    })
    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.error || 'Failed to load lobby')
    }

      const { lobby: lobbyPayload, activeGame } = normalizeLobbySnapshotResponse(data)
      const normalizedLobby = (lobbyPayload as Lobby | null) ?? null
      const normalizedGame = coerceGame(activeGame)

      return {
        lobby: normalizedLobby,
        game: normalizedGame,
      }
    })()

    lobbySnapshotRequestRef.current = request
    try {
      return await request
    } finally {
      if (lobbySnapshotRequestRef.current === request) {
        lobbySnapshotRequestRef.current = null
      }
    }
  }, [
    code,
    guestId,
    guestName,
    guestToken,
    isGuest,
  ])

  const fetchLobbySnapshot = useCallback(async (
    options: { applyState?: boolean } = {}
  ): Promise<LobbySnapshotResult> => {
    const applyState = options.applyState !== false
    const snapshot = await requestLobbySnapshot()

    if (applyState) {
      await applyLobbySnapshot(snapshot)
    }

    return snapshot
  }, [
    applyLobbySnapshot,
    requestLobbySnapshot,
  ])

  const loadLobby = useCallback(async () => {
    try {
      await fetchLobbySnapshot({ applyState: true })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [fetchLobbySnapshot, setError, setLoading])

  // Update ref when loadLobby changes
  useEffect(() => {
    loadLobbyRef.current = loadLobby
  }, [loadLobby])

  const addBotToLobby = useCallback(async (options?: AddBotOptions): Promise<AddBotResult> => {
    const requestedDifficulty = options?.difficulty || selectedBotDifficulty
    const payload = { difficulty: requestedDifficulty }

    const difficultyLabelMap: Record<BotDifficulty, string> = {
      easy: i18n.t('game.ui.botDifficultyEasy'),
      medium: i18n.t('game.ui.botDifficultyMedium'),
      hard: i18n.t('game.ui.botDifficultyHard'),
    }

    try {
      const headers = getAuthHeaders(isGuest, guestId, guestName, guestToken)
      const res = await fetch(`/api/lobby/${code}/add-bot`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        if (options?.auto && data?.error === 'Bot already in lobby') {
          return { success: true }
        }
        throw new Error(data.error || 'Failed to add bot')
      }

      // Call via ref to avoid circular dependency
      if (loadLobbyRef.current) {
        await loadLobbyRef.current()
      }
      const botName = data?.bot?.username || 'AI Bot'
      const botDifficulty = normalizeBotDifficulty(data?.bot?.difficulty, requestedDifficulty)
      const difficultyLabel = difficultyLabelMap[botDifficulty]

      const successKey = options?.auto ? 'toast.botAddedToStart' : 'toast.botJoinedLobby'
      showToast.success(successKey, undefined, {
        botName,
        difficulty: difficultyLabel,
      })

      return {
        success: true,
        botName,
        botDifficulty,
      }
    } catch (err: unknown) {
      if (options?.auto) {
        clientLogger.warn('Auto bot addition skipped:', err instanceof Error ? err.message : String(err))
        return { success: false }
      }

      showToast.errorFrom(err, 'toast.botAddFailed')
      return { success: false }
    }
  }, [code, isGuest, guestId, guestName, guestToken, selectedBotDifficulty])

  const announceBotJoined = useCallback((botName?: string, botDifficulty?: BotDifficulty) => {
    const difficultyLabelMap: Record<BotDifficulty, string> = {
      easy: 'Easy',
      medium: 'Medium',
      hard: 'Hard',
    }
    const safeDifficulty = botDifficulty ? normalizeBotDifficulty(botDifficulty) : null
    const difficultySuffix = safeDifficulty ? ` (${difficultyLabelMap[safeDifficulty]})` : ''
    const resolvedName = botName || 'AI Bot'

    const botJoinMessage = {
      id: Date.now().toString() + '_botjoin',
      userId: 'system',
      username: 'System',
      message: `🤖 ${resolvedName}${difficultySuffix} joined the lobby`,
      timestamp: Date.now(),
      type: 'system'
    }
    setChatMessages(prev => [...prev, botJoinMessage])
  }, [setChatMessages])

  const handleJoinLobby = useCallback(async () => {
    setIsJoiningLobby(true)
    setError('')

    try {
      const headers = getAuthHeaders(isGuest, guestId, guestName, guestToken)

      const res = await fetch(`/api/lobby/${code}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ password }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to join lobby')
      }

      setGame(data.game)

      // Call via ref to avoid circular dependency
      if (loadLobbyRef.current) {
        await loadLobbyRef.current()
      }

      // useSocketConnection joins room on each connect/reconnect.
      // Emit only when already connected to avoid duplicate JOIN_LOBBY emissions.
      if (socket && socket.connected) {
        clientLogger.log('📡 Rejoining lobby room after successful HTTP join')
        socket.emit('join-lobby', code)
      }

      // Track lobby join
      trackLobbyJoined({
        lobbyCode: code,
        gameType: normalizeAnalyticsGameType(lobby?.gameType),
        isPrivate: !!lobby?.isPrivate,
      })

      const joinMessage = {
        id: Date.now().toString() + '_join',
        userId: 'system',
        username: 'System',
        message: `${username || 'A player'} joined the lobby`,
        timestamp: Date.now(),
        type: 'system'
      }
      setChatMessages(prev => [...prev, joinMessage])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsJoiningLobby(false)
    }
  }, [code, password, isGuest, guestId, guestName, guestToken, socket, username, setGame, setChatMessages, setError, lobby?.gameType, lobby?.isPrivate])

  const handleGuestJoinLobby = useCallback(async () => {
    const normalizedGuestName = guestNameInput.trim()

    if (!normalizedGuestName) {
      setError('Please enter your name')
      return
    }

    if (normalizedGuestName.length < 2 || normalizedGuestName.length > 20) {
      setError('Name must be 2-20 characters')
      return
    }

    setIsJoiningLobby(true)
    setError('')

    try {
      const response = await fetch(`/api/lobby/${code}/join-guest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          guestName: normalizedGuestName,
          guestToken: guestToken || undefined,
          password: password || undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        trackError({
          errorType: 'auth',
          errorMessage: data.error || 'Guest join failed',
          component: 'LobbyPageClient',
          severity: 'medium',
        })
        throw new Error(data.error || 'Failed to join lobby')
      }

      await setGuestMode(data.guestName || normalizedGuestName, {
        guestId: data.guestId,
        guestName: data.guestName || normalizedGuestName,
        guestToken: data.guestToken,
      })

      const joinedGame = coerceGame(data.game)
      if (joinedGame) {
        setGame(joinedGame)
      }

      if (loadLobbyRef.current) {
        await loadLobbyRef.current()
      }

      trackAuth({
        event: 'login',
        method: 'guest',
        success: true,
        userId: data.guestId || undefined,
      })
      trackFunnelStep('guest-join')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsJoiningLobby(false)
    }
  }, [code, guestNameInput, guestToken, password, setError, setGame, setGuestMode])

  const handleStartGame = useCallback(async () => {
    if (!lobby?.id) return
    if (startGameInFlightRef.current) {
      clientLogger.warn('Start game already in progress, ignoring duplicate request', { code })
      return
    }

    startGameInFlightRef.current = true
    let reportAutoBotFlowResult = (
      _success: boolean,
      _reason: 'started' | 'bot_add_failed' | 'insufficient_players' | 'start_failed'
    ) => undefined

    try {
      setStartingGame(true)
      let authoritativeSnapshot: LobbySnapshotResult | null = null
      try {
        authoritativeSnapshot = await fetchLobbySnapshot({ applyState: true })
      } catch (snapshotError) {
        clientLogger.warn(
          'Failed to refresh lobby snapshot before starting game:',
          snapshotError instanceof Error ? snapshotError.message : String(snapshotError)
        )
      }

      const effectiveLobby = authoritativeSnapshot?.lobby ?? lobby
      let effectiveGame = authoritativeSnapshot?.game ?? game
      if (!effectiveLobby?.id) {
        throw new Error('Failed to resolve lobby state before starting game')
      }

      const lobbyGameType =
        typeof effectiveLobby.gameType === 'string' ? effectiveLobby.gameType : DEFAULT_GAME_TYPE
      const requirements = getLobbyPlayerRequirements(lobbyGameType)
      const gameType = requirements.gameType || DEFAULT_GAME_TYPE
      const supportsBots = requirements.supportsBots
      const requiredMinPlayers = requirements.minPlayersRequired
      const desiredPlayerCount = requirements.desiredPlayerCount
      let playerCount = effectiveGame?.players?.length || 0
      const requiresAutoBotFlow = supportsBots && playerCount < desiredPlayerCount
      let autoBotMetricTracked = false
      reportAutoBotFlowResult = (
        success: boolean,
        reason: 'started' | 'bot_add_failed' | 'insufficient_players' | 'start_failed'
      ) => {
        if (!requiresAutoBotFlow || autoBotMetricTracked) {
          return
        }

        trackStartAloneAutoBotResult({
          gameType:
            gameType === 'yahtzee' ||
            gameType === 'tic_tac_toe' ||
            gameType === 'rock_paper_scissors' ||
            gameType === 'guess_the_spy'
              ? gameType
              : DEFAULT_GAME_TYPE,
          success,
          reason,
          isGuest,
        })
        autoBotMetricTracked = true
      }

      // Auto-add one bot for bot-supported games when we are below minimum.
      if (playerCount < desiredPlayerCount && supportsBots) {
        showToast.loading('toast.addingBot', undefined, undefined, { id: 'add-bot' })
        const botResult = await addBotToLobby({ auto: true, difficulty: selectedBotDifficulty })
        showToast.dismiss('add-bot')

        if (!botResult.success) {
          try {
            authoritativeSnapshot = await fetchLobbySnapshot({ applyState: true })
            effectiveGame = authoritativeSnapshot.game ?? effectiveGame
            playerCount = effectiveGame?.players?.length || playerCount
          } catch (refreshError) {
            clientLogger.warn(
              'Failed to reconcile lobby after bot add failure:',
              refreshError instanceof Error ? refreshError.message : String(refreshError)
            )
          }

          if (playerCount < requiredMinPlayers) {
            reportAutoBotFlowResult(false, 'bot_add_failed')
            setStartingGame(false)
            showToast.error('toast.botAddFailed')
            return
          }
        } else {
          announceBotJoined(botResult.botName, botResult.botDifficulty)

          try {
            authoritativeSnapshot = await fetchLobbySnapshot({ applyState: true })
            effectiveGame = authoritativeSnapshot.game ?? effectiveGame
            playerCount = effectiveGame?.players?.length || Math.max(playerCount + 1, game?.players?.length || 0)
          } catch (refreshError) {
            clientLogger.warn(
              'Failed to refresh lobby after bot add:',
              refreshError instanceof Error ? refreshError.message : String(refreshError)
            )
            playerCount = Math.max(playerCount + 1, game?.players?.length || 0)
          }
        }
      }

      if (playerCount < requiredMinPlayers) {
        reportAutoBotFlowResult(false, 'insufficient_players')
        setStartingGame(false)
        showToast.error(
          'toast.gameStartFailed',
          `Need at least ${requiredMinPlayers} players to start ${gameType.replace(/_/g, ' ')}.`
        )
        return
      }

      const headers = getAuthHeaders(isGuest, guestId, guestName, guestToken)
      const res = await fetch('/api/game/create', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          gameType,
          lobbyId: effectiveLobby.id,
          config: {
            maxPlayers: readFiniteNumber(effectiveLobby.maxPlayers, 4),
            minPlayers: requiredMinPlayers,
          }
        }),
      })

      if (!res.ok) {
        let errorPayload: { error?: string; details?: string; [key: string]: unknown } | null = null

        try {
          errorPayload = await res.json()
        } catch {
          // Ignore JSON parse errors and use status text fallback below.
        }

        const hasMessage =
          typeof errorPayload?.error === 'string' ||
          typeof errorPayload?.details === 'string'

        const diagnosticPayload = hasMessage || (errorPayload && Object.keys(errorPayload).length > 0)
          ? errorPayload
          : { status: res.status, statusText: res.statusText }

        clientLogger.error('Failed to start game - server response:', diagnosticPayload)
        throw new Error(
          errorPayload?.error ||
          errorPayload?.details ||
          `Failed to start game (HTTP ${res.status})`
        )
      }

      const data = await res.json()

      // Create the correct engine based on game type
      const engine = await restoreGameEngineClient(gameType, data.game.id, data.game.state)
      setGameEngine(engine)

      // Set game state with players data (needed for bot detection)
      setGame(data.game)

      // Track game start
      const players = data.game.players || []
      const botCount = players.filter((p: GamePlayer) => p.user?.bot).length
      trackGameStarted({
        lobbyCode: code,
        gameType: normalizeAnalyticsGameType(effectiveLobby.gameType),
        isPrivate: !!effectiveLobby?.isPrivate,
        maxPlayers: readFiniteNumber(effectiveLobby.maxPlayers, 4),
        playerCount: players.length,
        hasBot: botCount > 0,
        botCount,
      })
      reportAutoBotFlowResult(true, 'started')

      const turnTimerLimit = readFiniteNumber(effectiveLobby.turnTimer, 60)
      setTimerActive(true)
      setTimeLeft(turnTimerLimit)

      setRollHistory([])
      setCelebrationEvent(null)

      const firstPlayerName = data.game.players[0]?.name || 'Player 1'

      showToast.success('toast.gameStarted', undefined, { player: firstPlayerName }, { id: 'start-game' })

      const gameStartMessage = {
        id: Date.now().toString() + '_gamestart',
        userId: 'system',
        username: 'System',
        message: `🎲 Game started! ${firstPlayerName} goes first!`,
        timestamp: Date.now(),
        type: 'system'
      }
      setChatMessages(prev => [...prev, gameStartMessage])

      // Load lobby data without blocking UI
      if (loadLobbyRef.current) {
        loadLobbyRef.current().catch(err => clientLogger.error('Failed to reload lobby:', err))
      }
      // Sound will play automatically via socket event handler
    } catch (error: unknown) {
      reportAutoBotFlowResult(false, 'start_failed')
      showToast.dismiss('start-game')
      showToast.errorFrom(error, 'toast.gameStartFailed')
      clientLogger.error('Failed to start game:', error)
    } finally {
      startGameInFlightRef.current = false
      setStartingGame(false)
    }
  }, [game, lobby, code, addBotToLobby, announceBotJoined, fetchLobbySnapshot, setGame, setGameEngine, setTimerActive, setTimeLeft, setRollHistory, setCelebrationEvent, setChatMessages, setStartingGame, isGuest, guestId, guestName, guestToken, selectedBotDifficulty])

  const updateLobbySettings = useCallback(async (updates: LobbySettingsUpdatePayload) => {
    const headers = getAuthHeaders(isGuest, guestId, guestName, guestToken)
    const res = await fetch(`/api/lobby/${code}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(updates),
    })

    const data = await res.json()
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to update lobby settings')
    }

    if (loadLobbyRef.current) {
      await loadLobbyRef.current()
    }

    return data
  }, [code, isGuest, guestId, guestName, guestToken])

  return {
    loadLobby,
    addBotToLobby,
    announceBotJoined,
    handleJoinLobby,
    handleGuestJoinLobby,
    handleStartGame,
    updateLobbySettings,
    guestNameInput,
    setGuestNameInput,
    isJoiningLobby,
    password,
    setPassword,
  }
}
