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
import { useLobbyChat, useLobbyChatHistory } from '@/app/lobby/[code]/hooks/useLobbyChat'
import type { GameUpdatePayload } from '@/types/game'
import { finalizePendingLobbyCreateMetric } from '@/lib/lobby-create-metrics'
import { trackMoveSubmitApplied } from '@/lib/analytics'
import LoadingSpinner from '@/components/LoadingSpinner'
import ConfirmModal from '@/components/ConfirmModal'
import LeaveIcon from '@/components/LeaveIcon'
import Chat from '@/components/Chat'
import GamePlayerCard from '@/components/game-chrome/GamePlayerCard'
import GameResultOverlay from '@/components/game-chrome/GameResultOverlay'
import GameRoomCard from '@/components/game-chrome/GameRoomCard'
import GameScoreboardHeader from '@/components/game-chrome/GameScoreboardHeader'
import GameStatusBanner from '@/components/game-chrome/GameStatusBanner'
import GameTabs from '@/components/game-chrome/GameTabs'
import { getThemePageStyle } from '@/lib/lobby-themes'
import { ReactionOverlay } from '@/components/ReactionOverlay'
import { LiarsPartyGame, type LiarsPartyGameData, type LiarsPartyRoundResult } from '@/lib/games/liars-party-game'
import { createStuckTurnRecovery, turnSignatureOf } from '@/lib/stuck-turn-recovery'
import { useTurnSounds } from '@/hooks/useTurnSounds'

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
  maxPlayers?: number
}

interface GamePlayerUser {
  username?: string
  avatarUrl?: string | null
  image?: string | null
  isPremium?: boolean
}

interface GamePlayer {
  id: string
  userId: string
  /**
   * Optional, and in practice absent: GET /api/lobby/[code] returns Prisma
   * `players` rows, which have no `name` column – the display name is on the
   * joined user. It was typed as required here and read as `p.name` on every
   * screen, so a real game showed blank rows in the waiting room and raw
   * `guest-89b9ec22-…` ids in the status banner, the vote breakdown and the
   * final ranking. The page test never caught it because its fixture invents a
   * `name` the API does not send. Read names through `playerNameOf`.
   */
  name?: string
  user?: GamePlayerUser
}

/**
 * The display name for one player, in the order the other kit pages use
 * (`rock-paper-scissors-page.tsx:329`): the joined username first, then any
 * `name` a caller did pass, then a translated fallback – never a raw user id.
 */
function playerNameOf(
  player: GamePlayer | undefined,
  t: (key: TranslationKeys, opts?: Record<string, unknown>) => string
): string {
  return player?.user?.username || player?.name || t('game.ui.playerFallback')
}

/** The same, starting from a player id rather than the row. */
function playerNameById(
  players: GamePlayer[],
  playerId: string,
  t: (key: TranslationKeys, opts?: Record<string, unknown>) => string
): string {
  return playerNameOf(players.find(p => p.userId === playerId || p.id === playerId), t)
}

interface Game {
  id: string
  status: string
  state: unknown
  players: GamePlayer[]
}

/** The catalog accent for liars_party (lib/game-catalog.ts). */
const LIARS_PARTY_ACCENT = 'var(--bd-lav)'
const LIARS_PARTY_ACCENT_DEEP = 'var(--bd-lav-deep)'

/** A themed card. One class so the phases cannot drift apart again. */
function LiarsCard({ children, className = '', role, testId }: { children: React.ReactNode; className?: string; role?: string; testId?: string }) {
  return (
    <div className={`bd-card liars-card ${className}`.trim()} role={role} data-testid={testId}>
      {children}
    </div>
  )
}

// ─── Phase content ───────────────────────────────────────────────────────────
// Each phase renders the one thing the viewer can act on, plus whatever fills
// the rest of the card. The roster / standings and the chat are not here: they
// are the shared right column on desktop and their own tabs on mobile, so a
// phase that repeated them would print the same table twice on the same screen.

interface WaitingContentProps {
  data: LiarsPartyGameData | undefined
  rules: string[]
  t: (key: TranslationKeys, opts?: Record<string, unknown>) => string
}

function WaitingContent({ data, rules, t }: WaitingContentProps) {
  const maxRounds = data?.maxRounds ?? 10
  const eliminationThreshold = data?.eliminationThreshold ?? 2

  return (
    <>
      <LiarsCard>
        <div className="text-sm text-bd-ink-muted">
          {t('liarsParty.roundsCount', { count: maxRounds })} · {t('liarsParty.eliminatedAfter', { count: eliminationThreshold })}
        </div>
      </LiarsCard>
      <LiarsRules rules={rules} t={t} fill />
    </>
  )
}

/** The numbered rules, shared by the waiting room and a round with no history yet. */
function LiarsRules({ rules, t, fill = false }: { rules: string[]; t: (key: TranslationKeys, opts?: Record<string, unknown>) => string; fill?: boolean }) {
  return (
    <LiarsCard className={fill ? 'liars-phase__fill' : ''} testId="liars-rules">
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
  )
}

/**
 * What every earlier round turned out to be. This is what a voter reads while
 * they wait – a player deciding whether to believe the claimant wants to know
 * how the last few claims went – and until a round has been played the rules
 * take the slot instead: the DoD's "when a panel is hidden its space is taken
 * by something useful".
 */
