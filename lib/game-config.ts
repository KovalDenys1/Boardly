/**
 * Centralized game configuration helpers
 * 
 * Provides helper functions to get game information from GameRegistry
 * for use in UI components and pages.
 */

import { GameRegistry, GameMetadata } from './game-registry'

/**
 * Get game metadata by game type
 */
export function getGameInfo(gameType: string): GameMetadata | undefined {
  return GameRegistry.getMetadata(gameType)
}

/**
 * Get all registered games metadata
 */
export function getAllGames(): GameMetadata[] {
  return GameRegistry.getAllMetadata()
}

/**
 * Get only games with implemented UI components
 */
export function getAvailableGames(): GameMetadata[] {
  return GameRegistry.getAvailableGames()
}

/**
 * Get games that are coming soon (registered but no UI component)
 */
export function getComingSoonGames(): GameMetadata[] {
  const allGames = GameRegistry.getAll()
  return allGames
    .filter(g => !g.component) // No UI component yet
    .map(g => g.metadata)
}

/**
 * Get player count range string (e.g., "2-4" or "3-10")
 */
export function getPlayerRange(metadata: GameMetadata): string {
  if (metadata.allowedPlayers && metadata.allowedPlayers.length > 0) {
    const min = Math.min(...metadata.allowedPlayers)
    const max = Math.max(...metadata.allowedPlayers)
    return min === max ? `${min}` : `${min}-${max}`
  }
  return `${metadata.minPlayers}-${metadata.maxPlayers}`
}

/**
 * Get gradient color class based on game category
 */
export function getGameGradient(category: GameMetadata['category']): string {
  const gradients: Record<GameMetadata['category'], string> = {
    dice: 'from-blue-500 to-purple-600',
    card: 'from-red-500 to-pink-600',
    board: 'from-green-500 to-emerald-600',
    social: 'from-orange-500 to-yellow-600',
    strategy: 'from-gray-700 to-gray-900',
  }
  return gradients[category] || 'from-blue-500 to-purple-600'
}

/**
 * Get route for game lobbies page
 */
export function getGameLobbiesRoute(gameId: string): string {
  // Map game IDs to their lobby routes
  // Handle special cases where game ID doesn't match route path
  const routeMap: Record<string, string> = {
    yahtzee: '/games/yahtzee/lobbies',
    guess_the_spy: '/games/spy/lobbies',
    spy: '/games/spy/lobbies', // Alias for guess_the_spy
    chess: '/games/chess/lobbies',
    uno: '/games/uno/lobbies',
  }
  
  // If we have a specific mapping, use it
  if (routeMap[gameId]) {
    return routeMap[gameId]
  }
  
  // Otherwise, try to construct route from game ID
  // Replace underscores with hyphens for URL-friendly paths
  const routeId = gameId.replace(/_/g, '-')
  return `/games/${routeId}/lobbies`
}
