'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import { showToast } from '@/lib/i18n-toast'
import { buildAuthUrl } from '@/lib/auth-redirect'
import PremiumProfileCard, { type PremiumCardStyle } from '@/components/PremiumProfileCard'
import { getGameMetadata } from '@/lib/game-catalog'
import GameIcon from '@/components/GameIcon'
import type { TranslationKeys } from '@/lib/i18n-helpers'
import { ACHIEVEMENTS, ACHIEVEMENT_CATEGORY_ACCENT } from '@/lib/achievements'
import ReportDialog from '@/components/ReportDialog'
import { getGuestData } from '@/lib/client/fetch-with-guest'
import type { ReportTarget } from '@/lib/content-reports'
import { PRIVACY_SETTINGS_HREF, type ProfileVisibilityValue } from '@/lib/public-profile'

export type PublicProfileRelation =
  | 'login_required'
  | 'verification_required'
  | 'can_send'
  | 'request_sent'
  | 'request_received'
  | 'friends'
  | 'self'

export type PublicProfileAccessState = 'available' | 'friends_only' | 'private'


/**
 * Everything but the id, the username and the picture is optional because a viewer who
 * may not see the profile is sent those and nothing else (#1226, app/u/[publicProfileId]).
 */
export type PublicProfileViewData = {
  publicProfileId: string
  username: string | null
  image?: string | null
  avatarUrl?: string | null
  bio?: string | null
  premiumCardStyle?: string | null
  accentColor?: string | null
  featuredGame?: string | null
  createdAt?: string
  friendsCount?: number
  gamesPlayed?: number
  completedGamesCount?: number
  isPremium?: boolean
  unlockedAchievements?: { key: string; unlockedAt: string }[]
}

type PublicProfileViewProps = {
  profile: PublicProfileViewData
  initialRelation: PublicProfileRelation
  accessState?: PublicProfileAccessState
  mode?: 'page' | 'embedded-preview'
  onBack?: () => void
  /** The owner's own setting, passed only when the owner is the one looking. */
  ownerVisibility?: ProfileVisibilityValue
}

const OWNER_VISIBILITY_NOTE = {
  public: { icon: 'globe', key: 'profile.publicProfile.ownerNote.public' },
  friends: { icon: 'users', key: 'profile.publicProfile.ownerNote.friends' },
  private: { icon: 'lock', key: 'profile.publicProfile.ownerNote.private' },
} as const satisfies Record<ProfileVisibilityValue, { icon: string; key: TranslationKeys }>

function getPremiumPanelStyle(cardStyle: string): React.CSSProperties {
  switch (cardStyle) {
    case 'gold':
      return {
        background: '#FAF2D8',
        borderColor: 'rgba(184,140,30,0.25)',
      }
    case 'glass':
      return {
        background: 'linear-gradient(135deg, rgba(255,107,91,0.22) 0%, rgba(255,196,77,0.22) 45%, rgba(79,201,166,0.22) 100%)',
      }
    case 'holo':
      return {
        background: 'linear-gradient(115deg, rgba(180,240,255,0.35), rgba(201,184,255,0.32), rgba(255,184,224,0.28), rgba(255,227,168,0.28))',
      }
    case 'dark':
      return {
        background: 'radial-gradient(circle at 20% 0%, #2A2522 0%, #16120E 70%)',
        borderColor: 'rgba(255,255,255,0.05)',
      }
    default:
      return {}
  }
}

