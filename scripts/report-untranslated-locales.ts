import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { availableLocales, defaultLocale, locales } from '../locales'

type LocaleTree = Record<string, unknown>

function isRecord(value: unknown): value is LocaleTree {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function flattenLeaves(node: LocaleTree, prefix = ''): Map<string, unknown> {
  const leaves = new Map<string, unknown>()

  for (const [key, value] of Object.entries(node)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (isRecord(value)) {
      const nested = flattenLeaves(value, fullKey)
      for (const [nestedKey, nestedValue] of nested.entries()) {
        leaves.set(nestedKey, nestedValue)
      }
      continue
    }
    leaves.set(fullKey, value)
  }

  return leaves
}

function getUntranslatedKeys(
  source: Map<string, unknown>,
  target: Map<string, unknown>
): string[] {
  const untranslated: string[] = []

  for (const [key, sourceValue] of source.entries()) {
    const targetValue = target.get(key)
    if (typeof sourceValue === 'string' && typeof targetValue === 'string' && sourceValue === targetValue) {
      untranslated.push(key)
    }
  }

  return untranslated.sort((a, b) => a.localeCompare(b))
}

const baseLocale = locales[defaultLocale] as unknown as LocaleTree
const baseLeaves = flattenLeaves(baseLocale)
const localesToAudit = availableLocales.filter((locale) => locale !== defaultLocale)
const generatedAt = new Date().toISOString()

const lines: string[] = [
  '# Locale Translation TODO',
  '',
  `Generated: ${generatedAt}`,
  `Base locale: \`${defaultLocale}\``,
  '',
  'This file lists keys where locale value is identical to English and likely needs translation.',
  '',
]

for (const locale of localesToAudit) {
  const targetLocale = locales[locale] as unknown as LocaleTree
  const targetLeaves = flattenLeaves(targetLocale)
  const untranslated = getUntranslatedKeys(baseLeaves, targetLeaves)
  const translatedCount = baseLeaves.size - untranslated.length
  const translatedPct = ((translatedCount / baseLeaves.size) * 100).toFixed(1)

  lines.push(`## ${locale}`)
  lines.push('')
  lines.push(`- Total keys: ${baseLeaves.size}`)
  lines.push(`- Translated keys: ${translatedCount} (${translatedPct}%)`)
  lines.push(`- Keys still equal to EN: ${untranslated.length}`)
  lines.push('')

  if (untranslated.length === 0) {
    lines.push('All keys are translated.')
    lines.push('')
    continue
  }

  for (const key of untranslated) {
    lines.push(`- \`${key}\``)
  }
  lines.push('')
}

const outputPath = resolve(process.cwd(), 'docs/LOCALE_TRANSLATION_TODO.md')
writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8')

console.log(`Generated ${outputPath}`)
