import toast from 'react-hot-toast'
import i18n from '@/i18n'

/**
 * Localized toast notifications helper
 * Використовує поточну мову з i18n для показу повідомлень
 */
export const showToast = {
  /**
   * Показати успішне повідомлення
   * @param key - ключ перекладу (наприклад, 'toast.saved')
   * @param fallback - резервний текст якщо ключ не знайдено
   * @param params - параметри для інтерполяції
   */
  success: (key: string, fallback?: string, params?: Record<string, any>) => {
    const message = i18n.t(key, { defaultValue: fallback || key, ...params })
    toast.success(message)
  },

  /**
   * Показати повідомлення про помилку
   * @param key - ключ перекладу (наприклад, 'errors.network')
   * @param fallback - резервний текст якщо ключ не знайдено
   * @param params - параметри для інтерполяції
   */
  error: (key: string, fallback?: string, params?: Record<string, any>) => {
    const message = i18n.t(key, { defaultValue: fallback || key, ...params })
    toast.error(message)
  },

  /**
   * Показати інформаційне повідомлення
   * @param key - ключ перекладу (наприклад, 'toast.copied')
   * @param fallback - резервний текст якщо ключ не знайдено
   * @param params - параметри для інтерполяції
   */
  info: (key: string, fallback?: string, params?: Record<string, any>) => {
    const message = i18n.t(key, { defaultValue: fallback || key, ...params })
    toast(message)
  },

  /**
   * Показати повідомлення з кастомною іконкою
   * @param key - ключ перекладу
   * @param icon - emoji або компонент іконки
   * @param fallback - резервний текст якщо ключ не знайдено
   * @param params - параметри для інтерполяції
   */
  custom: (key: string, icon: string, fallback?: string, params?: Record<string, any>) => {
    const message = i18n.t(key, { defaultValue: fallback || key, ...params })
    toast(message, { icon })
  },

  /**
   * Показати toast з promise (loading → success/error)
   * @param promise - Promise для відстеження
   * @param messages - об'єкт з ключами loading, success, error
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
 * Старий метод для зворотної сумісності
 * @deprecated Використовуйте showToast замість toast напряму
 */
export default showToast
