import { useTranslation } from 'react-i18next'

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

  if (isConnected) {
    return null // Don't show anything when connected
  }

  if (isReconnecting) {
    return (
      <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top">
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg px-4 py-3 shadow-lg">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <svg
                className="animate-spin h-5 w-5 text-yellow-600 dark:text-yellow-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                {t('connection.reconnecting', 'Reconnecting...')}
              </p>
              {reconnectAttempt > 0 && (
                <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-0.5">
                  {t('connection.attempt', `Attempt ${reconnectAttempt}`)}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Disconnected (not trying to reconnect)
  return (
    <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top">
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-red-600 dark:text-red-400"
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
            <p className="text-sm font-medium text-red-800 dark:text-red-200">
              {t('connection.disconnected', 'Connection lost')}
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
              {t('connection.checkNetwork', 'Please check your network connection')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
