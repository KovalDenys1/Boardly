/**
 * Client-side game component registration
 * 
 * This file registers UI components for games.
 * It's separate from game-registry.ts to avoid SSR issues with React components.
 */

'use client'

import { GameRegistry } from './game-registry'
import YahtzeeGameBoard from '@/components/games/yahtzee/YahtzeeGameBoard'
import SpyGameBoard from '@/components/games/spy/SpyGameBoard'

/**
 * Register all game UI components
 * Call this function on client-side initialization
 */
export function registerGameComponents() {
  // Register Yahtzee component
  const yahtzeeRegistration = GameRegistry.get('yahtzee')
  if (yahtzeeRegistration) {
    GameRegistry.register(
      'yahtzee',
      yahtzeeRegistration.metadata,
      yahtzeeRegistration.factory,
      YahtzeeGameBoard
    )
  }

  // Register Spy component
  const spyRegistration = GameRegistry.get('guess_the_spy')
  if (spyRegistration) {
    GameRegistry.register(
      'guess_the_spy',
      spyRegistration.metadata,
      spyRegistration.factory,
      SpyGameBoard
    )
  }
}

// Auto-register on import (client-side only)
if (typeof window !== 'undefined') {
  registerGameComponents()
}
