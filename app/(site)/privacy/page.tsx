import type { Metadata } from 'next'
import PrivacyNotice from './PrivacyNotice'
import { formatSellerAddress, getSellerIdentity } from '@/lib/seller-identity'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Who is responsible for your data on Boardly, what we process and why, who receives it, how long we keep it, and your rights.',
  alternates: {
    canonical: 'https://boardly.online/privacy',
  },
  // #1227: the "Who is responsible" section names the seller's home address,
  // so this page stays out of search results while remaining one click from
  // the footer and reachable at its canonical URL.
  robots: {
    index: false,
    follow: true,
  },
}

export default function PrivacyPolicy() {
  // The controller (#1163, #1126), set from Production env vars. Unset (local,
  // preview), the notice says only that Boardly is run from Norway.
  const seller = getSellerIdentity()
  const controller = seller ? { name: seller.legalName, address: formatSellerAddress(seller) } : null

  return (
    <div className="bd-page bd-screen flex-1 overflow-y-auto">
      <PrivacyNotice controller={controller} />
    </div>
  )
}
