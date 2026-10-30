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
  return localizedGameMetadata('de', (await params).game)
}

export default async function DeGamePage({ params }: LocalizedGameParams) {
  return <LocalizedGamePage locale="de" slug={(await params).game} />
}
