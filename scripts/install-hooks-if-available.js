const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

function envFlag(name) {
  const value = process.env[name]
  if (!value) return false
  return ['1', 'true', 'yes'].includes(String(value).toLowerCase())
}

function shouldSkipHooksInstall() {
  if (envFlag('CI')) return 'CI environment'
  if (envFlag('RENDER')) return 'Render environment'
  if (String(process.env.NODE_ENV).toLowerCase() === 'production') return 'production NODE_ENV'

  const omit = String(process.env.npm_config_omit || '').toLowerCase()
  if (omit.includes('dev')) return 'dev dependencies omitted'

  const production = String(process.env.npm_config_production || '').toLowerCase()
  if (['1', 'true', 'yes'].includes(production)) return 'npm production install'

  return null
}

const skipReason = shouldSkipHooksInstall()
if (skipReason) {
  console.log(`[prepare] Skipping lefthook install (${skipReason}).`)
  process.exit(0)
}

const lefthookBin = path.join(
  process.cwd(),
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'lefthook.cmd' : 'lefthook'
)

if (!fs.existsSync(lefthookBin)) {
  console.log('[prepare] Skipping lefthook install (lefthook binary not installed).')
  process.exit(0)
}

const result = spawnSync(lefthookBin, ['install'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

if (result.error) {
  console.error('[prepare] Failed to run lefthook install:', result.error.message)
  process.exit(1)
}

if (typeof result.status === 'number') {
  process.exit(result.status)
}

process.exit(1)
