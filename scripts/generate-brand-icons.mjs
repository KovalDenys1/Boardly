// Regenerates every raster brand asset from assets/brand/*.svg (issue #789).
// Run: node scripts/generate-brand-icons.mjs
import sharp from 'sharp'
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const PAPER = '#FBF6EE'
const tile = await readFile('assets/brand/tile.svg')
const logo = await readFile('assets/brand/logo.svg')

// Maskable icons need the mark inside the ~80% safe zone on an opaque ground.
const maskable = (size) =>
  sharp({ create: { width: size, height: size, channels: 4, background: PAPER } })
    .composite([{ input: tileAt(Math.round(size * 0.72)), gravity: 'center' }])
    .png()

const tileCache = new Map()
function tileAt(size) {
  if (!tileCache.has(size)) tileCache.set(size, sharp(tile).resize(size, size).png())
  return tileCache.get(size)
}

async function render(pipeline, out) {
  const buf = await (pipeline.toBuffer ? pipeline.toBuffer() : pipeline)
  await writeFile(out, buf)
  console.log('wrote', out)
}

await mkdir('public/brand', { recursive: true })

// The manifest/icon SVGs used to be hand-maintained copies of the tile, which is
// how they drifted out of sync with it (#1030). Emit them from the same file so
// the canonical geometry has exactly one home.
const tileInner = tile.toString().replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim()
const tileSvgText = tile.toString().trim() + '\n'
for (const size of [192, 512]) {
  await writeFile(`public/icons/icon-${size}.svg`, tileSvgText)
  console.log('wrote', `public/icons/icon-${size}.svg`)
  // Maskable: the mark sits inside the middle 72% on an opaque ground, so a
  // circular mask never bites into it.
  await writeFile(
    `public/icons/icon-maskable-${size}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">\n` +
      `<rect width="512" height="512" fill="${PAPER}"/>\n` +
      `<g transform="translate(71.68 71.68) scale(0.72)">\n  ${tileInner}\n</g>\n</svg>\n`
  )
  console.log('wrote', `public/icons/icon-maskable-${size}.svg`)
}

// Transparent tile icons (favicons / manifest "any")
for (const size of [192, 512]) {
  await render(sharp(tile).resize(size, size).png(), `public/icons/icon-${size}.png`)
}
// Maskable icons (opaque paper ground, safe-zone padding)
for (const size of [192, 512]) {
  const inner = await sharp(tile).resize(Math.round(size * 0.72)).png().toBuffer()
  await render(
    sharp({ create: { width: size, height: size, channels: 4, background: PAPER } })
      .composite([{ input: inner, gravity: 'center' }])
      .png(),
    `public/icons/icon-maskable-${size}.png`
  )
}
// Apple touch icon: 180px, opaque ground (iOS shows black behind transparency)
{
  const inner = await sharp(tile).resize(160).png().toBuffer()
  await render(
    sharp({ create: { width: 180, height: 180, channels: 4, background: PAPER } })
      .composite([{ input: inner, gravity: 'center' }])
      .png(),
    'public/icons/apple-touch-icon.png'
  )
}
// Stripe branding assets
await render(sharp(tile).resize(512, 512).png(), 'public/brand/icon.png')
{
  const inner = await sharp(logo).resize({ width: 1024 }).png().toBuffer()
  await render(
    sharp({ create: { width: 1120, height: 320, channels: 4, background: PAPER } })
      .composite([{ input: inner, gravity: 'center' }])
      .png(),
    'public/brand/logo.png'
  )
}
