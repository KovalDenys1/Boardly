'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { io, type Socket } from 'socket.io-client'
import { useTranslation } from 'react-i18next'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { resolveSocketClientAuth } from '@/lib/socket-client-auth'
import { getBrowserSocketUrl } from '@/lib/socket-url'
import { clientLogger } from '@/lib/client-logger'
import { showToast } from '@/lib/i18n-toast'
import { finalizePendingLobbyCreateMetric } from '@/lib/lobby-create-metrics'
import { trackMoveSubmitApplied } from '@/lib/analytics'
import LoadingSpinner from '@/components/LoadingSpinner'
import { ReactionOverlay } from '@/components/ReactionOverlay'
import { AliasGame, type AliasGameData } from '@/lib/games/alias'

interface AliasPageProps {
  code: string
}

interface Lobby {
  id: string
  code: string
  gameType: string
  creatorId: string
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

function computePreviewTeams(players: GamePlayer[]): { team1: GamePlayer[]; team2: GamePlayer[] } {
  const team1: GamePlayer[] = []
  const team2: GamePlayer[] = []
  players.forEach((p, i) => {
    if (i % 2 === 0) team1.push(p)
    else team2.push(p)
  })
  return { team1, team2 }
}

export default function AliasPage({ code }: AliasPageProps) {
  const router = useRouter()
  const { data: session, status } = useSession()
  const { isGuest, guestToken, guestId } = useGuest()
  const { t } = useTranslation()

  const [loading, setLoading] = useState(true)
  const [lobby, setLobby] = useState<Lobby | null>(null)
  const [game, setGame] = useState<Game | null>(null)
  const [gameEngine, setGameEngine] = useState<AliasGame | null>(null)
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [isMoveSubmitting, setIsMoveSubmitting] = useState(false)

  const lifecycleRedirectInFlightRef = React.useRef(false)
  const activeGameIdRef = React.useRef<string | null>(null)
  const minPlayersRequired = 4 // Alias requires at least 4 players (2 per team)

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
    if (status === 'loading' || (status === 'unauthenticated' && !isGuest)) return
    if (isGuest && !guestToken) return

    let isMounted = true
    let activeSocket: Socket | null = null

    void loadLobby()

    const initSocket = async () => {
      const url = getBrowserSocketUrl()
      const useGuestAuth = isGuest && status !== 'authenticated'
      const socketAuth = await resolveSocketClientAuth({
        isGuest: useGuestAuth,
        guestToken: useGuestAuth ? guestToken : null,
      })

      if (!socketAuth || !isMounted) return

      const newSocket = io(url, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        auth: socketAuth.authPayload,
        query: socketAuth.queryPayload,
      })
      activeSocket = newSocket

      newSocket.on('connect', () => {
        clientLogger.log('✅ Alias socket connected')
        newSocket.emit('join-lobby', code)
      })

      newSocket.on('game-update', (payload: Record<string, unknown>) => {
        const activeGameId = activeGameIdRef.current
        if (payload?.action === 'state-change' && activeGameId) {
          const state = (payload?.payload as Record<string, unknown>)?.state
          if (state) {
            applyAuthoritativeState(activeGameId, state)
            return
          }
        }
        void loadLobby()
      })

      newSocket.on('game-abandoned', (payload: { gameId: string; reason?: string }) => {
        clientLogger.log('📡 Alias game abandoned', payload)
        void loadLobby()
        triggerLifecycleRedirect('alias-lifecycle-redirect')
      })

      newSocket.on('player-left', (payload: { userId: string; username?: string; remainingPlayers?: number }) => {
        clientLogger.log('📡 Alias player left', payload)
        const name = payload.username
        if (name) showToast.info('toast.playerLeft', undefined, { player: name })
        if (typeof payload.remainingPlayers === 'number' && payload.remainingPlayers < minPlayersRequired) {
          triggerLifecycleRedirect('alias-lifecycle-redirect')
          return
        }
        void loadLobby()
      })

      newSocket.on('lobby-update', () => void loadLobby())
      newSocket.on('player-joined', () => void loadLobby())

      newSocket.on('disconnect', () => {
        clientLogger.log('❌ Alias socket disconnected')
      })

      setSocket(newSocket)
    }

    void initSocket()

