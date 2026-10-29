import GamesPage from '@/app/(site)/games/page'
import { localizedGamesMetadata } from '@/lib/localized-pages'

export const metadata = localizedGamesMetadata('no')

export default function NoGamesPage() {
  return <GamesPage />
}
