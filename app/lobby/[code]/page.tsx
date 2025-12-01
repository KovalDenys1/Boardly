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

  // Selected player for viewing their scorecard
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)

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
    return (session?.user as any)?.username || session?.user?.email || session?.user?.name || 'You'
  }, [isGuest, guestName, session?.user])

  const isMyTurn = useCallback(() => {
    if (!gameEngine || !game) return false
    const currentPlayer = gameEngine.getCurrentPlayer()
    return currentPlayer?.id === getCurrentUserId()
  }, [gameEngine, game, getCurrentUserId])

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
          setGame((prevGame: any) => ({
            ...prevGame,
            state: JSON.stringify(parsedState),
          }))
        }
        
        // Note: Bot move detection handled by bot-visualization.ts
      } catch (e) {
        clientLogger.error('Failed to parse game state:', e)
      }
    } else {
      clientLogger.warn('📡 game-update received but no state found:', payload)
    }
  }, [game?.id])

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

  // Socket connection hook - must be before useLobbyActions
  const { socket, isConnected, emitWhenConnected } = useSocketConnection({
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
    gameState: gameEngine?.getState(),
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

  const handleLeaveLobby = () => {
    if (socket) {
      socket.emit('leave-lobby', code)
      socket.disconnect()
    }
    router.push(`/games/${lobby?.gameType || 'yahtzee'}/lobbies`)
  }

  const handleAddBot = async () => {
    await addBotToLobby()
  }

  const canStartGame = lobby?.creatorId === session?.user?.id || 
    (isGuest && lobby?.creatorId === guestId)
  const isInGame = game?.players?.some((p: any) => 
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
              {/* Top Status Bar - Without Timer */}
              <div className="flex-shrink-0 mb-4 px-4">
                <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 text-white rounded-xl px-5 py-3 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">🎯</span>
                        <div>
                          <div className="text-xs opacity-75">Round</div>
                          <div className="text-lg font-bold leading-none">
                            {Math.floor(gameEngine.getRound() / (game?.players?.length || 1)) + 1}/13
                          </div>
                        </div>
                      </div>
                      <div className="h-8 w-px bg-white/30"></div>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">👤</span>
                        <div>
                          <div className="text-xs opacity-75">Turn</div>
                          <div className="text-lg font-bold leading-none truncate max-w-[150px]">
                            {gameEngine.getCurrentPlayer()?.name || 'Player'}
                          </div>
                        </div>
                      </div>
                      <div className="h-8 w-px bg-white/30"></div>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">🏆</span>
                        <div>
                          <div className="text-xs opacity-75">Your Score</div>
                          <div className="text-lg font-bold leading-none">
                            {gameEngine.getPlayers().find(p => p.id === getCurrentUserId())?.score || 0}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
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
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-all text-lg font-medium flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
                        title={soundEnabled ? 'Disable sound' : 'Enable sound'}
                      >
                        <span className="text-xl">{soundEnabled ? '🔊' : '🔇'}</span>
                        <span className="hidden sm:inline text-sm">Sound</span>
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Are you sure you want to leave the game?')) {
                            handleLeaveLobby()
                          }
                        }}
                        aria-label="Leave game"
                        className="px-4 py-2 bg-red-500/90 hover:bg-red-600 rounded-lg transition-all font-medium text-sm flex items-center gap-2 shadow-lg hover:shadow-xl focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
                      >
                        <span className="text-lg">🚪</span>
                        <span>Leave</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Main Game Area - More spacing between columns */}
              <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-6 px-4 pb-4 overflow-hidden">
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
                    const viewingPlayerId = selectedPlayerId || gameEngine.getCurrentPlayer()?.id
                    const scorecard = gameEngine.getScorecard(viewingPlayerId || '')
                    const isViewingOtherPlayer = selectedPlayerId && selectedPlayerId !== getCurrentUserId()
                    
                    if (!scorecard) return null
                    
                    return (
                      <div className="h-full flex flex-col">
                        {/* Header showing whose scorecard is being viewed */}
                        {isViewingOtherPlayer && (
                          <div className="flex-shrink-0 mb-2 px-4">
                            <div className="bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 rounded-xl px-4 py-2 border-2 border-purple-300 dark:border-purple-600 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-lg">👁️</span>
                                <span className="font-bold text-sm text-purple-900 dark:text-purple-200">
                                  Viewing: {(() => {
                                    const dbPlayer = game?.players?.find((p: any) => p.userId === selectedPlayerId)
                                    if (!dbPlayer) return 'Player'
                                    const name = (dbPlayer as any).user?.name || (dbPlayer as any).user?.username
                                    return name || 'Player'
                                  })()}
                                </span>
                              </div>
                              <button
                                onClick={() => setSelectedPlayerId(null)}
                                className="text-xs px-3 py-1 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors"
                              >
                                Back to My Cards
                              </button>
                            </div>
                          </div>
                        )}
                        <div className="flex-1 min-h-0">
                          <Scorecard
                            scorecard={scorecard}
                            currentDice={gameEngine.getDice()}
                            onSelectCategory={handleScore}
                            canSelectCategory={!isMoveInProgress && gameEngine.getRollsLeft() < 3 && !isViewingOtherPlayer}
                            isCurrentPlayer={isMyTurn() && !isViewingOtherPlayer}
                            isLoading={isScoring}
                          />
                        </div>
                      </div>
                    )
                  })()}
                </div>

                {/* Right: Players & History - 3 columns, Internal Scroll Only */}
                <div className="lg:col-span-3 h-full overflow-hidden flex flex-col gap-3">
                  {/* Players List - Fixed Height */}
                  <div className="flex-shrink-0 max-h-[40%] overflow-y-auto">
                    <PlayerList
                      players={game?.players?.map((p: any) => {
                        // Find the player's actual position in the game engine
                        const enginePlayer = gameEngine.getPlayers().find(ep => ep.id === p.userId)
                        const actualPosition = enginePlayer ? gameEngine.getPlayers().indexOf(enginePlayer) : 0
                        
                        return {
                          id: p.id,
                          userId: p.userId,
                          user: p.user,
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

                  {/* Roll History - Takes remaining space with internal scroll */}
                  {rollHistory.length > 0 && (
                    <div className="flex-1 min-h-0 overflow-hidden">
                      <RollHistory entries={rollHistory} />
                    </div>
                  )}
                </div>
              </div>

              {/* Chat - Minimized Button */}
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
    </div>
  )
}

export default function LobbyPage() {
  return (
    <Suspense fallback={<LoadingSpinner size="lg" />}>
      <LobbyPageContent />
    </Suspense>
  )
}
