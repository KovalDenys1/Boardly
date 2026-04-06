import {
  isAliasEnabled,
  isLiarsPartyEnabled,
  isTelephoneDoodleEnabled,
  isSketchAndGuessEnabled,
  isFakeArtistEnabled,
} from '@/lib/feature-flags'
import GamesClient from './GamesClient'

// Server component — reads feature flags at request time and passes them to the client.
// This ensures experimental games only appear as "available" when their flag is on,
// and that flag is controlled per-environment in Vercel (not hardcoded in the UI).
export default function GamesPage() {
  const enabledExperimental: string[] = []

  if (isAliasEnabled()) enabledExperimental.push('alias')
  if (isLiarsPartyEnabled()) enabledExperimental.push('liars-party')
  if (isTelephoneDoodleEnabled()) enabledExperimental.push('telephone-doodle')
  if (isSketchAndGuessEnabled()) enabledExperimental.push('guess-my-drawing')
  if (isFakeArtistEnabled()) enabledExperimental.push('fake-artist')

  return <GamesClient enabledExperimental={enabledExperimental} />
}
