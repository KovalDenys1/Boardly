'use client'

import React, { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { io, Socket } from 'socket.io-client'
import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import { Move } from '@/lib/game-engine'
import { YahtzeeCategory } from '@/lib/yahtzee'
import { saveGameState } from '@/lib/game'
import { useToast } from '@/contexts/ToastContext'
import toast from 'react-hot-toast'
import DiceGroup from '@/components/DiceGroup'
import Scorecard from '@/components/Scorecard'
import PlayerList from '@/components/PlayerList'
import LoadingSpinner from '@/components/LoadingSpinner'
import Chat from '@/components/Chat'
import { soundManager } from '@/lib/sounds'
import { useConfetti } from '@/hooks/useConfetti'
import { createBotMoveVisualization, detectBotMove, findFilledCategory } from '@/lib/bot-visualization'
import BotMoveOverlay from '@/components/BotMoveOverlay'
import CelebrationBanner from '@/components/CelebrationBanner'
import RollHistory, { RollHistoryEntry } from '@/components/RollHistory'
import { detectCelebration, detectPatternOnRoll, CelebrationEvent } from '@/lib/celebrations'
import YahtzeeResults from '@/components/YahtzeeResults'
import { analyzeResults } from '@/lib/yahtzee-results'

function LobbyPageContent() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()
  const toast = useToast()
  const code = params.code as string
  
  // Move socket to component state to properly manage lifecycle
  const [socket, setSocket] = useState<Socket | null>(null)
  
  // Guest mode support
  const isGuest = searchParams.get('guest') === 'true'
  const [guestName, setGuestName] = useState<string>('')
  const [guestId, setGuestId] = useState<string>('')

  const [lobby, setLobby] = useState<any>(null)
  const [game, setGame] = useState<any>(null)
  const [gameEngine, setGameEngine] = useState<YahtzeeGame | null>(null)
  const [loading, setLoading] = useState(true)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [viewingPlayerIndex, setViewingPlayerIndex] = useState<number>(0)
  const [timeLeft, setTimeLeft] = useState<number>(60)
  const [timerActive, setTimerActive] = useState<boolean>(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const { celebrate, fireworks } = useConfetti()
  const [chatMessages, setChatMessages] = useState<any[]>([])
  const [chatMinimized, setChatMinimized] = useState(false)
  const [unreadMessageCount, setUnreadMessageCount] = useState(0)
  const [someoneTyping, setSomeoneTyping] = useState(false)
  const [isMoveInProgress, setIsMoveInProgress] = useState(false) // Prevent double moves
  const [isRolling, setIsRolling] = useState(false) // Roll dice loading
  const [isScoring, setIsScoring] = useState(false) // Score selection loading
  const [stateVersion, setStateVersion] = useState(0) // Prevent race conditions

  // Bot visualization state
  const [botMoveSteps, setBotMoveSteps] = useState<any[]>([])
  const [currentBotStepIndex, setCurrentBotStepIndex] = useState(0)
  const [botPlayerName, setBotPlayerName] = useState('')
  const [showingBotOverlay, setShowingBotOverlay] = useState(false)
  const [previousGameState, setPreviousGameState] = useState<any>(null)

  // Roll history and celebrations state
  const [rollHistory, setRollHistory] = useState<RollHistoryEntry[]>([])
  const [celebrationEvent, setCelebrationEvent] = useState<CelebrationEvent | null>(null)

  // Remove the global updateTimeout state - not needed anymore
  // Debounce is now handled inside the useEffect cleanup

  // Initialize guest user data
  useEffect(() => {
    if (isGuest && typeof window !== 'undefined') {
      const storedGuestName = localStorage.getItem('guestName')
      if (storedGuestName) {
        setGuestName(storedGuestName)
        // Generate or retrieve guest ID
        let storedGuestId = localStorage.getItem('guestId')
        if (!storedGuestId) {
          storedGuestId = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          localStorage.setItem('guestId', storedGuestId)
        }
        setGuestId(storedGuestId)
      } else {
        // No guest name found, redirect back to join page
        router.push(`/lobby/join/${code}`)
      }
    }
  }, [isGuest, code, router])

  const getCurrentUserId = () => {
    if (isGuest) return guestId
    return session?.user?.id
  }

  const getCurrentPlayerIndex = () => {
    if (!game?.players) {
      return -1
    }
    
    const userId = getCurrentUserId()
    if (!userId) return -1
    
    const index = game.players.findIndex((p: any) => p.userId === userId)
    return index
  }

  const isMyTurn = () => {
    if (!gameEngine) return false
    const myIndex = getCurrentPlayerIndex()
    return myIndex !== -1 && myIndex === gameEngine.getState().currentPlayerIndex
  }

  useEffect(() => {
    if (!isGuest && status === 'unauthenticated') {
      router.push('/auth/login')
      return
    }
    if (status === 'authenticated' || (isGuest && guestId)) {
      loadLobby()
    }
  }, [code, status, isGuest, guestId])

  useEffect(() => {
    const userId = getCurrentUserId()
    if (game?.players && userId) {
      const myIndex = getCurrentPlayerIndex()
      if (myIndex !== -1) {
        setViewingPlayerIndex(myIndex)
      }
    }
  }, [game?.players, session?.user?.id, guestId])

  const handleTimeOut = useCallback(async () => {
    if (!gameEngine || !game || !isMyTurn()) return

    console.warn('⏰ Time is up! Auto-skipping turn...')
    
    try {
      // For Yahtzee: automatically score 0 in the first available category
      if (gameEngine instanceof YahtzeeGame) {
        const currentUserId = getCurrentUserId()
        if (!currentUserId) return

        const scorecard = gameEngine.getScorecard(currentUserId)
        if (!scorecard) return

        // Find first empty category
        const categories: YahtzeeCategory[] = [
          'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
          'threeOfKind', 'fourOfKind', 'fullHouse', 'smallStraight',
          'largeStraight', 'yahtzee', 'chance'
        ]

        const emptyCategory = categories.find(cat => scorecard[cat] === undefined)
        if (emptyCategory) {
          toast.warning('⏰ Time\'s up! Auto-scoring in ' + emptyCategory)
          
          // Create score move directly
          const move: Move = {
            playerId: currentUserId,
            type: 'score',
            data: { category: emptyCategory },
            timestamp: new Date(),
          }

          const headers: HeadersInit = {
            'Content-Type': 'application/json',
          }
          
          if (isGuest && guestId) {
            headers['X-Guest-Id'] = guestId
          }
          
          const res = await fetch(`/api/game/${game.id}/state`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ move }),
          })

          if (res.ok) {
            const data = await res.json()
            const newEngine = new YahtzeeGame(gameEngine.getState().id)
            newEngine.restoreState(data.game.state)
            setGameEngine(newEngine)
            
            socket?.emit('game-action', {
              lobbyCode: code,
              action: 'state-change',
              payload: data.game.state,
            })
          }
        }
      }
    } catch (error) {
      console.error('Failed to handle timeout:', error)
    }
  }, [gameEngine, game, isMyTurn, getCurrentUserId, isGuest, guestId, socket, code, toast])

  useEffect(() => {
    let timer: NodeJS.Timeout | undefined
    
    if (gameEngine && !gameEngine.isGameFinished() && timerActive) {
      // Reset timer when it's your turn
      if (isMyTurn()) {
        setTimeLeft(60)
      }

      timer = setInterval(() => {
        setTimeLeft((prev) => {
          // Re-check isMyTurn in case it changed
          const stillMyTurn = gameEngine && !gameEngine.isGameFinished() && 
                              getCurrentPlayerIndex() !== -1 && 
                              getCurrentPlayerIndex() === gameEngine.getState().currentPlayerIndex
          
          if (!stillMyTurn) return prev
          
          if (prev <= 1) {
            console.warn('⏰ Timer expired, calling handleTimeOut')
            // Use setTimeout to avoid closure issues
            setTimeout(() => {
              handleTimeOut()
            }, 0)
            return 60
          }
          return prev - 1
        })
      }, 1000)
    }

    return () => {
      if (timer) {
        clearInterval(timer)
      }
    }
  }, [gameEngine?.getState().currentPlayerIndex, timerActive, gameEngine?.isGameFinished(), handleTimeOut])

  useEffect(() => {
    if (gameEngine && !gameEngine.isGameFinished() && game?.players?.length >= 2) {
      setTimerActive(true)
    } else {
      setTimerActive(false)
    }
  }, [gameEngine, game?.players?.length])

  // Bot move step animation
  useEffect(() => {
    if (!showingBotOverlay || botMoveSteps.length === 0) return

    // Auto-advance through steps
    if (currentBotStepIndex < botMoveSteps.length - 1) {
      const timer = setTimeout(() => {
        setCurrentBotStepIndex(prev => prev + 1)
      }, 1500) // 1.5 seconds per step

      return () => clearTimeout(timer)
    }
  }, [showingBotOverlay, currentBotStepIndex, botMoveSteps.length])

  useEffect(() => {
    if (!lobby || !code) return

    const url = process.env.NEXT_PUBLIC_SOCKET_URL || (typeof window !== 'undefined' ? window.location.origin : '')

    // Get authentication token (NextAuth for users, guest ID for guests)
    const getAuthToken = () => {
      if (isGuest) {
        return guestId
      }
      
      // Try both secure and non-secure cookie names
      const cookies = document.cookie.split(';')
      const cookieNames = [
        'next-auth.session-token',
        '__Secure-next-auth.session-token',
        'next-auth.session-token.0',
        'next-auth.session-token.1'
      ]
      
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=')
        if (cookieNames.includes(name) && value && value !== 'undefined') {
          return value
        }
      }
      
      // Fallback: use session user id if available
      return session?.user?.id || null
    }

    const token = getAuthToken()
    
    const newSocket = io(url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: true,
      auth: {
        token: token,
        isGuest: isGuest,
        guestName: isGuest ? guestName : undefined,
      },
      query: {
        token: token,
        isGuest: isGuest ? 'true' : 'false',
        guestName: isGuest ? guestName : undefined,
      },
    })

    let isFirstConnection = true
    let celebrationTimeout: NodeJS.Timeout | null = null

    const handleConnect = () => {
      console.log('✅ Socket connected to lobby:', code)
      newSocket.emit('join-lobby', code)
      
      if (isFirstConnection) {
        isFirstConnection = false
        toast.success('🟢 Connected to lobby')
      }
    }

    const handleDisconnect = (reason: string) => {
      console.log('❌ Socket disconnected:', reason)
      toast.warning('🔴 Disconnected from lobby')
      
      if (reason === 'io server disconnect') {
        newSocket.connect()
      }
    }

    const handleConnectError = (error: Error) => {
      console.error('Socket connection error:', error.message)
      const retryCount = (newSocket as any).io?.engine?.transport?.attempts || 0
      
      // Show user-friendly error message
      if (error.message.includes('timeout')) {
        console.warn('Socket connection timeout - retrying...')
      } else if (retryCount > 3) {
        toast.error('⚠️ Connection issues. Trying to reconnect...')
      }
    }

    const handleGameUpdate = (data: any) => {
      console.log('📥 Received game-update:', data.action)
      
      if (data.action === 'player-joined') {
        // Reload lobby to show new player
        console.log('Player joined, reloading lobby...')
        loadLobby()
        
        // Show notification
        if (data.payload?.username) {
          toast.info(`${data.payload.username} joined the lobby`)
          soundManager.play('turnChange')
        }
      } else if (data.action === 'state-change') {
        console.log('State change received, updating game engine...')
        const updatedState = data.payload
        
        // Prevent processing old state updates (race condition protection)
        const newVersion = updatedState.updatedAt ? new Date(updatedState.updatedAt).getTime() : Date.now()
        if (stateVersion > 0 && newVersion <= stateVersion) {
          console.log('Ignoring old state update', { newVersion, stateVersion })
          return
        }
        setStateVersion(newVersion)
        
        // Detect if this was a bot move (for Yahtzee only)
        if (gameEngine && lobby?.gameType === 'yahtzee' && previousGameState) {
          const prevEngine = new YahtzeeGame(gameEngine.getState().id)
          prevEngine.restoreState(previousGameState)
          
          const botInfo = detectBotMove(
            prevEngine.getPlayers(),
            gameEngine.getPlayers(),
            prevEngine.getState().currentPlayerIndex,
            updatedState.currentPlayerIndex
          )

          if (botInfo) {
            const botUserId = botInfo.botId
            const botName = botInfo.botName
            
            const prevScorecard = (prevEngine.getScorecard(botUserId) || {}) as Record<YahtzeeCategory, number | undefined>
            const newEngine = new YahtzeeGame(gameEngine.getState().id)
            newEngine.restoreState(updatedState)
            const currScorecard = (newEngine.getScorecard(botUserId) || {}) as Record<YahtzeeCategory, number | undefined>
            
            const filledCategoryInfo = findFilledCategory(prevScorecard, currScorecard)
            
            if (filledCategoryInfo) {
              const steps = createBotMoveVisualization(
                botName,
                newEngine.getDice(),
                filledCategoryInfo.category,
                filledCategoryInfo.score
              )
              
              setBotMoveSteps(steps)
              setCurrentBotStepIndex(0)
              setBotPlayerName(botName)
              setShowingBotOverlay(true)
              
              soundManager.play('turnChange')

              const rollNumber = 3 - prevEngine.getRollsLeft() || 3
              const botHistoryEntry: RollHistoryEntry = {
                id: `bot_${Date.now()}_${Math.random()}`,
                turnNumber: Math.floor(newEngine.getRound() / (game?.players?.length || 1)) + 1,
                playerName: botName,
                rollNumber: rollNumber,
                dice: newEngine.getDice(),
                held: newEngine.getHeld().map((isHeld, idx) => isHeld ? idx : -1).filter(idx => idx !== -1),
                timestamp: Date.now(),
                isBot: true,
              }
              setRollHistory(prev => [...prev.slice(-9), botHistoryEntry])

              const celebration = detectCelebration(
                newEngine.getDice(),
                filledCategoryInfo.category,
                filledCategoryInfo.score
              )
              if (celebration) {
                celebrationTimeout = setTimeout(() => {
                  setCelebrationEvent(celebration)
                }, 5000)
              }
            }
          }
        }
        
        if (gameEngine) {
          const newEngine = new YahtzeeGame(gameEngine.getState().id)
          newEngine.restoreState(updatedState)
          
          setPreviousGameState(updatedState)
          setGameEngine(newEngine)
        } else {
          loadLobby()
        }
        
      } else if (data.action === 'player-left') {
        const currentUserId = getCurrentUserId()
        const isCurrentUser = data.payload.userId === currentUserId
        
        if (!isCurrentUser) {
          toast.info(`${data.payload.username || 'A player'} left the lobby`)
        }
        
        if (data.payload.gameEnded) {
          if (!isCurrentUser) {
            toast.warning('⚠️ Game ended! Not enough players remaining.')
          }
          setGameEngine(null)
        }
        loadLobby()
      } else if (data.action === 'chat-message') {
        setChatMessages(prev => {
          const messageExists = prev.some(msg => msg.id === data.payload.id)
          if (messageExists) return prev
          
          const currentUserId = getCurrentUserId()
          if (data.payload.userId !== currentUserId) {
            soundManager.play('message')
            
            if (chatMinimized) {
              setUnreadMessageCount(prev => prev + 1)
            }
          }
          
          return [...prev, data.payload]
        })
        
        const currentUserId = getCurrentUserId()
        if (data.payload.userId !== currentUserId && chatMinimized) {
          toast.info(`💬 ${data.payload.username}: ${data.payload.message}`)
        }
      }
    }

    newSocket.on('connect', handleConnect)
    newSocket.on('disconnect', handleDisconnect)
    newSocket.on('connect_error', handleConnectError)
    newSocket.on('game-update', handleGameUpdate)

    setSocket(newSocket)

    return () => {
      console.log('🔌 Cleaning up socket connection')
      
      // Remove all event listeners to prevent memory leaks
      newSocket.off('connect', handleConnect)
      newSocket.off('disconnect', handleDisconnect)
      newSocket.off('connect_error', handleConnectError)
      newSocket.off('game-update', handleGameUpdate)
      
      // Clear any pending timeouts
      if (celebrationTimeout) {
        clearTimeout(celebrationTimeout)
      }
      
      if (newSocket.connected) {
        newSocket.emit('leave-lobby', code)
        newSocket.disconnect()
      }
      
      setSocket(null)
    }
    // Only reconnect when code changes or authentication changes, NOT on lobby updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, session?.user?.id, isGuest, guestId])

  const loadLobby = async () => {
    try {
      // Build headers with authentication
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }
      
      // Add guest authentication if in guest mode
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
            
            // Create game engine from saved state based on game type
            const engine = new YahtzeeGame(activeGame.id)
            // Restore state
            engine.restoreState(parsedState)
            setGameEngine(engine)
            
            // Initialize previous state for bot detection
            setPreviousGameState(parsedState)
          } catch (parseError) {
            console.error('Failed to parse game state:', parseError)
            setError('Game state is corrupted. Please start a new game.')
          }
        }
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleJoinLobby = async () => {
    try {
      if (!session?.user?.id) {
        router.push('/auth/login')
        return
      }

      const res = await fetch(`/api/lobby/${code}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to join lobby')
      }

      setGame(data.game)
      await loadLobby()
      
      // Notify lobby list and lobby members about player joining
      if (socket && socket.connected) {
        console.log('📡 Emitting player-joined event')
        socket.emit('player-joined', {
          lobbyCode: code,
          username: session?.user?.name || 'Guest',
          userId: session?.user?.id,
        })
      } else {
        console.warn('⚠️ Socket not connected, cannot emit player-joined')
      }
      
      // Add system message to chat
      const joinMessage = {
        id: Date.now().toString() + '_join',
        userId: 'system',
        username: 'System',
        message: `${session?.user?.name || 'A player'} joined the lobby`,
        timestamp: Date.now(),
        type: 'system'
      }
      setChatMessages(prev => [...prev, joinMessage])
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleRollDice = async () => {
    if (!gameEngine || !(gameEngine instanceof YahtzeeGame) || !game) return

    // Prevent double-clicks
    if (isMoveInProgress) {
      console.log('Move already in progress, ignoring')
      return
    }

    // Validate that it's the current player's turn
    if (!isMyTurn()) {
      toast.error('🚫 It\'s not your turn to roll the dice!')
      return
    }

    // Validate that there are rolls left
    if (gameEngine.getRollsLeft() === 0) {
      toast.error('🚫 No rolls left! Choose a category to score.')
      return
    }

    setIsMoveInProgress(true)
    setIsRolling(true)

    // Create roll move
    const move: Move = {
      playerId: getCurrentUserId() || '',
      type: 'roll',
      data: {},
      timestamp: new Date(),
    }

    // Send move to server
    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }
      
      if (isGuest && guestId) {
        headers['X-Guest-Id'] = guestId
      }
      
      const res = await fetch(`/api/game/${game.id}/state`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ move }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to roll dice')
      }

      const data = await res.json()
      
      // Update local game engine with new instance
      let newEngine: YahtzeeGame | null = null
      if (gameEngine) {
        newEngine = new YahtzeeGame(gameEngine.getState().id)
        newEngine.restoreState(data.game.state)
        setGameEngine(newEngine)

        // Add to roll history
        const currentPlayer = newEngine.getCurrentPlayer()
        const rollNumber = 3 - newEngine.getRollsLeft() // Calculate which roll this was
        const newEntry: RollHistoryEntry = {
          id: `${Date.now()}_${Math.random()}`,
          turnNumber: Math.floor(newEngine.getRound() / (game?.players?.length || 1)) + 1,
          playerName: currentPlayer?.name || session?.user?.name || 'You',
          rollNumber: rollNumber,
          dice: newEngine.getDice(),
          held: newEngine.getHeld().map((isHeld, idx) => isHeld ? idx : -1).filter(idx => idx !== -1),
          timestamp: Date.now(),
          isBot: false,
        }
        setRollHistory(prev => [...prev.slice(-9), newEntry]) // Keep last 10

        // Detect celebration-worthy patterns in the roll
        const celebration = detectPatternOnRoll(newEngine.getDice())
        if (celebration) {
          setCelebrationEvent(celebration)
        }
      }
      
      soundManager.play('diceRoll')
      
      // Emit to other players
      if (socket && socket.connected) {
        console.log('📡 Emitting roll action to other players')
        socket.emit('game-action', {
          lobbyCode: code,
          action: 'state-change',
          payload: data.game.state,
        })
      } else {
        console.warn('⚠️ Socket not connected, cannot emit roll action')
      }

      // Check if this was the last roll using the NEW engine state
      if (newEngine && newEngine.getRollsLeft() === 0) {
        // Auto-score logic would go here
        toast.info('Last roll! Choose a category to score.')
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to roll dice')
    } finally {
      setIsMoveInProgress(false)
      setIsRolling(false)
    }
  }

  const handleToggleHold = async (index: number) => {
    if (!gameEngine || !(gameEngine instanceof YahtzeeGame) || gameEngine.getRollsLeft() === 3) return

    // Create hold move
    const move: Move = {
      playerId: getCurrentUserId() || '',
      type: 'hold',
      data: { diceIndex: index },
      timestamp: new Date(),
    }

    try {
      // Send move to server
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }
      
      if (isGuest && guestId) {
        headers['X-Guest-Id'] = guestId
      }
      
      const res = await fetch(`/api/game/${game?.id}/state`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ move }),
      })

      if (res.ok) {
        const data = await res.json()
        
        // Update with server state
        if (data.game && data.game.state) {
          const newEngine = new YahtzeeGame(gameEngine.getState().id)
          newEngine.restoreState(data.game.state)
          setGameEngine(newEngine)
        }
        
        soundManager.play('click')
        
        // Emit to other players
        if (socket && socket.connected) {
          console.log('📡 Emitting hold action to other players')
          socket.emit('game-action', {
            lobbyCode: code,
            action: 'state-change',
            payload: data.game.state,
          })
        } else {
          console.warn('⚠️ Socket not connected, cannot emit hold action')
        }
      } else {
        toast.error('Failed to hold dice')
      }
    } catch (error) {
      console.error('Failed to toggle hold:', error)
      toast.error('Failed to hold dice')
    }
  }

  const handleScoreSelection = async (category: YahtzeeCategory) => {
    if (!gameEngine || !(gameEngine instanceof YahtzeeGame) || !game) return

    // Prevent double-clicks
    if (isMoveInProgress) {
      console.log('Move already in progress, ignoring')
      return
    }

    // Validate that it's the current player's turn
    if (!isMyTurn()) {
      toast.error('🚫 It\'s not your turn to score!')
      return
    }

    // Validate that the player has rolled at least once (rollsLeft < 3)
    if (gameEngine.getRollsLeft() === 3) {
      toast.error('🚫 You must roll the dice at least once before scoring!')
      return
    }

    setIsMoveInProgress(true)
    setIsScoring(true)

    // Create score move
    const move: Move = {
      playerId: getCurrentUserId() || '',
      type: 'score',
      data: { category },
      timestamp: new Date(),
    }

    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }
      
      if (isGuest && guestId) {
        headers['X-Guest-Id'] = guestId
      }
      
      const res = await fetch(`/api/game/${game.id}/state`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ move }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to score')
      }

      const data = await res.json()
      
      // Update local game engine with new instance
      if (gameEngine) {
        const newEngine = new YahtzeeGame(gameEngine.getState().id)
        newEngine.restoreState(data.game.state)
        setGameEngine(newEngine)
        
        const categoryName = category.replace(/([A-Z])/g, ' $1').trim()
        toast.success(`Scored in ${categoryName}!`)
        
        soundManager.play('score')

        // Detect celebration for this scoring move
        const score = newEngine.getScorecard(getCurrentUserId() || '')![category] || 0
        const celebration = detectCelebration(gameEngine.getDice(), category, score)
        if (celebration) {
          setCelebrationEvent(celebration)
        }
        
        // Emit to other players
        if (socket && socket.connected) {
          console.log('📡 Emitting score action to other players')
          socket.emit('game-action', {
            lobbyCode: code,
            action: 'state-change',
            payload: data.game.state,
          })
        } else {
          console.warn('⚠️ Socket not connected, cannot emit score action')
        }

        // Use newEngine for checks after state update
        if (newEngine.isGameFinished()) {
          setTimerActive(false)
          
          const winner = newEngine.checkWinCondition()
          if (winner) {
            soundManager.play('win')
            fireworks()
            
            toast.success(`🎉 Game Over! ${winner.name} wins!`)
          }
        } else {
          const nextPlayer = newEngine.getCurrentPlayer()
          if (nextPlayer) {
            soundManager.play('turnChange')
            toast.info(`${nextPlayer.name}'s turn!`)
          }
        }
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to score')
    } finally {
      setIsMoveInProgress(false)
      setIsScoring(false)
    }
  }

  const handleStartGame = async () => {
    if (!game) return

    try {
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
      
      // Create game engine from response
      const engine = new YahtzeeGame(data.game.id)
      engine.restoreState(data.game.state)
      setGameEngine(engine)
      
      setTimerActive(true)
      setTimeLeft(60)
      
      // Clear roll history and celebrations for new game
      setRollHistory([])
      setCelebrationEvent(null)
      
      socket?.emit('game-action', {
        lobbyCode: code,
        action: 'state-change',
        payload: data.game.state,
      })

      const firstPlayerName = data.game.players[0]?.name || 'Player 1'
      toast.success(`🎲 Game started! ${firstPlayerName} goes first!`)

      // Add system message to chat
      const gameStartMessage = {
        id: Date.now().toString() + '_gamestart',
        userId: 'system',
        username: 'System',
        message: `🎲 Game started! ${firstPlayerName} goes first!`,
        timestamp: Date.now(),
        type: 'system'
      }
      setChatMessages(prev => [...prev, gameStartMessage])
      
      // Reload lobby to get updated game info
      loadLobby()
    } catch (error: any) {
      toast.error(error.message || 'Failed to start game')
    }
  }

  const handleSendChatMessage = (message: string) => {
    if (!session?.user?.id || !session?.user?.name) return

    // Basic sanitization to prevent XSS
    const sanitizedMessage = message
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .slice(0, 500) // Limit message length

    const chatMessage = {
      id: Date.now().toString() + Math.random(),
      userId: session.user.id,
      username: session.user.name,
      message: sanitizedMessage,
      timestamp: Date.now(),
      type: 'message'
    }

    // Add to local state immediately for instant feedback
    setChatMessages(prev => [...prev, chatMessage])

    // Send to other players via Socket.IO
    socket?.emit('game-action', {
      lobbyCode: code,
      action: 'chat-message',
      payload: chatMessage,
    })
  }

  const clearChat = () => {
    setChatMessages([])
    setUnreadMessageCount(0)
    toast.success('🗑️ Chat cleared!')
  }

  const handleToggleChat = () => {
    setChatMinimized(prev => {
      const newState = !prev
      // Reset unread count when opening chat
      if (!newState) {
        setUnreadMessageCount(0)
      }
      return newState
    })
  }

  const handleLeaveLobby = async () => {

    try {
      const res = await fetch(`/api/lobby/${code}/leave`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to leave lobby')
      }

      if (socket) {
        socket.emit('game-action', {
          lobbyCode: code,
          action: 'player-left',
          payload: {
            userId: session?.user?.id,
            username: session?.user?.name,
            gameEnded: data.gameEnded,
          },
        })
      }

      // Show single success message
      toast.success(data.gameEnded ? 'Game ended' : 'Left lobby')

      // Add system message to chat
      const leaveMessage = {
        id: Date.now().toString() + '_leave',
        userId: 'system',
        username: 'System',
        message: `${session?.user?.name || 'A player'} left the lobby`,
        timestamp: Date.now(),
        type: 'system'
      }
      setChatMessages(prev => [...prev, leaveMessage])

      // Redirect to game lobbies
      router.push(`/games/${lobby.gameType}/lobbies`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to leave lobby')
    }
  }

  const handleAddBot = async () => {
    try {
      const res = await fetch(`/api/lobby/${code}/add-bot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to add bot')
      }

      toast.success('🤖 Bot added to lobby!')
      
      // Reload lobby to show updated player list
      await loadLobby()

      // Notify other players
      socket?.emit('player-joined')

      // Add system message to chat
      const botJoinMessage = {
        id: Date.now().toString() + '_botjoin',
        userId: 'system',
        username: 'System',
        message: '🤖 AI Bot joined the lobby',
        timestamp: Date.now(),
        type: 'system'
      }
      setChatMessages(prev => [...prev, botJoinMessage])
    } catch (err: any) {
      toast.error(err.message || 'Failed to add bot')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    )
  }

  if (!lobby) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card max-w-md">
          <h1 className="text-2xl font-bold mb-4">Lobby Not Found</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <button onClick={() => router.push('/games/yahtzee/lobbies')} className="btn btn-primary">
            Back to Lobbies
          </button>
        </div>
      </div>
    )
  }

  const isInGame = game?.players?.some((p: any) => p.userId === session?.user?.id)
  const isGameStarted = gameEngine !== null && game?.status === 'playing'
  const isWaitingInLobby = isInGame && !isGameStarted

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Breadcrumbs */}
        <div className="mb-4 flex items-center gap-2 text-white/80 text-sm">
          <button 
            onClick={() => router.push('/')}
            className="hover:text-white transition-colors"
          >
            🏠 Home
          </button>
          <span>›</span>
          <button 
            onClick={() => router.push('/games')}
            className="hover:text-white transition-colors"
          >
            🎮 Games
          </button>
          <span>›</span>
          <button 
            onClick={() => router.push(`/games/${lobby.gameType}/lobbies`)}
            className="hover:text-white transition-colors"
          >
            🎲 Yahtzee
          </button>
          <span>›</span>
          <span className="text-white font-semibold">{lobby.code}</span>
        </div>

        <div className="card mb-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-3xl font-bold">{lobby.name}</h1>
              <p className="text-gray-600 dark:text-gray-400">
                Code: <span className="font-mono font-bold text-lg">{lobby.code}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => {
                  soundManager.toggle()
                  setSoundEnabled(soundManager.isEnabled())
                  toast.success(soundManager.isEnabled() ? '🔊 Sound enabled' : '🔇 Sound disabled')
                }} 
                className="btn btn-secondary"
                title={soundEnabled ? 'Disable sound' : 'Enable sound'}
              >
                {soundEnabled ? '🔊' : '🔇'}
              </button>
              <button onClick={handleLeaveLobby} className="btn btn-secondary">
                Leave
              </button>
            </div>
          </div>
          
          {/* Invite Link */}
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-2 border-blue-300 dark:border-blue-600 rounded-lg p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-1">
                  🔗 Invite Friends
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={typeof window !== 'undefined' ? `${window.location.origin}/lobby/join/${lobby.code}` : ''}
                    className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-600 rounded-lg font-mono text-sm"
                  />
                  <button
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        navigator.clipboard.writeText(`${window.location.origin}/lobby/join/${lobby.code}`)
                        toast.success('📋 Invite link copied to clipboard!')
                      }
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors whitespace-nowrap"
                  >
                    📋 Copy
                  </button>
                </div>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  Share this link with friends to invite them to this lobby
                </p>
              </div>
            </div>
          </div>
        </div>

        {!isInGame ? (
          <div className="card max-w-md mx-auto">
            <h2 className="text-2xl font-bold mb-4">Join Game</h2>
            {lobby.password && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Password</label>
                <input
                  type="password"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            )}
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                {error}
              </div>
            )}
            <button onClick={handleJoinLobby} className="btn btn-primary w-full">
              Join Lobby
            </button>
          </div>
        ) : (
          <>
            {/* Player List - показываем только когда есть игроки */}
            {game?.players && game.players.length > 0 && (
              <PlayerList
                players={game.players.map((p: any, index: number) => ({
                  id: p.id,
                  userId: p.userId,
                  user: {
                    username: p.user.username,
                    email: p.user.email,
                  },
                  score: gameEngine ? gameEngine.getPlayers()[index]?.score || 0 : 0,
                  position: p.position || game.players.indexOf(p),
                  isReady: true,
                }))}
                currentTurn={gameEngine?.getState().currentPlayerIndex ?? -1}
                currentUserId={session?.user?.id}
              />
            )}

            {!isGameStarted ? (
              <div className="card text-center animate-scale-in">
                <div className="mb-6">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 mb-4">
                    <span className="text-4xl">🎲</span>
                  </div>
                  <h2 className="text-3xl font-bold mb-2">
                    Ready to Play Yahtzee?
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-2">
                    {game?.players?.length || 0} player(s) in lobby
                  </p>
                  {game?.players?.length < 2 ? (
                    <p className="text-sm text-yellow-600 dark:text-yellow-400 mb-4">
                      ⏳ Waiting for more players to join... (minimum 2 players)
                    </p>
                  ) : (
                    <p className="text-sm text-green-600 dark:text-green-400 mb-4">
                      ✅ Ready to start!
                    </p>
                  )}
                  <p className="text-sm text-gray-500 dark:text-gray-500">
                    Roll the dice, score big, and have fun!
                  </p>
                </div>

                {lobby?.creatorId === session?.user?.id ? (
                  <div className="space-y-4">
                    <button
                      onClick={() => {
                        soundManager.play('click')
                        handleStartGame()
                      }}
                      disabled={game?.players?.length < 2}
                      className="btn btn-success text-lg px-8 py-3 animate-bounce-in disabled:opacity-50 disabled:cursor-not-allowed w-full"
                    >
                      🎮 Start Yahtzee Game
                    </button>
                    
                    {/* Add Bot Button */}
                    {lobby.gameType === 'yahtzee' && game?.players?.length < lobby.maxPlayers && (
                      <button
                        onClick={() => {
                          soundManager.play('click')
                          handleAddBot()
                        }}
                        disabled={game?.players?.some((p: any) => p.user?.isBot)}
                        className="btn btn-secondary text-lg px-8 py-3 w-full disabled:opacity-50 disabled:cursor-not-allowed"
                        title={game?.players?.some((p: any) => p.user?.isBot) ? 'Bot already added' : 'Add AI opponent'}
                      >
                        🤖 Add Bot Player
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-300 dark:border-blue-600 rounded-lg p-4">
                    <p className="text-blue-700 dark:text-blue-300 font-semibold">
                      ⏳ Waiting for host to start the game...
                    </p>
                    <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                      Host: {lobby?.creator?.username || lobby?.creator?.email || 'Unknown'}
                    </p>
                  </div>
                )}
              </div>
            ) : gameEngine?.isGameFinished() ? (
              // Game finished - show results
              <YahtzeeResults
                results={analyzeResults(
                  gameEngine.getPlayers().map(p => ({ ...p, score: p.score || 0 })),
                  (id) => (gameEngine as YahtzeeGame).getScorecard(id)
                )}
                currentUserId={getCurrentUserId() || null}
                onPlayAgain={handleStartGame}
                onBackToLobby={() => router.push(`/games/${lobby.gameType}/lobbies`)}
              />
            ) : (
              <>
                {/* Game Status Bar */}
                <div className="card mb-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white">
                  {gameEngine instanceof YahtzeeGame ? (
                    <div className="grid grid-cols-4 gap-4 text-center">
                      <div>
                        <p className="text-sm opacity-90">Round</p>
                        <p className="text-3xl font-bold">{Math.floor((gameEngine as YahtzeeGame).getRound() / (game?.players?.length || 1)) + 1} / 13</p>
                      </div>
                      <div>
                        <p className="text-sm opacity-90">Current Player</p>
                        <p className="text-lg font-bold truncate">
                          {(gameEngine as YahtzeeGame).getCurrentPlayer()?.name || 'Player'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm opacity-90">Your Score</p>
                        <p className="text-3xl font-bold">
                          {(gameEngine as YahtzeeGame).getPlayers().find(p => p.id === session?.user?.id)?.score || 0}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm opacity-90">Time Left</p>
                        <div className="flex items-center justify-center gap-2">
                          <div className={`text-3xl font-bold ${
                            timeLeft <= 10 ? 'text-red-300 animate-pulse' :
                            timeLeft <= 30 ? 'text-yellow-300' : ''
                          }`}>
                            {timeLeft}s
                          </div>
                          {timeLeft <= 10 && (
                            <span className="text-2xl animate-bounce">⏰</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-gray-500">Loading game status...</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {gameEngine instanceof YahtzeeGame ? (
                    <>
                      {/* Yahtzee Dice Section - Left Column */}
                      <div className="lg:col-span-1">
                        <DiceGroup
                          dice={(gameEngine as YahtzeeGame).getDice()}
                          held={(gameEngine as YahtzeeGame).getHeld()}
                          onToggleHold={handleToggleHold}
                          disabled={isMoveInProgress || (gameEngine as YahtzeeGame).getRollsLeft() === 3 || !isMyTurn()}
                        />

                        {/* Roll Button */}
                        <div className="card mt-4">
                          {/* Turn Indicator */}
                          <div className={`text-center mb-4 p-4 rounded-lg transition-all ${
                            isMyTurn()
                              ? timeLeft <= 10
                                ? 'bg-red-100 dark:bg-red-900 border-2 border-red-500 animate-pulse'
                                : timeLeft <= 30
                                  ? 'bg-yellow-100 dark:bg-yellow-900 border-2 border-yellow-500'
                                  : 'bg-green-100 dark:bg-green-900 border-2 border-green-500'
                              : 'bg-gray-100 dark:bg-gray-700'
                          }`}>
                            {isMyTurn() ? (
                              <div className="space-y-2">
                                <p className="text-xl font-bold text-green-600 dark:text-green-400">
                                  🎯 YOUR TURN!
                                </p>
                                <div className={`text-3xl font-extrabold ${
                                  timeLeft <= 10
                                    ? 'text-red-600 dark:text-red-400'
                                    : timeLeft <= 30
                                      ? 'text-yellow-600 dark:text-yellow-400'
                                      : 'text-gray-700 dark:text-gray-300'
                                }`}>
                                  <span className={timeLeft <= 10 ? 'animate-bounce inline-block' : ''}>
                                    {timeLeft <= 10 ? '⏰' : '⏱️'}
                                  </span> {timeLeft}s
                                </div>
                                {timeLeft <= 10 && (
                                  <p className="text-sm text-red-600 dark:text-red-400 font-semibold">
                                    ⚠️ Hurry up! Time is running out!
                                  </p>
                                )}
                              </div>
                            ) : (
                              <p className="text-lg font-semibold text-gray-600 dark:text-gray-400">
                                ⏳ Waiting for {game?.players?.[(gameEngine as YahtzeeGame).getState().currentPlayerIndex]?.user?.username || game?.players?.[(gameEngine as YahtzeeGame).getState().currentPlayerIndex]?.user?.name || 'player'}...
                              </p>
                            )}
                          </div>

                          <div className="text-center mb-4">
                            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                              Rolls Left: {(gameEngine as YahtzeeGame).getRollsLeft()}
                            </p>
                            {(gameEngine as YahtzeeGame).getRollsLeft() === 0 && isMyTurn() && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                Choose a category to score
                              </p>
                            )}
                          </div>
                          <button
                            onClick={handleRollDice}
                            disabled={isRolling || isMoveInProgress || (gameEngine as YahtzeeGame).getRollsLeft() === 0 || !isMyTurn()}
                            className="btn btn-primary w-full text-lg py-4 flex items-center justify-center gap-2 relative"
                          >
                            {isRolling ? (
                              <>
                                <svg
                                  className="animate-spin h-5 w-5"
                                  xmlns="http://www.w3.org/2000/svg"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                >
                                  <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                  />
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  />
                                </svg>
                                Rolling...
                              </>
                            ) : (
                              <>
                                🎲 Roll Dice
                              </>
                            )}
                          </button>
                        </div>

                        {/* Roll History */}
                        {rollHistory.length > 0 && (
                          <div className="mt-4">
                            <RollHistory entries={rollHistory} />
                          </div>
                        )}
                      </div>

                      {/* Yahtzee Scorecard Section - Right Columns */}
                      <div className="lg:col-span-2">
                        {/* Player Selector */}
                        <div className="card mb-4">
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                              View Player's Scorecard
                            </h3>
                            <div className="flex gap-2">
                              {game?.players?.map((player: any, index: number) => {
                                const isMe = player.userId === session?.user?.id
                                const isViewing = viewingPlayerIndex === index
                                const isCurrentTurn = (gameEngine as YahtzeeGame).getState().currentPlayerIndex === index

                                return (
                                  <button
                                    key={player.id}
                                    onClick={() => setViewingPlayerIndex(index)}
                                    className={`
                                      px-4 py-2 rounded-lg font-semibold transition-all relative
                                      ${isViewing
                                        ? 'bg-blue-600 text-white shadow-lg scale-105'
                                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                                      }
                                    `}
                                  >
                                    {isMe ? '👤 You' : player.user?.username || `Player ${index + 1}`}
                                    {isCurrentTurn && (
                                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
                                    )}
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          {/* Current Viewing Info */}
                          <div className={`p-3 rounded-lg ${
                            viewingPlayerIndex === getCurrentPlayerIndex()
                              ? 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-300 dark:border-blue-600'
                              : 'bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-300 dark:border-yellow-600'
                          }`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {viewingPlayerIndex === getCurrentPlayerIndex() ? (
                                  <>
                                    <span className="text-2xl">📊</span>
                                    <div>
                                      <p className="font-bold text-blue-700 dark:text-blue-300">Your Scorecard</p>
                                      <p className="text-sm text-blue-600 dark:text-blue-400">
                                        {isMyTurn() ? "It's your turn!" : "Waiting for your turn..."}
                                      </p>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <span className="text-2xl">👀</span>
                                    <div>
                                      <p className="font-bold text-yellow-700 dark:text-yellow-300">
                                        Viewing: {game?.players[viewingPlayerIndex]?.user?.username || `Player ${viewingPlayerIndex + 1}`}
                                      </p>
                                      <p className="text-sm text-yellow-600 dark:text-yellow-400">
                                        {(gameEngine as YahtzeeGame).getState().currentPlayerIndex === viewingPlayerIndex
                                          ? "Currently playing..."
                                          : "Waiting for turn"}
                                      </p>
                                    </div>
                                  </>
                                )}
                              </div>
                              <div className="text-right">
                                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                  {gameEngine.getPlayers()[viewingPlayerIndex]?.score || 0}
                                </p>
                                <p className="text-xs text-gray-600 dark:text-gray-400">Total Score</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <Scorecard
                          scorecard={(gameEngine as YahtzeeGame).getScorecard(game.players[viewingPlayerIndex]?.userId) || {}}
                          currentDice={(gameEngine as YahtzeeGame).getDice()}
                          onSelectCategory={handleScoreSelection}
                          canSelectCategory={(gameEngine as YahtzeeGame).getRollsLeft() < 3 && isMyTurn() && viewingPlayerIndex === getCurrentPlayerIndex() && !isScoring}
                          isCurrentPlayer={viewingPlayerIndex === getCurrentPlayerIndex()}
                          isLoading={isScoring}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-gray-500">Loading game...</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Bot Move Overlay */}
      {showingBotOverlay && botMoveSteps.length > 0 && (
        <BotMoveOverlay
          steps={botMoveSteps}
          currentStepIndex={currentBotStepIndex}
          botName={botPlayerName}
          onComplete={() => {
            setShowingBotOverlay(false)
            setBotMoveSteps([])
            setCurrentBotStepIndex(0)
            setBotPlayerName('')
          }}
        />
      )}

      {/* Celebration Banner */}
      {celebrationEvent && (
        <CelebrationBanner
          event={celebrationEvent}
          onComplete={() => setCelebrationEvent(null)}
        />
      )}

      {/* Chat Component */}
      {isInGame && (
        <Chat
          messages={chatMessages}
          onSendMessage={handleSendChatMessage}
          currentUserId={getCurrentUserId()}
          isMinimized={chatMinimized}
          onToggleMinimize={handleToggleChat}
          onClearChat={clearChat}
          unreadCount={unreadMessageCount}
          someoneTyping={someoneTyping}
        />
      )}
    </div>
  )
}

export default function LobbyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    }>
      <LobbyPageContent />
    </Suspense>
  )
}
