import {
  LocalizedGamePage,
  localizedGameMetadata,
  localizedGameParams,
  type LocalizedGameParams,
} from '@/app/localized-game-page'

export const dynamicParams = false

export function generateStaticParams() {
  return localizedGameParams()
}

export async function generateMetadata({ params }: LocalizedGameParams) {
  return localizedGameMetadata('ru', (await params).game)
}

export default async function RuGamePage({ params }: LocalizedGameParams) {
  return <LocalizedGamePage locale="ru" slug={(await params).game} />
}
