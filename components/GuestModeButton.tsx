'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useGuest } from '@/contexts/GuestContext'
import { useTranslation } from 'react-i18next'
import { showToast } from '@/lib/i18n-toast'

export default function GuestModeButton() {
    const { data: session } = useSession()
    const { isGuest, guestName, setGuestMode, clearGuestMode } = useGuest()
    const [showNameInput, setShowNameInput] = useState(false)
    const [name, setName] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const router = useRouter()
    const { t } = useTranslation()

    // Don't show button if user is authenticated
    if (session?.user) {
        return null
    }

    // If already in guest mode, show guest info
    if (isGuest && guestName) {
        return (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-yellow-800">
                            {t('guest.playingAs')}: {guestName}
                        </p>
                        <p className="text-xs text-yellow-600 mt-1">
                            {t('guest.limitedFeatures')}
                        </p>
                    </div>
                    <button
                        onClick={clearGuestMode}
                        className="text-sm text-yellow-700 hover:text-yellow-900 font-medium"
                    >
                        {t('guest.exit')}
                    </button>
                </div>
            </div>
        )
    }

    // Show name input if user clicked "Play as Guest"
    if (showNameInput) {
        return (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-900 mb-2">
                    {t('guest.enterName')}
                </h3>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('guest.namePlaceholder')}
                    maxLength={20}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && name.trim().length >= 2) {
                            handleStartGuest()
                        }
                    }}
                />
                <div className="flex gap-2">
                    <button
                        onClick={handleStartGuest}
                        disabled={name.trim().length < 2 || isLoading}
                        className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium"
                    >
                        {isLoading ? t('common.loading') : t('guest.continue')}
                    </button>
                    <button
                        onClick={() => {
                            setShowNameInput(false)
                            setName('')
                        }}
                        disabled={isLoading}
                        className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900"
                    >
                        {t('common.cancel')}
                    </button>
                </div>
            </div>
        )
    }

    async function handleStartGuest() {
        if (name.trim().length < 2) {
            showToast.error('guest.nameTooShort')
            return
        }

        setIsLoading(true)
        try {
            await setGuestMode(name.trim())
            showToast.success('guest.welcome', undefined, { name: name.trim() })

            // Redirect to games page immediately
            router.push('/games')
        } catch (error) {
            showToast.error('errors.generic')
        } finally {
            setIsLoading(false)
        }
    }

    // Show "Play as Guest" button
    return (
        <button
            onClick={() => setShowNameInput(true)}
            className="w-full bg-gray-100 text-gray-700 px-6 py-3 rounded-md hover:bg-gray-200 transition-colors font-medium"
        >
            {t('guest.playAsGuest')}
        </button>
    )
}
