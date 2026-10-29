import { readFileSync } from 'node:fs'
import path from 'node:path'
import { assetLinksProblem, formatFingerprint } from '../../scripts/android-assetlinks'

const root = process.cwd()
const committedAssetLinks = readFileSync(path.join(root, 'public/.well-known/assetlinks.json'), 'utf8')

// apksigner verify --print-certs, "Signer #1 certificate SHA-256 digest", for the upload key
const UPLOAD_KEY_DIGEST = '7af0e52869f15c81323cf6592dd9c59286a3dc14c2ca55eaeae1191249213457'
const OTHER_KEY_DIGEST = '00'.repeat(32)

describe('formatFingerprint', () => {
  it('turns an apksigner digest into the assetlinks form', () => {
    expect(formatFingerprint(UPLOAD_KEY_DIGEST)).toBe(
      '7A:F0:E5:28:69:F1:5C:81:32:3C:F6:59:2D:D9:C5:92:86:A3:DC:14:C2:CA:55:EA:EA:E1:19:12:49:21:34:57',
    )
  })

  it('accepts a digest that is already colon-separated', () => {
    expect(formatFingerprint('7a:f0:' + UPLOAD_KEY_DIGEST.slice(4))).toBe(formatFingerprint(UPLOAD_KEY_DIGEST))
  })

  it('refuses anything that is not a SHA-256 digest', () => {
    expect(() => formatFingerprint('7af0')).toThrow()
    expect(() => formatFingerprint('zz'.repeat(32))).toThrow()
  })
})

describe('assetLinksProblem', () => {
  it('passes the committed assetlinks.json for the upload key and online.boardly.app', () => {
    expect(assetLinksProblem(committedAssetLinks, 'online.boardly.app', UPLOAD_KEY_DIGEST)).toBeNull()
  })

  it('reports an apk signed with a key the file does not list', () => {
    expect(assetLinksProblem(committedAssetLinks, 'online.boardly.app', OTHER_KEY_DIGEST)).toMatch(
      /00:00:00.*not listed/,
    )
  })

  it('reports a package the file does not name', () => {
    expect(assetLinksProblem(committedAssetLinks, 'online.boardly.other', UPLOAD_KEY_DIGEST)).toMatch(
      /online\.boardly\.other/,
    )
  })

  it('reports a statement without handle_all_urls', () => {
    const json = JSON.stringify([
      {
        relation: ['delegate_permission/common.get_login_creds'],
        target: {
          namespace: 'android_app',
          package_name: 'online.boardly.app',
          sha256_cert_fingerprints: [formatFingerprint(UPLOAD_KEY_DIGEST)],
        },
      },
    ])
    expect(assetLinksProblem(json, 'online.boardly.app', UPLOAD_KEY_DIGEST)).toMatch(/handle_all_urls/)
  })

  it('reports a file that is not JSON', () => {
    expect(assetLinksProblem('<html>', 'online.boardly.app', UPLOAD_KEY_DIGEST)).toMatch(/not valid JSON/)
  })
})
