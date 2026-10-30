import english from '@/locales/en'

/** The English bundle as `t`, with {{var}} interpolation; throws on a key the bundle lacks. */
export function englishT(key: string, vars?: Record<string, unknown> | string): string {
  const raw = key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], english)
  if (typeof raw !== 'string') throw new Error(`missing locale key ${key}`)
  if (!vars || typeof vars === 'string') return raw
  return raw.replace(/\{\{(\w+)\}\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole))
}
