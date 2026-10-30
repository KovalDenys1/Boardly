import en from '@/locales/en'

/**
 * `t` as a player reading English sees it: the value from locales/en.ts with
 * `{{name}}` filled in, and `<key>_other` for a count other than one. Throws on a
 * key the bundle lacks.
 */
export function englishT(key: string, vars?: Record<string, unknown> | string): string {
  const values = typeof vars === 'object' && vars !== null ? vars : {}
  const lookup = (path: string): unknown =>
    path.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en)
  const plural = typeof values.count === 'number' && values.count !== 1 ? lookup(`${key}_other`) : undefined
  const template = typeof plural === 'string' ? plural : lookup(key)
  if (typeof template !== 'string') throw new Error(`missing locale key ${key}`)
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, name: string) => (name in values ? String(values[name]) : whole))
}
