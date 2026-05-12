'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useTranslation, type TranslationKeys } from '@/lib/i18n-helpers'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { clientLogger } from '@/lib/client-logger'
import { showToast } from '@/lib/i18n-toast'
import { useGameSocket } from '@/hooks/use-game-socket'
import { finalizePendingLobbyCreateMetric } from '@/lib/lobby-create-metrics'
import { trackMoveSubmitApplied } from '@/lib/analytics'
import LoadingSpinner from '@/components/LoadingSpinner'
import { ReactionOverlay } from '@/components/ReactionOverlay'
import { LiarsPartyGame, type LiarsPartyGameData, type LiarsPartyRoundResult } from '@/lib/games/liars-party-game'

interface LiarsPartyPageProps {
  code: string
  isSpectator?: boolean
}

interface Lobby {
  id: string
  code: string
  gameType: string
  creatorId: string | null
  name: string
  isActive?: boolean
  turnTimer?: number
}

interface GamePlayer {
  id: string
  userId: string
  name: string
  user?: { username?: string }
}

interface Game {
  id: string
  status: string
  state: unknown
  players: GamePlayer[]
}

// ─── Screen components ────────────────────────────────────────────────────────

interface WaitingScreenProps {
  players: GamePlayer[]
  data: LiarsPartyGameData | undefined
  rules: string[]
  isHost: boolean
  isStarting: boolean
  onStart: () => void
  onLeave: () => void
  t: (key: TranslationKeys, opts?: Record<string, unknown>) => string
}

