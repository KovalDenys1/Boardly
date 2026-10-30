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
  return localizedGameMetadata('es', (await params).game)
}

export default async function EsGamePage({ params }: LocalizedGameParams) {
  return <LocalizedGamePage locale="es" slug={(await params).game} />
}
