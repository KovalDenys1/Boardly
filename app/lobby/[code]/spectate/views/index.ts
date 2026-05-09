import type { ComponentType } from 'react'
import type { GamePlayer } from '@/types/game'

export interface SpectatorViewProps {
  state: Record<string, any>
  players: GamePlayer[]
}

import ConnectFourView from './connect-four'
import MemoryView from './memory'
import AliasView from './alias'
import LiarsPartyView from './liars-party'
import YahtzeeView from './yahtzee'
import TicTacToeView from './tic-tac-toe'
import RpsView from './rps'
import SpyView from './spy'

// To add a new game: create views/<game-type>.tsx exporting a default SpectatorViewProps component,
// then add it here with the game's db enum key.
export const SPECTATOR_VIEWS: Record<string, ComponentType<SpectatorViewProps>> = {
  connect_four: ConnectFourView,
  memory: MemoryView,
  alias: AliasView,
  liars_party: LiarsPartyView,
  yahtzee: YahtzeeView,
  tic_tac_toe: TicTacToeView,
  rock_paper_scissors: RpsView,
  guess_the_spy: SpyView,
}
