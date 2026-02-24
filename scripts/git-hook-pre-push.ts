#!/usr/bin/env tsx

import { getExistingSmokeTests, npmCommand, printHeader, printStep, runChecked } from './git-hook-common'

function printUsage() {
  console.log('Boardly git hook: pre-push')
  console.log('')
  console.log('Runs:')
  console.log('- npm run db:generate')
  console.log('- npm run check:locales')
  console.log('- npm run ci:quick')
  console.log('- Jest smoke tests (or full npm test when BOARDLY_HOOK_FULL_TESTS=1)')
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
