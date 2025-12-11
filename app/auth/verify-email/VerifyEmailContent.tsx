'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import LoadingSpinner from '@/components/LoadingSpinner'
import { useToast } from '@/contexts/ToastContext'

export default function VerifyEmailContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, update } = useSession()
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const token = searchParams.get('token')

  const verifyEmail = useCallback(async (verificationToken: string) => {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: verificationToken }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Verification failed')
      }

      toast.success('Email verified successfully! You can now play.')
      
      // Update session to reflect emailVerified status
      await update()
      
      setTimeout(() => router.push('/'), 2000)
    } catch (err: any) {
      toast.error(err.message || 'Verification failed')
    } finally {
      setLoading(false)
    }
  }, [router, toast, update])

  useEffect(() => {
    if (token) {
      verifyEmail(token)
    }
  }, [token, verifyEmail])

  const resendVerification = async () => {
    if (!session?.user?.email) {
      toast.error('Please log in to resend verification email')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: session.user.email }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to resend email')
      }

      setSent(true)
      toast.success('Verification email sent! Check your inbox.')
      
      // Update session to refresh emailVerified status
      await update()
    } catch (err: any) {
      toast.error(err.message || 'Failed to resend email')
    } finally {
      setLoading(false)
    }
  }

  if (token && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 p-4">
        <div className="card max-w-md w-full text-center">
          <LoadingSpinner />
          <p className="mt-4 text-gray-600 dark:text-gray-400">Verifying your email...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 p-4">
      <div className="card max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-100 dark:bg-blue-900/20 mb-6">
          <span className="text-5xl">📧</span>
        </div>

        <h1 className="text-3xl font-bold mb-4 text-gray-900 dark:text-white">
          Verify Your Email
        </h1>

        <p className="text-gray-600 dark:text-gray-400 mb-6">
          We've sent a verification link to your email address. Please check your inbox and click the link to verify your account.
        </p>

        {sent && (
          <div className="bg-green-100 dark:bg-green-900/20 border border-green-400 dark:border-green-600 text-green-700 dark:text-green-400 px-4 py-3 rounded mb-4">
            ✓ Verification email sent! Check your inbox.
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={resendVerification}
            disabled={loading || sent}
            className="btn btn-primary w-full"
          >
            {loading ? (
              <>
                <LoadingSpinner />
                <span className="ml-2">Sending...</span>
              </>
            ) : sent ? (
              'Email Sent ✓'
            ) : (
              'Resend Verification Email'
            )}
          </button>

          <button
            onClick={() => router.push('/')}
            className="btn btn-secondary w-full"
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  )
}
