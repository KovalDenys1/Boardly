'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { sounds } from '@/lib/sounds'

function useAudioSettings() {
  const [enabled, setEnabled] = useState(true)
  const [volume, setVolumeState] = useState(0.7)

  useEffect(() => {
    setEnabled(sounds.isEnabled())
    setVolumeState(sounds.getVolume())
  }, [])

  const toggleMute = () => {
    const next = sounds.toggle()
    setEnabled(next)
  }

  const changeVolume = (val: number) => {
    sounds.setVolume(val)
    setVolumeState(val)
    if (!enabled && val > 0) {
      sounds.toggle()
      setEnabled(true)
    }
  }

  return { enabled, volume, toggleMute, changeVolume }
}

export function AudioSettingsButton() {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const { enabled, volume, toggleMute, changeVolume } = useAudioSettings()

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const icon = !enabled || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t('header.openAudioSettings', 'Open audio settings')}
        title={t('header.audioSettings', 'Audio Settings')}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-base hover:bg-white/20 transition-colors"
      >
        {icon}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-56 rounded-xl border border-white/10 bg-gray-900 p-4 shadow-xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/50">
            {t('header.audioSettings', 'Audio Settings')}
          </p>

          {/* Mute toggle */}
          <button
            onClick={toggleMute}
            className="mb-4 flex w-full items-center justify-between rounded-lg px-3 py-2 hover:bg-white/5 transition-colors"
          >
            <span className="text-sm text-white">
              {enabled ? t('header.mute', 'Mute') : t('header.unmute', 'Unmute')}
            </span>
            <span className="text-base">{enabled ? '🔊' : '🔇'}</span>
          </button>

          {/* Volume slider */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs text-white/60">{t('header.volume', 'Volume')}</label>
              <span className="text-xs text-white/60">{Math.round(volume * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => changeVolume(parseFloat(e.target.value))}
              className="h-1.5 w-full cursor-pointer accent-purple-400"
              aria-label={t('header.volume', 'Volume')}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export function AudioSettingsMobilePanel() {
  const { t } = useTranslation()
  const { enabled, volume, toggleMute, changeVolume } = useAudioSettings()

  return (
    <div className="rounded-2xl border border-gray-200 bg-white/80 p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800/60">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
        {t('header.audioSettings', 'Audio Settings')}
      </p>

      <button
        onClick={toggleMute}
        className="mb-3 flex w-full items-center justify-between rounded-xl px-3 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
          {enabled ? t('header.mute', 'Mute') : t('header.unmute', 'Unmute')}
        </span>
        <span className="text-base">{enabled ? '🔊' : '🔇'}</span>
      </button>

      <div className="px-1">
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs text-gray-500 dark:text-gray-400">{t('header.volume', 'Volume')}</label>
          <span className="text-xs text-gray-500 dark:text-gray-400">{Math.round(volume * 100)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => changeVolume(parseFloat(e.target.value))}
          className="h-1.5 w-full cursor-pointer accent-purple-500"
          aria-label={t('header.volume', 'Volume')}
        />
      </div>
    </div>
  )
}
