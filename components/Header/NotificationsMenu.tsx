'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useTranslation } from '@/lib/i18n-helpers'
import { getSupabaseClient } from '@/lib/supabase-client'
import {
  buildNotificationDisplayItem,
  type NotificationTone,
  type InAppNotificationItem,
  type InAppNotificationResponse,
} from '@/lib/notification-ui'

function BellIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M15 17.5h5l-1.45-1.45a2.2 2.2 0 0 1-.64-1.55V11a5.9 5.9 0 1 0-11.82 0v3.5c0 .58-.23 1.14-.64 1.55L4 17.5h5"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M9.5 17.5a2.5 2.5 0 0 0 5 0"
      />
    </svg>
  )
}

function getNotificationToneClass(tone: NotificationTone) {
  switch (tone) {
    case 'emerald':
      return 'border-[rgba(47,167,135,0.28)] bg-[rgba(79,201,166,0.12)]'
    case 'violet':
      return 'border-[rgba(120,103,232,0.28)] bg-[rgba(155,140,255,0.12)]'
    case 'amber':
      return 'border-[rgba(229,168,46,0.32)] bg-[rgba(255,196,77,0.16)]'
    case 'blue':
    default:
      return 'border-[rgba(107,193,240,0.35)] bg-[rgba(107,193,240,0.13)]'
  }
}

