'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { TicTacToeGame } from '@/lib/games/tic-tac-toe-game'
import { io, Socket } from 'socket.io-client'
import { getBrowserSocketUrl } from '@/lib/socket-url'
import { clientLogger } from '@/lib/client-logger'
import { useTranslation } from '@/lib/i18n-helpers'
import { showToast } from '@/lib/i18n-toast'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { Game } from '@/types/game'
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
    const { isGuest, guestToken, guestId, guestName } = useGuest()
    const { t } = useTranslation()

    const [loading, setLoading] = useState(true)
    const [lobby, setLobby] = useState<Lobby | null>(null)
    const [game, setGame] = useState<Game | null>(null)
    const [gameEngine, setGameEngine] = useState<TicTacToeGame | null>(null)
    const [socket, setSocket] = useState<Socket | null>(null)
    const [showLeaveConfirmModal, setShowLeaveConfirmModal] = useState(false)

    const getCurrentUserId = useCallback(() => {
        return isGuest ? guestId : session?.user?.id
    }, [isGuest, guestId, session?.user?.id])

    const pickRelevantActiveGame = useCallback((games: any[]) => {
        if (!Array.isArray(games) || games.length === 0) return null

        return [...games]
            .filter((candidate) => ['waiting', 'playing'].includes(candidate?.status))
            .sort((a, b) => {
                const aPriority = a.status === 'playing' ? 2 : a.status === 'waiting' ? 1 : 0
                const bPriority = b.status === 'playing' ? 2 : b.status === 'waiting' ? 1 : 0
                if (aPriority !== bPriority) return bPriority - aPriority

                const aUpdatedAt = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
                const bUpdatedAt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
                return bUpdatedAt - aUpdatedAt
            })[0] || null
    }, [])

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
                router.push('/games/tic-tac-toe/lobbies')
                return
            }

            const lobbyPayload = data?.lobby || data
            const activeGame = pickRelevantActiveGame(
                [data?.game, ...(Array.isArray(lobbyPayload?.games) ? lobbyPayload.games : [])].filter(Boolean)
            )

            setLobby(lobbyPayload)
            setGame(activeGame)

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
    }, [code, router, pickRelevantActiveGame])

    // Handle move submission
    const handleMove = useCallback(async (move: Move) => {
        if (!gameEngine || !game || !socket) return

        try {
            // Validate and process move locally first
            if (!gameEngine.validateMove(move)) {
                showToast.error('tictactoe.ui.invalidMove')
                return
            }

            gameEngine.processMove(move)
            const newState = gameEngine.getState()

            // Send to server using main state route
            const res = await fetchWithGuest(`/api/game/${game.id}/state`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gameId: game.id,
                    move,
                    userId: getCurrentUserId(),
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

            // Update local state
            setGameEngine(gameEngine)
            setGame(data.game)

            // Notify other players via Socket
            if (socket?.connected) {
                socket.emit('game-move', {
                    lobbyCode: code,
                    gameId: game.id,
                    move,
                    state: newState,
                    playerId: getCurrentUserId(),
                })
            }

            // Check win condition
            const winner = gameEngine.checkWinCondition()
            if (winner || gameEngine.getState().status === 'finished') {
                if (winner) {
                    showToast.success('common.success')
                } else {
                    showToast.info('game.ui.gameFinished')
                }
            }
        } catch (error) {
            clientLogger.error('Error making move:', error)
            showToast.error('errors.unexpected')
        }
    }, [gameEngine, game, socket, code, getCurrentUserId, loadLobby])

    // Socket connection
    useEffect(() => {
        if (status === 'loading' || (status === 'unauthenticated' && !isGuest)) return
        if (isGuest && !guestToken) return

        loadLobby()

        // Setup Socket
        const url = getBrowserSocketUrl()
        const token = session?.user?.id || guestToken || null

        const newSocket = io(url, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            auth: { token, isGuest },
            query: { token: String(token), isGuest: String(isGuest) },
        })

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

        return () => {
            if (newSocket?.connected) {
                newSocket.emit('leave-lobby', code)
                newSocket.disconnect()
            }
        }
    }, [status, isGuest, guestToken, code, loadLobby, session?.user?.id])

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

            router.push('/games/tic-tac-toe/lobbies')
        } catch (error) {
            clientLogger.error('Error leaving lobby:', error)
            showToast.error('errors.unexpected')
        }
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
                        onClick={() => router.push('/games/tic-tac-toe/lobbies')}
                        className="btn btn-primary"
                    >
                        Back to Lobbies
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
                    <h1 className="text-2xl font-bold mb-4">Game Not Started</h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                        The game hasn't started yet.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <button
                            onClick={() => router.push('/games/tic-tac-toe/lobbies')}
                            className="btn btn-primary"
                        >
                            Back to Lobbies
                        </button>
                        <button
                            onClick={() => router.push('/games')}
                            className="btn btn-secondary"
                        >
                            Back to Games
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    const players = game?.players || []
    const currentPlayer = gameEngine.getCurrentPlayer()
    const winner = gameEngine.checkWinCondition()

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
                                    <>🎉 Game Won! 🎉</>
                                ) : (
                                    <>🤝 It's a Draw!</>
                                )}
                            </p>
                        </div>
                    ) : (
                        <>
                            <p className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
                                {t('game.ui.turn')}: {currentPlayer?.name || 'Unknown'}
                            </p>
                            <p className="text-sm text-blue-800 dark:text-blue-200">
                                {isMyTurn() ? '👉 ' + t('game.ui.yourTurn') : '⏳ ' + t('game.ui.waiting')}
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
                            disabled={!isMyTurn() || isFinished}
                        />
                    </div>
                </div>

                {/* Players List */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                    <h2 className="text-xl font-bold mb-4">{t('lobby.title')}</h2>
                    <div className="space-y-3">
                        {players.map((player) => (
                            <div
                                key={player.id}
                                className={`p-3 rounded-lg border-2 ${currentPlayer?.id === player.userId
                                    ? 'bg-green-100 dark:bg-green-900/30 border-green-500'
                                    : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600'
                                    }`}
                            >
                                <p className="font-semibold text-gray-900 dark:text-white">
                                    {player.user?.username || player.name || 'Unknown'}
                                </p>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    {currentPlayer?.id === player.userId && '🎮 Current Turn'}
                                </p>
                            </div>
                        ))}
                    </div>

                    {/* Results */}
                    {isFinished && (
                        <div className="mt-6 pt-6 border-t border-gray-300 dark:border-gray-600">
                            <h3 className="text-lg font-bold mb-3">Game Actions</h3>
                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={() => router.push('/games/tic-tac-toe/lobbies')}
                                    className="w-full btn btn-primary"
                                >
                                    Play Again
                                </button>
                                <button
                                    onClick={() => router.push('/games')}
                                    className="w-full btn btn-secondary"
                                >
                                    Back to Games
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
