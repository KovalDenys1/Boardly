import toast, { ToastOptions } from 'react-hot-toast'
import i18n from '@/i18n'

type ToastKind = 'success' | 'error' | 'info' | 'loading'

const DEFAULT_MESSAGE_KEY: Record<ToastKind, string> = {
  success: 'toast.success',
  error: 'errors.generic',
  info: 'toast.info',
  loading: 'common.loading',
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function resolveTranslationKey(value: unknown): string | null {
  if (!isNonEmptyString(value)) return null
  const trimmed = value.trim()
  return i18n.exists(trimmed) ? trimmed : null
}

function sanitizeErrorDetail(value: unknown): string | null {
  if (!isNonEmptyString(value)) return null
  const normalized = value.replace(/^error:\s*/i, '').trim()
  if (!normalized) return null
  if (/^(failed to fetch|load failed|networkerror|network request failed)$/i.test(normalized)) {
    return i18n.t('errors.network', { defaultValue: 'Network error. Please check your connection.' })
  }
  if (normalized.length > 220) {
    return `${normalized.slice(0, 217)}...`
  }
  return normalized
}

function resolveMessage(
  kind: ToastKind,
  key: string,
  fallback?: string,
  params?: Record<string, any>
): string {
  const keyTranslationKey = resolveTranslationKey(key)
  const fallbackTranslationKey = resolveTranslationKey(fallback)
  const hasLiteralFallback = isNonEmptyString(fallback) && !fallbackTranslationKey

  // For generic success/info wrappers, show provided literal message if present.
  if (hasLiteralFallback && (key === 'toast.success' || key === 'toast.info')) {
    return fallback!.trim()
  }

  if (keyTranslationKey) {
    return i18n.t(keyTranslationKey, { defaultValue: keyTranslationKey, ...params })
  }

  if (fallbackTranslationKey) {
    return i18n.t(fallbackTranslationKey, { defaultValue: fallbackTranslationKey, ...params })
  }

  if (hasLiteralFallback) {
    return fallback!.trim()
  }

  // Non-key plain text can be shown as-is (e.g. server-provided message).
  if (isNonEmptyString(key) && !key.includes('.')) {
    return key
  }

  const defaultKey = DEFAULT_MESSAGE_KEY[kind]
  if (i18n.exists(defaultKey)) {
    return i18n.t(defaultKey, { defaultValue: defaultKey, ...params })
  }

  return kind === 'error' ? 'Something went wrong' : 'Action completed'
}

function enrichErrorMessage(
  baseMessage: string,
  fallback?: string,
  params?: Record<string, any>
): string {
  const paramsMessage = sanitizeErrorDetail(params?.message)
  const fallbackMessage =
    isNonEmptyString(fallback) && !resolveTranslationKey(fallback)
      ? sanitizeErrorDetail(fallback)
      : null

  const detail = paramsMessage || fallbackMessage
  if (!detail) {
    return baseMessage
  }

  if (baseMessage.toLowerCase().includes(detail.toLowerCase())) {
    return baseMessage
  }

  return `${baseMessage}: ${detail}`
}

function extractErrorMessage(error: unknown): string | null {
  if (error instanceof Error) {
    return sanitizeErrorDetail(error.message)
  }
  if (typeof error === 'string') {
    return sanitizeErrorDetail(error)
  }
  if (error && typeof error === 'object') {
    const maybeMessage = (error as { message?: unknown }).message
    if (typeof maybeMessage === 'string') {
      return sanitizeErrorDetail(maybeMessage)
    }
  }
  return null
}

/**
 * Localized toast notifications helper
 * Uses current language from i18n for displaying messages
 */
export const showToast = {
  /**
   * Show success message
   * @param key - translation key (e.g., 'toast.saved')
   * @param fallback - fallback text if key not found
   * @param params - parameters for interpolation
   * @param opts - react-hot-toast options (id, duration, position, etc.)
   */
  success: (key: string, fallback?: string, params?: Record<string, any>, opts?: ToastOptions) => {
    const message = resolveMessage('success', key, fallback, params)
    toast.success(message, opts)
  },

  /**
   * Show error message
   * @param key - translation key (e.g., 'errors.network')
   * @param fallback - fallback text if key not found
   * @param params - parameters for interpolation
   * @param opts - react-hot-toast options (id, duration, position, etc.)
   */
  error: (key: string, fallback?: string, params?: Record<string, any>, opts?: ToastOptions) => {
    const message = resolveMessage('error', key, fallback, params)
    const enriched = enrichErrorMessage(message, fallback, params)
    toast.error(enriched, opts)
  },

  /**
   * Show error message from an unknown error object
   * @param error - unknown error from catch block
   * @param key - translation key for base message
   * @param opts - react-hot-toast options
   */
  errorFrom: (error: unknown, key: string = 'errors.generic', opts?: ToastOptions) => {
    const message = extractErrorMessage(error)
    if (message) {
      showToast.error(key, undefined, { message }, opts)
      return
    }
    showToast.error(key, undefined, undefined, opts)
  },

  /**
   * Show plain success text without translation key lookup
   */
  successText: (message: string, opts?: ToastOptions) => {
    toast.success(message, opts)
  },

  /**
   * Show plain info text without translation key lookup
   */
  infoText: (message: string, opts?: ToastOptions) => {
    toast(message, opts)
  },

  /**
   * Show plain error text without translation key lookup
   */
  errorText: (message: string, opts?: ToastOptions) => {
    toast.error(message, opts)
  },

  /**
   * Show info message
   * @param key - translation key (e.g., 'toast.copied')
   * @param fallback - fallback text if key not found
   * @param params - parameters for interpolation
   * @param opts - react-hot-toast options (id, duration, position, etc.)
   */
  info: (key: string, fallback?: string, params?: Record<string, any>, opts?: ToastOptions) => {
    const message = resolveMessage('info', key, fallback, params)
    toast(message, opts)
  },

  /**
   * Show loading message
   * @param key - translation key
   * @param fallback - fallback text if key not found
   * @param params - parameters for interpolation
   * @param opts - react-hot-toast options (id, duration, etc.)
   * @returns toast id for later dismissal
   */
  loading: (key: string, fallback?: string, params?: Record<string, any>, opts?: ToastOptions) => {
    const message = resolveMessage('loading', key, fallback, params)
    return toast.loading(message, opts)
  },

  /**
   * Dismiss a toast by id
   * @param toastId - the id of the toast to dismiss
   */
  dismiss: (toastId?: string) => {
    toast.dismiss(toastId)
  },

  /**
   * Show message with custom icon
   * @param key - translation key
   * @param icon - emoji or icon component
   * @param fallback - fallback text if key not found
   * @param params - parameters for interpolation
   * @param opts - react-hot-toast options
   */
  custom: (key: string, icon: string, fallback?: string, params?: Record<string, any>, opts?: ToastOptions) => {
    const message = resolveMessage('info', key, fallback, params)
    toast(message, { icon, ...opts })
  },

  /**
   * Show toast with promise (loading → success/error)
   * @param promise - Promise to track
   * @param messages - object with loading, success, error keys
   */
  promise: <T,>(
    promise: Promise<T>,
    messages: {
      loading: string
      success: string
      error: string
    }
  ): Promise<T> => {
    return toast.promise(promise, {
      loading: i18n.t(messages.loading),
      success: i18n.t(messages.success),
      error: i18n.t(messages.error),
    })
  },
}

/**
 * Legacy method for backward compatibility
 * @deprecated Use showToast instead of toast directly
 */
export default showToast
