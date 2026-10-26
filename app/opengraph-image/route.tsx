import { siteCardResponse } from '@/lib/site-card'

export const runtime = 'edge'

export function GET() {
  return siteCardResponse()
}
