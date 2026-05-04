'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { sounds } from '@/lib/sounds'

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
        aria-label={t('header.openAudioSettings', 'Open audio settings')}
        title={t('header.audioSettings', 'Audio Settings')}
        className={`relative flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--bd-line)] bg-[var(--bd-card-warm)] transition-all hover:-translate-y-px hover:text-[var(--bd-ink)] ${
          muted ? 'text-[var(--bd-ink-muted)]' : 'text-[var(--bd-ink)]'
        }`}
      >
        <VolumeIcon muted={muted} />
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-[var(--bd-line)] bg-white p-4 text-[var(--bd-ink)] shadow-[0_18px_45px_rgba(31,27,22,0.18)]">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="bd-kicker">{t('header.audioSettings', 'Audio Settings')}</p>
              <p className="mt-1 text-sm font-semibold text-[var(--bd-ink-muted)]">
                {muted ? t('header.unmute', 'Unmute') : `${t('header.volume', 'Volume')} ${volumePercent}%`}
              </p>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--bd-line)] bg-[var(--bd-card-warm)] text-[var(--bd-ink)]">
              <VolumeIcon muted={muted} />
            </div>
          </div>

          <button
            type="button"
            onClick={toggleMute}
            className="mb-4 flex w-full items-center justify-between rounded-xl border border-[var(--bd-line)] bg-[var(--bd-card-warm)] px-3 py-2.5 text-sm font-bold text-[var(--bd-ink)] transition-colors hover:bg-[var(--bd-bg2)]"
          >
            <span>{muted ? t('header.unmute', 'Unmute') : t('header.mute', 'Mute')}</span>
            <VolumeIcon muted={muted} />
          </button>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-semibold text-[var(--bd-ink-muted)]">{t('header.volume', 'Volume')}</label>
              <span className="text-xs font-black text-[var(--bd-ink)]">{volumePercent}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => changeVolume(parseFloat(e.target.value))}
              className="h-2 w-full cursor-pointer accent-[var(--bd-ink)]"
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
  const muted = !enabled || volume === 0
  const volumePercent = Math.round(volume * 100)

  return (
    <div className="rounded-2xl border border-[var(--bd-line)] bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="bd-kicker">{t('header.audioSettings', 'Audio Settings')}</p>
          <p className="mt-1 text-xs font-semibold text-[var(--bd-ink-muted)]">
            {muted ? t('header.unmute', 'Unmute') : `${t('header.volume', 'Volume')} ${volumePercent}%`}
          </p>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--bd-line)] bg-[var(--bd-card-warm)] text-[var(--bd-ink)]">
          <VolumeIcon muted={muted} />
        </div>
      </div>

      <button
        type="button"
        onClick={toggleMute}
        className="mb-3 flex w-full items-center justify-between rounded-xl border border-[var(--bd-line)] bg-[var(--bd-card-warm)] px-3 py-2.5 text-sm font-bold text-[var(--bd-ink)] transition-colors hover:bg-[var(--bd-bg2)]"
      >
        <span>{muted ? t('header.unmute', 'Unmute') : t('header.mute', 'Mute')}</span>
        <VolumeIcon muted={muted} />
      </button>

      <div className="px-1">
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs font-semibold text-[var(--bd-ink-muted)]">{t('header.volume', 'Volume')}</label>
          <span className="text-xs font-black text-[var(--bd-ink)]">{volumePercent}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => changeVolume(parseFloat(e.target.value))}
          className="h-2 w-full cursor-pointer accent-[var(--bd-ink)]"
          aria-label={t('header.volume', 'Volume')}
        />
      </div>
    </div>
  )
}
