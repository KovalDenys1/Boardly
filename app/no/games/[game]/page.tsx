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
  return localizedGameMetadata('no', (await params).game)
}

export default async function NoGamePage({ params }: LocalizedGameParams) {
  return <LocalizedGamePage locale="no" slug={(await params).game} />
}
