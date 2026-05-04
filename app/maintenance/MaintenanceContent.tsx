'use client'

import { useTranslation } from '@/lib/i18n-helpers'
import { useEffect, useState } from 'react'

const HEADER_HEIGHT_PX = 64
const MAINTENANCE_CONTACT_EMAIL = 'kovaldenys@icloud.com'
const MAINTENANCE_VIEWPORT_STYLE = { minHeight: `calc(100vh - ${HEADER_HEIGHT_PX}px)` }

export default function MaintenanceContent() {
  const { t, i18n } = useTranslation()
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (i18n.isInitialized) {
      setIsReady(true)
    } else {
      i18n.on('initialized', () => setIsReady(true))
    }
  }, [i18n])

  if (!isReady) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ ...MAINTENANCE_VIEWPORT_STYLE, background: 'var(--bd-bg)' }}
      >
        <div className="text-2xl">🔧</div>
      </div>
    )
  }

  return (
    <div
      className="flex items-center justify-center p-4"
      style={{ ...MAINTENANCE_VIEWPORT_STYLE, background: 'var(--bd-bg)' }}
    >
      <div
        className="max-w-2xl w-full rounded-2xl shadow-xl p-8 md:p-12 text-center"
        style={{ background: 'var(--bd-card-warm)', border: '1.5px solid var(--bd-line)' }}
      >
        {/* Logo mark */}
        <div className="mb-6 flex justify-center">
          <div
            className="w-24 h-24 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--bd-ink)', boxShadow: '5px 5px 0 var(--bd-coral)' }}
          >
            <span style={{ fontSize: 56, fontWeight: 900, color: 'var(--bd-sun)', lineHeight: 1 }}>B</span>
          </div>
        </div>

        {/* Heading */}
        <h1 className="text-4xl md:text-5xl font-bold mb-4" style={{ color: 'var(--bd-ink)' }}>
          {t('maintenance.heading')}
        </h1>

        {/* Message */}
        <p className="text-lg mb-6 leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
          {t('maintenance.message')}
        </p>

        {/* Estimate */}
        <div
          className="p-4 mb-8 rounded-xl"
          style={{
            background: 'var(--bd-bg2)',
            borderLeft: '4px solid var(--bd-sun)',
            border: '1.5px solid var(--bd-line)',
          }}
        >
          <p className="font-semibold" style={{ color: 'var(--bd-ink)' }}>
            ⏱️ {t('maintenance.estimate')}
          </p>
        </div>

        {/* Contact */}
        <div className="space-y-4">
          <p className="font-medium" style={{ color: 'var(--bd-ink)' }}>
            {t('maintenance.contact')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a
              href={`mailto:${MAINTENANCE_CONTACT_EMAIL}`}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-opacity hover:opacity-80"
              style={{
                background: 'var(--bd-ink)',
                color: 'white',
                boxShadow: '0 4px 0 var(--bd-coral)',
              }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7l7.89 5.26a2 2 0 002.22 0L21 7m-16 10h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span>{MAINTENANCE_CONTACT_EMAIL}</span>
            </a>
          </div>
        </div>

        {/* Apology */}
        <p className="mt-8 text-sm" style={{ color: 'var(--bd-ink-muted)' }}>
          {t('maintenance.apology')}
        </p>

        {/* Boardly branding */}
        <div className="mt-8 pt-6" style={{ borderTop: '1.5px solid var(--bd-line)' }}>
          <p className="text-2xl font-bold" style={{ color: 'var(--bd-ink)' }}>
            boardly
          </p>
        </div>
      </div>
    </div>
  )
}
