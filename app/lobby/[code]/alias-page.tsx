'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport'
import LeaveIcon from '@/components/LeaveIcon'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { clientLogger } from '@/lib/client-logger'
import { showToast } from '@/lib/i18n-toast'
import { useRealtimeConnection } from '@/app/lobby/[code]/hooks/useRealtimeConnection'
import { useLeaveLobby } from '@/app/lobby/[code]/hooks/useLeaveLobby'
import { useLobbyHeartbeat } from '@/app/lobby/[code]/hooks/useLobbyHeartbeat'
import type { ChatMessagePayload, GameUpdatePayload } from '@/types/game'
import { finalizePendingLobbyCreateMetric } from '@/lib/lobby-create-metrics'
import { trackMoveSubmitApplied } from '@/lib/analytics'
import LoadingSpinner from '@/components/LoadingSpinner'
import ConfirmModal from '@/components/ConfirmModal'
import { ReactionOverlay } from '@/components/ReactionOverlay'
import { AliasGame, type AliasGameData } from '@/lib/games/alias'
import { sounds } from '@/lib/sounds'
import { getThemePageStyle } from '@/lib/lobby-themes'
import AfterGameActions from '@/components/game-chrome/AfterGameActions'
import GameScoreboardHeader from '@/components/game-chrome/GameScoreboardHeader'
import GamePlayerCard from '@/components/game-chrome/GamePlayerCard'
import GameLeaveButton from '@/components/game-chrome/GameLeaveButton'
import GameStatusBanner from '@/components/game-chrome/GameStatusBanner'
import GameTabs from '@/components/game-chrome/GameTabs'
import TryBotGamesBanner from '@/app/lobby/[code]/components/TryBotGamesBanner'
import { getGameMetadata } from '@/lib/game-catalog'
import { createStuckTurnRecovery } from '@/lib/stuck-turn-recovery'

interface AliasPageProps {
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
}

interface GamePlayer {
  id: string
  userId: string
  name: string
  user?: { username?: string; isPremium?: boolean }
}

interface Game {
  id: string
  status: string
  state: unknown
  players: GamePlayer[]
  createdAt?: string
}

interface GuessMessage {
  id: number
  userId: string
  username: string
  text: string
}

/**
 * Alias drops teams entirely at three players — each of them is their own team,
 * describing in turn while the other two guess (#847). The waiting room has to
 * show that, or it promises a game that will not be played.
 */
function isSoloPlayerCount(playerCount: number): boolean {
  return playerCount === 3
}

function computePreviewTeams(players: GamePlayer[]): { team1: GamePlayer[]; team2: GamePlayer[] } {
  const team1: GamePlayer[] = []
  const team2: GamePlayer[] = []
  players.forEach((p, i) => {
    if (i % 2 === 0) team1.push(p)
    else team2.push(p)
  })
  return { team1, team2 }
}

// ─── Design constants ─────────────────────────────────────────────────────────

/**
 * How long to leave between resync attempts once the Alias turn clock has run out (#1009).
 *
 * Short, because the only thing being waited out is the gap between this
 * device's clock and the server's, not a player who has gone missing.
 */
const TURN_TIMEOUT_RESYNC_INTERVAL_MS = 3_000

const FONT_DISPLAY = 'var(--bd-font-display)'
const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace"

const cardBase: React.CSSProperties = {
  background: 'var(--bd-card-warm)',
  borderRadius: 24,
  border: '1.5px solid var(--bd-line)',
  boxShadow: '0 6px 0 rgba(31,27,22,0.08), 0 14px 28px -10px rgba(31,27,22,0.18)',
}

const primaryBtn: React.CSSProperties = {
  background: 'var(--bd-ink)',
  color: 'var(--bd-bg)',
  border: 'none',
  borderRadius: 14,
  padding: '14px 22px',
  fontWeight: 600,
  fontSize: 16,
  boxShadow: '0 4px 0 var(--bd-coral)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
}

const linkBtn: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--bd-ink-soft)',
  border: 'none',
  textDecoration: 'underline',
  textUnderlineOffset: 4,
  fontWeight: 500,
  fontSize: 14,
  cursor: 'pointer',
  padding: '8px 12px',
}

function pageBg(theme?: string): React.CSSProperties {
  return {
    height: 'var(--game-h)',
    overflowY: 'auto',
    padding: '14px 24px',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
    ...getThemePageStyle(theme),
  }
}

// ─── Design sub-components ────────────────────────────────────────────────────

const BdLabel: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <span style={{
    fontFamily: FONT_MONO,
    fontSize: 11,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'var(--bd-ink-muted)',
    fontWeight: 600,
    ...style,
  }}>
    {children}
  </span>
)

const BdAvatar: React.FC<{ name?: string; color?: string; size?: number }> = ({ name, color, size = 40 }) => (
  <span style={{
    width: size,
    height: size,
    borderRadius: 999,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: size * 0.35,
    color: 'var(--bd-ink)',
    background: color ?? 'var(--bd-bg2)',
    border: `1.5px solid ${color ?? 'var(--bd-line)'}`,
    flexShrink: 0,
  }}>
    {(name?.trim()?.[0] ?? '?').toUpperCase()}
  </span>
)

const CountdownRing: React.FC<{ remaining: number; total: number; size?: number }> = ({ remaining, total, size = 148 }) => {
  const { t } = useTranslation()
  const stroke = 12
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, total > 0 ? remaining / total : 0))
  const danger = remaining <= 10 && remaining > 0
  const mins = Math.floor(remaining / 60)
  const secs = remaining % 60
  const label = mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : String(remaining)
  return (
    <div
      role="timer"
      aria-label={t('alias.secondsRemainingAria', { count: remaining })}
      className={danger ? 'bd-pulse' : undefined}
      style={{ position: 'relative', width: size, height: size }}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(31,27,22,0.08)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={danger ? 'var(--bd-coral)' : 'var(--bd-ink)'}
          strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 200ms ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 2,
      }}>
        <span style={{
          fontFamily: FONT_MONO,
          fontSize: size * 0.32, fontWeight: 700,
          color: danger ? 'var(--bd-coral-deep)' : 'var(--bd-ink)',
          fontVariantNumeric: 'tabular-nums', lineHeight: 1,
        }}>{label}</span>
        <BdLabel style={{ fontSize: 10 }}>{t('alias.secondsLabel')}</BdLabel>
      </div>
    </div>
  )
}

const ScorePill: React.FC<{ kind: 'guessed' | 'skipped'; count: number }> = ({ kind, count }) => {
  const { t } = useTranslation()
  const ok = kind === 'guessed'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '8px 14px', borderRadius: 999,
      background: ok ? 'rgba(79,201,166,0.18)' : 'rgba(255,196,77,0.22)',
      border: `1.5px solid ${ok ? 'rgba(79,201,166,0.45)' : 'rgba(229,168,46,0.45)'}`,
      color: ok ? '#0E5E47' : '#6B4D0E',
      fontFamily: FONT_MONO,
      fontWeight: 700, fontSize: 14, fontVariantNumeric: 'tabular-nums',
    }}>
      <Icon name={ok ? 'check' : 'close'} size={16} />
      <span>{ok ? '+' : '−'}{count}</span>
      <span style={{ fontSize: 11, opacity: 0.7, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
        {ok ? t('alias.tallyGuessed') : t('alias.tallySkipped')}
      </span>
    </span>
  )
}

/**
 * The header on every in-game Alias screen (#905).
 *
 * Alias used to draw its own context bar - a Boardly mark, the lobby code, and
 * Leave as a text link at the bottom of each of the five screens, which is the
 * third place Leave sat in the catalogue. It now composes the shared kit, so
 * Leave is top-right in the trailing slot of GameScoreboardHeader like every
 * other game.
 *
 * The two scoreboard cards are teams, not players: that is what Alias has two
 * of, and it is what the score belongs to. GamePlayerCard takes them as names
 * with a score subline, so nothing about the card had to be special-cased.
 */
const TEAM_ACCENTS = ['var(--bd-coral)', 'var(--bd-lav)', 'var(--bd-mint)']
const TEAM_ACCENTS_DEEP = ['var(--bd-coral-deep)', '#7A6AE8', 'var(--bd-mint-deep)']

/**
 * The pre-game bar (lobby and team selection). Those screens have no score and
 * no turn, so they get no scoreboard - but Leave is in the same corner as on
 * every other screen, which is what #905 is about.
 */
const AliasPregameHeader: React.FC<{
  code: string
  title?: string
  leaveLabel: string
  backToLobbyLabel: string
  onLeave?: () => void
  isSpectator?: boolean
}> = ({ code, title = 'Alias', leaveLabel, backToLobbyLabel, onLeave, isSpectator }) => {
  const { t } = useTranslation()
  return (
    <header className="alias-context-bar" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '4px 4px 12px', maxWidth: 1200, margin: '0 auto', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
        <div className="alias-context-logo" style={{
          width: 38, height: 38, borderRadius: 12,
          background: 'var(--bd-ink)',
          display: 'grid', placeItems: 'center',
          boxShadow: '0 3px 0 var(--bd-coral)',
          flexShrink: 0,
        }}>
          <span style={{ fontFamily: FONT_DISPLAY, color: 'var(--bd-bg)', fontWeight: 700, fontSize: 20, lineHeight: 1 }}>B</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <BdLabel>{t('alias.headerKicker')}</BdLabel>
          <span className="alias-context-title" style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 22, lineHeight: 1 }}>{title}</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'var(--bd-bg2)', border: '1.5px solid var(--bd-line)',
          borderRadius: 999, padding: '6px 12px',
          fontFamily: FONT_MONO,
          fontSize: 13, fontWeight: 600,
        }}>
          <span style={{ fontSize: 10, color: 'var(--bd-ink-muted)' }}>{t('alias.lobbyCodeLabel')}</span>
          <span style={{ color: 'var(--bd-ink)' }}>{code}</span>
        </span>
        {isSpectator
          ? <GameLeaveButton label={backToLobbyLabel} href={`/lobby/${code}`} variant="back" />
          : onLeave
            ? <GameLeaveButton label={leaveLabel} onClick={onLeave} />
            : null}
      </div>
    </header>
  )
}

