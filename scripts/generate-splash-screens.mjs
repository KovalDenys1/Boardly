// Regenerates the iOS PWA launch images from assets/brand/logo.svg (issue #1030).
// Run: node scripts/generate-splash-screens.mjs
//
// The twelve files these replace carried an obsolete identity — navy ground, a
// blue tile with a white die, a sans wordmark — so an installed Boardly opened
// on branding the site itself dropped long ago. They are drawn from the same
// wordmark SVG as every other brand asset, on the manifest's own
// `background_color`, so the launch image and the app's first paint agree.
//
// Deliberately no tagline: baked-in copy cannot go through t(), and this app
// ships in four locales. The mark and the wordmark carry no language.
import sharp from 'sharp'
import { readFile, readdir } from 'node:fs/promises'
import { writeFile } from 'node:fs/promises'

const PAPER = '#FBF6EE'
const DIR = 'public/splash'
const logo = await readFile('assets/brand/logo.svg')

// The logo is 1024x256. On the narrow side of the device it reads best at about
// two thirds of the width, and never wider than 720px so it does not turn into a
// banner on an iPad.
const logoWidthFor = (w, h) => Math.min(720, Math.round(Math.min(w, h) * 0.62))

const files = (await readdir(DIR)).filter((f) => /^apple-splash-\d+x\d+\.png$/.test(f)).sort()
if (files.length === 0) throw new Error(`no apple-splash-*.png found in ${DIR}`)

for (const file of files) {
  const [w, h] = file.match(/(\d+)x(\d+)/).slice(1, 3).map(Number)
  const logoWidth = logoWidthFor(w, h)
  // Trim first: the wordmark SVG's viewBox carries empty space to the right of
  // "boardly", so sizing the canvas rather than the ink lands the logo ~25% smaller
  // than asked for.
  const mark = await sharp(logo)
    .resize({ width: 2048 })
    .trim({ threshold: 1 })
    .resize({ width: logoWidth })
    .png()
    .toBuffer()
  const out = await sharp({ create: { width: w, height: h, channels: 4, background: PAPER } })
    .composite([{ input: mark, gravity: 'center' }])
    .png()
    .toBuffer()
  await writeFile(`${DIR}/${file}`, out)
  console.log('wrote', `${DIR}/${file}`, `(logo ${logoWidth}px wide)`)
}
