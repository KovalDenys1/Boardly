import {
  isAliasEnabled,
  isLiarsPartyEnabled,
  isTelephoneDoodleEnabled,
  isSketchAndGuessEnabled,
  isFakeArtistEnabled,
} from '@/lib/feature-flags'
import { getCatalogGames } from '@/lib/game-catalog'
import GamesClient from './GamesClient'

// Server component — reads feature flags at request time, builds the full game catalog,
// and passes it to the client. Feature-flagged games are resolved once here so the
// client never needs to re-call getCatalogGames or read feature flags itself.
export default function GamesPage() {
  const enabledExperimental: string[] = []

  if (isAliasEnabled()) enabledExperimental.push('alias')
  if (isLiarsPartyEnabled()) enabledExperimental.push('liars-party')
  if (isTelephoneDoodleEnabled()) enabledExperimental.push('telephone-doodle')
  if (isSketchAndGuessEnabled()) enabledExperimental.push('guess-my-drawing')
  if (isFakeArtistEnabled()) enabledExperimental.push('fake-artist')

  const games = getCatalogGames({ enabledExperimental })

  return <GamesClient games={games} />
}
