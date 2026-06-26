'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useTranslation } from '@/lib/i18n-helpers'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { clientLogger } from '@/lib/client-logger'
import { showToast } from '@/lib/i18n-toast'
import { useRealtimeConnection } from '@/app/lobby/[code]/hooks/useRealtimeConnection'
import type { ChatMessagePayload, GameUpdatePayload } from '@/types/game'
import { finalizePendingLobbyCreateMetric } from '@/lib/lobby-create-metrics'
import { trackMoveSubmitApplied } from '@/lib/analytics'
import LoadingSpinner from '@/components/LoadingSpinner'
import { ReactionOverlay } from '@/components/ReactionOverlay'
import { AliasGame, type AliasGameData } from '@/lib/games/alias'
import { sounds } from '@/lib/sounds'
import { getThemePageStyle } from '@/lib/lobby-themes'
import GuestConversionNudge from '@/components/GuestConversionNudge'

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
}

interface GuessMessage {
  id: number
  userId: string
  username: string
  text: string
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
    height: 'calc(100dvh - 4rem)',
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
      aria-label={`${remaining} seconds remaining`}
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
        <BdLabel style={{ fontSize: 10 }}>seconds</BdLabel>
      </div>
    </div>
  )
}

const ScorePill: React.FC<{ kind: 'guessed' | 'skipped'; count: number }> = ({ kind, count }) => {
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
      <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>{ok ? '✓' : '✗'}</span>
      <span>{ok ? '+' : '−'}{count}</span>
      <span style={{ fontSize: 11, opacity: 0.7, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
        {ok ? 'guessed' : 'skipped'}
      </span>
    </span>
  )
}

const GameContextBar: React.FC<{ code: string; title?: string; right?: React.ReactNode }> = ({ code, title = 'Alias', right }) => (
  <header style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '4px 4px 12px', maxWidth: 1200, margin: '0 auto',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{
        width: 38, height: 38, borderRadius: 12,
        background: 'var(--bd-ink)',
        display: 'grid', placeItems: 'center',
        boxShadow: '0 3px 0 var(--bd-coral)',
        flexShrink: 0,
      }}>
        <span style={{ fontFamily: FONT_DISPLAY, color: 'var(--bd-bg)', fontWeight: 700, fontSize: 20, lineHeight: 1 }}>B</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <BdLabel>Boardly · word game</BdLabel>
        <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 22, lineHeight: 1 }}>{title}</span>
      </div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {right}
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: 'var(--bd-bg2)', border: '1.5px solid var(--bd-line)',
        borderRadius: 999, padding: '6px 12px',
        fontFamily: FONT_MONO,
        fontSize: 13, fontWeight: 600,
      }}>
        <span style={{ fontSize: 10, color: 'var(--bd-ink-muted)' }}>LOBBY</span>
        <span style={{ color: 'var(--bd-ink)' }}>{code}</span>
      </span>
    </div>
  </header>
)

