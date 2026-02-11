'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n-helpers'
import { useGuest } from '@/contexts/GuestContext'
import { showToast } from '@/lib/i18n-toast'

interface HeroSectionProps {
  isLoggedIn: boolean
  userName?: string | null
  userEmail?: string | null
}

export default function HeroSection({ isLoggedIn, userName, userEmail }: HeroSectionProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const { isGuest, guestName, setGuestMode, clearGuestMode } = useGuest()
  const [showGuestForm, setShowGuestForm] = useState(false)
  const [name, setName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
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
      showToast.error('errors.generic')
      setIsLoading(false)
    }
  }

  // If already in guest mode, show guest info
  if (isGuest && guestName) {
    return (
      <div className="flex flex-col items-center justify-center text-center w-full animate-fade-in">
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-white/20 backdrop-blur-sm mb-6">
          <span className="text-6xl">👤</span>
        </div>
        <h1 className="text-4xl md:text-6xl font-extrabold text-white mb-6 drop-shadow-lg">
          {t('guest.welcome', { name: guestName })}
        </h1>
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 w-full mb-6">
          <p className="text-white/90 text-lg mb-1">{t('guest.playingAs')}</p>
          <p className="text-white/70 text-sm">{t('guest.limitedFeatures')}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
          <button
            onClick={() => router.push('/games')}
            className="flex-1 px-8 py-4 bg-white text-blue-600 rounded-xl font-bold text-lg shadow-2xl hover:scale-105 transition-all duration-300"
          >
            {t('home.browseGames')}
          </button>
          <button
            onClick={clearGuestMode}
            className="flex-1 px-6 py-4 bg-red-500/80 backdrop-blur-sm text-white rounded-xl font-medium hover:bg-red-600 transition-all duration-300"
          >
            {t('guest.exit')}
          </button>
        </div>
      </div>
    )
  }

  // Show guest registration form
  if (showGuestForm) {
    return (
      <div className="flex flex-col items-center justify-center text-center w-full animate-scale-fade-in">
        <button
          onClick={() => {
            setShowGuestForm(false)
            setName('')
          }}
          className="absolute top-8 left-8 text-white/80 hover:text-white text-sm flex items-center gap-2 transition-colors"
        >
          <span className="text-2xl">←</span>
          <span>{t('common.back')}</span>
        </button>

        <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-white/20 backdrop-blur-sm mb-6">
          <span className="text-6xl">👤</span>
        </div>

        <h1 className="text-4xl md:text-6xl font-extrabold text-white mb-4 drop-shadow-lg">
          {t('guest.enterName')}
        </h1>

        <p className="text-xl text-white/80 mb-8 max-w-md">
          {t('guest.nameDescription', 'Choose a name to start playing instantly')}
        </p>

        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-8 w-full max-w-md shadow-2xl">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('guest.namePlaceholder')}
            maxLength={20}
            autoFocus
            className="w-full px-6 py-4 bg-white/90 backdrop-blur-sm border-2 border-white/30 rounded-xl text-gray-900 text-lg font-medium placeholder-gray-500 focus:outline-none focus:ring-4 focus:ring-white/50 focus:border-white transition-all mb-4"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim().length >= 2) {
                handleStartGuest()
              }
            }}
          />

          <p className="text-white/60 text-sm mb-6 text-left">
            💡 {t('guest.limitedFeatures')}
          </p>

          <button
            onClick={handleStartGuest}
            disabled={name.trim().length < 2 || isLoading}
            className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-2xl hover:scale-105 hover:shadow-3xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-3"
          >
            <span className="text-2xl">🎮</span>
            <span>{isLoading ? t('common.loading') : t('guest.startPlaying', 'Start Playing')}</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Hero Section - Responsive, no forced minHeight, no mb-16 */}
      <div className="flex flex-col items-center justify-center text-center w-full animate-fade-in">
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
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/20"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-gradient-to-r from-transparent via-blue-600 to-transparent text-white/80">
                    {t('common.or')}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowGuestForm(true)}
                className="w-full bg-white/10 backdrop-blur-sm border-2 border-white/30 text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-white/20 hover:scale-105 transition-all duration-300 flex items-center justify-center gap-3"
              >
                <span className="text-2xl">👤</span>
                <span>{t('guest.playAsGuest')}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}
