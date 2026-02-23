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
        // Manual chunking for better caching and smaller initial bundles
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            // React Router (separate chunk for route changes)
            if (id.includes('react-router')) {
              return 'vendor-router';
            }
            // Form libraries (only loaded on pages with forms)
            if (id.includes('react-hook-form') || id.includes('zod') || id.includes('@hookform')) {
              return 'vendor-forms';
            }
            // DON'T separate React or Radix UI - they must stay in vendor-misc
            // modulepreload causes parallel chunk loading; vendor-ui executes before vendor-misc
            // Keeping React and Radix together ensures React initializes before Radix uses it
            // Supabase (database operations)
            if (id.includes('@supabase')) {
              return 'vendor-supabase';
            }
            // Drag and drop (only on planner page)
            if (id.includes('@dnd-kit')) {
              return 'vendor-dnd';
            }
            // Animation libraries (can be lazy loaded)
            if (id.includes('framer-motion')) {
              return 'vendor-animation';
            }
            // GSAP (lazy loaded on pages with scroll animations)
            if (id.includes('gsap')) {
              return 'vendor-gsap';
            }
            // Sentry (error tracking - keep together to avoid circular dependencies)
            // DO NOT split sentry and sentry-replay - causes TDZ errors in production
            if (id.includes('@sentry')) {
              return 'vendor-sentry';
            }
            // TipTap editor (only loaded on blog/CMS pages)
            if (id.includes('@tiptap') || id.includes('prosemirror') || id.includes('lowlight')) {
              return 'vendor-tiptap';
            }
            // 3D graphics - Let Vite handle automatic chunking through lazy imports
            // Manual chunking causes circular dependency issues with Three.js
            // Charts (only on analytics pages)
            if (id.includes('recharts')) {
              return 'vendor-charts';
            }
            // Markdown (only on blog)
            if (id.includes('react-markdown') || id.includes('rehype') || id.includes('remark')) {
              return 'vendor-markdown';
            }
            // TanStack Query (data fetching)
            if (id.includes('@tanstack')) {
              return 'vendor-query';
            }
            // Utilities (small, can bundle together)
            if (id.includes('clsx') || id.includes('tailwind-merge') || id.includes('date-fns')) {
              return 'vendor-utils';
            }
            // Everything else (React, Radix UI, etc.)
            return 'vendor-misc';
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
