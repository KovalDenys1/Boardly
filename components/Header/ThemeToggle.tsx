'use client'

import { useEffect, useState } from 'react'
import { type ThemeMode, getStoredThemeMode, applyThemeMode, THEME_STORAGE_KEY, DARK_MEDIA_QUERY } from '@/lib/theme'
import { useTranslation } from '@/lib/i18n-helpers'

const ORDER: ThemeMode[] = ['system', 'light', 'dark']

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
    setMode(getStoredThemeMode(localStorage))
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    const mq = window.matchMedia(DARK_MEDIA_QUERY)
    const handler = () => {
      const stored = getStoredThemeMode(localStorage)
      if (stored === 'system') applyThemeMode('system')
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mounted])

  const setTheme = (next: ThemeMode) => {
    localStorage.setItem(THEME_STORAGE_KEY, next)
    applyThemeMode(next)
    setMode(next)
  }

  return { mode, mounted, setTheme }
}

export function ThemeToggle() {
  const { mode, mounted, setTheme } = useThemeMode()

  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]
    setTheme(next)
  }

  if (!mounted) return <div style={{ width: 36, height: 36 }} />

  const Icon = ICONS[mode]
  const label = mode === 'light' ? 'Light' : mode === 'dark' ? 'Dark' : 'System'

  return (
    <button
      onClick={cycle}
      title={`Theme: ${label}`}
      aria-label={`Switch theme (current: ${label})`}
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

export function ThemeMobilePanel() {
  const { t } = useTranslation()
  const { mode, mounted, setTheme } = useThemeMode()

  if (!mounted) return null

  const options: { value: ThemeMode; label: string; Icon: React.FC }[] = [
    { value: 'light', label: t('header.themeLight'), Icon: SunIcon },
    { value: 'system', label: t('header.themeSystem'), Icon: SystemIcon },
    { value: 'dark', label: t('header.themeDark'), Icon: MoonIcon },
  ]

  return (
    <div style={{ borderRadius: 14, border: '1.5px solid var(--bd-line)', background: 'var(--bd-card-warm)', padding: '12px 14px', marginTop: 4 }}>
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bd-ink-muted)', marginBottom: 10 }}>
        {t('header.themeLabel')}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        {options.map(({ value, label, Icon }) => {
          const active = mode === value
          return (
            <button
              key={value}
              onClick={() => setTheme(value)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 5,
                padding: '9px 4px',
                borderRadius: 10,
                border: active ? '1.5px solid var(--bd-ink)' : '1.5px solid var(--bd-line)',
                background: active ? 'var(--bd-bg2)' : 'transparent',
                color: active ? 'var(--bd-ink)' : 'var(--bd-ink-muted)',
                fontSize: 11,
                fontWeight: active ? 700 : 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
              aria-pressed={active}
            >
              <Icon />
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
