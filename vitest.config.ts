import { playwright } from '@vitest/browser-playwright';
import { defineConfig, type ViteUserConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
          ],
        },
      }),
      instances: [
        {
          browser: 'chromium',
        },
      ],
    },
    testTimeout: 15_000,
    reporters: ['json', 'default'],
    // fileParallelism: false,
    retry: 2,
  },
}) as ViteUserConfig;
