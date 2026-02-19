'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useTranslation } from '@/lib/i18n-helpers'
import LoadingSpinner from '@/components/LoadingSpinner'
import { showToast } from '@/lib/i18n-toast'

export default function VerifyEmailContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, update } = useSession()
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const token = searchParams.get('token')
  
  // Prevent duplicate verification requests
  const verificationAttemptedRef = useRef(false)
  const currentTokenRef = useRef<string | null>(null)
  const isVerifyingRef = useRef(false)

  const verifyEmail = useCallback(async (verificationToken: string) => {
    // Prevent duplicate requests for the same token
    if (verificationAttemptedRef.current && currentTokenRef.current === verificationToken) {
      return
    }
    
    // Prevent concurrent verification attempts
    if (isVerifyingRef.current) {
      return
    }
    
    verificationAttemptedRef.current = true
    currentTokenRef.current = verificationToken
    isVerifyingRef.current = true
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

      showToast.success('auth.verifyEmail.successMessage')
      
      // Update session to reflect emailVerified status
      await update()
      
      setTimeout(() => router.push('/'), 2000)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('auth.verifyEmail.error')
      showToast.error('auth.verifyEmail.errorMessage', errorMessage)
      // Reset on error to allow retry
      verificationAttemptedRef.current = false
      currentTokenRef.current = null
      isVerifyingRef.current = false
    } finally {
      setLoading(false)
    }
  }, [router, t, update])

  useEffect(() => {
    if (token && !verificationAttemptedRef.current) {
      verifyEmail(token)
    }
  }, [token, verifyEmail])

  const resendVerification = async () => {
    if (!session?.user?.email) {
      showToast.error('auth.verifyEmail.loginRequired')
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
      showToast.success('auth.verifyEmail.resendSuccess')
      
      // Update session to refresh emailVerified status
      await update()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('auth.verifyEmail.resendError')
      showToast.error('auth.verifyEmail.resendError', errorMessage)
    } finally {
      setLoading(false)
    }
  }

  if (token && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 p-4">
        <div className="card max-w-md w-full text-center">
          <LoadingSpinner />
          <p className="mt-4 text-gray-600 dark:text-gray-400">{t('auth.verifyEmail.verifying')}</p>
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
          {t('auth.verifyEmail.title')}
        </h1>

        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {t('auth.verifyEmail.description')}
        </p>

        {sent && (
          <div className="bg-green-100 dark:bg-green-900/20 border border-green-400 dark:border-green-600 text-green-700 dark:text-green-400 px-4 py-3 rounded mb-4">
            ✓ {t('auth.verifyEmail.emailSent')}
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
                <span className="ml-2">{t('auth.verifyEmail.sending')}</span>
              </>
            ) : sent ? (
              t('auth.verifyEmail.sent')
            ) : (
              t('auth.verifyEmail.resendButton')
            )}
          </button>

          <button
            onClick={() => router.push('/')}
            className="btn btn-secondary w-full"
          >
            {t('auth.verifyEmail.backToHome')}
          </button>
        </div>
      </div>
    </div>
  )
}