const PREMIUM_PAGE_THEMES: Record<string, {
  pageBg: string
  decorBg: string
  cardBg: string
  cardBorder: string
  cardShadow: string
  isDark: boolean
}> = {
  gold: {
    pageBg: 'linear-gradient(160deg, #FDF8EC 0%, #FAF0D0 55%, #F5E6B0 100%)',
    decorBg: 'radial-gradient(circle at 12% 8%, rgba(201,160,32,0.22) 0, transparent 35%), radial-gradient(circle at 88% 14%, rgba(180,140,30,0.15) 0, transparent 40%), radial-gradient(circle at 50% 100%, rgba(240,210,80,0.14) 0, transparent 50%)',
    cardBg: '#FFFEF8',
    cardBorder: 'rgba(184,140,30,0.28)',
    cardShadow: '0 6px 0 0 rgba(184,140,30,0.12), 0 14px 28px -10px rgba(109,74,20,0.15)',
    isDark: false,
  },
  glass: {
    pageBg: 'linear-gradient(135deg, #FFF0EE 0%, #FFFBF0 45%, #EDFAF6 100%)',
    decorBg: 'radial-gradient(circle at 12% 8%, rgba(255,107,91,0.22) 0, transparent 35%), radial-gradient(circle at 88% 14%, rgba(255,196,77,0.2) 0, transparent 40%), radial-gradient(circle at 50% 100%, rgba(79,201,166,0.2) 0, transparent 50%)',
    cardBg: 'rgba(255,255,255,0.88)',
    cardBorder: 'rgba(255,107,91,0.22)',
    cardShadow: '0 6px 0 0 rgba(255,107,91,0.1), 0 14px 28px -10px rgba(255,107,91,0.14)',
    isDark: false,
  },
  holo: {
    pageBg: 'linear-gradient(115deg, #EEF9FF 0%, #F4F0FF 35%, #FFF0F8 65%, #FFFBEE 100%)',
    decorBg: 'radial-gradient(circle at 12% 8%, rgba(180,240,255,0.3) 0, transparent 35%), radial-gradient(circle at 88% 14%, rgba(201,184,255,0.28) 0, transparent 40%), radial-gradient(circle at 50% 100%, rgba(255,184,224,0.22) 0, transparent 50%)',
    cardBg: 'rgba(255,255,255,0.88)',
    cardBorder: 'rgba(201,184,255,0.38)',
    cardShadow: '0 6px 0 0 rgba(201,184,255,0.18), 0 14px 28px -10px rgba(180,140,255,0.14)',
    isDark: false,
  },
  dark: {
    pageBg: 'radial-gradient(ellipse at top, #1C1509 0%, #0D0A07 70%)',
    decorBg: 'radial-gradient(circle at 12% 8%, rgba(79,201,166,0.1) 0, transparent 35%), radial-gradient(circle at 88% 14%, rgba(79,201,166,0.07) 0, transparent 40%), radial-gradient(circle at 50% 100%, rgba(79,201,166,0.05) 0, transparent 50%)',
    cardBg: '#18130A',
    cardBorder: 'rgba(255,255,255,0.06)',
    cardShadow: '0 6px 0 0 rgba(0,0,0,0.5), 0 14px 28px -10px rgba(0,0,0,0.6)',
    isDark: true,
  },
}

const primaryActionClassName =
  'inline-flex w-full items-center justify-center rounded-2xl bg-bd-ink px-5 py-3 text-sm font-bold text-bd-bg shadow-[0_4px_0_var(--bd-coral)] transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_0_var(--bd-coral)] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white'
const secondaryActionClassName =
  'inline-flex w-full items-center justify-center rounded-2xl border-2 border-bd-ink bg-bd-card-warm px-5 py-3 text-sm font-bold text-bd-ink transition-colors hover:bg-bd-bg2'
const quietActionClassName =
  'inline-flex items-center justify-center rounded-2xl border border-bd-line bg-bd-card-warm px-5 py-3 text-sm font-bold text-bd-ink-soft transition-colors hover:bg-bd-bg2'

