import {
  AppBuildManifest,
  BundleBudgets,
  calculateBundleMetrics,
  evaluateBundleBudgets,
  formatKiB,
  normalizeManifestFilePath,
} from '@/lib/bundle-budget'

describe('bundle-budget helpers', () => {
  const manifest: AppBuildManifest = {
    pages: {
      '/lobby/[code]/page': [
        '/static/chunks/webpack-a.js',
        '/static/chunks/main-app-a.js',
        '/static/chunks/vendor-a.js',
        '/static/chunks/common-a.js',
        '/static/chunks/app/lobby/[code]/page-a.js',
        '/static/css/app.css',
      ],
    },
  }

  const sizes: Record<string, number> = {
    'static/chunks/webpack-a.js': 10_000,
    'static/chunks/main-app-a.js': 2_000,
    'static/chunks/vendor-a.js': 500_000,
    'static/chunks/common-a.js': 100_000,
    'static/chunks/app/lobby/[code]/page-a.js': 120_000,
  }

  it('normalizes manifest file paths', () => {
    expect(normalizeManifestFilePath('/static/chunks/a.js')).toBe('static/chunks/a.js')
    expect(normalizeManifestFilePath('static/chunks/a.js')).toBe('static/chunks/a.js')
  })

  it('calculates route and shared chunk metrics', () => {
    const metrics = calculateBundleMetrics({
      manifest,
      route: '/lobby/[code]/page',
      getFileSize: (filePath) => sizes[filePath] ?? 0,
    })

    expect(metrics.routeFiles).toEqual([
      'static/chunks/webpack-a.js',
      'static/chunks/main-app-a.js',
      'static/chunks/vendor-a.js',
      'static/chunks/common-a.js',
      'static/chunks/app/lobby/[code]/page-a.js',
    ])
    expect(metrics.routeTotalBytes).toBe(732_000)
    expect(metrics.routeSpecificChunkBytes).toBe(120_000)
    expect(metrics.sharedVendorBytes).toBe(500_000)
    expect(metrics.sharedCommonBytes).toBe(100_000)
  })

  it('throws when route is missing in manifest', () => {
    expect(() =>
      calculateBundleMetrics({
        manifest,
        route: '/missing/page',
        getFileSize: () => 1,
      })
    ).toThrow('Route "/missing/page" not found in app-build-manifest.json')
  })

  it('reports budget violations', () => {
    const budgets: BundleBudgets = {
      routeTotalBytes: 700_000,
      routeSpecificChunkBytes: 140_000,
      sharedVendorBytes: 450_000,
      sharedCommonBytes: 120_000,
    }
    const metrics = calculateBundleMetrics({
      manifest,
      route: '/lobby/[code]/page',
      getFileSize: (filePath) => sizes[filePath] ?? 0,
    })

    const violations = evaluateBundleBudgets(metrics, budgets)
    expect(violations).toHaveLength(2)
    expect(violations.map((item) => item.key).sort()).toEqual(['routeTotalBytes', 'sharedVendorBytes'])
  })

  it('formats KiB values with one decimal place', () => {
    expect(formatKiB(1536)).toBe('1.5 KiB')
  })
})
