import {
  isTelephoneDoodleEnabled,
  isSketchAndGuessEnabled,
  isFakeArtistEnabled,
} from '@/lib/feature-flags'
import { getCatalogGames } from '@/lib/game-catalog'
import GamesClient from './GamesClient'

export default function GamesPage() {
  const enabledExperimental: string[] = []

  if (isTelephoneDoodleEnabled()) enabledExperimental.push('telephone-doodle')
  if (isSketchAndGuessEnabled()) enabledExperimental.push('guess-my-drawing')
  if (isFakeArtistEnabled()) enabledExperimental.push('fake-artist')

  const games = getCatalogGames({ enabledExperimental })

  return <GamesClient games={games} />
}
