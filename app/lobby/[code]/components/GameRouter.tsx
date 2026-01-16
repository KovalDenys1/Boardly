'use client'

import { GameRegistry } from '@/lib/game-registry'
import { GameEngine } from '@/lib/game-engine'
import { Game } from '@/types/game'

interface GameRouterProps {
  gameType: string
  gameEngine: GameEngine | null
  game: Game | null
  [key: string]: any // Allow additional props to be passed through
}

/**
 * Universal game router that renders the appropriate game UI component
 * based on the game type registered in GameRegistry
 */
export default function GameRouter({ gameType, gameEngine, game, ...props }: GameRouterProps) {
  // Ensure game components are registered (client-side only)
  if (typeof window !== 'undefined') {
    try {
      // Dynamic import to avoid SSR issues
      import('@/lib/game-registry-client').then(({ registerGameComponents }) => {
        registerGameComponents()
      })
    } catch (e) {
      // Ignore import errors
    }
  }

  const gameRegistration = GameRegistry.get(gameType)
  
  if (!gameRegistration) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-800 rounded-xl p-4">
        <div className="text-center">
          <div className="text-red-500 text-4xl mb-2">⚠️</div>
          <p className="text-gray-400 text-sm">Game type &quot;{gameType}&quot; not found</p>
        </div>
      </div>
    )
  }

  const GameComponent = gameRegistration.component
  
  if (!GameComponent) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-800 rounded-xl p-4">
        <div className="text-center">
          <div className="text-yellow-500 text-4xl mb-2">🚧</div>
          <p className="text-gray-400 text-sm">Game UI not yet implemented</p>
          <p className="text-gray-500 text-xs mt-1">{gameType}</p>
        </div>
      </div>
    )
  }

  // Render the game-specific component with all passed props
  return <GameComponent gameEngine={gameEngine} game={game} {...props} />
}
