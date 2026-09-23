// Moved to /og/lobby/<code> (#1091): robots.txt disallows /api/, and Twitterbot
// honours that for preview images. Kept so invite previews chat apps already
// cached, which name this URL, still resolve.
export { GET } from '@/app/og/lobby/[code]/route'

export const runtime = 'nodejs'
