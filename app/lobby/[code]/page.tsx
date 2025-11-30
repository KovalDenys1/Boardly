'use client'

import React, { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import toast from 'react-hot-toast'
import PlayerList from '@/components/PlayerList'
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
  const [previousGameState, setPreviousGameState] = useState<Record<string, unknown> | null>(null)

  // Roll history and celebrations
  const [rollHistory, setRollHistory] = useState<RollHistoryEntry[]>([])
  const [celebrationEvent, setCelebrationEvent] = useState<CelebrationEvent | null>(null)

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
        
        setPreviousGameState(parsedState)
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

  const onPlayerTyping = useCallback((data: PlayerTypingPayload) => {
    const currentUserId = isGuest ? guestId : session?.user?.id
    if (data.userId !== currentUserId) {
      setSomeoneTyping(true)
      setTimeout(() => setSomeoneTyping(false), 3000)
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
      const diceDisplay = finalDice.join(', ')
      
      toast.error(
        `⏰ Time's up! Auto-scored ${displayName} [${diceDisplay}] = ${score} pts`,
        { duration: 5000 }
      )
      
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
    if (showingBotOverlay && botMoveSteps.length > 0) {
      if (currentBotStepIndex < botMoveSteps.length - 1) {
        const timer = setTimeout(() => {
          setCurrentBotStepIndex(prev => prev + 1)
        }, 2000)
        return () => clearTimeout(timer)
      } else {
        const timer = setTimeout(() => {
          setShowingBotOverlay(false)
          setBotMoveSteps([])
          setCurrentBotStepIndex(0)
        }, 2500)
        return () => clearTimeout(timer)
      }
    }
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
        // Game Started - Grid Layout
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Main Game Area - 3 columns */}
          <div className="lg:col-span-3 space-y-4">
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
            ) : null}
          </div>

          {/* Sidebar - 1 column */}
          <div className="lg:col-span-1 space-y-4">
            {/* Roll History */}
            {isGameStarted && rollHistory.length > 0 && (
              <RollHistory
                entries={rollHistory}
              />
            )}

            {/* Chat */}
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
