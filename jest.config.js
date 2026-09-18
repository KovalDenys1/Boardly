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