function LiarsRoundHistory({ data, players, rules, t }: {
  data: LiarsPartyGameData
  players: GamePlayer[]
  rules: string[]
  t: (key: TranslationKeys, opts?: Record<string, unknown>) => string
}) {
  const results = data.roundResults
  if (results.length === 0) return <LiarsRules rules={rules} t={t} fill />

  return (
    <LiarsCard className="liars-phase__fill" testId="liars-round-history">
      <div className="liars-card__title">{t('liarsParty.roundHistory')}</div>
      <div className="space-y-2">
        {[...results].reverse().map(result => (
          <div key={result.round} className="text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-bd-ink-muted">{t('liarsParty.round', { current: result.round, total: data.maxRounds })}</span>
              <span
                className="font-bold"
                style={{ color: result.wasBluff ? 'var(--bd-coral-deep)' : 'var(--bd-mint-deep)' }}
              >
                {result.wasBluff ? t('liarsParty.wasBluff') : t('liarsParty.wasTruth')}
              </span>
            </div>
            <div className="text-bd-ink-soft">
              {t('liarsParty.claimedBy', { name: playerNameById(players, result.claimantId, t) })}
            </div>
            <div className="truncate text-bd-ink" title={result.claimText}>&ldquo;{result.claimText}&rdquo;</div>
          </div>
        ))}
      </div>
    </LiarsCard>
  )
}

interface LiarsPlayersPanelProps {
  data: LiarsPartyGameData | undefined
  players: GamePlayer[]
  maxPlayers: number
  currentUserId: string
  isFinished: boolean
  t: (key: TranslationKeys, opts?: Record<string, unknown>) => string
}

/**
 * The right column's top card (the Players tab on mobile): before the game the
 * roster, during it the standings – who is still in, what they have scored and
 * how close each of them is to a strike-out, with the player holding the floor
 * marked.
 *
 * This is one panel and not two because it answers one question at both ends of
 * the game, and because the column has one slot for it. It used to be a column
 * inside the claim phase, which is why the claim phase had to render it three
 * times over (claimant, voter, eliminated) and why a spectator saw nothing at
 * all on the game's most-watched screen.
 */
function LiarsPlayersPanel({ data, players, maxPlayers, currentUserId, isFinished, t }: LiarsPlayersPanelProps) {
  const nameOf = (pid: string) => playerNameById(players, pid, t)
  const seated = data && data.activePlayerIds.length > 0
  // A finished game has one name left in `activePlayerIds` – everyone else was
  // knocked out – so reading the live list printed a one-row "Total Scores"
  // beside the result overlay, at the moment the table most wants to compare
  // numbers. The ranking is the finished game's roster.
  const seatIds = isFinished && data ? data.ranking : (data?.activePlayerIds ?? [])

  return (
    <section className="liars-panel" data-testid="liars-standings">
      <div className="liars-panel__head">
        <h3 className="liars-card__title mb-0">{seated ? t('liarsParty.totalScores') : t('liarsParty.playersHeading', { count: players.length })}</h3>
        <span className="liars-chip">{players.length} / {maxPlayers}</span>
      </div>

      <div className="liars-scroll liars-panel__list">
        {seated
          ? seatIds.map(pid => {
              // Only while somebody is actually claiming – the marker read as
              // stale on the reveal screen, where the claim is already settled.
              const isClaimant = data.phase === 'claim' && pid === data.currentClaimantId
              return (
                <div key={pid} className={`liars-seat${pid === currentUserId ? ' liars-seat--me' : ''}`}>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    {isClaimant && (
                      <span style={{ color: LIARS_PARTY_ACCENT }} title={t('liarsParty.claimingNow')}>
                        <Icon name="mask" size={14} label={t('liarsParty.claimingNow')} />
                      </span>
                    )}
                    <span className="truncate">{nameOf(pid)}</span>
                  </span>
                  <span className="shrink-0 text-bd-ink-soft">
                    {t('liarsParty.points', { count: data.scores[pid] ?? 0 })} · {t('liarsParty.strikes', { count: data.strikes[pid] ?? 0, max: data.eliminationThreshold })}
                  </span>
                </div>
              )
            })
          : players.map(p => (
              <div key={p.id} className={`liars-seat${p.userId === currentUserId ? ' liars-seat--me' : ''}`}>
                <span className="truncate">{playerNameOf(p, t)}</span>
              </div>
            ))}
      </div>

      {seated && !isFinished && data.eliminatedPlayerIds.length > 0 && (
        <div className="liars-panel__foot">
          {t('liarsParty.outOfTheGame', { names: data.eliminatedPlayerIds.map(nameOf).join(', ') })}
        </div>
      )}
    </section>
  )
}

/** The eliminated player's banner, the one piece their screens add. */
function EliminatedBanner({ round, t }: { round: number | null | undefined; t: (key: TranslationKeys, opts?: Record<string, unknown>) => string }) {
  return (
    <LiarsCard className="liars-card--danger text-center" role="alert" testId="eliminated-banner">
      {t('liarsParty.eliminatedAt', { round: round ?? '?' })}
    </LiarsCard>
  )
}

