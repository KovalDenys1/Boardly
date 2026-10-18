'use client'

import { useEffect } from 'react'
import { retainSounds } from '@/lib/sound-engine'
import type { CueId } from '@/lib/sound-map'

/**
 * Mounted by every page that plays sound. It preloads `cues` at idle, and audio runs only while
 * at least one consumer is mounted: after the last unmount the context is suspended and the
 * gesture listeners are gone, so a content page reached from a lobby holds no running audio.
 */
export function useSoundConsumer(cues: readonly CueId[]): void {
  const key = cues.join(' ')
  useEffect(() => retainSounds(key ? (key.split(' ') as CueId[]) : []), [key])
}
