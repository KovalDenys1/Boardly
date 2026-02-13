import { useState, useCallback, useRef, useEffect } from 'react'
import { restoreGameEngine, DEFAULT_GAME_TYPE, getGameMetadata, hasBotSupport } from '@/lib/game-registry'
import { soundManager } from '@/lib/sounds'
import { clientLogger } from '@/lib/client-logger'
import { getAuthHeaders } from '@/lib/socket-url'
import { trackLobbyJoined, trackGameStarted } from '@/lib/analytics'
import { showToast } from '@/lib/i18n-toast'
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
  } = props

  const [password, setPassword] = useState('')

  // Use ref to avoid circular dependencies
  const loadLobbyRef = useRef<(() => Promise<void>) | null>(null)

  const loadLobby = useCallback(async () => {
    try {
      const headers = getAuthHeaders(isGuest, guestId, guestName, guestToken, {
        includeContentType: false,
      })

      const res = await fetch(`/api/lobby/${code}`, { headers })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to load lobby')
      }

      setLobby(data.lobby)

      const activeGame = data.lobby.games.find((g: any) =>
        ['waiting', 'playing'].includes(g.status)
      )
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

  const addBotToLobby = useCallback(async (options?: { auto?: boolean }) => {
    try {
      const headers = getAuthHeaders(isGuest, guestId, guestName, guestToken)
      const res = await fetch(`/api/lobby/${code}/add-bot`, {
        method: 'POST',
        headers,
      })

      const data = await res.json()

      if (!res.ok) {
        if (options?.auto && data?.error === 'Bot already in lobby') {
          return true
        }
        throw new Error(data.error || 'Failed to add bot')
      }

      // Call via ref to avoid circular dependency
      if (loadLobbyRef.current) {
        await loadLobbyRef.current()
      }
      const successMessage = options?.auto
        ? '🤖 Added an AI opponent so you can start playing!'
        : '🤖 Bot added to lobby!'
      showToast.success('toast.success', successMessage)
      return true
    } catch (err: any) {
      if (options?.auto) {
        clientLogger.warn('Auto bot addition skipped:', err.message)
        return false
      }

      showToast.error('toast.botAddFailed', err.message)
      return false
    }
  }, [code, isGuest, guestId, guestName, guestToken])

  const announceBotJoined = useCallback(() => {
    const botJoinMessage = {
      id: Date.now().toString() + '_botjoin',
      userId: 'system',
      username: 'System',
      message: '🤖 AI Bot joined the lobby',
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

      const ensureLobbyRoomJoin = () => {
        if (socket && socket.connected) {
          clientLogger.log('📡 Rejoining lobby room after successful HTTP join')
          socket.emit('join-lobby', code)
        } else if (socket) {
          clientLogger.log('⏳ Waiting for socket connection to join lobby room...')
          socket.once('connect', () => {
            clientLogger.log('📡 Socket connected, joining lobby room')
            socket.emit('join-lobby', code)
          })
        }
      }

      ensureLobbyRoomJoin()

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

    try {
      setStartingGame(true)
      const gameType = lobby?.gameType || DEFAULT_GAME_TYPE
      const requiredMinPlayers = Math.max(2, getGameMetadata(gameType).minPlayers)
      const supportsBots = hasBotSupport(gameType)
      const desiredPlayerCount = supportsBots
        ? Math.max(2, requiredMinPlayers)
        : requiredMinPlayers
      let playerCount = game?.players?.length || 0

      // Auto-add one bot for bot-supported games when we are below minimum.
      if (playerCount < desiredPlayerCount && supportsBots) {
        showToast.loading('toast.addingBot', undefined, undefined, { id: 'add-bot' })
        const botAdded = await addBotToLobby({ auto: true })
        showToast.dismiss('add-bot')

        if (!botAdded) {
          setStartingGame(false)
          showToast.error('toast.botAddFailed')
          return
        }

        // Announce bot joined
        announceBotJoined()

        // Wait for lobby to reload and get updated player list
        if (loadLobbyRef.current) {
          await loadLobbyRef.current()
        }

        // Small delay to ensure state is updated
        await new Promise(resolve => setTimeout(resolve, 500))

        // Refresh local count after reconciliation
        playerCount = game?.players?.length || playerCount + 1
      }

      if (playerCount < requiredMinPlayers) {
        setStartingGame(false)
        showToast.error(
          'toast.gameStartFailed',
          `Need at least ${requiredMinPlayers} players to start ${gameType.replaceAll('_', ' ')}.`
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
        const error = await res.json()
        clientLogger.error('Failed to start game - server response:', error)
        throw new Error(error.error || error.details || 'Failed to start game')
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
      showToast.dismiss('start-game')
      showToast.error('toast.gameStartFailed', error.message)
      clientLogger.error('Failed to start game:', error)
    } finally {
      setStartingGame(false)
    }
  }, [game, lobby, code, addBotToLobby, announceBotJoined, setGame, setGameEngine, setTimerActive, setTimeLeft, setRollHistory, setCelebrationEvent, setChatMessages, setStartingGame, isGuest, guestId, guestName, guestToken])

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
