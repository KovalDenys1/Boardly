'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import LoadingSpinner from '@/components/LoadingSpinner'
import { trackAuth, trackError, trackFunnelStep } from '@/lib/analytics'

export default function LobbyInvitePage() {
  const router = useRouter()
  const params = useParams()
  const { data: session, status } = useSession()
  const code = params.code as string
  const [guestName, setGuestName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (status === 'loading') return

    if (status === 'authenticated') {
      // User is logged in, redirect to lobby
      router.push(`/lobby/${code}`)
    }
  }, [status, code, router])

  const handleGuestJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!guestName.trim()) {
      setError('Please enter your name')
      return
    }

    if (guestName.trim().length < 2 || guestName.trim().length > 20) {
      setError('Name must be 2-20 characters')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Generate guest ID
      const guestId = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      // Save guest data to localStorage
      localStorage.setItem('guestName', guestName.trim())
      localStorage.setItem('guestId', guestId)
      localStorage.setItem('isGuest', 'true')
      
      // Call API to add guest to lobby
      const response = await fetch(`/api/lobby/${code}/join-guest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          guestId,
          guestName: guestName.trim(),
        }),
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        trackError({
          errorType: 'auth',
          errorMessage: data.error || 'Guest join failed',
          component: 'LobbyInvitePage',
          severity: 'medium',
        })
        throw new Error(data.error || 'Failed to join lobby')
      }
      
      // Track successful guest join
      trackAuth({
        event: 'login',
        method: 'guest',
        success: true,
        userId: guestId,
      })
      trackFunnelStep('guest-join')
      
      // Redirect to lobby as guest
      router.push(`/lobby/${code}?guest=true`)
    } catch (err: any) {
      setError(err.message || 'Failed to join as guest')
      setLoading(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
        <LoadingSpinner />
      </div>
    )
  }

  if (status === 'authenticated') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
        <div className="card max-w-md text-center">
          <div className="mb-6">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 mb-4">
              <span className="text-4xl animate-bounce">🎮</span>
            </div>
            <h1 className="text-2xl font-bold mb-2">Joining Lobby...</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Redirecting you to the game
            </p>
          </div>
          <LoadingSpinner />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
      <div className="card max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 mb-4">
            <span className="text-4xl">🎮</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">Join Game</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Lobby Code: <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{code}</span>
          </p>
        </div>

        {/* Guest Join Form */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span>👤</span>
            Play as Guest
          </h2>
          <form onSubmit={handleGuestJoin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Your Name
              </label>
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Enter your name"
                className="input"
                disabled={loading}
                maxLength={20}
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                No account needed - just enter your name and play!
              </p>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !guestName.trim()}
              className="btn-primary w-full"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <LoadingSpinner />
                  Joining...
                </span>
              ) : (
                'Join as Guest'
              )}
            </button>
          </form>
        </div>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-white dark:bg-gray-800 text-gray-500">or</span>
          </div>
        </div>

        {/* Login/Register Options */}
        <div className="space-y-3">
          <button
            onClick={() => router.push(`/auth/login?returnUrl=${encodeURIComponent(`/lobby/${code}`)}`)}
            className="btn-secondary w-full"
          >
            Sign In
          </button>
          <button
            onClick={() => router.push(`/auth/register?returnUrl=${encodeURIComponent(`/lobby/${code}`)}`)}
            className="btn-outline w-full"
          >
            Create Account
          </button>
        </div>

        <p className="text-xs text-center text-gray-500 mt-4">
          💡 Create an account to save your game history and compete in leaderboards
        </p>
      </div>
    </div>
  )
}
