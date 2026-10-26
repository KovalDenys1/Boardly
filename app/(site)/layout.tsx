import { RootDocument, siteMetadata, siteViewport } from '../root-document'

export const metadata = siteMetadata
export const viewport = siteViewport

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <RootDocument lang="en">{children}</RootDocument>
}
