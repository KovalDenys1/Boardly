import EsPageLocale from '@/components/i18n/EsPageLocale'
import { localizedSiteMetadata } from '@/lib/localized-pages'
import { HREFLANG } from '@/lib/seo-locales'
import { RootDocument, siteMetadata, siteViewport } from '../root-document'

export const metadata = localizedSiteMetadata(siteMetadata, 'es')
export const viewport = siteViewport

export default function EsLayout({ children }: { children: React.ReactNode }) {
  return (
    <RootDocument lang={HREFLANG.es} pathLocale="es" LocaleProvider={EsPageLocale}>
      {children}
    </RootDocument>
  )
}
