import { useTranslation } from '@/lib/i18n-helpers'
import { useEffect, useState } from 'react'

interface ConnectionStatusProps {
  isConnected: boolean
  isReconnecting: boolean
  reconnectAttempt: number
}

export function ConnectionStatus({
  isConnected,
  isReconnecting,
  reconnectAttempt,
}: ConnectionStatusProps) {
  const { t } = useTranslation()
  const [hasConnectedBefore, setHasConnectedBefore] = useState(false)
  const [showDisconnected, setShowDisconnected] = useState(false)

  useEffect(() => {
    if (isConnected) {
      setHasConnectedBefore(true)
      setShowDisconnected(false)
    }
  }, [isConnected])

  useEffect(() => {
    if (!isConnected && !isReconnecting && hasConnectedBefore) {
      const timer = setTimeout(() => {
        setShowDisconnected(true)
      }, 2000)
      return () => clearTimeout(timer)
    } else {
      setShowDisconnected(false)
    }
  }, [isConnected, isReconnecting, hasConnectedBefore])

  if (isConnected) return null

  if (isReconnecting) {
    const isSlowConnection = reconnectAttempt >= 3

    return (
      <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top">
        <div
          className="rounded-xl px-4 py-3 shadow-lg max-w-sm"
          style={{
            background: '#FFFBEB',
            border: '1.5px solid #FDE68A',
          }}
        >
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <svg
                className="animate-spin h-5 w-5"
                style={{ color: '#D97706' }}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: '#92400E' }}>
                {t('connection.reconnecting', 'Reconnecting...')}
              </p>
              {reconnectAttempt > 0 && (
                <p className="text-xs mt-0.5" style={{ color: '#B45309' }}>
                  {t('connection.attempt', `Attempt ${reconnectAttempt}`)}
                </p>
              )}
              {isSlowConnection && (
                <p className="text-xs mt-1 pt-1" style={{ color: '#B45309', borderTop: '1px solid #FDE68A' }}>
                  ⏳ {t('connection.coldStart', 'Server is waking up... This may take up to a minute.')}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!showDisconnected) return null

  return (
    <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top">
      <div
        className="rounded-xl px-4 py-3 shadow-lg"
        style={{
          background: '#FFF1F0',
          border: '1.5px solid #FFCCC7',
        }}
      >
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5"
              style={{ color: 'var(--bd-coral)' }}
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium" style={{ color: '#7F1D1D' }}>
              {t('connection.disconnected', 'Connection lost')}
            </p>
            <p className="text-xs mt-0.5" style={{ color: '#991B1B' }}>
              {t('connection.checkNetwork', 'Please check your network connection')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
