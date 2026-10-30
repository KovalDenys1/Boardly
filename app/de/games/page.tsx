import GamesPage from '@/app/(site)/games/page'
import { localizedGamesMetadata } from '@/lib/localized-pages'

export const metadata = localizedGamesMetadata('de')

export default function DeGamesPage() {
  return <GamesPage />
}
