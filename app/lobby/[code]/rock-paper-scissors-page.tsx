'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import LeaveIcon from '@/components/LeaveIcon'
import ConfirmModal from '@/components/ConfirmModal'
import Chat from '@/components/Chat'
import { ReactionOverlay } from '@/components/ReactionOverlay'
import GameResultOverlay from '@/components/game-chrome/GameResultOverlay'
import GamePlayerCard from '@/components/game-chrome/GamePlayerCard'
import GameScoreboardHeader from '@/components/game-chrome/GameScoreboardHeader'
import GameStatusBanner from '@/components/game-chrome/GameStatusBanner'
import GameTabs from '@/components/game-chrome/GameTabs'
import GameRoomCard from '@/components/game-chrome/GameRoomCard'
import RockPaperScissorsGameBoard, { CHOICE_LABEL_KEY, getChoiceIcon, WinPips } from '@/components/RockPaperScissorsGameBoard'
import { LobbyPageErrorFallback, LobbyPageLoadingFallback } from '@/app/lobby/[code]/components/LobbyPageFallbacks'
import { useRealtimeConnection } from '@/app/lobby/[code]/hooks/useRealtimeConnection'
import { useLeaveLobby } from '@/app/lobby/[code]/hooks/useLeaveLobby'
import { useLobbyHeartbeat } from '@/app/lobby/[code]/hooks/useLobbyHeartbeat'
import { useGameTimer } from './hooks/useGameTimer'
import { useLobbyChat, useLobbyChatHistory } from './hooks/useLobbyChat'
import { RockPaperScissorsGameData, RPSChoice } from '@/lib/games/rock-paper-scissors-game'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import { showToast } from '@/lib/i18n-toast'
import { clientLogger } from '@/lib/client-logger'
import { getThemePageStyle } from '@/lib/lobby-themes'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { normalizeLobbySnapshotResponse } from '@/lib/lobby-snapshot'
import { finalizePendingLobbyCreateMetric } from '@/lib/lobby-create-metrics'
import { trackLobbyLeaveRedirect, trackMoveSubmitApplied } from '@/lib/analytics'
import { resolveLifecycleRedirectReason } from '@/lib/lobby-lifecycle'
import { getLobbyPlayerRequirements } from '@/lib/lobby-player-requirements'
import type { GamePlayer, GameUpdatePayload } from '@/types/game'
import { createFreshnessWatermark, decideFreshness, resetFreshnessWatermark } from '@/lib/game-state-freshness'
import { isLobbyGoneStatus } from '@/lib/lobby-fetch-status'
import { createStuckTurnRecovery, turnSignatureOf } from '@/lib/stuck-turn-recovery'
import { useTurnSounds } from '@/hooks/useTurnSounds'

// ─── Types ────────────────────────────────────────────────────────────────────

type RpsLifecycleStatus = 'waiting' | 'playing' | 'finished' | 'abandoned' | 'cancelled'

interface Lobby {
    id: string
    code: string
    gameType: string
    creatorId: string | null
    name?: string
    isActive?: boolean
    turnTimer?: number
    theme?: string
    allowSpectators?: boolean
}

/** The engine state as the API returns it, narrowed to what this page reads. */
interface RpsState {
    status: RpsLifecycleStatus
    currentPlayerIndex: number
    lastMoveAt: number | null
    players: Array<{ id: string; name: string }>
    data: RockPaperScissorsGameData
}

interface RpsGame {
    id: string
    status: RpsLifecycleStatus
    players: GamePlayer[]
    state: RpsState
}

interface RockPaperScissorsLobbyPageProps {
    code: string
    isSpectator?: boolean
    onGameReset?: () => void
}

const LEAVE_REDIRECT_FALLBACK_MS = 1500
const LIFECYCLE_REDIRECT_FALLBACK_MS = 1600
const RPS_CHOICES: RPSChoice[] = ['rock', 'paper', 'scissors']

const EMPTY_DATA: RockPaperScissorsGameData = {
    mode: 'best-of-3',
    rounds: [],
    playerChoices: {},
    scores: {},
    playersReady: [],
    gameWinner: null,
}

function isLifecycleStatus(value: unknown): value is RpsLifecycleStatus {
    return value === 'waiting' || value === 'playing' || value === 'finished' || value === 'abandoned' || value === 'cancelled'
}

/**
 * The engine serialises its state as JSON; the API sometimes hands it back
 * already parsed. Either way, only the fields this page reads are kept, with
 * safe defaults so a partial or hostile payload cannot crash the render.
 */
function parseRpsState(raw: unknown, fallbackStatus?: RpsLifecycleStatus): RpsState | null {
    let parsed: unknown = raw
    if (typeof raw === 'string') {
        try {
            parsed = JSON.parse(raw)
        } catch {
            return null
        }
    }
    if (!parsed || typeof parsed !== 'object') return null
    const record = parsed as Record<string, unknown>
    const dataRecord = (record.data && typeof record.data === 'object' ? record.data : {}) as Record<string, unknown>
    const players = Array.isArray(record.players)
        ? record.players
            .map((player) => {
                const entry = player as Record<string, unknown>
                return { id: String(entry?.id ?? ''), name: String(entry?.name ?? '') }
            })
            .filter((player) => player.id.length > 0)
        : []

    return {
        status: isLifecycleStatus(record.status) ? record.status : fallbackStatus ?? 'waiting',
        currentPlayerIndex: typeof record.currentPlayerIndex === 'number' ? record.currentPlayerIndex : 0,
        lastMoveAt: typeof record.lastMoveAt === 'number' && Number.isFinite(record.lastMoveAt) ? record.lastMoveAt : null,
        players,
        data: {
            ...EMPTY_DATA,
            mode: dataRecord.mode === 'best-of-5' ? 'best-of-5' : 'best-of-3',
            gameWinner: typeof dataRecord.gameWinner === 'string' ? dataRecord.gameWinner : null,
            scores: dataRecord.scores && typeof dataRecord.scores === 'object' ? (dataRecord.scores as Record<string, number>) : {},
            playerChoices:
                dataRecord.playerChoices && typeof dataRecord.playerChoices === 'object'
                    ? (dataRecord.playerChoices as Record<string, RPSChoice | null>)
                    : {},
            rounds: Array.isArray(dataRecord.rounds) ? (dataRecord.rounds as RockPaperScissorsGameData['rounds']) : [],
            playersReady: Array.isArray(dataRecord.playersReady) ? (dataRecord.playersReady as string[]) : [],
        },
    }
}

