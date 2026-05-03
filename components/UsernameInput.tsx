'use client'

import { useState, useEffect, useCallback, useId } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { clientLogger } from '@/lib/client-logger'
import HelpTooltip from '@/components/ui/help-tooltip'

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

export function isCurrentUsernameValue(value: string, currentUsername?: string): boolean {
  return Boolean(currentUsername && value === currentUsername)
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
  const inputId = useId()
  const [status, setStatus] = useState<CheckStatus>('idle')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [validationError, setValidationError] = useState<string>('')

  const checkUsername = useCallback(async (username: string) => {
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
  }, [onAvailabilityChange])

  // Debounced username check
  useEffect(() => {
    // Current username is valid, but should stay visually neutral until edited.
    if (isCurrentUsernameValue(value, currentUsername)) {
      setStatus((prev) => (prev === 'idle' ? prev : 'idle'))
      setSuggestions((prev) => (prev.length === 0 ? prev : []))
      setValidationError((prev) => (prev ? '' : prev))
      onAvailabilityChange?.(true)
      return
    }

    // Don't check if empty or less than 3 characters
    if (!value || value.length < 3) {
      setStatus((prev) => (prev === 'idle' ? prev : 'idle'))
      setSuggestions((prev) => (prev.length === 0 ? prev : []))
      setValidationError((prev) => (prev ? '' : prev))
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
  }, [value, currentUsername, checkUsername, t, onAvailabilityChange])

  const handleSuggestionClick = (suggestion: string) => {
    onChange(suggestion)
    setSuggestions([])
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label htmlFor={inputId} className="!mb-0 text-sm font-semibold text-bd-ink dark:text-slate-200">
          {t('auth.register.username')}
        </label>
        <HelpTooltip
          label={t('auth.register.username')}
          content={<p>{t('auth.register.usernameHint')}</p>}
        />
      </div>
      <div className="relative">
        <input
          id={inputId}
          type="text"
          required={required}
          disabled={disabled}
          className={`w-full rounded-2xl border bg-white px-4 py-3 pr-10 text-base text-bd-ink shadow-sm outline-none transition-all placeholder:text-bd-ink-muted dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 sm:text-sm ${
            status === 'available'
              ? 'border-emerald-400 focus:ring-2 focus:ring-emerald-500/20 dark:border-emerald-500'
              : status === 'taken' || status === 'invalid'
                ? 'border-red-400 focus:ring-2 focus:ring-red-500/20 dark:border-red-500'
                : 'border-bd-line focus:border-bd-lav-deep focus:ring-4 focus:ring-bd-lav/20 dark:border-slate-700'
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
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-bd-lav border-t-transparent" />
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
      <div className="mt-1">
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
      </div>

      {/* Suggestions */}
      {status === 'taken' && suggestions.length > 0 && (
        <div className="mt-2 rounded-2xl border border-bd-line bg-bd-card-warm/90 p-3 dark:border-slate-700 dark:bg-slate-800/70">
          <p className="mb-2 text-xs font-semibold text-bd-lav-deep dark:text-bd-lav">
            {t('auth.username.suggestions', 'Try these available usernames')}:
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => handleSuggestionClick(suggestion)}
                className="rounded-xl border border-bd-line bg-white px-3 py-1 text-xs font-medium text-bd-lav-deep transition-colors hover:bg-bd-bg2 dark:border-slate-700 dark:bg-slate-900 dark:text-bd-lav dark:hover:bg-slate-800"
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
