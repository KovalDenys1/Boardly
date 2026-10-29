import UkPageLocale from '@/components/i18n/UkPageLocale'
import { localizedSiteMetadata } from '@/lib/localized-pages'
import { HREFLANG } from '@/lib/seo-locales'
import { RootDocument, siteMetadata, siteViewport } from '../root-document'

export const metadata = localizedSiteMetadata(siteMetadata, 'uk')
export const viewport = siteViewport

export default function UkLayout({ children }: { children: React.ReactNode }) {
  return (
    <RootDocument lang={HREFLANG.uk} pathLocale="uk" LocaleProvider={UkPageLocale}>
      {children}
    </RootDocument>
  )
}
