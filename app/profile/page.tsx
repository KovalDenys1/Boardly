'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

export default function ProfilePage() {
  const { data: session, update, status } = useSession()
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (session?.user?.name) {
      setUsername(session.user.name)
    }
  }, [session])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/auth/login')
    }
  }, [status, router])

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!username.trim()) {
      toast.error('Username cannot be empty')
      return
    }

    if (username.length < 3) {
      toast.error('Username must be at least 3 characters')
      return
    }

    if (username.length > 20) {
      toast.error('Username must be less than 20 characters')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update profile')
      }

      // Update session with new username
      await update({
        ...session,
        user: {
          ...session?.user,
          name: username,
        },
      })

      toast.success('✅ Profile updated successfully!')
    } catch (error: any) {
      toast.error(error.message || 'Failed to update profile')
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

  if (status === 'unauthenticated') {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 p-4">
      <div className="max-w-2xl mx-auto pt-20">
        <div className="card animate-scale-in">
          <div className="mb-6">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 mb-4">
              <span className="text-4xl">👤</span>
            </div>
            <h1 className="text-3xl font-bold mb-2">Profile Settings</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Manage your account settings
            </p>
          </div>

          <form onSubmit={handleUpdateProfile} className="space-y-6">
            {/* Email (read-only) */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Email
              </label>
              <input
                type="email"
                value={session?.user?.email || ''}
                disabled
                className="input bg-gray-100 dark:bg-gray-700 cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 mt-1">
                Email cannot be changed
              </p>
            </div>

            {/* Username */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Username *
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                className="input"
                minLength={3}
                maxLength={20}
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                3-20 characters. This is the name other players will see.
              </p>
            </div>

            {/* User ID (for reference) */}
            <div>
              <label className="block text-sm font-medium mb-2">
                User ID
              </label>
              <input
                type="text"
                value={session?.user?.id || ''}
                disabled
                className="input bg-gray-100 dark:bg-gray-700 cursor-not-allowed font-mono text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Your unique identifier
              </p>
            </div>

            {/* Account Type */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Account Type
              </label>
              <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-300 dark:border-blue-600 rounded-lg">
                <p className="text-blue-700 dark:text-blue-300 font-semibold">
                  {session?.user?.email?.includes('@') ? '📧 Email Account' : '🔐 OAuth Account'}
                </p>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex gap-4">
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary flex-1"
              >
                {loading ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Saving...
                  </>
                ) : (
                  <>
                    <span className="mr-2">💾</span>
                    Save Changes
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            </div>
          </form>

          {/* Danger Zone */}
          <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
              🚨 Danger Zone
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Account deletion and other destructive actions will be available here in the future.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
