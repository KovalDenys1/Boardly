#!/usr/bin/env tsx

import { readFileSync, writeFileSync } from 'node:fs'

// Lines an AI session appends to a commit message. They say nothing about the change,
// and the history is public.
const AI_TRAILERS = [
  /^Claude-Session:/i,
  /^Co-Authored-By:.*(claude|anthropic)/i,
  /^https:\/\/claude\.ai\/code\/session_\S*$/,
  /Generated with \[?Claude Code/i,
]

function printUsage() {
  console.log('Boardly git hook: commit-msg')
  console.log('')
  console.log('Usage: git-hook-commit-msg.ts <message-file>')
  console.log('Removes Claude-Session and Claude co-author trailers from the commit message.')
}

function main() {
  const file = process.argv[2]
  if (!file || file === '--help' || file === '-h') {
    printUsage()
    return
  }

  const original = readFileSync(file, 'utf8')
  const kept = original.split('\n').filter((line) => !AI_TRAILERS.some((pattern) => pattern.test(line.trim())))
  const cleaned = kept.join('\n').replace(/\n{2,}$/, '\n')

  if (cleaned !== original) {
    writeFileSync(file, cleaned)
  }
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
