import { useState, useCallback, useRef, useEffect } from 'react'
import { YahtzeeGame } from '@/lib/games/yahtzee-game'
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
  setGameEngine: (engine: YahtzeeGame | null) => void
  setTimerActive: (active: boolean) => void
  setTimeLeft: (time: number) => void
  setRollHistory: (history: any[]) => void
  setCelebrationEvent: (event: any) => void
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  socket: Socket | null
  isGuest: boolean
  guestId: string | null
  guestName: string | null
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
    userId,
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
      const headers = getAuthHeaders(isGuest, guestId, guestName)

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

            const engine = new YahtzeeGame(activeGame.id)
            engine.restoreState(parsedState)
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
  }, [code, isGuest, guestId, guestName])

  // Update ref when loadLobby changes
  useEffect(() => {
    loadLobbyRef.current = loadLobby
  }, [loadLobby])

  const addBotToLobby = useCallback(async (options?: { auto?: boolean }) => {
    try {
      const headers = getAuthHeaders(isGuest, guestId, guestName)
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
  }, [code, isGuest, guestId, guestName])

  const announceBotJoined = useCallback(() => {
    socket?.emit('player-joined')

    const botJoinMessage = {
      id: Date.now().toString() + '_botjoin',
      userId: 'system',
      username: 'System',
      message: '🤖 AI Bot joined the lobby',
      timestamp: Date.now(),
      type: 'system'
    }
    setChatMessages(prev => [...prev, botJoinMessage])
  }, [socket, setChatMessages])

  const handleJoinLobby = useCallback(async () => {
    try {
      const headers = getAuthHeaders(isGuest, guestId, guestName)

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

      const emitPlayerJoined = () => {
        if (socket && socket.connected) {
          clientLogger.log('📡 Emitting player-joined event')
          socket.emit('player-joined', {
            lobbyCode: code,
            username: username,
            userId: userId,
          })
        } else if (socket) {
          clientLogger.log('⏳ Waiting for socket connection to emit player-joined...')
          socket.once('connect', () => {
            clientLogger.log('📡 Socket connected, emitting player-joined event')
            socket.emit('player-joined', {
              lobbyCode: code,
              username: username,
              userId: userId,
            })
          })
        }
      }

      emitPlayerJoined()

      // Track lobby join
      trackLobbyJoined({
        lobbyCode: code,
        gameType: lobby?.gameType || 'yahtzee',
        isPrivate: !!lobby?.password,
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
  }, [code, password, isGuest, guestId, guestName, socket, username, userId, setGame, setChatMessages, setError, lobby?.gameType, lobby?.password])

  const handleStartGame = useCallback(async () => {
    if (!game) return

    try {
      setStartingGame(true)

      // Check if we need to add a bot first
      if ((game?.players?.length || 0) < 2) {
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
      }

      const headers = getAuthHeaders(isGuest, guestId, guestName)
      const res = await fetch('/api/game/create', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          gameType: lobby.gameType || 'yahtzee',
          lobbyId: lobby.id,
          config: { maxPlayers: lobby.maxPlayers, minPlayers: 1 }
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        clientLogger.error('Failed to start game - server response:', error)
        throw new Error(error.error || error.details || 'Failed to start game')
      }

      const data = await res.json()

      const engine = new YahtzeeGame(data.game.id)
      engine.restoreState(data.game.state)
      setGameEngine(engine)

      // Set game state with players data (needed for bot detection)
      setGame(data.game)

      // Track game start
      const players = data.game.players || []
      const botCount = players.filter((p: any) => p.user?.bot).length
      trackGameStarted({
        lobbyCode: code,
        gameType: lobby?.gameType || 'yahtzee',
        isPrivate: !!lobby?.password,
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

      // Emit events in parallel for faster update
      if (socket) {
        socket.emit('game-started', {
          lobbyCode: code,
          game: data.game,
          firstPlayerName: firstPlayerName,
        })

        socket.emit('game-action', {
          lobbyCode: code,
          action: 'state-change',
          payload: data.game.state,
        })
      }

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
  }, [game, lobby, code, socket, addBotToLobby, announceBotJoined, setGame, setGameEngine, setTimerActive, setTimeLeft, setRollHistory, setCelebrationEvent, setChatMessages, setStartingGame, isGuest, guestId, guestName])

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
