import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()

interface AssetLinkStatement {
  relation: string[]
  target: {
    namespace: string
    package_name: string
    sha256_cert_fingerprints: string[]
  }
}

const assetLinks: AssetLinkStatement[] = JSON.parse(
  readFileSync(path.join(root, 'public/.well-known/assetlinks.json'), 'utf8'),
)
const twaManifest = JSON.parse(readFileSync(path.join(root, 'android/twa-manifest.json'), 'utf8'))

describe('public/.well-known/assetlinks.json (#1467)', () => {
  it('holds one statement', () => {
    expect(Array.isArray(assetLinks)).toBe(true)
    expect(assetLinks).toHaveLength(1)
  })

  it('delegates handle_all_urls, which is what removes the URL bar', () => {
    expect(assetLinks[0].relation).toEqual(['delegate_permission/common.handle_all_urls'])
  })

  it('targets the Android app online.boardly.app', () => {
    expect(assetLinks[0].target.namespace).toBe('android_app')
    expect(assetLinks[0].target.package_name).toBe('online.boardly.app')
  })

  it('lists SHA-256 fingerprints as uppercase hex pairs joined by colons', () => {
    for (const fingerprint of assetLinks[0].target.sha256_cert_fingerprints) {
      expect(fingerprint).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/)
    }
  })

  it('lists at least one fingerprint and no duplicates', () => {
    const fingerprints = assetLinks[0].target.sha256_cert_fingerprints
    expect(fingerprints.length).toBeGreaterThanOrEqual(1)
    expect(new Set(fingerprints).size).toBe(fingerprints.length)
  })

  it('names the same package as android/twa-manifest.json', () => {
    expect(assetLinks[0].target.package_name).toBe(twaManifest.packageId)
  })
})
