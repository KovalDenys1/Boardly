'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslation } from '@/lib/i18n-helpers'
import { buildAuthUrl } from '@/lib/auth-redirect'
import LoadingSpinner from '@/components/LoadingSpinner'
import { Icon } from '@/components/icons'

/**
 * Linked Roles verification URL (#939). Discord opens this page when a member clicks the
 * Boardly connection under a linked role. Three states:
 *   - not signed in            → login, then back here
 *   - no Discord row, a legacy-scope row, or a revoked grant
 *                              → consent block + signIn('discord'), which returns with ?linked=1
 *   - linked with the scope    → push the metadata, then "Done"
 * The consent block lists exactly what is shared; the privacy page carries the same list.
 */

type LinkStatus = { linked: boolean; hasScope: boolean; hasToken: boolean; ready: boolean }

type View = 'checking' | 'consent' | 'pushing' | 'done' | 'failed'

const LINK_CALLBACK_URL = '/discord/link?linked=1'

const authBg: React.CSSProperties = {
  background:
    'radial-gradient(circle at 12% 8%, rgba(255,196,77,0.18), transparent 35%), radial-gradient(circle at 88% 14%, rgba(155,140,255,0.16), transparent 40%), radial-gradient(circle at 50% 100%, rgba(79,201,166,0.14), transparent 50%), var(--bd-bg)',
}

