import { notFound } from 'next/navigation'
import DialogsFixture from './DialogsFixture'

/**
 * Dev-only stage for every dialog drawn by components/Modal, one per `?o=`: auth-gate,
 * friends, interrupted, confirm, report, admin-watch, results, profile, custom-words,
 * quick-play. Onboarding and feedback open on any page, so the checks in
 * e2e/dialog-fit.spec.ts reach them there. Never shipped: 404 in production.
 */
export const metadata = { robots: { index: false, follow: false } }

export default async function DevDialogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (process.env.NODE_ENV === 'production') notFound()
  const { o } = await searchParams
  return <DialogsFixture dialog={typeof o === 'string' ? o : ''} />
}
