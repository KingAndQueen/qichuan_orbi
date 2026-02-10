import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.tsx'],
    globals: true,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'html'],
      include: ['**/*.{ts,tsx}'],
      exclude: [
        'next.config.mjs',
        'tailwind.config.ts',
        'postcss.config.cjs',
      ],
    },
    alias: {
      '@': __dirname,
    },
  }
})
