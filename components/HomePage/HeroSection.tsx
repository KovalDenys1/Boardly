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
      {/* Hero Section - Fixed dimensions to prevent CLS */}
      <div className="text-center mb-16 animate-scale-in" style={{ minHeight: '400px' }}>
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-white/20 backdrop-blur-sm mb-6 animate-bounce-in" style={{ width: '96px', height: '96px' }}>
          <span className="text-6xl" style={{ fontSize: '4rem', lineHeight: '1' }}>🎲</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold text-white mb-6 drop-shadow-lg" style={{ minHeight: 'clamp(3rem, 8vw, 5rem)' }}>
          Boardly
        </h1>
        <p className="text-xl md:text-2xl text-white/90 mb-4 max-w-2xl mx-auto" style={{ minHeight: 'clamp(1.5rem, 4vw, 2rem)' }}>
          {t('home.subtitle')}
        </p>
        {isLoggedIn && displayName && (
          <p className="text-lg text-white/80" style={{ minHeight: '1.5rem' }}>
            {t('home.welcomeBack', { name: displayName })} 👋
          </p>
        )}
      </div>

      {/* CTA Buttons - Fixed height to prevent CLS */}
      <div className="max-w-md mx-auto space-y-4 mb-20 animate-slide-in-up" style={{ minHeight: '200px' }}>
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
    </>
  )
}

