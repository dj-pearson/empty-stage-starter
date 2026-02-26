import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  optimizeDeps: {
    exclude: [
      'react-native',
      'expo',
      'expo-router',
      'expo-camera',
      'expo-image-picker',
      'expo-secure-store',
      'expo-file-system',
      'expo-linking',
      'expo-constants',
      'expo-splash-screen',
      'expo-status-bar',
      'react-native-safe-area-context',
      'react-native-screens',
    ],
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    // Add Sentry plugin for production builds
    mode === "production" && sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      sourcemaps: {
        assets: "./dist/**",
      },
      telemetry: false,
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Optimize for Cloudflare Pages
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: mode === 'development', // Only generate sourcemaps in development
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: mode === 'production', // Remove console.logs in production only
        drop_debugger: true,
      },
    },
    rollupOptions: {
      // Handle circular dependencies (common in Three.js)
      onwarn(warning, warn) {
        // Suppress circular dependency warnings for Three.js
        if (warning.code === 'CIRCULAR_DEPENDENCY' && warning.ids?.some((id: string) => id.includes('three'))) {
          return;
        }
        warn(warning);
      },
      output: {
        // Manual chunking — ONLY for always-loaded, ESM-only packages.
        //
        // IMPORTANT: Do NOT manually chunk libraries with CJS dependencies
        // (recharts/d3, tiptap/highlight.js, swagger-ui/redux, three.js,
        // react-markdown/rehype/remark, etc.). Manual chunking misplaces
        // Rollup's CJS interop helpers (getDefaultExportFromCjs) into a
        // vendor chunk, which forces the entry bundle to eagerly import
        // ALL chunks that share that helper — pulling 900KB+ of JS that
        // should be lazy-loaded, causing a blank white page.
        //
        // Vite's automatic code-splitting handles CJS interop correctly
        // and still creates separate chunks at React.lazy() boundaries.
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            // React core + Radix UI (always loaded, ESM-only)
            if (id.includes('@radix-ui') ||
                /[\\/]node_modules[\\/]react[\\/]/.test(id) ||
                /[\\/]node_modules[\\/]react-dom[\\/]/.test(id) ||
                /[\\/]node_modules[\\/]react-is[\\/]/.test(id) ||
                /[\\/]node_modules[\\/]scheduler[\\/]/.test(id)) {
              return 'vendor-react';
            }
            // React Router (always loaded, ESM-only)
            if (id.includes('react-router')) {
              return 'vendor-router';
            }
            // Sentry — keep ALL @sentry modules together to avoid TDZ errors
            if (id.includes('@sentry')) {
              return 'vendor-sentry';
            }
            // Supabase client (loaded early, ESM-only)
            if (id.includes('@supabase')) {
              return 'vendor-supabase';
            }
            // TanStack Query (data fetching, ESM-only)
            if (id.includes('@tanstack')) {
              return 'vendor-query';
            }
            // Everything else: let Vite/Rollup auto-chunk.
            // This includes recharts, tiptap, swagger-ui, three.js,
            // react-markdown, framer-motion, gsap, dnd-kit, etc.
            // Vite still code-splits at dynamic import() boundaries.
          }
        },
        // Consistent naming for better caching
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (!assetInfo.name) return 'assets/[name]-[hash][extname]';
          const info = assetInfo.name.split('.');
          const ext = info[info.length - 1];
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
            return `assets/images/[name]-[hash][extname]`;
          }
          if (/woff2?|eot|ttf|otf/i.test(ext)) {
            return `assets/fonts/[name]-[hash][extname]`;
          }
          return `assets/[ext]/[name]-[hash][extname]`;
        },
      },
      // External dependencies that should not be bundled (mobile packages for web build)
      external: [
        'react-native',
        'expo',
        'expo-router',
        'expo-camera',
        'expo-image-picker',
        'expo-secure-store',
        'expo-file-system',
        'expo-linking',
        'expo-constants',
        'expo-splash-screen',
        'expo-status-bar',
        'react-native-safe-area-context',
        'react-native-screens',
      ],
    },
    // Chunk size warning limit (reduced to encourage better code splitting)
    chunkSizeWarningLimit: 500,
  },
  // Preview server configuration for local development
  preview: {
    port: 3000,
    host: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
    testTimeout: 10000, // Increase test timeout to 10 seconds
    hookTimeout: 10000, // Increase hook timeout to 10 seconds
  },
}));
