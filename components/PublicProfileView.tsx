'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n-helpers'
import { showToast } from '@/lib/i18n-toast'

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
}

type PublicProfileViewProps = {
  profile: PublicProfileViewData
  initialRelation: PublicProfileRelation
  accessState?: PublicProfileAccessState
}

export default function PublicProfileView({
  profile,
  initialRelation,
  accessState = 'available',
}: PublicProfileViewProps) {
  const { t, i18n } = useTranslation()
  const [relation, setRelation] = useState<PublicProfileRelation>(initialRelation)
  const [submitting, setSubmitting] = useState(false)

  const displayName = profile.username?.trim() || t('profile.publicProfile.playerFallback')
  const memberSince = new Date(profile.createdAt).toLocaleDateString(i18n.language || undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  const handleBack = () => {
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

  const renderAction = () => {
    if (relation === 'self') {
      return (
        <Link
          href="/profile"
          className="inline-flex w-full items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-100 sm:w-auto"
        >
          {t('profile.publicProfile.goToOwnProfile')}
        </Link>
      )
    }

    if (relation === 'friends') {
      return (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {t('profile.publicProfile.alreadyFriends')}
        </div>
      )
    }

    if (relation === 'request_sent') {
      return (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {t('profile.publicProfile.requestPending')}
        </div>
      )
    }

    if (relation === 'request_received') {
      return (
        <Link
          href="/profile?tab=friends"
          className="inline-flex w-full items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/20 sm:w-auto"
        >
          {t('profile.publicProfile.reviewRequest')}
        </Link>
      )
    }

    if (relation === 'login_required') {
      return (
        <Link
          href={`/auth/login?callbackUrl=${encodeURIComponent(`/u/${profile.publicProfileId}`)}`}
          className="inline-flex w-full items-center justify-center rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-300 sm:w-auto"
        >
          {t('profile.publicProfile.signInToAdd')}
        </Link>
      )
    }

    if (relation === 'verification_required') {
      return (
        <Link
          href="/auth/verify-email"
          className="inline-flex w-full items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/20 sm:w-auto"
        >
          {t('profile.publicProfile.verifyEmailToAdd')}
        </Link>
      )
    }

    return (
      <button
        type="button"
        onClick={() => void handleAddFriend()}
        disabled={submitting}
        className="inline-flex w-full items-center justify-center rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {submitting ? t('common.loading') : t('profile.publicProfile.addFriend')}
      </button>
    )
  }

  const renderRestrictedState = () => {
    if (accessState === 'private') {
      return (
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center rounded-[32px] border border-white/10 bg-white/8 px-6 py-10 text-center shadow-2xl backdrop-blur-xl sm:px-10">
          <div className="flex h-20 w-20 items-center justify-center rounded-[28px] border border-white/10 bg-white/10 text-4xl shadow-[0_10px_40px_rgba(15,23,42,0.28)]">
            🔒
          </div>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.32em] text-cyan-200/75">
            {t('profile.publicProfile.eyebrow')}
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
            {t('profile.publicProfile.privateTitle')}
          </h1>
          <p className="mt-4 max-w-lg text-sm text-slate-200/80 sm:text-base">
            {t('profile.publicProfile.privateSubtitle')}
          </p>
          <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/20"
            >
              {t('common.back')}
            </button>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-100"
            >
              {t('common.home')}
            </Link>
          </div>
        </div>
      )
    }

    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col rounded-[32px] border border-white/10 bg-white/8 shadow-2xl backdrop-blur-xl lg:flex-row">
        <div className="flex-1 px-6 py-8 sm:px-8 sm:py-10">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-200/75">
            {t('profile.publicProfile.eyebrow')}
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
            {t('profile.publicProfile.friendsOnlyTitle')}
          </h1>
          <p className="mt-4 max-w-xl text-sm text-slate-200/80 sm:text-base">
            {t('profile.publicProfile.friendsOnlySubtitle')}
          </p>
          <div className="mt-8">
            {renderAction()}
          </div>
        </div>
        <div className="flex items-center border-t border-white/10 bg-black/15 px-6 py-8 sm:px-8 lg:w-[18rem] lg:border-l lg:border-t-0">
          <div className="w-full rounded-3xl border border-dashed border-white/15 bg-white/5 p-5 text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-300/70">
              {t('profile.settings.privacy.friendsOnly')}
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-200/80">
              {t('profile.publicProfile.friendsOnlyHint')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mobile-vh-100 safe-top safe-bottom safe-left safe-right relative overflow-hidden bg-slate-950 text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(34,211,238,0.22),transparent_38%),radial-gradient(circle_at_80%_10%,rgba(96,165,250,0.18),transparent_34%),radial-gradient(circle_at_85%_85%,rgba(168,85,247,0.22),transparent_32%)]"
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-10 sm:px-6 lg:px-8">
        {accessState !== 'available' ? renderRestrictedState() : (
        <div className="w-full overflow-hidden rounded-[32px] border border-white/10 bg-white/8 shadow-2xl backdrop-blur-xl">
          <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="p-6 sm:p-8 lg:p-10">
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center gap-2 text-sm font-medium text-cyan-200 transition-colors hover:text-cyan-100"
              >
                <span aria-hidden>←</span>
                {t('common.back')}
              </button>

              <div className="mt-8 max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-200/75">
                  {t('profile.publicProfile.eyebrow')}
                </p>
                <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">
                  {displayName}
                </h1>
                <p className="mt-4 max-w-xl text-sm text-slate-200/80 sm:text-base">
                  {t('profile.publicProfile.subtitle')}
                </p>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-300/70">
                    {t('profile.friends.title')}
                  </p>
                  <p className="mt-3 text-2xl font-bold text-white">{profile.friendsCount}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-300/70">
                    {t('profile.stats.gamesPlayed')}
                  </p>
                  <p className="mt-3 text-2xl font-bold text-white">{profile.gamesPlayed}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-300/70">
                    {t('profile.memberSince')}
                  </p>
                  <p className="mt-3 text-lg font-semibold text-white">{memberSince}</p>
                </div>
              </div>

              <div className="mt-8">
                {renderAction()}
              </div>
            </div>

            <div className="relative flex items-center justify-center border-t border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.2),rgba(15,23,42,0.55))] p-6 sm:p-8 lg:border-l lg:border-t-0 lg:p-10">
              <div
                aria-hidden
                className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(56,189,248,0.18),transparent_35%),radial-gradient(circle_at_50%_80%,rgba(168,85,247,0.18),transparent_40%)]"
              />
              <div className="relative flex w-full max-w-sm flex-col items-center text-center">
                <div className="flex h-48 w-48 items-center justify-center overflow-hidden rounded-[36px] border border-white/15 bg-gradient-to-br from-cyan-400/35 via-blue-500/30 to-violet-500/35 shadow-[0_20px_80px_rgba(34,211,238,0.22)] sm:h-56 sm:w-56">
                  {profile.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.image}
                      alt={displayName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-7xl font-black uppercase text-white sm:text-8xl">
                      {displayName.charAt(0)}
                    </span>
                  )}
                </div>
                <p className="mt-6 text-sm text-slate-300/80">
                  {t('profile.publicProfile.linkHint')}
                </p>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  )
}
