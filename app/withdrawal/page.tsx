import type { Metadata } from 'next'
import WithdrawalContent from './WithdrawalContent'

/**
 * The right-of-withdrawal page for Boardly Premium (#1162, angrerettloven § 8):
 * the 14-day rule, how to give notice, and the standard withdrawal form. The
 * copy is client-rendered through t() like /about, so a Norwegian visitor gets
 * the information in Norwegian as § 8 fourth paragraph requires.
 */
export const metadata: Metadata = {
  title: 'Right of Withdrawal',
  description:
    'How to withdraw from a Boardly Premium purchase within 14 days for a full refund, and the standard withdrawal form to send us.',
  alternates: {
    canonical: 'https://boardly.online/withdrawal',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function WithdrawalPage() {
  return <WithdrawalContent />
}