/**
 * Undoes this player's own optimistic lock-in and nothing else. Everything else
 * in the state may legitimately have moved on while the request was out - the
 * opponent's pick, the round the server resolved, the new score - and none of
 * it is this client's to roll back (#995).
 */
function withoutOwnChoice(state: RpsState, userId: string): RpsState {
    const playerChoices = { ...state.data.playerChoices }
    delete playerChoices[userId]
    return {
        ...state,
        data: {
            ...state.data,
            playerChoices,
            playersReady: state.data.playersReady.filter((id) => id !== userId),
        },
    }
}

function extractStateFromGameUpdate(payload: unknown): unknown {
    if (!payload || typeof payload !== 'object') return null
    const update = payload as GameUpdatePayload
    if (update.action !== 'state-change') return null
    const raw = update.payload
    if (!raw || typeof raw !== 'object') return null
    const nested = (raw as Record<string, unknown>).state
    return nested && typeof nested === 'object' ? nested : raw
}

function winsNeededFor(mode: RockPaperScissorsGameData['mode']): number {
    return mode === 'best-of-5' ? 3 : 2
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RockPaperScissorsLobbyPage({ code, isSpectator = false, onGameReset }: RockPaperScissorsLobbyPageProps) {
    const router = useRouter()
    const { data: session, status } = useSession()
    const { isGuest, guestToken, guestId } = useGuest()
    const { t } = useTranslation()

    const [loading, setLoading] = useState(true)
    const [lobby, setLobby] = useState<Lobby | null>(null)
    const [game, setGame] = useState<RpsGame | null>(null)
    const [showLeaveConfirmModal, setShowLeaveConfirmModal] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isRematchSubmitting, setIsRematchSubmitting] = useState(false)
    const [mobileTab, setMobileTab] = useState<'board' | 'history' | 'chat'>('board')
    const [overlayInspecting, setOverlayInspecting] = useState(false)

    const { isLeavingLobbyRef, leaveStartedAtRef, leaveApiOutcomeRef, leaveApiStatusCodeRef, leaveLobby } = useLeaveLobby(code, 'Rock Paper Scissors')
    // Zero-signal disconnect detection (#675) — every dedicated page runs its own.
    useLobbyHeartbeat(code, !isSpectator)
    const lifecycleRedirectInFlightRef = useRef(false)
    const isSubmittingRef = useRef(false)
    const activeGameIdRef = useRef<string | null>(null)
    const minPlayersRequired = getLobbyPlayerRequirements(lobby?.gameType || 'rock_paper_scissors').minPlayersRequired

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

    const getCurrentUserId = useCallback(() => (isGuest ? guestId : session?.user?.id), [isGuest, guestId, session?.user?.id])

    useEffect(() => { void router.prefetch('/games') }, [router])
    useEffect(() => { activeGameIdRef.current = game?.id ?? null }, [game?.id])

    // ─── Leaving and lifecycle redirects ─────────────────────────────────────

    const trackLeaveRedirectEvent = useCallback(
        (navigation: 'router_replace' | 'window_assign_fallback') => {
            const leaveStartedAt = leaveStartedAtRef.current
            if (leaveStartedAt === null) return
            trackLobbyLeaveRedirect({
                durationMs: Date.now() - leaveStartedAt,
                isGuest,
                source: 'rock_paper_scissors_page',
                navigation,
                apiOutcome: leaveApiOutcomeRef.current,
                ...(typeof leaveApiStatusCodeRef.current === 'number' ? { statusCode: leaveApiStatusCodeRef.current } : {}),
                gameType: 'rock_paper_scissors',
            })
        },
        [isGuest, leaveApiOutcomeRef, leaveApiStatusCodeRef, leaveStartedAtRef]
    )

    const navigateAfterLeave = useCallback(() => {
        router.replace('/games')
        trackLeaveRedirectEvent('router_replace')
        if (typeof window === 'undefined') return
        window.setTimeout(() => {
            if (window.location.pathname.startsWith(`/lobby/${code}`)) {
                trackLeaveRedirectEvent('window_assign_fallback')
                window.location.assign('/games')
            }
        }, LEAVE_REDIRECT_FALLBACK_MS)
    }, [router, code, trackLeaveRedirectEvent])

    const triggerLifecycleRedirect = useCallback((reason: string) => {
        if (isLeavingLobbyRef.current || lifecycleRedirectInFlightRef.current) return
        lifecycleRedirectInFlightRef.current = true
        showToast.error('lobby.gameAbandoned', undefined, undefined, { id: 'rps-lifecycle-redirect' })
        clientLogger.warn('RPS lifecycle redirect triggered', { code, reason, target: '/games' })
        router.replace('/games')
        if (typeof window !== 'undefined') {
            window.setTimeout(() => {
                if (window.location.pathname.startsWith(`/lobby/${code}`)) window.location.assign('/games')
            }, LIFECYCLE_REDIRECT_FALLBACK_MS)
        }
    }, [router, code, isLeavingLobbyRef])

    // ─── Loading and applying state ──────────────────────────────────────────

    /**
     * Broadcast snapshots are sanitised: while only one player has locked in,
     * everyone else sees that choice as null (#652). The player who made it
     * keeps their own pick from the previous local state, so the tile stays
     * highlighted instead of blinking off when the broadcast lands.
     */
    const freshnessRef = React.useRef(createFreshnessWatermark())
    const stuckTurnRecoveryRef = React.useRef(createStuckTurnRecovery())
    const applyAuthoritativeState = useCallback((gameId: string, raw: unknown, statusOverride?: unknown, options?: { trusted?: boolean }): boolean => {
        // #985: a stale broadcast used to land on top of a just-submitted choice.
        // `moveInFlight` is the half tic-tac-toe and connect four already had:
        // a snapshot taken before this player's own request cannot have seen it,
        // and applying it un-highlights the tile mid-submit (#995).
        const freshness = decideFreshness(freshnessRef.current, raw, {
            trusted: options?.trusted,
            moveInFlight: isSubmittingRef.current,
        })
        if (!freshness.accept) {
            clientLogger.debug('Ignoring stale RPS state', { gameId, reason: freshness.reason })
            return true
        }
        const nextState = parseRpsState(raw, isLifecycleStatus(statusOverride) ? statusOverride : undefined)
        if (!nextState) return false
        const userId = getCurrentUserId()
        setGame((prevGame) => {
            if (!prevGame || prevGame.id !== gameId) return prevGame
            const merged: RpsState = { ...nextState }
            if (userId && nextState.data.playersReady.includes(userId) && nextState.data.playerChoices[userId] == null) {
                const previousOwnChoice = prevGame.state.data.playerChoices[userId] ?? null
                if (previousOwnChoice) {
                    merged.data = { ...nextState.data, playerChoices: { ...nextState.data.playerChoices, [userId]: previousOwnChoice } }
                }
            }
            if (nextState.players.length === 0) merged.players = prevGame.state.players
            const resolvedStatus = isLifecycleStatus(statusOverride) ? statusOverride : merged.status
            return { ...prevGame, status: resolvedStatus, state: { ...merged, status: resolvedStatus } }
        })
        return true
    }, [getCurrentUserId])

    const loadLobby = useCallback(async () => {
        try {
            const res = await fetchWithGuest(`/api/lobby/${code}?includeFinished=true`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            })
            const data = await res.json().catch(() => null)
            if (!res.ok) {
                clientLogger.error('Failed to load lobby:', data?.error)
                showToast.error('errors.failedToLoad')
                // #991: only a gone lobby drops the board. A 429 or a transient 5xx
                // is a failed fetch, and a game in progress must survive it.
                if (isLobbyGoneStatus(res.status)) setLobby(null)
                setLoading(false)
                return
            }
            const { lobby: lobbyPayload, activeGame } = normalizeLobbySnapshotResponse(data, { includeFinished: true })
            if (!lobbyPayload?.id || !lobbyPayload?.code) throw new Error('Invalid lobby response')
            setLobby(lobbyPayload as Lobby)
            finalizePendingLobbyCreateMetric({ lobbyCode: lobbyPayload.code, fallbackGameType: lobbyPayload.gameType })

            if (activeGame?.id) {
                const parsedState = parseRpsState(activeGame.state, isLifecycleStatus(activeGame.status) ? activeGame.status : undefined)
                const players: GamePlayer[] = Array.isArray(activeGame.players) ? (activeGame.players as GamePlayer[]) : []
                if (parsedState) {
                    if (parsedState.players.length === 0) {
                        parsedState.players = players
                            .map((player) => ({ id: player.userId || player.id, name: player.user?.username || player.name || '' }))
                            .filter((player) => player.id)
                    }
                    const resolvedStatus = isLifecycleStatus(activeGame.status) ? activeGame.status : parsedState.status
                    // An explicit resync is authoritative: move the watermark with it (#985).
                    decideFreshness(freshnessRef.current, parsedState, { trusted: true })
                    setGame({ id: activeGame.id, status: resolvedStatus, players, state: { ...parsedState, status: resolvedStatus } })
                } else {
                    setGame(null)
                }
            } else {
                setGame(null)
            }
            setLoading(false)
        } catch (error) {
            clientLogger.error('Error loading lobby:', error)
            showToast.error('errors.failedToLoad')
            setLoading(false)
        }
    }, [code])

    useEffect(() => {
        const redirectReason = resolveLifecycleRedirectReason({ gameStatus: game?.status, lobbyIsActive: lobby?.isActive })
        if (redirectReason) triggerLifecycleRedirect(redirectReason)
    }, [game?.status, lobby?.isActive, triggerLifecycleRedirect])

    useEffect(() => {
        if (status === 'loading' || (status === 'unauthenticated' && !isGuest && !isSpectator)) return
        if (isGuest && !guestToken) return
        void loadLobby()
    }, [status, isGuest, guestToken, isSpectator, loadLobby])

    // ─── Realtime ────────────────────────────────────────────────────────────

    const handleGameUpdate = useCallback((payload: GameUpdatePayload) => {
        const activeGameId = activeGameIdRef.current
        const directState = extractStateFromGameUpdate(payload)
        if (directState && activeGameId && applyAuthoritativeState(activeGameId, directState)) return
        void loadLobby()
    }, [applyAuthoritativeState, loadLobby])

    const handleGameAbandoned = useCallback((data: { gameId: string; reason?: string }) => {
        clientLogger.log('📡 RPS game abandoned:', data)
        if (isLeavingLobbyRef.current) return
        void loadLobby()
        triggerLifecycleRedirect(`game-abandoned:${data.reason || 'unknown'}`)
    }, [loadLobby, triggerLifecycleRedirect, isLeavingLobbyRef])

    const handlePlayerLeft = useCallback((data: {
        userId: string; username?: string; playerName?: string; remainingPlayers?: number
        nextCreatorId?: string; nextCreatorName?: string; gameTerminal?: boolean
    }) => {
        clientLogger.log('📡 RPS player left:', data)
        if (isLeavingLobbyRef.current) return
        const departedPlayerName = data.username || data.playerName
        if (departedPlayerName) showToast.info('toast.playerLeft', undefined, { player: departedPlayerName })
        if (data.nextCreatorId) {
            if (data.nextCreatorId === getCurrentUserId()) showToast.success('toast.youAreNowHost')
            else if (data.nextCreatorName) showToast.info('toast.hostReassigned', undefined, { player: data.nextCreatorName })
        }
        if (!data.gameTerminal && typeof data.remainingPlayers === 'number' && data.remainingPlayers < minPlayersRequired) {
            triggerLifecycleRedirect('player-left:insufficient-players')
            return
        }
        void loadLobby()
    }, [loadLobby, minPlayersRequired, triggerLifecycleRedirect, getCurrentUserId, isLeavingLobbyRef])

    const handleGameReset = useCallback(() => {
        resetFreshnessWatermark(freshnessRef.current)
        if (onGameReset) onGameReset()
        else router.push(`/lobby/${code}`)
    }, [code, onGameReset, router])

    const { isConnected, isReconnecting } = useRealtimeConnection({
        // #987: Supabase Broadcast has no replay buffer, so every event that
        // landed while the socket was down is gone. Without this the board
        // stayed frozen on pre-gap state and neither player could move.
        onStateSync: async () => { await loadLobby() },
        code,
        shouldJoinLobbyRoom: status !== 'loading' && (status === 'authenticated' || (isGuest && !!guestToken) || isSpectator),
        onGameUpdate: handleGameUpdate,
        onGameAbandoned: handleGameAbandoned,
        onPlayerLeft: handlePlayerLeft,
        onChatMessage,
        onPlayerTyping,
        onGameReset: handleGameReset,
    })

    useLobbyChatHistory({ code, isConnected, isReconnecting, mergeHistoryMessages })

    // ─── Moves ───────────────────────────────────────────────────────────────

    const submitChoice = useCallback(async (choice: RPSChoice, options?: { isAutoAction?: boolean }): Promise<boolean> => {
        if (!game || isSubmittingRef.current) return false
        const userId = getCurrentUserId()
        if (!userId) return false
        const isAutoAction = options?.isAutoAction === true
        const submitStartedAt = Date.now()
        let responseStatus: number | undefined
        const gameId = game.id
        const revertOwnChoice = () => {
            setGame((prevGame) => (prevGame && prevGame.id === gameId
                ? { ...prevGame, state: withoutOwnChoice(prevGame.state, userId) }
                : prevGame))
        }
        isSubmittingRef.current = true
        setIsSubmitting(true)
        try {
            // Optimistic: the tile locks in immediately; the reveal waits for the server.
            setGame((prevGame) => {
                if (!prevGame) return prevGame
                const ready = prevGame.state.data.playersReady.includes(userId)
                    ? prevGame.state.data.playersReady
                    : [...prevGame.state.data.playersReady, userId]
                return {
                    ...prevGame,
                    state: {
                        ...prevGame.state,
                        data: {
                            ...prevGame.state.data,
                            playerChoices: { ...prevGame.state.data.playerChoices, [userId]: choice },
                            playersReady: ready,
                        },
                    },
                }
            })

            // Both players pick at the same moment by design, and the server
            // writes the move under an optimistic lock on the game row, so the
            // one who loses the race gets STATE_CONFLICT. That is not an error
            // for a simultaneous game: the server re-reads state on every
            // request, so the same submit simply goes again.
            let res: Response | null = null
            let payload: Record<string, unknown> | null = null
            for (let attempt = 0; attempt < 3; attempt += 1) {
                res = await fetchWithGuest(`/api/game/${game.id}/state`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        gameId: game.id,
                        move: { type: 'submit-choice', playerId: userId, data: { choice } },
                        userId,
                    }),
                })
                responseStatus = res.status
                payload = (await res.json().catch(() => null)) as Record<string, unknown> | null
                if (res.status === 409 && payload?.code === 'STATE_CONFLICT' && attempt < 2) {
                    await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)))
                    continue
                }
                break
            }
            if (!res) return false
            if (!res.ok) {
                trackMoveSubmitApplied({ gameType: 'rock_paper_scissors', moveType: 'submit-choice', durationMs: Date.now() - submitStartedAt, isGuest, success: false, applied: false, statusCode: responseStatus, source: 'rock_paper_scissors_page' })
                revertOwnChoice()
                if (!isAutoAction) {
                    showToast.error('errors.general', undefined, { message: String(payload?.message || payload?.error || 'Failed to submit choice') })
                }
                // Not only on 409. A 500, a 400 or a dropped response all leave
                // this client guessing which round the server is on, and nothing
                // else re-reads: there is no poll here, only broadcasts.
                await loadLobby()
                return false
            }
            const responseGame = payload?.game as { state?: unknown; status?: unknown } | undefined
            const authoritativeState = responseGame?.state
            if (!authoritativeState || !applyAuthoritativeState(game.id, authoritativeState, responseGame?.status, { trusted: true })) await loadLobby()
            trackMoveSubmitApplied({ gameType: 'rock_paper_scissors', moveType: 'submit-choice', durationMs: Date.now() - submitStartedAt, isGuest, success: true, applied: true, statusCode: responseStatus, source: 'rock_paper_scissors_page' })
            if (isAutoAction) showToast.info('games.rock_paper_scissors.timeUp')
            return true
        } catch (error) {
            trackMoveSubmitApplied({ gameType: 'rock_paper_scissors', moveType: 'submit-choice', durationMs: Date.now() - submitStartedAt, isGuest, success: false, applied: false, statusCode: responseStatus, source: 'rock_paper_scissors_page' })
            clientLogger.error('Failed to submit choice:', error)
            revertOwnChoice()
            if (!isAutoAction) showToast.errorFrom(error, 'errors.general')
            await loadLobby()
            return false
        } finally {
            isSubmittingRef.current = false
            setIsSubmitting(false)
        }
    }, [game, getCurrentUserId, isGuest, applyAuthoritativeState, loadLobby])

    const currentUserId = getCurrentUserId()
    const rpsData = game?.state.data ?? EMPTY_DATA
    const isFinished = game?.status === 'finished' || game?.state.status === 'finished' || !!rpsData.gameWinner
    const mySubmitted = !!currentUserId && rpsData.playersReady.includes(currentUserId)
    const iAmChoosing = !isSpectator && !!game && !isFinished && !!currentUserId && game.state.players.some((p) => p.id === currentUserId) && !mySubmitted

    // Round and opponent cues (#1111): a new round asks for the viewer's throw,
    // and the opponent locking theirs in is their move. Counting only the
    // opponent's lock keeps the viewer's own submit silent.
    const opponentsReady = rpsData.playersReady.filter((id) => id !== currentUserId).length
    useTurnSounds({
        isMyTurn: iAmChoosing,
        lastMoveSignature: game ? `${rpsData.rounds.length}:${opponentsReady}` : null,
        opponentMoved: opponentsReady > 0,
        enabled: !isSpectator && !!game && !isFinished,
    })

    const turnTimerLimit =
        typeof lobby?.turnTimer === 'number' && Number.isFinite(lobby.turnTimer) && lobby.turnTimer > 0
            ? Math.floor(lobby.turnTimer)
            : 60

    // Simultaneous game: the "turn" is the round. `currentPlayerIndex` is
    // never advanced by the engine, so the round count stands in for it — the
    // timer hook resets on that boundary and on every lastMoveAt change.
    const timerState = useMemo(() => {
        if (!game) return null
        return {
            currentPlayerIndex: rpsData.rounds.length,
            lastMoveAt: game.state.lastMoveAt ?? undefined,
            status: game.state.status,
        }
    }, [game, rpsData.rounds.length])

    const { timeLeft } = useGameTimer({
        isMyTurn: iAmChoosing,
        gameState: timerState,
        turnTimerLimit,
        onTimeout: async (): Promise<boolean> => {
            // A player who never picks would hold the opponent hostage; the
            // engine has no forfeit move, so the client picks at random for
            // them. Only the player themselves does this — never a spectator,
            // never for the opponent — so two clients cannot race.
            if (!iAmChoosing) {
                // I have picked and the clock still ran out: a bot opponent that
                // never answered (the server-side trigger can fail without an
                // identity in dev). Poke it from here, the way TTT's watchdog
                // does; the route is idempotent for a bot that already picked.
                if (game && mySubmitted && !isFinished) {
                    const pendingBot = game.players.find((p) => (p.user?.bot || p.bot) && !rpsData.playersReady.includes(p.userId))
                    if (pendingBot) {
                        clientLogger.warn('⏰ RPS bot has not picked in time, triggering it from the client', { code, gameId: game.id, botUserId: pendingBot.userId })
                        void fetchWithGuest(`/api/game/${game.id}/bot-turn`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ botUserId: pendingBot.userId, lobbyCode: code, triggerSource: 'client-timeout' }),
                        }).then(() => loadLobby()).catch(() => loadLobby())
                        return false
                    }
                }
                // #989: I have picked and the opponent never will — they closed the
                // tab. Nobody submits a timeout for an absent player and this game
                // type has no server fallback, so ask the server: the lobby GET
                // sweeps them once their heartbeat is 30s stale and the leave path
                // ends the round. Throttled, and it stops after a minute.
                const decision = stuckTurnRecoveryRef.current.decide(
                    turnSignatureOf(rpsData.rounds.length, game?.state.lastMoveAt),
                    Date.now()
                )
                if (decision === 'give-up') return true
                if (decision === 'resync') {
                    clientLogger.warn('⏰ RPS round timer expired on an absent opponent, asking the server', { code })
                    void loadLobby()
                }
                return false
            }
            const randomChoice = RPS_CHOICES[Math.floor(Math.random() * RPS_CHOICES.length)]
            clientLogger.warn('⏰ RPS round timer expired, submitting a random choice', { code, gameId: game?.id })
            return submitChoice(randomChoice, { isAutoAction: true })
        },
    })

    // ─── Post-game actions ───────────────────────────────────────────────────

    const handleLeave = () => {
        if (isLeavingLobbyRef.current) return
        setShowLeaveConfirmModal(false)
        leaveLobby()
        navigateAfterLeave()
    }

    const handlePlayAgain = useCallback(async () => {
        const userId = getCurrentUserId()
        if (!lobby || !userId) { router.push(`/lobby/${code}`); return }
        if (lobby.creatorId !== userId) { showToast.info('game.ui.waitingForHost'); return }
        setIsRematchSubmitting(true)
        try {
            const response = await fetchWithGuest('/api/game/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gameType: 'rock_paper_scissors', lobbyId: lobby.id }),
            })
            const data = await response.json().catch(() => null)
            if (!response.ok) throw new Error((typeof data?.details === 'string' && data.details) || (typeof data?.error === 'string' && data.error) || 'Failed to start rematch')
            setOverlayInspecting(false)
            await loadLobby()
            showToast.success('lobby.game.playAgain')
        } catch (error) {
            clientLogger.error('Failed to start RPS rematch:', error)
            showToast.errorFrom(error, 'errors.general')
        } finally {
            setIsRematchSubmitting(false)
        }
    }, [code, getCurrentUserId, loadLobby, lobby, router])

    const handleReturnToWaiting = useCallback(async () => {
        const userId = getCurrentUserId()
        if (!userId || !lobby || lobby.creatorId !== userId) return
        setIsRematchSubmitting(true)
        try {
            const res = await fetchWithGuest(`/api/lobby/${code}/return-to-waiting`, { method: 'POST' })
            if (!res.ok) {
                const data = (await res.json().catch(() => ({}))) as { error?: string }
                throw new Error(data.error ?? `HTTP ${res.status}`)
            }
            handleGameReset()
        } catch (error) {
            clientLogger.error('Failed to return to waiting room:', error)
            showToast.errorFrom(error, 'errors.general')
        } finally {
            setIsRematchSubmitting(false)
        }
    }, [code, getCurrentUserId, handleGameReset, lobby])

    const reversedRounds = useMemo(() => rpsData.rounds.slice().reverse(), [rpsData.rounds])

    // ─── Early returns ────────────────────────────────────────────────────────

    if (loading) return <LobbyPageLoadingFallback />
    if (!lobby) return <LobbyPageErrorFallback />

    const themeStyle = getThemePageStyle(lobby.theme)

    if (!game || (game.status !== 'playing' && game.status !== 'finished')) {
        return (
            <div className="bd-page flex h-[var(--game-h)] items-center justify-center px-4" style={themeStyle}>
                <div className="bd-card w-full max-w-md p-8 text-center">
                    <h1 className="mb-3 text-2xl font-extrabold text-bd-ink" style={{ fontFamily: 'var(--bd-font-display)' }}>
                        {t('games.tictactoe.game.gameNotStartedTitle')}
                    </h1>
                    <p className="mb-6 text-sm text-bd-ink-soft">{t('games.tictactoe.game.gameNotStartedDescription')}</p>
                    <button onClick={() => router.push(`/lobby/${code}`)} className="bd-btn bd-btn-primary mx-auto">
                        {t('game.ui.backToLobby')}
                    </button>
                </div>
            </div>
        )
    }

    const statePlayers = game.state.players
    const isParticipant = !!currentUserId && statePlayers.some((p) => p.id === currentUserId)

    if (!isParticipant && !isSpectator) {
        return (
            <div className="bd-page flex h-[var(--game-h)] items-center justify-center px-4" style={themeStyle}>
                <div className="bd-card w-full max-w-md p-8 text-center">
                    <p className="mb-6 text-sm text-bd-ink-soft">{t('lobby.game.notPartOfMatch')}</p>
                    <button onClick={() => router.push(`/lobby/${code}`)} className="bd-btn bd-btn-primary mx-auto">
                        {t('game.ui.backToLobby')}
                    </button>
                </div>
            </div>
        )
    }

    // ─── Derived view data ────────────────────────────────────────────────────

    const lobbyPlayers = game.players
    const getLobbyPlayer = (playerId: string) => lobbyPlayers.find((p) => p.userId === playerId)
    const getDisplayName = (playerId: string) =>
        getLobbyPlayer(playerId)?.user?.username || getLobbyPlayer(playerId)?.name || statePlayers.find((p) => p.id === playerId)?.name || t('game.ui.playerFallback')
    const getAvatar = (playerId: string): string | null => getLobbyPlayer(playerId)?.user?.avatarUrl ?? getLobbyPlayer(playerId)?.user?.image ?? null
    const getIsPremium = (playerId: string) => !!(getLobbyPlayer(playerId)?.user as { isPremium?: boolean } | undefined)?.isPremium

    const leftId = statePlayers[0]?.id ?? ''
    const rightId = statePlayers[1]?.id ?? ''
    const leftName = leftId ? getDisplayName(leftId) : '—'
    const rightName = rightId ? getDisplayName(rightId) : '—'
    const opponentId = currentUserId === leftId ? rightId : leftId
    const opponentName = opponentId ? getDisplayName(opponentId) : '—'
    const winsNeeded = winsNeededFor(rpsData.mode)
    const maxRounds = rpsData.mode === 'best-of-5' ? 5 : 3
    const leftScore = rpsData.scores[leftId] ?? 0
    const rightScore = rpsData.scores[rightId] ?? 0
    const roundNum = rpsData.rounds.length + (isFinished ? 0 : 1)
    const latestRound = rpsData.rounds[rpsData.rounds.length - 1] ?? null
    const winnerId = rpsData.gameWinner
    const winnerName = winnerId ? getDisplayName(winnerId) : null
    const iWon = !!winnerId && winnerId === currentUserId
    const isLobbyCreator = !!currentUserId && currentUserId === lobby.creatorId
    const readyCount = rpsData.playersReady.length

    const isLockedIn = (playerId: string) => rpsData.playersReady.includes(playerId)
    const cornerBadgeFor = (playerId: string) => {
        const revealed = latestRound?.choices?.[playerId] as RPSChoice | undefined
        const pending = !isFinished && isLockedIn(playerId)
        const symbol = pending
            ? <Icon name="check" size={14} />
            : revealed ? <Icon name={getChoiceIcon(revealed)} size={14} /> : null
        if (!symbol) return undefined
        return (
            <div style={{
                position: 'absolute', bottom: -3, right: -3, width: 22, height: 22, borderRadius: 7,
                background: pending ? 'var(--bd-mint-deep)' : 'var(--bd-bg)', color: pending ? '#fff' : 'inherit',
                border: '2px solid var(--bd-ink)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800,
            }}>
                {symbol}
            </div>
        )
    }

    const activeTitle = isSpectator
        ? readyCount === 1
            ? t('games.rock_paper_scissors.playerLockedIn', { player: getDisplayName(rpsData.playersReady[0]) })
            : t('games.rock_paper_scissors.bothChoosing')
        : mySubmitted
            ? t('games.rock_paper_scissors.waitingForPick', { player: opponentName })
            : t('games.rock_paper_scissors.pickPrompt')

    const finishedMessage = iWon
        ? t('games.rock_paper_scissors.youWin')
        : t('games.rock_paper_scissors.playerWins', { player: winnerName ?? t('game.ui.playerFallback') })

    // ─── Sections ─────────────────────────────────────────────────────────────

    const headerSection = (
        <div className="ttt-card" style={{ background: 'linear-gradient(135deg, var(--bd-card-warm) 0%, rgba(155,140,255,0.10) 100%)', overflow: 'hidden', padding: '12px 16px' }}>
            <div style={{ position: 'absolute', right: -10, top: -14, opacity: 0.12, transform: 'rotate(12deg)', pointerEvents: 'none', lineHeight: 1 }}><Icon name="rock" size={96} /></div>
            <GameScoreboardHeader
                leftCard={<GamePlayerCard name={leftName} isActive={!isFinished && !!leftId && !isLockedIn(leftId)} isMe={currentUserId === leftId} isWinner={winnerId === leftId} side="left" avatarSrc={leftId ? getAvatar(leftId) : null} isPremium={leftId ? getIsPremium(leftId) : false} accentColor="var(--bd-coral)" turnDotColor="var(--bd-mint-deep)" subline={<WinPips filled={leftScore} total={winsNeeded} color="var(--bd-coral)" />} cornerBadge={leftId ? cornerBadgeFor(leftId) : undefined} />}
                center={
                    <>
                        <div style={{ fontSize: 10, color: 'var(--bd-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'ui-monospace,monospace', marginBottom: 2 }}>
                            {t('games.rock_paper_scissors.roundNum', { num: roundNum })}
                        </div>
                        <div style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 28, lineHeight: 1, color: 'var(--bd-ink)' }}>
                            {leftScore}<span style={{ color: 'var(--bd-ink-muted)', margin: '0 6px' }}>:</span>{rightScore}
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--bd-ink-muted)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'ui-monospace,monospace' }}>
                            {t('games.rock_paper_scissors.seriesTarget', { count: winsNeeded, rounds: maxRounds })}
                        </div>
                    </>
                }
                centerCompact={
                    <div style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 22, lineHeight: 1, color: 'var(--bd-ink)' }}>
                        {leftScore}<span style={{ color: 'var(--bd-ink-muted)', margin: '0 5px' }}>:</span>{rightScore}
                    </div>
                }
                rightCard={<GamePlayerCard name={rightName} isActive={!isFinished && !!rightId && !isLockedIn(rightId)} isMe={currentUserId === rightId} isWinner={winnerId === rightId} side="right" avatarSrc={rightId ? getAvatar(rightId) : null} isPremium={rightId ? getIsPremium(rightId) : false} accentColor="var(--bd-lav)" turnDotColor="var(--bd-mint-deep)" subline={<WinPips filled={rightScore} total={winsNeeded} color="var(--bd-lav)" />} cornerBadge={rightId ? cornerBadgeFor(rightId) : undefined} />}
            />
        </div>
    )

    const statusSection = (
        <GameStatusBanner
            isFinished={isFinished}
            finishedMessage={finishedMessage}
            activeTitle={activeTitle}
            meta={`${readyCount}/2`}
            secs={timeLeft}
            turnTimerLimit={turnTimerLimit}
            isYourTurn={iAmChoosing}
            barColor={mySubmitted ? 'var(--bd-lav)' : 'var(--bd-coral)'}
            leadingIcon={<Icon name="rock" size={20} />}
            isSpectator={isSpectator}
        />
    )

    // One flag for both the class and the mount, so the card can never paint
    // without the overlay over it or - the #903 review's blocker - the overlay
    // hang over an unpainted card.
    const showsResultOverlay = isFinished && !isSpectator && !overlayInspecting

    const renderBoardSection = (testId?: string) => (
        <div className={`ttt-board-card${showsResultOverlay ? ' ttt-board-card--result' : ''}`}>
            <div className="ttt-board-surface ttt-board-surface--wide">
                <RockPaperScissorsGameBoard
                    gameData={rpsData}
                    playerId={isSpectator ? '' : currentUserId ?? ''}
                    players={statePlayers.map((p, index) => ({ id: p.id, name: getDisplayName(p.id), avatarSrc: getAvatar(p.id), accent: index === 0 ? 'var(--bd-coral)' : 'var(--bd-lav)' }))}
                    onSubmitChoice={async (choice) => { await submitChoice(choice) }}
                    disabled={isSpectator || isFinished}
                    isSubmitting={isSubmitting}
                    isSpectator={isSpectator}
                    testId={testId}
                />
                {/* Inside the surface, not beside it: this pill is
                    `position: absolute; bottom`, so it hangs off the nearest
                    positioned ancestor, and the card stopped painting in this
                    state (#903). On the card it was drawn on bare page below
                    the board. The surface is the box the player can see. */}
                {isFinished && !isSpectator && overlayInspecting && (
                    <button
                        data-testid="show-results-pill"
                        onClick={() => setOverlayInspecting(false)}
                        style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 10, padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: 'rgba(31,27,22,0.75)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', backdropFilter: 'blur(4px)', whiteSpace: 'nowrap' }}
                    >
                        {t('games.tictactoe.game.showResults')}
                    </button>
                )}
            </div>
            {showsResultOverlay && (
                <GameResultOverlay
                    title={finishedMessage}
                    kicker={t('lobby.game.gameOver')}
                    icon={<div style={{ width: 56, height: 56, borderRadius: '50%', background: iWon ? 'var(--bd-mint-deep)' : 'var(--bd-coral)', display: 'grid', placeItems: 'center', boxShadow: '0 0 0 3px rgba(255,255,255,0.15)' }}><Icon name={iWon ? 'trophy' : 'rock'} size={28} tone="on-accent" /></div>}
                    accentColor="var(--bd-coral)"
                    accentShadowColor="var(--bd-coral-deep)"
                    onInspect={() => setOverlayInspecting(true)}
                    isHost={isLobbyCreator}
                    isLoading={isRematchSubmitting}
                    onPlayAgain={handlePlayAgain}
                    onReturnToLobby={handleReturnToWaiting}
                    onLeave={() => setShowLeaveConfirmModal(true)}
                    isGuest={isGuest}
                    registerUrl={`/auth/register?returnUrl=${encodeURIComponent(`/lobby/${code}`)}`}
                    inviteCode={code}
                    gameType="rock_paper_scissors"
                    resultKey={`${game?.id}:${game?.state.lastMoveAt ?? ''}`}
                    isRegistered={status === 'authenticated' && !isGuest}
                />
            )}
        </div>
    )

    // Leave lives in the header (layout DoD); nothing else needs a row under the board.

    // Chat hidden in bot-only games (#522 parity with the shared lobby shell);
    // spectators get a read-only feed.
    const hasMultipleHumans = lobbyPlayers.filter((p) => !p.user?.bot && !p.bot).length >= 2
    const showChat = hasMultipleHumans || isSpectator
    const chatPlayerProfiles = new Map<string, { avatarUrl?: string | null; isPremium?: boolean }>()
    for (const p of lobbyPlayers) {
        if (p.userId) chatPlayerProfiles.set(p.userId, { avatarUrl: p.user?.avatarUrl ?? p.user?.image ?? null, isPremium: !!p.user?.isPremium })
    }

    const historySection = (
        <div className={`ttt-history-card${showChat ? '' : ' ttt-history-card--fill'}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid var(--bd-line)' }}>
                <h3 style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 16, color: 'var(--bd-ink)', margin: 0 }}>{t('games.rock_paper_scissors.roundsTitle')}</h3>
                <span style={{ display: 'inline-flex', padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: 'var(--bd-bg2)', color: 'var(--bd-ink-soft)' }}>
                    {rpsData.rounds.length}
                </span>
            </div>
            <div className="ttt-history-list">
                {rpsData.rounds.length === 0
                    ? (
                        <div className="rps-rounds-empty">
                            <span className="rps-rounds-empty__arena" aria-hidden><Icon name="rock" size={22} /><span className="rps-rounds-empty__vs">{t('game.ui.vs')}</span><Icon name="rock" size={22} /></span>
                            <span>{t('games.rock_paper_scissors.noRoundsYet')}</span>
                        </div>
                    )
                    : reversedRounds.map((round, index) => {
                        const number = rpsData.rounds.length - index
                        const leftChoice = round.choices?.[leftId] as RPSChoice | undefined
                        const rightChoice = round.choices?.[rightId] as RPSChoice | undefined
                        const isDrawRound = round.winner === 'draw'
                        const accent = isDrawRound ? undefined : round.winner === leftId ? 'var(--bd-coral)' : 'var(--bd-lav)'
                        const who = isDrawRound ? t('lobby.game.draw') : getDisplayName(round.winner ?? '')
                        return (
                            <div key={`round-${number}`} className={`rps-round-row${isDrawRound ? ' rps-round-row--draw' : ''}`} style={{ '--row-accent': accent } as React.CSSProperties}>
                                <span className="rps-round-row__num">#{String(number).padStart(2, '0')}</span>
                                <span className="rps-round-row__pair">
                                    <span aria-label={leftChoice ? t(CHOICE_LABEL_KEY[leftChoice]) : undefined}><Icon name={getChoiceIcon(leftChoice)} size={18} /></span>
                                    <span className="rps-round-row__vs">{t('game.ui.vs')}</span>
                                    <span aria-label={rightChoice ? t(CHOICE_LABEL_KEY[rightChoice]) : undefined}><Icon name={getChoiceIcon(rightChoice)} size={18} /></span>
                                </span>
                                <span className="rps-round-row__who">{who}</span>
                            </div>
                        )
                    })
                }
            </div>
        </div>
    )

    const chatSection = showChat ? (
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
    ) : null

    // The room card sits to the right of the scoreboard, in the same grid row
    // and at the same height (layout DoD, scheme A): game, room code, invite
    // link, and Leave. Phones get the compact form beside the scoreboard.
    const roomCardProps = {
        gameId: 'rps',
        title: t('games.rock_paper_scissors.name'),
        code,
        isSpectator,
        leaveLabel: t('game.ui.leave'),
        allowSpectators: !!lobby.allowSpectators,
        onLeave: () => setShowLeaveConfirmModal(true),
    }
    const roomSection = <GameRoomCard {...roomCardProps} />
    const roomSectionCompact = <GameRoomCard {...roomCardProps} compact />

    return (
        <div className="game-screen ttt-screen" style={themeStyle}>

            {/* ── DESKTOP ─────────────────────────────────────────────────── */}
            <div className="ttt-desktop-layout">
                <div className="ttt-grid">
                    {headerSection}
                    {roomSection}
                    <div className="ttt-center-col">
                        {statusSection}
                        {renderBoardSection('rps-board')}
                    </div>
                    <div className="ttt-right-col">
                        {historySection}
                        {chatSection}
                    </div>
                </div>
            </div>

            {/* ── PHONE LANDSCAPE ─────────────────────────────────────────── */}
            <div className="game-landscape-layout">
                <div className="game-landscape-board">
                    {renderBoardSection('rps-board-landscape')}
                </div>
                <div className="game-landscape-side">
                    <div className="ttt-top-row">{headerSection}{roomSectionCompact}</div>
                    {statusSection}
                    {chatSection}
                </div>
            </div>

            {/* ── MOBILE ──────────────────────────────────────────────────── */}
            <div className="ttt-mobile-layout">
                <div className="ttt-top-row">{headerSection}{roomSectionCompact}</div>
                {statusSection}
                <GameTabs
                    tabs={[
                        { id: 'board' as const, label: t('game.ui.tabBoard') },
                        { id: 'history' as const, label: `${t('games.rock_paper_scissors.roundsTitle')} (${rpsData.rounds.length})` },
                        ...(showChat ? [{ id: 'chat' as const, label: t('game.ui.tabChat'), badge: chatUnreadCount }] : []),
                    ]}
                    activeTab={mobileTab}
                    onTabChange={(id) => {
                        setMobileTab(id)
                        if (id === 'chat') resetChatUnread()
                    }}
                />
                <div className="ttt-mobile-content">
                    {mobileTab === 'board' && (
                        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {renderBoardSection()}
                            </div>
                    )}
                    {mobileTab === 'history' && historySection}
                    {mobileTab === 'chat' && chatSection}
                </div>
            </div>

            {/* ── MODALS ──────────────────────────────────────────────────── */}
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
            {!isSpectator && game.status === 'playing' && (
                <ReactionOverlay lobbyCode={code} />
            )}
        </div>
    )
}