export function NotificationsMenu() {
  const NOTIFICATIONS_BACKGROUND_REFRESH_INTERVAL_MS = 60_000
  const router = useRouter()
  const pathname = usePathname()
  const { t, i18n } = useTranslation()
  const { data: session } = useSession()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const summaryInFlightRef = useRef(false)
  const listInFlightRef = useRef(false)
  const lastBackgroundRefreshAtRef = useRef(0)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [notifications, setNotifications] = useState<InAppNotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  const fetchSummary = useCallback(async () => {
    if (summaryInFlightRef.current) return
    summaryInFlightRef.current = true
    try {
      const response = await fetch('/api/notifications?summary=1', { cache: 'no-store' })
      if (!response.ok) return
      const data = (await response.json()) as InAppNotificationResponse
      setUnreadCount(data.unreadCount || 0)
    } catch {
      // silent — badge just doesn't update
    } finally {
      summaryInFlightRef.current = false
    }
  }, [])

  const fetchList = useCallback(async () => {
    if (listInFlightRef.current) return
    listInFlightRef.current = true
    setLoading(true)
    setError(false)
    try {
      const response = await fetch('/api/notifications?limit=20', { cache: 'no-store' })
      if (!response.ok) throw new Error('fetch failed')
      const data = (await response.json()) as InAppNotificationResponse
      setUnreadCount(data.unreadCount || 0)
      setNotifications(data.notifications || [])
    } catch {
      setError(true)
      setNotifications([])
    } finally {
      listInFlightRef.current = false
      setLoading(false)
    }
  }, [])

  const refreshUnreadCount = useCallback((force = false) => {
    const now = Date.now()
    if (!force && now - lastBackgroundRefreshAtRef.current < NOTIFICATIONS_BACKGROUND_REFRESH_INTERVAL_MS) {
      return
    }
    lastBackgroundRefreshAtRef.current = now
    void fetchSummary()
  }, [fetchSummary])

  // Background unread count polling
  useEffect(() => {
    refreshUnreadCount(true)
    const intervalId = window.setInterval(() => {
      refreshUnreadCount()
    }, NOTIFICATIONS_BACKGROUND_REFRESH_INTERVAL_MS)
    return () => window.clearInterval(intervalId)
  }, [refreshUnreadCount])

  // Fetch full list when dropdown opens
  useEffect(() => {
    if (!open) return
    void fetchList()
  }, [fetchList, open])

  // Close on navigation
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  // Refresh on tab visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshUnreadCount()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [refreshUnreadCount])

  // Real-time push via Supabase Broadcast on user:{userId} channel
  useEffect(() => {
    const userId = session?.user?.id
    if (!userId) return

    const supabase = getSupabaseClient()
    const channel = supabase
      .channel(`user-notifications:${userId}`)
      .on('broadcast', { event: 'notification-created' }, () => {
        // Immediately bump the badge
        setUnreadCount((prev) => prev + 1)
        // If dropdown is open, refresh the full list to show the new item
        if (open) {
          void fetchList()
        }
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [session?.user?.id, open, fetchList])

  const markNotificationsRead = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    const now = new Date().toISOString()
    setNotifications((prev) =>
      prev.map((item) =>
        ids.includes(item.id) ? { ...item, readAt: item.readAt ?? now } : item
      )
    )
    setUnreadCount((prev) => Math.max(0, prev - ids.length))
  }, [])

  const handleMarkAllRead = async () => {
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    })
    const now = new Date().toISOString()
    setNotifications((prev) => prev.map((item) => ({ ...item, readAt: item.readAt ?? now })))
    setUnreadCount(0)
  }

  const dismissNotification = useCallback(async (id: string) => {
    // Optimistic remove
    setNotifications((prev) => {
      const item = prev.find((n) => n.id === id)
      if (item && !item.readAt) {
        setUnreadCount((c) => Math.max(0, c - 1))
      }
      return prev.filter((n) => n.id !== id)
    })
    await fetch('/api/notifications', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    })
  }, [])

  const handleClearAll = async () => {
    setNotifications([])
    setUnreadCount(0)
    await fetch('/api/notifications', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    })
  }

  const notificationEntries = useMemo(() => {
    return notifications.map((item) => buildNotificationDisplayItem(item, t, i18n.language))
  }, [i18n.language, notifications, t])

  const badgeLabel =
    unreadCount > 0
      ? t('header.notificationsUnread', { count: unreadCount })
      : t('header.notifications')

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`relative flex h-9 w-9 items-center justify-center rounded-xl border transition-all hover:-translate-y-px ${
          unreadCount > 0
            ? 'border-[var(--bd-ink)] bg-[var(--bd-card-warm)] text-[var(--bd-ink)] shadow-[0_3px_0_rgba(31,27,22,0.14)]'
            : 'border-[var(--bd-line)] bg-[var(--bd-card-warm)] text-[var(--bd-ink-muted)] hover:text-[var(--bd-ink)]'
        }`}
        aria-label={t('header.openNotifications')}
        title={badgeLabel}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full border-2 border-[var(--bd-bg)] bg-[var(--bd-coral)] px-1.5 py-0.5 text-[10px] font-black text-white shadow">
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

          <div className="fixed left-3 right-3 top-[4.75rem] z-50 overflow-hidden rounded-3xl border border-[var(--bd-line)] bg-[var(--bd-card-warm)] shadow-[0_22px_60px_rgba(31,27,22,0.22)] md:absolute md:left-auto md:right-0 md:top-full md:mt-4 md:w-[22.5rem]">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--bd-line)] bg-[var(--bd-bg)] px-4 py-4">
              <div>
                <p className="bd-kicker">{t('header.notifications')}</p>
                <p className="mt-1 text-sm font-bold text-[var(--bd-ink)]">{badgeLabel}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="rounded-full border border-[var(--bd-line)] bg-[var(--bd-bg)] px-3 py-1.5 text-xs font-bold text-[var(--bd-ink-soft)] transition-colors hover:bg-[var(--bd-card-warm)] hover:text-[var(--bd-ink)]"
                  >
                    {t('header.markAllRead')}
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="rounded-full border border-[var(--bd-line)] bg-[var(--bd-bg)] px-3 py-1.5 text-xs font-bold text-[var(--bd-ink-soft)] transition-colors hover:bg-[var(--bd-card-warm)] hover:text-[var(--bd-coral)]"
                  >
                    {t('header.clearAll')}
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-[32rem] overflow-y-auto bg-[var(--bd-bg)] px-2 py-2 overscroll-contain">
              {loading && notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm font-semibold text-[var(--bd-ink-muted)]">
                  {t('common.loading')}
                </div>
              ) : error ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm font-semibold text-[var(--bd-coral)]">
                    {t('header.notificationsError')}
                  </p>
                  <button
                    type="button"
                    onClick={() => void fetchList()}
                    className="mt-3 text-xs font-bold text-[var(--bd-ink-muted)] underline hover:text-[var(--bd-ink)]"
                  >
                    {t('common.retry')}
                  </button>
                </div>
              ) : notificationEntries.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-[var(--bd-line)] bg-[var(--bd-card-warm)] text-[var(--bd-ink-muted)]">
                    <BellIcon />
                  </div>
                  <p className="text-sm font-semibold text-[var(--bd-ink-muted)]">
                    {t('header.notificationsEmpty')}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {notificationEntries.map((item) => {
                    const toneClass = getNotificationToneClass(item.tone)
                    return (
                      <div
                        key={item.id}
                        className={`group relative rounded-2xl border transition-all hover:-translate-y-px hover:shadow-[0_4px_14px_rgba(31,27,22,0.08)] ${
                          item.readAt
                            ? 'border-[var(--bd-line)] bg-[var(--bd-card-warm)]'
                            : toneClass
                        }`}
                      >
                        <button
                          type="button"
                          onClick={async () => {
                            if (!item.readAt) {
                              await markNotificationsRead([item.id])
                            }
                            setOpen(false)
                            router.push(item.href)
                          }}
                          className="w-full px-4 py-3 text-left"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-black leading-snug text-[var(--bd-ink)]">
                                {item.title}
                              </p>
                              {item.subtitle && (
                                <p className="mt-1 truncate text-xs font-semibold text-[var(--bd-ink-muted)]">
                                  {item.subtitle}
                                </p>
                              )}
                            </div>
                            {!item.readAt && (
                              <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--bd-coral)]" />
                            )}
                          </div>
                          <p className="mt-2 text-xs font-semibold text-[var(--bd-ink-muted)]">
                            {item.timestamp}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            void dismissNotification(item.id)
                          }}
                          aria-label={t('header.dismissNotification')}
                          className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--bd-bg)] text-[var(--bd-ink-muted)] opacity-0 transition-opacity hover:text-[var(--bd-ink)] group-hover:opacity-100"
                        >
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
