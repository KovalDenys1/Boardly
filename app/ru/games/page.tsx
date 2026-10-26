import GamesPage from '@/app/(site)/games/page'
import { localizedGamesMetadata } from '@/lib/localized-pages'

export const metadata = localizedGamesMetadata('ru')

export default function RuGamesPage() {
  return <GamesPage />
}
