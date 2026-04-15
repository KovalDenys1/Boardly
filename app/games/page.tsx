import {
  getPublicAvailableGameTypes,
  type PublicGameType,
} from '@/lib/public-game-access'
import GamesClient from './GamesClient'

export default function GamesPage() {
  const availableGameTypes: PublicGameType[] = getPublicAvailableGameTypes()

  return <GamesClient availableGameTypes={availableGameTypes} />
}
