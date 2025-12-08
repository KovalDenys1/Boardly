'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signOut } from 'next-auth/react'
import LoadingSpinner from '@/components/LoadingSpinner'
import { useTranslation } from 'react-i18next'
import { showToast } from '@/lib/i18n-toast'

export default function DeleteAccountPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [confirmInput, setConfirmInput] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!token) {
      setError('errors.invalidToken')
      setLoading(false)
    } else {
      setLoading(false)
    }
  }, [token])

  const handleDelete = async () => {
    if (confirmInput !== 'DELETE') {
      showToast.error('errors.confirmDelete')
      return
    }

    if (!token) {
      showToast.error('errors.invalidToken')
      return
    }

    setDeleting(true)
    try {
      const response = await fetch('/api/user/delete-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token })
      })

      const data = await response.json()

      if (!response.ok) {
        if (response.status === 400 && data.error.includes('expired')) {
          setError('errors.tokenExpired')
        } else {
          setError(data.error || 'errors.generic')
        }
        return
      }

      setSuccess(true)
      showToast.success('toast.accountDeleted')
      
      // Sign out and redirect to home after 2 seconds
      setTimeout(async () => {
        await signOut({ redirect: false })
        router.push('/')
      }, 2000)

    } catch (error) {
      console.error('Error deleting account:', error)
      setError('errors.network')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-purple-800 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-purple-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8">
        {error ? (
          <>
            <div className="text-center mb-6">
              <div className="text-6xl mb-4">❌</div>
              <h1 className="text-2xl font-bold text-gray-800 mb-2">
                {t('deleteAccount.error')}
              </h1>
              <p className="text-gray-600">{t(error)}</p>
            </div>
            <button
              onClick={() => router.push('/')}
              className="w-full bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 transition-colors"
            >
              {t('common.goHome')}
            </button>
          </>
        ) : success ? (
          <>
            <div className="text-center mb-6">
              <div className="text-6xl mb-4">✅</div>
              <h1 className="text-2xl font-bold text-gray-800 mb-2">
                {t('deleteAccount.success')}
              </h1>
              <p className="text-gray-600">{t('deleteAccount.successMessage')}</p>
            </div>
            <LoadingSpinner size="md" />
          </>
        ) : (
          <>
            <div className="text-center mb-6">
              <div className="text-6xl mb-4">⚠️</div>
              <h1 className="text-2xl font-bold text-red-600 mb-2">
                {t('deleteAccount.title')}
              </h1>
              <p className="text-gray-700 mb-4">
                {t('deleteAccount.confirmation')}
              </p>
            </div>

            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-6">
              <h2 className="font-bold text-red-800 mb-2">
                {t('deleteAccount.willBeDeleted')}
              </h2>
              <ul className="text-sm text-red-700 space-y-1">
                <li>• {t('deleteAccount.profileData')}</li>
                <li>• {t('deleteAccount.gameHistory')}</li>
                <li>• {t('deleteAccount.friends')}</li>
                <li>• {t('deleteAccount.achievements')}</li>
              </ul>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('deleteAccount.typeDelete')}
              </label>
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="DELETE"
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-center font-mono text-lg"
                disabled={deleting}
              />
            </div>

            <div className="space-y-3">
              <button
                onClick={handleDelete}
                disabled={confirmInput !== 'DELETE' || deleting}
                className="w-full bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {deleting ? (
                  <>
                    <LoadingSpinner size="sm" />
                    <span className="ml-2">{t('common.deleting')}</span>
                  </>
                ) : (
                  t('deleteAccount.confirmDelete')
                )}
              </button>
              <button
                onClick={() => router.push('/profile')}
                disabled={deleting}
                className="w-full bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
