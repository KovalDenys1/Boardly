import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import {
  AppBuildManifest,
  BundleBudgets,
  calculateBundleMetrics,
  calculateBundleMetricsFromFiles,
  ClientReferenceManifestEntry,
  extractClientReferenceChunks,
  evaluateBundleBudgets,
  formatKiB,
  normalizeManifestFilePath,
} from '../lib/bundle-budget'

const DEFAULT_ROUTE = '/lobby/[code]/page'

const DEFAULT_BUDGETS_KIB = {
  // Calibrated from 2026-03-10 production build baseline after Next.js 16/Turbopack manifest migration.
  routeTotal: 1500,
  routeSpecificChunk: 110,
  sharedVendor: 256,
  sharedCommon: 128,
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

function walkFiles(directoryPath: string): string[] {
  if (!fs.existsSync(directoryPath)) {
    return []
  }

  const entries = fs.readdirSync(directoryPath, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkFiles(entryPath))
      continue
    }
    files.push(entryPath)
  }

  return files
}

function getClientReferenceManifestPath(route: string): string {
  const routePath = route.replace(/^\/+/, '')
  return path.join(process.cwd(), '.next', 'server', 'app', `${routePath}_client-reference-manifest.js`)
}

function loadClientReferenceManifest(route: string): ClientReferenceManifestEntry {
  const manifestPath = getClientReferenceManifestPath(route)
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Client reference manifest not found for route "${route}": ${manifestPath}`)
  }

  const script = fs.readFileSync(manifestPath, 'utf8')
  const sandbox = { globalThis: { __RSC_MANIFEST: {} as Record<string, unknown> } }
  vm.runInNewContext(script, sandbox, { timeout: 1000 })

  const entry = sandbox.globalThis.__RSC_MANIFEST[route]
  if (!entry || typeof entry !== 'object' || !('clientModules' in entry)) {
    throw new Error(`Invalid client reference manifest shape in ${manifestPath}`)
  }

  return entry as ClientReferenceManifestEntry
}

function loadRootBuildFiles(): string[] {
  const buildManifestPath = path.join(process.cwd(), '.next', 'build-manifest.json')
  if (!fs.existsSync(buildManifestPath)) {
    throw new Error(`Build manifest not found: ${buildManifestPath}. Run "npm run build" first.`)
  }

  const payload = JSON.parse(fs.readFileSync(buildManifestPath, 'utf8')) as {
    polyfillFiles?: unknown
    rootMainFiles?: unknown
    lowPriorityFiles?: unknown
  }

  const fileGroups = [payload.polyfillFiles, payload.rootMainFiles, payload.lowPriorityFiles]
  return fileGroups
    .flatMap((value) => (Array.isArray(value) ? value : []))
    .filter((value): value is string => typeof value === 'string' && value.endsWith('.js'))
    .map(normalizeManifestFilePath)
}

function getAllClientReferenceChunkCounts(): Map<string, number> {
  const manifestsRoot = path.join(process.cwd(), '.next', 'server', 'app')
  const manifestPaths = walkFiles(manifestsRoot).filter((filePath) => filePath.endsWith('_client-reference-manifest.js'))
  const chunkCounts = new Map<string, number>()

  for (const manifestPath of manifestPaths) {
    const script = fs.readFileSync(manifestPath, 'utf8')
    const sandbox = { globalThis: { __RSC_MANIFEST: {} as Record<string, unknown> } }

    try {
      vm.runInNewContext(script, sandbox, { timeout: 1000 })
    } catch {
      continue
    }

    for (const entry of Object.values(sandbox.globalThis.__RSC_MANIFEST)) {
      if (!entry || typeof entry !== 'object' || !('clientModules' in entry)) {
        continue
      }

      const chunkFiles = new Set(extractClientReferenceChunks(entry as ClientReferenceManifestEntry))
      for (const filePath of chunkFiles) {
        chunkCounts.set(filePath, (chunkCounts.get(filePath) ?? 0) + 1)
      }
    }
  }

  return chunkCounts
}

function loadMetricsForCurrentBuild(route: string) {
  const legacyManifestPath = path.join(process.cwd(), '.next', 'app-build-manifest.json')
  if (fs.existsSync(legacyManifestPath)) {
    const manifest = loadManifest(legacyManifestPath)
    return {
      source: 'legacy-app-build-manifest',
      metrics: calculateBundleMetrics({
        manifest,
        route,
        getFileSize: (manifestFilePath) => {
          const absolutePath = path.join(process.cwd(), '.next', manifestFilePath)
          if (!fs.existsSync(absolutePath)) {
            throw new Error(`Chunk file from manifest does not exist: ${absolutePath}`)
          }
          return fs.statSync(absolutePath).size
        },
      }),
    }
  }

  const routeManifest = loadClientReferenceManifest(route)
  const rootBuildFiles = loadRootBuildFiles()
  const routeChunkFiles = extractClientReferenceChunks(routeManifest)
  const chunkCounts = getAllClientReferenceChunkCounts()
  const routeSpecificFiles = routeChunkFiles.filter((filePath) => (chunkCounts.get(filePath) ?? 0) === 1)

  return {
    source: 'next16-client-reference-manifest',
    metrics: calculateBundleMetricsFromFiles({
      route,
      routeFiles: [...rootBuildFiles, ...routeChunkFiles],
      routeSpecificFiles,
      getFileSize: (manifestFilePath) => {
        const absolutePath = path.join(process.cwd(), '.next', manifestFilePath)
        if (!fs.existsSync(absolutePath)) {
          throw new Error(`Chunk file from manifest does not exist: ${absolutePath}`)
        }
        return fs.statSync(absolutePath).size
      },
    }),
  }
}

function run(): void {
  const route = process.env.BUNDLE_BUDGET_ROUTE || DEFAULT_ROUTE
  const { metrics, source } = loadMetricsForCurrentBuild(route)

  const budgets: BundleBudgets = {
    routeTotalBytes: toBytes(parseBudgetKiB('BUNDLE_BUDGET_ROUTE_TOTAL_KIB', DEFAULT_BUDGETS_KIB.routeTotal)),
    routeSpecificChunkBytes: toBytes(parseBudgetKiB('BUNDLE_BUDGET_ROUTE_CHUNK_KIB', DEFAULT_BUDGETS_KIB.routeSpecificChunk)),
    sharedVendorBytes: toBytes(parseBudgetKiB('BUNDLE_BUDGET_VENDOR_KIB', DEFAULT_BUDGETS_KIB.sharedVendor)),
    sharedCommonBytes: toBytes(parseBudgetKiB('BUNDLE_BUDGET_COMMON_KIB', DEFAULT_BUDGETS_KIB.sharedCommon)),
  }

  // Report measured values even on failures for easier tuning.
  console.log(`[bundle-budget] Source: ${source}`)
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
