'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { showToast } from '@/lib/i18n-toast'
import { signIn } from 'next-auth/react'
import LoadingSpinner from '@/components/LoadingSpinner'
import {
  buildAuthUrl,
  resolveReturnUrlFromSearchParams,
} from '@/lib/auth-redirect'

function OAuthErrorContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [merging, setMerging] = useState(false)

  const error = searchParams?.get('error')
  const provider = searchParams?.get('provider') || 'unknown'
  const returnUrl = resolveReturnUrlFromSearchParams(searchParams, '/profile')

  useEffect(() => {
    // Only handle OAuthAccountNotLinked error
    if (error !== 'OAuthAccountNotLinked') {
      // For other errors, show generic error message
      if (error) {
        showToast.error('toast.authError')
      }
      // Don't auto-redirect - let user see the error
    }
  }, [error])

  const getProviderName = () => {
    switch (provider) {
      case 'google': return 'Google'
      case 'github': return 'GitHub'
      case 'discord': return 'Discord'
      default: return provider
    }
  }

  const getProviderIcon = () => {
    switch (provider) {
      case 'google': return '🔵'
      case 'github': return '⚫'
      case 'discord': return '🟣'
      default: return '🔗'
    }
  }

  const handleTryAgain = () => {
    router.push(returnUrl)
  }

  const handleSignInWithProvider = async () => {
    setMerging(true)
    try {
      // Sign in with the OAuth provider
      // If successful and email matches, user will be prompted to merge accounts
      await signIn(provider, {
        callbackUrl: returnUrl
      })
    } catch (error) {
      console.error('Sign in error:', error)
      showToast.error('toast.signInFailed')
      setMerging(false)
    }
  }

  const handleSignInDifferent = () => {
    router.push(buildAuthUrl('login', returnUrl))
  }

  const authBg: React.CSSProperties = {
    background:
      'radial-gradient(circle at 12% 8%, rgba(255,196,77,0.18), transparent 35%), radial-gradient(circle at 88% 14%, rgba(155,140,255,0.16), transparent 40%), radial-gradient(circle at 50% 100%, rgba(79,201,166,0.14), transparent 50%), var(--bd-bg)',
  }

  if (status === 'loading') {
    return (
      <div className="page-shell-full flex items-center justify-center" style={authBg}>
        <LoadingSpinner />
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <div className="page-shell-full flex items-center justify-center overflow-y-auto p-4" style={authBg}>
        <div className="bd-card w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl border-2 border-bd-ink bg-bd-lav text-3xl shadow-[3px_3px_0_#1F1B16]">
            {getProviderIcon()}
          </div>
          <h1
            className="mb-3 text-2xl font-extrabold text-bd-ink"
            style={{ fontFamily: 'var(--bd-font-display)' }}
          >
            Email Already Registered
          </h1>
          <p className="mb-5 text-sm leading-6 text-bd-ink-soft">
            An account with this email already exists. You can either:
          </p>

          <div className="mb-6 space-y-3 text-left">
            <div className="rounded-xl border border-bd-lav/40 bg-bd-lav/10 p-4">
              <p className="text-sm font-bold text-bd-lav-deep">1️⃣ Sign in with {getProviderName()}</p>
              <p className="mt-1 text-xs text-bd-ink-soft">
                If this is your {getProviderName()} account, sign in to access your profile
              </p>
            </div>
            <div className="rounded-xl border border-bd-mint/40 bg-bd-mint/10 p-4">
              <p className="text-sm font-bold text-bd-mint-deep">2️⃣ Sign in with your existing account</p>
              <p className="mt-1 text-xs text-bd-ink-soft">
                Then link {getProviderName()} from your profile settings
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleSignInWithProvider}
              disabled={merging}
              className="bd-btn bd-btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
            >
              {merging ? 'Redirecting…' : `Sign in with ${getProviderName()}`}
            </button>
            <button onClick={handleSignInDifferent} className="bd-btn bd-btn-ghost w-full justify-center">
              Sign in with Email/Password
            </button>
          </div>
        </div>
      </div>
    )
  }

  // User is authenticated - different account trying to link
  return (
    <div className="page-shell-full flex items-center justify-center overflow-y-auto p-4" style={authBg}>
      <div className="bd-card w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl border-2 border-bd-coral-deep bg-bd-coral/15 text-3xl shadow-[3px_3px_0_#1F1B16]">
            ⚠️
          </div>
          <h1
            className="text-2xl font-extrabold text-bd-ink"
            style={{ fontFamily: 'var(--bd-font-display)' }}
          >
            Cannot Link Account
          </h1>
        </div>

        <div className="mb-6 rounded-xl border border-bd-coral/40 bg-bd-coral/10 p-4">
          <p className="text-sm font-semibold text-bd-coral-deep">
            This {getProviderName()} account is already registered with a different email address.
          </p>
        </div>

        <div className="mb-6 space-y-2">
          {[
            `Sign out and sign in with ${getProviderName()} instead`,
            'Continue using your current account',
            'Contact support to merge accounts manually',
          ].map((option, i) => (
            <div key={option} className="flex items-start gap-2 text-sm text-bd-ink-soft">
              <span className="shrink-0 font-bold text-bd-ink">{i + 1}.</span>
              <span>{option}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleSignInWithProvider}
            disabled={merging}
            className="bd-btn bd-btn-primary flex-1 justify-center disabled:cursor-not-allowed disabled:opacity-50"
          >
            {merging ? 'Redirecting…' : `Use ${getProviderName()}`}
          </button>
          <button onClick={handleTryAgain} className="bd-btn bd-btn-ghost justify-center px-5">
            Go Back
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OAuthErrorPage() {
  return (
    <Suspense fallback={<div className="page-shell-full flex items-center justify-center" style={{ background: 'var(--bd-bg)' }}><LoadingSpinner /></div>}>
      <OAuthErrorContent />
    </Suspense>
  )
}
