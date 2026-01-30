'use client'

import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n-helpers'

interface HeroSectionProps {
  isLoggedIn: boolean
  userName?: string | null
  userEmail?: string | null
}

export default function HeroSection({ isLoggedIn, userName, userEmail }: HeroSectionProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const displayName = userName || userEmail?.split('@')[0]

  return (
    <>
      {/* Hero Section - Responsive, no forced minHeight, no mb-16 */}
      <div className="flex flex-col items-center justify-center text-center w-full">
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-white/20 backdrop-blur-sm mb-6">
          <span className="text-6xl" style={{ fontSize: '4rem', lineHeight: '1' }}>🎲</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold text-white mb-6 drop-shadow-lg break-words">
          Boardly
        </h1>
        <p className="text-xl md:text-2xl text-white/90 mb-4 max-w-2xl mx-auto break-words leading-relaxed px-4">
          {t('home.subtitle')}
        </p>
        {isLoggedIn && displayName && (
          <p className="text-lg text-white/80">
            {t('home.welcomeBack', { name: displayName })} 👋
          </p>
        )}
        {/* CTA Buttons - always visible, no mb-20, no minHeight */}
        <div className="w-full max-w-md mx-auto space-y-4 mt-8">
          {isLoggedIn ? (
            <button
            onClick={() => router.push('/games')}
            className="w-full px-8 py-4 bg-white text-blue-600 rounded-xl font-bold text-lg shadow-2xl hover:scale-105 hover:shadow-3xl transition-all duration-300 flex items-center justify-center gap-3"
          >
              <span className="text-2xl">🎮</span>
              <span>{t('home.browseGames')}</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => router.push('/auth/login')}
                className="w-full px-8 py-4 bg-white text-blue-600 rounded-xl font-bold text-lg shadow-2xl hover:scale-105 hover:shadow-3xl transition-all duration-300 flex items-center justify-center gap-3"
              >
                <span className="text-2xl">🔐</span>
                <span>{t('header.login')}</span>
              </button>
              <button
                onClick={() => router.push('/auth/register')}
                className="w-full px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold text-lg shadow-2xl hover:scale-105 hover:shadow-3xl transition-all duration-300 flex items-center justify-center gap-3"
              >
                <span className="text-2xl">🎯</span>
                <span>{t('home.signUpFree', 'Sign Up Free')}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}

