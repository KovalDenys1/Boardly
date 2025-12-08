'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { clientLogger } from '@/lib/client-logger'

interface UsernameInputProps {
  value: string
  onChange: (value: string) => void
  error?: string
  disabled?: boolean
  required?: boolean
  onAvailabilityChange?: (available: boolean) => void
  currentUsername?: string // Skip check if username matches current
}

type CheckStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

interface UsernameCheckResult {
  available: boolean
  username: string
  suggestions?: string[]
  error?: string
}

export default function UsernameInput({
  value,
  onChange,
  error,
  disabled = false,
  required = false,
  onAvailabilityChange,
  currentUsername,
}: UsernameInputProps) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<CheckStatus>('idle')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [validationError, setValidationError] = useState<string>('')

  // Debounced username check
  useEffect(() => {
    // If username matches current username, it's valid
    if (currentUsername && value === currentUsername) {
      setStatus('available')
      setSuggestions([])
      setValidationError('')
      onAvailabilityChange?.(true)
      return
    }

    // Don't check if empty or less than 3 characters
    if (!value || value.length < 3) {
      setStatus('idle')
      setSuggestions([])
      setValidationError('')
      onAvailabilityChange?.(false)
      return
    }

    // Basic validation
    if (value.length > 20) {
      setStatus('invalid')
      setValidationError(t('auth.username.tooLong', 'Username must be at most 20 characters'))
      onAvailabilityChange?.(false)
      return
    }

    if (!/^[a-zA-Z0-9_]+$/.test(value)) {
      setStatus('invalid')
      setValidationError(t('auth.username.invalidChars', 'Username can only contain letters, numbers, and underscores'))
      onAvailabilityChange?.(false)
      return
    }

    setValidationError('')
    setStatus('checking')

    // Debounce the API call
    const timeoutId = setTimeout(() => {
      checkUsername(value)
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [value, t, onAvailabilityChange])

  const checkUsername = async (username: string) => {
    try {
      const response = await fetch(`/api/user/check-username?username=${encodeURIComponent(username)}`)
      const data: UsernameCheckResult = await response.json()

      if (response.ok) {
        if (data.error) {
          setStatus('invalid')
          setValidationError(data.error)
          setSuggestions([])
          onAvailabilityChange?.(false)
        } else if (data.available) {
          setStatus('available')
          setSuggestions([])
          onAvailabilityChange?.(true)
        } else {
          setStatus('taken')
          setSuggestions(data.suggestions || [])
          onAvailabilityChange?.(false)
        }
      } else {
        setStatus('idle')
        clientLogger.error('Username check failed:', data)
      }
    } catch (error) {
      clientLogger.error('Username check error:', error)
      setStatus('idle')
    }
  }

  const handleSuggestionClick = (suggestion: string) => {
    onChange(suggestion)
    setSuggestions([])
  }

  return (
    <div>
      <label className="label">{t('auth.register.username')}</label>
      <div className="relative">
        <input
          type="text"
          required={required}
          disabled={disabled}
          className={`input pr-10 ${
            status === 'available' ? 'border-green-500 dark:border-green-500' :
            status === 'taken' || status === 'invalid' ? 'border-red-500 dark:border-red-500' :
            ''
          }`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('auth.register.usernamePlaceholder')}
          autoComplete="username"
          minLength={3}
          maxLength={20}
        />
        
        {/* Status Icon */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {status === 'checking' && (
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          )}
          {status === 'available' && (
            <svg className="w-5 h-5 text-green-500 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          )}
          {(status === 'taken' || status === 'invalid') && (
            <svg className="w-5 h-5 text-red-500 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          )}
        </div>
      </div>

      {/* Status Messages */}
      <div className="mt-1 min-h-[20px]">
        {status === 'checking' && (
          <p className="text-xs text-blue-600 dark:text-blue-400">
            {t('auth.username.checking', 'Checking availability...')}
          </p>
        )}
        {status === 'available' && (
          <p className="text-xs text-green-600 dark:text-green-400 font-medium">
            ✓ {t('auth.username.available', 'Username is available!')}
          </p>
        )}
        {status === 'taken' && (
          <p className="text-xs text-red-600 dark:text-red-400">
            ✗ {t('auth.username.taken', 'Username is already taken')}
          </p>
        )}
        {status === 'invalid' && validationError && (
          <p className="text-xs text-red-600 dark:text-red-400">
            ✗ {validationError}
          </p>
        )}
        {!status || status === 'idle' ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('auth.register.usernameHint')}
          </p>
        ) : null}
      </div>

      {/* Suggestions */}
      {status === 'taken' && suggestions.length > 0 && (
        <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-2">
            {t('auth.username.suggestions', 'Try these available usernames')}:
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => handleSuggestionClick(suggestion)}
                className="px-3 py-1 text-xs font-medium bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  )
}