interface ClaimContentProps {
  data: LiarsPartyGameData
  players: GamePlayer[]
  rules: string[]
  isMoveSubmitting: boolean
  onSubmitClaim: (claim: string, isBluff: boolean) => void
  t: (key: TranslationKeys, opts?: Record<string, unknown>) => string
}

export interface LiarsClaimDraft {
  /** The round the half-typed claim belongs to, so the next one starts clean. */
  round: number
  text: string
  isBluff: boolean | null
}

/**
 * The claimant's form. Everyone else gets the history below instead.
 *
 * The draft is the page's, not this component's: the desktop, landscape and
 * portrait trees each mount their own copy of the phase card and only one is on
 * screen, so a rotation or a window drag across the breakpoint would otherwise
 * hand the claimant a blank box with the round clock still running (the same
 * trap Sketch & Guess hit with its canvas, #1034).
 */
function ClaimForm({ draft, onDraftChange, isMoveSubmitting, onSubmitClaim, t }: {
  draft: LiarsClaimDraft
  onDraftChange: (next: LiarsClaimDraft) => void
  isMoveSubmitting: boolean
  onSubmitClaim: (claim: string, isBluff: boolean) => void
  t: (key: TranslationKeys, opts?: Record<string, unknown>) => string
}) {
  const claimText = draft.text
  const isBluffSelected = draft.isBluff
  const setClaimText = (text: string) => onDraftChange({ ...draft, text })
  const setIsBluffSelected = (isBluff: boolean) => onDraftChange({ ...draft, isBluff })
  const charCount = claimText.length
  const canSubmit = charCount >= 5 && charCount <= 180 && isBluffSelected !== null && !isMoveSubmitting

  return (
    // No heading: the status banner above already reads "Your turn to make a
    // claim", and the placeholder says what goes in the box.
    <LiarsCard>
      <textarea
        className="bd-input resize-none"
        rows={3}
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
  )
}

function ClaimContent({ data, players, rules, isMoveSubmitting, onSubmitClaim, isClaimant, eliminatedRound, draft, onDraftChange, t }: ClaimContentProps & {
  isClaimant: boolean
  eliminatedRound: number | null | undefined
  draft: LiarsClaimDraft
  onDraftChange: (next: LiarsClaimDraft) => void
}) {
  return (
    <>
      {eliminatedRound !== undefined && <EliminatedBanner round={eliminatedRound} t={t} />}
      {isClaimant && <ClaimForm draft={draft} onDraftChange={onDraftChange} isMoveSubmitting={isMoveSubmitting} onSubmitClaim={onSubmitClaim} t={t} />}
      <LiarsRoundHistory data={data} players={players} rules={rules} t={t} />
    </>
  )
}

/** The claim under vote, plus how many votes are in. */
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

interface ChallengeContentProps {
  data: LiarsPartyGameData
  players: GamePlayer[]
  rules: string[]
  currentUserId: string
  isClaimant: boolean
  eliminatedRound: number | null | undefined
  t: (key: TranslationKeys, opts?: Record<string, unknown>) => string
}

function ChallengeContent({ data, players, rules, currentUserId, isClaimant, eliminatedRound, t }: ChallengeContentProps) {
  const myVote = data.challengeVotes.find(v => v.playerId === currentUserId)
  const canVote = !isClaimant && !myVote && eliminatedRound === undefined

  return (
    <>
      {eliminatedRound !== undefined && <EliminatedBanner round={eliminatedRound} t={t} />}
      <ClaimUnderVote data={data} heading={t('liarsParty.challengeOrBelieve')} t={t} />

      {!canVote && myVote && (
        <LiarsCard className="text-center">
          <div className="text-bd-ink">{t('liarsParty.youVoted', { decision: myVote.decision })}</div>
          <div className="mt-1 text-sm text-bd-ink-muted">{t('liarsParty.waitingForVotes')}</div>
        </LiarsCard>
      )}

      <LiarsRoundHistory data={data} players={players} rules={rules} t={t} />
    </>
  )
}

/** Whether this viewer still owes a vote, so the page knows to pin the row. */
function canVoteNow(data: LiarsPartyGameData, currentUserId: string, isClaimant: boolean, eliminatedRound: number | null | undefined) {
  return !isClaimant && eliminatedRound === undefined && !data.challengeVotes.some(v => v.playerId === currentUserId)
}

interface RevealContentProps {
  data: LiarsPartyGameData
  players: GamePlayer[]
  rules: string[]
  t: (key: TranslationKeys, opts?: Record<string, unknown>) => string
}

