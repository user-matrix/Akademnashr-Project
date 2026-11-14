import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base is required: Capacitor serves the bundle from the app package, not from "/".
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 8192,
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
