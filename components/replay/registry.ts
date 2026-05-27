import type { ComponentType } from 'react'
import type { ReplayRendererProps } from './types'

const registry: Record<string, () => Promise<{ default: ComponentType<ReplayRendererProps> }>> = {
  tic_tac_toe: () => import('./TTTReplayRenderer'),
  yahtzee: () => import('./YahtzeeReplayRenderer'),
  connect_four: () => import('./ConnectFourReplayRenderer'),
}

export function hasReplayRenderer(gameType: string): boolean {
  return gameType in registry
}

export async function loadReplayRenderer(
  gameType: string,
): Promise<ComponentType<ReplayRendererProps> | null> {
  const loader = registry[gameType]
  if (!loader) return null
  const imported = await loader()
  return imported.default
}
