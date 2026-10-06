/**
 * Renders every mail lib/email can send, with the sample data in scripts/email-samples.ts,
 * into tmp/email-preview/ (gitignored): <name>.html, <name>.txt and an index.html that
 * shows each one at 375 and 600 px. Nothing is sent.
 *   npx tsx scripts/preview-emails.ts
 *
 * The previews load the pictures from public/email/ so a changed asset shows before it is
 * deployed; the mail itself points at https://boardly.online, and so does every link.
 *
 *   npx tsx scripts/preview-emails.ts --screenshots <dir>
 * also photographs each one, headless, at 375 and 600 px in the light and the dark theme.
 *
 *   npx tsx scripts/preview-emails.ts --send-samples <address>
 * also sends each one to that address, and to no other, with the subject prefixed
 * "[sample]". There is no default address. Needs RESEND_API_KEY and EMAIL_FROM.
 */
import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { EMAIL_ART_BASE } from '../lib/email-art'
import { BOARDLY_URL } from '../lib/organization-json-ld'
import { emailSamples } from './email-samples'

const OUT_DIR = path.join(process.cwd(), 'tmp', 'email-preview')
const GMAIL_CLIP_BYTES = 102 * 1024

type Template = (...args: unknown[]) => { subject: string; html: string; text: string }

function optionValue(flag: string): string | null {
  const index = process.argv.indexOf(flag)
  if (index === -1) return null
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} needs a value`)
  return value
}

async function main() {
  const sampleAddress = optionValue('--send-samples')
  const screenshotDir = optionValue('--screenshots')
  if (sampleAddress !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sampleAddress)) {
    throw new Error(`--send-samples needs an email address, got "${sampleAddress}"`)
  }
  process.env.NEXTAUTH_URL = BOARDLY_URL
  if (!sampleAddress) {
    process.env.NEXT_PUBLIC_SELLER_LEGAL_NAME ??= 'Ola Nordmann'
    process.env.NEXT_PUBLIC_SELLER_ADDRESS ??= 'Storgata 1|0155 Oslo'
  }
  const { emailTemplates } = await import('../lib/email')
  const names = Object.keys(emailTemplates) as (keyof typeof emailTemplates)[]
  const localArt = `${path.relative(OUT_DIR, path.join(process.cwd(), 'public', new URL(EMAIL_ART_BASE).pathname))}/`

  mkdirSync(OUT_DIR, { recursive: true })
  const rendered = names.map((name) => {
    const message = (emailTemplates[name] as Template)(...emailSamples[name])
    const bytes = Buffer.byteLength(message.html, 'utf8')
    writeFileSync(path.join(OUT_DIR, `${name}.html`), message.html.split(EMAIL_ART_BASE).join(localArt))
    writeFileSync(path.join(OUT_DIR, `${name}.txt`), `Subject: ${message.subject}\n\n${message.text}\n`)
    const words = message.text.split(/\s+/).filter(Boolean).length
    console.log(
      `${name.padEnd(36)} ${(bytes / 1024).toFixed(1).padStart(6)} KB ${String(words).padStart(5)} words${bytes >= GMAIL_CLIP_BYTES ? '  over the Gmail clip limit' : ''}`
    )
    return { name, message, bytes }
  })

  const frames = rendered
    .map(
      ({ name, message, bytes }) =>
        `<h2>${name} <small>${(bytes / 1024).toFixed(1)} KB</small></h2><p>${message.subject.replace(/</g, '&lt;')}</p>` +
        `<div class="row"><iframe src="${name}.html" width="375" height="760"></iframe><iframe src="${name}.html" width="600" height="760"></iframe></div>`
    )
    .join('\n')
  writeFileSync(
    path.join(OUT_DIR, 'index.html'),
    `<!DOCTYPE html><meta charset="utf-8"><meta name="color-scheme" content="light dark"><title>Boardly mail preview</title>` +
      `<style>body{font-family:system-ui,sans-serif;margin:24px}.row{display:flex;gap:24px;align-items:flex-start;overflow-x:auto}iframe{border:1px solid #8888;flex-shrink:0}small{font-weight:400;opacity:.6}</style>` +
      `<h1>Boardly mail preview</h1>\n${frames}\n`
  )
  console.log(`\n${rendered.length} mails in ${path.relative(process.cwd(), OUT_DIR)}/ - open index.html`)

  if (screenshotDir) {
    const { chromium } = await import('playwright')
    const out = path.resolve(screenshotDir)
    mkdirSync(out, { recursive: true })
    const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain'] })
    try {
      for (const colorScheme of ['light', 'dark'] as const) {
        for (const width of [375, 600]) {
          const page = await browser.newPage({ viewport: { width, height: 800 }, colorScheme, deviceScaleFactor: 1 })
          for (const { name } of rendered) {
            await page.goto(pathToFileURL(path.join(OUT_DIR, `${name}.html`)).href, { waitUntil: 'load' })
            await page.screenshot({ path: path.join(out, `${name}-${width}-${colorScheme}.png`), fullPage: true })
          }
          await page.close()
        }
      }
    } finally {
      await browser.close()
    }
    console.log(`${rendered.length * 4} screenshots in ${out}`)
  }

  if (!sampleAddress) return

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) throw new Error('--send-samples needs RESEND_API_KEY and EMAIL_FROM')
  const { Resend } = await import('resend')
  const resend = new Resend(apiKey)
  for (const { name, message } of rendered) {
    const { data, error } = await resend.emails.send({
      from,
      to: sampleAddress,
      subject: `[sample] ${message.subject}`,
      html: message.html,
      text: message.text,
    })
    console.log(`${name.padEnd(36)} ${error ? `failed: ${error.message}` : data?.id}`)
    if (error) process.exitCode = 1
    await new Promise((resolve) => setTimeout(resolve, 700))
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
