'use client'

import React, { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import toast from 'react-hot-toast'
import PlayerList from '@/components/PlayerList'
import Scorecard from '@/components/Scorecard'
import LoadingSpinner from '@/components/LoadingSpinner'
import Chat from '@/components/Chat'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { soundManager } from '@/lib/sounds'
import { useConfetti } from '@/hooks/useConfetti'
import { createBotMoveVisualization, detectBotMove, findFilledCategory } from '@/lib/bot-visualization'
import BotMoveOverlay from '@/components/BotMoveOverlay'
import RollHistory, { RollHistoryEntry } from '@/components/RollHistory'
import { detectCelebration, CelebrationEvent } from '@/lib/celebrations'
import YahtzeeResults from '@/components/YahtzeeResults'
import { analyzeResults } from '@/lib/yahtzee-results'
import { clientLogger } from '@/lib/client-logger'
import { Game, GameUpdatePayload, PlayerJoinedPayload, GameStartedPayload, LobbyUpdatePayload, ChatMessagePayload, PlayerTypingPayload, BotMoveStep } from '@/types/game'
import { selectBestAvailableCategory, calculateScore, YahtzeeCategory } from '@/lib/yahtzee'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useTranslation } from 'react-i18next'

// Category display names for UI
const CATEGORY_DISPLAY_NAMES: Record<YahtzeeCategory, string> = {
  ones: 'Ones',
  twos: 'Twos',
  threes: 'Threes',
  fours: 'Fours',
  fives: 'Fives',
  sixes: 'Sixes',
  threeOfKind: 'Three of a Kind',
  fourOfKind: 'Four of a Kind',
  fullHouse: 'Full House',
  smallStraight: 'Small Straight',
  largeStraight: 'Large Straight',
  yahtzee: 'Yahtzee',
  chance: 'Chance'
}

// Database player type
interface DBPlayer {
  id: string
  userId: string
  score: number
  placement?: number | null
  user: {
    id: string
    username: string | null
    name?: string | null
    isBot?: boolean
  }
}

// New modular imports
import { useGuestMode } from './hooks/useGuestMode'
import { useSocketConnection } from './hooks/useSocketConnection'
import { useGameTimer } from './hooks/useGameTimer'
import { useGameActions } from './hooks/useGameActions'
import { useLobbyActions } from './hooks/useLobbyActions'
import { useBotTurn } from './hooks/useBotTurn'
import LobbyInfo from './components/LobbyInfo'
import GameBoard from './components/GameBoard'
import WaitingRoom from './components/WaitingRoom'
import JoinPrompt from './components/JoinPrompt'
import MobileTabs, { TabId } from './components/MobileTabs'
import MobileTabPanel from './components/MobileTabPanel'
import FriendsListModal from '@/components/FriendsListModal'
import { showToast } from '@/lib/i18n-toast'

