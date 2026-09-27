import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // Match the .ts/.tsx sources only. Without this, a stray emitted .js
      // sitting next to a test gets collected too and the suite runs twice.
      include: ['tests/**/*.{test,spec}.{ts,tsx}'],
      environment: 'node',
    },
  }),
)
