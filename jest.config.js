const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
  // #758 guard: restart workers that grow past this between test files, so a
  // future per-suite leak degrades to a slow run instead of a heap OOM.
  // Ignored by --runInBand (no workers there).
  workerIdleMemoryLimit: '1GB',
  // Jest's default is one worker per core bar one — eleven on this machine, each
  // a full node process holding the module graph. That is already most of the
  // RAM on a 16 GB Mac, and with several agents running suites at once it swaps
  // and the whole desktop stutters. `npm test` passes --runInBand and overrides
  // this; the cap is here so a bare `npx jest` is polite too. Raise it with
  // `--maxWorkers` for a one-off run on an idle machine.
  maxWorkers: 3,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: [
    'lib/**/*.{js,ts}',
    '!lib/**/*.d.ts',
    '!lib/logger.ts',
    '!lib/env.ts',
    '!lib/db.ts',
  ],
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
    // Agent worktrees live inside the repo, so jest walks into them and runs a
    // second copy of every suite against the wrong tree — 1306 suites instead of
    // 215, and the failures look like yours.
    '<rootDir>/.claude/',
    // Playwright specs, run by `npm run test:e2e` against a real server and a
    // real Supabase project. Jest would match them by filename and fail.
    '<rootDir>/e2e/',
    // Test data shared by several suites. testMatch takes everything under
    // __tests__, so without this a fixture is loaded as a suite of its own and
    // fails with "must contain at least one test".
    '<rootDir>/__tests__/fixtures/',
  ],
  modulePathIgnorePatterns: [
    '<rootDir>/.next/standalone/',
  ],
  watchPathIgnorePatterns: [
    '<rootDir>/.next/',
  ],
  transformIgnorePatterns: [
    '/node_modules/(?!(nanoid)/)',
    '^.+\\.module\\.(css|sass|scss)$',
  ],
  coverageThreshold: {
    global: {
      branches: 45,
      functions: 45,
      lines: 45,
      statements: 45,
    },
  },
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)
