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

export default function HeroSectionRedesign() {
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
        className="flex flex-col items-center justify-center text-center"
        style={{ minHeight: 'calc(100vh - 64px)', padding: '48px 24px' }}
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
        className="flex flex-col items-center justify-center text-center"
        style={{ minHeight: 'calc(100vh - 64px)', padding: '48px 24px', position: 'relative' }}
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

  // Main hero — 2-column layout (responsive: stacks on mobile)
  return (
    <section style={{ padding: 'clamp(40px, 6vh, 80px) clamp(16px, 4vw, 48px) clamp(32px, 5vh, 56px)', maxWidth: 1280, margin: '0 auto' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))',
          gap: 'clamp(32px, 5vw, 64px)',
          alignItems: 'center',
        }}
      >
        {/* LEFT — text + CTAs */}
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
              🎲 {isLoggedIn && displayName ? `Welcome back, ${displayName}!` : '1,248 playing now'}
            </span>
          </div>

          <h1
            style={{
              fontFamily: 'var(--bd-font-display)',
              fontSize: 'clamp(48px, 7vw, 84px)',
              fontWeight: 800,
              lineHeight: 0.95,
              marginBottom: 24,
              letterSpacing: '-0.04em',
              color: 'var(--bd-ink)',
            }}
          >
            Game night.<br />
            <span style={{ color: 'var(--bd-coral)' }}>No table required.</span>
          </h1>

          <p
            style={{
              fontSize: 'clamp(16px, 2vw, 19px)',
              lineHeight: 1.5,
              color: 'var(--bd-ink-soft)',
              marginBottom: 36,
              maxWidth: 480,
            }}
          >
            Hang out with friends, roll the dice, catch spies. Right in your browser — no download, no plugins.
          </p>

          {/* CTA buttons */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {isLoggedIn ? (
              <>
                <QuickPlayButton className="inline-flex items-center gap-2 px-7 py-4 rounded-2xl font-bold text-lg text-white bg-bd-coral shadow-bd-coral-4 hover:scale-105 transition-transform duration-150" />
                <button
                  onClick={() => router.push('/games')}
                  style={{
                    padding: '16px 28px',
                    borderRadius: 16,
                    fontWeight: 600,
                    fontSize: 17,
                    background: 'transparent',
                    color: 'var(--bd-ink)',
                    border: '2px solid var(--bd-ink)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {t('home.browseGames')}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => router.push('/games')}
                  style={{
                    padding: '16px 28px',
                    borderRadius: 16,
                    fontWeight: 700,
                    fontSize: 17,
                    background: 'var(--bd-coral)',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 4px 0 var(--bd-coral-deep)',
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  Play free →
                </button>
                <button
                  onClick={() => setShowGuestForm(true)}
                  style={{
                    padding: '16px 28px',
                    borderRadius: 16,
                    fontWeight: 600,
                    fontSize: 17,
                    background: 'transparent',
                    color: 'var(--bd-ink)',
                    border: '2px solid var(--bd-ink)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  I have a lobby code
                </button>
              </>
            )}
          </div>

          {/* Stats row */}
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
              { label: 'Games played', value: '2.4M' },
              { label: 'Players',       value: '180K' },
              { label: 'Countries',     value: '64' },
              { label: 'Rating',        value: '4.8★' },
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
