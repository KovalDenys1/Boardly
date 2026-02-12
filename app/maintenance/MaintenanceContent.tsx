'use client'

import { useTranslation } from '@/lib/i18n-helpers'
import { useEffect, useState } from 'react'

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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center">
        <div className="text-2xl">🔧</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
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
              href="https://github.com/KovalDenys1/Boardly"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors duration-200 font-medium"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
              {t('maintenance.github')}
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
