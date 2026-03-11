'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n-helpers'
import {
  buildNotificationDisplayItem,
  type InAppNotificationItem,
  type InAppNotificationResponse,
} from '@/lib/notification-ui'

export function NotificationsMenu() {
  const router = useRouter()
  const pathname = usePathname()
  const { t, i18n } = useTranslation()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [notifications, setNotifications] = useState<InAppNotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  const fetchNotifications = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true)
    }

    try {
      const response = await fetch('/api/notifications?limit=20', {
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error('Failed to load notifications')
      }

      const data = (await response.json()) as InAppNotificationResponse
      setNotifications(data.notifications || [])
      setUnreadCount(data.unreadCount || 0)
    } catch {
      if (!silent) {
        setNotifications([])
        setUnreadCount(0)
      }
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void fetchNotifications(true)

    const intervalId = window.setInterval(() => {
      void fetchNotifications(true)
    }, 60_000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [fetchNotifications])

  useEffect(() => {
    if (!open) {
      return
    }

    void fetchNotifications()
  }, [fetchNotifications, open])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [open])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void fetchNotifications(true)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchNotifications])

  const markNotificationsRead = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      return
    }

    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids }),
    })

    const now = new Date().toISOString()
    setNotifications((previousValue) =>
      previousValue.map((item) =>
        ids.includes(item.id)
          ? { ...item, readAt: item.readAt ?? now }
          : item
      )
    )
    setUnreadCount((previousValue) =>
      Math.max(0, previousValue - ids.length)
    )
  }, [])

  const handleMarkAllRead = async () => {
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ all: true }),
    })

    const now = new Date().toISOString()
    setNotifications((previousValue) =>
      previousValue.map((item) => ({ ...item, readAt: item.readAt ?? now }))
    )
    setUnreadCount(0)
  }

  const notificationEntries = useMemo(() => {
    return notifications.map((item) => {
      return buildNotificationDisplayItem(item, t, i18n.language)
    })
  }, [i18n.language, notifications, t])

  const badgeLabel =
    unreadCount > 0
      ? t('header.notificationsUnread', { count: unreadCount })
      : t('header.notifications')

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((previousValue) => !previousValue)}
        className="relative rounded-full p-2 text-white/90 transition-colors hover:bg-white/10 hover:text-white"
        aria-label={t('header.openNotifications')}
        title={badgeLabel}
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M15 17h5l-1.405-1.405A2.03 2.03 0 0 1 18 14.159V11a6 6 0 1 0-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0a3 3 0 1 1-6 0m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex min-w-[1.2rem] items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-transparent md:hidden"
            onClick={() => setOpen(false)}
            aria-label={t('common.close')}
          />

          <div className="fixed left-3 right-3 top-[5.75rem] z-50 rounded-3xl border border-slate-200/80 bg-white/95 shadow-2xl backdrop-blur md:absolute md:left-auto md:right-0 md:top-full md:mt-4 md:w-[21.75rem] dark:border-slate-700/70 dark:bg-slate-900/95">
            <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-4 dark:border-slate-700/70">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t('header.notifications')}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {badgeLabel}
                </p>
              </div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-xs font-semibold text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
                >
                  {t('header.markAllRead')}
                </button>
              )}
            </div>

            <div className="max-h-[32rem] overflow-y-auto px-2 py-2 overscroll-contain">
              {loading && notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  {t('common.loading')}
                </div>
              ) : notificationEntries.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  {t('header.notificationsEmpty')}
                </div>
              ) : (
                <div className="space-y-2">
                  {notificationEntries.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={async () => {
                        if (!item.readAt) {
                          await markNotificationsRead([item.id])
                        }
                        setOpen(false)
                        router.push(item.href)
                      }}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                        item.readAt
                          ? 'border-slate-200/70 bg-white hover:bg-slate-50 dark:border-slate-700/60 dark:bg-slate-900/50 dark:hover:bg-slate-800/80'
                          : 'border-blue-200 bg-blue-50/90 hover:bg-blue-100/80 dark:border-blue-500/30 dark:bg-blue-500/10 dark:hover:bg-blue-500/15'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {item.title}
                          </p>
                          {item.subtitle && (
                            <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                              {item.subtitle}
                            </p>
                          )}
                        </div>
                        {!item.readAt && (
                          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500" />
                        )}
                      </div>
                      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                        {item.timestamp}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