export default function PublicProfileView({
  profile,
  initialRelation,
  accessState = 'available',
  mode = 'page',
  onBack,
  ownerVisibility,
}: PublicProfileViewProps) {
  const { t, i18n } = useTranslation()
  const [relation, setRelation] = useState<PublicProfileRelation>(initialRelation)
  const [submitting, setSubmitting] = useState(false)
  const [copiedProfileLink, setCopiedProfileLink] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  // A guest's identity lives in this browser's storage, which the server that rendered
  // `relation` cannot see; read after mount so the first render matches the server's.
  const [hasGuestIdentity, setHasGuestIdentity] = useState(false)
  useEffect(() => {
    setHasGuestIdentity(!!getGuestData())
  }, [])

  const pageTheme = profile.isPremium && profile.premiumCardStyle
    ? (PREMIUM_PAGE_THEMES[profile.premiumCardStyle] ?? null)
    : null
  const isDark = pageTheme?.isDark ?? false

  const tc = isDark ? {
    eyebrow:      'text-white/55',
    handle:       'text-white/55',
    body:         'text-white/80',
    back:         'text-white/65 hover:bg-white/[0.08]',
    statCard:     'border-white/[0.07] bg-white/[0.05]',
    statLabel:    'text-white/55',
    statValueAlt: 'text-white/90',
    badge:        'border-white/10 bg-white/[0.07] text-white/80',
  } : {
    eyebrow:      'text-bd-ink-soft',
    handle:       'text-bd-ink-soft',
    body:         'text-bd-ink-soft',
    back:         'text-bd-ink-soft hover:bg-bd-bg2',
    statCard:     'border-bd-line bg-bd-card-warm',
    statLabel:    'text-bd-ink-soft',
    statValueAlt: 'text-bd-ink',
    badge:        'border-bd-line bg-bd-card-warm text-bd-ink',
  }
  const isEmbeddedPreview = mode === 'embedded-preview'
  const shouldShowAction = !isEmbeddedPreview

  const displayName = profile.username?.trim() || t('profile.publicProfile.playerFallback')
  const handle = displayName.replace(/\s+/g, '').toLowerCase()
  const levelSourceGames = profile.completedGamesCount ?? profile.gamesPlayed ?? 0
  const level = Math.max(1, Math.floor(levelSourceGames / 10) + 1)
  const memberSince = profile.createdAt
    ? new Date(profile.createdAt).toLocaleDateString(i18n.language || undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : ''
  const publicProfilePath = `/u/${profile.publicProfileId}`
  // Report (#1172) by public profile id: this page never learns the user id, and a
  // report does not need it to. Only what the page shows can be reported, and only by
  // someone who can report at all: signed in, or a guest on this device. A visitor
  // with neither would only be told to sign in.
  const canReport = relation !== 'login_required' || hasGuestIdentity
  const reportTargets: ReportTarget[] = []
  if (relation !== 'self' && !isEmbeddedPreview && canReport) {
    const publicProfileId = profile.publicProfileId
    if (profile.username) reportTargets.push({ targetType: 'username', publicProfileId })
    // The picture is public, like the username; a hidden profile's bio is not (#1226).
    if (profile.avatarUrl || profile.image) reportTargets.push({ targetType: 'avatar', publicProfileId })
    if (accessState === 'available' && profile.bio) reportTargets.push({ targetType: 'bio', publicProfileId })
  }

  const renderReportButton = (className: string) =>
    reportTargets.length > 0 ? (
      <>
        <button
          type="button"
          onClick={() => setReportOpen(true)}
          aria-haspopup="dialog"
          className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav-deep ${className}`}
        >
          <Icon name="flag" size={13} />
          {t('report.reportProfile')}
        </button>
        <ReportDialog isOpen={reportOpen} onClose={() => setReportOpen(false)} targets={reportTargets} />
      </>
    ) : null
  const unlockedAchievementsByKey = new Map(
    (profile.unlockedAchievements ?? []).map((a) => [a.key, a.unlockedAt])
  )
  const achievementBadges = ACHIEVEMENTS.map((achievement) => {
    const unlockedAt = unlockedAchievementsByKey.get(achievement.key) ?? null
    const description = t(`achievements.${achievement.key}.description` as TranslationKeys)
    return {
      id: achievement.key,
      icon: achievement.icon,
      accent: ACHIEVEMENT_CATEGORY_ACCENT[achievement.category],
      label: t(`achievements.${achievement.key}.name` as TranslationKeys),
      tooltip: unlockedAt
        ? `${description} — ${t('profile.achievements.unlockedOn' as TranslationKeys, { date: new Date(unlockedAt).toLocaleDateString(i18n.language || undefined) })}`
        : description,
      earned: unlockedAt !== null,
    }
  })

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
          className="inline-flex w-full max-w-xs items-center justify-center rounded-2xl border-2 border-bd-lav-deep bg-bd-lav px-5 py-3 text-sm font-bold text-[color:var(--bd-ink-on-accent)] shadow-[0_4px_0_var(--bd-lav-deep)] transition-all hover:-translate-y-0.5 hover:bg-bd-lav-mid hover:shadow-[0_6px_0_var(--bd-lav-deep)]"
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

  // The owner always sees their own profile (#1226), so the top of it says who else
  // does, with a link straight to the setting that changes it.
  const renderOwnerNote = () => {
    if (relation !== 'self' || !ownerVisibility) return null
    const note = OWNER_VISIBILITY_NOTE[ownerVisibility]
    return (
      <p
        data-testid="owner-visibility-note"
        className={`mt-4 flex w-fit max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border px-3.5 py-2 text-sm ${tc.badge}`}
      >
        <Icon name={note.icon} size={15} className="shrink-0" />
        <span>{t(note.key)}</span>
        <Link
          href={PRIVACY_SETTINGS_HREF}
          className={`font-bold underline underline-offset-2 ${isDark ? 'text-bd-lav hover:text-white' : 'text-bd-lav-deep hover:text-bd-ink dark:text-bd-lav'}`}
        >
          {t('profile.publicProfile.privacySettingsLink')}
        </Link>
      </p>
    )
  }

  const renderAvatar = (sizeClassName = 'h-48 w-48 sm:h-56 sm:w-56') => (
    <div className="relative">
      <div
        className={`flex ${sizeClassName} items-center justify-center overflow-hidden rounded-[2rem] border-[3px] border-bd-ink bg-bd-lav text-[color:var(--bd-ink-on-accent)] shadow-[6px_6px_0_var(--bd-ink)]`}
      >
        {(profile.avatarUrl || profile.image) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatarUrl ?? profile.image!} alt={displayName} className="h-full w-full object-cover" />
        ) : (
          <span className="font-display text-7xl font-black uppercase sm:text-8xl">
            {displayName.charAt(0)}
          </span>
        )}
      </div>
      <div className="absolute -bottom-3 -right-4 rotate-[8deg] rounded-full border-2 border-bd-ink bg-bd-mint px-3 py-1 font-display text-xs font-bold text-bd-ink shadow-[2px_2px_0_var(--bd-ink)]">
        {t('profile.publicProfile.levelBadge', { level })}
      </div>
      {profile.isPremium && (
        <div
          className="absolute -top-3 -left-4 z-10 -rotate-[8deg] rounded-full border-2 border-bd-ink px-3 py-1 font-display text-xs font-bold text-bd-ink shadow-[2px_2px_0_var(--bd-ink)]"
          style={{ background: '#FBBF24' }}
        >
          {t('common.premium')}
        </div>
      )}
    </div>
  )

  // What a viewer who may not see the profile gets (#1226), Steam's "This profile is
  // private": the username, the picture and the notice, nothing else. The page is not
  // even sent the rest (app/u/[publicProfileId]/page.tsx). A friends-only profile keeps
  // the friend request, the one way to be let in.
  const renderRestrictedState = () => (
    <div
      data-testid="restricted-profile"
      className="mx-auto flex w-full max-w-xl flex-col items-center rounded-[2rem] border-[1.5px] border-bd-line bg-bd-card-warm px-5 py-8 text-center shadow-[0_6px_0_0_rgba(31,27,22,0.08),0_14px_28px_-10px_rgba(31,27,22,0.18)] sm:px-10 sm:py-10"
    >
      <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-[1.75rem] border-[3px] border-bd-ink bg-bd-bg2 text-bd-ink-muted shadow-[5px_5px_0_var(--bd-ink)] sm:h-32 sm:w-32">
        {(profile.avatarUrl || profile.image) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatarUrl ?? profile.image!} alt={displayName} className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden className="font-display text-6xl font-black uppercase">{displayName.charAt(0)}</span>
        )}
      </div>
      <p className="mt-6 font-mono text-xs font-semibold uppercase tracking-[0.32em] text-bd-ink-soft">
        {t('profile.publicProfile.eyebrow')}
      </p>
      <h1 className="mt-2 max-w-full break-words font-display text-[clamp(1.5rem,7.5vw,2.25rem)] font-black leading-tight text-bd-ink">
        {displayName}
      </h1>
      <p className="mt-5 inline-flex items-center gap-2 rounded-full border-2 border-bd-ink bg-bd-sun px-4 py-1.5 text-sm font-bold text-bd-ink shadow-[2px_2px_0_var(--bd-ink)]"
      >
        <Icon name="lock" size={15} />
        {t('profile.publicProfile.privateTitle')}
      </p>
      <p className="mt-4 max-w-md text-sm leading-6 text-bd-ink-soft sm:text-base">
        {accessState === 'friends_only'
          ? t('profile.publicProfile.friendsOnlySubtitle')
          : t('profile.publicProfile.privateSubtitle')}
      </p>
      <div className={`mt-7 grid w-full gap-3 sm:w-auto sm:min-w-[20rem] ${isEmbeddedPreview ? '' : 'sm:grid-cols-2'}`}>
        <button type="button" onClick={handleBack} className={quietActionClassName}>
          {t('common.back')}
        </button>
        {isEmbeddedPreview ? null : accessState === 'friends_only' ? (
          renderAction()
        ) : (
          <Link href="/" className={primaryActionClassName}>
            {t('common.goHome')}
          </Link>
        )}
      </div>
      {renderReportButton('mt-5 text-bd-ink-soft hover:text-bd-ink')}
    </div>
  )

  return (
    <div
      className={`relative overflow-hidden text-bd-ink ${
        isEmbeddedPreview
          ? 'rounded-[2rem] border-[1.5px] border-bd-line bg-bd-bg shadow-[0_6px_0_0_rgba(31,27,22,0.08),0_14px_28px_-10px_rgba(31,27,22,0.18)]'
          : 'flex min-h-[var(--game-h)] items-center safe-left safe-right'
      } ${isDark ? 'text-white' : 'bg-bd-bg'}`}
      style={{
        ...(isEmbeddedPreview ? undefined : { minHeight: 'var(--game-h)' }),
        ...(pageTheme && !isEmbeddedPreview ? { background: pageTheme.pageBg } : {}),
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: pageTheme ? pageTheme.decorBg : 'radial-gradient(circle at 12% 8%, rgba(255,196,77,0.18) 0, transparent 35%), radial-gradient(circle at 88% 14%, rgba(155,140,255,0.16) 0, transparent 40%), radial-gradient(circle at 50% 100%, rgba(79,201,166,0.14) 0, transparent 50%)' }}
      />
      <div className={`pointer-events-none absolute right-[-4rem] top-20 h-44 w-44 rounded-full ${isDark ? 'bg-bd-mint/5' : 'bg-bd-lav/10'}`} />
      <div className={`pointer-events-none absolute left-[-3rem] bottom-20 h-36 w-36 rotate-12 rounded-[2rem] ${isDark ? 'bg-bd-mint/5' : 'bg-bd-mint/10'}`} />

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
          <div
            className="relative w-full overflow-hidden rounded-[2rem] border-[1.5px]"
            style={{
              background: pageTheme?.cardBg ?? 'var(--bd-input-bg)',
              borderColor: pageTheme?.cardBorder ?? 'var(--bd-line)',
              boxShadow: pageTheme?.cardShadow ?? '0 6px 0 0 rgba(31,27,22,0.08), 0 14px 28px -10px rgba(31,27,22,0.18)',
            }}
          >
            <div className={`dot-grid absolute inset-0 ${isDark ? 'opacity-20' : 'opacity-30'}`} />
            <div className="relative grid gap-0 md:grid-cols-[1.1fr_0.9fr]">
              <div className="p-6 sm:p-8 md:p-10">
                <button
                  type="button"
                  onClick={handleBack}
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors ${tc.back}`}
                >
                  <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {t('common.back')}
                </button>

                {renderOwnerNote()}

                <div className="mt-8 max-w-2xl">
                  <p className={`font-mono text-xs font-semibold uppercase tracking-[0.32em] ${tc.eyebrow}`}>
                    {t('profile.publicProfile.eyebrow')}
                  </p>
                  <h1
                    className={`mt-3 font-display text-4xl font-black leading-none sm:text-5xl ${
                      profile.isPremium && !profile.accentColor
                        ? 'text-amber-500'
                        : !profile.isPremium
                          ? isDark ? 'text-white' : 'text-bd-ink'
                          : ''
                    }`}
                    style={profile.isPremium && profile.accentColor ? { color: profile.accentColor } : undefined}
                  >
                    {displayName}
                    {profile.isPremium && <Icon name="crown" size={32} tone="premium" label="Premium" className="ml-2" />}
                  </h1>
                  <p className={`mt-2 font-mono text-xs font-semibold uppercase tracking-[0.18em] ${tc.handle}`}>
                    @{handle}
                  </p>
                  {profile.bio ? (
                    <p className={`mt-4 max-w-xl text-sm italic leading-6 ${isDark ? 'text-white/80' : 'text-bd-ink'}`}>
                      &ldquo;{profile.bio}&rdquo;
                    </p>
                  ) : (
                    <p className={`mt-4 max-w-xl text-sm leading-6 sm:text-base ${tc.body}`}>
                      {t('profile.publicProfile.subtitle')}
                    </p>
                  )}
                  {profile.isPremium && profile.featuredGame && (() => {
                    const meta = getGameMetadata(profile.featuredGame!)
                    if (!meta) return null
                    const gameName = t(`games.${meta.translationKey}.name` as TranslationKeys, meta.name)
                    return (
                      <div className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${tc.badge}`}>
                        <GameIcon gameId={meta.svgId} accentColor="currentColor" detailColor="var(--bd-bg)" size={14} variant="bare" />
                        <span>{t('profile.publicProfile.lovesGame', { game: gameName })}</span>
                      </div>
                    )
                  })()}
                </div>

                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  <div className={`relative overflow-hidden rounded-2xl border p-4 ${tc.statCard}`}>
                    <div className="absolute -right-3 -top-3 h-14 w-14 rounded-full bg-bd-coral opacity-20" />
                    <p className={`font-mono text-[11px] uppercase tracking-[0.22em] ${tc.statLabel}`}>
                      {t('profile.friends.title')}
                    </p>
                    <p className={`mt-3 font-display text-3xl font-bold ${isDark ? 'text-bd-coral' : 'text-bd-coral-deep dark:text-white'}`}>
                      {profile.friendsCount ?? 0}
                    </p>
                  </div>
                  <div className={`relative overflow-hidden rounded-2xl border p-4 ${tc.statCard}`}>
                    <div className="absolute -right-3 -top-3 h-14 w-14 rounded-full bg-bd-mint opacity-20" />
                    <p className={`font-mono text-[11px] uppercase tracking-[0.22em] ${tc.statLabel}`}>
                      {t('profile.stats.gamesCompleted')}
                    </p>
                    <p className={`mt-3 font-display text-3xl font-bold ${isDark ? 'text-bd-mint' : 'text-bd-mint-deep dark:text-white'}`}>
                      {levelSourceGames}
                    </p>
                  </div>
                  <div className={`relative overflow-hidden rounded-2xl border p-4 ${tc.statCard}`}>
                    <div className="absolute -right-3 -top-3 h-14 w-14 rounded-full bg-bd-sun opacity-25" />
                    <p className={`font-mono text-[11px] uppercase tracking-[0.22em] ${tc.statLabel}`}>
                      {t('profile.memberSince')}
                    </p>
                    <p className={`mt-3 text-lg font-bold ${tc.statValueAlt}`}>{memberSince}</p>
                  </div>
                </div>

                <div className="mt-6">
                  <p className={`font-mono text-[11px] uppercase tracking-[0.22em] ${tc.statLabel}`}>
                    {t('profile.achievements.title')}
                  </p>
                  <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))] gap-2">
                    {achievementBadges.map((badge) => (
                      <div
                        key={badge.id}
                        title={badge.tooltip}
                        className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-center transition-opacity ${
                          badge.earned
                            ? `${tc.statCard} opacity-100`
                            : `${tc.statCard} opacity-40 grayscale`
                        }`}
                      >
                        <span style={badge.earned ? { color: badge.accent } : undefined}>
                          <Icon name={badge.earned ? badge.icon : 'lock'} size={20} />
                        </span>
                        <span className={`text-[10px] font-bold leading-tight ${tc.statLabel}`}>{badge.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {shouldShowAction && (
                  <div
                    className={`mt-8 ${
                      relation === 'self' ? 'flex justify-center' : ''
                    } w-full`}
                  >
                    {renderAction()}
                  </div>
                )}
              </div>

              {(() => {
                const panelCardStyle = profile.isPremium && profile.premiumCardStyle
                const isDarkPanel = panelCardStyle && profile.premiumCardStyle === 'dark'
                return (
                  <div
                    className={`relative flex items-center justify-center border-t p-6 sm:p-8 md:border-l md:border-t-0 md:p-10 ${panelCardStyle ? 'border-transparent' : 'border-bd-line bg-bd-card-warm'}`}
                    style={panelCardStyle ? getPremiumPanelStyle(profile.premiumCardStyle!) : undefined}
                  >
                    <div className="relative flex w-full max-w-sm flex-col items-center text-center">
                      {panelCardStyle ? (
                        <div className="w-full">
                          <PremiumProfileCard
                            style={profile.premiumCardStyle as PremiumCardStyle}
                            profile={{
                              displayName,
                              handle,
                              bio: profile.bio,
                              memberSince,
                              gamesPlayed: levelSourceGames,
                              level,
                              avatarUrl: profile.avatarUrl ?? profile.image,
                            }}
                          />
                        </div>
                      ) : (
                        renderAvatar()
                      )}
                      <p className={`mt-8 text-sm leading-6 ${isDarkPanel ? 'text-white/65' : 'text-bd-ink-soft'}`}>
                        {t('profile.publicProfile.linkHint')}
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleCopyProfileLink()}
                        disabled={copiedProfileLink}
                        aria-label={copiedProfileLink ? t('profile.publicProfile.linkCopied') : t('profile.publicProfile.copyLink')}
                        className="mt-4 inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-bd-lav-deep bg-bd-lav px-4 py-3 text-sm font-bold text-[color:var(--bd-ink-on-accent)] shadow-[0_4px_0_var(--bd-lav-deep)] transition-all hover:-translate-y-0.5 hover:bg-bd-lav-mid hover:shadow-[0_6px_0_var(--bd-lav-deep)] disabled:cursor-default disabled:opacity-90"
                      >
                        {copiedProfileLink ? (
                          <>
                            <span>{t('profile.publicProfile.linkCopied')}</span>
                            <Icon name="check" size={16} />
                          </>
                        ) : (
                          <>
                            <span>{t('profile.publicProfile.copyLink')}</span>
                            <Icon name="link" size={16} />
                          </>
                        )}
                      </button>
                      {renderReportButton(
                        `mt-4 ${isDarkPanel ? 'text-white/65 hover:text-white/90' : 'text-bd-ink-soft hover:text-bd-ink'}`
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
