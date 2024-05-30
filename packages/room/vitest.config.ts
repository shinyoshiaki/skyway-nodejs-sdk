import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      all: true,
      include: ['src/**/*.ts', '../../node_modules/msc-node'],
    },
    // maxConcurrency: 1,
    testTimeout: 60_000 * 2,
  },
});
