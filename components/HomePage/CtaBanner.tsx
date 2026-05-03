'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useGuest } from '@/contexts/GuestContext'
import BoardlyAvatar from '@/components/ui/BoardlyAvatar'

export default function CtaBanner() {
  const { data: session, status } = useSession()
  const { isGuest, guestName } = useGuest()
  const isLoggedIn = status === 'authenticated'
  const displayName = session?.user?.name || session?.user?.email?.split('@')[0] || 'friend'

  const content = isLoggedIn
    ? {
        title: `Welcome back, ${displayName}.`,
        accent: 'Pick a game and start a room.',
        body: 'Your profile, friends, stats, and game history are ready when you are.',
        primaryHref: '/games',
        primaryLabel: 'Browse games',
        secondaryHref: '/profile',
        secondaryLabel: 'Open profile',
      }
    : isGuest && guestName
      ? {
          title: `Ready for another round, ${guestName}?`,
          accent: 'Keep playing as a guest.',
          body: 'You can jump into games right away. Create an account later if you want to keep your profile, stats, and history.',
          primaryHref: '/games',
          primaryLabel: 'Browse games',
          secondaryHref: '/auth/register',
          secondaryLabel: 'Save my progress',
        }
      : {
          title: 'Make a room.',
          accent: 'Send a link. Play.',
          body: 'Start as a guest when you just want to play. Create an account when you want to keep your profile, stats, and game history.',
          primaryHref: '/games',
          primaryLabel: 'Browse games',
          secondaryHref: '/auth/register',
          secondaryLabel: 'Create account',
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
              color: 'rgba(251,246,238,0.7)',
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