// Guess chat panel — shown on describer + guesser screens
function GuessChatPanel({ guesses, guessInput, onInputChange, onSend, onKeyDown, canType, endRef, currentUserId, isMobile }: {
  guesses: GuessMessage[]
  guessInput: string
  onInputChange: (v: string) => void
  onSend: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
  canType: boolean
  endRef: React.RefObject<HTMLDivElement | null>
  currentUserId: string | null | undefined
  isMobile?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div style={{
      ...cardBase,
      display: 'flex', flexDirection: 'column',
      width: isMobile ? '100%' : 280, minWidth: 0, maxWidth: isMobile ? '100%' : 280,
      height: isMobile ? 220 : '100%', maxHeight: isMobile ? 220 : 560,
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
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Live timer
  const [remaining, setRemaining] = useState(0)

  // Guess chat
  const [guesses, setGuesses] = useState<GuessMessage[]>([])
  const [guessInput, setGuessInput] = useState('')
  const guessesEndRef = useRef<HTMLDivElement | null>(null)

  const lifecycleRedirectInFlightRef = React.useRef(false)
  const activeGameIdRef = React.useRef<string | null>(null)
  const winSoundPlayedForRef = React.useRef<string | null>(null)
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
          config: { maxPlayers: 16, minPlayers: 4 },
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
    const tick = () => {
      const elapsed = Math.floor((Date.now() - turnStartedAt) / 1000)
      const r = Math.max(0, turnTimerSeconds - elapsed)
      setRemaining(r)
      if (r === 0) {
        clearInterval(id)
        void loadLobby()
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
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
    const ready = players.length >= 4

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
            <BdLabel style={{ color: accentDeep }}>{side === 'left' ? 'Team 01' : 'Team 02'}</BdLabel>
            <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 30 }}>{name}</span>
          </div>
          <span style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600, color: 'var(--bd-ink-muted)' }}>
            {list.length} {list.length === 1 ? 'player' : 'players'}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.length === 0 && (
            <div style={{
              padding: '20px 16px', border: `1.5px dashed ${accent}`, borderRadius: 14,
              color: 'var(--bd-ink-muted)', fontSize: 13, textAlign: 'center',
              background: 'rgba(255,255,255,0.4)',
            }}>Waiting for players…</div>
          )}
          {list.map((p, i) => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '8px 12px 8px 8px', borderRadius: 999,
              background: 'rgba(255,255,255,0.55)', border: '1.5px solid var(--bd-line)',
            }}>
              <BdAvatar name={p.name} color={i === 0 ? accent : undefined} />
              <span style={{ fontWeight: 600, fontSize: 15, color: p.user?.isPremium ? 'var(--bd-premium)' : undefined }}>
                {p.name}
                {p.user?.isPremium && <span style={{ marginLeft: 4, fontSize: 12 }} title="Premium">👑</span>}
                {p.userId === currentUserId && (
                  <span style={{
                    marginLeft: 8, fontSize: 11, fontFamily: FONT_MONO,
                    color: accentDeep, background: 'rgba(255,255,255,0.7)',
                    padding: '2px 8px', borderRadius: 999,
                    border: `1px solid ${accent}`, letterSpacing: '0.08em',
                  }}>YOU</span>
                )}
              </span>
              <span style={{ flex: 1 }} />
              {p.userId === lobby?.creatorId && <span style={{ fontSize: 16 }}>★</span>}
            </div>
          ))}
        </div>
      </div>
    )

    return (
      <div style={pageBg(lobby?.theme)} data-testid="alias-waiting-room">
        <GameContextBar code={code} />
        <main style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{
            display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
            gap: 24, marginBottom: 16, flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 540 }}>
              <BdLabel>Lobby · Pre-game</BdLabel>
              <h1 style={{
                fontFamily: FONT_DISPLAY, fontWeight: 700,
                fontSize: 'clamp(36px, 6vw, 56px)', lineHeight: 1.02, margin: 0, letterSpacing: '-0.02em',
              }}>
                Describe it.<br />
                <span style={{ color: 'var(--bd-coral-deep)' }}>{t('alias.doNotSayItShort')}</span>
              </h1>
              <p style={{ color: 'var(--bd-ink-soft)', fontSize: 16, lineHeight: 1.55, margin: 0, maxWidth: 480 }}>
                Two teams take turns. One player describes, the rest guess.{' '}
                <strong>+1</strong> for every word you nail, <strong>−1</strong> for skips.
              </p>
            </div>
            <div style={{
              ...cardBase, padding: '18px 22px',
              display: 'flex', alignItems: 'center', gap: 18,
              background: 'var(--bd-ink)', borderColor: 'var(--bd-ink)', color: 'var(--bd-bg)',
              boxShadow: '0 6px 0 var(--bd-coral), 0 14px 28px -10px rgba(31,27,22,0.4)',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <BdLabel style={{ color: 'rgba(251,246,238,0.6)' }}>Turn timer</BdLabel>
                <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 32 }}>{turnTimerSeconds}s</span>
              </div>
              <span style={{ width: 1, height: 36, background: 'rgba(251,246,238,0.2)' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <BdLabel style={{ color: 'rgba(251,246,238,0.6)' }}>Min players</BdLabel>
                <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 32 }}>4</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto 1fr', gap: 20, alignItems: 'stretch' }}>
            <TeamCard side="left" name={t('alias.team1')} accent="var(--bd-coral)" accentDeep="var(--bd-coral-deep)" list={team1} />
            {!isMobile && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="bd-float" style={{ fontFamily: FONT_DISPLAY, fontSize: 36, color: 'var(--bd-ink-muted)', fontStyle: 'italic' }}>vs</span>
              </div>
            )}
            <TeamCard side="right" name={t('alias.team2')} accent="var(--bd-lav)" accentDeep="#7A6AE8" list={team2} />
          </div>

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
                  : t('alias.needMorePlayers', { count: Math.max(0, 4 - players.length) })}
              </span>
            </div>
            {isHost ? (
              <button
                style={{ ...primaryBtn, fontSize: 18, padding: '16px 28px' }}
                onClick={handleStartGame}
                disabled={isStarting || !ready}
              >
                {isStarting ? 'Starting…' : 'Pick Teams'}
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
        </main>
      </div>
    )
  }

  // ── PHASE 1 — Team assignment ──────────────────────────────────────────────
  if (data.phase === 'team_assignment') {
    const TEAM_ACCENTS = ['var(--bd-coral)', 'var(--bd-lav)']
    const TEAM_ACCENTS_DEEP = ['var(--bd-coral-deep)', '#7A6AE8']

    const myTeamId = data.teams.find(t => t.playerIds.includes(currentUserId ?? ''))?.id

    const getPlayerName = (userId: string) =>
      players.find(p => p.userId === userId)?.name ?? userId.slice(0, 8)

    const teamsValid = data.teams.every(t => t.playerIds.length >= 1)

    const renderTeamCard = (team: (typeof data.teams)[0], i: number) => {
      const accent = TEAM_ACCENTS[i] ?? 'var(--bd-lav)'
      const accentDeep = TEAM_ACCENTS_DEEP[i] ?? '#7A6AE8'
      const isMyTeam = myTeamId === team.id
      return (
        <div key={team.id} style={{
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
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <BdLabel style={{ color: accentDeep }}>{`Team 0${i + 1}`}</BdLabel>
              <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 28, marginTop: 4 }}>
                {team.name}
              </div>
            </div>
            <span style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600, color: 'var(--bd-ink-muted)' }}>
              {team.playerIds.length} {team.playerIds.length === 1 ? 'player' : 'players'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, minHeight: 60 }}>
            {team.playerIds.length === 0 && (
              <div style={{
                padding: '16px', border: `1.5px dashed ${accent}`, borderRadius: 12,
                color: 'var(--bd-ink-muted)', fontSize: 13, textAlign: 'center',
              }}>Empty — be the first</div>
            )}
            {team.playerIds.map(pid => {
              const name = getPlayerName(pid)
              const isYou = pid === currentUserId
              const isPremiumPlayer = !!players.find(p => p.userId === pid)?.user?.isPremium
              return (
                <div key={pid} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', borderRadius: 999,
                  background: 'rgba(255,255,255,0.6)',
                  border: isYou ? `1.5px solid ${accent}` : '1.5px solid var(--bd-line)',
                }}>
                  <BdAvatar name={name} color={isYou ? accent : undefined} size={32} />
                  <span style={{ fontWeight: 600, fontSize: 14, color: isPremiumPlayer ? 'var(--bd-premium)' : undefined }}>
                    {name}
                    {isPremiumPlayer && <span style={{ marginLeft: 4, fontSize: 12 }} title="Premium">👑</span>}
                  </span>
                  {isYou && (
                    <span style={{
                      marginLeft: 'auto', fontSize: 10, fontFamily: FONT_MONO,
                      color: accentDeep, background: 'rgba(255,255,255,0.8)',
                      padding: '2px 7px', borderRadius: 999, border: `1px solid ${accent}`,
                    }}>YOU</span>
                  )}
                  {players.find(p => p.userId === pid)?.userId === lobby?.creatorId && (
                    <span style={{ marginLeft: isMyTeam ? 0 : 'auto', fontSize: 14 }}>★</span>
                  )}
                </div>
              )
            })}
          </div>

          {myTeamId !== team.id ? (
            <button
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
              Join {team.name}
            </button>
          ) : (
            <div style={{
              width: '100%', textAlign: 'center',
              padding: '12px 16px', borderRadius: 12,
              background: 'rgba(255,255,255,0.5)',
              border: `1.5px solid ${accent}`,
              fontWeight: 600, fontSize: 14,
              color: accentDeep,
            }}>
              ✓ You're on this team
            </div>
          )}
        </div>
      )
    }

    return (
      <div style={{ ...pageBg(lobby?.theme), display: 'flex', flexDirection: 'column' }} data-testid="alias-team-assignment">
        <main style={{ maxWidth: 1100, margin: '0 auto', width: '100%', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingBottom: 24 }}>
          <GameContextBar code={code} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            <BdLabel>Team selection</BdLabel>
            <h1 style={{
              fontFamily: FONT_DISPLAY, fontWeight: 700,
              fontSize: 'clamp(32px, 5vw, 48px)', lineHeight: 1.05, margin: 0,
            }}>
              Choose your side.
            </h1>
            <p style={{ color: 'var(--bd-ink-soft)', fontSize: 15, margin: 0 }}>
              Pick a team — then host starts when everyone's ready.
            </p>
          </div>

          <div className="flex flex-col gap-4 md:flex-row md:gap-5 md:items-start">
            <div className="flex-1 min-w-0">
              {renderTeamCard(data.teams[0], 0)}
            </div>
            <div className="flex items-center justify-center py-1 shrink-0 md:pt-20">
              <span className="bd-float" style={{ fontFamily: FONT_DISPLAY, fontSize: 36, color: 'var(--bd-ink-muted)', fontStyle: 'italic' }}>vs</span>
            </div>
            {data.teams[1] && (
              <div className="flex-1 min-w-0">
                {renderTeamCard(data.teams[1], 1)}
              </div>
            )}
          </div>

          <div style={{
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
                  ? 'Teams ready — host can start.'
                  : 'Each team needs at least 1 player.'}
              </span>
            </div>
            {isHost ? (
              <button
                style={{ ...primaryBtn, fontSize: 18, padding: '16px 28px' }}
                onClick={() => handleMove('start_round', {})}
                disabled={isMoveSubmitting || !teamsValid}
              >
                Start Rounds
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
        </main>
      </div>
    )
  }

  // ── Phases 2-5 helpers ─────────────────────────────────────────────────────
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

  const chatProps = {
    guesses,
    guessInput,
    onInputChange: setGuessInput,
    onSend: sendGuess,
    onKeyDown: handleGuessKeyDown,
    endRef: guessesEndRef,
    currentUserId,
    isMobile,
  }

  // ── PHASE 2 — Describer turn ───────────────────────────────────────────────
  if (data.phase === 'turn_active' && isDescriber) {
    const word = data.currentCard?.[data.currentCardIndex] ?? ''
    return (
      <>
        {!isSpectator && <ReactionOverlay lobbyCode={code} />}
        <div style={{ ...pageBg(lobby?.theme), display: 'flex', flexDirection: 'column' }} data-testid="alias-describer-screen">
          <GameContextBar
            code={code}
            right={
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'rgba(255,255,255,0.7)', border: `1.5px solid ${teamAccent}`,
                borderRadius: 999, padding: '6px 12px', fontSize: 13, fontWeight: 600,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: teamAccent }} />
                {currentTeam?.name}
              </span>
            }
          />
          <main style={{
            maxWidth: 1200, width: '100%', margin: '0 auto', flex: 1, minHeight: 0,
            display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 24, alignItems: 'stretch',
            padding: isMobile ? '0 0 16px' : undefined,
          }}>
            {/* Game content */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
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
              <div style={{
                ...cardBase, width: '100%',
                padding: '32px 40px 28px', minHeight: 180, flex: 1,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 20, position: 'relative', overflow: 'hidden',
              }}>
                <div aria-hidden style={{ position: 'absolute', top: -120, left: -120, width: 280, height: 280, borderRadius: '50%', background: 'rgba(255,107,91,0.10)' }} />
                <div aria-hidden style={{ position: 'absolute', bottom: -120, right: -120, width: 280, height: 280, borderRadius: '50%', background: 'rgba(155,140,255,0.08)' }} />
                <BdLabel>{t('alias.theSecretWord')}</BdLabel>
                <span style={{
                  fontFamily: FONT_DISPLAY, fontWeight: 700,
                  fontSize: 'clamp(48px, 9vw, 84px)',
                  lineHeight: 1.02, textAlign: 'center',
                  color: 'var(--bd-ink)', letterSpacing: '-0.02em',
                  zIndex: 1, wordBreak: 'break-word',
                }}>{word}</span>
                <span style={{ fontSize: 13, color: 'var(--bd-ink-muted)', fontStyle: 'italic', zIndex: 1 }}>
                  {t('alias.doNotSayItFull')}
                </span>
              </div>

              {/* Timer + tally */}
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 28, alignItems: 'center', width: '100%' }}>
                <CountdownRing remaining={remaining} total={turnTimerSeconds} size={140} />
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, width: '100%' }}>
                <button
                  aria-label="Guessed correctly"
                  onClick={() => handleMove('word_action', { action: 'guess' })}
                  disabled={isMoveSubmitting}
                  style={{
                    background: 'var(--bd-mint)', color: '#06322a',
                    border: 'none', borderRadius: 18, padding: '22px 16px', fontSize: 20, fontWeight: 700,
                    cursor: 'pointer', boxShadow: '0 5px 0 var(--bd-mint-deep)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                    opacity: isMoveSubmitting ? 0.5 : 1,
                  }}
                >
                  <span style={{ fontSize: 24, lineHeight: 1 }}>✓</span>
                  {t('alias.guessed')}
                  <span style={{ fontSize: 11, opacity: 0.7, fontFamily: FONT_MONO }}>+1</span>
                </button>
                <button
                  aria-label="Skip word"
                  onClick={() => handleMove('word_action', { action: 'skip' })}
                  disabled={isMoveSubmitting}
                  style={{
                    background: 'var(--bd-sun)', color: '#4a3a09',
                    border: 'none', borderRadius: 18, padding: '22px 16px', fontSize: 20, fontWeight: 700,
                    cursor: 'pointer', boxShadow: '0 5px 0 var(--bd-sun-deep)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                    opacity: isMoveSubmitting ? 0.5 : 1,
                  }}
                >
                  <span style={{ fontSize: 24, lineHeight: 1 }}>✗</span>
                  {t('alias.skip')}
                  <span style={{ fontSize: 11, opacity: 0.7, fontFamily: FONT_MONO }}>−1</span>
                </button>
              </div>

              <button style={linkBtn} onClick={() => handleMove('end_turn', {})}>
                {t('alias.endTurn')}
              </button>
            </div>

            {/* Chat panel — describer sees guesses (read-only) */}
            <GuessChatPanel {...chatProps} canType={false} />
          </main>
        </div>
      </>
    )
  }

  // ── PHASE 3 — Guesser turn ─────────────────────────────────────────────────
  if (data.phase === 'turn_active' && !isDescriber) {
    const describerName = describerPlayer?.name ?? 'Describer'
    return (
      <>
        {!isSpectator && <ReactionOverlay lobbyCode={code} />}
        <div style={{ ...pageBg(lobby?.theme), display: 'flex', flexDirection: 'column' }} data-testid="alias-guesser-screen">
          <GameContextBar
            code={code}
            right={
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'rgba(255,255,255,0.7)', border: `1.5px solid ${teamAccent}`,
                borderRadius: 999, padding: '6px 12px', fontSize: 13, fontWeight: 600,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: teamAccent }} />
                {currentTeam?.name}
              </span>
            }
          />
          <main style={{
            maxWidth: 1200, width: '100%', margin: '0 auto', flex: 1, minHeight: 0,
            display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 24, alignItems: 'stretch',
            padding: isMobile ? '0 0 16px' : undefined,
          }}>
            {/* Game content */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 18px', background: 'rgba(31,27,22,0.06)',
                border: '1.5px solid var(--bd-line)', borderRadius: 999,
              }}>
                {isSpectator
                  ? <BdLabel>{t('alias.spectatingWatch')}</BdLabel>
                  : <BdLabel>{t('alias.listenUp')}</BdLabel>
                }
              </div>

              <div style={{
                ...cardBase, width: '100%',
                padding: '24px 32px 28px', minHeight: 220, flex: 1,
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
                  fontSize: 'clamp(100px, 16vw, 160px)', lineHeight: 1,
                  color: 'var(--bd-coral)', textShadow: '0 6px 0 rgba(31,27,22,0.08)', zIndex: 1,
                }}>?</span>
              </div>

              {/* Timer + tally */}
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 28, alignItems: 'center', width: '100%' }}>
                <CountdownRing remaining={remaining} total={turnTimerSeconds} size={140} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <BdLabel>Live tally</BdLabel>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <ScorePill kind="guessed" count={guessed} />
                    <ScorePill kind="skipped" count={skipped} />
                  </div>
                  {danger && (
                    <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: 'var(--bd-coral-deep)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      ⚡ Final seconds — go go go!
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Chat panel — guessers type here; spectators are read-only */}
            <GuessChatPanel {...chatProps} canType={!isSpectator} />
          </main>
        </div>
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
          <GameContextBar code={code} title={t('alias.turnCompleteTitle')} />
          <main style={{ maxWidth: 980, width: '100%', margin: '0 auto', flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.3fr 1fr', gap: 22, alignItems: 'stretch' }}>
            {/* Word list */}
            <section style={{ ...cardBase, padding: 28, display: 'flex', flexDirection: 'column', alignSelf: 'start' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <BdLabel>{describerPlayer?.name ? t('alias.describerWords', { name: describerPlayer.name }) : t('alias.wordsThisTurn')}</BdLabel>
                  <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 28, margin: 0 }}>
                    {wordResults.length} {wordResults.length === 1 ? 'word' : 'words'}
                  </h2>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <ScorePill kind="guessed" count={guessedCount} />
                  <ScorePill kind="skipped" count={skippedCount} />
                </div>
              </div>
              <div style={{ marginRight: -4, paddingRight: 4 }}>
                {wordResults.length === 0 && (
                  <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--bd-ink-muted)', fontStyle: 'italic' }}>No words played this turn.</div>
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
                      }}>{ok ? '✓' : '✗'}</span>
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
                  <BdLabel style={{ color: positive ? 'rgba(251,246,238,0.7)' : 'var(--bd-ink-muted)' }}>Turn score</BdLabel>
                  <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 56, lineHeight: 1 }}>
                    {scoreDelta >= 0 ? '+' : ''}{scoreDelta}
                  </span>
                </div>
                <span aria-hidden style={{ fontSize: 64, lineHeight: 1, opacity: 0.85 }}>
                  {positive ? '🏆' : scoreDelta === 0 ? '➖' : '💢'}
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
                        background: isActive ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.4)',
                        border: `1.5px solid ${isActive ? accent : 'var(--bd-line)'}`,
                      }}>
                        <span style={{ width: 14, height: 14, borderRadius: 999, background: accent, boxShadow: isActive ? `0 0 0 4px ${i === 0 ? 'rgba(255,107,91,0.2)' : 'rgba(155,140,255,0.2)'}` : 'none' }} />
                        <div>
                          <span style={{ fontWeight: 700, fontSize: 16 }}>{team.name}</span>
                          {isActive && <BdLabel style={{ display: 'block', fontSize: 10 }}>Just played</BdLabel>}
                        </div>
                        <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 32, fontVariantNumeric: 'tabular-nums' }}>{team.score}</span>
                      </div>
                    )
                  })}
                </div>
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--bd-line)', fontFamily: FONT_MONO, fontSize: 11, color: 'var(--bd-ink-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'center' }}>
                  3 turns per team · most points wins
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
                  ⏳ Waiting for {nextTeam?.name ?? 'next team'} to start their turn…
                </div>
              ))}
              <button style={{ ...linkBtn, textAlign: 'center' }} onClick={() => router.push('/games')}>
                {t('lobby.game.leaveGame')}
              </button>
            </section>
          </main>
        </div>
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

        <GameContextBar code={code} title={t('alias.finalTitle')} />
        <main style={{ maxWidth: 880, margin: '40px auto 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32, position: 'relative', zIndex: 2 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <BdLabel>{isTie ? 'No winner' : 'Champions'}</BdLabel>
            <h1 style={{
              fontFamily: FONT_DISPLAY, fontWeight: 700,
              fontSize: 'clamp(56px, 10vw, 96px)',
              lineHeight: 0.98, textAlign: 'center', letterSpacing: '-0.025em', margin: 0,
            }}>
              {isTie ? (
                <>It's a <span style={{ color: 'var(--bd-sun-deep)' }}>tie</span>.</>
              ) : (
                <><span style={{ color: 'var(--bd-coral-deep)' }}>{winner?.name}</span><br /><span style={{ fontStyle: 'italic', fontWeight: 400 }}>wins.</span></>
              )}
            </h1>
            <p style={{ fontSize: 16, color: 'var(--bd-ink-soft)', textAlign: 'center', maxWidth: 460, margin: 0 }}>
              {isTie ? 'Both teams locked in at the same score. Run it back?' : `Sharp tongues, sharper guesses. ${(winner?.name ?? '').split(' ')[0]} took it home.`}
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
                        {isWinner ? '★ Winner' : (isTie ? 'Team' : 'Runner-up')}
                      </BdLabel>
                      <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 30, color: accent, lineHeight: 1.1, marginBottom: 4 }}>{team.name}</div>
                      <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 72, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: 'var(--bd-bg)' }}>{team.score}</div>
                    </div>
                    {i === 0 && <span style={{ fontFamily: FONT_DISPLAY, fontSize: 28, fontStyle: 'italic', color: 'rgba(251,246,238,0.5)' }}>vs</span>}
                  </React.Fragment>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
            {isHost ? (
              <>
                <button style={{ ...primaryBtn, fontSize: 18, padding: '16px 28px' }} onClick={handleStartGame} disabled={isStarting}>
                  {isStarting ? 'Starting…' : t('alias.playAgain')}
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
            <button style={linkBtn} onClick={() => router.push('/games')}>Leave game</button>
          </div>

          {isGuest && (
            <div style={{ width: '100%', maxWidth: 420 }}>
              <GuestConversionNudge registerUrl={`/auth/register?returnUrl=${encodeURIComponent(`/lobby/${code}`)}`} />
            </div>
          )}
        </main>
      </div>
    )
  }

  return (
    <div style={{ ...pageBg(lobby?.theme), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <LoadingSpinner />
    </div>
  )
}
