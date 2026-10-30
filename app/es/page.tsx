import HomePageView from '@/components/HomePage/HomePageView'
import { localizedHomeMetadata } from '@/lib/localized-pages'

export const dynamic = 'force-static'
export const revalidate = 3600
export const metadata = localizedHomeMetadata('es')

export default function EsHomePage() {
  return <HomePageView locale="es" />
}
