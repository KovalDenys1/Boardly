import RuPageLocale from '@/components/i18n/RuPageLocale'
import { localizedSiteMetadata } from '@/lib/localized-pages'
import { RootDocument, siteMetadata, siteViewport } from '../root-document'

export const metadata = localizedSiteMetadata(siteMetadata, 'ru')
export const viewport = siteViewport

export default function RuLayout({ children }: { children: React.ReactNode }) {
  return (
    <RootDocument lang="ru" pathLocale="ru" LocaleProvider={RuPageLocale}>
      {children}
    </RootDocument>
  )
}
