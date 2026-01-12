import toast from 'react-hot-toast'
import i18n from '@/i18n'

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
   */
  success: (key: string, fallback?: string, params?: Record<string, any>) => {
    const message = i18n.t(key, { defaultValue: fallback || key, ...params })
    toast.success(message)
  },

  /**
   * Show error message
   * @param key - translation key (e.g., 'errors.network')
   * @param fallback - fallback text if key not found
   * @param params - parameters for interpolation
   */
  error: (key: string, fallback?: string, params?: Record<string, any>) => {
    const message = i18n.t(key, { defaultValue: fallback || key, ...params })
    toast.error(message)
  },

  /**
   * Show info message
   * @param key - translation key (e.g., 'toast.copied')
   * @param fallback - fallback text if key not found
   * @param params - parameters for interpolation
   */
  info: (key: string, fallback?: string, params?: Record<string, any>) => {
    const message = i18n.t(key, { defaultValue: fallback || key, ...params })
    toast(message)
  },

  /**
   * Show message with custom icon
   * @param key - translation key
   * @param icon - emoji or icon component
   * @param fallback - fallback text if key not found
   * @param params - parameters for interpolation
   */
  custom: (key: string, icon: string, fallback?: string, params?: Record<string, any>) => {
    const message = i18n.t(key, { defaultValue: fallback || key, ...params })
    toast(message, { icon })
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
