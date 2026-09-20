'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useTranslation, type TranslationKeys } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { clientLogger } from '@/lib/client-logger'
import { showToast } from '@/lib/i18n-toast'
import { useRealtimeConnection } from '@/app/lobby/[code]/hooks/useRealtimeConnection'
import { useLeaveLobby } from '@/app/lobby/[code]/hooks/useLeaveLobby'
import { useLobbyHeartbeat } from '@/app/lobby/[code]/hooks/useLobbyHeartbeat'
import type { GameUpdatePayload } from '@/types/game'
import { finalizePendingLobbyCreateMetric } from '@/lib/lobby-create-metrics'
import { trackMoveSubmitApplied } from '@/lib/analytics'
import LoadingSpinner from '@/components/LoadingSpinner'
import ConfirmModal from '@/components/ConfirmModal'
import LeaveIcon from '@/components/LeaveIcon'
import AfterGameActions from '@/components/game-chrome/AfterGameActions'
import GameRoomCard from '@/components/game-chrome/GameRoomCard'
import GameStatusBanner from '@/components/game-chrome/GameStatusBanner'
import { getThemePageStyle } from '@/lib/lobby-themes'
import { ReactionOverlay } from '@/components/ReactionOverlay'
import { LiarsPartyGame, type LiarsPartyGameData, type LiarsPartyRoundResult } from '@/lib/games/liars-party-game'
import { createStuckTurnRecovery, turnSignatureOf } from '@/lib/stuck-turn-recovery'

interface LiarsPartyPageProps {
  code: string
  isSpectator?: boolean
  onGameReset?: () => void
}