    return () => {
      isMounted = false
      if (activeSocket) {
        if (activeSocket.connected) {
          activeSocket.emit('leave-lobby', code)
        }
        activeSocket.disconnect()
      }
    }
  }, [status, isGuest, guestToken, code, loadLobby, applyAuthoritativeState, triggerLifecycleRedirect, minPlayersRequired])

  const handleMove = useCallback(async (type: string, payload: Record<string, unknown>) => {
    if (!game || isMoveSubmitting) return
    const userId = getCurrentUserId()
    if (!userId) return

    const move = { type, playerId: userId, data: payload, timestamp: new Date() }

    // Optimistic update
    if (gameEngine) {
      const optimistic = new AliasGame(game.id)
      optimistic.restoreState(gameEngine.getState())
      if (optimistic.validateMove(move)) {
        optimistic.processMove(move)
        setGameEngine(optimistic)
      }
    }

    setIsMoveSubmitting(true)
    try {
      const res = await fetchWithGuest(`/api/game/${game.id}/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: game.id, move, userId }),
      })

      trackMoveSubmitApplied({ gameType: 'alias', moveType: type, durationMs: 0, isGuest, success: res.ok, applied: res.ok, statusCode: res.status, source: 'alias_page' })

      if (res.ok) {
        const result = await res.json()
        const authoritativeState = result?.game?.state
        if (authoritativeState) {
          applyAuthoritativeState(game.id, authoritativeState)
        }
      } else {
        clientLogger.error('Alias move failed', { type })
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

  if (loading) {
    return (
      <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-gradient-to-br from-orange-50 via-rose-50/50 to-pink-50/30 dark:from-slate-900 dark:via-orange-950/10 dark:to-pink-950/10">
        <LoadingSpinner />
      </div>
    )
  }

  const resolvedStatus = game?.status ?? 'waiting'
  const data = gameEngine?.getState()?.data as AliasGameData | undefined
  const isHost = lobby?.creatorId === getCurrentUserId()
  const players = game?.players ?? []

  // Waiting room — client-side team preview
  if (resolvedStatus === 'waiting' || !data || data.phase === 'team_assignment') {
    const { team1, team2 } = computePreviewTeams(players)
    return (
      <div className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-8 p-4 bg-gradient-to-br from-orange-50 via-rose-50/50 to-pink-50/30 dark:from-slate-900 dark:via-orange-950/10 dark:to-pink-950/10" data-testid="alias-waiting-room">
        <h1 className="text-3xl font-bold">{t('games.alias.name')}</h1>
        <div className="flex gap-4 sm:gap-8">
          <div className="flex min-w-[80px] sm:min-w-[120px] flex-col gap-2 rounded-xl border p-3 sm:p-4">
            <h2 className="text-center font-semibold">{t('alias.team1')}</h2>
            {team1.map(p => <div key={p.id} className="text-center text-sm truncate max-w-[100px] sm:max-w-[140px]">{p.name}</div>)}
          </div>
          <div className="flex min-w-[80px] sm:min-w-[120px] flex-col gap-2 rounded-xl border p-3 sm:p-4">
            <h2 className="text-center font-semibold">{t('alias.team2')}</h2>
            {team2.map(p => <div key={p.id} className="text-center text-sm truncate max-w-[100px] sm:max-w-[140px]">{p.name}</div>)}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{t('alias.teamPreviewNote')}</p>
        {isHost && (
          <button
            onClick={handleStartGame}
            disabled={isStarting || players.length < 4}
            className="rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground disabled:opacity-50"
          >
            {isStarting ? t('common.loading') : t('lobby.startGame')}
          </button>
        )}
        {!isHost && <p className="text-sm text-muted-foreground">{t('lobby.waitingForHost')}</p>}
        <button onClick={() => router.push('/games')} className="text-sm text-muted-foreground underline">
          {t('lobby.leave')}
        </button>
      </div>
    )
  }

  if (data.phase === 'turn_active') {
    const currentTeam = data.teams[data.currentTeamIndex]
    const describerId = currentTeam.playerIds[currentTeam.describerIndex]
    const isDescriber = describerId === getCurrentUserId()
    const turnTimerSeconds = typeof lobby?.turnTimer === 'number' ? lobby.turnTimer : 60
    const elapsed = data.turnStartedAt ? Math.floor((Date.now() - data.turnStartedAt) / 1000) : 0
    const remaining = Math.max(0, turnTimerSeconds - elapsed)
    const guessed = data.currentCardResults.filter(r => r.result === 'guessed').length
    const skipped = data.currentCardResults.filter(r => r.result === 'skipped').length

    if (isDescriber) {
      return (
        <>
          {socket && <ReactionOverlay socket={socket} lobbyCode={code} />}
          <div className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-6 p-4 bg-gradient-to-br from-orange-50 via-rose-50/50 to-pink-50/30 dark:from-slate-900 dark:via-orange-950/10 dark:to-pink-950/10" data-testid="alias-describer-screen">
            <div className="text-sm text-muted-foreground">{t('alias.wordsProgress', { current: data.currentCardIndex, total: 10 })}</div>
            <div className="text-5xl font-bold">{data.currentCard?.[data.currentCardIndex] ?? ''}</div>
            <div className="text-sm">+{guessed} / -{skipped}</div>
            <div className="text-2xl font-mono font-bold">{t('alias.timeLeft', { seconds: remaining })}</div>
            <div className="flex gap-4">
              <button
                onClick={() => handleMove('word_action', { action: 'guess' })}
                disabled={isMoveSubmitting}
                className="rounded-lg bg-green-600 px-6 py-3 font-semibold text-white disabled:opacity-50"
              >
                {t('alias.guessed')}
              </button>
              <button
                onClick={() => handleMove('word_action', { action: 'skip' })}
                disabled={isMoveSubmitting}
                className="rounded-lg bg-yellow-500 px-6 py-3 font-semibold text-white disabled:opacity-50"
              >
                {t('alias.skip')}
              </button>
            </div>
            <button onClick={() => handleMove('end_turn', {})} className="text-sm text-muted-foreground underline">
              {t('alias.endTurn')}
            </button>
          </div>
        </>
      )
    }

    const describerPlayer = players.find(p => p.userId === describerId)
    return (
      <>
        {socket && <ReactionOverlay socket={socket} lobbyCode={code} />}
        <div className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-6 p-4 bg-gradient-to-br from-orange-50 via-rose-50/50 to-pink-50/30 dark:from-slate-900 dark:via-orange-950/10 dark:to-pink-950/10" data-testid="alias-guesser-screen">
          <div className="text-xl font-semibold">{currentTeam.name}</div>
          <div className="text-muted-foreground">{t('alias.isDescribing', { name: describerPlayer?.name ?? describerId })}</div>
          <div className="text-2xl font-mono font-bold">{t('alias.timeLeft', { seconds: remaining })}</div>
          <div className="text-sm">+{guessed} / -{skipped}</div>
          <div className="text-sm text-muted-foreground">{t('alias.wordsProgress', { current: guessed + skipped, total: 10 })}</div>
        </div>
      </>
    )
  }

  if (data.phase === 'turn_results' && data.lastTurnResult) {
    const result = data.lastTurnResult
    return (
      <>
        {socket && <ReactionOverlay socket={socket} lobbyCode={code} />}
        <div className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-6 p-4 bg-gradient-to-br from-orange-50 via-rose-50/50 to-pink-50/30 dark:from-slate-900 dark:via-orange-950/10 dark:to-pink-950/10" data-testid="alias-turn-results-screen">
          <h2 className="text-2xl font-bold">{t('alias.turnResults')}</h2>
          <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
            {result.wordResults.map((r, i) => (
              <div key={i} className="flex gap-3 text-sm">
                <span>{r.result === 'guessed' ? '✓' : '✗'}</span>
                <span>{r.word}</span>
              </div>
            ))}
          </div>
          <div className="text-lg font-semibold">
            {result.scoreDelta >= 0 ? `+${result.scoreDelta}` : result.scoreDelta}
          </div>
          <div className="flex gap-8">
            {data.teams.map(team => (
              <div key={team.id} className="text-center">
                <div className="font-semibold">{team.name}</div>
                <div className="text-3xl font-bold">{team.score}</div>
              </div>
            ))}
          </div>
          {isHost ? (
            <button
              onClick={() => handleMove('next_turn', {})}
              disabled={isMoveSubmitting}
              className="rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground disabled:opacity-50"
            >
              {t('alias.nextTurn')}
            </button>
          ) : (
            <p className="text-sm text-muted-foreground">{t('lobby.waitingForHost')}</p>
          )}
        </div>
      </>
    )
  }

  if (data.phase === 'game_over') {
    const winner = data.teams.find(t => t.id === data.winnerId)
    const winMessage = data.winnerId === 'tie'
      ? t('alias.tie')
      : t('alias.wins', { team: winner?.name ?? '' })
    return (
      <div className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-6 p-4 bg-gradient-to-br from-orange-50 via-rose-50/50 to-pink-50/30 dark:from-slate-900 dark:via-orange-950/10 dark:to-pink-950/10" data-testid="alias-game-over-screen">
        <h2 className="text-4xl font-bold">{winMessage}</h2>
        <div className="flex gap-8">
          {data.teams.map(team => (
            <div key={team.id} className="text-center">
              <div className="font-semibold">{team.name}</div>
              <div className="text-3xl font-bold">{team.score}</div>
            </div>
          ))}
        </div>
        <button
          onClick={handleStartGame}
          disabled={isStarting}
          className="rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground disabled:opacity-50"
        >
          {isStarting ? t('common.loading') : t('alias.playAgain')}
        </button>
        <button onClick={() => router.push('/games')} className="text-sm text-muted-foreground underline">
          {t('lobby.leave')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-gradient-to-br from-orange-50 via-rose-50/50 to-pink-50/30 dark:from-slate-900 dark:via-orange-950/10 dark:to-pink-950/10">
      <LoadingSpinner />
    </div>
  )
}
