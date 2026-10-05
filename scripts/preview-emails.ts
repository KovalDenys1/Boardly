/**
 * Renders every mail lib/email can send, with the sample data in scripts/email-samples.ts,
 * into tmp/email-preview/ (gitignored): <name>.html, <name>.txt and an index.html that
 * shows each one at 375 and 600 px. Nothing is sent.
 *   npx tsx scripts/preview-emails.ts
 *
 * The previews load the logo from public/ so a changed asset shows before it is
 * deployed; the mail itself points at https://boardly.online, and so does every link.
 *
 *   npx tsx scripts/preview-emails.ts --send-samples
 * also sends each one to support@boardly.online, and to no other address, with the
 * subject prefixed "[sample]". Needs RESEND_API_KEY and EMAIL_FROM in the environment.
 */
import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'
import { EMAIL_LOGO } from '../lib/email-layout'
import { BOARDLY_URL, SUPPORT_EMAIL } from '../lib/organization-json-ld'
import { emailSamples } from './email-samples'

const OUT_DIR = path.join(process.cwd(), 'tmp', 'email-preview')
const GMAIL_CLIP_BYTES = 102 * 1024

type Template = (...args: unknown[]) => { subject: string; html: string; text: string }

async function main() {
  const sendSamples = process.argv.includes('--send-samples')
  process.env.NEXTAUTH_URL = BOARDLY_URL
  if (!sendSamples) {
    process.env.NEXT_PUBLIC_SELLER_LEGAL_NAME ??= 'Ola Nordmann'
    process.env.NEXT_PUBLIC_SELLER_ADDRESS ??= 'Storgata 1|0155 Oslo'
  }
  const { emailTemplates } = await import('../lib/email')
  const names = Object.keys(emailTemplates) as (keyof typeof emailTemplates)[]
  const localLogo = path.relative(OUT_DIR, path.join(process.cwd(), 'public', new URL(EMAIL_LOGO.src).pathname))

  mkdirSync(OUT_DIR, { recursive: true })
  const rendered = names.map((name) => {
    const message = (emailTemplates[name] as Template)(...emailSamples[name])
    const bytes = Buffer.byteLength(message.html, 'utf8')
    writeFileSync(path.join(OUT_DIR, `${name}.html`), message.html.split(EMAIL_LOGO.src).join(localLogo))
    writeFileSync(path.join(OUT_DIR, `${name}.txt`), `Subject: ${message.subject}\n\n${message.text}\n`)
    console.log(`${name.padEnd(36)} ${(bytes / 1024).toFixed(1).padStart(6)} KB${bytes >= GMAIL_CLIP_BYTES ? '  over the Gmail clip limit' : ''}`)
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

  if (!sendSamples) return

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) throw new Error('--send-samples needs RESEND_API_KEY and EMAIL_FROM')
  const { Resend } = await import('resend')
  const resend = new Resend(apiKey)
  for (const { name, message } of rendered) {
    const { data, error } = await resend.emails.send({
      from,
      to: SUPPORT_EMAIL,
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
