import NotFound from './(site)/not-found'
import { RootDocument, siteMetadata, siteViewport } from './root-document'

export const metadata = siteMetadata
export const viewport = siteViewport

export default function GlobalNotFound() {
  return (
    <RootDocument lang="en">
      <NotFound />
    </RootDocument>
  )
}
