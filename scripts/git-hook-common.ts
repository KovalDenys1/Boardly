#!/usr/bin/env tsx

import { spawnSync, type SpawnSyncOptions } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

export const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

type RunResult = ReturnType<typeof spawnSync>

function formatCommand(command: string, args: string[]) {
  return [command, ...args].join(' ')
}

function extractOutput(result: RunResult) {
  const stdout = typeof result.stdout === 'string' ? result.stdout.trim() : ''
  const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : ''
  return { stdout, stderr }
}

export function runChecked(command: string, args: string[], options: SpawnSyncOptions = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...options,
  })

  const error = result.error as NodeJS.ErrnoException | undefined
  if (error?.code === 'ENOENT') {
    throw new Error(`Command not found: ${command}`)
  }
  if (error) {
    throw new Error(`Failed to run ${formatCommand(command, args)}: ${error.message}`)
  }

  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status ?? 1}): ${formatCommand(command, args)}`)
  }
}

export function runCapture(command: string, args: string[], options: SpawnSyncOptions = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  })

  const error = result.error as NodeJS.ErrnoException | undefined
  if (error?.code === 'ENOENT') {
    throw new Error(`Command not found: ${command}`)
  }
  if (error) {
    throw new Error(`Failed to run ${formatCommand(command, args)}: ${error.message}`)
  }
  if (result.status !== 0) {
    const { stderr } = extractOutput(result)
    const suffix = stderr ? `\n${stderr}` : ''
    throw new Error(
      `Command failed (${result.status ?? 1}): ${formatCommand(command, args)}${suffix}`,
    )
  }

  const { stdout, stderr } = extractOutput(result)
  return { stdout, stderr }
}

export function getStagedFiles() {
  const { stdout } = runCapture('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'])
  if (!stdout) return []
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export function hasLocaleRelatedChanges(files: string[]) {
  return files.some(
    (file) =>
      file.startsWith('locales/') ||
      file === 'scripts/check-locales.ts' ||
      file === 'locales/index.ts',
  )
}

export function getExistingSmokeTests(cwd = process.cwd()) {
  const candidates = [
    '__tests__/lib/socket-url.test.ts',
    '__tests__/lib/guest-helpers.test.ts',
    '__tests__/lib/game-registry.test.ts',
    '__tests__/lib/lobby-player-requirements.test.ts',
  ]

  return candidates.filter((relativePath) => existsSync(path.join(cwd, relativePath)))
}

export function printHeader(title: string) {
  console.log(title)
}

export function printStep(title: string, detail?: string) {
  console.log('')
  console.log(`==> ${title}`)
  if (detail) {
    console.log(`    ${detail}`)
  }
}
