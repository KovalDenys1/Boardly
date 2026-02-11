'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { io, Socket } from 'socket.io-client'
import LoadingSpinner from '@/components/LoadingSpinner'
import RockPaperScissorsGameBoard from '@/components/RockPaperScissorsGameBoard'
import { RockPaperScissorsGameData, RPSChoice } from '@/lib/games/rock-paper-scissors-game'
import { clientLogger } from '@/lib/client-logger'
import { getBrowserSocketUrl } from '@/lib/socket-url'
import { showToast } from '@/lib/i18n-toast'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'

interface RPSGame {
    id: string
    lobbyCode: string
    gameType: string
    status: 'waiting' | 'playing' | 'finished'
    currentPlayerIndex: number
    players: Array<{ id: string; name: string }>
    data: RockPaperScissorsGameData
}

interface LobbyData {
    id: string
    code: string
    status: 'waiting' | 'playing' | 'finished'
    gameId?: string
    game?: RPSGame
}

interface RockPaperScissorsLobbyPageProps {
    code: string
}

export default function RockPaperScissorsLobbyPage({ code }: RockPaperScissorsLobbyPageProps) {
    const router = useRouter()
    const { data: session, status } = useSession()
    const { isGuest, guestToken, guestId, guestName } = useGuest()
    const { t } = useTranslation()

    const [loading, setLoading] = useState(true)
    const [lobby, setLobby] = useState<LobbyData | null>(null)
    const [socket, setSocket] = useState<Socket | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const socketRef = useRef<Socket | null>(null)
    const loadedRef = useRef(false)

    const getCurrentUserId = useCallback(() => {
        return isGuest ? guestId : session?.user?.id
    }, [isGuest, guestId, session?.user?.id])

    // Load lobby from API
    const loadLobbyData = useCallback(async () => {
        try {
            const res = await fetchWithGuest(`/api/lobby/${code}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            })

            if (!res.ok) throw new Error('Failed to load lobby')
            const data = await res.json()
            setLobby(data)
        } catch (err) {
            clientLogger.error('Failed to load lobby:', err)
            setError(t('errors.failed_to_load_lobby'))
        } finally {
            setLoading(false)
        }
    }, [code, t])

    // Initialize Socket.IO connection
    useEffect(() => {
        if (loadedRef.current) return
        loadedRef.current = true

        const initSocket = async () => {
            try {
                // Wait for session/guest to be ready
                if (status === 'loading') return
                if (!isGuest && status === 'unauthenticated') {
                    router.push('/login')
                    return
                }
                if (isGuest && !guestToken) return

                // Load initial lobby data
                await loadLobbyData()

                // Initialize Socket.IO
                const socketUrl = getBrowserSocketUrl()
                const newSocket = io(socketUrl, {
                    reconnection: true,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 5000,
                    reconnectionAttempts: 5,
                })

                socketRef.current = newSocket
                setSocket(newSocket)

                // Join lobby room
                newSocket.emit('join-lobby', code)
                clientLogger.log('🔌 RPS: Connected to Socket.IO and joined lobby')

                // Listen for updates
                newSocket.on('game-update', async () => {
                    await loadLobbyData()
                    clientLogger.log('📡 RPS: Received game update')
                })

                newSocket.on('lobby-update', async () => {
                    await loadLobbyData()
                    clientLogger.log('📡 RPS: Received lobby update')
                })

                newSocket.on('disconnect', () => {
                    clientLogger.log('🔌 RPS: Socket disconnected')
                })
            } catch (err) {
                clientLogger.error('RPS socket error:', err)
            }
        }

        initSocket()

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect()
            }
        }
    }, [code, status, isGuest, guestToken, loadLobbyData, router, t])

    const handleSubmitChoice = async (choice: RPSChoice) => {
        if (!lobby?.game) return

        setIsSubmitting(true)
        try {
            const res = await fetchWithGuest(`/api/game/${lobby.game.id}/move`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'submit-choice',
                    data: { choice },
                }),
            })

            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || 'Failed to submit choice')
            }

            // Reload lobby to show updated game state
            await loadLobbyData()
            clientLogger.log(`🎮 RPS: Submitted choice: ${choice}`)
            showToast.success('game.move_submitted')
        } catch (err) {
            clientLogger.error('Failed to submit choice:', err)
            setError(err instanceof Error ? err.message : t('errors.failed_to_submit_move'))
            showToast.error('errors.failed_to_submit_move')
        } finally {
            setIsSubmitting(false)
        }
    }

    if (loading) return <LoadingSpinner />

    if (error || !lobby || !lobby.game) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
                <div className="bg-red-900/30 border border-red-500 rounded-lg p-6 max-w-md text-center">
                    <p className="text-red-200">{error || t('errors.game_not_found')}</p>
                    <button
                        onClick={() => router.push(`/lobby/${code}`)}
                        className="mt-4 bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded"
                    >
                        {t('common.back')}
                    </button>
                </div>
            </div>
        )
    }

    const currentUserId = getCurrentUserId()
    const currentPlayer = lobby.game.players.find((p) => p.id === currentUserId)
    const gameData = lobby.game.data as RockPaperScissorsGameData

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">🍂 {t('games.rock_paper_scissors.name')}</h1>
                    <p className="text-gray-400">{t('game.code')}: {code.toUpperCase()}</p>
                </div>

                {/* Players Info */}
                <div className="grid grid-cols-2 gap-4 mb-8">
                    {lobby.game.players.map((player, idx) => (
                        <div
                            key={player.id}
                            className={`${player.id === currentUserId ? 'bg-indigo-900 border-indigo-500' : 'bg-slate-800 border-slate-700'
                                } rounded-lg p-4 border`}
                        >
                            <p className="text-xs text-gray-400">
                                {player.id === currentUserId ? `👤 ${t('game.you')}` : `👥 ${t('game.opponent')}`}
                            </p>
                            <p className="text-lg font-bold text-white">{player.name}</p>
                            <p className="text-sm text-indigo-300 mt-2">
                                {t('game.score')}: <span className="font-bold">{gameData.scores[player.id] || 0}</span>
                            </p>
                        </div>
                    ))}
                </div>

                {/* Game Board */}
                {currentPlayer && (
                    <RockPaperScissorsGameBoard
                        gameData={gameData}
                        playerId={currentPlayer.id}
                        playerName={currentPlayer.name}
                        onSubmitChoice={handleSubmitChoice}
                        isLoading={isSubmitting}
                    />
                )}

                {/* Back to Lobby Button */}
                <div className="mt-8">
                    <button
                        onClick={() => router.push(`/lobby/${code}`)}
                        className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-4 rounded-lg transition"
                    >
                        {t('game.back_to_lobby')}
                    </button>
                </div>
            </div>
        </div>
    )
}
