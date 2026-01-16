'use client'

import { useState, useEffect, Suspense, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { io } from 'socket.io-client'
import { getBrowserSocketUrl, getAuthHeaders } from '@/lib/socket-url'
import { clientLogger } from '@/lib/client-logger'
import { getGameInfo, getAvailableGames, getGameGradient, getGameLobbiesRoute } from '@/lib/game-config'
import { registerGameComponents } from '@/lib/game-registry-client'
import { GameMetadata } from '@/lib/game-registry'

type GameType = string

type GameInfo = {
  name: string
  emoji: string
  description: string
  gradient: string
  allowedPlayers: number[]
  defaultMaxPlayers: number
}

function CreateLobbyPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()
  
  // Register game components on mount
  useEffect(() => {
    registerGameComponents()
  }, [])
  
  const [selectedGameType, setSelectedGameType] = useState<GameType>((searchParams.get('gameType') as GameType) || 'yahtzee')
  
  // Get game info from registry
  const gameMetadata = useMemo(() => getGameInfo(selectedGameType), [selectedGameType])
  
  // Convert metadata to GameInfo format
  const gameInfo: GameInfo | null = useMemo(() => {
    if (!gameMetadata) return null
    
    return {
      name: gameMetadata.name,
      emoji: gameMetadata.emoji,
      description: gameMetadata.description,
      gradient: getGameGradient(gameMetadata.category),
      allowedPlayers: gameMetadata.allowedPlayers || 
        Array.from({ length: gameMetadata.maxPlayers - gameMetadata.minPlayers + 1 }, 
          (_, i) => gameMetadata.minPlayers + i),
      defaultMaxPlayers: gameMetadata.defaultMaxPlayers,
    }
  }, [gameMetadata])
  
  // Get available games for selector
  const availableGames = useMemo(() => getAvailableGames(), [])
  
  const [formData, setFormData] = useState({
    name: '',
    password: '',
    maxPlayers: 4, // Will be updated by useEffect when gameInfo is available
    gameType: selectedGameType as GameType,
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  
  // Guest mode support
  const [isGuest, setIsGuest] = useState(false)
  const [guestId, setGuestId] = useState<string>('')
  const [guestName, setGuestName] = useState<string>('')
  
  // Check if user is guest on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && status === 'unauthenticated') {
      const storedGuestName = localStorage.getItem('guestName')
      const storedGuestId = localStorage.getItem('guestId')
      if (storedGuestName && storedGuestId) {
        setIsGuest(true)
        setGuestId(storedGuestId)
        setGuestName(storedGuestName)
      }
    }
  }, [status])

  // Update formData when gameType changes from URL
  useEffect(() => {
    clientLogger.log('🎮 Game type selected:', selectedGameType)
    if (gameInfo) {
      setFormData(prev => ({
        ...prev,
        maxPlayers: gameInfo.defaultMaxPlayers,
        gameType: selectedGameType as GameType,
      }))
    }
  }, [selectedGameType, gameInfo])

  // Allow guests to create lobbies - no redirect to login
  
  // Validate game type - show error UI if invalid
  if (!gameInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-500 to-purple-600 flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-white mb-4">Game Not Found</h1>
          <p className="text-white/80 mb-6">
            The game type &quot;{selectedGameType}&quot; is not supported yet.
          </p>
          <button
            onClick={() => router.push('/games')}
            className="w-full bg-white text-purple-600 rounded-xl px-6 py-3 font-semibold hover:bg-white/90 transition-colors"
          >
            ← Back to Games
          </button>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Check if user is authenticated or guest
      if (!session && !isGuest) {
        // If not authenticated and not a guest, prompt for guest name or redirect to login
        const guestNameInput = prompt('Enter your name to play as guest (2-20 characters):')
        if (!guestNameInput || guestNameInput.length < 2 || guestNameInput.length > 20) {
          setError('Please enter a valid name (2-20 characters) or log in')
          setLoading(false)
          return
        }
        
        // Create guest ID and store in localStorage
        const newGuestId = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        localStorage.setItem('guestId', newGuestId)
        localStorage.setItem('guestName', guestNameInput)
        setIsGuest(true)
        setGuestId(newGuestId)
        setGuestName(guestNameInput)
      }

      clientLogger.log('📤 Sending lobby creation request:', formData)

      const headers = getAuthHeaders(isGuest || !session, guestId, guestName)

      const res = await fetch('/api/lobby', {
        method: 'POST',
        headers,
        body: JSON.stringify(formData),
      })

      const data = await res.json()
      clientLogger.log('📥 Received response:', { status: res.status, data })

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create lobby')
      }

      // Notify lobby list about new lobby via WebSocket
      const socketUrl = getBrowserSocketUrl()
      const token = session?.user?.id || guestId || null
      const isGuestMode = isGuest || !session
      
      const authPayload: Record<string, unknown> = {}
      if (token) authPayload.token = token
      authPayload.isGuest = isGuestMode

      const queryPayload: Record<string, string> = {}
      if (token) queryPayload.token = String(token)
      queryPayload.isGuest = String(isGuestMode)

      const socket = io(socketUrl, {
        transports: ['websocket', 'polling'],
        reconnection: false, // Don't reconnect for this one-time notification
        timeout: 5000,
        auth: authPayload,
        query: queryPayload,
      })
      
      // Set a timeout to force cleanup after 10 seconds
      const cleanupTimeout = setTimeout(() => {
        if (socket.connected) {
          socket.disconnect()
        }
      }, 10000)
      
      socket.on('connect', () => {
        socket.emit('lobby-created')
        clearTimeout(cleanupTimeout)
        socket.disconnect()
      })
      
      socket.on('connect_error', (error) => {
        clientLogger.warn('Socket notification failed (non-critical):', error.message)
        clearTimeout(cleanupTimeout)
        socket.disconnect()
      })

      clientLogger.log('✅ Lobby created successfully, redirecting to:', data.lobby.code)
      // Redirect to the new lobby (with guest parameter if guest)
      const redirectUrl = isGuestMode 
        ? `/lobby/${data.lobby.code}?guest=true`
        : `/lobby/${data.lobby.code}`
      router.push(redirectUrl)
    } catch (err) {
      clientLogger.error('❌ Lobby creation error:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to create lobby'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen bg-gradient-to-br ${gameInfo.gradient} py-12 px-4`}>
      <div className="max-w-2xl mx-auto">
        {/* Game Type Selector */}
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-2 text-white font-semibold">Choose Game</div>
          <div className="flex gap-4 flex-wrap justify-center">
            {availableGames.map((metadata) => {
              const gameId = metadata.id
              const isSelected = selectedGameType === gameId
              return (
                <button
                  key={gameId}
                  type="button"
                  onClick={() => setSelectedGameType(gameId)}
                  className={`flex flex-col items-center px-4 py-2 rounded-xl font-bold transition-all border-2 ${isSelected ? 'bg-white text-blue-600 border-blue-500 scale-105 shadow-lg' : 'bg-white/20 text-white border-transparent hover:bg-white/30'}`}
                >
                  <span className="text-2xl mb-1">{metadata.emoji}</span>
                  <span>{metadata.name}</span>
                </button>
              )
            })}
          </div>
        </div>
        {/* Breadcrumbs */}
        <div className="mb-6 flex items-center gap-2 text-white/80 text-sm">
          <button 
            onClick={() => router.push('/')}
            className="hover:text-white transition-colors"
          >
            🏠 Home
          </button>
          <span>›</span>
          <button 
            onClick={() => router.push('/games')}
            className="hover:text-white transition-colors"
          >
            🎮 Games
          </button>
          <span>›</span>
          <button 
            onClick={() => router.push(getGameLobbiesRoute(selectedGameType))}
            className="hover:text-white transition-colors"
          >
            {gameInfo.emoji} {gameInfo.name}
          </button>
          <span>›</span>
          <span className="text-white font-semibold">Create Lobby</span>
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm mb-6">
            <span className="text-5xl">{gameInfo.emoji}</span>
          </div>
          <h1 className="text-5xl font-bold text-white mb-4 drop-shadow-lg">Create {gameInfo.name} Lobby</h1>
          <p className="text-xl text-white/90">{gameInfo.description}</p>
        </div>

        {/* Form Card */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 border-2 border-white/20">
          <form onSubmit={handleSubmit} className="space-y-6" autoComplete="off">
            {/* Lobby Name */}
            <div>
              <label className="block text-sm font-bold text-white mb-2">
                🎮 Lobby Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g., Friday Night Game"
                className="w-full px-4 py-3 border-2 border-white/30 rounded-xl focus:ring-2 focus:ring-white focus:border-transparent bg-white/20 backdrop-blur-sm text-white placeholder-white/60 transition-all"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
              <p className="text-xs text-white/80 mt-1">
                Choose a memorable name for your lobby
              </p>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-bold text-white mb-2">
                🔒 Password (Optional)
              </label>
              <input
                type="password"
                autoComplete="new-password"
                name="lobby-password"
                id="lobby-password"
                placeholder="Leave empty for public lobby"
                className="w-full px-4 py-3 border-2 border-white/30 rounded-xl focus:ring-2 focus:ring-white focus:border-transparent bg-white/20 backdrop-blur-sm text-white placeholder-white/60 transition-all"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
              <p className="text-xs text-white/80 mt-1">
                Set a password to make your lobby private
              </p>
            </div>

            {/* Max Players */}
            <div>
              <label className="block text-sm font-bold text-white mb-2">
                👥 Maximum Players *
              </label>
              <div className={`grid gap-3 ${gameInfo.allowedPlayers.length === 1 ? 'grid-cols-1' : 'grid-cols-3'}`}>
                {gameInfo.allowedPlayers.map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setFormData({ ...formData, maxPlayers: num })}
                    className={`px-4 py-3 rounded-xl font-bold transition-all ${
                      formData.maxPlayers === num
                        ? 'bg-white text-blue-600 shadow-lg scale-105'
                        : 'bg-white/20 text-white hover:bg-white/30'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
              <p className="text-xs text-white/80 mt-2">
                Select how many players can join
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-500/20 border-2 border-red-400 text-white px-4 py-3 rounded-xl flex items-center gap-2 backdrop-blur-sm">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => router.push(getGameLobbiesRoute(selectedGameType))}
                className="flex-1 px-6 py-3 bg-white/20 text-white rounded-xl font-bold hover:bg-white/30 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-6 py-3 bg-white text-blue-600 rounded-xl font-bold hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-105 shadow-lg flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                    Creating...
                  </>
                ) : (
                  <>
                    <span>✨</span>
                    Create Lobby
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Info Section */}
          <div className="mt-8 pt-6 border-t-2 border-gray-200 dark:border-gray-700">
            <h3 className="font-bold text-gray-900 dark:text-white mb-3">💡 Quick Tips:</h3>
            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <li className="flex items-start gap-2">
                <span className="text-green-500 font-bold mt-0.5">✓</span>
                <span>You'll be automatically added as the first player</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 font-bold mt-0.5">✓</span>
                <span>Share the lobby code with friends to invite them</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 font-bold mt-0.5">✓</span>
                <span>Start the game when everyone is ready!</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

// Wrap component with Suspense for useSearchParams
export default function CreateLobbyPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600"><div className="text-white text-xl">Loading...</div></div>}>
      <CreateLobbyPage />
    </Suspense>
  )
}
