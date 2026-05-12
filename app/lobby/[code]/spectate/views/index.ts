import type { ComponentType } from 'react'
import type { GamePlayer } from '@/types/game'

export interface SpectatorViewProps {
  state: Record<string, any>
  players: GamePlayer[]
}

import MemoryView from './memory'
import YahtzeeView from './yahtzee'
import SpyView from './spy'

// Dedicated games (connect_four, tic_tac_toe, rock_paper_scissors, alias, liars_party)
// are handled by the spectate page itself via real game components with isSpectator prop.
export const SPECTATOR_VIEWS: Record<string, ComponentType<SpectatorViewProps>> = {
  memory: MemoryView,
  yahtzee: YahtzeeView,
  guess_the_spy: SpyView,
}