function DiscordLinkContent() {
  const { t } = useTranslation()
  const { status: sessionStatus } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const justLinked = searchParams?.get('linked') === '1'

  const [view, setView] = useState<View>('checking')
  const [linkStatus, setLinkStatus] = useState<LinkStatus | null>(null)
  const [connecting, setConnecting] = useState(false)
  const started = useRef(false)

  const pushMetadata = useCallback(async () => {
    setView('pushing')
    try {
      const res = await fetch('/api/discord/role-connection', { method: 'POST' })
      const body = (await res.json().catch(() => null)) as { status?: string } | null
      if (res.ok && body?.status === 'pushed') {
        setView('done')
        return
      }
      // A skipped or revoked push means the grant is not usable: ask for the link again.
      if (body?.status === 'skipped' || body?.status === 'revoked') {
        setLinkStatus((prev) => (prev ? { ...prev, ready: false } : prev))
        setView('consent')
        return
      }
      setView('failed')
    } catch {
      setView('failed')
    }
  }, [])

  const checkStatus = useCallback(async () => {
    setView('checking')
    try {
      const res = await fetch('/api/discord/role-connection', { method: 'GET' })
      if (!res.ok) {
        setView('failed')
        return
      }
      const status = (await res.json()) as LinkStatus
      setLinkStatus(status)
      if (status.ready) {
        await pushMetadata()
      } else {
        setView('consent')
      }
    } catch {
      setView('failed')
    }
  }, [pushMetadata])

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.replace(buildAuthUrl('login', justLinked ? LINK_CALLBACK_URL : '/discord/link'))
      return
    }
    if (sessionStatus === 'authenticated' && !started.current) {
      started.current = true
      void checkStatus()
    }
  }, [sessionStatus, router, justLinked, checkStatus])

  const handleConnect = async () => {
    setConnecting(true)
    try {
      // Same shape as app/auth/link/page.tsx: the OAuth round-trip links (or re-links with the
      // new scope) through the adapter and the signIn callback, then lands back here.
      await signIn('discord', { callbackUrl: LINK_CALLBACK_URL, redirect: true })
    } catch {
      setConnecting(false)
      setView('failed')
    }
  }

  const needsRelink = Boolean(linkStatus?.linked && !linkStatus.ready)

  if (sessionStatus === 'loading' || view === 'checking' || view === 'pushing') {
    return (
      <div className="page-shell-full flex items-center justify-center overflow-y-auto p-4" style={authBg}>
        <div className="bd-card w-full max-w-sm p-8 text-center">
          <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl border-2 border-bd-ink bg-bd-lav shadow-[3px_3px_0_#1F1B16]">
            <Icon name="link" size={32} tone="on-accent" />
          </div>
          <h1 className="mb-2 text-2xl font-extrabold text-bd-ink" style={{ fontFamily: 'var(--bd-font-display)' }}>
            {t('discordLink.title')}
          </h1>
          <p className="mb-6 text-sm leading-6 text-bd-ink-soft">
            {view === 'pushing' ? t('discordLink.updating') : t('discordLink.checking')}
          </p>
          <LoadingSpinner />
        </div>
      </div>
    )
  }

  if (view === 'done') {
    return (
      <div className="page-shell-full flex items-center justify-center overflow-y-auto p-4" style={authBg}>
        <div className="bd-card w-full max-w-sm p-8 text-center">
          <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl border-2 border-bd-ink bg-bd-mint shadow-[3px_3px_0_#1F1B16]">
            <Icon name="check" size={32} tone="on-accent" />
          </div>
          <h1 className="mb-2 text-2xl font-extrabold text-bd-ink" style={{ fontFamily: 'var(--bd-font-display)' }}>
            {t('discordLink.doneTitle')}
          </h1>
          <p className="text-sm leading-6 text-bd-ink-soft">{t('discordLink.done')}</p>
          <p className="mt-4 text-xs text-bd-ink-muted">{t('discordLink.doneHint')}</p>
        </div>
      </div>
    )
  }

  if (view === 'failed') {
    return (
      <div className="page-shell-full flex items-center justify-center overflow-y-auto p-4" style={authBg}>
        <div className="bd-card w-full max-w-sm p-8 text-center">
          <h1 className="mb-2 text-2xl font-extrabold text-bd-ink" style={{ fontFamily: 'var(--bd-font-display)' }}>
            {t('discordLink.title')}
          </h1>
          <p className="mb-6 text-sm leading-6 text-bd-ink-soft">{t('discordLink.failed')}</p>
          <button
            type="button"
            onClick={() => {
              started.current = false
              void checkStatus()
            }}
            className="bd-btn bd-btn-primary w-full justify-center"
          >
            {t('discordLink.retry')}
          </button>
        </div>
      </div>
    )
  }

  const sharedItems = [
    t('discordLink.shares.premium'),
    t('discordLink.shares.gamesPlayed'),
    t('discordLink.shares.memberSince'),
    t('discordLink.shares.verified'),
  ]

  return (
    <div className="page-shell-full flex items-center justify-center overflow-y-auto p-4" style={authBg}>
      <div className="bd-card w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl border-2 border-bd-ink bg-bd-lav shadow-[3px_3px_0_#1F1B16]">
            <Icon name="link" size={32} tone="on-accent" />
          </div>
          <h1 className="text-2xl font-extrabold text-bd-ink" style={{ fontFamily: 'var(--bd-font-display)' }}>
            {t('discordLink.title')}
          </h1>
        </div>

        <p className="mb-4 text-sm leading-6 text-bd-ink-soft">{t('discordLink.intro')}</p>

        {needsRelink && (
          <div className="mb-4 rounded-xl border border-bd-sun/50 bg-bd-sun/10 p-4">
            <p className="text-sm font-semibold text-bd-ink">{t('discordLink.relinkTitle')}</p>
            <p className="mt-1 text-xs leading-5 text-bd-ink-soft">{t('discordLink.relinkBody')}</p>
          </div>
        )}

        <p className="mb-2 text-sm font-semibold text-bd-ink">{t('discordLink.sharesTitle')}</p>
        <ul className="mb-4 space-y-2">
          {sharedItems.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-bd-ink-soft">
              <Icon name="check" size={16} className="mt-0.5 shrink-0 text-bd-mint-deep" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <p className="mb-6 text-xs leading-5 text-bd-ink-muted">{t('discordLink.notShared')}</p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleConnect}
            disabled={connecting}
            className="bd-btn bd-btn-primary flex-1 justify-center disabled:opacity-60"
          >
            {connecting
              ? t('discordLink.connecting')
              : needsRelink
                ? t('discordLink.relink')
                : t('discordLink.connect')}
          </button>
          <button type="button" onClick={() => router.push('/')} className="bd-btn bd-btn-ghost justify-center px-5">
            {t('discordLink.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function DiscordLinkPage() {
  return (
    <Suspense
      fallback={
        <div className="page-shell-full flex items-center justify-center" style={{ background: 'var(--bd-bg)' }}>
          <LoadingSpinner />
        </div>
      }
    >
      <DiscordLinkContent />
    </Suspense>
  )
}