interface Lobby {
  id: string
  code: string
  gameType: string
  creatorId: string | null
  name: string
  isActive?: boolean
  turnTimer?: number
  theme?: string
  allowSpectators?: boolean
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

// ─── The shell every phase renders into ───────────────────────────────────────

/** The catalog accent for liars_party (lib/game-catalog.ts). */
const LIARS_PARTY_ACCENT = 'var(--bd-lav)'

interface ShellProps {
  /** Per-phase test id, kept on the shell root so it is still one query away. */
  testId: string
  code: string
  /** Already-translated game name. */
  title: string
  /** Already-translated Leave / Back to lobby label. */
  leaveLabel: string
  theme: string | undefined
  isSpectator: boolean
  allowSpectators: boolean
  onLeave: () => void
  /** GameStatusBanner, or nothing on a screen with no clock to show. */
  status?: React.ReactNode
  children: React.ReactNode
}

/**
 * #1040: the seven screens each painted their own rose/orange gradient and
 * white text, so the lobby theme the host paid for and picked stopped at the
 * door of the game. They now share this shell: `.game-screen` for the height,
 * `getThemePageStyle` for the palette, the shared room card for the title, the
 * room code and the way out, and one scrolling content region underneath.
 * Each phase supplies only its own content, unchanged.
 */
function LiarsPartyShell({ testId, code, title, leaveLabel, theme, isSpectator, allowSpectators, onLeave, status, children }: ShellProps) {
  return (
    <div className="game-screen liars-screen" style={getThemePageStyle(theme)} data-testid={testId}>
      <div className="liars-shell">
        <GameRoomCard
          gameId="liars-party"
          title={title}
          code={code}
          isSpectator={isSpectator}
          leaveLabel={leaveLabel}
          allowSpectators={allowSpectators}
          onLeave={onLeave}
        />
        {status}
        <div className="liars-content">{children}</div>
      </div>
    </div>
  )
}

/** A themed card. One class so the seven screens cannot drift apart again. */
function LiarsCard({ children, className = '', role, testId }: { children: React.ReactNode; className?: string; role?: string; testId?: string }) {
  return (
    <div className={`bd-card liars-card ${className}`.trim()} role={role} data-testid={testId}>
      {children}
    </div>
  )
}

// ─── Screen components ────────────────────────────────────────────────────────

interface WaitingScreenProps {
  players: GamePlayer[]
  data: LiarsPartyGameData | undefined
  rules: string[]
  isHost: boolean
  isStarting: boolean
  onStart: () => void
  t: (key: TranslationKeys, opts?: Record<string, unknown>) => string
}

function WaitingScreen({ players, data, rules, isHost, isStarting, onStart, t }: WaitingScreenProps) {
  const maxRounds = data?.maxRounds ?? 10
  const eliminationThreshold = data?.eliminationThreshold ?? 2

  return (
    <div className="liars-columns">
      <LiarsCard>
        <div className="liars-card__title">{t('liarsParty.rules')}</div>
        <ol className="space-y-1.5">
          {rules.map((rule, i) => (
            <li key={i} className="flex gap-2 text-sm text-bd-ink-soft">
              <span className="shrink-0 font-bold" style={{ color: LIARS_PARTY_ACCENT }}>{i + 1}.</span>
              <span>{rule}</span>
            </li>
          ))}
        </ol>
      </LiarsCard>

      <LiarsCard>
        <div className="liars-card__title">{t('liarsParty.playersHeading', { count: players.length })}</div>
        <div className="mb-3 text-sm text-bd-ink-muted">
          {players.length} / 12 · {t('liarsParty.roundsCount', { count: maxRounds })} · {t('liarsParty.eliminatedAfter', { count: eliminationThreshold })}
        </div>
        <div className="space-y-1">
          {players.map(p => (
            <div key={p.id} className="text-sm text-bd-ink">{p.name}</div>
          ))}
        </div>
        <div className="liars-card__actions">
          {isHost ? (
            <button
              onClick={onStart}
              disabled={isStarting || players.length < 4}
              className="bd-btn bd-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isStarting ? t('common.loading') : t('liarsParty.startGame')}
            </button>
          ) : (
            <p className="text-sm text-bd-ink-soft">{t('liarsParty.waitingForPlayers')}</p>
          )}
          {players.length < 4 && isHost && (
            <p className="text-xs text-bd-ink-muted">{t('liarsParty.needMorePlayers')}</p>
          )}
        </div>
      </LiarsCard>
    </div>
  )
}

interface ClaimScreenProps {
  data: LiarsPartyGameData
  currentUserId: string
  isMoveSubmitting: boolean
  onSubmitClaim: (claim: string, isBluff: boolean) => void
  t: (key: TranslationKeys, opts?: Record<string, unknown>) => string
}

function ClaimScreen({ data, currentUserId, isMoveSubmitting, onSubmitClaim, t }: ClaimScreenProps) {
  const [claimText, setClaimText] = useState('')
  const [isBluffSelected, setIsBluffSelected] = useState<boolean | null>(null)
  const isClaimant = data.currentClaimantId === currentUserId
  const charCount = claimText.length
  const canSubmit = charCount >= 5 && charCount <= 180 && isBluffSelected !== null && !isMoveSubmitting

  // Everyone but the claimant is watching one person type. That is the whole
  // phase, and the status banner above already says whose turn it is, so a card
  // repeating the same sentence would be the duplicate signal the layout DoD
  // warns about. The reaction overlay is what this screen is for.
  if (!isClaimant) return null

  return (
    <div className="liars-single">
      {/* No heading: the status banner above already reads "Your turn to make
          a claim", and the placeholder says what goes in the box. */}
      <LiarsCard>
        <textarea
          className="bd-input resize-none"
          rows={4}
          placeholder={t('liarsParty.claimPlaceholder')}
          maxLength={180}
          value={claimText}
          onChange={e => setClaimText(e.target.value)}
        />
        <div className="mt-1 text-right text-xs text-bd-ink-muted">
          {t('liarsParty.charsRemaining', { count: 180 - charCount })}
        </div>

        <div className="liars-choice-row">
          <button
            onClick={() => setIsBluffSelected(false)}
            aria-pressed={isBluffSelected === false}
            className={`bd-btn liars-choice${isBluffSelected === false ? ' liars-choice--on-truth' : ' bd-btn-soft'}`}
          >
            <Icon name="check" size={16} /> {t('liarsParty.truth')}
          </button>
          <button
            onClick={() => setIsBluffSelected(true)}
            aria-pressed={isBluffSelected === true}
            className={`bd-btn liars-choice${isBluffSelected === true ? ' liars-choice--on-bluff' : ' bd-btn-soft'}`}
          >
            <Icon name="mask" size={16} /> {t('liarsParty.bluff')}
          </button>
        </div>

        <div className="liars-card__actions">
          <button
            onClick={() => isBluffSelected !== null && onSubmitClaim(claimText, isBluffSelected)}
            disabled={!canSubmit}
            className="bd-btn bd-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('liarsParty.submitClaim')}
          </button>
        </div>
      </LiarsCard>
    </div>
  )
}

interface EliminatedClaimScreenProps {
  data: LiarsPartyGameData
  currentUserId: string
  t: (key: TranslationKeys, opts?: Record<string, unknown>) => string
}

/** The eliminated player's banner, the one piece their screens add. */
function EliminatedBanner({ round, t }: { round: number | null | undefined; t: (key: TranslationKeys, opts?: Record<string, unknown>) => string }) {
  return (
    <LiarsCard className="liars-card--danger text-center" role="alert" testId="eliminated-banner">
      {t('liarsParty.eliminatedAt', { round: round ?? '?' })}
    </LiarsCard>
  )
}

function EliminatedClaimScreen({ data, currentUserId, t }: EliminatedClaimScreenProps) {
  const eliminatedRound = data.eliminatedAtRound[currentUserId]

  return (
    <div className="liars-single">
      <EliminatedBanner round={eliminatedRound} t={t} />
    </div>
  )
}

interface ChallengeScreenProps {
  data: LiarsPartyGameData
  currentUserId: string
  isMoveSubmitting: boolean
  onVote: (decision: 'challenge' | 'believe') => void
  t: (key: TranslationKeys, opts?: Record<string, unknown>) => string
}

/** The claim under vote, plus how many votes are in. Shared with the eliminated view. */
function ClaimUnderVote({ data, heading, t }: {
  data: LiarsPartyGameData
  heading?: string
  t: (key: TranslationKeys, opts?: Record<string, unknown>) => string
}) {
  const totalVoters = data.activePlayerIds.filter(id => id !== data.currentClaimantId).length
  return (
    <LiarsCard>
      {heading && <div className="liars-card__title">{heading}</div>}
      <blockquote className="liars-claim">&ldquo;{data.claim?.text}&rdquo;</blockquote>
      <div className="text-sm text-bd-ink-muted">{t('liarsParty.voted', { done: data.challengeVotes.length, total: totalVoters })}</div>
    </LiarsCard>
  )
}

function ChallengeScreen({ data, currentUserId, isMoveSubmitting, onVote, t }: ChallengeScreenProps) {
  const isClaimant = data.currentClaimantId === currentUserId
  const myVote = data.challengeVotes.find(v => v.playerId === currentUserId)

  return (
    <div className="liars-single">
      <ClaimUnderVote data={data} heading={t('liarsParty.challengeOrBelieve')} t={t} />

      {!isClaimant && !myVote && (
        <div className="liars-choice-row">
          <button
            onClick={() => onVote('challenge')}
            disabled={isMoveSubmitting}
            className="bd-btn bd-btn-coral liars-choice disabled:opacity-50"
          >
            {t('liarsParty.challenge')}
          </button>
          <button
            onClick={() => onVote('believe')}
            disabled={isMoveSubmitting}
            className="bd-btn liars-choice liars-choice--believe disabled:opacity-50"
          >
            {t('liarsParty.believe')}
          </button>
        </div>
      )}

      {!isClaimant && myVote && (
        <LiarsCard className="text-center">
          <div className="text-bd-ink">{t('liarsParty.youVoted', { decision: myVote.decision })}</div>
          <div className="mt-1 text-sm text-bd-ink-muted">{t('liarsParty.waitingForVotes')}</div>
        </LiarsCard>
      )}

      {isClaimant && (
        <LiarsCard className="text-center">
          <p className="text-sm text-bd-ink-soft">{t('liarsParty.waitingForVotes')}</p>
        </LiarsCard>
      )}
    </div>
  )
}

interface EliminatedChallengeScreenProps {
  data: LiarsPartyGameData
  currentUserId: string
  t: (key: TranslationKeys, opts?: Record<string, unknown>) => string
}

function EliminatedChallengeScreen({ data, currentUserId, t }: EliminatedChallengeScreenProps) {
  const eliminatedRound = data.eliminatedAtRound[currentUserId]

  return (
    <div className="liars-single">
      <EliminatedBanner round={eliminatedRound} t={t} />
      <ClaimUnderVote data={data} t={t} />
    </div>
  )
}

interface RevealScreenProps {
  data: LiarsPartyGameData
  players: GamePlayer[]
  isMoveSubmitting: boolean
  onAdvanceRound: () => void
  t: (key: TranslationKeys, opts?: Record<string, unknown>) => string
}

function RevealScreen({ data, players, isMoveSubmitting, onAdvanceRound, t }: RevealScreenProps) {
  const lastResult: LiarsPartyRoundResult | undefined = data.roundResults[data.roundResults.length - 1]
  const isLastRound = data.currentRound >= data.maxRounds
  const eliminatedThisRound = lastResult
    ? players.filter(p => {
        const pid = p.userId || p.id
        return data.eliminatedPlayerIds.includes(pid) && data.eliminatedAtRound[pid] === lastResult.round
      })
    : []

  return (
    <div className="liars-columns">
      {data.claim && (
        <LiarsCard>
          <blockquote className="liars-claim">&ldquo;{data.claim.text}&rdquo;</blockquote>
          <div className="liars-verdict" style={{ color: data.claim.isBluff ? 'var(--bd-coral-deep)' : 'var(--bd-mint-deep)' }}>
            {data.claim.isBluff ? t('liarsParty.wasBluff') : t('liarsParty.wasTruth')}
          </div>
        </LiarsCard>
      )}

      {lastResult && (
        <>
          <LiarsCard>
            <div className="liars-card__title">{t('liarsParty.voteBreakdown')}</div>
            <div className="space-y-2">
              {data.challengeVotes.map(vote => {
                const voter = players.find(p => p.userId === vote.playerId || p.id === vote.playerId)
                const voterName = voter?.name ?? vote.playerId
                const correct = vote.decision === 'challenge' ? lastResult.bluffCaught : !lastResult.bluffCaught
                const delta = lastResult.voterScoreDeltas[vote.playerId] ?? 0
                return (
                  <div key={vote.playerId} className="flex items-center justify-between gap-2 text-sm text-bd-ink">
                    <span className="min-w-0 flex-1 truncate">{voterName}</span>
                    <span className="text-bd-ink-soft">{vote.decision === 'challenge' ? t('liarsParty.challenge') : t('liarsParty.believe')}</span>
                    <span style={{ color: correct ? 'var(--bd-mint-deep)' : 'var(--bd-coral-deep)' }}><Icon name={correct ? 'check' : 'close'} size={14} /></span>
                    <span style={{ color: delta >= 0 ? 'var(--bd-mint-deep)' : 'var(--bd-coral-deep)' }}>{delta >= 0 ? `+${delta}` : delta}</span>
                  </div>
                )
              })}
            </div>
          </LiarsCard>

          <LiarsCard>
            <div className="liars-card__title">{t('liarsParty.totalScores')}</div>
            <div className="space-y-1">
              {data.activePlayerIds.map(pid => {
                const player = players.find(p => p.userId === pid || p.id === pid)
                const name = player?.name ?? pid
                const score = data.scores[pid] ?? 0
                const strikes = data.strikes[pid] ?? 0
                return (
                  <div key={pid} className="flex justify-between gap-2 text-sm text-bd-ink">
                    <span className="min-w-0 truncate">{name}</span>
                    <span className="text-bd-ink-soft">{score} pts · {t('liarsParty.strikes', { count: strikes, max: data.eliminationThreshold })}</span>
                  </div>
                )
              })}
            </div>
          </LiarsCard>
        </>
      )}

      {eliminatedThisRound.length > 0 && (
        <LiarsCard className="liars-card--danger text-center">
          <div className="mb-1 font-semibold">{t('liarsParty.eliminatedThisRound')}</div>
          {eliminatedThisRound.map(p => <div key={p.id} className="text-sm">{p.name}</div>)}
        </LiarsCard>
      )}

      {/*
        Open to every player, not just the host — the engine's validateMove for
        advance-round has no player-ownership check (any known player can legally
        advance). Gating this to isHost made the game permanently soft-lock for
        everyone else whenever the host didn't click through. See #642.
      */}
      <div className="liars-columns__footer">
        <button
          onClick={onAdvanceRound}
          disabled={isMoveSubmitting}
          className="bd-btn bd-btn-primary disabled:opacity-50"
        >
          {isLastRound ? t('liarsParty.seeResults') : t('liarsParty.nextRound')}
        </button>
      </div>
    </div>
  )
}

interface GameOverScreenProps {
  data: LiarsPartyGameData
  players: GamePlayer[]
  isHost: boolean
  isStarting: boolean
  onPlayAgain: () => void
  onReturnToLobby: () => void
  t: (key: TranslationKeys, opts?: Record<string, unknown>) => string
  /** Lobby code for the after-game share button (#982). */
  code: string
  isGuest: boolean
  /** Decided by the caller; gates the push ask slot (#982). */
  isRegistered: boolean
}

function GameOverScreen({ data, players, isHost, isStarting, onPlayAgain, onReturnToLobby, t, code, isGuest, isRegistered }: GameOverScreenProps) {
  const winner = players.find(p => p.userId === data.winnerId || p.id === data.winnerId)
  const winnerName = winner?.name ?? data.winnerId ?? '?'

  return (
    <div className="liars-columns">
      <LiarsCard className="text-center">
        <div style={{ color: LIARS_PARTY_ACCENT }}><Icon name="mask" size={40} /></div>
        <h2 className="font-display text-3xl font-extrabold text-bd-ink">
          {t('liarsParty.wins', { name: winnerName })}
        </h2>
        <div className="mt-1 text-sm text-bd-ink-muted">
          {data.completionReason === 'last-player-standing'
            ? t('liarsParty.lastPlayerStanding')
            : t('liarsParty.maxRoundsReached')}
        </div>
        <div className="liars-card__actions">
          {isHost ? (
            <>
              <button onClick={onPlayAgain} disabled={isStarting} className="bd-btn bd-btn-primary disabled:opacity-50">
                {isStarting ? t('common.loading') : t('liarsParty.playAgain')}
              </button>
              <button onClick={onReturnToLobby} disabled={isStarting} className="bd-btn bd-btn-soft disabled:opacity-50">
                {t('game.ui.returnToLobby')}
              </button>
            </>
          ) : (
            <p className="text-sm text-bd-ink-soft">{t('game.ui.waitingForHost')}</p>
          )}
        </div>
      </LiarsCard>

      <LiarsCard>
        <div className="space-y-2">
          {data.ranking.map((pid, idx) => {
            const player = players.find(p => p.userId === pid || p.id === pid)
            const name = player?.name ?? pid
            const score = data.scores[pid] ?? 0
            const strikes = data.strikes[pid] ?? 0
            return (
              <div key={pid} className="flex items-center justify-between gap-2 text-sm text-bd-ink">
                <span className="font-bold text-bd-ink-muted">{t('liarsParty.rank', { position: idx + 1 })}</span>
                <span className="min-w-0 flex-1 truncate">{name}</span>
                <span>{score} pts</span>
                <span className="text-bd-ink-muted">{t('liarsParty.strikes', { count: strikes, max: data.eliminationThreshold })}</span>
              </div>
            )
          })}
        </div>
      </LiarsCard>

      {/* Card variant now that the screen is themed rather than white-on-gradient (#982, #1040). */}
      <div className="liars-columns__footer">
        <AfterGameActions
          variant="card"
          inviteCode={code}
          gameType="liars_party"
          isGuest={isGuest}
          isRegistered={isRegistered}
          registerUrl={`/auth/register?returnUrl=${encodeURIComponent(`/lobby/${code}`)}`}
        />
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LiarsPartyPage({ code, isSpectator = false, onGameReset }: LiarsPartyPageProps) {
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
  const [showLeaveConfirmModal, setShowLeaveConfirmModal] = useState(false)

  // #1038: leaving used to be a bare router.push('/games'), so the server never
  // heard about it. The seat stayed occupied and the table kept waiting on a
  // claimant or a voter who had closed the tab – this game type has no bots to
  // take over and no forfeit move. The API call is the leave; the navigation is
  // only what this browser does afterwards.
  const { isLeavingLobbyRef, leaveLobby } = useLeaveLobby(code, "Liar's Party")
  // Zero-signal disconnect detection (#675) — see tic-tac-toe-page.tsx for why every dedicated page needs its own.
  useLobbyHeartbeat(code, !isSpectator)

  // Timer tick — forces re-render every second for countdown displays
  const [timerTick, setTimerTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTimerTick(t => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const stuckTurnRecoveryRef = React.useRef(createStuckTurnRecovery())

  const lifecycleRedirectInFlightRef = React.useRef(false)
  const activeGameIdRef = React.useRef<string | null>(null)
  const gameStatusRef = React.useRef<string | null>(null)
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
    gameStatusRef.current = game?.status ?? null
  }, [game?.status])

  useEffect(() => {
    if (status === 'loading' || (status === 'unauthenticated' && !isGuest && !isSpectator)) return
    if (isGuest && !guestToken) return
    void loadLobby()
  }, [status, isGuest, guestToken, loadLobby])

  const handleGameUpdate = useCallback((payload: GameUpdatePayload) => {
    const activeGameId = activeGameIdRef.current
    if (payload?.action === 'state-change' && activeGameId) {
      const state = (payload?.payload as Record<string, unknown>)?.state
      if (state) { applyAuthoritativeState(activeGameId, state); return }
    }
    void loadLobby()
  }, [applyAuthoritativeState, loadLobby])

  const handleGameAbandoned = useCallback(() => {
    clientLogger.log('📡 LiarsParty game abandoned')
    // The player who is leaving caused this broadcast; they are already on their
    // way to /games and must not be told the game they just quit was abandoned.
    if (isLeavingLobbyRef.current) return
    void loadLobby()
    triggerLifecycleRedirect('liars-party-lifecycle-redirect')
  }, [loadLobby, triggerLifecycleRedirect, isLeavingLobbyRef])

  const handlePlayerLeft = useCallback((payload: { userId: string; username?: string; remainingPlayers?: number; gameTerminal?: boolean }) => {
    clientLogger.log('📡 LiarsParty player left', payload)
    if (isLeavingLobbyRef.current) return
    if (payload.username) showToast.info('toast.playerLeft', undefined, { player: payload.username })
    // Only a match in progress dies when the roster falls under the minimum.
    // This game seats four before it can start, so a waiting room of three is an
    // ordinary state – one more person walks in and it starts. Without the status
    // check, the first person to leave a full waiting room evicted everyone still
    // in it, spectators included, with an "abandoned" toast (#1038).
    const inProgress = gameStatusRef.current === 'playing'
    if (inProgress && !payload.gameTerminal && typeof payload.remainingPlayers === 'number' && payload.remainingPlayers < minPlayersRequired) {
      triggerLifecycleRedirect('liars-party-lifecycle-redirect')
      return
    }
    void loadLobby()
  }, [loadLobby, triggerLifecycleRedirect, minPlayersRequired, isLeavingLobbyRef])

  const handleGameReset = useCallback(() => {
    if (onGameReset) onGameReset()
    else router.push(`/lobby/${code}`)
  }, [code, onGameReset, router])

  useRealtimeConnection({
        // #987: Supabase Broadcast has no replay buffer, so every event that
        // landed while the socket was down is gone. Without this the board
        // stayed frozen on pre-gap state and neither player could move.
    onStateSync: async () => { await loadLobby() },
    code,
    shouldJoinLobbyRoom: status !== 'loading' && (status === 'authenticated' || (isGuest && !!guestToken) || isSpectator),
    onGameUpdate: handleGameUpdate,
    onGameAbandoned: handleGameAbandoned,
    onPlayerLeft: handlePlayerLeft,
    onLobbyUpdate: () => { void loadLobby() },
    onPlayerJoined: () => { void loadLobby() },
    onGameReset: handleGameReset,
  })

  // #999: this game does have a server-side timeout fallback, but it runs inside
  // GET /api/lobby/[code], and during play this page only fetches when a
  // broadcast arrives – which needs somebody to still be moving. Let the table go
  // quiet, because the player everyone is waiting on closed their tab, and
  // nothing asks: the countdown reaches zero, applyTimeoutFallback never runs and
  // sweepStalePlayers never sees the missing heartbeat. So when the clock runs
  // out and nothing has happened, ask. Throttled by the same recovery the
  // move-based games use (#989): one request per ten seconds, six at most.
  useEffect(() => {
    if (game?.status !== 'playing') return

    const state = gameEngine?.getState()
    const lastMoveAt = typeof state?.lastMoveAt === 'number' ? state.lastMoveAt : null
    if (lastMoveAt === null) return

    const limitSeconds = typeof lobby?.turnTimer === 'number' && lobby.turnTimer > 0 ? lobby.turnTimer : 60
    const now = Date.now()
    if (now - lastMoveAt < limitSeconds * 1000) return

    const decision = stuckTurnRecoveryRef.current.decide(
      turnSignatureOf(state?.currentPlayerIndex, lastMoveAt),
      now
    )
    if (decision !== 'resync') return

    clientLogger.warn("⏰ Liar's Party timer expired with nobody acting, asking the server", { code })
    void loadLobby()
  }, [timerTick, game?.status, gameEngine, lobby?.turnTimer, code, loadLobby])

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

  /**
   * A spectator holds no seat, so there is nothing to give back: their way out
   * is the lobby, not the leave API. A player is asked first – leaving a live
   * round takes the whole table down with them once the roster falls under four.
   */
  const requestLeave = useCallback(() => {
    if (isSpectator) {
      router.push(`/lobby/${code}`)
      return
    }
    setShowLeaveConfirmModal(true)
  }, [code, isSpectator, router])

  const confirmLeave = useCallback(() => {
    if (isLeavingLobbyRef.current) return
    setShowLeaveConfirmModal(false)
    // Free the seat first. leaveLobby() is a keepalive fetch, so it survives the
    // navigation that follows it; replace, not push, so Back does not walk into
    // a lobby this player is no longer in.
    leaveLobby()
    router.replace('/games')
  }, [isLeavingLobbyRef, leaveLobby, router])

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

  const handleReturnToWaiting = useCallback(async () => {
    const userId = getCurrentUserId()
    if (!userId || !lobby || lobby.creatorId !== userId) return
    setIsStarting(true)
    try {
      const res = await fetchWithGuest(`/api/lobby/${code}/return-to-waiting`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to return to waiting room')
      if (onGameReset) onGameReset()
      else router.push(`/lobby/${code}`)
    } catch (err) {
      showToast.errorFrom(err, 'toast.gameStartFailed')
    } finally {
      setIsStarting(false)
    }
  }, [code, getCurrentUserId, lobby, onGameReset, router])

  if (loading) {
    return (
      <div className="game-screen liars-screen liars-screen--centered" style={getThemePageStyle(lobby?.theme)}>
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

  const claimantPlayer = data ? players.find(p => p.userId === data.currentClaimantId || p.id === data.currentClaimantId) : undefined
  const claimantName = claimantPlayer?.name ?? data?.currentClaimantId ?? ''
  const isClaimant = !isSpectator && !!data && data.currentClaimantId === currentUserId

  const roundMeta = data ? t('liarsParty.round', { current: data.currentRound, total: data.maxRounds }) : undefined

  /** The one status line, in the one place every game puts it (layout DoD). */
  const turnBanner = (activeTitle: string, isYourTurn: boolean) => (
    <GameStatusBanner
      isFinished={false}
      activeTitle={activeTitle}
      meta={roundMeta}
      secs={timerRemaining}
      turnTimerLimit={turnTimerSeconds}
      barColor={LIARS_PARTY_ACCENT}
      leadingIcon={<Icon name="mask" size={20} />}
      isSpectator={isSpectator}
      isYourTurn={isYourTurn}
    />
  )

  // Everything below renders into one shell and one return, so the theme, the
  // header and the leave confirmation are defined once rather than seven times.
  let content: React.ReactNode = <LoadingSpinner />
  let testId = 'liars-party-loading'
  let statusNode: React.ReactNode = null
  let showReactions = false

  if (resolvedStatus === 'waiting') {
    // No banner: nothing is on the clock yet, and the players card carries the
    // "N / 12, waiting for more" signal a turn banner would duplicate.
    testId = 'liars-party-waiting-room'
    content = (
      <WaitingScreen
        players={players}
        data={data}
        rules={rules}
        isHost={!isSpectator && isHost}
        isStarting={isStarting}
        onStart={handleStartGame}
        t={t}
      />
    )
  } else if (resolvedStatus === 'playing' && data && data.phase === 'claim') {
    showReactions = !isSpectator
    statusNode = turnBanner(
      isClaimant ? t('liarsParty.yourTurnToClaim') : t('liarsParty.isClaimingFor', { name: claimantName }),
      isClaimant
    )
    testId = isEliminated ? 'liars-party-eliminated-claim-screen' : 'liars-party-claim-screen'
    content = isEliminated ? (
      <EliminatedClaimScreen data={data} currentUserId={currentUserId} t={t} />
    ) : (
      <ClaimScreen
        data={data}
        currentUserId={currentUserId}
        isMoveSubmitting={isMoveSubmitting}
        onSubmitClaim={(claim, isBluff) => handleMove('submit-claim', { claim, isBluff })}
        t={t}
      />
    )
  } else if (resolvedStatus === 'playing' && data && data.phase === 'challenge') {
    showReactions = !isSpectator
    const hasVoted = data.challengeVotes.some(v => v.playerId === currentUserId)
    statusNode = turnBanner(t('liarsParty.challengeOrBelieve'), !isSpectator && !isEliminated && !isClaimant && !hasVoted)
    testId = isEliminated ? 'liars-party-eliminated-challenge-screen' : 'liars-party-challenge-screen'
    content = isEliminated ? (
      <EliminatedChallengeScreen data={data} currentUserId={currentUserId} t={t} />
    ) : (
      <ChallengeScreen
        data={data}
        currentUserId={currentUserId}
        isMoveSubmitting={isSpectator || isMoveSubmitting}
        onVote={(decision) => handleMove('submit-challenge', { decision })}
        t={t}
      />
    )
  } else if (resolvedStatus === 'playing' && data && data.phase === 'reveal') {
    // Reveal waits on a click, not a clock, so there is no timer to show.
    showReactions = !isSpectator
    testId = 'liars-party-reveal-screen'
    content = (
      <RevealScreen
        data={data}
        players={players}
        isMoveSubmitting={isMoveSubmitting}
        onAdvanceRound={() => handleMove('advance-round', {})}
        t={t}
      />
    )
  } else if (resolvedStatus === 'finished' && data) {
    testId = 'liars-party-game-over-screen'
    content = (
      <GameOverScreen
        data={data}
        players={players}
        isHost={!isSpectator && isHost}
        isStarting={isStarting}
        onPlayAgain={handleStartGame}
        onReturnToLobby={handleReturnToWaiting}
        t={t}
        code={code}
        isGuest={!isSpectator && isGuest}
        isRegistered={!isSpectator && status === 'authenticated' && !isGuest}
      />
    )
  }

  // The reaction overlay and the confirm modal are siblings of the shell, not
  // content inside it: both draw outside the flow, and a child of the scrolling
  // content region would join its flex layout and shift the phase off centre.
  return (
    <>
      <LiarsPartyShell
        testId={testId}
        code={code}
        title={t('liarsParty.name')}
        leaveLabel={isSpectator ? t('game.ui.backToLobby') : t('game.ui.leave')}
        theme={lobby?.theme}
        isSpectator={isSpectator}
        allowSpectators={!!lobby?.allowSpectators}
        onLeave={requestLeave}
        status={statusNode}
      >
        {content}
      </LiarsPartyShell>
      {showReactions && <ReactionOverlay lobbyCode={code} />}
      {!isSpectator && (
        <ConfirmModal
          isOpen={showLeaveConfirmModal}
          onClose={() => setShowLeaveConfirmModal(false)}
          onConfirm={confirmLeave}
          title={t('game.ui.leave')}
          message={t('game.ui.leaveConfirm')}
          confirmText={t('common.confirm')}
          cancelText={t('common.cancel')}
          variant="danger"
          icon={<LeaveIcon size={28} />}
        />
      )}
    </>
  )
}
