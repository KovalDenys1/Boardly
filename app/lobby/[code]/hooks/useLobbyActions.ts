import { useState, useCallback, useRef, useEffect } from 'react'
import { restoreGameEngine, DEFAULT_GAME_TYPE } from '@/lib/game-registry'
import { soundManager } from '@/lib/sounds'
import { clientLogger } from '@/lib/client-logger'
import { getAuthHeaders } from '@/lib/socket-url'
import { trackLobbyJoined, trackGameStarted, trackStartAloneAutoBotResult } from '@/lib/analytics'
import { showToast } from '@/lib/i18n-toast'
import { normalizeLobbySnapshotResponse } from '@/lib/lobby-snapshot'
import { getLobbyPlayerRequirements } from '@/lib/lobby-player-requirements'
import { BotDifficulty, normalizeBotDifficulty } from '@/lib/bot-profiles'
import i18n from '@/i18n'
import { finalizePendingLobbyCreateMetric } from '@/lib/lobby-create-metrics'
import type { Socket } from 'socket.io-client'

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
  lobby: any
  game: any | null
  setGame: (game: any) => void
  setLobby: (lobby: any) => void
  setGameEngine: (engine: any) => void
  setTimerActive: (active: boolean) => void
  setTimeLeft: (time: number) => void
  setRollHistory: (history: any[]) => void
  setCelebrationEvent: (event: any) => void
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  socket: Socket | null
  isGuest: boolean
  guestId: string | null
  guestName: string | null
  guestToken: string | null
  userId: string | null | undefined
  username: string | null
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
    setError,
    setLoading,
    setStartingGame,
    selectedBotDifficulty,
  } = props

  const [password, setPassword] = useState('')

  // Use ref to avoid circular dependencies
  const loadLobbyRef = useRef<(() => Promise<void>) | null>(null)
  const startGameInFlightRef = useRef(false)

  const loadLobby = useCallback(async () => {
    try {
      const headers = getAuthHeaders(isGuest, guestId, guestName, guestToken, {
        includeContentType: false,
      })

      const res = await fetch(`/api/lobby/${code}?includeFinished=true`, { headers })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to load lobby')
      }

      const { lobby: lobbyPayload, activeGame } = normalizeLobbySnapshotResponse(data)
      setLobby(lobbyPayload)
      if (lobbyPayload?.code) {
        finalizePendingLobbyCreateMetric({
          lobbyCode: lobbyPayload.code,
          fallbackGameType: lobbyPayload.gameType || DEFAULT_GAME_TYPE,
        })
      }

      if (activeGame) {
        setGame(activeGame)
        if (activeGame.state) {
          try {
            const parsedState = JSON.parse(activeGame.state)

            // Create the correct engine based on game type
            const gt = data.lobby.gameType || DEFAULT_GAME_TYPE
            const engine = restoreGameEngine(gt, activeGame.id, parsedState)
            setGameEngine(engine)
          } catch (parseError) {
            clientLogger.error('Failed to parse game state:', parseError)
            setError('Game state is corrupted. Please start a new game.')
          }
        }
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
    // setState functions are stable and don't need to be in dependencies
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, isGuest, guestId, guestName, guestToken])

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
    } catch (err: any) {
      if (options?.auto) {
        clientLogger.warn('Auto bot addition skipped:', err.message)
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
        gameType: lobby?.gameType || DEFAULT_GAME_TYPE,
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
    } catch (err: any) {
      setError(err.message)
    }
  }, [code, password, isGuest, guestId, guestName, guestToken, socket, username, setGame, setChatMessages, setError, lobby?.gameType, lobby?.isPrivate])

  const handleStartGame = useCallback(async () => {
    if (!game) return
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
      const requirements = getLobbyPlayerRequirements(lobby?.gameType)
      const gameType = requirements.gameType || DEFAULT_GAME_TYPE
      const supportsBots = requirements.supportsBots
      const requiredMinPlayers = requirements.minPlayersRequired
      const desiredPlayerCount = requirements.desiredPlayerCount
      let playerCount = game?.players?.length || 0
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
          reportAutoBotFlowResult(false, 'bot_add_failed')
          setStartingGame(false)
          showToast.error('toast.botAddFailed')
          return
        }

        // Announce bot joined
        announceBotJoined(botResult.botName, botResult.botDifficulty)

        // Wait for lobby to reload and get updated player list
        if (loadLobbyRef.current) {
          await loadLobbyRef.current()
        }

        // Small delay to ensure state is updated
        await new Promise(resolve => setTimeout(resolve, 500))

        // Refresh local count after reconciliation.
        // `game` in this closure can be stale until React re-renders, so never
        // trust it to be lower than the successful bot add we just performed.
        const observedPlayerCount = game?.players?.length || 0
        playerCount = Math.max(playerCount + 1, observedPlayerCount)
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
          lobbyId: lobby.id,
          config: { maxPlayers: lobby.maxPlayers, minPlayers: requiredMinPlayers }
        }),
      })

      if (!res.ok) {
        let errorPayload: any = null

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
      const engine = restoreGameEngine(gameType, data.game.id, data.game.state)
      setGameEngine(engine)

      // Set game state with players data (needed for bot detection)
      setGame(data.game)

      // Track game start
      const players = data.game.players || []
      const botCount = players.filter((p: any) => p.user?.bot).length
      trackGameStarted({
        lobbyCode: code,
        gameType: lobby?.gameType || DEFAULT_GAME_TYPE,
        isPrivate: !!lobby?.isPrivate,
        maxPlayers: lobby?.maxPlayers || 4,
        playerCount: players.length,
        hasBot: botCount > 0,
        botCount,
      })
      reportAutoBotFlowResult(true, 'started')

      const turnTimerLimit = lobby?.turnTimer || 60
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
    } catch (error: any) {
      reportAutoBotFlowResult(false, 'start_failed')
      showToast.dismiss('start-game')
      showToast.errorFrom(error, 'toast.gameStartFailed')
      clientLogger.error('Failed to start game:', error)
    } finally {
      startGameInFlightRef.current = false
      setStartingGame(false)
    }
  }, [game, lobby, code, addBotToLobby, announceBotJoined, setGame, setGameEngine, setTimerActive, setTimeLeft, setRollHistory, setCelebrationEvent, setChatMessages, setStartingGame, isGuest, guestId, guestName, guestToken, selectedBotDifficulty])

  return {
    loadLobby,
    addBotToLobby,
    announceBotJoined,
    handleJoinLobby,
    handleStartGame,
    password,
    setPassword,
  }
}
