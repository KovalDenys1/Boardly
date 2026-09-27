import type { Metadata } from 'next'
import { formatSellerAddress, getSellerIdentity } from '@/lib/seller-identity'
import TermsContent from './TermsContent'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'The Boardly Terms of Service: accounts and age, Premium, the community rules and moderation, changes, ending the agreement, liability, governing law and complaints.',
  alternates: {
    canonical: 'https://boardly.online/terms',
  },
}

export default function TermsOfService() {
  // The operator (#1163), set from Production env vars. Unset (local, preview),
  // the "Who we are" section is not drawn.
  const identity = getSellerIdentity()
  const seller = identity
    ? { name: identity.legalName, address: formatSellerAddress(identity), email: identity.email }
    : null

  return (
    <div className="bd-page bd-screen flex-1 overflow-y-auto">
      <TermsContent seller={seller} />
    </div>
  )
}