const AliasGameHeader: React.FC<{
  lobbyCode: string
  /**
   * The two seats, in board order, so they read left-to-right against the score
   * line between them. Alias can run three teams in solo mode; the third has no
   * card, but the score line in the middle carries every team, so no score is
   * ever missing.
   */
  leftTeam?: { name: string; score: number; accent: string; accentDeep: string; isMine?: boolean }
  rightTeam?: { name: string; score: number; accent: string; accentDeep: string; isMine?: boolean }
  /** Index of the team on the clock, or null when nobody is. */
  activeTeamIndex?: number | null
  /** Every team's score, in board order. */
  scores: number[]
  /** Already-translated line above the score (phase name). */
  kicker: string
  leaveLabel: string
  backToLobbyLabel: string
  onLeave?: () => void
  isSpectator?: boolean
}> = ({ lobbyCode, leftTeam, rightTeam, activeTeamIndex = null, scores, kicker, leaveLabel, backToLobbyLabel, onLeave, isSpectator }) => {
  const seat = (team: typeof leftTeam, side: 'left' | 'right', isActive: boolean) => (
    <GamePlayerCard
      name={team?.name ?? '–'}
      isActive={isActive && !!team}
      isMe={!!team?.isMine}
      isWinner={false}
      side={side}
      avatarSrc={null}
      accentColor={team?.accent ?? 'var(--bd-line)'}
      turnDotColor={team?.accentDeep ?? 'var(--bd-ink)'}
      subline={String(team?.score ?? 0)}
    />
  )
  const scoreLine = scores.length > 0
    ? scores.map((value, i) => (
      <React.Fragment key={i}>
        {i > 0 && <span style={{ color: 'var(--bd-ink-muted)', margin: '0 6px' }}>:</span>}
        {value}
      </React.Fragment>
    ))
    : '–'
  return (
    <div className="ttt-card alias-header-card" style={{ background: 'linear-gradient(135deg, var(--bd-card-warm) 0%, rgba(255,107,91,0.10) 100%)', overflow: 'hidden', padding: '12px 16px' }}>
      <div style={{ position: 'absolute', right: -10, top: -14, opacity: 0.12, transform: 'rotate(12deg)', pointerEvents: 'none', lineHeight: 1 }}>
        <Icon name="chat" size={96} />
      </div>
      <GameScoreboardHeader
        leftCard={seat(leftTeam, 'left', activeTeamIndex === 0)}
        center={
          <>
            <div style={{ fontSize: 10, color: 'var(--bd-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: FONT_MONO, marginBottom: 2 }}>
              {kicker}
            </div>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 28, lineHeight: 1, color: 'var(--bd-ink)' }}>{scoreLine}</div>
            <div style={{ fontSize: 9, color: 'var(--bd-ink-muted)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: FONT_MONO }}>
              {lobbyCode}
            </div>
          </>
        }
        centerCompact={
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 22, lineHeight: 1, color: 'var(--bd-ink)' }}>{scoreLine}</div>
        }
        rightCard={seat(rightTeam, 'right', activeTeamIndex === 1)}
        trailing={
          isSpectator
            ? <GameLeaveButton label={backToLobbyLabel} href={`/lobby/${lobbyCode}`} variant="back" />
            : onLeave
              ? <GameLeaveButton label={leaveLabel} onClick={onLeave} />
              : undefined
        }
      />
    </div>
  )
}

