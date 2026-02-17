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
    // Wait for i18n to be ready
    if (i18n.isInitialized) {
      setIsReady(true)
    } else {
      i18n.on('initialized', () => setIsReady(true))
    }
  }, [i18n])

  // Show loading state while i18n initializes
  if (!isReady) {
    return (
      <div
        className="bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center"
        style={MAINTENANCE_VIEWPORT_STYLE}
      >
        <div className="text-2xl">🔧</div>
      </div>
    )
  }

  return (
    <div
      className="bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center p-4"
      style={MAINTENANCE_VIEWPORT_STYLE}
    >
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-2xl p-8 md:p-12 text-center">
        {/* Icon */}
        <div className="mb-6">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full mb-4">
            <span className="text-5xl">🔧</span>
          </div>
        </div>

        {/* Heading */}
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
          {t('maintenance.heading')}
        </h1>

        {/* Message */}
        <p className="text-lg text-gray-600 mb-6 leading-relaxed">
          {t('maintenance.message')}
        </p>

        {/* Estimate */}
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-8 rounded">
          <p className="text-blue-700 font-semibold">
            ⏱️ {t('maintenance.estimate')}
          </p>
        </div>

        {/* Contact */}
        <div className="space-y-4">
          <p className="text-gray-700 font-medium">
            {t('maintenance.contact')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a
              href={`mailto:${MAINTENANCE_CONTACT_EMAIL}`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 font-medium"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7l7.89 5.26a2 2 0 002.22 0L21 7m-16 10h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span>{t('maintenance.github')}: {MAINTENANCE_CONTACT_EMAIL}</span>
            </a>
          </div>
        </div>

        {/* Apology */}
        <p className="text-gray-500 mt-8 text-sm">
          {t('maintenance.apology')}
        </p>

        {/* Boardly branding */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            🎲 Boardly
          </p>
        </div>
      </div>
    </div>
  )
}
