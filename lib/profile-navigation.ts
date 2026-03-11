'use client'

import { useEffect } from 'react'

type RouterLike = {
  push: (href: string) => void
  back: () => void
}

type NavigateToProfileOptions = {
  tab?: string
}

type ProfileReturnState = {
  href: string
  scrollY: number
  updatedAt: number
}

const PROFILE_PATH = '/profile'
const PROFILE_RETURN_STATE_KEY = 'boardly:profile:return-state'
const PROFILE_SCROLL_RESTORE_KEY = 'boardly:profile:scroll-restore'

function canUseBrowserApi() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
}

function isProfileHref(href: string) {
  return href === PROFILE_PATH || href.startsWith(`${PROFILE_PATH}?`) || href.startsWith(`${PROFILE_PATH}#`)
}

function currentHref() {
  if (!canUseBrowserApi()) {
    return PROFILE_PATH
  }
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function isValidState(value: unknown): value is ProfileReturnState {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Partial<ProfileReturnState>
  return (
    typeof candidate.href === 'string' &&
    candidate.href.startsWith('/') &&
    typeof candidate.scrollY === 'number' &&
    Number.isFinite(candidate.scrollY) &&
    candidate.scrollY >= 0 &&
    typeof candidate.updatedAt === 'number' &&
    Number.isFinite(candidate.updatedAt)
  )
}

function readState(key: string): ProfileReturnState | null {
  if (!canUseBrowserApi()) {
    return null
  }

  const raw = window.sessionStorage.getItem(key)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw)
    return isValidState(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeState(key: string, state: ProfileReturnState) {
  if (!canUseBrowserApi()) {
    return
  }

  window.sessionStorage.setItem(key, JSON.stringify(state))
}

function clearState(key: string) {
  if (!canUseBrowserApi()) {
    return
  }
  window.sessionStorage.removeItem(key)
}

function snapshotCurrentRoute(): ProfileReturnState | null {
  if (!canUseBrowserApi()) {
    return null
  }

  const href = currentHref()
  if (isProfileHref(href)) {
    return null
  }

  return {
    href,
    scrollY: Math.max(0, Math.round(window.scrollY || 0)),
    updatedAt: Date.now(),
  }
}

function queueScrollRestore(state: ProfileReturnState) {
  writeState(PROFILE_SCROLL_RESTORE_KEY, state)
}

export function saveCurrentRouteForProfileNavigation() {
  const snapshot = snapshotCurrentRoute()
  if (!snapshot) {
    return
  }
  writeState(PROFILE_RETURN_STATE_KEY, snapshot)
}

export function restoreProfileScrollIfNeeded() {
  const pending = readState(PROFILE_SCROLL_RESTORE_KEY)
  if (!pending || !canUseBrowserApi()) {
    return
  }

  if (pending.href !== currentHref()) {
    return
  }

  const top = pending.scrollY
  window.requestAnimationFrame(() => {
    window.scrollTo(0, top)
    window.requestAnimationFrame(() => {
      window.scrollTo(0, top)
    })
  })

  clearState(PROFILE_SCROLL_RESTORE_KEY)
}

export function navigateToProfile(
  router: RouterLike,
  pathname: string | null | undefined,
  options?: NavigateToProfileOptions,
) {
  const requestedTab = options?.tab
  const targetHref =
    requestedTab && requestedTab !== 'profile'
      ? `${PROFILE_PATH}?tab=${encodeURIComponent(requestedTab)}`
      : PROFILE_PATH

  if (pathname === PROFILE_PATH && !requestedTab) {
    navigateBackFromProfile(router)
    return
  }

  if (pathname !== PROFILE_PATH) {
    saveCurrentRouteForProfileNavigation()
  }

  router.push(targetHref)
}

export function navigateBackFromProfile(
  router: RouterLike,
  options?: {
    fallbackHref?: string
  },
) {
  const fallbackHref = options?.fallbackHref ?? '/'
  const savedState = readState(PROFILE_RETURN_STATE_KEY)

  if (savedState && !isProfileHref(savedState.href)) {
    queueScrollRestore(savedState)
    router.push(savedState.href)
    return
  }

  if (canUseBrowserApi() && window.history.length > 1) {
    router.back()
    return
  }

  router.push(fallbackHref)
}

export function useProfileNavigationTracking(pathname: string | null | undefined) {
  useEffect(() => {
    restoreProfileScrollIfNeeded()
  }, [pathname])

  useEffect(() => {
    if (!pathname || pathname === PROFILE_PATH) {
      return
    }
    saveCurrentRouteForProfileNavigation()
  }, [pathname])

  useEffect(() => {
    if (!pathname || pathname === PROFILE_PATH || !canUseBrowserApi()) {
      return
    }

    let frameId: number | null = null

    const onScroll = () => {
      if (frameId !== null) {
        return
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null
        saveCurrentRouteForProfileNavigation()
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
      window.removeEventListener('scroll', onScroll)
    }
  }, [pathname])
}
