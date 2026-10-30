import GamesPage from '@/app/(site)/games/page'
import { localizedGamesMetadata } from '@/lib/localized-pages'

export const metadata = localizedGamesMetadata('es')

export default function EsGamesPage() {
  return <GamesPage />
}
