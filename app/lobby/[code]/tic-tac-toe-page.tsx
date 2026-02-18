'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { TicTacToeGame, TicTacToeGameData, PlayerSymbol } from '@/lib/games/tic-tac-toe-game'
import { io, Socket } from 'socket.io-client'
import { getBrowserSocketUrl } from '@/lib/socket-url'
import { resolveSocketClientAuth } from '@/lib/socket-client-auth'
import { clientLogger } from '@/lib/client-logger'
import { useTranslation } from '@/lib/i18n-helpers'
import { showToast } from '@/lib/i18n-toast'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { Game } from '@/types/game'
import { normalizeLobbySnapshotResponse } from '@/lib/lobby-snapshot'
import TicTacToeGameBoard from '@/components/TicTacToeGameBoard'
import LoadingSpinner from '@/components/LoadingSpinner'
import ConfirmModal from '@/components/ConfirmModal'
import { Move } from '@/lib/game-engine'

interface Lobby {
    id: string
    code: string
    gameType: string
    creatorId: string
    name: string
}

interface TicTacToeLobbyPageProps {
    code: string
}

export default function TicTacToeLobbyPage({ code }: TicTacToeLobbyPageProps) {
    const router = useRouter()
    const { data: session, status } = useSession()
    const { isGuest, guestToken, guestId } = useGuest()
    const { t } = useTranslation()

    const [loading, setLoading] = useState(true)
    const [lobby, setLobby] = useState<Lobby | null>(null)
    const [game, setGame] = useState<Game | null>(null)
    const [gameEngine, setGameEngine] = useState<TicTacToeGame | null>(null)
    const [socket, setSocket] = useState<Socket | null>(null)
    const [showLeaveConfirmModal, setShowLeaveConfirmModal] = useState(false)
    const [isMoveSubmitting, setIsMoveSubmitting] = useState(false)
    const [isRematchSubmitting, setIsRematchSubmitting] = useState(false)

    const getCurrentUserId = useCallback(() => {
        return isGuest ? guestId : session?.user?.id
    }, [isGuest, guestId, session?.user?.id])

    // Load lobby data
    const loadLobby = useCallback(async () => {
        try {
            const res = await fetchWithGuest(`/api/lobby/${code}?includeFinished=true`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            })

            const data = await res.json()

            if (!res.ok) {
                clientLogger.error('Failed to load lobby:', data.error)
                showToast.error('lobby.loadFailed')
                router.push('/games')
                return
            }

            const { lobby: lobbyPayload, activeGame } = normalizeLobbySnapshotResponse(data, {
                includeFinished: true,
            })

            if (!lobbyPayload) {
                throw new Error('Invalid lobby response')
            }

            setLobby(lobbyPayload as Lobby)
            setGame(activeGame as Game | null)

            // Initialize game engine if game exists
            if (activeGame?.state) {
                const engine = new TicTacToeGame(activeGame.id)
                const parsedState = typeof activeGame.state === 'string'
                    ? JSON.parse(activeGame.state || '{}')
                    : activeGame.state

                if (parsedState && typeof parsedState === 'object') {
                    engine.restoreState(parsedState)
                }

                setGameEngine(engine)
            } else {
                setGameEngine((previous) => {
                    if (previous?.getState().status === 'finished') {
                        return previous
                    }
                    return null
                })
            }

            setLoading(false)
        } catch (error) {
            clientLogger.error('Error loading lobby:', error)
            showToast.error('errors.unexpected')
            setLoading(false)
        }
    }, [code, router])

    // Handle move submission
    const handleMove = useCallback(async (move: Move) => {
        if (!gameEngine || !game || isMoveSubmitting) return

        try {
            const userId = getCurrentUserId()
            if (!userId) return

            // Process move on a cloned engine first, then update UI immediately.
            const optimisticEngine = new TicTacToeGame(game.id)
            optimisticEngine.restoreState(gameEngine.getState())

            if (!optimisticEngine.validateMove(move)) {
                showToast.error('tictactoe.ui.invalidMove')
                return
            }

            optimisticEngine.processMove(move)
            const optimisticState = optimisticEngine.getState()
            setGameEngine(optimisticEngine)
            setGame((prevGame) => {
                if (!prevGame) return prevGame
                return {
                    ...prevGame,
                    status: optimisticState.status as Game['status'],
                    currentTurn: optimisticState.currentPlayerIndex,
                    state: JSON.stringify(optimisticState),
                }
            })
            setIsMoveSubmitting(true)

            // Send to server using main state route
            const res = await fetchWithGuest(`/api/game/${game.id}/state`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gameId: game.id,
                    move,
                    userId,
                }),
            })

            const data = await res.json()

            if (!res.ok) {
                clientLogger.error('Move failed:', data.error)
                showToast.error('errors.moveFailed')
                // Reload game state from server
                await loadLobby()
                return
            }

            const authoritativeState = data?.game?.state
            if (authoritativeState) {
                const authoritativeEngine = new TicTacToeGame(game.id)
                authoritativeEngine.restoreState(authoritativeState)
                setGameEngine(authoritativeEngine)
                setGame((prevGame) => {
                    if (!prevGame) return prevGame
                    return {
                        ...prevGame,
                        status: data?.game?.status ?? prevGame.status,
                        currentTurn: authoritativeState.currentPlayerIndex,
                        state: JSON.stringify(authoritativeState),
                    }
                })
            }

            // Notify other players via Socket
            if (socket?.connected) {
                socket.emit('game-move', {
                    lobbyCode: code,
                    gameId: game.id,
                    move,
                    state: optimisticState,
                    playerId: userId,
                })
            }

            // Check win condition
            const winner = optimisticEngine.checkWinCondition()
            if (winner || optimisticEngine.getState().status === 'finished') {
                if (winner) {
                    showToast.success('common.success')
                } else {
                    showToast.info('game.ui.gameFinished')
                }
            }
        } catch (error) {
            clientLogger.error('Error making move:', error)
            showToast.error('errors.unexpected')
            await loadLobby()
        } finally {
            setIsMoveSubmitting(false)
        }
    }, [gameEngine, game, socket, code, getCurrentUserId, loadLobby, isMoveSubmitting])

    // Socket connection
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

            if (!socketAuth) {
                clientLogger.warn('Skipping Tic-Tac-Toe socket connection: auth payload unavailable')
                return
            }

            if (!isMounted) {
                return
            }

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
                clientLogger.log('✅ Socket connected for Tic-Tac-Toe')
                newSocket.emit('join-lobby', code)
            })

            newSocket.on('game-update', (payload: any) => {
                clientLogger.log('📡 Game update received:', payload)
                // Reload to get latest state from server
                loadLobby()
            })

            newSocket.on('disconnect', () => {
                clientLogger.log('❌ Socket disconnected from Tic-Tac-Toe')
            })

            setSocket(newSocket)
        }

        void initSocket()

        return () => {
            isMounted = false
            if (activeSocket?.connected) {
                activeSocket.emit('leave-lobby', code)
                activeSocket.disconnect()
            } else {
                activeSocket?.close()
            }
        }
    }, [status, isGuest, guestToken, code, loadLobby])

    const isMyTurn = useCallback(() => {
        if (!gameEngine || !game) return false
        const currentPlayer = gameEngine.getCurrentPlayer()
        return currentPlayer?.id === getCurrentUserId()
    }, [gameEngine, game, getCurrentUserId])

    const handleLeave = async () => {
        try {
            await fetchWithGuest(`/api/lobby/${code}/leave`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            })

            if (socket?.connected) {
                socket.emit('leave-lobby', code)
                socket.disconnect()
            }

            router.push('/games')
        } catch (error) {
            clientLogger.error('Error leaving lobby:', error)
            showToast.error('errors.unexpected')
        }
    }

    const handlePlayAgain = useCallback(async () => {
        if (!lobby || !game || !gameEngine) {
            router.push(`/lobby/${code}`)
            return
        }

        const userId = getCurrentUserId()
        if (!userId) {
            router.push(`/lobby/${code}`)
            return
        }

        const gameData = gameEngine.getState().data as TicTacToeGameData
        const targetRounds = gameData.match?.targetRounds ?? null
        const roundsPlayed = gameData.match?.roundsPlayed ?? 0
        const isMatchComplete = targetRounds !== null && roundsPlayed >= targetRounds

        setIsRematchSubmitting(true)
        try {
            if (!isMatchComplete) {
                const response = await fetchWithGuest(`/api/game/${game.id}/state`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        gameId: game.id,
                        move: {
                            type: 'next-round',
                            data: {},
                        },
                        userId,
                    }),
                })

                const data = await response.json().catch(() => null)
                if (!response.ok) {
                    const errorMessage =
                        (typeof data?.details === 'string' && data.details) ||
                        (typeof data?.error === 'string' && data.error) ||
                        'Failed to start next round'
                    throw new Error(errorMessage)
                }

                const authoritativeState = data?.game?.state
                if (authoritativeState) {
                    const authoritativeEngine = new TicTacToeGame(game.id)
                    authoritativeEngine.restoreState(authoritativeState)
                    setGameEngine(authoritativeEngine)
                    setGame((prevGame) => {
                        if (!prevGame) return prevGame
                        return {
                            ...prevGame,
                            status: data?.game?.status ?? prevGame.status,
                            currentTurn: authoritativeState.currentPlayerIndex,
                            state: JSON.stringify(authoritativeState),
                        }
                    })
                } else {
                    await loadLobby()
                }

                showToast.success('toast.success', t('lobby.game.next_round'))
                return
            }

            const isCreator = lobby.creatorId === userId
            if (!isCreator) {
                showToast.info('toast.info', t('game.ui.waitingForHost'))
                return
            }

            const response = await fetchWithGuest('/api/game/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gameType: 'tic_tac_toe',
                    lobbyId: lobby.id,
                }),
            })

            const data = await response.json().catch(() => null)
            if (!response.ok) {
                const errorMessage =
                    (typeof data?.details === 'string' && data.details) ||
                    (typeof data?.error === 'string' && data.error) ||
                    'Failed to start rematch'
                throw new Error(errorMessage)
            }

            await loadLobby()
            showToast.success('toast.success', t('games.tictactoe.game.playAgain'))
        } catch (error) {
            clientLogger.error('Failed to continue Tic-Tac-Toe match:', error)
            showToast.error('errors.unexpected')
        } finally {
            setIsRematchSubmitting(false)
        }
    }, [code, game, gameEngine, getCurrentUserId, lobby, loadLobby, router, t])

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
                    <h1 className="text-2xl font-bold mb-4">{t('games.tictactoe.game.lobbyNotFoundTitle')}</h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                        {t('games.tictactoe.game.lobbyNotFoundDescription')}
                    </p>
                    <button
                        onClick={() => router.push('/games')}
                        className="btn btn-primary"
                    >
                        {t('games.tictactoe.game.backToLobbies')}
                    </button>
                </div>
            </div>
        )
    }

    const resolvedStatus = game?.status || gameEngine?.getState().status
    const isFinished = resolvedStatus === 'finished' || gameEngine?.getState().status === 'finished'

    if (!gameEngine || (resolvedStatus !== 'playing' && resolvedStatus !== 'finished')) {
        return (
            <div className="container mx-auto px-4 py-8">
                <div className="card max-w-md mx-auto text-center">
                    <h1 className="text-2xl font-bold mb-4">{t('games.tictactoe.game.gameNotStartedTitle')}</h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                        {t('games.tictactoe.game.gameNotStartedDescription')}
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <button
                            onClick={() => router.push('/games')}
                            className="btn btn-primary"
                        >
                            {t('games.tictactoe.game.backToLobbies')}
                        </button>
                        <button
                            onClick={() => router.push('/games')}
                            className="btn btn-secondary"
                        >
                            {t('games.tictactoe.game.backToGames')}
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    const state = gameEngine.getState()
    const gameData = state.data as TicTacToeGameData
    const players = game?.players || []
    const currentPlayer = gameEngine.getCurrentPlayer()
    const winner = gameEngine.checkWinCondition()
    const match = gameData.match
    const roundsPlayed = match?.roundsPlayed ?? 0
    const targetRounds = match?.targetRounds ?? null
    const isMatchComplete = targetRounds !== null && roundsPlayed >= targetRounds
    const currentUserId = getCurrentUserId()
    const isLobbyCreator = currentUserId === lobby.creatorId
    const myPlayerIndex = state.players.findIndex((player) => player.id === currentUserId)
    const mySymbol: PlayerSymbol | null = myPlayerIndex === 0 ? 'X' : myPlayerIndex === 1 ? 'O' : null
    const opponentSymbol: PlayerSymbol | null =
        mySymbol === 'X' ? 'O' : mySymbol === 'O' ? 'X' : null
    const myWins = mySymbol ? (match?.winsBySymbol[mySymbol] ?? 0) : 0
    const myLosses = opponentSymbol ? (match?.winsBySymbol[opponentSymbol] ?? 0) : 0
    const draws = match?.draws ?? 0

    return (
        <div className="container mx-auto px-4 py-8 max-w-6xl">
            {/* Header */}
            <div className="mb-8">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <span>❌⭕</span> {t('games.tictactoe.name')}
                    </h1>
                    <button
                        onClick={() => setShowLeaveConfirmModal(true)}
                        className="btn btn-danger"
                    >
                        {t('game.ui.leave')}
                    </button>
                </div>

                {/* Game Status */}
                <div className="bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 rounded-lg p-4">
                    {isFinished ? (
                        <div className="text-center">
                            <p className="text-xl font-bold text-blue-900 dark:text-blue-100">
                                {winner ? (
                                    <>{t('games.tictactoe.game.gameWon')}</>
                                ) : (
                                    <>{t('games.tictactoe.game.draw')}</>
                                )}
                            </p>
                            <p className="mt-2 text-sm text-blue-800 dark:text-blue-200">
                                {targetRounds === null
                                    ? t('games.tictactoe.game.roundProgressUnlimited', { count: roundsPlayed })
                                    : t('games.tictactoe.game.roundProgress', {
                                        current: Math.min(roundsPlayed, targetRounds),
                                        total: targetRounds,
                                    })}
                            </p>
                            {isMatchComplete && (
                                <p className="text-xs font-semibold text-blue-900 dark:text-blue-100 mt-1">
                                    {t('games.tictactoe.game.matchComplete')}
                                </p>
                            )}
                        </div>
                    ) : (
                        <>
                            <p className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
                                {t('game.ui.turn')}: {currentPlayer?.name || t('games.tictactoe.game.unknownPlayer')}
                            </p>
                            <p className="text-sm text-blue-800 dark:text-blue-200">
                                {isMyTurn() ? '👉 ' + t('game.ui.yourTurn') : '⏳ ' + t('game.ui.waiting')}
                            </p>
                            <p className="text-xs text-blue-800 dark:text-blue-200 mt-2">
                                {targetRounds === null
                                    ? t('games.tictactoe.game.roundProgressUnlimited', { count: roundsPlayed })
                                    : t('games.tictactoe.game.roundProgress', {
                                        current: Math.min(roundsPlayed + 1, targetRounds),
                                        total: targetRounds,
                                    })}
                            </p>
                        </>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Game Board */}
                <div className="lg:col-span-2">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
                        <TicTacToeGameBoard
                            game={gameEngine}
                            currentPlayerId={getCurrentUserId() || ''}
                            onMove={handleMove}
                            disabled={!isMyTurn() || isFinished || isMoveSubmitting}
                        />
                    </div>
                </div>

                {/* Players List */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                    <div className="mb-5 p-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/40">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
                            {t('games.tictactoe.game.matchScore')}
                        </h3>
                        <p className="text-sm text-gray-700 dark:text-gray-200">
                            {targetRounds === null
                                ? t('games.tictactoe.game.roundProgressUnlimited', { count: roundsPlayed })
                                : t('games.tictactoe.game.roundProgress', {
                                    current: Math.min(roundsPlayed, targetRounds),
                                    total: targetRounds,
                                })}
                        </p>
                        {mySymbol && (
                            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                                {mySymbol}: {t('games.tictactoe.game.wins')} {myWins} · {t('games.tictactoe.game.losses')} {myLosses} · {t('games.tictactoe.game.draws')} {draws}
                            </p>
                        )}
                    </div>
                    <h2 className="text-xl font-bold mb-4">{t('lobby.title')}</h2>
                    <div className="space-y-3">
                        {players.map((player) => {
                            const engineIndex = state.players.findIndex((enginePlayer) => enginePlayer.id === player.userId)
                            const symbol: PlayerSymbol = engineIndex === 1 ? 'O' : 'X'
                            const wins = match?.winsBySymbol[symbol] ?? 0
                            const losses = match?.winsBySymbol[symbol === 'X' ? 'O' : 'X'] ?? 0

                            return (
                            <div
                                key={player.id}
                                className={`p-3 rounded-lg border-2 ${currentPlayer?.id === player.userId
                                    ? 'bg-green-100 dark:bg-green-900/30 border-green-500'
                                    : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600'
                                    }`}
                            >
                                <p className="font-semibold text-gray-900 dark:text-white">
                                    {player.user?.username || player.name || t('games.tictactoe.game.unknownPlayer')} ({symbol})
                                </p>
                                <p className="text-xs text-gray-600 dark:text-gray-300">
                                    {t('games.tictactoe.game.wins')}: {wins} · {t('games.tictactoe.game.losses')}: {losses}
                                </p>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    {currentPlayer?.id === player.userId && t('games.tictactoe.game.currentTurn')}
                                </p>
                            </div>
                            )
                        })}
                    </div>

                    {/* Results */}
                    {isFinished && (
                        <div className="mt-6 pt-6 border-t border-gray-300 dark:border-gray-600">
                            <h3 className="text-lg font-bold mb-3">{t('games.tictactoe.game.gameActions')}</h3>
                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={handlePlayAgain}
                                    className="w-full btn btn-primary"
                                    disabled={isRematchSubmitting || (isMatchComplete && !isLobbyCreator)}
                                >
                                    {isRematchSubmitting
                                        ? t('common.loading')
                                        : isMatchComplete
                                            ? isLobbyCreator
                                                ? t('games.tictactoe.game.newMatch')
                                                : t('game.ui.waitingForHost')
                                            : t('games.tictactoe.game.nextRound')}
                                </button>
                                <button
                                    onClick={() => router.push('/games')}
                                    className="w-full btn btn-secondary"
                                >
                                    {t('games.tictactoe.game.backToGames')}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Leave Confirmation Modal */}
            <ConfirmModal
                isOpen={showLeaveConfirmModal}
                onClose={() => setShowLeaveConfirmModal(false)}
                onConfirm={handleLeave}
                title={t('game.ui.leave')}
                message={t('game.ui.leaveConfirm')}
                confirmText={t('common.confirm')}
                cancelText={t('common.cancel')}
                variant="danger"
                icon="🚪"
            />
        </div>
    )
}
