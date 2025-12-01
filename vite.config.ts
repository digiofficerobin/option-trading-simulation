import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'happy-dom', // or 'node' for pure domain tests
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
      exclude: [
        'node_modules/',
        '.next/',
        '**/*.d.ts',
        '**/vite.config.ts',
        '**/vitest.setup.ts',
      ],
    },
  },
  resolve: {
    alias: {
      // Mirror your tsconfig.json "paths"
      '@': path.resolve(__dirname, 'src'),
    },
  },
  esbuild: {
    jsxInject: `import React from 'react'`,
  },
});
