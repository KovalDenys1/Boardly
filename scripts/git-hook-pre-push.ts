#!/usr/bin/env tsx

import { readFileSync } from 'node:fs'
import {
  getExistingSmokeTests,
  npmCommand,
  printHeader,
  printStep,
  runCapture,
  runChecked,
} from './git-hook-common'

function printUsage() {
  console.log('Boardly git hook: pre-push')
  console.log('')
  console.log('Safety:')
  console.log('- Blocks direct pushes to main (override with BOARDLY_ALLOW_MAIN_PUSH=1)')
  console.log('')
  console.log('Runs:')
  console.log('- npm run db:generate')
  console.log('- npm run check:locales')
  console.log('- npm run ci:quick')
  console.log('- Jest smoke tests (or full npm test when BOARDLY_HOOK_FULL_TESTS=1)')
}

function assertMainPushIsAllowed() {
  if (process.env.BOARDLY_ALLOW_MAIN_PUSH === '1') {
    return
  }

  const currentBranch = runCapture('git', ['rev-parse', '--abbrev-ref', 'HEAD']).stdout
  if (currentBranch === 'main') {
    throw new Error(
      'Direct pushes to main are blocked by policy. Create a PR from develop (or set BOARDLY_ALLOW_MAIN_PUSH=1 for emergency).',
    )
  }

  let refLines = ''
  try {
    refLines = readFileSync(0, 'utf8')
  } catch {
    // Ignore stdin read errors; branch check above still protects common flows.
  }

  const attemptsMainRef = refLines
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .some((line) => {
      const parts = line.split(/\s+/)
      const remoteRef = parts[2]
      return remoteRef === 'refs/heads/main'
    })

  if (attemptsMainRef) {
    throw new Error(
      'Push target includes refs/heads/main and is blocked by policy. Use PR flow (or set BOARDLY_ALLOW_MAIN_PUSH=1 for emergency).',
    )
  }
}

function runSmokeOrFullTests() {
  const runFullTests = process.env.BOARDLY_HOOK_FULL_TESTS === '1'

  if (runFullTests) {
    printStep('Full test suite', 'npm test')
    runChecked(npmCommand, ['test'])
    return
  }

  const smokeTests = getExistingSmokeTests()
  if (smokeTests.length === 0) {
    printStep('Jest smoke tests', 'Skipped (no configured smoke test files found).')
    return
  }

  printStep('Jest smoke tests', `npm test -- --runTestsByPath ${smokeTests.join(' ')}`)
  runChecked(npmCommand, ['test', '--', '--runTestsByPath', ...smokeTests])
}

function main() {
  const args = new Set(process.argv.slice(2))
  if (args.has('--help') || args.has('-h')) {
    printUsage()
    return
  }

  printHeader('Boardly pre-push hook')
  assertMainPushIsAllowed()

  printStep('Prisma client generate', 'npm run db:generate')
  runChecked(npmCommand, ['run', 'db:generate'])

  printStep('Locale parity', 'npm run check:locales')
  runChecked(npmCommand, ['run', 'check:locales'])

  printStep('Lint + typecheck (ci:quick)', 'npm run ci:quick')
  runChecked(npmCommand, ['run', 'ci:quick'])

  runSmokeOrFullTests()

  console.log('')
  console.log('pre-push hook completed successfully.')
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
