import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'

export default defineConfig([
  ...nextVitals,
  {
    rules: {
      'react/no-unescaped-entities': 'off',
      // React Compiler rules — disabled until codebase is incrementally migrated
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/no-components-in-render': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/rules-of-hooks': 'warn',
    },
  },
  globalIgnores([
    // Agent worktrees are inside the repo, so eslint walks into them and lints a
    // second copy of everything against the wrong tree — 147 of 208 warnings came
    // from there once. Same reason `.claude/` is ignored in jest.config.js.
    '.claude/**',
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'reports/**',
    'next-env.d.ts',
  ]),
])
