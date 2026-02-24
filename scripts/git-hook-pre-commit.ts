#!/usr/bin/env tsx

import { getStagedFiles, hasLocaleRelatedChanges, npmCommand, printHeader, printStep, runChecked } from './git-hook-common'

function printUsage() {
  console.log('Boardly git hook: pre-commit')
  console.log('')
  console.log('Runs:')
  console.log('- git diff --cached --check')
  console.log('- npm run check:locales (only when locale-related staged files changed)')
}

function main() {
  const args = new Set(process.argv.slice(2))
  if (args.has('--help') || args.has('-h')) {
    printUsage()
    return
  }

  printHeader('Boardly pre-commit hook')

  printStep('Git staged diff sanity', 'git diff --cached --check')
  runChecked('git', ['diff', '--cached', '--check'])

  const stagedFiles = getStagedFiles()
  if (stagedFiles.length === 0) {
    printStep('Locale parity', 'Skipped (no staged files).')
    console.log('')
    console.log('pre-commit hook completed successfully.')
    return
  }

  if (hasLocaleRelatedChanges(stagedFiles)) {
    printStep('Locale parity', 'npm run check:locales')
    runChecked(npmCommand, ['run', 'check:locales'])
  } else {
    printStep('Locale parity', 'Skipped (no locale-related staged changes).')
  }

  console.log('')
  console.log('pre-commit hook completed successfully.')
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
