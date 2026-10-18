'use client'

import { useSyncExternalStore } from 'react'
import { isPlayApp } from '@/lib/app-shell'

// The attribute is set once by the head script and never changes afterwards.
const subscribeNoop = () => () => {}

export function useIsPlayApp(): boolean {
  return useSyncExternalStore(subscribeNoop, () => isPlayApp(), () => false)
}
