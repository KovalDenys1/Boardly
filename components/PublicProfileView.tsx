'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n-helpers'
import { showToast } from '@/lib/i18n-toast'
import { buildAuthUrl } from '@/lib/auth-redirect'

export type PublicProfileRelation =
  | 'login_required'
  | 'verification_required'
  | 'can_send'
  | 'request_sent'
  | 'request_received'
  | 'friends'
  | 'self'

export type PublicProfileAccessState = 'available' | 'friends_only' | 'private'

export type PublicProfileViewData = {
  publicProfileId: string
  username: string | null
  image: string | null
  createdAt: string
  friendsCount: number
  gamesPlayed: number
  completedGamesCount?: number
}

type PublicProfileViewProps = {
  profile: PublicProfileViewData
  initialRelation: PublicProfileRelation
  accessState?: PublicProfileAccessState
  mode?: 'page' | 'embedded-preview'
  onBack?: () => void
}

const primaryActionClassName =
  'inline-flex w-full items-center justify-center rounded-2xl bg-bd-ink px-5 py-3 text-sm font-bold text-bd-bg shadow-[0_4px_0_var(--bd-coral)] transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_0_var(--bd-coral)] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950'
const secondaryActionClassName =
  'inline-flex w-full items-center justify-center rounded-2xl border-2 border-bd-ink bg-white px-5 py-3 text-sm font-bold text-bd-ink transition-colors hover:bg-bd-bg2 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800'
const quietActionClassName =
  'inline-flex items-center justify-center rounded-2xl border border-bd-line bg-white px-5 py-3 text-sm font-bold text-bd-ink-soft transition-colors hover:bg-bd-bg2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'

