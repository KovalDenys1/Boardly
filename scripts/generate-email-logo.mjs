// Regenerates public/email/logo.png: the header lockup as boardly.online draws
// it, on its own paper plate so it reads on any background a mail client picks.
// The display font is taken from the live site. Run: node scripts/generate-email-logo.mjs
import { chromium } from 'playwright'

const OUT = 'public/email/logo.png'
const WIDTH = 164
const HEIGHT = 56

const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain'] })
const page = await browser.newPage({ viewport: { width: 600, height: 300 }, deviceScaleFactor: 3 })
await page.goto('https://boardly.online/', { waitUntil: 'networkidle' })

await page.evaluate(
  ({ width, height }) => {
    document.body.innerHTML = `
      <div id="plate" style="box-sizing:border-box;width:${width}px;height:${height}px;display:flex;align-items:center;gap:9px;padding:0 0 3px 10px;background:#FBF6EE;border-radius:16px;font-family:var(--bd-font-display);font-weight:800;font-size:24px;letter-spacing:-0.03em;line-height:1;color:#1F1B16">
        <span style="width:36px;height:36px;border-radius:10px;background:#1F1B16;color:#FFC44D;display:grid;place-items:center;font-size:21px;letter-spacing:0;box-shadow:3px 3px 0 #FF6B5B;flex-shrink:0">B</span>boardly
      </div>`
    document.body.style.background = 'transparent'
  },
  { width: WIDTH, height: HEIGHT }
)
await page.evaluate(() => document.fonts.ready)

const fontLoaded = await page.evaluate(() => document.fonts.check("800 24px 'Bricolage Grotesque'"))
if (!fontLoaded) {
  await browser.close()
  throw new Error('Bricolage Grotesque did not load from boardly.online; the logo would be drawn in a fallback font')
}

await page.locator('#plate').screenshot({ path: OUT, omitBackground: true })
await browser.close()
console.log('wrote', OUT, `${WIDTH * 3}x${HEIGHT * 3}`)
