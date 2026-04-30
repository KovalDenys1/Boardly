'use client'

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
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

  const authShell = (children: ReactNode) => (
    <div
      className="page-shell-full flex items-center justify-center p-4"
      style={{
        background:
          'radial-gradient(circle at 12% 8%, rgba(255,196,77,0.18), transparent 35%), radial-gradient(circle at 88% 14%, rgba(155,140,255,0.16), transparent 40%), radial-gradient(circle at 50% 100%, rgba(79,201,166,0.14), transparent 50%), var(--bd-bg)',
      }}
    >
      {children}
    </div>
  )

  if (token && loading) {
    return authShell(
      <div className="bd-card w-full max-w-sm p-8 text-center">
        <LoadingSpinner />
        <p className="mt-4 text-sm font-semibold text-bd-ink-soft">{t('auth.verifyEmail.verifying')}</p>
      </div>
    )
  }

  return authShell(
    <div className="bd-card w-full max-w-sm p-8 text-center">
      <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-3xl border-2 border-bd-ink bg-bd-sun text-4xl shadow-[4px_4px_0_#1F1B16]">
        📧
      </div>

      <h1
        className="mb-3 text-3xl font-extrabold text-bd-ink"
        style={{ fontFamily: 'var(--bd-font-display)' }}
      >
        {t('auth.verifyEmail.title')}
      </h1>

      <p className="mb-6 text-sm leading-6 text-bd-ink-soft">
        {t('auth.verifyEmail.description')}
      </p>

      {sent && (
        <div className="mb-4 rounded-xl border border-bd-mint/40 bg-bd-mint/10 px-4 py-3 text-sm font-semibold text-bd-mint-deep">
          ✓ {t('auth.verifyEmail.emailSent')}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <button
          onClick={resendVerification}
          disabled={loading || sent}
          className="bd-btn bd-btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
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
          className="bd-btn bd-btn-ghost w-full justify-center"
        >
          {t('auth.verifyEmail.backToHome')}
        </button>
      </div>
    </div>
  )
}
