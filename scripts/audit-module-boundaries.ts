import { readdirSync, readFileSync, statSync } from 'fs'
import path from 'path'

type BoundaryViolation = {
  file: string
  importPath: string
  reason: string
}

const repoRoot = process.cwd()
const scanRoots = ['app', 'components', 'contexts', 'hooks', 'lib', 'scripts', 'types']
const rootFiles: string[] = []
const sourceExtensions = new Set(['.ts', '.tsx'])
const ignoredDirectories = new Set(['node_modules', '.next', '.git', 'coverage', 'reports'])

const serverOnlyImportPatterns = [
  /^@\/lib\/server(?:\/|$)/,
  /^@\/lib\/db$/,
  /^@\/lib\/auth$/,
  /^@\/lib\/cron-auth$/,
  /^@\/lib\/custom-prisma-adapter$/,
  /^@\/lib\/email$/,
  /^@\/lib\/guest-auth$/,
  /^@\/lib\/guest-helpers$/,
  /^@\/lib\/logger$/,
  /^@\/lib\/next-auth$/,
  /^@\/lib\/notification-queue$/,
  /^@\/lib\/rate-limit$/,
  /^@\/lib\/request-auth$/,
]

const clientOnlyImportPatterns = [
  /^@\/lib\/client(?:\/|$)/,
  /^@\/lib\/fetch-with-guest$/,
  /^@\/lib\/i18n-toast$/,
  /^@\/lib\/last-account$/,
  /^@\/lib\/profile-navigation$/,
  /^@\/lib\/sounds$/,
]

function toPosixPath(value: string) {
  return value.split(path.sep).join('/')
}

function walkFiles(directory: string): string[] {
  const absoluteDirectory = path.join(repoRoot, directory)
  const files: string[] = []

  for (const entry of readdirSync(absoluteDirectory)) {
    if (ignoredDirectories.has(entry)) {
      continue
    }

    const absolutePath = path.join(absoluteDirectory, entry)
    const stats = statSync(absolutePath)

    if (stats.isDirectory()) {
      files.push(...walkFiles(path.relative(repoRoot, absolutePath)))
      continue
    }

    if (stats.isFile() && sourceExtensions.has(path.extname(entry))) {
      files.push(absolutePath)
    }
  }

  return files
}

function readSourceFiles() {
  return [
    ...scanRoots.flatMap((root) => walkFiles(root)),
    ...rootFiles.map((file) => path.join(repoRoot, file)),
  ]
}

function isClientEntry(source: string) {
  return /^\s*['"]use client['"]/.test(source)
}

function isServerEntry(relativeFile: string) {
  return (
    relativeFile.startsWith('app/api/') ||
    relativeFile.startsWith('lib/server/') ||
    relativeFile.startsWith('scripts/')
  )
}

function extractImports(source: string) {
  const imports = new Set<string>()
  const importRegex = /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g
  const dynamicImportRegex = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g

  for (const regex of [importRegex, dynamicImportRegex]) {
    for (const match of source.matchAll(regex)) {
      imports.add(match[1])
    }
  }

  return [...imports]
}

function matchesAny(importPath: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(importPath))
}

const violations: BoundaryViolation[] = []

for (const absoluteFile of readSourceFiles()) {
  const relativeFile = toPosixPath(path.relative(repoRoot, absoluteFile))
  const source = readFileSync(absoluteFile, 'utf8')
  const imports = extractImports(source)

  if (isClientEntry(source)) {
    for (const importPath of imports) {
      if (matchesAny(importPath, serverOnlyImportPatterns)) {
        violations.push({
          file: relativeFile,
          importPath,
          reason: 'client modules must not import server-only infrastructure',
        })
      }
    }
  }

  if (isServerEntry(relativeFile)) {
    for (const importPath of imports) {
      if (matchesAny(importPath, clientOnlyImportPatterns)) {
        violations.push({
          file: relativeFile,
          importPath,
          reason: 'server modules must not import browser-only helpers',
        })
      }
    }
  }
}

if (violations.length > 0) {
  console.error('Module boundary audit failed:')
  for (const violation of violations) {
    console.error(`- ${violation.file}: ${violation.importPath} (${violation.reason})`)
  }
  process.exit(1)
}

console.log('Module boundary audit passed.')
