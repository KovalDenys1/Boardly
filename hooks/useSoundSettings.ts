'use client'

import { useSyncExternalStore } from 'react'
import { getServerSoundSettings, getSoundSettings, subscribeSoundSettings, type SoundSettings } from '@/lib/sound-settings'

export function useSoundSettings(): SoundSettings {
  return useSyncExternalStore(subscribeSoundSettings, getSoundSettings, getServerSoundSettings)
}
