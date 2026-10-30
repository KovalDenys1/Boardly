import DePageLocale from '@/components/i18n/DePageLocale'
import { localizedSiteMetadata } from '@/lib/localized-pages'
import { HREFLANG } from '@/lib/seo-locales'
import { RootDocument, siteMetadata, siteViewport } from '../root-document'

export const metadata = localizedSiteMetadata(siteMetadata, 'de')
export const viewport = siteViewport

export default function DeLayout({ children }: { children: React.ReactNode }) {
  return (
    <RootDocument lang={HREFLANG.de} pathLocale="de" LocaleProvider={DePageLocale}>
      {children}
    </RootDocument>
  )
}