function RevealContent({ data, players, rules, t }: RevealContentProps) {
  // The engine only resolves a round inside `advanceAfterReveal`, which runs
  // when somebody submits `advance-round` – i.e. on the way OUT of this phase
  // (lib/games/liars-party-game.ts:479). So while this screen is on show there
  // is no `roundResults` entry for the round it is revealing: reading the last
  // one gave `undefined` in round 1, which hid the vote breakdown, the scores
  // and the elimination card and left this screen a single claim card; and from
  // round 2 on it gave the *previous* round's numbers, presented as this
  // round's result. Prefer the resolved entry when there is one (a timeout
  // fallback can resolve before re-entering reveal) and otherwise read the vote
  // off the live state, which holds every fact this screen shows.
  const resolved: LiarsPartyRoundResult | undefined =
    data.roundResults.find(result => result.round === data.currentRound)
  const wasBluff = resolved?.wasBluff ?? data.claim?.isBluff ?? false
  const eliminatedThisRound = players.filter(p => {
    const pid = p.userId || p.id
    return data.eliminatedPlayerIds.includes(pid) && data.eliminatedAtRound[pid] === data.currentRound
  })

  return (
    <>
      {data.claim && (
        <LiarsCard>
          <blockquote className="liars-claim">&ldquo;{data.claim.text}&rdquo;</blockquote>
          <div className="liars-verdict" style={{ color: data.claim.isBluff ? 'var(--bd-coral-deep)' : 'var(--bd-mint-deep)' }}>
            {data.claim.isBluff ? t('liarsParty.wasBluff') : t('liarsParty.wasTruth')}
          </div>
        </LiarsCard>
      )}

      {data.challengeVotes.length > 0 && (
        <LiarsCard testId="liars-vote-breakdown">
          <div className="liars-card__title">{t('liarsParty.voteBreakdown')}</div>
          <div className="space-y-2">
            {data.challengeVotes.map(vote => {
              const voter = players.find(p => p.userId === vote.playerId || p.id === vote.playerId)
              // A challenge is right when the claim was a bluff – which is how
              // the engine scores it (`resolveCurrentRound`, :511). It used to
              // be compared against `bluffCaught`, the strict-majority verdict
              // on the table as a whole, so an uncaught bluff marked every
              // challenger wrong while the engine was paying them.
              const correct = vote.decision === 'challenge' ? wasBluff : !wasBluff
              // Only a resolved round has real deltas; until then the points
              // have not moved, so none are shown rather than invented.
              const delta = resolved?.voterScoreDeltas[vote.playerId]
              return (
                <div key={vote.playerId} className="flex items-center justify-between gap-2 text-sm text-bd-ink">
                  <span className="min-w-0 flex-1 truncate">{playerNameOf(voter, t)}</span>
                  <span className="text-bd-ink-soft">{vote.decision === 'challenge' ? t('liarsParty.challenge') : t('liarsParty.believe')}</span>
                  <span style={{ color: correct ? 'var(--bd-mint-deep)' : 'var(--bd-coral-deep)' }}><Icon name={correct ? 'check' : 'close'} size={14} /></span>
                  {delta !== undefined && (
                    <span style={{ color: delta >= 0 ? 'var(--bd-mint-deep)' : 'var(--bd-coral-deep)' }}>{delta >= 0 ? `+${delta}` : delta}</span>
                  )}
                </div>
              )
            })}
          </div>
        </LiarsCard>
      )}

      {eliminatedThisRound.length > 0 && (
        <LiarsCard className="liars-card--danger text-center">
          <div className="mb-1 font-semibold">{t('liarsParty.eliminatedThisRound')}</div>
          {eliminatedThisRound.map(p => <div key={p.id} className="text-sm">{playerNameOf(p, t)}</div>)}
        </LiarsCard>
      )}

      {/* The vote breakdown is four to eleven rows; measured at 390 it left
          450px of empty card under it when it was the stretching one. What
          belongs in that space is the same thing the other phases put there. */}
      <LiarsRoundHistory data={data} players={players} rules={rules} t={t} />
    </>
  )
}

/**
 * What sits under GameResultOverlay: the full final table. The winner line, the
 * rematch buttons and the after-game actions are the overlay's, so they are not
 * repeated here – a player who taps through to inspect wants the numbers.
 */
