'use client'

import { useEffect, useState } from 'react'
import { type ThemeMode, getStoredThemeMode, applyThemeMode, THEME_STORAGE_KEY, DARK_MEDIA_QUERY } from '@/lib/theme'
import { useTranslation } from '@/lib/i18n-helpers'
import { getSafeLocalStorage, writeLocal } from '@/lib/safe-storage'

const ORDER: ThemeMode[] = ['system', 'light', 'dark']
const THEME_CHANGED_EVENT = 'boardly:theme-changed'

function SunIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function SystemIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  )
}

const ICONS: Record<ThemeMode, React.FC> = {
  light: SunIcon,
  dark: MoonIcon,
  system: SystemIcon,
}

function useThemeMode() {
  const [mode, setMode] = useState<ThemeMode>('system')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMode(getStoredThemeMode(getSafeLocalStorage() ?? undefined))
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    const mq = window.matchMedia(DARK_MEDIA_QUERY)
    const handler = () => {
      const stored = getStoredThemeMode(getSafeLocalStorage() ?? undefined)
      if (stored === 'system') applyThemeMode('system')
    }
    const sync = () => setMode(getStoredThemeMode(getSafeLocalStorage() ?? undefined))
    mq.addEventListener('change', handler)
    window.addEventListener(THEME_CHANGED_EVENT, sync)
    return () => {
      mq.removeEventListener('change', handler)
      window.removeEventListener(THEME_CHANGED_EVENT, sync)
    }
  }, [mounted])

  const setTheme = (next: ThemeMode) => {
    writeLocal(THEME_STORAGE_KEY, next)
    applyThemeMode(next)
    setMode(next)
    window.dispatchEvent(new Event(THEME_CHANGED_EVENT))
  }

  return { mode, mounted, setTheme }
}

export function ThemeToggle() {
  const { t } = useTranslation()
  const { mode, mounted, setTheme } = useThemeMode()

  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]
    setTheme(next)
  }

  if (!mounted) return <div style={{ width: 36, height: 36 }} />

  const Icon = ICONS[mode]
  const label = t(mode === 'light' ? 'header.themeLight' : mode === 'dark' ? 'header.themeDark' : 'header.themeSystem')
  const current = t('header.themeCurrent', { mode: label })

  return (
    <button
      onClick={cycle}
      title={current}
      aria-label={current}
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        border: '1.5px solid var(--bd-line)',
        background: 'var(--bd-bg2)',
        color: 'var(--bd-ink-soft)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'background 0.15s, color 0.15s',
      }}
    >
      <Icon />
    </button>
  )
}

const THEME_OPTIONS: { value: ThemeMode; labelKey: 'header.themeLight' | 'header.themeSystem' | 'header.themeDark'; Icon: React.FC }[] = [
  { value: 'light', labelKey: 'header.themeLight', Icon: SunIcon },
  { value: 'system', labelKey: 'header.themeSystem', Icon: SystemIcon },
  { value: 'dark', labelKey: 'header.themeDark', Icon: MoonIcon },
]

const focusRing = 'focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav/50'

/**
 * Light / System / Dark as one segmented control. `compact` shows icons only, for a
 * row that has to share its width; the full form adds the label under each icon.
 */
export function ThemeSegmented({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation()
  const { mode, mounted, setTheme } = useThemeMode()

  if (!mounted) {
    return <div aria-hidden className={compact ? 'h-9 w-[118px]' : 'h-[66px]'} />
  }

  return (
    <div
      role="group"
      aria-label={t('header.themeLabel')}
      className={compact ? 'inline-flex rounded-xl border-[1.5px] border-bd-line bg-bd-bg p-0.5' : 'grid grid-cols-3 gap-1.5'}
    >
      {THEME_OPTIONS.map(({ value, labelKey, Icon }) => {
        const active = mode === value
        const label = t(labelKey)
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-pressed={active}
            aria-label={compact ? label : undefined}
            title={compact ? label : undefined}
            className={
              compact
                ? `flex h-8 w-9 items-center justify-center rounded-[9px] transition-colors ${
                    active ? 'bg-bd-ink text-bd-bg' : 'text-bd-ink-muted hover:bg-bd-bg2 hover:text-bd-ink'
                  } ${focusRing}`
                : `flex flex-col items-center gap-1.5 rounded-[10px] border-[1.5px] px-1 py-2 text-[11px] transition-colors ${
                    active
                      ? 'border-bd-ink bg-bd-bg2 font-bold text-bd-ink'
                      : 'border-bd-line bg-transparent font-medium text-bd-ink-muted hover:bg-bd-bg2'
                  } ${focusRing}`
            }
          >
            <Icon />
            {!compact && label}
          </button>
        )
      })}
    </div>
  )
}

interface ThemeSettingsPanelProps {
  title: string
  subtitle?: string
  className?: string
}

/** The full three-tile theme picker, for a settings surface. */
export function ThemeSettingsPanel({ title, subtitle, className = '' }: ThemeSettingsPanelProps) {
  return (
    <div className={className}>
      <p className="mb-2 block text-sm font-semibold text-bd-ink">{title}</p>
      {subtitle && <p className="mb-3 text-sm text-bd-ink-soft">{subtitle}</p>}
      <ThemeSegmented />
    </div>
  )
}
