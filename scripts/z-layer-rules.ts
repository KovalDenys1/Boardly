/**
 * The z-index rule of scripts/audit-design-tokens.ts (#1556), free of side effects so the tests can import it.
 *
 * Anything that stacks above the page takes a layer from the scale in app/globals.css (`z-header` ...
 * `z-celebration`, or `var(--z-index-<layer>)`). A number up to LOCAL_MAX only orders siblings inside
 * one component and is allowed; anything above it, or an arbitrary value, is refused.
 */

export const LOCAL_MAX = 10

/** The layers declared as `--z-index-<name>: <n>;` in globals.css, in source order. */
export function zLayers(globalsCss: string): Map<string, number> {
  return new Map([...globalsCss.matchAll(/--z-index-([a-z]+):\s*(\d+);/g)].map((m) => [m[1], Number(m[2])]))
}

const Z_CLASS = /(?<![\w-])!?(?:[a-z0-9-]+:)*!?-?z-(\d+|\[[^\]\s]*\]|\([^)\s]*\))!?(?![\w-])/g
const Z_STYLE = /(?<![\w-])(?:zIndex|z-index)\s*:\s*['"`]?(-?\d+)\b/g

/** 1-based lines that set a z-index off the scale. */
export function zIndexLines(src: string): number[] {
  const hits: number[] = []
  src.split('\n').forEach((line, i) => {
    const values = [...line.matchAll(Z_CLASS), ...line.matchAll(Z_STYLE)].map((m) => m[1])
    if (values.some((value) => !/^-?\d+$/.test(value) || Math.abs(Number(value)) > LOCAL_MAX)) hits.push(i + 1)
  })
  return hits
}
