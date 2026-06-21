'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useGuest } from '@/contexts/GuestContext'
import BoardlyAvatar from '@/components/ui/BoardlyAvatar'
import { useTranslation } from '@/lib/i18n-helpers'

export default function CtaBanner() {
  const { data: session, status } = useSession()
  const { isGuest, guestName } = useGuest()
  const { t } = useTranslation()
  const isLoggedIn = status === 'authenticated'
  const displayName = session?.user?.name || session?.user?.email?.split('@')[0] || 'friend'

  const content = isLoggedIn
    ? {
        title: t('home.ctaLoggedInTitle', { name: displayName }),
        accent: t('home.ctaLoggedInAccent'),
        body: t('home.ctaLoggedInBody'),
        primaryHref: '/games',
        primaryLabel: t('home.browseGames'),
        secondaryHref: '/profile',
        secondaryLabel: t('home.openProfile'),
      }
    : isGuest && guestName
      ? {
          title: t('home.ctaGuestTitle'),
          accent: t('home.ctaGuestAccent'),
          body: t('home.ctaGuestBody'),
          primaryHref: '/auth/register',
          primaryLabel: t('home.createFreeAccount'),
          secondaryHref: '/games',
          secondaryLabel: t('home.keepPlaying'),
        }
      : {
          title: t('home.ctaVisitorTitle'),
          accent: t('home.ctaVisitorAccent'),
          body: t('home.ctaVisitorBody'),
          primaryHref: '/games',
          primaryLabel: t('home.browseGames'),
          secondaryHref: '/auth/register',
          secondaryLabel: t('home.createFreeAccount'),
        }

  const avatarNames = isLoggedIn
    ? [
        { name: displayName, color: 'coral' },
        { name: 'Friend', color: 'mint' },
        { name: 'Guest', color: 'sun' },
        { name: 'Player', color: 'lav' },
      ] as const
    : isGuest && guestName
      ? [
          { name: guestName, color: 'sun' },
          { name: 'Anna', color: 'coral' },
          { name: 'Max', color: 'mint' },
          { name: 'Liz', color: 'lav' },
        ] as const
      : [
          { name: 'Anna', color: 'coral' },
          { name: 'Max', color: 'mint' },
          { name: 'Liz', color: 'sun' },
          { name: 'Ivan', color: 'lav' },
        ] as const

  return (
    <section className="home-cta-section">
      <div
        style={{
          color: 'var(--bd-bg)',
          maxWidth: 1280,
          margin: '0 auto',
          padding: 'clamp(36px, 6vw, 56px) clamp(28px, 5vw, 64px)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
          alignItems: 'center',
          gap: 48,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'relative' }}>
          <h2
            style={{
              fontFamily: 'var(--bd-font-display)',
              fontSize: 44,
              fontWeight: 800,
              lineHeight: 1,
              marginBottom: 16,
              letterSpacing: 0,
            }}
          >
            {content.title}<br />{content.accent}
          </h2>
          <p
            style={{
              fontSize: 17,
              color: 'var(--bd-bg)',
              opacity: 0.7,
              marginBottom: 28,
              maxWidth: 420,
              lineHeight: 1.5,
            }}
          >
            {content.body}
          </p>
          <div className="home-cta-row">
            <Link
              href={content.primaryHref}
              className="home-cta-button home-cta-button-primary"
            >
              {content.primaryLabel}
            </Link>
            <Link
              href={content.secondaryHref}
              className="home-cta-button home-cta-button-outline home-cta-button-on-dark"
            >
              {content.secondaryLabel}
            </Link>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            position: 'relative',
            gap: 0,
          }}
        >
          {avatarNames.map((a, i) => (
            <BoardlyAvatar
              key={a.name}
              name={a.name}
              color={a.color}
              size={64}
              style={{ marginLeft: i === 0 ? 0 : -16 }}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