function FinishedContent({ data, players, winnerName, t }: {
  data: LiarsPartyGameData
  players: GamePlayer[]
  winnerName: string
  t: (key: TranslationKeys, opts?: Record<string, unknown>) => string
}) {
  return (
    <>
      <LiarsCard className="text-center">
        <div style={{ color: LIARS_PARTY_ACCENT }}><Icon name="mask" size={28} /></div>
        <h2 className="font-display text-2xl font-extrabold text-bd-ink">
          {t('liarsParty.wins', { name: winnerName })}
        </h2>
        <div className="mt-1 text-sm text-bd-ink-muted">
          {data.completionReason === 'last-player-standing'
            ? t('liarsParty.lastPlayerStanding')
            : t('liarsParty.maxRoundsReached')}
        </div>
      </LiarsCard>

      <LiarsCard className="liars-phase__fill" testId="liars-final-ranking">
        <div className="liars-card__title">{t('liarsParty.totalScores')}</div>
        <div className="space-y-2">
          {data.ranking.map((pid, idx) => {
            const player = players.find(p => p.userId === pid || p.id === pid)
            const score = data.scores[pid] ?? 0
            const strikes = data.strikes[pid] ?? 0
            return (
              <div key={pid} className="flex items-center justify-between gap-2 text-sm text-bd-ink">
                <span className="font-bold text-bd-ink-muted">{t('liarsParty.rank', { position: idx + 1 })}</span>
                <span className="min-w-0 flex-1 truncate">{playerNameOf(player, t)}</span>
                <span>{t('liarsParty.points', { count: score })}</span>
                <span className="text-bd-ink-muted">{t('liarsParty.strikes', { count: strikes, max: data.eliminationThreshold })}</span>
              </div>
            )
          })}
        </div>
      </LiarsCard>
    </>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

type LiarsMobileTab = 'game' | 'players' | 'chat'

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
  const [mobileTab, setMobileTab] = useState<LiarsMobileTab>('game')
  const [overlayInspecting, setOverlayInspecting] = useState(false)
  const [claimDraft, setClaimDraft] = useState<LiarsClaimDraft>({ round: 0, text: '', isBluff: null })

  // #1038: leaving used to be a bare router.push('/games'), so the server never
  // heard about it. The seat stayed occupied and the table kept waiting on a
  // claimant or a voter who had closed the tab – this game type has no bots to
  // take over and no forfeit move. The API call is the leave; the navigation is
  // only what this browser does afterwards.
  const { isLeavingLobbyRef, leaveLobby } = useLeaveLobby(code, "Liar's Party")
  // Zero-signal disconnect detection (#675) – see tic-tac-toe-page.tsx for why every dedicated page needs its own.
  useLobbyHeartbeat(code, !isSpectator)

  // #1041: chat is not decoration in a social deduction game – the bluffing
  // happens in it. Same Redis-backed, server-authorized pipeline as every other
  // kit page (#736); nothing here broadcasts chat itself.
  const {
    chatMessages,
    sendChatMessage,
    unreadCount: chatUnreadCount,
    resetUnread: resetChatUnread,
    someoneTyping,
    onChatMessage,
    onPlayerTyping,
    mergeHistoryMessages,
  } = useLobbyChat({ code, isChatVisible: mobileTab === 'chat' })

  // Timer tick – forces re-render every second for countdown displays
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

  const { isConnected: socketConnected, isReconnecting } = useRealtimeConnection({
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
    onChatMessage,
    onPlayerTyping,
  })

  useLobbyChatHistory({ code, isConnected: socketConnected, isReconnecting, mergeHistoryMessages })

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

  // Turn and table cues (#1111), read off the engine here because the derived
  // values below sit after the loading return and a hook cannot. The claim
  // coming to the viewer is their turn; someone else's claim or challenge vote
  // is a move at the table.
  const soundUserId = getCurrentUserId() ?? ''
  const soundData = game?.status === 'playing' ? (gameEngine?.getState().data as LiarsPartyGameData | undefined) : undefined
  const othersActed = soundData
    ? (soundData.claim && soundData.currentClaimantId !== soundUserId ? 1 : 0) +
      soundData.challengeVotes.filter((v) => v.playerId !== soundUserId).length
    : 0
  useTurnSounds({
    isMyTurn: !!soundData && soundData.phase === 'claim' && soundData.currentClaimantId === soundUserId,
    lastMoveSignature: soundData ? `${soundData.currentRound}:${othersActed}` : null,
    opponentMoved: othersActed > 0,
    enabled: !isSpectator && !!soundData,
  })

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
  const maxPlayers = lobby?.maxPlayers ?? 12
  const isFinished = resolvedStatus === 'finished'
  const isPlaying = resolvedStatus === 'playing' && !!data
  const phase = isPlaying ? data!.phase : undefined
  const isEliminated = data?.eliminatedPlayerIds.includes(currentUserId) ?? false
  const eliminatedRound = isEliminated ? data?.eliminatedAtRound[currentUserId] ?? null : undefined

  const playerByUserId = new Map(players.filter(p => !!p.userId).map(p => [p.userId, p]))
  const nameOf = (pid: string) => playerNameById(players, pid, t)
  const avatarOf = (pid: string) => playerByUserId.get(pid)?.user?.avatarUrl ?? playerByUserId.get(pid)?.user?.image ?? null
  const premiumOf = (pid: string) => !!playerByUserId.get(pid)?.user?.isPremium

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

  const claimantId = data?.currentClaimantId ?? ''
  const claimantName = nameOf(claimantId)
  const isClaimant = !isSpectator && isPlaying && claimantId === currentUserId
  const winnerId = data?.winnerId ?? ''
  const winnerName = nameOf(winnerId)
  const iWon = !isSpectator && !!winnerId && winnerId === currentUserId
  const finishedMessage = iWon ? t('liarsParty.youWin') : t('liarsParty.wins', { name: winnerName })

  // ─── Header ───────────────────────────────────────────────────────────────
  // Two seats out of up to twelve, so they are the two that matter to this
  // viewer: whoever holds the floor (the winner once it is over, the host
  // before it starts), and the viewer themselves. A viewer who IS the featured
  // seat – or a spectator, who is nobody – gets the leader in the other card,
  // so the row never shows the same person twice and never shows an empty card.
  // The whole roster lives in the players panel; this row is the glance.
  const featuredId = isFinished ? winnerId : isPlaying ? claimantId : (lobby?.creatorId ?? '')
  const contenderIds = players
    .map(p => p.userId)
    .filter(id => !!id && id !== featuredId)
    .sort((a, b) => (data?.scores[b] ?? 0) - (data?.scores[a] ?? 0))
  const mySeatId = !isSpectator && currentUserId && currentUserId !== featuredId
    ? currentUserId
    : contenderIds[0] ?? ''

  // Tagged with the round it was written in, so the next round starts clean
  // without an effect that would clear it one render late.
  const activeClaimDraft: LiarsClaimDraft = claimDraft.round === (data?.currentRound ?? 0)
    ? claimDraft
    : { round: data?.currentRound ?? 0, text: '', isBluff: null }

  const hasVoted = !!data?.challengeVotes.some(v => v.playerId === currentUserId)
  const seatCard = (id: string, side: 'left' | 'right', isActive: boolean) => (
    <GamePlayerCard
      name={id ? nameOf(id) : '–'}
      isActive={isActive}
      isMe={!isSpectator && !!currentUserId && id === currentUserId}
      isWinner={isFinished && !!id && id === winnerId}
      side={side}
      avatarSrc={id ? avatarOf(id) : null}
      isPremium={id ? premiumOf(id) : false}
      accentColor={side === 'left' ? LIARS_PARTY_ACCENT : 'var(--bd-coral)'}
      turnDotColor="var(--bd-mint-deep)"
      subline={t('liarsParty.points', { count: id ? (data?.scores[id] ?? 0) : 0 })}
    />
  )

  const phaseLabel = isFinished
    ? t('lobby.game.gameOver')
    : phase === 'claim'
      ? t('liarsParty.phaseClaim')
      : phase === 'challenge'
        ? t('liarsParty.phaseVote')
        : phase === 'reveal'
          ? t('liarsParty.phaseReveal')
          : t('liarsParty.phaseWaiting')
  const counterKicker = isPlaying || isFinished ? t('game.ui.round') : t('game.ui.tabPlayers')
  const counterValue = isPlaying || isFinished
    ? `${data!.currentRound}/${data!.maxRounds}`
    : `${players.length}/${maxPlayers}`

  const roomCardProps = {
    gameId: 'liars-party',
    title: t('liarsParty.name'),
    code,
    isSpectator,
    leaveLabel: t('game.ui.leave'),
    allowSpectators: !!lobby?.allowSpectators,
    onLeave: requestLeave,
  }
  // Leave lives in this card's own GameLeaveButton, top-right of the grid's
  // first row, which is where the layout DoD puts it and where Tic-Tac-Toe,
  // Connect Four and RPS already have it. That is why GameScoreboardHeader is
  // given no `trailing` here: a second Leave would be the duplicate the ticket
  // warned about, not a second placement.
  const roomSection = <GameRoomCard {...roomCardProps} />
  const roomSectionCompact = <GameRoomCard {...roomCardProps} compact />

  const headerSection = (
    <div className="ttt-card liars-header-card">
      <div className="liars-header-card__mark" aria-hidden><Icon name="mask" size={96} /></div>
      <GameScoreboardHeader
        leftCard={seatCard(featuredId, 'left', isPlaying && phase === 'claim')}
        center={
          <>
            <div className="liars-counter__kicker">{counterKicker}</div>
            <div className="liars-counter__value">{counterValue}</div>
            <div className="liars-counter__kicker">{phaseLabel}</div>
          </>
        }
        centerCompact={<div className="liars-counter__value">{counterValue}</div>}
        rightCard={seatCard(mySeatId, 'right', isPlaying && phase === 'challenge' && !!mySeatId && !hasVoted)}
      />
    </div>
  )

  /** The one status line, in the one place every game puts it (layout DoD). */
  const statusSection = isFinished ? (
    <GameStatusBanner
      isFinished
      finishedMessage={finishedMessage}
      activeTitle={finishedMessage}
      secs={0}
      turnTimerLimit={turnTimerSeconds}
      barColor={LIARS_PARTY_ACCENT}
      isSpectator={isSpectator}
    />
  ) : isPlaying && phase !== 'reveal' ? (
    <GameStatusBanner
      isFinished={false}
      activeTitle={
        phase === 'claim'
          ? (isClaimant ? t('liarsParty.yourTurnToClaim') : t('liarsParty.isClaimingFor', { name: claimantName }))
          : t('liarsParty.challengeOrBelieve')
      }
      // No `meta`. GameStatusBanner puts it on the title's nowrap/ellipsis
      // line, and the peer pages pass 2 to 4 characters there (connect four
      // "#12", rps "1/2", sketch "3/5"); a sentence-length "Round 4 / 10"
      // overflowed that line by 71px at 320x720 and 51px at 844x390 measured
      // in a live round, so the parent's `overflow: hidden` cut the round away
      // and truncated the title as well. The round is the header's own counter
      // one block above, under the ROUND kicker, on every viewport - layout
      // DoD item 5: do not show the same signal twice.
      secs={timerRemaining}
      turnTimerLimit={turnTimerSeconds}
      barColor={LIARS_PARTY_ACCENT}
      leadingIcon={<Icon name="mask" size={20} />}
      isSpectator={isSpectator}
      isYourTurn={
        phase === 'claim'
          ? isClaimant
          : !isSpectator && !isEliminated && !isClaimant && !hasVoted
      }
    />
  ) : null
  // Reveal has no clock – it waits on a click – and the waiting room has
  // nothing on one either, so neither gets a countdown bar that would be
  // decoration. The region under the header is the phase card in both cases,
  // which is full, so this is not an empty region.

  // ─── Phase card ───────────────────────────────────────────────────────────
  // `phaseAction` is what the viewer can press, and it is rendered OUTSIDE the
  // scrolling region: measured at 390 on the reveal screen, Next Round sat
  // below a vote breakdown and a history and scrolled out of reach, on the one
  // screen where the game is waiting for exactly that click.
  let phaseTestId = 'liars-party-loading'
  let phaseContent: React.ReactNode = <LoadingSpinner />
  let phaseAction: React.ReactNode = null

  if (resolvedStatus === 'waiting') {
    phaseTestId = 'liars-party-waiting-room'
    phaseContent = <WaitingContent data={data} rules={rules} t={t} />
    phaseAction = !isSpectator && isHost ? (
      <>
        <button
          onClick={handleStartGame}
          disabled={isStarting || players.length < minPlayersRequired}
          className="bd-btn bd-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isStarting ? t('common.loading') : t('liarsParty.startGame')}
        </button>
        {players.length < minPlayersRequired && (
          <p className="text-xs text-bd-ink-muted">{t('liarsParty.needMorePlayers')}</p>
        )}
      </>
    ) : (
      <p className="text-sm text-bd-ink-soft">{t('liarsParty.waitingForPlayers')}</p>
    )
  } else if (isPlaying && phase === 'claim') {
    phaseTestId = isEliminated ? 'liars-party-eliminated-claim-screen' : 'liars-party-claim-screen'
    phaseContent = (
      <ClaimContent
        data={data!}
        players={players}
        rules={rules}
        isClaimant={isClaimant && !isEliminated}
        eliminatedRound={eliminatedRound}
        draft={activeClaimDraft}
        onDraftChange={setClaimDraft}
        isMoveSubmitting={isMoveSubmitting}
        onSubmitClaim={(claim, isBluff) => handleMove('submit-claim', { claim, isBluff })}
        t={t}
      />
    )
  } else if (isPlaying && phase === 'challenge') {
    phaseTestId = isEliminated ? 'liars-party-eliminated-challenge-screen' : 'liars-party-challenge-screen'
    phaseContent = (
      <ChallengeContent
        data={data!}
        players={players}
        rules={rules}
        currentUserId={currentUserId}
        isClaimant={isClaimant}
        eliminatedRound={eliminatedRound}
        t={t}
      />
    )
    if (!isSpectator && canVoteNow(data!, currentUserId, isClaimant, eliminatedRound)) {
      phaseAction = (
        <div className="liars-choice-row" data-testid="liars-vote-buttons">
          <button
            onClick={() => handleMove('submit-challenge', { decision: 'challenge' })}
            disabled={isMoveSubmitting}
            className="bd-btn bd-btn-coral liars-choice disabled:opacity-50"
          >
            {t('liarsParty.challenge')}
          </button>
          <button
            onClick={() => handleMove('submit-challenge', { decision: 'believe' })}
            disabled={isMoveSubmitting}
            className="bd-btn liars-choice liars-choice--believe disabled:opacity-50"
          >
            {t('liarsParty.believe')}
          </button>
        </div>
      )
    }
  } else if (isPlaying && phase === 'reveal') {
    phaseTestId = 'liars-party-reveal-screen'
    phaseContent = <RevealContent data={data!} players={players} rules={rules} t={t} />
    // Open to every player, not just the host – the engine's validateMove for
    // advance-round has no player-ownership check (any known player can legally
    // advance). Gating this to isHost made the game permanently soft-lock for
    // everyone else whenever the host didn't click through. See #642.
    phaseAction = !isSpectator ? (
      <button
        onClick={() => handleMove('advance-round', {})}
        disabled={isMoveSubmitting}
        className="bd-btn bd-btn-primary disabled:opacity-50"
      >
        {data!.currentRound >= data!.maxRounds ? t('liarsParty.seeResults') : t('liarsParty.nextRound')}
      </button>
    ) : null
  } else if (isFinished && data) {
    phaseTestId = 'liars-party-game-over-screen'
    phaseContent = <FinishedContent data={data} players={players} winnerName={winnerName} t={t} />
  }

  const showResultOverlay = isFinished && !!data && !isSpectator && !overlayInspecting

  const renderPhaseSection = (treeTestId: string) => (
    // One phase id per layout tree. All three trees are in the DOM at once and
    // CSS picks one, so a single shared id would match three nodes.
    <div className="liars-phase-card" data-testid={`${phaseTestId}-${treeTestId}`}>
      <div className="liars-phase">{phaseContent}</div>
      {phaseAction && <div className="liars-phase-action">{phaseAction}</div>}
      {showResultOverlay && (
        <GameResultOverlay
          title={finishedMessage}
          kicker={t('lobby.game.gameOver')}
          accentColor={LIARS_PARTY_ACCENT}
          accentShadowColor={LIARS_PARTY_ACCENT_DEEP}
          icon={
            <div className="liars-overlay-icon" style={{ background: iWon ? LIARS_PARTY_ACCENT_DEEP : LIARS_PARTY_ACCENT }}>
              <Icon name={iWon ? 'trophy' : 'mask'} size={28} tone="on-accent" />
            </div>
          }
          onInspect={() => setOverlayInspecting(true)}
          isHost={isHost}
          isLoading={isStarting}
          onPlayAgain={handleStartGame}
          onReturnToLobby={handleReturnToWaiting}
          onLeave={() => setShowLeaveConfirmModal(true)}
          isGuest={isGuest}
          registerUrl={`/auth/register?returnUrl=${encodeURIComponent(`/lobby/${code}`)}`}
          inviteCode={code}
          gameType="liars_party"
          resultKey={`${game?.id}:${data?.finishedAt ?? lastMoveAt ?? ''}`}
          isRegistered={status === 'authenticated' && !isGuest}
        />
      )}
      {isFinished && !isSpectator && overlayInspecting && (
        <button onClick={() => setOverlayInspecting(false)} className="liars-show-results">
          {t('games.tictactoe.game.showResults')}
        </button>
      )}
    </div>
  )

  const playersSection = (
    <LiarsPlayersPanel data={data} players={players} maxPlayers={maxPlayers} currentUserId={currentUserId} isFinished={isFinished} t={t} />
  )

  const chatPlayerProfiles = new Map<string, { avatarUrl?: string | null; isPremium?: boolean }>()
  for (const p of players) {
    if (p.userId) chatPlayerProfiles.set(p.userId, { avatarUrl: p.user?.avatarUrl ?? p.user?.image ?? null, isPremium: !!p.user?.isPremium })
  }

  // No muted seat here, unlike Sketch & Guess: the claimant's advantage in this
  // game IS talking – selling a bluff or a truth is the move – so silencing
  // them would remove the game rather than protect it.
  const chatSection = (
    <section className="game-chat-panel">
      <Chat
        messages={chatMessages}
        onSendMessage={sendChatMessage}
        currentUserId={currentUserId || null}
        playerProfiles={chatPlayerProfiles}
        isMinimized={false}
        onToggleMinimize={() => {}}
        unreadCount={chatUnreadCount}
        someoneTyping={someoneTyping}
        fullScreen
        readOnly={isSpectator}
      />
    </section>
  )

  const showReactions = !isSpectator && resolvedStatus === 'playing'

  return (
    <div className="game-screen liars-screen" style={getThemePageStyle(lobby?.theme)} data-testid={phaseTestId}>

      {/* ── DESKTOP ─────────────────────────────────────────────────── */}
      <div className="ttt-desktop-layout">
        <div className="ttt-grid">
          {headerSection}
          {roomSection}
          <div className="ttt-center-col">
            {statusSection}
            {renderPhaseSection('desktop')}
          </div>
          <div className="ttt-right-col">
            {playersSection}
            {chatSection}
          </div>
        </div>
      </div>

      {/* ── PHONE LANDSCAPE ─────────────────────────────────────────── */}
      {/* Sketch & Guess had to leave its scores unreachable in this tree and
          wrote down the answer it could not afford: make the side column's
          flexible region a tab strip. Here that is affordable, because the
          board column holds a card of text rather than a canvas, and it is
          needed - a vote in this game is decided on the strike count. Two tabs,
          not three: the phase already owns the left column.
          Measured first as a split board column (phase 321, panel 185): the
          seat names came out as "F.." and "G..", and five seats left 120px of
          empty card under them. */}
      <div className="game-landscape-layout">
        <div className="game-landscape-board">
          {renderPhaseSection('landscape')}
        </div>
        <div className="game-landscape-side">
          <div className="ttt-top-row">{headerSection}{roomSectionCompact}</div>
          {statusSection}
          <GameTabs
            tabs={[
              { id: 'players' as const, label: t('game.ui.tabPlayers') },
              { id: 'chat' as const, label: t('game.ui.tabChat'), badge: chatUnreadCount },
            ]}
            activeTab={mobileTab === 'chat' ? 'chat' : 'players'}
            onTabChange={(id) => {
              setMobileTab(id)
              if (id === 'chat') resetChatUnread()
            }}
          />
          {mobileTab === 'chat' ? chatSection : playersSection}
        </div>
      </div>

      {/* ── MOBILE ──────────────────────────────────────────────────── */}
      <div className="ttt-mobile-layout">
        <div className="ttt-top-row">{headerSection}{roomSectionCompact}</div>
        {statusSection}
        <GameTabs
          tabs={[
            { id: 'game' as const, label: t('liarsParty.tabGame') },
            { id: 'players' as const, label: t('game.ui.tabPlayers') },
            { id: 'chat' as const, label: t('game.ui.tabChat'), badge: chatUnreadCount },
          ]}
          activeTab={mobileTab}
          onTabChange={(id) => {
            setMobileTab(id)
            if (id === 'chat') resetChatUnread()
          }}
        />
        <div className="ttt-mobile-content">
          {mobileTab === 'game' && renderPhaseSection('mobile')}
          {mobileTab === 'players' && playersSection}
          {mobileTab === 'chat' && chatSection}
        </div>
      </div>

      {/* ── MODALS ──────────────────────────────────────────────────── */}
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
    </div>
  )
}
