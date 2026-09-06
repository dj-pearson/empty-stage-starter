import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    /**
     * The 5s default was making this suite a coin toss.
     *
     * Measured over five consecutive full runs with no code change between
     * some of them: 7, 10, 12, 13 and 15 failures, a different set each time.
     * Of the 15 in the last one, 12 were "Test timed out in 5000ms" and every
     * single one passed when its file was run alone. The suite has tests that
     * legitimately take seconds -- walking src/, running real scripts in
     * throwaway git repos, rendering a 1400-line settings page -- and on a
     * loaded machine they cross 5s and fail for no reason a reader can act on.
     *
     * A gate that reports a different answer each run is worse than a slow
     * one: it trains people to rerun until it is green. 20s is about 4x the
     * slowest legitimate test observed (4.9s), so a genuine hang still fails.
     * hookTimeout is separate and was also being hit -- rewriteHistory's
     * beforeAll runs git filter-branch over synthetic repos.
     */
    testTimeout: 20_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
        'dist/',
        'build/',
        'src/integrations/supabase/types.ts',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 65,
        statements: 70,
      },
    },
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      'node_modules',
      'dist',
      'build',
      '.idea',
      '.git',
      '.cache',
      'tests/**/*', // Exclude Playwright E2E tests
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
