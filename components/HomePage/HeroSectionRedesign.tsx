'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useTranslation } from '@/lib/i18n-helpers'
import { useGuest } from '@/contexts/GuestContext'
import { buildCurrentAuthUrl } from '@/lib/auth-redirect'
import { showToast } from '@/lib/i18n-toast'
import QuickPlayButton from './QuickPlayButton'
import HeroBoard from './HeroBoard'

export type HomeHeroFacts = {
  availableGameCount: number
  catalogGameCount: number
  inDevelopmentGameCount: number
  quickPlayGameCount: number
}

interface HeroSectionRedesignProps {
  facts: HomeHeroFacts
}

export default function HeroSectionRedesign({ facts }: HeroSectionRedesignProps) {
  const router = useRouter()
  const { data: session, status } = useSession()
  const { t } = useTranslation()
  const { isGuest, guestName, setGuestMode, clearGuestMode } = useGuest()
  const [showGuestForm, setShowGuestForm] = useState(false)
  const [name, setName] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const isLoggedIn = status === 'authenticated'
  const userName = session?.user?.name
  const userEmail = session?.user?.email
  const displayName = userName || userEmail?.split('@')[0]

  async function handleStartGuest() {
    if (name.trim().length < 2) {
      showToast.error('guest.nameTooShort')
      return
    }
    setIsLoading(true)
    try {
      await setGuestMode(name.trim())
      showToast.success('guest.welcome', undefined, { name: name.trim() })
      router.push('/games')
    } catch (error) {
      const err = error as Error & { translationKey?: string; statusCode?: number }
      if (err.translationKey) {
        showToast.error(err.translationKey)
      } else if (err.statusCode === 409) {
        showToast.error('auth.username.taken')
      } else {
        showToast.errorFrom(err, 'guest.startFailed')
      }
      setIsLoading(false)
    }
  }

  // Guest registered — show welcome state (centered, fallback style)
  if (isGuest && guestName) {
    return (
      <div
        className="home-hero-shell flex-col justify-center text-center"
        style={{ alignItems: 'center' }}
      >
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: '50%',
            background: 'rgba(255,107,91,0.15)',
            display: 'grid',
            placeItems: 'center',
            fontSize: 48,
            marginBottom: 24,
            border: '2px solid var(--bd-line)',
          }}
        >
          👤
        </div>
        <h1
          style={{
            fontFamily: 'var(--bd-font-display)',
            fontSize: 'clamp(36px, 6vw, 64px)',
            fontWeight: 800,
            color: 'var(--bd-ink)',
            marginBottom: 24,
            lineHeight: 1,
          }}
        >
          {t('guest.welcome', { name: guestName })}
        </h1>
        <div
          style={{
            background: 'white',
            border: '1.5px solid var(--bd-line)',
            borderRadius: 24,
            padding: '20px 28px',
            marginBottom: 24,
            maxWidth: 480,
            width: '100%',
            boxShadow: '0 6px 0 rgba(31,27,22,0.08)',
          }}
        >
          <p style={{ color: 'var(--bd-ink-soft)', fontSize: 16, marginBottom: 4 }}>{t('guest.playingAs')}</p>
          <p style={{ color: 'var(--bd-ink-muted)', fontSize: 14 }}>{t('guest.limitedFeatures')}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 400 }}>
          <QuickPlayButton />
          <button
            onClick={() => router.push('/games')}
            style={{
              padding: '14px 28px',
              background: 'var(--bd-ink)',
              color: 'var(--bd-bg)',
              borderRadius: 14,
              fontWeight: 600,
              fontSize: 16,
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 0 var(--bd-coral)',
            }}
          >
            {t('home.browseGames')}
          </button>
          <button
            onClick={clearGuestMode}
            style={{
              padding: '14px 28px',
              background: 'transparent',
              color: 'var(--bd-ink-soft)',
              borderRadius: 14,
              fontWeight: 600,
              fontSize: 15,
              border: '2px solid var(--bd-line)',
              cursor: 'pointer',
            }}
          >
            {t('guest.exit')}
          </button>
        </div>
      </div>
    )
  }

  // Guest registration form
  if (showGuestForm) {
    return (
      <div
        className="home-hero-shell flex-col justify-center text-center"
        style={{ alignItems: 'center', position: 'relative' }}
      >
        <button
          onClick={() => { setShowGuestForm(false); setName('') }}
          style={{
            position: 'absolute',
            top: 32,
            left: 32,
            color: 'var(--bd-ink-muted)',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 15,
          }}
        >
          <span style={{ fontSize: 22 }}>←</span>
          <span>{t('common.back')}</span>
        </button>

        <div
          style={{
            width: 96, height: 96, borderRadius: '50%',
            background: 'rgba(255,107,91,0.15)',
            display: 'grid', placeItems: 'center',
            fontSize: 48, marginBottom: 24,
            border: '2px solid var(--bd-line)',
          }}
        >
          👤
        </div>
        <h1
          style={{
            fontFamily: 'var(--bd-font-display)',
            fontSize: 'clamp(32px, 5vw, 56px)',
            fontWeight: 800,
            color: 'var(--bd-ink)',
            marginBottom: 12,
            lineHeight: 1,
          }}
        >
          {t('guest.enterName')}
        </h1>
        <p style={{ fontSize: 18, color: 'var(--bd-ink-soft)', marginBottom: 32, maxWidth: 420 }}>
          {t('guest.nameDescription', 'Choose a name to start playing instantly')}
        </p>

        <div
          style={{
            background: 'white',
            border: '1.5px solid var(--bd-line)',
            borderRadius: 24,
            padding: 32,
            width: '100%',
            maxWidth: 440,
            boxShadow: '0 6px 0 rgba(31,27,22,0.08)',
          }}
        >
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('guest.namePlaceholder')}
            maxLength={20}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim().length >= 2) handleStartGuest() }}
            style={{
              width: '100%',
              padding: '14px 16px',
              border: '2px solid var(--bd-line)',
              borderRadius: 12,
              fontSize: 16,
              marginBottom: 12,
              outline: 'none',
              fontFamily: 'inherit',
              color: 'var(--bd-ink)',
              background: 'white',
            }}
          />
          <p style={{ color: 'var(--bd-ink-muted)', fontSize: 13, marginBottom: 20, textAlign: 'left' }}>
            💡 {t('guest.limitedFeatures')}
          </p>
          <button
            onClick={handleStartGuest}
            disabled={name.trim().length < 2 || isLoading}
            style={{
              width: '100%',
              padding: '16px 28px',
              background: 'var(--bd-coral)',
              color: 'white',
              borderRadius: 14,
              fontWeight: 700,
              fontSize: 17,
              border: 'none',
              cursor: name.trim().length < 2 || isLoading ? 'not-allowed' : 'pointer',
              opacity: name.trim().length < 2 || isLoading ? 0.5 : 1,
              boxShadow: '0 4px 0 var(--bd-coral-deep)',
              fontFamily: 'inherit',
            }}
          >
            🎮 {isLoading ? t('common.loading') : t('guest.startPlaying', 'Start Playing')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <section className="home-hero-shell">
      <div
        style={{
          width: '100%',
          maxWidth: 1280,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))',
          gap: 'clamp(32px, 5vw, 64px)',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 999,
                fontFamily: 'var(--bd-font-display)',
                fontWeight: 700,
                fontSize: 13,
                background: 'var(--bd-sun)',
                color: 'var(--bd-ink)',
                border: '2px solid var(--bd-ink)',
                boxShadow: '2px 2px 0 var(--bd-ink)',
              }}
            >
              🎲 {isLoggedIn && displayName ? `Welcome back, ${displayName}!` : `${facts.availableGameCount} games ready to play`}
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 999,
                fontFamily: 'var(--bd-font-display)',
                fontWeight: 700,
                fontSize: 13,
                background: 'white',
                color: 'var(--bd-ink-soft)',
                border: '1.5px solid var(--bd-line)',
              }}
            >
              {facts.inDevelopmentGameCount} more coming later
            </span>
          </div>

          <h1
            className="mb-6 font-display text-5xl font-extrabold leading-none text-bd-ink sm:text-6xl lg:text-7xl"
          >
            Boardly.<br />
            <span style={{ color: 'var(--bd-coral)' }}>Play board games online with friends.</span>
          </h1>

          <p
            style={{
              fontSize: 18,
              lineHeight: 1.5,
              color: 'var(--bd-ink-soft)',
              marginBottom: 36,
              maxWidth: 480,
            }}
          >
            Pick a game, make a room, and send your friends a link or room code.
            They can join from any modern browser, and guests do not need an account to start playing.
          </p>

          <div className="home-cta-row">
            {isLoggedIn ? (
              <>
                <QuickPlayButton className="home-cta-button home-cta-button-primary" />
                <button
                  onClick={() => router.push('/games')}
                  className="home-cta-button home-cta-button-outline"
                >
                  {t('home.browseGames')}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => router.push('/games')}
                  className="home-cta-button home-cta-button-primary"
                >
                  Browse games →
                </button>
                <button
                  onClick={() => setShowGuestForm(true)}
                  className="home-cta-button home-cta-button-outline"
                >
                  Play as guest
                </button>
                <button
                  onClick={() => router.push('/lobby')}
                  className="home-cta-button home-cta-button-warm"
                >
                  Join a room
                </button>
              </>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              gap: 32,
              marginTop: 48,
              paddingTop: 32,
              borderTop: '1px solid var(--bd-line)',
              flexWrap: 'wrap',
            }}
          >
            {[
              { label: 'Games ready now', value: String(facts.availableGameCount) },
              { label: 'Good for solo play', value: String(facts.quickPlayGameCount) },
              { label: 'Games in the collection', value: String(facts.catalogGameCount) },
              { label: 'Nothing to install', value: '0' },
            ].map((s) => (
              <div key={s.label}>
                <div
                  style={{
                    fontFamily: 'var(--bd-font-display)',
                    fontSize: 28,
                    fontWeight: 700,
                    color: 'var(--bd-ink)',
                    lineHeight: 1,
                  }}
                >
                  {s.value}
                </div>
                <div style={{ fontSize: 13, color: 'var(--bd-ink-muted)', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — board illustration */}
        <HeroBoard />
      </div>
    </section>
  )
}
