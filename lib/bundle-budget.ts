export interface AppBuildManifest {
  pages: Record<string, string[]>
}

export interface BundleMetrics {
  route: string
  routeFiles: string[]
  routeTotalBytes: number
  routeSpecificChunkBytes: number
  sharedVendorBytes: number
  sharedCommonBytes: number
}

export interface BundleBudgets {
  routeTotalBytes: number
  routeSpecificChunkBytes: number
  sharedVendorBytes: number
  sharedCommonBytes: number
}

export interface BundleViolation {
  key: keyof BundleBudgets
  label: string
  actualBytes: number
  budgetBytes: number
}

const BUDGET_LABELS: Record<keyof BundleBudgets, string> = {
  routeTotalBytes: 'Route total JS',
  routeSpecificChunkBytes: 'Route specific chunk',
  sharedVendorBytes: 'Shared vendor chunk',
  sharedCommonBytes: 'Shared common chunk',
}

export function normalizeManifestFilePath(filePath: string): string {
  return filePath.replace(/^\/+/, '')
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function calculateBundleMetrics(params: {
  manifest: AppBuildManifest
  route: string
  getFileSize: (manifestFilePath: string) => number
}): BundleMetrics {
  const { manifest, route, getFileSize } = params
  const routeFiles = manifest.pages[route]

  if (!Array.isArray(routeFiles) || routeFiles.length === 0) {
    throw new Error(`Route "${route}" not found in app-build-manifest.json`)
  }

  const jsFiles = routeFiles
    .map(normalizeManifestFilePath)
    .filter((filePath) => filePath.endsWith('.js'))

  const routeWithoutLeadingSlash = route.replace(/^\/+/, '')
  const routeChunkPattern = new RegExp(`app/${escapeForRegex(routeWithoutLeadingSlash)}-[^/]+\\.js$`)

  let routeTotalBytes = 0
  let routeSpecificChunkBytes = 0
  let sharedVendorBytes = 0
  let sharedCommonBytes = 0

  for (const filePath of jsFiles) {
    const size = getFileSize(filePath)
    routeTotalBytes += size

    if (routeChunkPattern.test(filePath)) {
      routeSpecificChunkBytes += size
    }

    if (/vendor-[^/]+\.js$/.test(filePath)) {
      sharedVendorBytes += size
    }

    if (/common-[^/]+\.js$/.test(filePath)) {
      sharedCommonBytes += size
    }
  }

  return {
    route,
    routeFiles: jsFiles,
    routeTotalBytes,
    routeSpecificChunkBytes,
    sharedVendorBytes,
    sharedCommonBytes,
  }
}

export function evaluateBundleBudgets(metrics: BundleMetrics, budgets: BundleBudgets): BundleViolation[] {
  const violations: BundleViolation[] = []

  const checks: Array<{ key: keyof BundleBudgets; actual: number; budget: number }> = [
    {
      key: 'routeTotalBytes',
      actual: metrics.routeTotalBytes,
      budget: budgets.routeTotalBytes,
    },
    {
      key: 'routeSpecificChunkBytes',
      actual: metrics.routeSpecificChunkBytes,
      budget: budgets.routeSpecificChunkBytes,
    },
    {
      key: 'sharedVendorBytes',
      actual: metrics.sharedVendorBytes,
      budget: budgets.sharedVendorBytes,
    },
    {
      key: 'sharedCommonBytes',
      actual: metrics.sharedCommonBytes,
      budget: budgets.sharedCommonBytes,
    },
  ]

  for (const check of checks) {
    if (check.actual > check.budget) {
      violations.push({
        key: check.key,
        label: BUDGET_LABELS[check.key],
        actualBytes: check.actual,
        budgetBytes: check.budget,
      })
    }
  }

  return violations
}

export function formatKiB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KiB`
}
