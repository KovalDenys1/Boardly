import NoPageLocale from '@/components/i18n/NoPageLocale'
import { localizedSiteMetadata } from '@/lib/localized-pages'
import { HREFLANG } from '@/lib/seo-locales'
import { RootDocument, siteMetadata, siteViewport } from '../root-document'

export const metadata = localizedSiteMetadata(siteMetadata, 'no')
export const viewport = siteViewport

export default function NoLayout({ children }: { children: React.ReactNode }) {
  return (
    <RootDocument lang={HREFLANG.no} pathLocale="no" LocaleProvider={NoPageLocale}>
      {children}
    </RootDocument>
  )
}
