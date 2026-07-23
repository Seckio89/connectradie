/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'supabase'],
    // src/lib/supabase.ts THROWS at module load when these are missing, so any
    // test that transitively imports it dies at collection time. That made the
    // suite depend on a developer's local .env: it passed here and failed in CI,
    // where two whole test files (73 tests) never even loaded.
    //
    // These are deliberately dummy values pointing at localhost. Tests must
    // never be able to reach the real project — without this, a stray query in
    // a test would run against PRODUCTION using the real anon key.
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key-not-a-real-credential',
    },
  },
});
