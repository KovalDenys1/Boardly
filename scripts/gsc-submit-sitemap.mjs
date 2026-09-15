// Resubmits the sitemap to Google Search Console after a Production deployment, using the
// same two-legged service-account flow the Control Panel uses for reading (signed JWT →
// bearer token → API). Needs the service-account JSON in GSC_SERVICE_ACCOUNT_KEY and the
// account added to the property; the scope here is read-write for sitemaps only.
import { createSign } from 'node:crypto'

const raw = process.env.GSC_SERVICE_ACCOUNT_KEY
if (!raw) {
  console.log('GSC_SERVICE_ACCOUNT_KEY missing – skipped')
  process.exit(0)
}
const key = JSON.parse(raw)
const SITE = 'sc-domain:boardly.online'
const SITEMAP = 'https://boardly.online/sitemap.xml'
const now = Math.floor(Date.now() / 1000)
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
  iss: key.client_email,
  scope: 'https://www.googleapis.com/auth/webmasters',
  aud: 'https://oauth2.googleapis.com/token',
  iat: now,
  exp: now + 3600,
})}`
const signer = createSign('RSA-SHA256')
signer.update(unsigned)
const jwt = `${unsigned}.${signer.sign(key.private_key, 'base64url')}`

const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
})
const token = (await tokenRes.json()).access_token
if (!token) {
  console.error('token exchange failed', tokenRes.status)
  process.exit(1)
}
const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/sitemaps/${encodeURIComponent(SITEMAP)}`
const res = await fetch(url, { method: 'PUT', headers: { Authorization: `Bearer ${token}` } })
console.log(`GSC sitemaps.submit: ${res.status}`)
if (res.status >= 400) process.exit(1)
