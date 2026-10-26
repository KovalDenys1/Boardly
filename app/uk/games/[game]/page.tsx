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
  return localizedGameMetadata('uk', (await params).game)
}

export default async function UkGamePage({ params }: LocalizedGameParams) {
  return <LocalizedGamePage locale="uk" slug={(await params).game} />
}
