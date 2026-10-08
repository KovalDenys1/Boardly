/**
 * Open a page in Mobile Safari on the iOS Simulator and photograph it.
 *
 *   npx tsx scripts/ios-sim.ts /games/yahtzee
 *   npx tsx scripts/ios-sim.ts /lobby/1234 --device "iPhone 17 Pro Max" --guest guest.json
 *   npx tsx scripts/ios-sim.ts /dev/page --scroll '[data-testid="x"]' --tap '.button' --out tmp/ios
 *   npx tsx scripts/ios-sim.ts / --eval "return navigator.canShare?.({ files: [new File(['x'], 'a.png', { type: 'image/png' })] })"
 *
 * A WebDriver tap is synthetic: iOS can read it as a long press, and it carries no user
 * activation, so it will not open the share sheet - ask `--eval` what the API supports instead.
 *
 * Mobile Safari is the browser Boardly's iPhone players use, and the one an emulated
 * Chromium viewport is not: WebKit layout, the collapsing address bar that changes
 * 100dvh, the iOS share sheet (#688 shipped a cropped board after an emulated audit).
 * The simulator runs the real thing, headless, so nothing opens on the desktop.
 *
 * Driven over WebDriver by Apple's safaridriver, with no client library. One-time
 * setup on a new Mac (both need an admin password):
 *   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
 *   sudo safaridriver --enable
 *
 * Writes `<out>/<name>-page.png` (the page, from WebDriver) and `<name>-device.png`
 * (the whole screen, Safari's own bars included), and prints the horizontal-overflow
 * check. Exit code 1 when the page scrolls sideways.
 */
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface Options {
  target: string
  device: string
  out: string
  name: string
  base: string
  guest?: string
  scroll?: string
  tap?: string
  waitFor?: string
  evaluate?: string
  settleMs: number
  shutdown: boolean
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    target: '/',
    device: 'iPhone 16e',
    out: 'tmp/ios-sim',
    name: '',
    base: 'http://localhost:3000',
    settleMs: 1500,
    shutdown: false,
  }
  const rest: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = () => argv[++i]
    if (arg === '--device') opts.device = next()
    else if (arg === '--out') opts.out = next()
    else if (arg === '--name') opts.name = next()
    else if (arg === '--base') opts.base = next()
    else if (arg === '--guest') opts.guest = next()
    else if (arg === '--scroll') opts.scroll = next()
    else if (arg === '--tap') opts.tap = next()
    else if (arg === '--wait-for') opts.waitFor = next()
    else if (arg === '--eval') opts.evaluate = next()
    else if (arg === '--settle') opts.settleMs = Number(next())
    else if (arg === '--shutdown') opts.shutdown = true
    else rest.push(arg)
  }
  if (rest[0]) opts.target = rest[0]
  if (!opts.name) opts.name = `${opts.device.replace(/\s+/g, '-').toLowerCase()}`
  return opts
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function xcrun(args: string[]): string {
  return execFileSync('xcrun', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function findDevice(name: string): { udid: string; state: string } {
  const list = JSON.parse(xcrun(['simctl', 'list', 'devices', 'available', '-j'])) as {
    devices: Record<string, Array<{ name: string; udid: string; state: string }>>
  }
  const matches = Object.entries(list.devices)
    .filter(([runtime]) => runtime.includes('iOS'))
    .flatMap(([, devices]) => devices)
    .filter((device) => device.name === name)
  if (matches.length === 0) {
    throw new Error(`No available simulator named "${name}". See: xcrun simctl list devices available`)
  }
  return matches[matches.length - 1]
}

function bootedDevices(): string[] {
  const list = JSON.parse(xcrun(['simctl', 'list', 'devices', 'booted', '-j'])) as {
    devices: Record<string, Array<{ udid: string }>>
  }
  return Object.values(list.devices).flat().map((device) => device.udid)
}

async function webdriver(port: number, method: string, path: string, body?: unknown) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = (await res.json()) as { value: unknown }
  if (!res.ok) throw new Error(`${method} ${path}: ${JSON.stringify(json.value).slice(0, 300)}`)
  return json.value
}

async function startSafaridriver(): Promise<{ port: number; stop: () => void }> {
  const port = 4700 + Math.floor(Math.random() * 200)
  const child = spawn('safaridriver', ['-p', String(port)], { stdio: 'ignore' })
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`http://127.0.0.1:${port}/status`)
      return { port, stop: () => child.kill() }
    } catch {
      await sleep(100)
    }
  }
  child.kill()
  throw new Error('safaridriver did not start')
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const url = /^https?:/.test(opts.target) ? opts.target : `${opts.base}${opts.target}`
  mkdirSync(opts.out, { recursive: true })

  const device = findDevice(opts.device)
  // With two simulators booted, safaridriver may attach to the other one, so only ours runs.
  for (const other of bootedDevices()) if (other !== device.udid) xcrun(['simctl', 'shutdown', other])
  if (device.state !== 'Booted') {
    xcrun(['simctl', 'boot', device.udid])
    xcrun(['simctl', 'bootstatus', device.udid, '-b'])
  }

  const driver = await startSafaridriver()
  let session = ''
  try {
    const created = (await webdriver(driver.port, 'POST', '/session', {
      capabilities: {
        alwaysMatch: {
          browserName: 'safari',
          platformName: 'iOS',
          'safari:useSimulator': true,
          'safari:deviceUDID': device.udid,
        },
      },
    })) as { sessionId: string }
    session = created.sessionId
    const wd = (method: string, path: string, body?: unknown) =>
      webdriver(driver.port, method, `/session/${session}${path}`, body)
    const run = (script: string, args: unknown[] = []) => wd('POST', '/execute/sync', { script, args })

    await wd('POST', '/url', { url })
    if (opts.guest) {
      // A guest is a token, an id and a name in localStorage (see CLAUDE.md, "Testing a game").
      const guest = JSON.parse(readFileSync(opts.guest, 'utf8')) as { guestToken: string; guestId: string; guestName: string }
      await run(
        "localStorage.setItem('boardly_guest_token', arguments[0]); localStorage.setItem('boardly_guest_id', arguments[1]); localStorage.setItem('boardly_guest_name', arguments[2])",
        [guest.guestToken, guest.guestId, guest.guestName],
      )
      await wd('POST', '/refresh', {})
    }

    if (opts.waitFor) {
      for (let i = 0; i < 120; i++) {
        if (await run('return !!document.querySelector(arguments[0])', [opts.waitFor])) break
        if (i === 119) throw new Error(`Timed out waiting for ${opts.waitFor}`)
        await sleep(500)
      }
    }
    if (opts.scroll) await run("document.querySelector(arguments[0])?.scrollIntoView({ block: 'center' })", [opts.scroll])
    if (opts.tap) {
      const element = (await wd('POST', '/element', { using: 'css selector', value: opts.tap })) as Record<string, string>
      await wd('POST', `/element/${Object.values(element)[0]}/click`, {})
    }
    await sleep(opts.settleMs)
    const evaluated = opts.evaluate
      ? await wd('POST', '/execute/async', { script: `const done = arguments[arguments.length - 1]; Promise.resolve((async () => { ${opts.evaluate} })()).then(done, (e) => done('error: ' + e))`, args: [] })
      : undefined

    const metrics = (await run(
      'return { innerWidth: innerWidth, innerHeight: innerHeight, scrollWidth: document.documentElement.scrollWidth, dpr: devicePixelRatio, ua: navigator.userAgent }',
    )) as { innerWidth: number; innerHeight: number; scrollWidth: number; dpr: number; ua: string }

    const page = (await wd('GET', '/screenshot')) as string
    const pagePath = join(opts.out, `${opts.name}-page.png`)
    writeFileSync(pagePath, Buffer.from(page, 'base64'))
    const devicePath = join(opts.out, `${opts.name}-device.png`)
    xcrun(['simctl', 'io', device.udid, 'screenshot', devicePath])

    const overflow = metrics.scrollWidth > metrics.innerWidth
    console.log(
      JSON.stringify({ device: opts.device, url, viewport: `${metrics.innerWidth}x${metrics.innerHeight}@${metrics.dpr}x`, horizontalOverflow: overflow, ...(opts.evaluate ? { evaluated } : {}), page: pagePath, screen: devicePath }),
    )
    process.exitCode = overflow ? 1 : 0
  } finally {
    if (session) await webdriver(driver.port, 'DELETE', `/session/${session}`).catch(() => undefined)
    driver.stop()
    if (opts.shutdown) xcrun(['simctl', 'shutdown', device.udid])
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(2)
})
