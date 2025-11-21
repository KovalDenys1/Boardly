import { useState, useCallback } from 'react'
import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import { soundManager } from '@/lib/sounds'
import { clientLogger } from '@/lib/client-logger'
import toast from 'react-hot-toast'
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
  guestId: string
  guestName: string
  getCurrentUserName: () => string
  getCurrentUserId: () => string | undefined
  setError: (error: string) => void
  setLoading: (loading: boolean) => void
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
    getCurrentUserName,
    getCurrentUserId,
    setError,
    setLoading,
  } = props

  const [password, setPassword] = useState('')
  const [previousGameState, setPreviousGameState] = useState<any>(null)

  const loadLobby = useCallback(async () => {
    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }
      
      if (isGuest && guestId && guestName) {
        headers['X-Guest-Id'] = guestId
        headers['X-Guest-Name'] = guestName
      }
      
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
            
            setPreviousGameState(parsedState)
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
  }, [code, isGuest, guestId, guestName, setLobby, setGame, setGameEngine, setError, setLoading])

  const addBotToLobby = useCallback(async (options?: { auto?: boolean }) => {
    try {
      const res = await fetch(`/api/lobby/${code}/add-bot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await res.json()

      if (!res.ok) {
        if (options?.auto && data?.error === 'Bot already in lobby') {
          return true
        }
        throw new Error(data.error || 'Failed to add bot')
      }

      await loadLobby()
      const successMessage = options?.auto
        ? '🤖 Added an AI opponent so you can start playing!'
        : '🤖 Bot added to lobby!'
      toast.success(successMessage)
      return true
    } catch (err: any) {
      if (options?.auto) {
        clientLogger.warn('Auto bot addition skipped:', err.message)
        return false
      }

      toast.error(err.message || 'Failed to add bot')
      return false
    }
  }, [code, loadLobby])

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
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }

      if (isGuest && guestId) {
        headers['X-Guest-Id'] = guestId
        headers['X-Guest-Name'] = guestName
      }

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
      await loadLobby()
      
      const emitPlayerJoined = () => {
        if (socket && socket.connected) {
          clientLogger.log('📡 Emitting player-joined event')
          socket.emit('player-joined', {
            lobbyCode: code,
            username: getCurrentUserName(),
            userId: getCurrentUserId(),
          })
        } else if (socket) {
          clientLogger.log('⏳ Waiting for socket connection to emit player-joined...')
          socket.once('connect', () => {
            clientLogger.log('📡 Socket connected, emitting player-joined event')
            socket.emit('player-joined', {
              lobbyCode: code,
              username: getCurrentUserName(),
              userId: getCurrentUserId(),
            })
          })
        }
      }
      
      emitPlayerJoined()
      
      const joinMessage = {
        id: Date.now().toString() + '_join',
        userId: 'system',
        username: 'System',
        message: `${getCurrentUserName() || 'A player'} joined the lobby`,
        timestamp: Date.now(),
        type: 'system'
      }
      setChatMessages(prev => [...prev, joinMessage])
    } catch (err: any) {
      setError(err.message)
    }
  }, [code, password, isGuest, guestId, guestName, socket, getCurrentUserName, getCurrentUserId, setGame, loadLobby, setChatMessages, setError])

  const handleStartGame = useCallback(async () => {
    if (!game) return

    try {
      if ((game?.players?.length || 0) < 2) {
        const botAdded = await addBotToLobby({ auto: true })
        if (botAdded) {
          announceBotJoined()
        }
      }

      const res = await fetch('/api/game/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          gameType: lobby.gameType || 'yahtzee',
          lobbyId: lobby.id,
          config: { maxPlayers: lobby.maxPlayers, minPlayers: 1 }
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to start game')
      }

      const data = await res.json()
      
      const engine = new YahtzeeGame(data.game.id)
      engine.restoreState(data.game.state)
      setGameEngine(engine)
      
      setTimerActive(true)
      setTimeLeft(60)
      
      setRollHistory([])
      setCelebrationEvent(null)
      
      // Emit game-started event to all clients
      socket?.emit('game-started', {
        lobbyCode: code,
        game: data.game,
      })
      
      // Also emit state change
      socket?.emit('game-action', {
        lobbyCode: code,
        action: 'state-change',
        payload: data.game.state,
      })

      const firstPlayerName = data.game.players[0]?.name || 'Player 1'
      toast.success(`🎲 Game started! ${firstPlayerName} goes first!`)

      const gameStartMessage = {
        id: Date.now().toString() + '_gamestart',
        userId: 'system',
        username: 'System',
        message: `🎲 Game started! ${firstPlayerName} goes first!`,
        timestamp: Date.now(),
        type: 'system'
      }
      setChatMessages(prev => [...prev, gameStartMessage])
      
      await loadLobby()
      soundManager.play('gameStart')
    } catch (error: any) {
      toast.error(error.message || 'Failed to start game')
      clientLogger.error('Failed to start game:', error)
    }
  }, [game, lobby, code, socket, addBotToLobby, announceBotJoined, setGameEngine, setTimerActive, setTimeLeft, setRollHistory, setCelebrationEvent, setChatMessages, loadLobby])

  return {
    loadLobby,
    addBotToLobby,
    announceBotJoined,
    handleJoinLobby,
    handleStartGame,
    password,
    setPassword,
    previousGameState,
  }
}