// Guess chat panel — shown on describer + guesser screens
function GuessChatPanel({ guesses, guessInput, onInputChange, onSend, onKeyDown, canType, endRef, currentUserId, fillHeight = false }: {
  guesses: GuessMessage[]
  guessInput: string
  onInputChange: (v: string) => void
  onSend: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
  canType: boolean
  endRef: React.RefObject<HTMLDivElement | null>
  currentUserId: string | null | undefined
  /** On its own mobile tab the panel owns the pane; stacked it keeps its 220px. */
  fillHeight?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className={`w-full md:w-[280px] md:max-w-[280px] ${fillHeight ? 'flex-1 min-h-0' : 'h-[220px]'} md:h-full md:max-h-[560px]`} style={{
      ...cardBase,
      display: 'flex', flexDirection: 'column',
      minWidth: 0,
      overflow: 'hidden', flexShrink: 0,
    }}>
      <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--bd-line)' }}>
        <BdLabel>{t('alias.guesses')}</BdLabel>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {guesses.length === 0 && (
          <p style={{ color: 'var(--bd-ink-muted)', fontSize: 13, fontStyle: 'italic', textAlign: 'center', margin: '20px 0' }}>
            {t('alias.noGuessesYet')}
          </p>
        )}
        {guesses.map((g) => {
          const isMe = g.userId === currentUserId
          return (
            <div key={g.id} style={{
              display: 'flex', flexDirection: 'column', gap: 2,
              alignItems: isMe ? 'flex-end' : 'flex-start',
            }}>
              {!isMe && (
                <BdLabel style={{ fontSize: 9, marginLeft: 4 }}>{g.username}</BdLabel>
              )}
              <span style={{
                padding: '7px 12px',
                borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: isMe ? 'var(--bd-ink)' : 'var(--bd-bg2)',
                color: isMe ? 'var(--bd-bg)' : 'var(--bd-ink)',
                fontSize: 14, fontWeight: 500, maxWidth: 220,
                wordBreak: 'break-word',
              }}>
                {g.text}
              </span>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>
      {canType && (
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--bd-line)', display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={guessInput}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('alias.guessPlaceholder')}
            maxLength={80}
            style={{
              flex: 1, background: 'var(--bd-bg2)',
              border: '1.5px solid var(--bd-line)', borderRadius: 10,
              padding: '8px 12px', fontSize: 14, color: 'var(--bd-ink)',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={onSend}
            disabled={!guessInput.trim()}
            style={{
              background: 'var(--bd-ink)', color: 'var(--bd-bg)',
              border: 'none', borderRadius: 10,
              padding: '8px 14px', fontWeight: 600, fontSize: 14,
              cursor: 'pointer',
              opacity: guessInput.trim() ? 1 : 0.4,
            }}
          >→</button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function AliasPage({ code, isSpectator = false, onGameReset }: AliasPageProps) {
  const router = useRouter()
  const { data: session, status } = useSession()
  const { isGuest, guestToken, guestId, guestName } = useGuest()
  const { t } = useTranslation()

  const [loading, setLoading] = useState(true)
  const [lobby, setLobby] = useState<Lobby | null>(null)
  const [game, setGame] = useState<Game | null>(null)
  const [gameEngine, setGameEngine] = useState<AliasGame | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [isMoveSubmitting, setIsMoveSubmitting] = useState(false)
  const isMobile = useIsMobileViewport()
  const [showLeaveConfirmModal, setShowLeaveConfirmModal] = useState(false)
  // Mobile tab for the two turn screens (#905). The describer's guess feed was
  // `hidden md:block`, so on a phone the one player who needs to hear the
  // guesses could not see them at all; the guesser's was stacked under the
  // word card, below the fold. Both now sit behind the shared tab strip.
  //
  // The tab is derived from the role, not stored (#905 review). Both panes are
  // conditionally rendered rather than hidden, so whichever one is off-tab is
  // not in the DOM at all - and a fixed 'word' default put the guesser's only
  // action, the guess input, behind a tab they had to find, under a line
  // reading "Listen up - type your guess in the chat". The describer's surface
  // is the word card and the Correct/Skip buttons; the guesser's is the chat.
  // Tapping the other tab overrides that for the current turn only, so a
  // describer who read the feed last turn does not come back to a screen with
  // no word on it.
  const [turnTabOverride, setTurnTabOverride] = useState<{ turnKey: string; tab: 'word' | 'guesses' } | null>(null)

  // Live timer
  const [remaining, setRemaining] = useState(0)

  // Guess chat
  const [guesses, setGuesses] = useState<GuessMessage[]>([])
  const [guessInput, setGuessInput] = useState('')
  const guessesEndRef = useRef<HTMLDivElement | null>(null)

  // Lives outside the timer effect on purpose: the effect is rebuilt whenever
  // loadLobby is rebuilt, and a recovery rebuilt with it would forget how many
  // times it had already asked and start again from nothing (#1009).
  const turnTimeoutRecoveryRef = React.useRef(
    createStuckTurnRecovery({ minIntervalMs: TURN_TIMEOUT_RESYNC_INTERVAL_MS })
  )

  const lifecycleRedirectInFlightRef = React.useRef(false)
  const activeGameIdRef = React.useRef<string | null>(null)
  const winSoundPlayedForRef = React.useRef<string | null>(null)
  const { isLeavingLobbyRef: isLeavingRef, leaveLobby } = useLeaveLobby(code, 'Alias')
  // Zero-signal disconnect detection (#675) — see tic-tac-toe-page.tsx for why every dedicated page needs its own.
  useLobbyHeartbeat(code, !isSpectator)
  const aliasMetadata = getGameMetadata('alias')
  const minPlayersRequired = aliasMetadata?.minPlayers ?? 4
  const maxPlayersAllowed = aliasMetadata?.maxPlayers ?? 16

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
    const fresh = new AliasGame(gameId)
    fresh.restoreState(authoritativeState as any)
    setGameEngine(fresh)

    if (fresh.isGameFinished() && winSoundPlayedForRef.current !== gameId) {
      const data = fresh.getState().data as AliasGameData
      if (data.winnerId && data.winnerId !== 'tie') {
        const userId = getCurrentUserId()
        const myTeam = data.teams.find(t => userId && t.playerIds.includes(userId))
        if (myTeam && myTeam.id === data.winnerId) {
          winSoundPlayedForRef.current = gameId
          sounds.play('win')
        }
      }
    }

    setGame(prev => {
      if (!prev || prev.id !== gameId) return prev
      return { ...prev, status: fresh.getState().status, state: authoritativeState }
    })
  }, [getCurrentUserId])

  const loadLobby = useCallback(async (attempt = 1) => {
    try {
      const res = await fetchWithGuest(`/api/lobby/${code}?includeFinished=true`)
      const data = await res.json()

      if (res.status === 429 && attempt <= 3) {
        const retryAfterMs = ((data.retryAfter as number | undefined) ?? 2) * 1000
        await new Promise((resolve) => setTimeout(resolve, retryAfterMs))
        return loadLobby(attempt + 1)
      }

      if (!res.ok) {
        clientLogger.error('AliasPage: failed to load lobby', data.error)
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
          const fresh = new AliasGame(activeGame.id)
          fresh.restoreState(parsedState)
          setGameEngine(fresh)
        }
      }

      setLoading(false)
    } catch (err) {
      clientLogger.error('AliasPage: loadLobby error', err)
      showToast.errorFrom(err, 'errors.failedToLoad')
      setLoading(false)
    }
  }, [code, router])

  useEffect(() => {
    activeGameIdRef.current = game?.id ?? null
  }, [game?.id])

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
    clientLogger.log('📡 Alias game abandoned')
    void loadLobby()
    triggerLifecycleRedirect('alias-lifecycle-redirect')
  }, [loadLobby, triggerLifecycleRedirect])

  const handlePlayerLeft = useCallback((payload: { userId: string; username?: string; remainingPlayers?: number; gameTerminal?: boolean }) => {
    clientLogger.log('📡 Alias player left', payload)
    if (payload.username) showToast.info('toast.playerLeft', undefined, { player: payload.username })
    if (!payload.gameTerminal && typeof payload.remainingPlayers === 'number' && payload.remainingPlayers < minPlayersRequired) {
      triggerLifecycleRedirect('alias-lifecycle-redirect')
      return
    }
    void loadLobby()
  }, [loadLobby, triggerLifecycleRedirect, minPlayersRequired])

  const handleChatMessage = useCallback((msg: ChatMessagePayload) => {
    const uid = getCurrentUserId()
    if (msg.userId === uid) return
    const rawId = (msg as unknown as Record<string, unknown>).id
    setGuesses(prev => [...prev.slice(-99), {
      id: typeof rawId === 'number' ? rawId : Date.now(),
      userId: msg.userId,
      username: msg.username ?? 'Player',
      text: msg.message ?? '',
    }])
  }, [getCurrentUserId])

  const handleGameReset = useCallback(() => {
    if (onGameReset) onGameReset()
    else router.push(`/lobby/${code}`)
  }, [code, onGameReset, router])

  const { emitWhenConnected } = useRealtimeConnection({
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
    onChatMessage: handleChatMessage,
    onGameReset: handleGameReset,
  })

  const handleMove = useCallback(async (type: string, payload: Record<string, unknown>) => {
    if (!game || isMoveSubmitting) return
    const userId = getCurrentUserId()
    if (!userId) return

    const move = { type, playerId: userId, data: payload, timestamp: new Date() }

    if (gameEngine) {
      const optimistic = new AliasGame(game.id)
      optimistic.restoreState(gameEngine.getState())
      if (optimistic.validateMove(move)) {
        optimistic.processMove(move)
        setGameEngine(optimistic)
      }
    }

    setIsMoveSubmitting(true)
    const submitStartedAt = Date.now()
    try {
      const res = await fetchWithGuest(`/api/game/${game.id}/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: game.id, move, userId }),
      })

      trackMoveSubmitApplied({ gameType: 'alias', moveType: type, durationMs: Date.now() - submitStartedAt, isGuest, success: res.ok, applied: res.ok, statusCode: res.status, source: 'alias_page' })

      if (res.ok) {
        const result = await res.json()
        const authoritativeState = result?.game?.state
        if (authoritativeState) {
          applyAuthoritativeState(game.id, authoritativeState)
        }
      } else if (res.status === 409) {
        // STATE_CONFLICT: another player's move already advanced the phase; reconcile silently
        await loadLobby()
      } else {
        clientLogger.error('Alias move failed', { type, status: res.status })
        await loadLobby()
      }
    } catch (err) {
      clientLogger.error('Alias handleMove error', err)
      await loadLobby()
    } finally {
      setIsMoveSubmitting(false)
    }
  }, [game, gameEngine, getCurrentUserId, isGuest, isMoveSubmitting, applyAuthoritativeState, loadLobby])

  const handleLeave = useCallback(() => {
    if (isLeavingRef.current) return
    setShowLeaveConfirmModal(false)
    leaveLobby()
    router.push('/games')
  }, [isLeavingRef, leaveLobby, router])

  const handleStartGame = useCallback(async () => {
    if (!lobby?.id || isStarting) return
    setIsStarting(true)
    try {
      const res = await fetchWithGuest('/api/game/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameType: 'alias',
          lobbyId: lobby.id,
          config: { maxPlayers: maxPlayersAllowed, minPlayers: minPlayersRequired },
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

  // ─── Live timer ────────────────────────────────────────────────────────────

  const turnStartedAt = gameEngine?.getState()?.data
    ? (gameEngine.getState().data as AliasGameData).turnStartedAt
    : null
  const gamePhase = gameEngine?.getState()?.data
    ? (gameEngine.getState().data as AliasGameData).phase
    : null
  const turnTimerSeconds = typeof lobby?.turnTimer === 'number' ? lobby.turnTimer : 60

  useEffect(() => {
    if (gamePhase !== 'turn_active' || turnStartedAt === null) {
      setRemaining(0)
      return
    }
    // `id` is declared before `tick` and assigned after: the first tick() call
    // below runs synchronously, and when the turn has already expired it takes
    // the r === 0 branch immediately. Reading a `const id` declared further
    // down would hit the temporal dead zone and throw ReferenceError, killing
    // the page via the error boundary (#770).
    let id: ReturnType<typeof setInterval> | undefined
    // #1009: one poll at zero was one chance. This client decides the deadline
    // has passed with its own clock, and the server re-checks the same deadline
    // against the same turnStartedAt with its own (lib/games/alias.ts), so a
    // device running ahead gets applyTimeoutFallback refused and the state back
    // unchanged - and the deps above are exactly what a refused fallback leaves
    // untouched, so the effect cannot re-run and re-arm itself. Keep asking
    // instead, throttled by the recovery the move-based games use (#989), and
    // stop the countdown once it gives up.
    const tick = () => {
      const elapsed = Math.floor((Date.now() - turnStartedAt) / 1000)
      const r = Math.max(0, turnTimerSeconds - elapsed)
      setRemaining(r)
      if (r > 0) return
      // The server stamps turnStartedAt per turn, so it identifies the turn the
      // attempts are being counted for: a new turn starts the count again.
      const decision = turnTimeoutRecoveryRef.current.decide(String(turnStartedAt), Date.now())
      if (decision === 'resync') void loadLobby()
      else if (decision === 'give-up' && id) clearInterval(id)
    }
    tick()
    id = setInterval(tick, 1000)
    return () => {
      if (id) clearInterval(id)
    }
  }, [gamePhase, turnStartedAt, turnTimerSeconds, loadLobby])

  // ─── Guess chat ────────────────────────────────────────────────────────────

  useEffect(() => {
    guessesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [guesses])

  const sendGuess = useCallback(() => {
    if (!guessInput.trim()) return
    const uid = getCurrentUserId()
    const username = isGuest
      ? (guestName ?? 'Guest')
      : (session?.user as any)?.username ?? session?.user?.name ?? 'Player'
    const id = Date.now()
    emitWhenConnected('chat-message', {
      userId: uid,
      username,
      message: guessInput.trim(),
      type: 'alias-guess',
      id,
      lobbyCode: code,
    })
    setGuesses(prev => [...prev.slice(-99), {
      id,
      userId: uid ?? '',
      username,
      text: guessInput.trim(),
    }])
    setGuessInput('')
  }, [emitWhenConnected, guessInput, getCurrentUserId, isGuest, session, code])

  const handleGuessKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendGuess()
    }
  }, [sendGuess])

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ ...pageBg(lobby?.theme), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LoadingSpinner />
      </div>
    )
  }

  const resolvedStatus = game?.status ?? 'waiting'
  const data = gameEngine?.getState()?.data as AliasGameData | undefined
  const isHost = lobby?.creatorId === getCurrentUserId()
  const players = game?.players ?? []
  const currentUserId = getCurrentUserId()

  // ── PHASE 0 — Lobby (pre-game) ─────────────────────────────────────────────
  if (resolvedStatus === 'waiting' || !data) {
    const { team1, team2 } = computePreviewTeams(players)
    const ready = players.length >= minPlayersRequired

    const TeamCard = ({ side, name, accent, accentDeep, list }: {
      side: 'left' | 'right'
      name: string
      accent: string
      accentDeep: string
      list: GamePlayer[]
    }) => (
      <div style={{ ...cardBase, flex: 1, padding: 28, position: 'relative', overflow: 'hidden', borderTop: `6px solid ${accent}` }}>
        <div aria-hidden style={{
          position: 'absolute', top: -50,
          [side === 'left' ? 'right' : 'left']: -50,
          width: 160, height: 160, borderRadius: '50%',
          background: accent, opacity: 0.08,
        }} />
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <BdLabel style={{ color: accentDeep }}>{t('alias.teamNumbered', { num: side === 'left' ? '01' : '02' })}</BdLabel>
            <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 30 }}>{name}</span>
          </div>
          <span style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600, color: 'var(--bd-ink-muted)' }}>
            {t('alias.playersCount', { count: list.length })}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.length === 0 && (
            <div style={{
              padding: '20px 16px', border: `1.5px dashed ${accent}`, borderRadius: 14,
              color: 'var(--bd-ink-muted)', fontSize: 13, textAlign: 'center',
              background: 'var(--bd-surface-raised)',
            }}>{t('lobby.game.waitingForPlayers')}</div>
          )}
          {list.map((p, i) => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '8px 12px 8px 8px', borderRadius: 999,
              background: 'var(--bd-surface-raised)', border: '1.5px solid var(--bd-line)',
            }}>
              <BdAvatar name={p.name} color={i === 0 ? accent : undefined} />
              <span style={{ fontWeight: 600, fontSize: 15, color: p.user?.isPremium ? 'var(--bd-premium)' : undefined }}>
                {p.name}
                {p.user?.isPremium && <Icon name="crown" size={13} tone="premium" label="Premium" style={{ marginLeft: 4 }} />}
                {p.userId === currentUserId && (
                  <span style={{
                    marginLeft: 8, fontSize: 11, fontFamily: FONT_MONO,
                    color: accentDeep, background: 'var(--bd-surface-raised)',
                    padding: '2px 8px', borderRadius: 999,
                    border: `1px solid ${accent}`, letterSpacing: '0.08em',
                  }}>{t('alias.youBadge')}</span>
                )}
              </span>
              <span style={{ flex: 1 }} />
              {p.userId === lobby?.creatorId && <Icon name="star" size={16} />}
            </div>
          ))}
        </div>
      </div>
    )

    return (
      <div style={pageBg(lobby?.theme)} data-testid="alias-waiting-room">
        <AliasPregameHeader
          code={code}
          leaveLabel={t('game.ui.leave')}
          backToLobbyLabel={t('game.ui.backToLobby')}
          onLeave={() => setShowLeaveConfirmModal(true)}
          isSpectator={isSpectator}
        />
        <main style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{
            display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
            gap: 24, marginBottom: 16, flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 540 }}>
              <BdLabel>{t('alias.pregameKicker')}</BdLabel>
              <h1 style={{
                fontFamily: FONT_DISPLAY, fontWeight: 700,
                fontSize: 'clamp(36px, 6vw, 56px)', lineHeight: 1.02, margin: 0, letterSpacing: '-0.02em',
              }}>
                {t('alias.pregameTitle')}<br />
                <span style={{ color: 'var(--bd-coral-deep)' }}>{t('alias.doNotSayItShort')}</span>
              </h1>
              {/* The scoring rule is one key, ±1 included: a locale has to be
                  able to move the numbers inside its own sentence, which a
                  bolded <strong>+1</strong> spliced into English word order
                  cannot do. */}
              <p style={{ color: 'var(--bd-ink-soft)', fontSize: 16, lineHeight: 1.55, margin: 0, maxWidth: 480 }}>
                {isSoloPlayerCount(players.length)
                  ? t('alias.soloModeSubtitle')
                  : t('alias.pregameSubtitleTeams')}{' '}
                {t('alias.scoringRule')}
              </p>
            </div>
            <div style={{
              ...cardBase, padding: '18px 22px',
              display: 'flex', alignItems: 'center', gap: 18,
              background: 'var(--bd-ink)', borderColor: 'var(--bd-ink)', color: 'var(--bd-bg)',
              boxShadow: '0 6px 0 var(--bd-coral), 0 14px 28px -10px rgba(31,27,22,0.4)',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <BdLabel style={{ color: 'rgba(251,246,238,0.6)' }}>{t('alias.turnTimerLabel')}</BdLabel>
                <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 32 }}>{turnTimerSeconds}s</span>
              </div>
              <span style={{ width: 1, height: 36, background: 'rgba(251,246,238,0.2)' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <BdLabel style={{ color: 'rgba(251,246,238,0.6)' }}>{t('alias.minPlayersLabel')}</BdLabel>
                <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 32 }}>{minPlayersRequired}</span>
              </div>
            </div>
          </div>

          {isSoloPlayerCount(players.length) ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
              {players.map((player, i) => (
                <TeamCard
                  key={player.id}
                  side={i === 0 ? 'left' : 'right'}
                  name={player.name}
                  accent={['var(--bd-coral)', 'var(--bd-lav)', 'var(--bd-mint)'][i] ?? 'var(--bd-lav)'}
                  accentDeep={['var(--bd-coral-deep)', '#7A6AE8', 'var(--bd-mint-deep)'][i] ?? '#7A6AE8'}
                  list={[player]}
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-5 items-stretch">
            <TeamCard side="left" name={t('alias.team1')} accent="var(--bd-coral)" accentDeep="var(--bd-coral-deep)" list={team1} />
            <div className="hidden md:flex items-center justify-center">
              <span className="bd-float" style={{ fontFamily: FONT_DISPLAY, fontSize: 36, color: 'var(--bd-ink-muted)', fontStyle: 'italic' }}>{t('game.ui.vs')}</span>
            </div>
            <TeamCard side="right" name={t('alias.team2')} accent="var(--bd-lav)" accentDeep="#7A6AE8" list={team2} />
            </div>
          )}

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginTop: 20, gap: 16, flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                width: 10, height: 10, borderRadius: 999,
                background: ready ? 'var(--bd-mint)' : 'var(--bd-sun)',
                boxShadow: `0 0 0 4px ${ready ? 'rgba(79,201,166,0.18)' : 'rgba(255,196,77,0.18)'}`,
              }} />
              <span style={{ color: 'var(--bd-ink-soft)', fontSize: 14 }}>
                {ready
                  ? t('alias.allSetReady')
                  : t('alias.needMorePlayers', { count: Math.max(0, minPlayersRequired - players.length) })}
              </span>
            </div>
            {isHost ? (
              <button
                style={{ ...primaryBtn, fontSize: 18, padding: '16px 28px' }}
                onClick={handleStartGame}
                disabled={isStarting || !ready}
              >
                {isStarting ? t('alias.starting') : t('alias.pickTeams')}
                <span aria-hidden style={{ fontSize: 18 }}>→</span>
              </button>
            ) : (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'var(--bd-bg2)', border: '1.5px solid var(--bd-line)',
                borderRadius: 999, padding: '10px 16px',
                fontSize: 14, fontWeight: 600, color: 'var(--bd-ink-soft)',
              }}>
                <span className="bd-float" style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--bd-ink-muted)' }} />
                {t('alias.waitingForHostToStart')}
              </span>
            )}
          </div>

          {/* Alias has no bots by design (#626); when the group hasn't formed,
              suggest bot-ready games instead of waiting forever (#780 — the
              banner never rendered here because Alias skips WaitingRoom). */}
          {!ready && game?.createdAt && (
            <div style={{ marginTop: 20 }}>
              <TryBotGamesBanner waitingSinceMs={new Date(game.createdAt).getTime()} />
            </div>
          )}
        </main>
      </div>
    )
  }

  // ── PHASE 1 — Team assignment ──────────────────────────────────────────────
  if (data.phase === 'team_assignment') {

    // Three players means three teams of one: nobody picks a side, because
    // there are no sides to pick (#847).
    const isSolo = data.teams.length === 3

    const myTeamId = data.teams.find(t => t.playerIds.includes(currentUserId ?? ''))?.id

    const getPlayerName = (userId: string) =>
      players.find(p => p.userId === userId)?.name ?? userId.slice(0, 8)

    const teamsValid = data.teams.every(t => t.playerIds.length >= 1)

    const renderTeamCard = (team: (typeof data.teams)[0], i: number) => {
      const accent = TEAM_ACCENTS[i] ?? 'var(--bd-lav)'
      const accentDeep = TEAM_ACCENTS_DEEP[i] ?? '#7A6AE8'
      const isMyTeam = myTeamId === team.id
      return (
        <div key={team.id} className="alias-team-card" style={{
          ...cardBase, padding: 24,
          borderTop: `6px solid ${accent}`,
          position: 'relative', overflow: 'hidden',
          outline: isMyTeam ? `2px solid ${accent}` : 'none',
          outlineOffset: 2,
        }}>
          <div aria-hidden style={{
            position: 'absolute', top: -40, right: -40,
            width: 140, height: 140, borderRadius: '50%',
            background: accent, opacity: 0.07,
          }} />
          <div className="alias-team-head" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <BdLabel style={{ color: accentDeep }}>{isSolo ? t('alias.soloBadge') : `Team 0${i + 1}`}</BdLabel>
              <div className="alias-team-name" style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 28, marginTop: 4 }}>
                {team.name}
              </div>
            </div>
            <span style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600, color: 'var(--bd-ink-muted)' }}>
              {t('alias.playersCount', { count: team.playerIds.length })}
            </span>
          </div>

          <div className="alias-team-roster" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, minHeight: 60 }}>
            {team.playerIds.length === 0 && (
              <div style={{
                padding: '16px', border: `1.5px dashed ${accent}`, borderRadius: 12,
                color: 'var(--bd-ink-muted)', fontSize: 13, textAlign: 'center',
              }}>{t('alias.emptyTeamCta')}</div>
            )}
            {team.playerIds.map(pid => {
              const name = getPlayerName(pid)
              const isYou = pid === currentUserId
              const isPremiumPlayer = !!players.find(p => p.userId === pid)?.user?.isPremium
              return (
                <div key={pid} className="alias-team-player" style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', borderRadius: 999,
                  background: 'var(--bd-surface-raised)',
                  border: isYou ? `1.5px solid ${accent}` : '1.5px solid var(--bd-line)',
                }}>
                  <BdAvatar name={name} color={isYou ? accent : undefined} size={32} />
                  <span style={{ fontWeight: 600, fontSize: 14, color: isPremiumPlayer ? 'var(--bd-premium)' : undefined }}>
                    {name}
                    {isPremiumPlayer && <Icon name="crown" size={13} tone="premium" label="Premium" style={{ marginLeft: 4 }} />}
                  </span>
                  {isYou && (
                    <span style={{
                      marginLeft: 'auto', fontSize: 10, fontFamily: FONT_MONO,
                      color: accentDeep, background: 'var(--bd-surface-raised)',
                      padding: '2px 7px', borderRadius: 999, border: `1px solid ${accent}`,
                    }}>{t('alias.youBadge')}</span>
                  )}
                  {players.find(p => p.userId === pid)?.userId === lobby?.creatorId && (
                    <Icon name="star" size={14} style={{ marginLeft: isMyTeam ? 0 : 'auto' }} />
                  )}
                </div>
              )
            })}
          </div>

          {isSolo ? null : myTeamId !== team.id ? (
            <button
              className="alias-team-join"
              onClick={() => handleMove('assign_team', { teamId: team.id })}
              disabled={isMoveSubmitting}
              style={{
                width: '100%',
                background: accent, color: 'var(--bd-ink)',
                border: 'none', borderRadius: 12,
                padding: '12px 16px', fontWeight: 700, fontSize: 15,
                cursor: 'pointer',
                boxShadow: `0 3px 0 ${accentDeep}`,
                opacity: isMoveSubmitting ? 0.5 : 1,
              }}
            >
              {t('alias.joinTeam', { team: team.name })}
            </button>
          ) : (
            <div className="alias-team-join" style={{
              // A flex row, not a block: on a block the JSX space between the
              // glyph and the text collapses and the two run together.
              width: '100%', textAlign: 'center',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '12px 16px', borderRadius: 12,
              background: 'var(--bd-surface-raised)',
              border: `1.5px solid ${accent}`,
              fontWeight: 600, fontSize: 14,
              color: accentDeep,
            }}>
              <Icon name="check" size={15} /> {t('alias.onThisTeam')}
            </div>
          )}
        </div>
      )
    }

    return (
      <div className="alias-team-screen" style={{ ...pageBg(lobby?.theme), display: 'flex', flexDirection: 'column' }} data-testid="alias-team-assignment">
        <main className="alias-team-main" style={{ maxWidth: 1100, margin: '0 auto', width: '100%', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingBottom: 24 }}>
          <AliasPregameHeader
            code={code}
            leaveLabel={t('game.ui.leave')}
            backToLobbyLabel={t('game.ui.backToLobby')}
            onLeave={() => setShowLeaveConfirmModal(true)}
            isSpectator={isSpectator}
          />
          <div className="alias-team-hero" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            <BdLabel>{t('alias.teamSelectionKicker')}</BdLabel>
            <h1 style={{
              fontFamily: FONT_DISPLAY, fontWeight: 700,
              fontSize: 'clamp(32px, 5vw, 48px)', lineHeight: 1.05, margin: 0,
            }}>
              {isSolo ? t('alias.soloModeTitle') : t('alias.chooseSideTitle')}
            </h1>
            <p style={{ color: 'var(--bd-ink-soft)', fontSize: 15, margin: 0 }}>
              {isSolo
                ? t('alias.soloModeSubtitle')
                : t('alias.chooseSideSubtitle')}
            </p>
          </div>

          {isSolo ? (
            // No "vs" divider: with three of them there are no two sides to
            // put it between.
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5 md:items-start">
              {data.teams.map((team, i) => (
                <div key={team.id} className="min-w-0">
                  {renderTeamCard(team, i)}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-4 md:flex-row md:gap-5 md:items-start">
              <div className="flex-1 min-w-0">
                {renderTeamCard(data.teams[0], 0)}
              </div>
              <div className="flex items-center justify-center py-1 shrink-0 md:pt-20">
                <span className="bd-float" style={{ fontFamily: FONT_DISPLAY, fontSize: 36, color: 'var(--bd-ink-muted)', fontStyle: 'italic' }}>{t('game.ui.vs')}</span>
              </div>
              {data.teams[1] && (
                <div className="flex-1 min-w-0">
                  {renderTeamCard(data.teams[1], 1)}
                </div>
              )}
            </div>
          )}

          {/* One footer block so phone landscape can size the status row and
              Leave Game together (#901). A plain flex column, which is what
              the two children already laid out as. */}
          <div className="alias-team-footer" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="alias-team-actions" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginTop: 20, gap: 16, flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                width: 10, height: 10, borderRadius: 999,
                background: teamsValid ? 'var(--bd-mint)' : 'var(--bd-sun)',
                boxShadow: `0 0 0 4px ${teamsValid ? 'rgba(79,201,166,0.18)' : 'rgba(255,196,77,0.18)'}`,
              }} />
              <span style={{ color: 'var(--bd-ink-soft)', fontSize: 14 }}>
                {teamsValid
                  ? t('alias.teamsReady')
                  : t('alias.teamsNeedPlayer')}
              </span>
            </div>
            {isHost ? (
              <button
                style={{ ...primaryBtn, fontSize: 18, padding: '16px 28px' }}
                onClick={() => handleMove('start_round', {})}
                disabled={isMoveSubmitting || !teamsValid}
              >
                {t('alias.startRounds')}
                <span aria-hidden>→</span>
              </button>
            ) : (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'var(--bd-bg2)', border: '1.5px solid var(--bd-line)',
                borderRadius: 999, padding: '10px 16px',
                fontSize: 14, fontWeight: 600, color: 'var(--bd-ink-soft)',
              }}>
                <span className="bd-float" style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--bd-ink-muted)' }} />
                {t('alias.waitingForHostToStart')}
              </span>
            )}
          </div>
          </div>
        </main>
        {!isSpectator && (
          <ConfirmModal
            isOpen={showLeaveConfirmModal}
            onClose={() => setShowLeaveConfirmModal(false)}
            onConfirm={handleLeave}
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

  // ── Phases 2-5 helpers ─────────────────────────────────────────────────────
  // data.teams can arrive briefly unset during a realtime reconcile (e.g. a
  // game-reset/switch broadcast landing before the full snapshot) even though
  // phase has already moved past team_assignment — fall back to the same
  // loading state used while data itself is still unset, instead of crashing.
  if (!data.teams || data.teams.length === 0) {
    return (
      <div style={{ ...pageBg(lobby?.theme), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LoadingSpinner />
      </div>
    )
  }

  const currentTeam = data.teams[data.currentTeamIndex]
  const describerId = currentTeam?.playerIds[currentTeam?.describerIndex ?? 0]
  const isDescriber = describerId === currentUserId
  const danger = remaining <= 10 && remaining > 0
  const guessed = data.currentCardResults.filter(r => r.result === 'guessed').length
  const skipped = data.currentCardResults.filter(r => r.result === 'skipped').length
  const teamIndex = data.currentTeamIndex
  const teamAccent = teamIndex === 0 ? 'var(--bd-coral)' : 'var(--bd-lav)'
  const teamAccentDeep = teamIndex === 0 ? 'var(--bd-coral-deep)' : '#7A6AE8'
  const describerPlayer = players.find(p => p.userId === describerId)
  // Guests reach Players with `name` null and their display name on the user
  // row, which is what every other board reads. Alias read only `name`, so the
  // status line came out as " is describing for Team 1".
  const describerDisplayName =
    describerPlayer?.user?.username || describerPlayer?.name || t('game.ui.playerFallback')

  // A turn is one describer's run at one card list, so it changes when the team
  // changes, the describer changes, or the clock restarts. The override is
  // scoped to it by key rather than cleared by an effect, because everything
  // above is below several early returns and a hook here would be conditional.
  const turnKey = `${data.currentTeamIndex}:${describerId ?? ''}:${data.turnStartedAt ?? 0}`
  const turnTab: 'word' | 'guesses' =
    turnTabOverride?.turnKey === turnKey ? turnTabOverride.tab : isDescriber ? 'word' : 'guesses'
  const setTurnTab = (tab: 'word' | 'guesses') => setTurnTabOverride({ turnKey, tab })

  const chatProps = {
    guesses,
    guessInput,
    onInputChange: setGuessInput,
    onSend: sendGuess,
    onKeyDown: handleGuessKeyDown,
    endRef: guessesEndRef,
    currentUserId,
  }

  // ─── Shared chrome (#905) ──────────────────────────────────────────────────
  const myTeamIndex = data.teams.findIndex((team) => team.playerIds.includes(currentUserId ?? ''))
  const asSeat = (index: number) => {
    const team = data.teams[index]
    if (!team) return undefined
    return {
      name: team.name,
      score: team.score,
      accent: TEAM_ACCENTS[index] ?? 'var(--bd-lav)',
      accentDeep: TEAM_ACCENTS_DEEP[index] ?? '#7A6AE8',
      isMine: index === myTeamIndex,
    }
  }
  const teamScores = data.teams.map((team) => team.score)

  // Board order, not "who is up": the score line in the middle is in board
  // order, and cards that reorder under it print Team 2 on the left above
  // `-6 : 6`. Which team is on the clock is the card's active state, and which
  // one is yours is `isMe` - both are on the card already.
  const renderHeader = (kicker: string) => (
    <AliasGameHeader
      lobbyCode={code}
      leftTeam={asSeat(0)}
      rightTeam={asSeat(1)}
      activeTeamIndex={data.phase === 'turn_active' ? teamIndex : null}
      scores={teamScores}
      kicker={kicker}
      leaveLabel={t('game.ui.leave')}
      backToLobbyLabel={t('game.ui.backToLobby')}
      onLeave={() => setShowLeaveConfirmModal(true)}
      isSpectator={isSpectator}
    />
  )

  // ── PHASE 2 — Describer turn ───────────────────────────────────────────────
  if (data.phase === 'turn_active' && isDescriber) {
    const word = data.currentCard?.[data.currentCardIndex] ?? ''
    return (
      <>
        {!isSpectator && <ReactionOverlay lobbyCode={code} />}
        <div style={{ ...pageBg(lobby?.theme), display: 'flex', flexDirection: 'column' }} data-testid="alias-describer-screen">
          {renderHeader(t('alias.phaseTurnKicker'))}
          <div className="alias-status-slot">
          <GameStatusBanner
            isFinished={false}
            activeTitle={t('alias.describerTurnLine', { name: describerDisplayName, team: currentTeam?.name ?? '' })}
            meta={`+${guessed} / −${skipped}`}
            // The countdown ring below is this game's clock, and it is the
            // thing players actually watch; a second timer in the banner would
            // be the same signal twice (layout DoD).
            showTimer={false}
            secs={remaining}
            turnTimerLimit={turnTimerSeconds}
            barColor={teamAccent}
            leadingIcon={<Icon name="chat" size={20} />}
            isSpectator={isSpectator}
            isYourTurn={!isSpectator && isDescriber}
          />
          </div>
          {isMobile && (
            <GameTabs
              tabs={[
                { id: 'word' as const, label: t('game.ui.tabBoard') },
                { id: 'guesses' as const, label: t('alias.guesses') },
              ]}
              activeTab={turnTab}
              onTabChange={setTurnTab}
            />
          )}
          <main style={{ maxWidth: 1200, margin: '0 auto', flex: 1, minHeight: 0 }} className="flex w-full flex-col gap-6 items-stretch md:flex-row md:gap-6 pb-4 md:pb-0">
            {/* Game content */}
            <div style={{ flex: 1, minWidth: 0, display: isMobile && turnTab !== 'word' ? 'none' : 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 18px',
                background: 'rgba(255,107,91,0.10)', border: '1.5px solid rgba(255,107,91,0.35)',
                borderRadius: 999,
              }}>
                <BdLabel style={{ color: teamAccentDeep }}>{t('alias.youAreDescribing')}</BdLabel>
                <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: 'var(--bd-ink-soft)' }}>
                  {t('alias.cardNum', { num: data.currentCardIndex + 1 })}
                </span>
              </div>

              {/* Hero word card */}
              <div className="md:flex-1" style={{
                ...cardBase, width: '100%',
                padding: isMobile ? '20px 24px' : '32px 40px 28px',
                minHeight: isMobile ? 140 : 180,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 20, position: 'relative', overflow: 'hidden',
              }}>
                <div aria-hidden style={{ position: 'absolute', top: -120, left: -120, width: 280, height: 280, borderRadius: '50%', background: 'rgba(255,107,91,0.10)' }} />
                <div aria-hidden style={{ position: 'absolute', bottom: -120, right: -120, width: 280, height: 280, borderRadius: '50%', background: 'rgba(155,140,255,0.08)' }} />
                <BdLabel>{t('alias.theSecretWord')}</BdLabel>
                <span style={{
                  fontFamily: FONT_DISPLAY, fontWeight: 700,
                  fontSize: isMobile ? 'clamp(36px, 10vw, 56px)' : 'clamp(48px, 9vw, 84px)',
                  lineHeight: 1.02, textAlign: 'center',
                  color: 'var(--bd-ink)', letterSpacing: '-0.02em',
                  zIndex: 1, wordBreak: 'break-word',
                }}>{word}</span>
                <span style={{ fontSize: 13, color: 'var(--bd-ink-muted)', fontStyle: 'italic', zIndex: 1 }}>
                  {t('alias.doNotSayItFull')}
                </span>
              </div>

              {/* Timer + tally */}
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: isMobile ? 16 : 28, alignItems: 'center', width: '100%' }}>
                <CountdownRing remaining={remaining} total={turnTimerSeconds} size={isMobile ? 88 : 140} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <BdLabel>{t('alias.thisTurnSoFar')}</BdLabel>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <ScorePill kind="guessed" count={guessed} />
                    <ScorePill kind="skipped" count={skipped} />
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      background: 'var(--bd-ink)', color: 'var(--bd-bg)',
                      borderRadius: 999, padding: '6px 12px',
                      fontFamily: FONT_MONO, fontWeight: 600, fontSize: 13,
                    }}>
                      <span style={{ opacity: 0.6, fontSize: 11 }}>{t('alias.net')}</span>
                      <span style={{ fontSize: 14 }}>{guessed - skipped >= 0 ? '+' : ''}{guessed - skipped}</span>
                    </span>
                  </div>
                  {danger && (
                    <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: 'var(--bd-coral-deep)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      {t('alias.timesRunningOut')}
                    </span>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: isMobile ? 10 : 16, width: '100%' }}>
                <button
                  aria-label={t('alias.guessedCorrectly')}
                  onClick={() => handleMove('word_action', { action: 'guess' })}
                  disabled={isMoveSubmitting}
                  style={{
                    background: 'var(--bd-mint)', color: '#06322a',
                    border: 'none', borderRadius: 18,
                    padding: isMobile ? '16px 12px' : '22px 16px',
                    fontSize: isMobile ? 17 : 20, fontWeight: 700,
                    cursor: 'pointer', boxShadow: '0 5px 0 var(--bd-mint-deep)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                    opacity: isMoveSubmitting ? 0.5 : 1,
                  }}
                >
                  <Icon name="check" size={isMobile ? 20 : 24} />
                  {t('alias.guessed')}
                  <span style={{ fontSize: 11, opacity: 0.7, fontFamily: FONT_MONO }}>+1</span>
                </button>
                <button
                  aria-label={t('alias.skipWord')}
                  onClick={() => handleMove('word_action', { action: 'skip' })}
                  disabled={isMoveSubmitting}
                  style={{
                    background: 'var(--bd-sun)', color: '#4a3a09',
                    border: 'none', borderRadius: 18,
                    padding: isMobile ? '16px 12px' : '22px 16px',
                    fontSize: isMobile ? 17 : 20, fontWeight: 700,
                    cursor: 'pointer', boxShadow: '0 5px 0 var(--bd-sun-deep)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                    opacity: isMoveSubmitting ? 0.5 : 1,
                  }}
                >
                  <Icon name="close" size={isMobile ? 20 : 24} />
                  {t('alias.skip')}
                  <span style={{ fontSize: 11, opacity: 0.7, fontFamily: FONT_MONO }}>−1</span>
                </button>
              </div>

              <button style={linkBtn} onClick={() => handleMove('end_turn', {})}>
                {t('alias.endTurn')}
              </button>
            </div>

            {/* The describer reads the guesses and never types them. On a phone
                it is the Guesses tab; on desktop the right column. */}
            <div
              className={isMobile ? undefined : 'hidden md:block'}
              style={isMobile
                ? { display: turnTab === 'guesses' ? 'flex' : 'none', width: '100%', flex: 1, minHeight: 0 }
                : { width: 280, height: '100%', maxHeight: 560, flexShrink: 0 }}
            >
              <GuessChatPanel {...chatProps} canType={false} fillHeight={isMobile} />
            </div>
          </main>
        </div>
        {!isSpectator && (
          <ConfirmModal
            isOpen={showLeaveConfirmModal}
            onClose={() => setShowLeaveConfirmModal(false)}
            onConfirm={handleLeave}
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

  // ── PHASE 3 — Guesser turn ─────────────────────────────────────────────────
  if (data.phase === 'turn_active' && !isDescriber) {
    const describerName = describerDisplayName
    return (
      <>
        {!isSpectator && <ReactionOverlay lobbyCode={code} />}
        <div style={{ ...pageBg(lobby?.theme), display: 'flex', flexDirection: 'column' }} data-testid="alias-guesser-screen">
          {renderHeader(t('alias.phaseTurnKicker'))}
          <div className="alias-status-slot">
          <GameStatusBanner
            isFinished={false}
            activeTitle={t('alias.describerTurnLine', { name: describerDisplayName, team: currentTeam?.name ?? '' })}
            meta={`+${guessed} / −${skipped}`}
            // The countdown ring below is this game's clock, and it is the
            // thing players actually watch; a second timer in the banner would
            // be the same signal twice (layout DoD).
            showTimer={false}
            secs={remaining}
            turnTimerLimit={turnTimerSeconds}
            barColor={teamAccent}
            leadingIcon={<Icon name="chat" size={20} />}
            isSpectator={isSpectator}
            isYourTurn={!isSpectator && isDescriber}
          />
          </div>
          {isMobile && (
            <GameTabs
              tabs={[
                { id: 'word' as const, label: t('game.ui.tabBoard') },
                { id: 'guesses' as const, label: t('alias.guesses') },
              ]}
              activeTab={turnTab}
              onTabChange={setTurnTab}
            />
          )}
          <main style={{ maxWidth: 1200, margin: '0 auto', flex: 1, minHeight: 0 }} className="flex w-full flex-col gap-6 items-stretch md:flex-row md:gap-6 pb-4 md:pb-0">
            {/* Game content */}
            <div style={{ flex: 1, minWidth: 0, display: isMobile && turnTab !== 'word' ? 'none' : 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 18px', background: 'rgba(31,27,22,0.06)',
                border: '1.5px solid var(--bd-line)', borderRadius: 999,
              }}>
                {isSpectator
                  ? <BdLabel>{t('alias.spectatingWatch')}</BdLabel>
                  // "type your guess in the chat" is only true where the chat
                  // is on screen. This pane is the other mobile tab, so there
                  // it names the tab the input is actually on (#905 review).
                  : <BdLabel>{isMobile ? t('alias.listenUpTab') : t('alias.listenUp')}</BdLabel>
                }
              </div>

              <div className="md:flex-1" style={{
                ...cardBase, width: '100%',
                padding: isMobile ? '16px 20px' : '24px 32px 28px',
                minHeight: isMobile ? 160 : 220,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 20, position: 'relative', overflow: 'hidden',
              }}>
                <div aria-hidden style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
                  {[0, 0.6, 1.2].map((d, i) => (
                    <span key={i} style={{
                      position: 'absolute', width: 220, height: 220, borderRadius: '50%',
                      border: '2px solid rgba(255,107,91,0.35)',
                      animation: 'bd-listening 2.4s ease-out infinite',
                      animationDelay: `${d}s`,
                    }} />
                  ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, zIndex: 1 }}>
                  <BdLabel>{t('alias.describer')}</BdLabel>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <BdAvatar name={describerName} color={teamAccent} />
                    <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 26 }}>{describerName}</span>
                  </div>
                </div>

                <span className="bd-float" style={{
                  fontFamily: FONT_DISPLAY, fontWeight: 700,
                  fontSize: isMobile ? 'clamp(72px, 20vw, 100px)' : 'clamp(100px, 16vw, 160px)',
                  lineHeight: 1,
                  color: 'var(--bd-coral)', textShadow: '0 6px 0 rgba(31,27,22,0.08)', zIndex: 1,
                }}>?</span>
              </div>

              {/* Timer + tally */}
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: isMobile ? 16 : 28, alignItems: 'center', width: '100%' }}>
                <CountdownRing remaining={remaining} total={turnTimerSeconds} size={isMobile ? 88 : 140} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <BdLabel>{t('alias.liveTally')}</BdLabel>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <ScorePill kind="guessed" count={guessed} />
                    <ScorePill kind="skipped" count={skipped} />
                  </div>
                  {danger && (
                    <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: 'var(--bd-coral-deep)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      <Icon name="bolt" size={12} /> {t('alias.finalSeconds')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Guessers type here; spectators are read-only. Right column on
                desktop, the Guesses tab on a phone. */}
            {(!isMobile || turnTab === 'guesses') && (
              <GuessChatPanel {...chatProps} canType={!isSpectator} fillHeight={isMobile} />
            )}
          </main>
        </div>
        {!isSpectator && (
          <ConfirmModal
            isOpen={showLeaveConfirmModal}
            onClose={() => setShowLeaveConfirmModal(false)}
            onConfirm={handleLeave}
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

  // ── PHASE 4 — Turn results ─────────────────────────────────────────────────
  if (data.phase === 'turn_results' && data.lastTurnResult) {
    const result = data.lastTurnResult
    const wordResults = result.wordResults
    const scoreDelta = result.scoreDelta
    const positive = scoreDelta >= 0
    const guessedCount = wordResults.filter(w => w.result === 'guessed').length
    const skippedCount = wordResults.filter(w => w.result === 'skipped').length
    const justPlayedTeamId = result.teamId
    const nextTeamIdx = (data.currentTeamIndex + 1) % data.teams.length
    const nextTeam = data.teams[nextTeamIdx]
    const isNextTeamPlayer = !!nextTeam?.playerIds.includes(currentUserId ?? '')

    return (
      <>
        {!isSpectator && <ReactionOverlay lobbyCode={code} />}
        <div style={{ ...pageBg(lobby?.theme), display: 'flex', flexDirection: 'column' }} data-testid="alias-turn-results-screen">
          {renderHeader(t('alias.turnCompleteTitle'))}
          <main style={{ maxWidth: 980, margin: '0 auto', flex: 1, minHeight: 0 }} className="grid w-full grid-cols-1 md:grid-cols-[1.3fr_1fr] gap-5 items-stretch">
            {/* Word list */}
            <section style={{ ...cardBase, display: 'flex', flexDirection: 'column', alignSelf: 'start' }} className="p-4 md:p-7">
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <BdLabel>{describerPlayer?.name ? t('alias.describerWords', { name: describerPlayer.name }) : t('alias.wordsThisTurn')}</BdLabel>
                  <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: isMobile ? 22 : 28, margin: 0 }}>
                    {t('alias.wordsCount', { count: wordResults.length })}
                  </h2>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <ScorePill kind="guessed" count={guessedCount} />
                  <ScorePill kind="skipped" count={skippedCount} />
                </div>
              </div>
              <div style={{ marginRight: -4, paddingRight: 4 }}>
                {wordResults.length === 0 && (
                  <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--bd-ink-muted)', fontStyle: 'italic' }}>{t('alias.noWordsThisTurn')}</div>
                )}
                {wordResults.map((w, i) => {
                  const ok = w.result === 'guessed'
                  return (
                    <div key={i} style={{
                      display: 'grid', gridTemplateColumns: '28px 1fr auto', alignItems: 'center', gap: 12,
                      padding: '12px 16px', borderRadius: 12,
                      background: ok ? 'rgba(79,201,166,0.12)' : 'rgba(255,196,77,0.12)',
                      border: `1px solid ${ok ? 'rgba(79,201,166,0.35)' : 'rgba(229,168,46,0.35)'}`,
                      marginTop: i === 0 ? 0 : 6,
                    }}>
                      <span style={{
                        width: 28, height: 28, borderRadius: 999,
                        background: ok ? 'var(--bd-mint)' : 'var(--bd-sun)',
                        display: 'grid', placeItems: 'center',
                        fontSize: 14, fontWeight: 800,
                        color: ok ? '#06322a' : '#4a3a09',
                        boxShadow: `0 2px 0 ${ok ? 'var(--bd-mint-deep)' : 'var(--bd-sun-deep)'}`,
                      }}>{ok ? <Icon name="check" size={14} /> : <Icon name="close" size={14} />}</span>
                      <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 20, color: 'var(--bd-ink)', textDecoration: ok ? 'none' : 'line-through', textDecorationColor: 'rgba(31,27,22,0.4)' }}>
                        {w.word}
                      </span>
                      <span style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700, color: ok ? 'var(--bd-mint-deep)' : 'var(--bd-sun-deep)' }}>
                        {ok ? '+1' : '−1'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* Right column */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: 18, alignSelf: 'start' }}>
              <div style={{
                ...cardBase, padding: 24,
                background: positive ? 'var(--bd-ink)' : 'var(--bd-card-warm)',
                borderColor: positive ? 'var(--bd-ink)' : 'var(--bd-line)',
                color: positive ? 'var(--bd-bg)' : 'var(--bd-ink)',
                boxShadow: positive ? '0 6px 0 var(--bd-mint), 0 14px 28px -10px rgba(31,27,22,0.3)' : '0 6px 0 var(--bd-sun), 0 14px 28px -10px rgba(31,27,22,0.18)',
                display: 'flex', alignItems: 'center', gap: 18,
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  <BdLabel style={{ color: positive ? 'rgba(251,246,238,0.7)' : 'var(--bd-ink-muted)' }}>{t('alias.turnScoreLabel')}</BdLabel>
                  <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: isMobile ? 40 : 56, lineHeight: 1 }}>
                    {scoreDelta >= 0 ? '+' : ''}{scoreDelta}
                  </span>
                </div>
                <span aria-hidden style={{ lineHeight: 1, opacity: 0.85 }}>
                  <Icon name={positive ? 'trophy' : scoreDelta === 0 ? 'minus' : 'warning'} size={64} />
                </span>
              </div>

              <div style={{ ...cardBase, padding: 22 }}>
                <BdLabel style={{ marginBottom: 12 }}>{t('alias.scores')}</BdLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                  {data.teams.map((team, i) => {
                    const accent = i === 0 ? 'var(--bd-coral)' : 'var(--bd-lav)'
                    const isActive = team.id === justPlayedTeamId
                    return (
                      <div key={team.id} style={{
                        display: 'grid', gridTemplateColumns: '14px 1fr auto', alignItems: 'center', gap: 14,
                        padding: '12px 14px', borderRadius: 14,
                        background: isActive ? 'var(--bd-surface-raised)' : 'var(--bd-surface-raised)',
                        border: `1.5px solid ${isActive ? accent : 'var(--bd-line)'}`,
                      }}>
                        <span style={{ width: 14, height: 14, borderRadius: 999, background: accent, boxShadow: isActive ? `0 0 0 4px ${i === 0 ? 'rgba(255,107,91,0.2)' : 'rgba(155,140,255,0.2)'}` : 'none' }} />
                        <div>
                          <span style={{ fontWeight: 700, fontSize: 16 }}>{team.name}</span>
                          {isActive && <BdLabel style={{ display: 'block', fontSize: 10 }}>{t('alias.justPlayed')}</BdLabel>}
                        </div>
                        <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: isMobile ? 22 : 32, fontVariantNumeric: 'tabular-nums' }}>{team.score}</span>
                      </div>
                    )
                  })}
                </div>
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--bd-line)', fontFamily: FONT_MONO, fontSize: 11, color: 'var(--bd-ink-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'center' }}>
                  {t('alias.formatNote')}
                </div>
              </div>

              {/* Next Turn restricted to the team whose turn is next (#666) */}
              {!isSpectator && (isNextTeamPlayer ? (
                <button
                  style={{ ...primaryBtn, fontSize: 17, padding: '16px 22px', width: '100%', justifyContent: 'center' }}
                  onClick={() => handleMove('next_turn', {})}
                  disabled={isMoveSubmitting}
                >
                  {t('alias.nextTurn')}
                  <span aria-hidden style={{ fontSize: 18 }}>→</span>
                </button>
              ) : (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: 'var(--bd-bg2)', border: '1.5px solid var(--bd-line)',
                  borderRadius: 14, padding: '16px 22px',
                  fontSize: 15, fontWeight: 600, color: 'var(--bd-ink-soft)',
                }}>
                  <Icon name="hourglass" size={16} /> {t('alias.waitingForTeamTurn', { team: nextTeam?.name ?? t('alias.nextTeamFallback') })}
                </div>
              ))}
            </section>
          </main>
        </div>
        {!isSpectator && (
          <ConfirmModal
            isOpen={showLeaveConfirmModal}
            onClose={() => setShowLeaveConfirmModal(false)}
            onConfirm={handleLeave}
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

  // ── PHASE 5 — Game over ────────────────────────────────────────────────────
  if (data.phase === 'game_over') {
    const isTie = data.winnerId === 'tie' || data.winnerId === null
    const winner = data.teams.find(t => t.id === data.winnerId)
    const sorted = [...data.teams].sort((a, b) => b.score - a.score)

    const confetti = Array.from({ length: 36 }, (_, i) => {
      const seed = (i * 9301 + 49297) % 233280
      const rand = (n: number) => ((seed * (n + 1)) % 233280) / 233280
      const colors = ['var(--bd-coral)', 'var(--bd-mint)', 'var(--bd-sun)', 'var(--bd-lav)', 'var(--bd-coral-deep)']
      return {
        left: rand(1) * 100, delay: rand(2) * 4, duration: 4 + rand(3) * 4,
        color: colors[i % colors.length],
        w: 8 + Math.floor(rand(4) * 8), h: 12 + Math.floor(rand(5) * 8), rounded: rand(6) > 0.5,
      }
    })

    return (
      <div data-testid="alias-game-over-screen" style={{
        ...pageBg(lobby?.theme), background: 'linear-gradient(135deg, #FFE9DD 0%, #FBF6EE 50%, #EFE6FF 100%)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          {confetti.map((p, i) => (
            <span key={i} style={{
              position: 'absolute', top: -20, left: `${p.left}%`,
              width: p.w, height: p.h, background: p.color,
              borderRadius: p.rounded ? '50%' : 2,
              animation: `bd-confetti-fall ${p.duration}s linear infinite`,
              animationDelay: `${p.delay}s`,
            }} />
          ))}
        </div>

        {renderHeader(t('alias.finalTitle'))}
        <main style={{ maxWidth: 880, margin: '40px auto 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32, position: 'relative', zIndex: 2 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <BdLabel>{isTie ? t('alias.noWinnerLabel') : t('alias.championsLabel')}</BdLabel>
            <h1 style={{
              fontFamily: FONT_DISPLAY, fontWeight: 700,
              fontSize: 'clamp(56px, 10vw, 96px)',
              lineHeight: 0.98, textAlign: 'center', letterSpacing: '-0.025em', margin: 0,
            }}>
              {isTie ? (
                t('alias.tie')
              ) : (
                /* Two nodes rather than one interpolated sentence: the winner's
                   name is the display line and the verb is the italic line under
                   it. Subject then verb is the order in all four locales, and
                   the <br /> is layout, not grammar. */
                <><span style={{ color: 'var(--bd-coral-deep)' }}>{winner?.name}</span><br /><span style={{ fontStyle: 'italic', fontWeight: 400 }}>{t('alias.winsWord')}</span></>
              )}
            </h1>
            <p style={{ fontSize: 16, color: 'var(--bd-ink-soft)', textAlign: 'center', maxWidth: 460, margin: 0 }}>
              {isTie
                ? t('alias.tieSubtitle')
                : t('alias.winnerSubtitle', { name: (winner?.name ?? '').split(' ')[0] })}
            </p>
          </div>

          <div style={{ ...cardBase, width: '100%', padding: 28, background: 'var(--bd-ink)', borderColor: 'var(--bd-ink)', color: 'var(--bd-bg)', boxShadow: '0 8px 0 var(--bd-coral), 0 18px 36px -12px rgba(31,27,22,0.5)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 24, alignItems: 'center' }}>
              {sorted.map((team, i) => {
                const isWinner = !isTie && team.id === data.winnerId
                const teamIdx = data.teams.findIndex(x => x.id === team.id)
                const accent = teamIdx === 0 ? 'var(--bd-coral)' : 'var(--bd-lav)'
                return (
                  <React.Fragment key={team.id}>
                    <div style={{ textAlign: i === 0 ? 'right' : 'left', opacity: isTie ? 1 : (isWinner ? 1 : 0.55) }}>
                      <BdLabel style={{ color: 'rgba(251,246,238,0.6)', display: 'block', marginBottom: 6 }}>
                        {isWinner
                          ? <><Icon name="star" size={12} /> {t('lobby.game.winner')}</>
                          : (isTie ? t('alias.teamLabel') : t('alias.runnerUpLabel'))}
                      </BdLabel>
                      <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 30, color: accent, lineHeight: 1.1, marginBottom: 4 }}>{team.name}</div>
                      <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 72, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: 'var(--bd-bg)' }}>{team.score}</div>
                    </div>
                    {i === 0 && <span style={{ fontFamily: FONT_DISPLAY, fontSize: 28, fontStyle: 'italic', color: 'rgba(251,246,238,0.5)' }}>{t('game.ui.vs')}</span>}
                  </React.Fragment>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
            {isHost ? (
              <>
                <button style={{ ...primaryBtn, fontSize: 18, padding: '16px 28px' }} onClick={handleStartGame} disabled={isStarting}>
                  {isStarting ? t('alias.starting') : t('alias.playAgain')}
                  <span aria-hidden style={{ fontSize: 18 }}>↻</span>
                </button>
                <button
                  style={{ padding: '12px 22px', borderRadius: 14, fontWeight: 600, fontSize: 15, background: 'rgba(0,0,0,0.12)', border: '1px solid rgba(0,0,0,0.18)', color: 'var(--bd-ink)', cursor: isStarting ? 'not-allowed' : 'pointer', opacity: isStarting ? 0.65 : 1, fontFamily: 'inherit' }}
                  onClick={handleReturnToWaiting}
                  disabled={isStarting}
                >
                  {t('game.ui.returnToLobby')}
                </button>
              </>
            ) : (
              <div style={{ padding: '10px 18px', borderRadius: 14, fontWeight: 600, fontSize: 14, background: 'rgba(0,0,0,0.08)', border: '1px solid rgba(0,0,0,0.12)', color: 'var(--bd-ink-soft)', fontFamily: 'inherit', textAlign: 'center' }}>
                {t('game.ui.waitingForHost')}
              </div>
            )}
          </div>

          <div style={{ width: '100%', maxWidth: 420 }}>
            <AfterGameActions
              variant="card"
              inviteCode={code}
              gameType="alias"
              isGuest={!isSpectator && isGuest}
              isRegistered={!isSpectator && status === 'authenticated' && !isGuest}
              registerUrl={`/auth/register?returnUrl=${encodeURIComponent(`/lobby/${code}`)}`}
            />
          </div>
        </main>
        <ConfirmModal
          isOpen={showLeaveConfirmModal}
          onClose={() => setShowLeaveConfirmModal(false)}
          onConfirm={handleLeave}
          title={t('game.ui.leave')}
          message={t('game.ui.leaveConfirm')}
          confirmText={t('common.confirm')}
          cancelText={t('common.cancel')}
          variant="danger"
          icon={<LeaveIcon size={28} />}
        />
      </div>
    )
  }

  return (
    <div style={{ ...pageBg(lobby?.theme), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <LoadingSpinner />
    </div>
  )
}
