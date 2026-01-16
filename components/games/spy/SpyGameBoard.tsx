'use client'

import { SpyGame, SpyGamePhase } from '@/lib/games/spy-game'
import { Game } from '@/types/game'
import SpyRoleReveal from '@/components/SpyRoleReveal'
import SpyVoting from '@/components/SpyVoting'
import SpyResults from '@/components/SpyResults'
import SpyQuestioning from '@/components/SpyQuestioning'

interface SpyGameBoardProps {
  gameEngine: SpyGame | null
  game: Game | null
  isMyTurn: boolean
  timeLeft: number
  getCurrentUserId: () => string | undefined
  onPlayerReady?: () => void
  onAskQuestion?: (targetId: string, question: string) => void
  onAnswerQuestion?: (answer: string) => void
  onSkipTurn?: () => void
  onVote?: (targetId: string) => void
  onNextRound?: () => void
}

export default function SpyGameBoard({
  gameEngine,
  game,
  isMyTurn,
  timeLeft,
  getCurrentUserId,
  onPlayerReady,
  onAskQuestion,
  onAnswerQuestion,
  onSkipTurn,
  onVote,
  onNextRound,
}: SpyGameBoardProps) {
  const currentUserId = getCurrentUserId()
  if (!currentUserId || !gameEngine) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-800 rounded-xl p-4">
        <div className="text-center">
          <div className="text-blue-500 text-4xl mb-2">🕵️</div>
          <p className="text-gray-400 text-sm">Loading game...</p>
        </div>
      </div>
    )
  }

  const gameData = gameEngine.getState().data as any
  const phase = gameData?.phase || SpyGamePhase.WAITING
  const players = gameEngine.getPlayers()

  // Get current player's role
  const playerRole = gameData?.playerRoles?.[currentUserId] || ''
  const isSpy = playerRole === 'Spy'
  const location = gameData?.location || ''
  const locationRole = gameData?.playerRoles?.[currentUserId] || ''
  const possibleCategories = gameData?.locationCategory ? [gameData.locationCategory] : []

  // Get phase info for timers
  let phaseInfo: { phase: SpyGamePhase; timeRemaining: number; currentQuestionerId: string | null; currentTargetId: string | null } | null = null
  try {
    if (typeof (gameEngine as any).getPhaseInfo === 'function') {
      phaseInfo = (gameEngine as any).getPhaseInfo()
    }
  } catch (e) {
    // Fallback if method doesn't exist
    phaseInfo = null
  }

  // Handle role reveal phase
  if (phase === SpyGamePhase.ROLE_REVEAL) {
    const playersReadyArray = Array.isArray(gameData?.playersReady) ? gameData.playersReady : []
    const playersReady = playersReadyArray.length
    const totalPlayers = players.length
    const isReady = playersReadyArray.includes(currentUserId)

    return (
      <SpyRoleReveal
        role={playerRole}
        location={isSpy ? undefined : location}
        locationRole={isSpy ? undefined : locationRole}
        possibleCategories={isSpy ? possibleCategories : undefined}
        onReady={onPlayerReady || (() => {})}
        playersReady={playersReady}
        totalPlayers={totalPlayers}
        isReady={isReady}
      />
    )
  }

  // Handle questioning phase
  if (phase === SpyGamePhase.QUESTIONING) {
    const timeRemaining = phaseInfo?.timeRemaining || gameData?.questionTimeLimit || 300
    return (
      <SpyQuestioning
        players={players}
        currentUserId={currentUserId}
        currentQuestionerId={gameData?.currentQuestionerId || null}
        currentTargetId={gameData?.currentTargetId || null}
        pendingQuestion={gameData?.pendingQuestion || null}
        questionHistory={gameData?.questionHistory || []}
        timeRemaining={Math.floor(timeRemaining)}
        isMyTurn={isMyTurn}
        onAskQuestion={onAskQuestion || (() => {})}
        onAnswerQuestion={onAnswerQuestion || (() => {})}
        onSkipTurn={onSkipTurn || (() => {})}
      />
    )
  }

  // Handle voting phase
  if (phase === SpyGamePhase.VOTING) {
    const votes = gameData?.votes || {}
    const hasVoted = !!votes[currentUserId]
    const votesSubmitted = Object.keys(votes).length
    const timeRemaining = phaseInfo?.timeRemaining || gameData?.votingTimeLimit || 60

    return (
      <SpyVoting
        players={players}
        currentUserId={currentUserId}
        onVote={onVote || (() => {})}
        hasVoted={hasVoted}
        votesSubmitted={votesSubmitted}
        timeRemaining={timeRemaining}
      />
    )
  }

  // Handle results phase
  if (phase === SpyGamePhase.RESULTS) {
    const votes = gameData?.votes || {}
    const eliminatedId = gameData?.eliminatedId || null
    const spyId = gameData?.spyPlayerId || ''
    const scores = gameData?.scores || {}
    const currentRound = gameData?.currentRound || 1
    const totalRounds = gameData?.totalRounds || 3

    return (
      <SpyResults
        players={players}
        votes={votes}
        eliminatedId={eliminatedId}
        spyId={spyId}
        location={location}
        scores={scores}
        currentRound={currentRound}
        totalRounds={totalRounds}
        onNextRound={onNextRound || (() => {})}
      />
    )
  }

  // Default: waiting phase
  return (
    <div className="h-full flex items-center justify-center bg-gray-800 rounded-xl p-4">
      <div className="text-center">
        <div className="text-blue-500 text-4xl mb-2">🕵️</div>
        <p className="text-gray-400 text-sm">Waiting for game to start</p>
        {timeLeft > 0 && (
          <p className="text-gray-500 text-xs mt-1">Time: {timeLeft}s</p>
        )}
      </div>
    </div>
  )
}