function WaitingScreen({ players, data, rules, isHost, isStarting, onStart, onLeave, t }: WaitingScreenProps) {
  const maxRounds = data?.maxRounds ?? 10
  const eliminationThreshold = data?.eliminationThreshold ?? 2

  return (
    <div
      className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-6 p-4 bg-gradient-to-br from-rose-500 to-orange-500"
      data-testid="liars-party-waiting-room"
    >
      <h1 className="text-3xl font-bold text-white drop-shadow">🎭 {t('liarsParty.name')}</h1>

      <div className="bg-white/10 backdrop-blur rounded-xl p-4 w-full max-w-sm text-white text-center">
        <div className="text-lg font-semibold mb-1">{players.length} / 12</div>
        <div className="text-sm text-white/80">
          {t('liarsParty.roundsCount', { count: maxRounds })} · {t('liarsParty.eliminatedAfter', { count: eliminationThreshold })}
        </div>
      </div>

      <div className="bg-white/10 backdrop-blur rounded-xl p-4 w-full max-w-sm text-white">
        <div className="font-semibold mb-3">{t('liarsParty.rules')}</div>
        <ol className="space-y-1.5">
          {rules.map((rule, i) => (
            <li key={i} className="text-sm text-white/85 flex gap-2">
              <span className="font-bold shrink-0">{i + 1}.</span>
              <span>{rule}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="bg-white/10 backdrop-blur rounded-xl p-4 w-full max-w-sm text-white">
        <div className="font-semibold mb-2">{t('liarsParty.playersHeading', { count: players.length })}</div>
        <div className="space-y-1">
          {players.map(p => (
            <div key={p.id} className="text-sm text-white/90">{p.name}</div>
          ))}
        </div>
      </div>

      {isHost ? (
        <button
          onClick={onStart}
          disabled={isStarting || players.length < 4}
          className="px-8 py-3 bg-white text-rose-600 rounded-xl font-bold hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
        >
          {isStarting ? t('common.loading') : t('liarsParty.startGame')}
        </button>
      ) : (
        <p className="text-white/80 text-sm">{t('liarsParty.waitingForPlayers')}</p>
      )}
      {players.length < 4 && isHost && (
        <p className="text-white/70 text-xs">{t('liarsParty.needMorePlayers')}</p>
      )}
      <button onClick={onLeave} className="text-sm text-white/70 underline">
        {t('lobby.leave')}
      </button>
    </div>
  )
}

interface ClaimScreenProps {
  data: LiarsPartyGameData
  players: GamePlayer[]
  currentUserId: string
  isMoveSubmitting: boolean
  timerRemaining: number
  onSubmitClaim: (claim: string, isBluff: boolean) => void
  t: (key: TranslationKeys, opts?: Record<string, unknown>) => string
}

function ClaimScreen({ data, players, currentUserId, isMoveSubmitting, timerRemaining, onSubmitClaim, t }: ClaimScreenProps) {
  const [claimText, setClaimText] = useState('')
  const [isBluffSelected, setIsBluffSelected] = useState<boolean | null>(null)
  const isClaimant = data.currentClaimantId === currentUserId
  const claimantPlayer = players.find(p => p.userId === data.currentClaimantId || p.id === data.currentClaimantId)
  const claimantName = claimantPlayer?.name ?? data.currentClaimantId
  const charCount = claimText.length
  const canSubmit = charCount >= 5 && charCount <= 180 && isBluffSelected !== null && !isMoveSubmitting

  return (
    <div
      className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-6 p-4 bg-gradient-to-br from-rose-500 to-orange-500"
      data-testid="liars-party-claim-screen"
    >
      <div className="text-white/80 text-sm font-mono">
        {t('liarsParty.round', { current: data.currentRound, total: data.maxRounds })}
      </div>
      <div className="text-white text-2xl font-mono font-bold">{t('liarsParty.timeLeft', { seconds: timerRemaining })}</div>

      {isClaimant ? (
        <>
          <h2 className="text-2xl font-bold text-white">{t('liarsParty.yourTurnToClaim')}</h2>
          <div className="w-full max-w-md">
            <textarea
              className="w-full rounded-xl bg-white/20 border border-white/30 text-white placeholder-white/60 p-4 text-base resize-none focus:outline-none focus:ring-2 focus:ring-white/50"
              rows={4}
              placeholder={t('liarsParty.claimPlaceholder')}
              maxLength={180}
              value={claimText}
              onChange={e => setClaimText(e.target.value)}
            />
            <div className="text-right text-white/60 text-xs mt-1">
              {t('liarsParty.charsRemaining', { count: 180 - charCount })}
            </div>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => setIsBluffSelected(false)}
              className={`px-6 py-3 rounded-xl font-bold transition-all ${isBluffSelected === false ? 'bg-white text-green-600 scale-105 shadow-lg' : 'bg-white/20 text-white hover:bg-white/30'}`}
            >
              ✓ {t('liarsParty.truth')}
            </button>
            <button
              onClick={() => setIsBluffSelected(true)}
              className={`px-6 py-3 rounded-xl font-bold transition-all ${isBluffSelected === true ? 'bg-white text-rose-600 scale-105 shadow-lg' : 'bg-white/20 text-white hover:bg-white/30'}`}
            >
              🎭 {t('liarsParty.bluff')}
            </button>
          </div>
          <button
            onClick={() => isBluffSelected !== null && onSubmitClaim(claimText, isBluffSelected)}
            disabled={!canSubmit}
            className="px-8 py-3 bg-white text-rose-600 rounded-xl font-bold hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {t('liarsParty.submitClaim')}
          </button>
        </>
      ) : (
        <p className="text-white text-xl">{t('liarsParty.isClaimingFor', { name: claimantName })}</p>
      )}
    </div>
  )
}

interface EliminatedClaimScreenProps {
  data: LiarsPartyGameData
  players: GamePlayer[]
  currentUserId: string
  timerRemaining: number
  t: (key: TranslationKeys, opts?: Record<string, unknown>) => string
}

function EliminatedClaimScreen({ data, players, currentUserId, timerRemaining, t }: EliminatedClaimScreenProps) {
  const claimantPlayer = players.find(p => p.userId === data.currentClaimantId || p.id === data.currentClaimantId)
  const claimantName = claimantPlayer?.name ?? data.currentClaimantId
  const eliminatedRound = data.eliminatedAtRound[currentUserId]

  return (
    <div
      className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-6 p-4 bg-gradient-to-br from-rose-500 to-orange-500"
      data-testid="liars-party-eliminated-claim-screen"
    >
      <div
        className="w-full max-w-md bg-red-900/60 border border-red-400/50 rounded-xl p-4 text-white text-center"
        data-testid="eliminated-banner"
      >
        {t('liarsParty.eliminatedAt', { round: eliminatedRound ?? '?' })}
      </div>
      <div className="text-white/80 text-sm font-mono">
        {t('liarsParty.round', { current: data.currentRound, total: data.maxRounds })}
      </div>
      <div className="text-white text-2xl font-mono font-bold">{t('liarsParty.timeLeft', { seconds: timerRemaining })}</div>
      <p className="text-white text-xl">{t('liarsParty.isClaimingFor', { name: claimantName })}</p>
    </div>
  )
}

interface ChallengeScreenProps {
  data: LiarsPartyGameData
  players: GamePlayer[]
  currentUserId: string
  isMoveSubmitting: boolean
  timerRemaining: number
  onVote: (decision: 'challenge' | 'believe') => void
  t: (key: TranslationKeys, opts?: Record<string, unknown>) => string
}

function ChallengeScreen({ data, players, currentUserId, isMoveSubmitting, timerRemaining, onVote, t }: ChallengeScreenProps) {
  const isClaimant = data.currentClaimantId === currentUserId
  const myVote = data.challengeVotes.find(v => v.playerId === currentUserId)
  const totalVoters = data.activePlayerIds.filter(id => id !== data.currentClaimantId).length
  const votedCount = data.challengeVotes.length

  return (
    <div
      className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-6 p-4 bg-gradient-to-br from-rose-500 to-orange-500"
      data-testid="liars-party-challenge-screen"
    >
      <div className="text-white/80 text-sm font-mono">
        {t('liarsParty.round', { current: data.currentRound, total: data.maxRounds })}
      </div>
      <div className="text-white text-2xl font-mono font-bold">{t('liarsParty.timeLeft', { seconds: timerRemaining })}</div>

      <div className="w-full max-w-md bg-white/10 backdrop-blur rounded-xl p-6 text-white">
        <div className="text-lg font-semibold mb-2">{t('liarsParty.challengeOrBelieve')}</div>
        <div className="text-xl text-white/90 italic mb-4">&ldquo;{data.claim?.text}&rdquo;</div>
        <div className="text-sm text-white/70">{t('liarsParty.voted', { done: votedCount, total: totalVoters })}</div>
      </div>

      {!isClaimant && !myVote && (
        <div className="flex gap-4">
          <button
            onClick={() => onVote('challenge')}
            disabled={isMoveSubmitting}
            className="px-8 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold disabled:opacity-50 shadow-lg transition-all hover:scale-105"
          >
            {t('liarsParty.challenge')}
          </button>
          <button
            onClick={() => onVote('believe')}
            disabled={isMoveSubmitting}
            className="px-8 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold disabled:opacity-50 shadow-lg transition-all hover:scale-105"
          >
            {t('liarsParty.believe')}
          </button>
        </div>
      )}

      {!isClaimant && myVote && (
        <div className="text-white text-center">
          <div>{t('liarsParty.youVoted', { decision: myVote.decision })}</div>
          <div className="text-sm text-white/70 mt-1">{t('liarsParty.waitingForVotes')}</div>
        </div>
      )}

      {isClaimant && (
        <p className="text-white/80 text-sm">{t('liarsParty.waitingForVotes')}</p>
      )}
    </div>
  )
}

interface EliminatedChallengeScreenProps {
  data: LiarsPartyGameData
  currentUserId: string
  timerRemaining: number
  t: (key: TranslationKeys, opts?: Record<string, unknown>) => string
}

function EliminatedChallengeScreen({ data, currentUserId, timerRemaining, t }: EliminatedChallengeScreenProps) {
  const totalVoters = data.activePlayerIds.filter(id => id !== data.currentClaimantId).length
  const votedCount = data.challengeVotes.length
  const eliminatedRound = data.eliminatedAtRound[currentUserId]

  return (
    <div
      className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-6 p-4 bg-gradient-to-br from-rose-500 to-orange-500"
      data-testid="liars-party-eliminated-challenge-screen"
    >
      <div
        className="w-full max-w-md bg-red-900/60 border border-red-400/50 rounded-xl p-4 text-white text-center"
        data-testid="eliminated-banner"
      >
        {t('liarsParty.eliminatedAt', { round: eliminatedRound ?? '?' })}
      </div>
      <div className="text-white/80 text-sm font-mono">
        {t('liarsParty.round', { current: data.currentRound, total: data.maxRounds })}
      </div>
      <div className="text-white text-2xl font-mono font-bold">{t('liarsParty.timeLeft', { seconds: timerRemaining })}</div>
      <div className="w-full max-w-md bg-white/10 backdrop-blur rounded-xl p-6 text-white">
        <div className="text-xl text-white/90 italic mb-4">&ldquo;{data.claim?.text}&rdquo;</div>
        <div className="text-sm text-white/70">{t('liarsParty.voted', { done: votedCount, total: totalVoters })}</div>
      </div>
    </div>
  )
}

interface RevealScreenProps {
  data: LiarsPartyGameData
  players: GamePlayer[]
  isHost: boolean
  isMoveSubmitting: boolean
  onAdvanceRound: () => void
  t: (key: TranslationKeys, opts?: Record<string, unknown>) => string
}

function RevealScreen({ data, players, isHost, isMoveSubmitting, onAdvanceRound, t }: RevealScreenProps) {
  const lastResult: LiarsPartyRoundResult | undefined = data.roundResults[data.roundResults.length - 1]
  const isLastRound = data.currentRound >= data.maxRounds
  const eliminatedThisRound = lastResult
    ? players.filter(p => {
        const pid = p.userId || p.id
        return data.eliminatedPlayerIds.includes(pid) && data.eliminatedAtRound[pid] === lastResult.round
      })
    : []

  return (
    <div
      className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-6 p-4 bg-gradient-to-br from-rose-500 to-orange-500 overflow-y-auto"
      data-testid="liars-party-reveal-screen"
    >
      <div className="text-white/80 text-sm font-mono">
        {t('liarsParty.round', { current: data.currentRound, total: data.maxRounds })}
      </div>

      {data.claim && (
        <div className="w-full max-w-md bg-white/10 backdrop-blur rounded-xl p-5 text-white">
          <div className="text-xl italic mb-3">&ldquo;{data.claim.text}&rdquo;</div>
          <div className={`text-3xl font-extrabold ${data.claim.isBluff ? 'text-red-200' : 'text-green-200'}`}>
            {data.claim.isBluff ? t('liarsParty.wasBluff') : t('liarsParty.wasTruth')}
          </div>
        </div>
      )}

      {lastResult && (
        <>
          <div className="w-full max-w-md bg-white/10 backdrop-blur rounded-xl p-5 text-white">
            <div className="font-semibold mb-3">{t('liarsParty.voteBreakdown')}</div>
            <div className="space-y-2">
              {data.challengeVotes.map(vote => {
                const voter = players.find(p => p.userId === vote.playerId || p.id === vote.playerId)
                const voterName = voter?.name ?? vote.playerId
                const correct = vote.decision === 'challenge' ? lastResult.bluffCaught : !lastResult.bluffCaught
                const delta = lastResult.voterScoreDeltas[vote.playerId] ?? 0
                return (
                  <div key={vote.playerId} className="flex items-center justify-between text-sm">
                    <span>{voterName}</span>
                    <span>{vote.decision === 'challenge' ? t('liarsParty.challenge') : t('liarsParty.believe')}</span>
                    <span>{correct ? '✓' : '✗'}</span>
                    <span className={delta >= 0 ? 'text-green-300' : 'text-red-300'}>{delta >= 0 ? `+${delta}` : delta}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="w-full max-w-md bg-white/10 backdrop-blur rounded-xl p-5 text-white">
            <div className="font-semibold mb-3">{t('liarsParty.totalScores')}</div>
            <div className="space-y-1">
              {data.activePlayerIds.map(pid => {
                const player = players.find(p => p.userId === pid || p.id === pid)
                const name = player?.name ?? pid
                const score = data.scores[pid] ?? 0
                const strikes = data.strikes[pid] ?? 0
                return (
                  <div key={pid} className="flex justify-between text-sm">
                    <span>{name}</span>
                    <span>{score} pts · {t('liarsParty.strikes', { count: strikes, max: data.eliminationThreshold })}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {eliminatedThisRound.length > 0 && (
        <div className="w-full max-w-md bg-red-900/60 border border-red-400/50 rounded-xl p-4 text-white text-center">
          <div className="font-semibold mb-1">{t('liarsParty.eliminatedThisRound')}</div>
          {eliminatedThisRound.map(p => <div key={p.id} className="text-sm">{p.name}</div>)}
        </div>
      )}

      {isHost ? (
        <button
          onClick={onAdvanceRound}
          disabled={isMoveSubmitting}
          className="px-8 py-3 bg-white text-rose-600 rounded-xl font-bold hover:bg-rose-50 disabled:opacity-50 shadow-lg"
        >
          {isLastRound ? t('liarsParty.seeResults') : t('liarsParty.nextRound')}
        </button>
      ) : (
        <p className="text-white/80 text-sm">{t('liarsParty.waitingForHost')}</p>
      )}
    </div>
  )
}

interface GameOverScreenProps {
  data: LiarsPartyGameData
  players: GamePlayer[]
  isHost: boolean
  isStarting: boolean
  onPlayAgain: () => void
  onBackToGames: () => void
  t: (key: TranslationKeys, opts?: Record<string, unknown>) => string
}

function GameOverScreen({ data, players, isHost, isStarting, onPlayAgain, onBackToGames, t }: GameOverScreenProps) {
  const winner = players.find(p => p.userId === data.winnerId || p.id === data.winnerId)
  const winnerName = winner?.name ?? data.winnerId ?? '?'

  return (
    <div
      className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-6 p-4 bg-gradient-to-br from-rose-500 to-orange-500"
      data-testid="liars-party-game-over-screen"
    >
      <div className="text-5xl">🎭</div>
      <h2 className="text-4xl font-extrabold text-white drop-shadow">
        {t('liarsParty.wins', { name: winnerName })}
      </h2>
      <div className="text-white/80 text-sm">
        {data.completionReason === 'last-player-standing'
          ? t('liarsParty.lastPlayerStanding')
          : t('liarsParty.maxRoundsReached')}
      </div>

      <div className="w-full max-w-sm bg-white/10 backdrop-blur rounded-xl p-5 text-white">
        <div className="space-y-2">
          {data.ranking.map((pid, idx) => {
            const player = players.find(p => p.userId === pid || p.id === pid)
            const name = player?.name ?? pid
            const score = data.scores[pid] ?? 0
            const strikes = data.strikes[pid] ?? 0
            return (
              <div key={pid} className="flex items-center justify-between text-sm">
                <span className="font-bold text-white/60">{t('liarsParty.rank', { position: idx + 1 })}</span>
                <span className="flex-1 ml-3">{name}</span>
                <span>{score} pts</span>
                <span className="text-white/60 ml-2">{t('liarsParty.strikes', { count: strikes, max: data.eliminationThreshold })}</span>
              </div>
            )
          })}
        </div>
      </div>

      {isHost && (
        <button
          onClick={onPlayAgain}
          disabled={isStarting}
          className="px-8 py-3 bg-white text-rose-600 rounded-xl font-bold hover:bg-rose-50 disabled:opacity-50 shadow-lg"
        >
          {isStarting ? t('common.loading') : t('liarsParty.playAgain')}
        </button>
      )}
      <button onClick={onBackToGames} className="text-sm text-white/70 underline">
        {t('lobby.leave')}
      </button>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LiarsPartyPage({ code, isSpectator = false }: LiarsPartyPageProps) {
  const router = useRouter()
  const { data: session, status } = useSession()
  const { isGuest, guestToken, guestId } = useGuest()
  const { t } = useTranslation()

  const [loading, setLoading] = useState(true)
  const [lobby, setLobby] = useState<Lobby | null>(null)
  const [game, setGame] = useState<Game | null>(null)
  const [gameEngine, setGameEngine] = useState<LiarsPartyGame | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [isMoveSubmitting, setIsMoveSubmitting] = useState(false)

  // Timer tick — forces re-render every second for countdown displays
  const [, setTimerTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTimerTick(t => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const lifecycleRedirectInFlightRef = React.useRef(false)
  const activeGameIdRef = React.useRef<string | null>(null)
  const minPlayersRequired = 4

  const getCurrentUserId = useCallback(() => {
    return isGuest ? guestId : session?.user?.id
  }, [isGuest, guestId, session?.user?.id])

  const triggerLifecycleRedirect = useCallback((toastId: string) => {
    if (lifecycleRedirectInFlightRef.current) return
    lifecycleRedirectInFlightRef.current = true
    showToast.error('lobby.gameAbandoned', undefined, undefined, { id: toastId })
    router.replace('/games')
  }, [router])

  const applyAuthoritativeState = useCallback((gameId: string, authoritativeState: unknown) => {
    if (!authoritativeState || typeof authoritativeState !== 'object') return
    const fresh = new LiarsPartyGame(gameId)
    fresh.restoreState(authoritativeState as Parameters<LiarsPartyGame['restoreState']>[0])
    setGameEngine(fresh)
    setGame(prev => {
      if (!prev || prev.id !== gameId) return prev
      return { ...prev, status: fresh.getState().status, state: authoritativeState }
    })
  }, [])

  const loadLobby = useCallback(async () => {
    try {
      const res = await fetchWithGuest(`/api/lobby/${code}?includeFinished=true`)
      const data = await res.json()

      if (!res.ok) {
        clientLogger.error('LiarsPartyPage: failed to load lobby', data.error)
        showToast.error('errors.failedToLoad')
        router.push('/games')
        return
      }

      const { lobby: lobbyData, activeGame } = data as { lobby: Lobby; activeGame: Game | null }

      if (!lobbyData) {
        router.push('/games')
        return
      }

      setLobby(lobbyData)
      setGame(activeGame ?? null)
      if (typeof lobbyData.code === 'string') {
        finalizePendingLobbyCreateMetric({ lobbyCode: lobbyData.code, fallbackGameType: lobbyData.gameType })
      }

      if (activeGame?.state) {
        const parsedState = typeof activeGame.state === 'string'
          ? JSON.parse(activeGame.state || '{}')
          : activeGame.state
        if (parsedState && typeof parsedState === 'object') {
          const fresh = new LiarsPartyGame(activeGame.id)
          fresh.restoreState(parsedState as Parameters<LiarsPartyGame['restoreState']>[0])
          setGameEngine(fresh)
        }
      }

      setLoading(false)
    } catch (err) {
      clientLogger.error('LiarsPartyPage: loadLobby error', err)
      showToast.errorFrom(err, 'errors.failedToLoad')
      setLoading(false)
    }
  }, [code, router])

  useEffect(() => {
    activeGameIdRef.current = game?.id ?? null
  }, [game?.id])

  useEffect(() => {
    if (status === 'loading' || (status === 'unauthenticated' && !isGuest)) return
    if (isGuest && !guestToken) return
    void loadLobby()
  }, [status, isGuest, guestToken, loadLobby])

  const handleGameUpdate = useCallback((payload: Record<string, unknown>) => {
    const activeGameId = activeGameIdRef.current
    if (payload?.action === 'state-change' && activeGameId) {
      const state = (payload?.payload as Record<string, unknown>)?.state
      if (state) { applyAuthoritativeState(activeGameId, state); return }
    }
    void loadLobby()
  }, [applyAuthoritativeState, loadLobby])

  const handleGameAbandoned = useCallback(() => {
    clientLogger.log('📡 LiarsParty game abandoned')
    void loadLobby()
    triggerLifecycleRedirect('liars-party-lifecycle-redirect')
  }, [loadLobby, triggerLifecycleRedirect])

  const handlePlayerLeft = useCallback((payload: { userId: string; username?: string; remainingPlayers?: number }) => {
    clientLogger.log('📡 LiarsParty player left', payload)
    if (payload.username) showToast.info('toast.playerLeft', undefined, { player: payload.username })
    if (typeof payload.remainingPlayers === 'number' && payload.remainingPlayers < minPlayersRequired) {
      triggerLifecycleRedirect('liars-party-lifecycle-redirect')
      return
    }
    void loadLobby()
  }, [loadLobby, triggerLifecycleRedirect, minPlayersRequired])

  const socket = useGameSocket({
    code,
    status,
    isGuest,
    guestToken,
    gameName: 'LiarsParty',
    onGameUpdate: handleGameUpdate,
    onGameAbandoned: handleGameAbandoned,
    onPlayerLeft: handlePlayerLeft,
    onLobbyUpdate: loadLobby,
    onPlayerJoined: loadLobby,
  })

  const handleMove = useCallback(async (type: string, payload: Record<string, unknown>) => {
    if (!game || isMoveSubmitting) return
    const userId = getCurrentUserId()
    if (!userId) return

    const move = { type, playerId: userId, data: payload, timestamp: new Date() }

    setIsMoveSubmitting(true)
    try {
      const res = await fetchWithGuest(`/api/game/${game.id}/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: game.id, move, userId }),
      })

      trackMoveSubmitApplied({
        gameType: 'liars_party',
        moveType: type,
        durationMs: 0,
        isGuest,
        success: res.ok,
        applied: res.ok,
        statusCode: res.status,
        source: 'liars_party_page',
      })

      if (res.ok) {
        const result = await res.json()
        const authoritativeState = result?.game?.state
        if (authoritativeState) {
          applyAuthoritativeState(game.id, authoritativeState)
        }
      } else {
        clientLogger.error('LiarsParty move failed', { type })
        await loadLobby()
      }
    } catch (err) {
      clientLogger.error('LiarsPartyPage handleMove error', err)
      await loadLobby()
    } finally {
      setIsMoveSubmitting(false)
    }
  }, [game, getCurrentUserId, isGuest, isMoveSubmitting, applyAuthoritativeState, loadLobby])

  const handleStartGame = useCallback(async () => {
    if (!lobby?.id || isStarting) return
    setIsStarting(true)
    try {
      const res = await fetchWithGuest('/api/game/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameType: 'liars_party',
          lobbyId: lobby.id,
          config: { maxPlayers: 12, minPlayers: 4 },
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showToast.error('toast.gameStartFailed', (err as Record<string, unknown>)?.error as string | undefined)
      }
    } catch (err) {
      showToast.errorFrom(err, 'toast.gameStartFailed')
    } finally {
      setIsStarting(false)
    }
  }, [lobby?.id, isStarting])

  if (loading) {
    return (
      <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  const resolvedStatus = game?.status ?? 'waiting'
  const engineState = gameEngine?.getState()
  const data = engineState?.data as LiarsPartyGameData | undefined
  const currentUserId = getCurrentUserId() ?? ''
  const isHost = lobby?.creatorId === currentUserId
  const players = game?.players ?? []
  const isEliminated = data?.eliminatedPlayerIds.includes(currentUserId) ?? false

  const turnTimerSeconds = typeof lobby?.turnTimer === 'number' ? lobby.turnTimer : 60
  const lastMoveAt = engineState?.lastMoveAt ?? null
  const timerRemaining = lastMoveAt
    ? Math.max(0, turnTimerSeconds - Math.floor((Date.now() - lastMoveAt) / 1000))
    : turnTimerSeconds

  const rules = gameEngine
    ? (gameEngine as LiarsPartyGame).getGameRules()
    : [
        t('liarsParty.rule1'),
        t('liarsParty.rule2'),
        t('liarsParty.rule3'),
        t('liarsParty.rule4'),
        t('liarsParty.rule5'),
      ]

  if (resolvedStatus === 'waiting') {
    return (
      <WaitingScreen
        players={players}
        data={data}
        rules={rules}
        isHost={!isSpectator && isHost}
        isStarting={isStarting}
        onStart={handleStartGame}
        onLeave={() => router.push('/games')}
        t={t}
      />
    )
  }

  if (resolvedStatus === 'playing' && data) {
    if (data.phase === 'claim') {
      if (isEliminated) {
        return (
          <EliminatedClaimScreen
            data={data}
            players={players}
            currentUserId={currentUserId}
            timerRemaining={timerRemaining}
            t={t}
          />
        )
      }
      return (
        <>
          {!isSpectator && socket && <ReactionOverlay socket={socket} lobbyCode={code} />}
          <ClaimScreen
            data={data}
            players={players}
            currentUserId={currentUserId}
            isMoveSubmitting={isMoveSubmitting}
            timerRemaining={timerRemaining}
            onSubmitClaim={(claim, isBluff) => handleMove('submit-claim', { claim, isBluff })}
            t={t}
          />
        </>
      )
    }

    if (data.phase === 'challenge') {
      if (isEliminated) {
        return (
          <EliminatedChallengeScreen
            data={data}
            currentUserId={currentUserId}
            timerRemaining={timerRemaining}
            t={t}
          />
        )
      }
      return (
        <>
          {!isSpectator && socket && <ReactionOverlay socket={socket} lobbyCode={code} />}
          <ChallengeScreen
            data={data}
            players={players}
            currentUserId={currentUserId}
            isMoveSubmitting={isSpectator || isMoveSubmitting}
            timerRemaining={timerRemaining}
            onVote={(decision) => handleMove('submit-challenge', { decision })}
            t={t}
          />
        </>
      )
    }

    if (data.phase === 'reveal') {
      return (
        <>
          {!isSpectator && socket && <ReactionOverlay socket={socket} lobbyCode={code} />}
          <RevealScreen
            data={data}
            players={players}
            isHost={!isSpectator && isHost}
            isMoveSubmitting={isMoveSubmitting}
            onAdvanceRound={() => handleMove('advance-round', {})}
            t={t}
          />
        </>
      )
    }
  }

  if (resolvedStatus === 'finished' && data) {
    return (
      <GameOverScreen
        data={data}
        players={players}
        isHost={!isSpectator && isHost}
        isStarting={isStarting}
        onPlayAgain={handleStartGame}
        onBackToGames={() => router.push('/games')}
        t={t}
      />
    )
  }

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center">
      <LoadingSpinner />
    </div>
  )
}
