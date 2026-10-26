import GamesPage from '@/app/(site)/games/page'
import { localizedGamesMetadata } from '@/lib/localized-pages'

export const metadata = localizedGamesMetadata('uk')

export default function UkGamesPage() {
  return <GamesPage />
}
