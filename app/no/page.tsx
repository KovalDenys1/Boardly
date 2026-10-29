import HomePageView from '@/components/HomePage/HomePageView'
import { localizedHomeMetadata } from '@/lib/localized-pages'

export const dynamic = 'force-static'
export const revalidate = 3600
export const metadata = localizedHomeMetadata('no')

export default function NoHomePage() {
  return <HomePageView locale="no" />
}
