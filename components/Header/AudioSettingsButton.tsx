'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { sounds } from '@/lib/sounds'
import { headerControl } from './headerControlStyles'

const AUDIO_SETTINGS_CHANGED_EVENT = 'boardly:audio-settings-changed'

function broadcastAudioSettingsChange() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(AUDIO_SETTINGS_CHANGED_EVENT))
}

function VolumeIcon({ muted }: { muted: boolean }) {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M4.5 9.5v5h3.25L12 18.25V5.75L7.75 9.5H4.5z"
      />
      {muted ? (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16.75 9.75l3.5 3.5" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20.25 9.75l-3.5 3.5" />
        </>
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 9.25a4.2 4.2 0 0 1 0 5.5" />
      )}
    </svg>
  )
}

function useAudioSettings() {
  const [enabled, setEnabled] = useState(true)
  const [volume, setVolumeState] = useState(0.7)

  useEffect(() => {
    setEnabled(sounds.isEnabled())
    setVolumeState(sounds.getVolume())
  }, [])

  useEffect(() => {
    const syncFromManager = () => {
      setEnabled(sounds.isEnabled())
      setVolumeState(sounds.getVolume())
    }

    window.addEventListener(AUDIO_SETTINGS_CHANGED_EVENT, syncFromManager)
    return () => {
      window.removeEventListener(AUDIO_SETTINGS_CHANGED_EVENT, syncFromManager)
    }
  }, [])

  const toggleMute = () => {
    if (!enabled) {
      const next = sounds.toggle()
      setEnabled(next)
      if (volume === 0) {
        sounds.setVolume(0.5)
        setVolumeState(0.5)
      }
      broadcastAudioSettingsChange()
      return
    }

    if (volume === 0) {
      sounds.setVolume(0.5)
      setVolumeState(0.5)
      broadcastAudioSettingsChange()
      return
    }

    const next = sounds.toggle()
    setEnabled(next)
    broadcastAudioSettingsChange()
  }

  const changeVolume = (val: number) => {
    sounds.setVolume(val)
    setVolumeState(val)
    if (!enabled && val > 0) {
      sounds.toggle()
      setEnabled(true)
    }
    broadcastAudioSettingsChange()
  }

  return { enabled, volume, toggleMute, changeVolume }
}

export function AudioSettingsButton() {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const { enabled, volume, toggleMute, changeVolume } = useAudioSettings()
  const muted = !enabled || volume === 0
  const volumePercent = Math.round(volume * 100)

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('header.openAudioSettings')}
        title={t('header.audioSettings')}
        aria-expanded={open}
        data-open={open ? '' : undefined}
        className={`${headerControl({ square: true, text: muted ? 'text-bd-ink-muted hover:text-bd-ink data-open:text-bd-ink' : 'text-bd-ink' })} relative`}
      >
        <VolumeIcon muted={muted} />
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-(--bd-line) bg-(--bd-card-warm) p-4 text-(--bd-ink) shadow-[0_18px_45px_rgba(31,27,22,0.18)]">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="bd-kicker">{t('header.audioSettings')}</p>
              <p className="mt-1 text-sm font-semibold text-(--bd-ink-muted)">
                {muted ? t('header.unmute') : `${t('header.volume')} ${volumePercent}%`}
              </p>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-(--bd-line) bg-(--bd-card-warm) text-(--bd-ink)">
              <VolumeIcon muted={muted} />
            </div>
          </div>

          <button
            type="button"
            onClick={toggleMute}
            className="mb-4 flex w-full items-center justify-between rounded-xl border border-(--bd-line) bg-(--bd-card-warm) px-3 py-2.5 text-sm font-bold text-(--bd-ink) transition-colors hover:bg-(--bd-bg2)"
          >
            <span>{muted ? t('header.unmute') : t('header.mute')}</span>
            <VolumeIcon muted={muted} />
          </button>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-semibold text-(--bd-ink-muted)">{t('header.volume')}</label>
              <span className="text-xs font-black text-(--bd-ink)">{volumePercent}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => changeVolume(parseFloat(e.target.value))}
              className="h-2 w-full cursor-pointer accent-(--bd-ink)"
              aria-label={t('header.volume')}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/** One tap mutes or unmutes; the volume itself lives in Settings and the desktop popover. */
export function MuteToggleButton({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  const { enabled, volume, toggleMute } = useAudioSettings()
  const muted = !enabled || volume === 0

  return (
    <button
      type="button"
      onClick={toggleMute}
      aria-pressed={muted}
      aria-label={muted ? t('header.unmute') : t('header.mute')}
      title={muted ? t('header.unmute') : t('header.mute')}
      className={`flex h-9 w-9 items-center justify-center rounded-xl border-[1.5px] border-bd-line bg-bd-bg transition-colors hover:bg-bd-bg2 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav-deep ${
        muted ? 'text-bd-ink-muted' : 'text-bd-ink'
      } ${className}`}
    >
      <VolumeIcon muted={muted} />
    </button>
  )
}

interface AudioSettingsPanelProps {
  title: string
  subtitle?: string
  className?: string
}

/** Mute button plus the volume slider, for a settings surface. */
export function AudioSettingsPanel({ title, subtitle, className = '' }: AudioSettingsPanelProps) {
  const { t } = useTranslation()
  const { enabled, volume, toggleMute, changeVolume } = useAudioSettings()
  const muted = !enabled || volume === 0
  const volumePercent = Math.round(volume * 100)

  return (
    <div className={className}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="mb-1 block text-sm font-semibold text-bd-ink">{title}</p>
          {subtitle && <p className="text-sm text-bd-ink-soft">{subtitle}</p>}
        </div>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-(--bd-line) bg-(--bd-card-warm) text-(--bd-ink)">
          <VolumeIcon muted={muted} />
        </div>
      </div>

      <button
        type="button"
        onClick={toggleMute}
        aria-pressed={muted}
        className="mb-3 flex w-full items-center justify-between rounded-xl border border-(--bd-line) bg-(--bd-card-warm) px-3 py-2.5 text-sm font-bold text-(--bd-ink) transition-colors hover:bg-(--bd-bg2) focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav-deep"
      >
        <span>{muted ? t('header.unmute') : t('header.mute')}</span>
        <VolumeIcon muted={muted} />
      </button>

      <div className="px-1">
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="audio-settings-volume" className="text-xs font-semibold text-(--bd-ink-muted)">{t('header.volume')}</label>
          <span className="text-xs font-black text-(--bd-ink)">{volumePercent}%</span>
        </div>
        <input
          id="audio-settings-volume"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => changeVolume(parseFloat(e.target.value))}
          className="h-2 w-full cursor-pointer accent-(--bd-ink)"
          aria-label={t('header.volume')}
        />
      </div>
    </div>
  )
}
