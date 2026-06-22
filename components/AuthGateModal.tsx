'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useGuest } from '@/contexts/GuestContext'
import { buildAuthUrl } from '@/lib/auth-redirect'
import { useTranslation } from '@/lib/i18n-helpers'

interface AuthGateModalProps {
  /** Where Login/Sign Up should return to, and (if onGuestReady is omitted) where guest play navigates. */
  dest: string
  onClose: () => void
  /** When provided, guest play calls this instead of navigating to `dest` — for flows that create
   * their own destination after guest mode is set (e.g. Play vs Bot creating a lobby on demand). */
  onGuestReady?: () => void
}

export function AuthGateModal({ dest, onClose, onGuestReady }: AuthGateModalProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const { setGuestMode } = useGuest()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = name.trim().length >= 2

  async function handleGuestPlay() {
    if (!canSubmit || loading) return
    setLoading(true)
    setError(null)
    try {
      await setGuestMode(name.trim())
      onClose()
      if (onGuestReady) {
        onGuestReady()
      } else {
        router.push(dest)
      }
    } catch {
      setError(t('guest.startFailed'))
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(31,27,22,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-sm"
        style={{
          background: 'var(--bd-bg)',
          border: '2px solid var(--bd-ink)',
          borderRadius: 24,
          boxShadow: '6px 6px 0 var(--bd-ink)',
          padding: '28px 24px',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{
            width: 56, height: 56, margin: '0 auto 14px',
            borderRadius: 16, background: 'var(--bd-sun)',
            border: '2px solid var(--bd-ink)', boxShadow: '3px 3px 0 var(--bd-ink)',
            display: 'grid', placeItems: 'center', fontSize: 28,
          }}>🎮</div>
          <h2 style={{
            fontFamily: 'var(--bd-font-display)', fontWeight: 800, fontSize: 22,
            color: 'var(--bd-ink)', letterSpacing: '-0.02em', margin: '0 0 8px',
          }}>
            {t('header.authGateTitle')}
          </h2>
          <p style={{ fontSize: 14, color: 'var(--bd-ink-soft)', lineHeight: 1.5, margin: 0 }}>
            {t('header.authGateDesc')}
          </p>
        </div>

        {/* Guest name input */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bd-ink)', marginBottom: 7 }}>
            {t('guest.enterName')}
          </label>
          <input
            className="bd-input"
            type="text"
            placeholder={t('guest.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleGuestPlay() }}
            disabled={loading}
            maxLength={20}
            autoFocus
          />
        </div>

        {error && (
          <div style={{
            marginBottom: 12, padding: '10px 14px', borderRadius: 12,
            background: 'rgba(255,80,60,0.08)', border: '1.5px solid rgba(255,80,60,0.25)',
            fontSize: 13, color: 'var(--bd-coral-deep)', fontWeight: 500,
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleGuestPlay}
          disabled={!canSubmit || loading}
          className="bd-btn bd-btn-primary w-full justify-center"
          style={{ marginBottom: 18, width: '100%' }}
        >
          {loading ? '...' : t('guest.playAsGuest')}
        </button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--bd-line)' }} />
          <span style={{ fontSize: 13, color: 'var(--bd-ink-muted)' }}>or</span>
          <div style={{ flex: 1, height: 1, background: 'var(--bd-line)' }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button
            onClick={() => { onClose(); router.push(buildAuthUrl('login', dest)) }}
            className="bd-btn bd-btn-soft w-full justify-center"
          >
            {t('header.login')}
          </button>
          <button
            onClick={() => { onClose(); router.push(buildAuthUrl('register', dest)) }}
            className="bd-btn bd-btn-ghost w-full justify-center"
          >
            {t('header.signUp')}
          </button>
        </div>
      </div>
    </div>
  )
}
