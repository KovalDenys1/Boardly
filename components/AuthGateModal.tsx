'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useGuest } from '@/contexts/GuestContext'
import { buildAuthUrl } from '@/lib/auth-redirect'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import Modal, { ModalCloseButton } from '@/components/Modal'

interface AuthGateModalProps {
  /** Where Login/Sign Up should return to, and (if onGuestReady is omitted) where guest play navigates. */
  dest: string
  onClose: () => void
  /** When provided, guest play calls this instead of navigating to `dest` — for flows that create
   * their own destination after guest mode is set (e.g. Play vs Bot creating a lobby on demand). */
  onGuestReady?: () => void
  /** Called only when the visitor dismisses the gate without choosing – onClose also
   * runs on the way to guest play, login and sign-up, so it cannot tell the two apart. */
  onDismiss?: () => void
  /** false where the gate is the page itself (/lobby/create): no Escape and no close button. */
  dismissible?: boolean
}

export function AuthGateModal({ dest, onClose, onGuestReady, onDismiss, dismissible = true }: AuthGateModalProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const { setGuestMode } = useGuest()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleId = useId()
  const descriptionId = useId()
  const nameId = useId()

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

  const dismiss = () => {
    onClose()
    onDismiss?.()
  }

  return (
    <Modal
      isOpen
      onClose={dismiss}
      dismissible={dismissible}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      maxWidth="sm"
      bodyPadding="none"
      panelClassName="rounded-bd-lg border-2 border-bd-ink bg-bd-bg shadow-[6px_6px_0_var(--bd-ink)]"
    >
      <div className="relative" style={{ padding: '28px 24px' }}>
        {dismissible && <ModalCloseButton onClick={dismiss} className="absolute right-2 top-2" />}
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{
            width: 56, height: 56, margin: '0 auto 14px',
            borderRadius: 16, background: 'var(--bd-sun)',
            border: '2px solid var(--bd-ink)', boxShadow: '3px 3px 0 var(--bd-ink)',
            display: 'grid', placeItems: 'center', fontSize: 28, color: 'var(--bd-ink-on-accent)',
          }}><Icon name="gamepad" size={30} /></div>
          <h2 id={titleId} style={{
            fontFamily: 'var(--bd-font-display)', fontWeight: 800, fontSize: 22,
            color: 'var(--bd-ink)', letterSpacing: '-0.02em', margin: '0 0 8px',
          }}>
            {t('header.authGateTitle')}
          </h2>
          <p id={descriptionId} style={{ fontSize: 14, color: 'var(--bd-ink-soft)', lineHeight: 1.5, margin: 0 }}>
            {t('header.authGateDesc')}
          </p>
        </div>

        {/* Guest name input */}
        <div style={{ marginBottom: 12 }}>
          <label htmlFor={nameId} style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bd-ink)', marginBottom: 7 }}>
            {t('guest.enterName')}
          </label>
          <input
            id={nameId}
            className="bd-input"
            type="text"
            placeholder={t('guest.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleGuestPlay() }}
            disabled={loading}
            maxLength={20}
            data-autofocus
          />
        </div>

        {error && (
          <div style={{
            marginBottom: 12, padding: '10px 14px', borderRadius: 12,
            background: 'rgba(255,80,60,0.08)', border: '1.5px solid rgba(255,80,60,0.25)',
            fontSize: 13, color: 'var(--bd-coral-text)', fontWeight: 500,
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
          <span style={{ fontSize: 13, color: 'var(--bd-ink-muted)' }}>{t('common.or')}</span>
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
    </Modal>
  )
}
