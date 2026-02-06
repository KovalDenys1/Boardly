import toast, { ToastOptions } from 'react-hot-toast'
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
   * @param opts - react-hot-toast options (id, duration, position, etc.)
   */
  success: (key: string, fallback?: string, params?: Record<string, any>, opts?: ToastOptions) => {
    const message = i18n.t(key, { defaultValue: fallback || key, ...params })
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
    const message = i18n.t(key, { defaultValue: fallback || key, ...params })
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
    const message = i18n.t(key, { defaultValue: fallback || key, ...params })
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
    const message = i18n.t(key, { defaultValue: fallback || key, ...params })
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
    const message = i18n.t(key, { defaultValue: fallback || key, ...params })
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
