import fs from 'node:fs'
import path from 'node:path'
import {
  AppBuildManifest,
  BundleBudgets,
  calculateBundleMetrics,
  evaluateBundleBudgets,
  formatKiB,
} from '../lib/bundle-budget'

const DEFAULT_ROUTE = '/lobby/[code]/page'

const DEFAULT_BUDGETS_KIB = {
  routeTotal: 1900,
  routeSpecificChunk: 140,
  sharedVendor: 1600,
  sharedCommon: 250,
} as const

function parseBudgetKiB(envName: string, defaultValue: number): number {
  const raw = process.env[envName]
  if (raw == null) {
    return defaultValue
  }

  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid numeric value for ${envName}: "${raw}"`)
  }

  return value
}

function toBytes(kib: number): number {
  return Math.round(kib * 1024)
}

function loadManifest(manifestPath: string): AppBuildManifest {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Build manifest not found: ${manifestPath}. Run "npm run build" first.`)
  }

  const payload = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { pages?: unknown }
  if (!payload || typeof payload !== 'object' || !payload.pages || typeof payload.pages !== 'object') {
    throw new Error(`Invalid app build manifest shape in ${manifestPath}`)
  }

  return payload as AppBuildManifest
}

function run(): void {
  const route = process.env.BUNDLE_BUDGET_ROUTE || DEFAULT_ROUTE
  const manifestPath = path.join(process.cwd(), '.next', 'app-build-manifest.json')
  const manifest = loadManifest(manifestPath)

  const budgets: BundleBudgets = {
    routeTotalBytes: toBytes(parseBudgetKiB('BUNDLE_BUDGET_ROUTE_TOTAL_KIB', DEFAULT_BUDGETS_KIB.routeTotal)),
    routeSpecificChunkBytes: toBytes(parseBudgetKiB('BUNDLE_BUDGET_ROUTE_CHUNK_KIB', DEFAULT_BUDGETS_KIB.routeSpecificChunk)),
    sharedVendorBytes: toBytes(parseBudgetKiB('BUNDLE_BUDGET_VENDOR_KIB', DEFAULT_BUDGETS_KIB.sharedVendor)),
    sharedCommonBytes: toBytes(parseBudgetKiB('BUNDLE_BUDGET_COMMON_KIB', DEFAULT_BUDGETS_KIB.sharedCommon)),
  }

  const metrics = calculateBundleMetrics({
    manifest,
    route,
    getFileSize: (manifestFilePath) => {
      const absolutePath = path.join(process.cwd(), '.next', manifestFilePath)
      if (!fs.existsSync(absolutePath)) {
        throw new Error(`Chunk file from manifest does not exist: ${absolutePath}`)
      }
      return fs.statSync(absolutePath).size
    },
  })

  // Report measured values even on failures for easier tuning.
  console.log(`[bundle-budget] Route: ${metrics.route}`)
  console.log(`[bundle-budget] Route total JS: ${formatKiB(metrics.routeTotalBytes)} (budget ${formatKiB(budgets.routeTotalBytes)})`)
  console.log(`[bundle-budget] Route specific chunk: ${formatKiB(metrics.routeSpecificChunkBytes)} (budget ${formatKiB(budgets.routeSpecificChunkBytes)})`)
  console.log(`[bundle-budget] Shared vendor chunk: ${formatKiB(metrics.sharedVendorBytes)} (budget ${formatKiB(budgets.sharedVendorBytes)})`)
  console.log(`[bundle-budget] Shared common chunk: ${formatKiB(metrics.sharedCommonBytes)} (budget ${formatKiB(budgets.sharedCommonBytes)})`)

  const violations = evaluateBundleBudgets(metrics, budgets)
  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(
        `[bundle-budget] ${violation.label} exceeded: ${formatKiB(violation.actualBytes)} > ${formatKiB(violation.budgetBytes)}`
      )
    }
    process.exit(1)
  }

  console.log('[bundle-budget] All bundle budgets are within limits.')
}

run()
