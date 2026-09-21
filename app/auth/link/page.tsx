'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { showToast } from '@/lib/i18n-toast'
import { useTranslation } from '@/lib/i18n-helpers'
import LoadingSpinner from '@/components/LoadingSpinner'
import { Icon } from '@/components/icons'

function LinkAccountContent() {
  const { t } = useTranslation()
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [linking, setLinking] = useState(false)
  const [showWarning, setShowWarning] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const provider = searchParams?.get('provider')
  const linked = searchParams?.get('linked')

  const handleLinkAccount = useCallback(async () => {
    if (!provider) return

    try {
      // Show warning before linking that OAuth email may differ
      if (!confirmed) {
        setShowWarning(true)
        return
      }

      // Trigger OAuth sign-in which will link the account via PrismaAdapter
      // PrismaAdapter will link even if OAuth email differs from user's email
      const result = await signIn(provider, {
        callbackUrl: `/profile?linked=${provider}`,
        redirect: true,
      })
    } catch (error) {
      console.error('Link account error:', error)
      showToast.error('toast.linkAccountFailed')
      router.push('/profile')
    }
  }, [provider, router, confirmed])

  const handleConfirmLink = () => {
    setConfirmed(true)
    setShowWarning(false)
    setLinking(true)
    handleLinkAccount()
  }

  const getProviderName = useCallback(() => {
    switch (provider) {
      case 'google': return 'Google'
      case 'github': return 'GitHub'
      case 'discord': return 'Discord'
      default: return 'OAuth'
    }
  }, [provider])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/auth/login')
      return
    }

    if (!provider || !['google', 'github', 'discord'].includes(provider)) {
      showToast.error('toast.invalidProvider')
      router.replace('/profile')
      return
    }

    // If user just linked successfully, show success and redirect
    if (linked === provider) {
      showToast.success('toast.providerLinked', undefined, { provider: getProviderName() })
      setTimeout(() => router.push('/profile'), 2000)
      return
    }

    // Auto-trigger linking if not already linking and not showing warning
    if (status === 'authenticated' && !linking && !showWarning) {
      setLinking(true)
      handleLinkAccount()
    }
  }, [status, provider, linking, showWarning, linked, router, handleLinkAccount, getProviderName])

  const authBg: React.CSSProperties = {
    background:
      'radial-gradient(circle at 12% 8%, rgba(255,196,77,0.18), transparent 35%), radial-gradient(circle at 88% 14%, rgba(155,140,255,0.16), transparent 40%), radial-gradient(circle at 50% 100%, rgba(79,201,166,0.14), transparent 50%), var(--bd-bg)',
  }

  // Show warning about different email before linking
  if (showWarning) {
    return (
      <div className="page-shell-full flex items-center justify-center overflow-y-auto p-4" style={authBg}>
        <div className="bd-card w-full max-w-md p-8">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl border-2 border-bd-ink bg-bd-lav shadow-[3px_3px_0_#1F1B16]">
              <Icon name="link" size={32} tone="on-accent" />
            </div>
            <h1
              className="text-2xl font-extrabold text-bd-ink"
              style={{ fontFamily: 'var(--bd-font-display)' }}
            >
              {t('auth.linkAccount.title', { provider: getProviderName() })}
            </h1>
          </div>

          <div className="mb-6 rounded-xl border border-bd-lav/40 bg-bd-lav/10 p-4">
            <p className="mb-2 text-sm font-semibold text-bd-lav-deep">
              {t('auth.linkAccount.intro', { provider: getProviderName() })}
            </p>
            <p className="text-xs leading-5 text-bd-ink-soft">
              <strong>{t('auth.linkAccount.noteLabel')}</strong>{' '}
              {t('auth.linkAccount.noteBody', {
                provider: getProviderName(),
                email: session?.user?.email ?? '',
              })}
            </p>
          </div>

          <div className="mb-6 space-y-2">
            {[
              t('auth.linkAccount.benefitLinked', { provider: getProviderName() }),
              t('auth.linkAccount.benefitFuture', { provider: getProviderName() }),
              t('auth.linkAccount.benefitPassword'),
              t('auth.linkAccount.benefitData'),
            ].map((item) => (
              <div key={item} className="flex items-start gap-2 text-sm text-bd-ink-soft">
                <Icon name="check" size={16} className="mt-0.5 shrink-0 text-bd-mint-deep" />
                <span>{item}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button onClick={handleConfirmLink} className="bd-btn bd-btn-primary flex-1 justify-center">
              {t('auth.linkAccount.continueTo', { provider: getProviderName() })} →
            </button>
            <button onClick={() => router.push('/profile')} className="bd-btn bd-btn-ghost justify-center px-5">
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Show loading state while linking
  return (
    <div className="page-shell-full flex items-center justify-center overflow-y-auto p-4" style={authBg}>
      <div className="bd-card w-full max-w-sm p-8 text-center">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl border-2 border-bd-ink bg-bd-lav shadow-[3px_3px_0_#1F1B16]">
          <Icon name="link" size={32} tone="on-accent" />
        </div>
        <h1
          className="mb-2 text-2xl font-extrabold text-bd-ink"
          style={{ fontFamily: 'var(--bd-font-display)' }}
        >
          {t('auth.linkAccount.linkingTitle', { provider: getProviderName() })}
        </h1>
        <p className="mb-6 text-sm leading-6 text-bd-ink-soft">
          {t('auth.linkAccount.linkingBody', { provider: getProviderName() })}
        </p>
        <LoadingSpinner />
        <p className="mt-5 text-xs text-bd-ink-muted">
          {t('auth.linkAccount.redirectNote', { provider: getProviderName() })}
        </p>
      </div>
    </div>
  )
}

export default function LinkAccountPage() {
  return (
    <Suspense fallback={<div className="page-shell-full flex items-center justify-center" style={{ background: 'var(--bd-bg)' }}><LoadingSpinner /></div>}>
      <LinkAccountContent />
    </Suspense>
  )
}