function LobbyPageContent() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()
  const code = params.code as string
  
  const isGuest = searchParams.get('guest') === 'true'
  const { guestName, guestId } = useGuestMode(isGuest, code)

  // Log session status for debugging
  useEffect(() => {
    clientLogger.log('Session status:', { status, isGuest, hasSession: !!session, userId: session?.user?.id })
  }, [status, isGuest, session])

  // Core state
  const [lobby, setLobby] = useState<Record<string, unknown> | null>(null)
  const [game, setGame] = useState<Game | null>(null)
  const [gameEngine, setGameEngine] = useState<YahtzeeGame | null>(null)
  const [loading, setLoading] = useState(true)
  const [startingGame, setStartingGame] = useState(false)
  const [error, setError] = useState('')
  const [soundEnabled, setSoundEnabled] = useState(true)
  const { celebrate, fireworks } = useConfetti()
  const { t } = useTranslation()

  const roundInfo = React.useMemo(() => {
    if (!gameEngine) return { current: 1, total: 13 }
    const players = gameEngine.getPlayers()
    const filledCounts = players.map(p => {
      const scorecard = gameEngine.getScorecard(p.id)
      return scorecard ? Object.keys(scorecard).length : 0
    })
    const maxFilled = filledCounts.length ? Math.max(...filledCounts) : 0
    const current = Math.min(13, maxFilled + 1)
    return { current, total: 13 }
  }, [gameEngine, game?.state])

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessagePayload[]>([])
  const [chatMinimized, setChatMinimized] = useState(true) // Чат свёрнут по умолчанию
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
  
  // Mobile tabs state
  const [mobileActiveTab, setMobileActiveTab] = useState<TabId>('game')

  // Selected player for viewing their scorecard
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)

  // Friends invite modal state
  const [showFriendsModal, setShowFriendsModal] = useState(false)

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

  // Sync soundEnabled state with soundManager on mount
  useEffect(() => {
    setSoundEnabled(soundManager.isEnabled())
  }, [])

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
  const prevCurrentPlayerIdRef = React.useRef<string | undefined>()
  
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
        soundManager.play('turnChange')
      } else if (prevPlayerIdRef.current === currentUserId) {
        // Turn moved away from us to another player - play turn change sound
        soundManager.play('turnChange')
      }
    }
    prevPlayerIdRef.current = currentPlayerId
  }, [currentPlayerId, getCurrentUserId])

  // Create ref for loadLobby to avoid circular dependency
  const loadLobbyRef = React.useRef<(() => Promise<void>) | null>(null)

  // Memoize socket event handlers to prevent infinite loops
  const onGameUpdate = useCallback((payload: GameUpdatePayload) => {
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
        
        if (game?.id) {
          const newEngine = new YahtzeeGame(game.id)
          newEngine.restoreState(parsedState)
          setGameEngine(newEngine)
          
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
            const player = game.players.find((p) => p.id === lastRoll.playerId)
            
            // Safety check: ensure player exists and has required data
            if (player?.user?.username && lastRoll.dice && lastRoll.timestamp) {
              const playerCount = game.players.length
              const currentRound = parsedState.data.round || 1
              const turnNumber = Math.floor((currentRound - 1) / playerCount) + 1
              const currentUserId = getCurrentUserId()
              
              // Check if this roll is already in history (by timestamp)
              setRollHistory(prev => {
                const exists = prev.some(entry => 
                  Math.abs(entry.timestamp - lastRoll.timestamp) < 1000 // Within 1 second
                )
                
                if (exists) return prev
                
                // Play dice roll sound for other players' rolls (not our own)
                if (lastRoll.playerId !== currentUserId) {
                  soundManager.play('diceRoll')
                }
                
                return [...prev, {
                  id: `${lastRoll.playerId}-${lastRoll.timestamp}`,
                  playerName: player.user?.username || player.name || 'Unknown',
                  dice: lastRoll.dice,
                  rollNumber: lastRoll.rollNumber,
                  turnNumber: turnNumber,
                  held: lastRoll.held,
                  isBot: player.user?.isBot || player.isBot || false,
                  timestamp: lastRoll.timestamp,
                }]
              })
            }
          }
        }
        
        // Note: Bot move detection handled by bot-visualization.ts
      } catch (e) {
        clientLogger.error('Failed to parse game state:', e)
      }
    } else {
      clientLogger.warn('📡 game-update received but no state found:', payload)
    }
  }, [game?.id, game?.players, getCurrentUserId])

  const onChatMessage = useCallback((message: ChatMessagePayload) => {
    setChatMessages(prev => [...prev, message])
    if (chatMinimized) {
      setUnreadMessageCount(prev => prev + 1)
    }
  }, [chatMinimized])

  const typingTimeoutRef = React.useRef<NodeJS.Timeout>()
  
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
    
    // Show notification
    const currentUserId = isGuest ? guestId : session?.user?.id
    if (data.username && data.userId !== currentUserId) {
      toast.success(`${data.username} joined the lobby`)
      soundManager.play('playerJoin')
    }
  }, [isGuest, guestId, session?.user?.id])

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
      toast.success(`🎲 Game started! ${data.firstPlayerName} goes first!`)
    }
    
    soundManager.play('gameStart')
  }, [isGuest, guestId, session?.user?.id, lobby?.creatorId])

  const onBotAction = useCallback((event: any) => {
    clientLogger.log('🤖 Received bot-action:', event)
    
    const botName = event.botName || 'Bot'
    
    // Add bot action to roll history ONLY if dice are present (after roll, not before)
    if (event.type === 'roll' && event.data?.dice && gameEngine) {
      const currentRound = gameEngine.getRound()
      const playerCount = game?.players?.length || 1
      const turnNumber = Math.floor(currentRound / playerCount) + 1
      
      setRollHistory(prev => [...prev, {
        id: `bot-${Date.now()}-${Math.random()}`,
        playerName: botName,
        dice: event.data.dice,
        rollNumber: event.data.rollNumber || 1,
        turnNumber: turnNumber,
        held: event.data.held || [],
        isBot: true,
        timestamp: Date.now(),
      }])
      
      // Play sound ONLY after roll completes (when dice data is present)
      soundManager.play('diceRoll')
    }
    
    // Only show toast for final scoring action - skip thinking/hold/roll toasts
    if (event.type === 'score') {
      toast.success(event.message)
      soundManager.play('score')
    }
    
    // Log all actions to console for debugging
    clientLogger.log(`🤖 ${event.message}`)
  }, [gameEngine, game?.players?.length])

  const onGameAbandoned = useCallback((data: { gameId: string; reason?: string }) => {
    clientLogger.log('📡 Game abandoned:', data)
    
    const reason = data.reason
    if (reason === 'no_human_players') {
      showToast.error('lobby.gameAbandoned')
    } else if (reason === 'insufficient_players') {
      showToast.error('lobby.gameAbandoned')
    }
    
    // Refresh lobby data
    if (loadLobbyRef.current) {
      loadLobbyRef.current()
    }
    
    // Navigate back to lobby list after a short delay
    setTimeout(() => {
      router.push('/games/yahtzee/lobbies')
    }, 3000)
  }, [router])

  const onPlayerLeft = useCallback((data: { userId: string; username: string }) => {
    clientLogger.log('📡 Player left:', data)
    
    if (data.username) {
      showToast.info('toast.playerLeft', undefined, { player: data.username })
    }
    
    // Refresh lobby data
    if (loadLobbyRef.current) {
      loadLobbyRef.current()
    }
  }, [])

  // Socket connection hook - must be before useLobbyActions
  const { socket, isConnected, isReconnecting, reconnectAttempt, emitWhenConnected } = useSocketConnection({
    code,
    session,
    isGuest,
    guestId,
    guestName,
    onGameUpdate,
    onChatMessage,
    onPlayerTyping,
    onLobbyUpdate,
    onPlayerJoined,
    onGameStarted,
    onGameAbandoned,
    onPlayerLeft,
    onBotAction,
  })

  // Calculate once to avoid calling functions repeatedly
  const userId = getCurrentUserId()
  const username = getCurrentUserName()

  // Lobby actions hook - after socket is initialized
  const {
    loadLobby,
    addBotToLobby,
    handleJoinLobby,
    handleStartGame,
    password,
    setPassword,
  } = useLobbyActions({
    code,
    lobby,
    game,
    setGame,
    setLobby,
    setGameEngine,
    setTimerActive: (active) => {}, // Will be set by timer hook
    setTimeLeft: (time) => {},
    setRollHistory,
    setCelebrationEvent,
    setChatMessages,
    socket, // Now socket is available
    isGuest,
    guestId,
    guestName,
    userId,
    username,
    setError,
    setLoading,
    setStartingGame,
  })

  // Update ref with loadLobby function
  React.useEffect(() => {
    loadLobbyRef.current = loadLobby
  })

  // Create refs for game actions to use in timer callback
  const handleScoreRef = React.useRef<((category: any) => Promise<void>) | null>(null)
  const handleRollDiceRef = React.useRef<(() => Promise<void>) | null>(null)

  // Game timer hook
  const { timeLeft, timerActive } = useGameTimer({
    isMyTurn: isMyTurn(),
    gameState: gameEngine?.getState() || null,
    onTimeout: async () => {
      if (!isMyTurn() || !gameEngine || !handleScoreRef.current) {
        clientLogger.warn('⏰ Timer expired but conditions not met', {
          isMyTurn: isMyTurn(),
          hasGameEngine: !!gameEngine,
          hasHandleScore: !!handleScoreRef.current
        })
        return
      }
      
      clientLogger.warn('⏰ Timer expired, auto-selecting best available category')
      
      const rollsLeft = gameEngine.getRollsLeft()
      const currentPlayer = gameEngine.getCurrentPlayer()
      
      if (!currentPlayer) {
        clientLogger.error('⏰ No current player found')
        return
      }
      
      // If player hasn't rolled yet (rollsLeft === 3), we MUST roll first
      // This is a Yahtzee rule - you can't score without rolling
      if (rollsLeft === 3) {
        if (!handleRollDiceRef.current) {
          clientLogger.error('⏰ Player hasn\'t rolled but handleRollDice not available')
          toast.error('⏰ Time\'s up! Please roll the dice first.')
          return
        }
        
        clientLogger.log('⏰ Player hasn\'t rolled - auto-rolling once before scoring')
        try {
          // Roll the dice once
          await handleRollDiceRef.current()
          // Small delay to let state update propagate
          await new Promise(resolve => setTimeout(resolve, 300))
        } catch (error) {
          clientLogger.error('⏰ Failed to auto-roll:', error)
          toast.error('Failed to auto-roll. Please roll manually.')
          return
        }
      }
      
      // Get final state after potential roll
      const finalDice = gameEngine.getDice()
      const scorecard = gameEngine.getScorecard(currentPlayer.id)
      
      if (!scorecard) {
        clientLogger.error('⏰ No scorecard found')
        return
      }
      
      // Use smart category selection
      const bestCategory = selectBestAvailableCategory(finalDice, scorecard)
      const score = calculateScore(finalDice, bestCategory)
      
      clientLogger.log('⏰ Auto-scoring:', { 
        category: bestCategory, 
        score, 
        dice: finalDice,
        rollsUsed: 3 - gameEngine.getRollsLeft()
      })
      
      const displayName = CATEGORY_DISPLAY_NAMES[bestCategory]
      
      // Show friendly toast message without dice array
      if (score === 0) {
        toast.error(
          `⏰ Time's up! Scored 0 points in ${displayName}`,
          { duration: 4000 }
        )
      } else {
        toast(
          `⏰ Time's up! Scored ${score} points in ${displayName}`,
          { 
            duration: 4000,
            icon: '⏱️',
          }
        )
      }
      
      try {
        await handleScoreRef.current(bestCategory)
      } catch (error) {
        clientLogger.error('⏰ Failed to auto-score:', error)
        toast.error('Failed to auto-score. Please select a category manually.')
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
    held, // Local held state for dice locking
  } = useGameActions({
    game,
    gameEngine,
    setGameEngine,
    isGuest,
    guestId,
    guestName,
    userId,
    username,
    isMyTurn: isMyTurn(),
    emitWhenConnected,
    code,
    setRollHistory,
    setCelebrationEvent,
    setTimerActive: () => {}, // Timer managed by useGameTimer
    celebrate,
    fireworks,
  })

  // Update refs for timer
  React.useEffect(() => {
    handleScoreRef.current = handleScore
    handleRollDiceRef.current = handleRollDice
  }, [handleScore, handleRollDice])

  // Bot turn automation hook
  const { triggerBotTurn } = useBotTurn({
    game,
    gameEngine,
    code,
    isGameStarted: game?.status === 'playing',
  })

  // Load lobby on mount
  useEffect(() => {
    if (status === 'loading') return
    if (!isGuest && status === 'unauthenticated') {
      router.push(`/auth/login?callbackUrl=/lobby/${code}`)
      return
    }
    if (isGuest && !guestName) return
    
    // Call via ref to avoid dependency on loadLobby function
    if (loadLobbyRef.current) {
      loadLobbyRef.current()
    }
  }, [status, isGuest, guestName, code, router])

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
    if (!gameEngine || !game) return
    
    if (gameEngine.isGameFinished()) {
      const dice = gameEngine.getDice()
      const celebration = detectCelebration(dice)
      if (celebration) {
        setCelebrationEvent(celebration)
        soundManager.play('celebration')
      }
    }
  }, [gameEngine, game])
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
    }
  }, [])

  const handleLeaveLobby = async () => {
    try {
      // Call leave API
      const res = await fetch(`/api/lobby/${code}/leave`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await res.json()

      if (!res.ok) {
        showToast.error('errors.unexpected')
        clientLogger.error('Failed to leave lobby:', data.error)
        return
      }

      // Disconnect socket
      if (socket) {
        socket.emit('leave-lobby', code)
        socket.disconnect()
      }

      // Show appropriate message
      if (data.gameAbandoned) {
        showToast.info('lobby.gameAbandoned')
      } else {
        showToast.success('lobby.leftLobby')
      }

      // Redirect
      router.push(`/games/${lobby?.gameType || 'yahtzee'}/lobbies`)
    } catch (error) {
      clientLogger.error('Error leaving lobby:', error)
      showToast.error('errors.unexpected')
      
      // Fallback: disconnect and redirect anyway
      if (socket) {
        socket.emit('leave-lobby', code)
        socket.disconnect()
      }
      router.push(`/games/${lobby?.gameType || 'yahtzee'}/lobbies`)
    }
  }

  const handleAddBot = async () => {
    await addBotToLobby()
  }

  const handleInviteFriends = useCallback(async (friendIds: string[]) => {
    if (!lobby || friendIds.length === 0) return

    clientLogger.log('Inviting friends to lobby', { friendIds, lobbyCode: code })

    try {
      // Create lobby join link
      const lobbyUrl = `${window.location.origin}/lobby/join/${code}`
      
      // TODO: Implement invitation system (e.g., notifications, direct messages, etc.)
      // For now, just copy the link to clipboard and show toast
      
      await navigator.clipboard.writeText(lobbyUrl)
      showToast.success('lobby.invite.linkCopied', undefined, { 
        count: friendIds.length 
      })
      
      clientLogger.log('Lobby link copied for friends', { url: lobbyUrl, friendCount: friendIds.length })
      
      // Close modal
      setShowFriendsModal(false)
    } catch (error) {
      clientLogger.error('Failed to invite friends', { error })
      showToast.error('errors.general')
    }
  }, [lobby, code])

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

  // Show loading while session is being fetched (for non-guest users)
  if (!isGuest && status === 'loading') {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <LoadingSpinner size="lg" />
        <p className="ml-4 text-gray-600 dark:text-gray-400">Loading session...</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!lobby) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="card max-w-md mx-auto text-center">
          <h1 className="text-2xl font-bold mb-4">Lobby Not Found</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            The lobby you're looking for doesn't exist or has been closed.
          </p>
          <button
            onClick={() => router.push('/games')}
            className="btn btn-primary"
          >
            Back to Games
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Показываем информацию о лобби только если игра не началась */}
      {!isGameStarted && (
        <div className="mb-6">
          <LobbyInfo
            lobby={lobby}
            soundEnabled={soundEnabled}
            onSoundToggle={() => {
              soundManager.toggle()
              setSoundEnabled(soundManager.isEnabled())
              toast.success(soundManager.isEnabled() ? '🔊 Sound enabled' : '🔇 Sound disabled')
            }}
            onLeave={handleLeaveLobby}
          />
        </div>
      )}

      {!isInGame ? (
        <JoinPrompt
          lobby={lobby}
          password={password}
          setPassword={setPassword}
          error={error}
          onJoin={handleJoinLobby}
        />
      ) : !isGameStarted ? (
        // Waiting Room - Centered Layout
        <WaitingRoom
          game={game}
          lobby={lobby}
          gameEngine={gameEngine}
          canStartGame={canStartGame}
          startingGame={startingGame}
          onStartGame={handleStartGame}
          onAddBot={handleAddBot}
          onInviteFriends={!isGuest ? () => setShowFriendsModal(true) : undefined}
          getCurrentUserId={getCurrentUserId}
        />
      ) : (
        // Game Started - ABSOLUTE NO SCROLL - Fixed viewport
        <div className="fixed inset-0 top-20 flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
          {gameEngine?.isGameFinished() ? (
            <YahtzeeResults
              results={analyzeResults(
                gameEngine.getPlayers().map(p => ({ ...p, score: p.score || 0 })),
                (id) => gameEngine.getScorecard(id)
              )}
              currentUserId={getCurrentUserId() || null}
              canStartGame={!!canStartGame}
              onPlayAgain={handleStartGame}
              onBackToLobby={() => router.push(`/games/${lobby.gameType}/lobbies`)}
            />
          ) : gameEngine ? (
            <>
              {/* Top Status Bar - Responsive */}
              <div className="flex-shrink-0 mb-3 px-2 sm:px-4">
                <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 text-white rounded-xl px-2 sm:px-4 py-2 shadow-lg">
                  {/* Mobile: Compact 2-row layout */}
                  <div className="md:hidden">
                    {/* Row 1: Game Info */}
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/20">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <span className="text-base">🎯</span>
                          <span className="text-sm font-bold">
                            {t('yahtzee.ui.round')}: {roundInfo.current}/{roundInfo.total}
                          </span>
                        </div>
                        <div className="h-4 w-px bg-white/30"></div>
                        <div className="flex items-center gap-1 max-w-[120px]">
                          <span className="text-base">👤</span>
                          <span className="text-sm font-bold truncate">
                            {gameEngine.getCurrentPlayer()?.name || t('yahtzee.ui.playerFallback')}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-base">🏆</span>
                        <span className="text-sm font-bold">
                          {gameEngine.getPlayers().find(p => p.id === getCurrentUserId())?.score || 0}
                        </span>
                      </div>
                    </div>
                    
                    {/* Row 2: Actions */}
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => {
                          const newState = soundManager.toggle()
                          setSoundEnabled(newState)
                          toast.success(newState ? t('yahtzee.ui.soundOn') : t('yahtzee.ui.soundOff'), {
                            duration: 2000,
                            position: 'top-center',
                          })
                        }}
                        aria-label={soundEnabled ? t('yahtzee.ui.disableSound') : t('yahtzee.ui.enableSound')}
                        className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded-lg transition-all text-base flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
                        title={soundEnabled ? t('yahtzee.ui.disableSound') : t('yahtzee.ui.enableSound')}
                      >
                        <span className="text-base">{soundEnabled ? '🔊' : '🔇'}</span>
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(t('yahtzee.ui.leaveConfirm'))) {
                            handleLeaveLobby()
                          }
                        }}
                        aria-label={t('yahtzee.ui.leave')}
                        className="px-2 py-1 bg-red-500/90 hover:bg-red-600 rounded-lg transition-all font-medium text-xs flex items-center gap-1 shadow-lg hover:shadow-xl focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
                      >
                        <span className="text-base">🚪</span>
                        <span>{t('yahtzee.ui.leave')}</span>
                      </button>
                    </div>
                  </div>

                  {/* Desktop/Tablet: Original layout */}
                  <div className="hidden md:flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xl">🎯</span>
                        <div>
                          <div className="text-[10px] opacity-75 leading-tight">{t('yahtzee.ui.round')}</div>
                          <div className="text-base font-bold leading-tight">
                            {roundInfo.current}/{roundInfo.total}
                          </div>
                        </div>
                      </div>
                      <div className="h-6 w-px bg-white/30"></div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xl">👤</span>
                        <div>
                          <div className="text-[10px] opacity-75 leading-tight">{t('yahtzee.ui.turn')}</div>
                          <div className="text-base font-bold leading-tight truncate max-w-[150px]">
                            {gameEngine.getCurrentPlayer()?.name || t('yahtzee.ui.playerFallback')}
                          </div>
                        </div>
                      </div>
                      <div className="h-6 w-px bg-white/30"></div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xl">🏆</span>
                        <div>
                          <div className="text-[10px] opacity-75 leading-tight">Your Score</div>
                          <div className="text-base font-bold leading-tight">
                            {gameEngine.getPlayers().find(p => p.id === getCurrentUserId())?.score || 0}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const newState = soundManager.toggle()
                          setSoundEnabled(newState)
                          toast.success(newState ? '🔊 Sound enabled' : '🔇 Sound disabled', {
                            duration: 2000,
                            position: 'top-center',
                          })
                        }}
                        aria-label={soundEnabled ? 'Disable sound effects' : 'Enable sound effects'}
                        className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-all text-base font-medium flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
                        title={soundEnabled ? 'Disable sound' : 'Enable sound'}
                      >
                        <span className="text-lg">{soundEnabled ? '🔊' : '🔇'}</span>
                        <span className="hidden sm:inline text-xs">Sound</span>
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Are you sure you want to leave the game?')) {
                            handleLeaveLobby()
                          }
                        }}
                        aria-label="Leave game"
                        className="px-3 py-1.5 bg-red-500/90 hover:bg-red-600 rounded-lg transition-all font-medium text-xs flex items-center gap-1.5 shadow-lg hover:shadow-xl focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
                      >
                        <span className="text-base">🚪</span>
                        <span>Leave</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Main Game Area - More spacing between columns */}
              <div className="flex-1 min-h-0 relative">
                {/* Desktop: Grid Layout */}
                <div className="hidden md:grid grid-cols-1 lg:grid-cols-12 gap-6 px-4 pb-4 h-full overflow-hidden">
                  {/* Left: Dice Controls - 3 columns, Fixed Height */}
                  <div className="lg:col-span-3 flex flex-col h-full overflow-hidden">
                    <GameBoard
                      gameEngine={gameEngine}
                      game={game}
                      isMyTurn={isMyTurn()}
                      timeLeft={timeLeft}
                      isMoveInProgress={isMoveInProgress}
                      isRolling={isRolling}
                      isScoring={isScoring}
                      celebrationEvent={celebrationEvent}
                      held={held}
                      getCurrentUserId={getCurrentUserId}
                      onRollDice={handleRollDice}
                      onToggleHold={handleToggleHold}
                      onScore={handleScore}
                      onCelebrationComplete={() => setCelebrationEvent(null)}
                    />
                  </div>

                  {/* Center: Scorecard - 6 columns, Internal Scroll Only */}
                  <div className="lg:col-span-6 h-full overflow-hidden">
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
                  <div className="lg:col-span-3 h-full overflow-hidden flex flex-col gap-3">
                    {/* Players List - 40% of space */}
                    <div className="flex-1 min-h-0 overflow-hidden">
                      <PlayerList
                        players={game?.players?.map(p => {
                          // Find the player's actual position in the game engine
                          const enginePlayer = gameEngine.getPlayers().find(ep => ep.id === p.userId)
                          const actualPosition = enginePlayer ? gameEngine.getPlayers().indexOf(enginePlayer) : 0
                          
                          return {
                            id: p.id,
                            userId: p.userId,
                            user: {
                              name: p.user?.username || null,
                              username: p.user?.username || null,
                              email: null,
                              isBot: p.user?.isBot || false,
                            },
                            score: enginePlayer?.score || 0,
                            position: actualPosition, // Use position from game engine, not DB
                            isReady: true,
                          }
                        }) || []}
                        currentTurn={gameEngine.getState().currentPlayerIndex}
                        currentUserId={getCurrentUserId()}
                        onPlayerClick={(userId) => {
                          // Toggle selection: if clicking same player, deselect; otherwise select
                          setSelectedPlayerId(prev => prev === userId ? null : userId)
                        }}
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
                <div className="md:hidden h-full relative">
                  {/* Game Tab */}
                  <MobileTabPanel id="game" activeTab={mobileActiveTab}>
                    <div className="p-4 space-y-4">
                      <GameBoard
                        gameEngine={gameEngine}
                        game={game}
                        isMyTurn={isMyTurn()}
                        timeLeft={timeLeft}
                        isMoveInProgress={isMoveInProgress}
                        isRolling={isRolling}
                        isScoring={isScoring}
                        celebrationEvent={celebrationEvent}
                        held={held}
                        getCurrentUserId={getCurrentUserId}
                        onRollDice={handleRollDice}
                        onToggleHold={handleToggleHold}
                        onScore={handleScore}
                        onCelebrationComplete={() => setCelebrationEvent(null)}
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
                        players={game?.players?.map(p => {
                          const enginePlayer = gameEngine.getPlayers().find(ep => ep.id === p.userId)
                          const actualPosition = enginePlayer ? gameEngine.getPlayers().indexOf(enginePlayer) : 0
                          
                          return {
                            id: p.id,
                            userId: p.userId,
                            user: {
                              name: p.user?.username || null,
                              username: p.user?.username || null,
                              email: null,
                              isBot: p.user?.isBot || false,
                            },
                            score: enginePlayer?.score || 0,
                            position: actualPosition,
                            isReady: true,
                          }
                        }) || []}
                        currentTurn={gameEngine.getState().currentPlayerIndex}
                        currentUserId={getCurrentUserId()}
                        onPlayerClick={(userId) => {
                          setSelectedPlayerId(prev => prev === userId ? null : userId)
                          // Switch to scorecard tab when clicking player
                          setMobileActiveTab('scorecard')
                        }}
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
                    <div className="h-full">
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
                        onToggleMinimize={() => {}}
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
                  { id: 'scorecard', label: 'Score', icon: '📊' },
                  { id: 'players', label: 'Players', icon: '👥' },
                  { id: 'chat', label: 'Chat', icon: '💬', badge: unreadMessageCount },
                ]}
                unreadChatCount={unreadMessageCount}
              />
            </>
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
    </div>
  )
}

export default function LobbyPage() {
  return (
    <ErrorBoundary
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-900">
          <div className="max-w-md w-full bg-gray-800 rounded-lg p-8 text-center">
            <div className="text-red-500 text-6xl mb-4">🎲</div>
            <h1 className="text-2xl font-bold text-white mb-4">
              Game Error
            </h1>
            <p className="text-gray-400 mb-6">
              Something went wrong with the game lobby. Please try again.
            </p>
            <button
              onClick={() => window.location.href = '/games/yahtzee/lobbies'}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
            >
              Back to Lobbies
            </button>
          </div>
        </div>
      }
    >
      <Suspense fallback={<LoadingSpinner size="lg" />}>
        <LobbyPageContent />
      </Suspense>
    </ErrorBoundary>
  )
}