export default function PublicProfileView({
  profile,
  initialRelation,
  accessState = 'available',
  mode = 'page',
  onBack,
}: PublicProfileViewProps) {
  const { t, i18n } = useTranslation()
  const [relation, setRelation] = useState<PublicProfileRelation>(initialRelation)
  const [submitting, setSubmitting] = useState(false)
  const [copiedProfileLink, setCopiedProfileLink] = useState(false)
  const isEmbeddedPreview = mode === 'embedded-preview'
  const shouldShowAction = !isEmbeddedPreview

  const displayName = profile.username?.trim() || t('profile.publicProfile.playerFallback')
  const handle = displayName.replace(/\s+/g, '').toLowerCase()
  const levelSourceGames = profile.completedGamesCount ?? profile.gamesPlayed
  const level = Math.max(1, Math.floor(levelSourceGames / 10) + 1)
  const memberSince = new Date(profile.createdAt).toLocaleDateString(i18n.language || undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  const publicProfilePath = `/u/${profile.publicProfileId}`

  const getPublicProfileUrl = () => {
    if (typeof window === 'undefined') {
      return publicProfilePath
    }

    return new URL(publicProfilePath, window.location.origin).toString()
  }

  const handleBack = () => {
    if (onBack) {
      onBack()
      return
    }

    if (window.history.length > 1) {
      window.history.back()
      return
    }

    window.location.assign('/')
  }

  const handleAddFriend = async () => {
    setSubmitting(true)

    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiverPublicProfileId: profile.publicProfileId,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 401) {
          setRelation('login_required')
        } else if (res.status === 403) {
          setRelation('verification_required')
        } else if (typeof data?.error === 'string') {
          if (data.error === 'Already friends') {
            setRelation('friends')
          } else if (data.error === 'Friend request already exists') {
            setRelation('request_sent')
          }
        }

        throw new Error(data?.error || 'Failed to send friend request')
      }

      setRelation('request_sent')
      showToast.success('profile.publicProfile.requestSent')
    } catch (error) {
      showToast.errorFrom(error, 'profile.publicProfile.addFailed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCopyProfileLink = async () => {
    const profileUrl = getPublicProfileUrl()

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(profileUrl)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = profileUrl
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'fixed'
        textarea.style.left = '-9999px'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }

      setCopiedProfileLink(true)
      window.setTimeout(() => setCopiedProfileLink(false), 1600)
    } catch (error) {
      showToast.errorFrom(error, 'toast.error')
    }
  }

  const renderAction = () => {
    if (relation === 'self') {
      return (
        <Link
          href="/profile"
          className="inline-flex w-full max-w-xs items-center justify-center rounded-2xl border-2 border-bd-lav-deep bg-bd-lav px-5 py-3 text-sm font-bold text-white shadow-[0_4px_0_var(--bd-lav-deep)] transition-all hover:-translate-y-0.5 hover:bg-bd-lav-mid hover:shadow-[0_6px_0_var(--bd-lav-deep)]"
        >
          {t('profile.publicProfile.goToOwnProfile')}
        </Link>
      )
    }

    if (relation === 'friends') {
      return (
        <div className="rounded-2xl border border-bd-mint/40 bg-bd-mint/15 px-4 py-3 text-sm font-semibold text-bd-mint-deep dark:text-emerald-300">
          {t('profile.publicProfile.alreadyFriends')}
        </div>
      )
    }

    if (relation === 'request_sent') {
      return (
        <div className="rounded-2xl border border-bd-sun/60 bg-bd-sun/20 px-4 py-3 text-sm font-semibold text-[#9b6b00] dark:text-amber-300">
          {t('profile.publicProfile.requestPending')}
        </div>
      )
    }

    if (relation === 'request_received') {
      return (
        <Link href="/profile?tab=friends" className={secondaryActionClassName}>
          {t('profile.publicProfile.reviewRequest')}
        </Link>
      )
    }

    if (relation === 'login_required') {
      return (
        <Link
          href={buildAuthUrl('login', `/u/${profile.publicProfileId}`)}
          className={primaryActionClassName}
        >
          {t('profile.publicProfile.signInToAdd')}
        </Link>
      )
    }

    if (relation === 'verification_required') {
      return (
        <Link href="/auth/verify-email" className={secondaryActionClassName}>
          {t('profile.publicProfile.verifyEmailToAdd')}
        </Link>
      )
    }

    return (
      <button
        type="button"
        onClick={() => void handleAddFriend()}
        disabled={submitting}
        className={primaryActionClassName}
      >
        {submitting ? t('common.loading') : t('profile.publicProfile.addFriend')}
      </button>
    )
  }

  const renderAvatar = (sizeClassName = 'h-48 w-48 sm:h-56 sm:w-56') => (
    <div className="relative">
      <div
        className={`flex ${sizeClassName} items-center justify-center overflow-hidden rounded-[2rem] border-[3px] border-bd-ink bg-bd-lav text-white shadow-[6px_6px_0_var(--bd-ink)]`}
      >
        {profile.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.image} alt={displayName} className="h-full w-full object-cover" />
        ) : (
          <span className="font-display text-7xl font-black uppercase sm:text-8xl">
            {displayName.charAt(0)}
          </span>
        )}
      </div>
      <div className="absolute -bottom-3 -right-4 rotate-[8deg] rounded-full border-2 border-bd-ink bg-bd-mint px-3 py-1 font-display text-xs font-bold text-bd-ink shadow-[2px_2px_0_var(--bd-ink)]">
        Lv. {level}
      </div>
    </div>
  )

  const renderRestrictedState = () => {
    if (accessState === 'private') {
      return (
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center rounded-[2rem] border-[1.5px] border-bd-line bg-white px-6 py-10 text-center shadow-[0_6px_0_0_rgba(31,27,22,0.08),0_14px_28px_-10px_rgba(31,27,22,0.18)] dark:border-slate-700 dark:bg-slate-900 sm:px-10">
          <div className="grid h-20 w-20 place-items-center rounded-[1.4rem] border-2 border-bd-ink bg-bd-sun font-display text-sm font-black uppercase tracking-[0.12em] text-bd-ink shadow-[4px_4px_0_var(--bd-ink)]">
            Lock
          </div>
          <p className="mt-6 font-mono text-xs font-semibold uppercase tracking-[0.32em] text-bd-ink-muted dark:text-slate-400">
            {t('profile.publicProfile.eyebrow')}
          </p>
          <h1 className="mt-3 font-display text-3xl font-black leading-tight text-bd-ink dark:text-white sm:text-4xl">
            {t('profile.publicProfile.privateTitle')}
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-6 text-bd-ink-soft dark:text-slate-300 sm:text-base">
            {t('profile.publicProfile.privateSubtitle')}
          </p>
          <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <button type="button" onClick={handleBack} className={quietActionClassName}>
              {t('common.back')}
            </button>
            {!isEmbeddedPreview && (
              <Link href="/" className={primaryActionClassName}>
                {t('common.goHome')}
              </Link>
            )}
          </div>
        </div>
      )
    }

    return (
      <div className="mx-auto grid w-full max-w-4xl overflow-hidden rounded-[2rem] border-[1.5px] border-bd-line bg-white shadow-[0_6px_0_0_rgba(31,27,22,0.08),0_14px_28px_-10px_rgba(31,27,22,0.18)] dark:border-slate-700 dark:bg-slate-900 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="px-6 py-8 sm:px-8 sm:py-10">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.32em] text-bd-ink-muted dark:text-slate-400">
            {t('profile.publicProfile.eyebrow')}
          </p>
          <h1 className="mt-3 font-display text-3xl font-black leading-tight text-bd-ink dark:text-white sm:text-4xl">
            {t('profile.publicProfile.friendsOnlyTitle')}
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-bd-ink-soft dark:text-slate-300 sm:text-base">
            {t('profile.publicProfile.friendsOnlySubtitle')}
          </p>
          {isEmbeddedPreview && (
            <div className="mt-8">
              <button type="button" onClick={handleBack} className={quietActionClassName}>
                {t('common.back')}
              </button>
            </div>
          )}
          {shouldShowAction && <div className="mt-8">{renderAction()}</div>}
        </div>
        <div className="flex items-center border-t border-bd-line bg-bd-card-warm px-6 py-8 sm:px-8 lg:border-l lg:border-t-0 dark:border-slate-700 dark:bg-slate-800/70">
          <div className="w-full rounded-3xl border border-dashed border-bd-line bg-white p-5 text-left dark:border-slate-700 dark:bg-slate-900/70">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-bd-ink-muted dark:text-slate-400">
              {t('profile.settings.privacy.friendsOnly')}
            </p>
            <p className="mt-3 text-sm leading-6 text-bd-ink-soft dark:text-slate-300">
              {t('profile.publicProfile.friendsOnlyHint')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`relative overflow-hidden bg-bd-bg text-bd-ink ${
        isEmbeddedPreview
          ? 'rounded-[2rem] border-[1.5px] border-bd-line shadow-[0_6px_0_0_rgba(31,27,22,0.08),0_14px_28px_-10px_rgba(31,27,22,0.18)] dark:border-slate-700'
          : 'flex min-h-[calc(100vh-64px)] items-center safe-left safe-right'
      }`}
      style={isEmbeddedPreview ? undefined : { minHeight: 'calc(100dvh - 64px)' }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(255,196,77,0.18),transparent_35%),radial-gradient(circle_at_88%_14%,rgba(155,140,255,0.16),transparent_40%),radial-gradient(circle_at_50%_100%,rgba(79,201,166,0.14),transparent_50%)]"
      />
      <div className="pointer-events-none absolute right-[-4rem] top-20 h-44 w-44 rounded-full bg-bd-lav/10" />
      <div className="pointer-events-none absolute left-[-3rem] bottom-20 h-36 w-36 rotate-12 rounded-[2rem] bg-bd-mint/10" />

      <div
        className={`relative ${
          isEmbeddedPreview
            ? 'w-full px-4 py-4 sm:px-6 sm:py-6'
            : 'mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8'
        }`}
      >
        {accessState !== 'available' ? (
          renderRestrictedState()
        ) : (
          <div className="relative w-full overflow-hidden rounded-[2rem] border-[1.5px] border-bd-line bg-white shadow-[0_6px_0_0_rgba(31,27,22,0.08),0_14px_28px_-10px_rgba(31,27,22,0.18)] dark:border-slate-700 dark:bg-slate-900">
            <div className="dot-grid absolute inset-0 opacity-30" />
            <div className="relative grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="p-6 sm:p-8 lg:p-10">
                <button
                  type="button"
                  onClick={handleBack}
                  className="inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-semibold text-bd-ink-soft transition-colors hover:bg-bd-bg2 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <span aria-hidden>{'<-'}</span>
                  {t('common.back')}
                </button>

                <div className="mt-8 max-w-2xl">
                  <p className="font-mono text-xs font-semibold uppercase tracking-[0.32em] text-bd-ink-muted dark:text-slate-400">
                    {t('profile.publicProfile.eyebrow')}
                  </p>
                  <h1 className="mt-3 font-display text-4xl font-black leading-none text-bd-ink dark:text-white sm:text-5xl">
                    {displayName}
                  </h1>
                  <p className="mt-2 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-bd-ink-muted">
                    @{handle}
                  </p>
                  <p className="mt-4 max-w-xl text-sm leading-6 text-bd-ink-soft dark:text-slate-300 sm:text-base">
                    {t('profile.publicProfile.subtitle')}
                  </p>
                </div>

                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  <div className="relative overflow-hidden rounded-2xl border border-bd-line bg-bd-card-warm p-4 dark:border-slate-700 dark:bg-slate-800">
                    <div className="absolute -right-3 -top-3 h-14 w-14 rounded-full bg-bd-coral opacity-20" />
                    <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-bd-ink-muted dark:text-slate-400">
                      {t('profile.friends.title')}
                    </p>
                    <p className="mt-3 font-display text-3xl font-bold text-bd-coral-deep dark:text-white">
                      {profile.friendsCount}
                    </p>
                  </div>
                  <div className="relative overflow-hidden rounded-2xl border border-bd-line bg-bd-card-warm p-4 dark:border-slate-700 dark:bg-slate-800">
                    <div className="absolute -right-3 -top-3 h-14 w-14 rounded-full bg-bd-mint opacity-20" />
                    <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-bd-ink-muted dark:text-slate-400">
                      {t('profile.stats.gamesPlayed')}
                    </p>
                    <p className="mt-3 font-display text-3xl font-bold text-bd-mint-deep dark:text-white">
                      {profile.gamesPlayed}
                    </p>
                  </div>
                  <div className="relative overflow-hidden rounded-2xl border border-bd-line bg-bd-card-warm p-4 dark:border-slate-700 dark:bg-slate-800">
                    <div className="absolute -right-3 -top-3 h-14 w-14 rounded-full bg-bd-sun opacity-25" />
                    <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-bd-ink-muted dark:text-slate-400">
                      {t('profile.memberSince')}
                    </p>
                    <p className="mt-3 text-lg font-bold text-bd-ink dark:text-white">{memberSince}</p>
                  </div>
                </div>

                {shouldShowAction && (
                  <div
                    className={`mt-8 ${
                      relation === 'self' ? 'flex w-full justify-center' : 'max-w-sm'
                    }`}
                  >
                    {renderAction()}
                  </div>
                )}
              </div>

              <div className="relative flex items-center justify-center border-t border-bd-line bg-bd-card-warm p-6 sm:p-8 lg:border-l lg:border-t-0 lg:p-10 dark:border-slate-700 dark:bg-slate-800/70">
                <div className="relative flex w-full max-w-sm flex-col items-center text-center">
                  {renderAvatar()}
                  <p className="mt-8 text-sm leading-6 text-bd-ink-muted dark:text-slate-300">
                    {t('profile.publicProfile.linkHint')}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleCopyProfileLink()}
                    className="mt-4 inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-bd-lav-deep bg-bd-lav px-4 py-3 text-sm font-bold text-white shadow-[0_4px_0_var(--bd-lav-deep)] transition-all hover:-translate-y-0.5 hover:bg-bd-lav-mid hover:shadow-[0_6px_0_var(--bd-lav-deep)]"
                  >
                    <span>{copiedProfileLink ? 'Copied' : 'Copy profile link'}</span>
                    <span aria-hidden>{copiedProfileLink ? '✓' : '↗'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
