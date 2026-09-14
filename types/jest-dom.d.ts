// jest.setup.js requires @testing-library/jest-dom at runtime, but it is a .js
// file, so TypeScript never saw the matcher augmentation and every
// toBeInTheDocument / toHaveAttribute in a test failed typecheck. That is what
// the // @ts-nocheck at the top of __tests__/app/alias-page.test.tsx is working
// around. Importing it here registers the matchers for the whole project.
import '@testing-library/jest-dom'
