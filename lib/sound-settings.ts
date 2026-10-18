import { readLocal, writeLocal } from '@/lib/safe-storage'

export const SOUND_ENABLED_KEY = 'soundEnabled'
export const SOUND_VOLUME_KEY = 'soundVolume'
export const DEFAULT_SOUND_VOLUME = 0.7
export const AUDIO_SETTINGS_CHANGED_EVENT = 'boardly:audio-settings-changed'

export interface SoundSettings {
  enabled: boolean
  volume: number
}

const SERVER_SETTINGS: SoundSettings = Object.freeze({ enabled: true, volume: DEFAULT_SOUND_VOLUME })

let current: SoundSettings | null = null
let storageListenerInstalled = false

function clampVolume(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function readStored(): SoundSettings {
  const volume = parseFloat(readLocal(SOUND_VOLUME_KEY) ?? '')
  return {
    enabled: readLocal(SOUND_ENABLED_KEY) !== 'false',
    volume: Number.isNaN(volume) ? DEFAULT_SOUND_VOLUME : clampVolume(volume),
  }
}

function announce() {
  window.dispatchEvent(new Event(AUDIO_SETTINGS_CHANGED_EVENT))
}

function commit(next: SoundSettings) {
  const previous = getSoundSettings()
  if (previous.enabled === next.enabled && previous.volume === next.volume) return
  current = next
  if (previous.enabled !== next.enabled) writeLocal(SOUND_ENABLED_KEY, String(next.enabled))
  if (previous.volume !== next.volume) writeLocal(SOUND_VOLUME_KEY, String(next.volume))
  announce()
}

/** The same object until a setting changes, so it can back `useSyncExternalStore`. */
export function getSoundSettings(): SoundSettings {
  if (typeof window === 'undefined') return SERVER_SETTINGS
  if (!current) current = readStored()
  return current
}

export function getServerSoundSettings(): SoundSettings {
  return SERVER_SETTINGS
}

export function isSoundEnabled(): boolean {
  return getSoundSettings().enabled
}

export function getSoundVolume(): number {
  return getSoundSettings().volume
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  commit({ ...getSoundSettings(), enabled })
}

export function toggleSoundEnabled(): boolean {
  setSoundEnabled(!isSoundEnabled())
  return isSoundEnabled()
}

export function setSoundVolume(volume: number): void {
  if (typeof window === 'undefined' || Number.isNaN(volume)) return
  commit({ ...getSoundSettings(), volume: clampVolume(volume) })
}

function installStorageListener() {
  if (storageListenerInstalled) return
  storageListenerInstalled = true
  window.addEventListener('storage', (event) => {
    if (event.key !== null && event.key !== SOUND_ENABLED_KEY && event.key !== SOUND_VOLUME_KEY) return
    const next = readStored()
    const previous = getSoundSettings()
    if (previous.enabled === next.enabled && previous.volume === next.volume) return
    current = next
    announce()
  })
}

/** Calls `listener` after any change, from this tab or another one. */
export function subscribeSoundSettings(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  installStorageListener()
  window.addEventListener(AUDIO_SETTINGS_CHANGED_EVENT, listener)
  return () => window.removeEventListener(AUDIO_SETTINGS_CHANGED_EVENT, listener)
}
