/**
 * #1152: the AdSense loader script (which also delivers Google's EEA/UK
 * consent message) must run in production only. A fresh-profile measurement
 * against boardly.online showed it firing a request to
 * fundingchoicesmessages.google.com and writing a first-party `FCCDCF`
 * cookie before any consent existed — acceptable in production (it is
 * Google's own consent-message plumbing, not an ad, per CLAUDE.md's Ads
 * rules), but preview and development gain nothing from carrying it.
 *
 * The gate must key off the real Vercel environment, not `NODE_ENV`: `next
 * build` sets `NODE_ENV=production` for a Preview deployment too, so a
 * bare `NODE_ENV` check would ship this to Preview. The last two cases
 * below pin that distinction directly.
 *
 * RootLayout renders <html>/<head>/<body> itself, which React/jsdom refuse to
 * mount cleanly under an arbitrary test container (document singletons), so
 * this walks the returned React element tree directly instead of rendering
 * it — RootLayout is a plain function with no hooks of its own, so calling it
 * and inspecting the element graph it builds is equivalent to reading its JSX
 * output for elements it renders itself (script tags included).
 */
import type { ReactElement, ReactNode } from 'react'

jest.mock('next/font/google', () => ({
  Bricolage_Grotesque: () => ({ variable: '--bd-font-display', className: '' }),
  Inter: () => ({ className: '' }),
}))

jest.mock('next/dynamic', () => () => {
  const Noop = () => null
  Noop.displayName = 'DynamicNoop'
  return Noop
})

jest.mock('@/components/AnnouncementBanner', () => ({
  AnnouncementBanner: () => null,
}))

jest.mock('../../app/providers', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => children,
}))

jest.mock('@/lib/theme', () => ({
  getThemeInitScript: () => 'void 0',
}))

jest.mock('@/lib/organization-json-ld', () => ({
  siteJsonLd: {},
}))

const ADSENSE_SRC = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9471518400402044'

function isReactElement(node: unknown): node is ReactElement {
  return !!node && typeof node === 'object' && '$$typeof' in (node as object)
}

/** Depth-first search for a `<script src="...">` element anywhere under `node`. */
function findScriptSrc(node: unknown, src: string): boolean {
  if (Array.isArray(node)) {
    return node.some((child) => findScriptSrc(child, src))
  }
  if (!isReactElement(node)) return false

  const props = node.props as { src?: string; children?: ReactNode } | undefined
  if (node.type === 'script' && props?.src === src) return true

  return findScriptSrc(props?.children, src)
}

type EnvOverrides = {
  nodeEnv: string
  vercelEnv?: string
  nextPublicVercelEnv?: string
}

// `process.env.KEY = undefined` does NOT delete the key — Node coerces it to
// the *string* "undefined", which `isNonProductionDeployment` then reads as
// an unrecognized declared Vercel environment (neither 'preview' nor
// 'development'), tipping it toward "production". Must delete, not assign.
function setOrDelete(env: Record<string, string | undefined>, key: string, value: string | undefined) {
  if (value === undefined) {
    delete env[key]
  } else {
    env[key] = value
  }
}

async function elementTreeFor({ nodeEnv, vercelEnv, nextPublicVercelEnv }: EnvOverrides) {
  const env = process.env as Record<string, string | undefined>
  const original = {
    NODE_ENV: env.NODE_ENV,
    VERCEL_ENV: env.VERCEL_ENV,
    NEXT_PUBLIC_VERCEL_ENV: env.NEXT_PUBLIC_VERCEL_ENV,
  }
  setOrDelete(env, 'NODE_ENV', nodeEnv)
  setOrDelete(env, 'VERCEL_ENV', vercelEnv)
  setOrDelete(env, 'NEXT_PUBLIC_VERCEL_ENV', nextPublicVercelEnv)
  jest.resetModules()
  const { default: RootLayout } = await import('../../app/layout')
  const tree = RootLayout({ children: null })
  setOrDelete(env, 'NODE_ENV', original.NODE_ENV)
  setOrDelete(env, 'VERCEL_ENV', original.VERCEL_ENV)
  setOrDelete(env, 'NEXT_PUBLIC_VERCEL_ENV', original.NEXT_PUBLIC_VERCEL_ENV)
  return tree
}

describe('AdSense loader — environment gate (#1152)', () => {
  it('loads adsbygoogle.js in production (no Vercel env declared)', async () => {
    const tree = await elementTreeFor({ nodeEnv: 'production' })
    expect(findScriptSrc(tree, ADSENSE_SRC)).toBe(true)
  })

  it('does not load adsbygoogle.js in development', async () => {
    const tree = await elementTreeFor({ nodeEnv: 'development' })
    expect(findScriptSrc(tree, ADSENSE_SRC)).toBe(false)
  })

  it('does not load adsbygoogle.js in test/preview-like environments', async () => {
    const tree = await elementTreeFor({ nodeEnv: 'test' })
    expect(findScriptSrc(tree, ADSENSE_SRC)).toBe(false)
  })

  it('loads on Vercel Production (VERCEL_ENV=production)', async () => {
    const tree = await elementTreeFor({
      nodeEnv: 'production',
      vercelEnv: 'production',
      nextPublicVercelEnv: 'production',
    })
    expect(findScriptSrc(tree, ADSENSE_SRC)).toBe(true)
  })

  it('does NOT load on a Vercel Preview deployment, even though `next build` sets NODE_ENV=production there too', async () => {
    const tree = await elementTreeFor({
      nodeEnv: 'production',
      vercelEnv: 'preview',
      nextPublicVercelEnv: 'preview',
    })
    expect(findScriptSrc(tree, ADSENSE_SRC)).toBe(false)
  })
})
