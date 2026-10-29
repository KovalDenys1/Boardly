import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Checks that public/.well-known/assetlinks.json lets the signed Android app drop the URL bar:
 * a handle_all_urls statement for the package, listing the SHA-256 of the key that signed it.
 *
 * Run by scripts/android-build.sh after signing:
 *   npx tsx scripts/android-assetlinks.ts <sha256 digest from apksigner>
 */

const HANDLE_ALL_URLS = 'delegate_permission/common.handle_all_urls'

interface AssetLinkStatement {
  relation?: unknown
  target?: {
    namespace?: unknown
    package_name?: unknown
    sha256_cert_fingerprints?: unknown
  }
}

export function formatFingerprint(digest: string): string {
  const hex = digest.replace(/:/g, '').trim().toUpperCase()
  if (!/^[0-9A-F]{64}$/.test(hex)) {
    throw new Error(`not a SHA-256 digest: ${digest}`)
  }
  return hex.match(/../g)!.join(':')
}

export function assetLinksProblem(json: string, packageId: string, digest: string): string | null {
  let statements: unknown
  try {
    statements = JSON.parse(json)
  } catch {
    return 'assetlinks.json is not valid JSON'
  }
  if (!Array.isArray(statements)) return 'assetlinks.json is not a list of statements'

  const forPackage = (statements as AssetLinkStatement[]).filter(
    (statement) =>
      statement?.target?.namespace === 'android_app' && statement.target.package_name === packageId,
  )
  if (forPackage.length === 0) return `assetlinks.json has no statement for ${packageId}`

  const delegating = forPackage.filter(
    (statement) => Array.isArray(statement.relation) && statement.relation.includes(HANDLE_ALL_URLS),
  )
  if (delegating.length === 0) return `assetlinks.json does not grant ${packageId} handle_all_urls`

  const fingerprint = formatFingerprint(digest)
  const listed = delegating.some(
    (statement) =>
      Array.isArray(statement.target?.sha256_cert_fingerprints) &&
      statement.target.sha256_cert_fingerprints.includes(fingerprint),
  )
  return listed ? null : `the signing key ${fingerprint} is not listed in assetlinks.json for ${packageId}`
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..')
  const digest = process.argv[2]
  if (!digest) {
    console.error('usage: tsx scripts/android-assetlinks.ts <sha256 digest>')
    process.exit(2)
  }
  const packageId = JSON.parse(readFileSync(path.join(root, 'android/twa-manifest.json'), 'utf8')).packageId
  const problem = assetLinksProblem(
    readFileSync(path.join(root, 'public/.well-known/assetlinks.json'), 'utf8'),
    packageId,
    digest,
  )
  if (problem) {
    console.error(`android-assetlinks: ${problem}`)
    process.exit(1)
  }
  console.log(`assetlinks.json lists ${formatFingerprint(digest)} for ${packageId}`)
}
