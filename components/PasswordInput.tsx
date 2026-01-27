'use client'

import { useState, useMemo } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'

interface PasswordInputProps {
  value: string
  onChange: (value: string) => void
  label?: string
  placeholder?: string
  error?: string
  showStrength?: boolean
  required?: boolean
  autoComplete?: string
}

interface PasswordStrength {
  score: number // 0-4
  label: string
  color: string
  percentage: number
}

export default function PasswordInput({
  value,
  onChange,
  label = 'Password',
  placeholder = '••••••••',
  error,
  showStrength = false,
  required = false,
  autoComplete = 'current-password',
}: PasswordInputProps) {
  const { t } = useTranslation()
  const [showPassword, setShowPassword] = useState(false)

  // Calculate password strength
  const strength = useMemo((): PasswordStrength => {
    if (!value) {
      return { score: 0, label: '', color: 'bg-gray-300', percentage: 0 }
    }

    let score = 0
    
    // Length check
    if (value.length >= 8) score++
    if (value.length >= 12) score++
    
    // Character variety checks
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++ // Mixed case
    if (/\d/.test(value)) score++ // Numbers

    // Cap at 3 (removed special character requirement)
    score = Math.min(score, 3)

    const strengthLevels = [
      { key: 'weak', label: t('auth.password.weak', 'Weak'), color: 'bg-red-500' },
      { key: 'fair', label: t('auth.password.fair', 'Fair'), color: 'bg-yellow-500' },
      { key: 'good', label: t('auth.password.good', 'Good'), color: 'bg-blue-500' },
      { key: 'strong', label: t('auth.password.strong', 'Strong'), color: 'bg-green-500' },
    ]

    return {
      score,
      label: strengthLevels[score].label,
      color: strengthLevels[score].color,
      percentage: (score / 3) * 100,
    }
  }, [value, t])

  return (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        <input
          type={showPassword ? 'text' : 'password'}
          required={required}
          className="input pr-10"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          aria-label={showPassword ? 'Hide password' : 'Show password'}
        >
          {showPassword ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          )}
        </button>
      </div>

      {/* Password Strength Meter */}
      {showStrength && value && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
              {t('auth.password.strength', 'Password strength')}:
            </span>
            <span className={`text-xs font-bold ${
              strength.score === 0 ? 'text-red-600 dark:text-red-400' :
              strength.score === 1 ? 'text-yellow-600 dark:text-yellow-400' :
              strength.score === 2 ? 'text-blue-600 dark:text-blue-400' :
              'text-green-600 dark:text-green-400'
            }`}>
              {strength.label}
            </span>
          </div>
          
          {/* Progress bar */}
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden shadow-inner">
            <div
              className={`h-full ${strength.color} transition-all duration-500 ease-out shadow-sm`}
              style={{ width: `${strength.percentage}%` }}
            />
          </div>
          
          {/* Password Requirements */}
          <div className="mt-3 space-y-1.5 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
              {t('auth.password.requirements', 'Password requirements')}:
            </p>
            <PasswordRequirement
              met={value.length >= 8}
              text={t('auth.password.requirement.length', 'At least 8 characters')}
            />
            <PasswordRequirement
              met={/[a-z]/.test(value) && /[A-Z]/.test(value)}
              text={t('auth.password.requirement.case', 'Upper & lowercase letters')}
            />
            <PasswordRequirement
              met={/\d/.test(value)}
              text={t('auth.password.requirement.number', 'At least one number')}
            />
          </div>
        </div>
      )}

      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
    </div>
  )
}

function PasswordRequirement({ met, text }: { met: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {met ? (
        <svg className="w-4 h-4 text-green-500 dark:text-green-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
      )}
      <span className={met ? 'text-gray-700 dark:text-gray-300 font-medium' : 'text-gray-500 dark:text-gray-400'}>
        {text}
      </span>
    </div>
  )
}
