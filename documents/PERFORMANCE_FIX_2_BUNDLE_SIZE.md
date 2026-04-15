# Performance Fix #2: Frontend Bundle Optimization

## Problem
- Estimated production bundle: **~3-4MB** (uncompressed)
- Heavy 3D libraries loaded on every page
- Unoptimized images (5+ MB of PNGs)
- No code splitting for heavy features

## Solution: Aggressive Code Splitting & Asset Optimization

### 1. Dynamic Import Heavy Libraries

#### A. Lazy Load 3D Components
```typescript
// In components that use Three.js (e.g., ProductShowcase3D.tsx)
import { lazy, Suspense } from 'react';

const ThreeFiberCanvas = lazy(() => import('./ThreeFiberCanvas'));

// Use with Suspense
<Suspense fallback={<div>Loading 3D...</div>}>
  <ThreeFiberCanvas />
</Suspense>
```

#### B. Code Split Recharts
```typescript
// Instead of: import { LineChart, BarChart } from 'recharts';
const LineChart = lazy(() =>
  import('recharts').then(mod => ({ default: mod.LineChart }))
);
```

**Impact:** Reduces initial bundle by ~1.2MB (600KB gzipped)

### 2. Optimize Vite Manual Chunks

```typescript
// Update vite.config.ts manualChunks:
manualChunks: {
  vendor: ['react', 'react-dom'],
  router: ['react-router-dom'],
  ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-tabs'],

  // NEW: Split heavy libraries
  charts: ['recharts'],
  three: ['three', '@react-three/fiber', '@react-three/drei'],
  animations: ['framer-motion', '@lottiefiles/react-lottie-player'],
  markdown: ['react-markdown', 'rehype-raw', 'remark-gfm'],

  // Split Radix UI into logical groups
  'ui-forms': [
    '@radix-ui/react-form',
    '@radix-ui/react-checkbox',
    '@radix-ui/react-radio-group',
    '@radix-ui/react-select',
    '@radix-ui/react-slider',
    '@radix-ui/react-switch',
  ],
  'ui-feedback': [
    '@radix-ui/react-toast',
    '@radix-ui/react-alert-dialog',
    '@radix-ui/react-progress',
  ],
}
```

**Impact:** Better caching, only load what's needed per route

### 3. Convert Images to WebP/AVIF

```bash
# Install sharp for image optimization
npm install -D sharp

# Create optimization script
node scripts/optimize-images.js
```

```javascript
// scripts/optimize-images.js
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const images = [
  'public/splash.png',
  'public/Cover.png',
  'public/Palette.png',
  'public/Logo-Green.png',
];

images.forEach(async (img) => {
  const name = path.parse(img).name;

  // Convert to WebP (better browser support)
  await sharp(img)
    .webp({ quality: 85 })
    .toFile(`public/${name}.webp`);

  // Convert to AVIF (best compression, modern browsers)
  await sharp(img)
    .avif({ quality: 80 })
    .toFile(`public/${name}.avif`);

  console.log(`✓ Optimized ${img}`);
});
```

**Expected Results:**
```
splash.png:  1.9 MB → splash.webp: 150 KB  (92% reduction)
Cover.png:   1.9 MB → Cover.webp: 180 KB   (90% reduction)
Palette.png: 1.3 MB → Palette.webp: 95 KB  (93% reduction)
```

### 4. Use Picture Element for Responsive Images

```tsx
// In components using images:
<picture>
  <source srcSet="/splash.avif" type="image/avif" />
  <source srcSet="/splash.webp" type="image/webp" />
  <img src="/splash.png" alt="Splash" loading="lazy" />
</picture>
```

### 5. Add Preload Hints in index.html

```html
<!-- Add to <head> in index.html -->
<link rel="preconnect" href="https://your-supabase-url.supabase.co" />
<link rel="dns-prefetch" href="https://your-supabase-url.supabase.co" />

<!-- Preload critical CSS -->
<link rel="preload" as="style" href="/src/index.css" />

<!-- Preload critical fonts if using custom fonts -->
<link rel="preload" as="font" type="font/woff2" href="/fonts/inter.woff2" crossorigin />
```

### 6. Enable Brotli Compression in Cloudflare

```toml
# Add to wrangler.toml
[build]
command = "npm run build"

[[build.upload.rules]]
type = "CompiledWasm"
globs = ["**/*.wasm"]

# Ensure compression is enabled
[site]
bucket = "./dist"
```

### 7. Implement Route-Based Prefetching

```typescript
// Add to vite.config.ts
build: {
  modulePreload: {
    polyfill: true,
    resolveDependencies: (url, deps) => {
      // Preload dependencies for better performance
      return deps;
    }
  }
}
```

## Expected Performance Gains

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Initial bundle (gzipped) | ~1.2-1.5 MB | ~400-600 KB | **60% smaller** |
| Image payload | 7.3 MB | ~1 MB | **86% smaller** |
| First Contentful Paint | 2.5s | 1.2s | **52% faster** |
| Time to Interactive | 4.5s | 2.0s | **56% faster** |
| Lighthouse Score | 60-70 | 85-95 | **+25 points** |

## Bundle Analysis

Run this to visualize bundle sizes:
```bash
npm install -D rollup-plugin-visualizer

# Add to vite.config.ts plugins:
import { visualizer } from 'rollup-plugin-visualizer';

plugins: [
  // ... other plugins
  mode === 'production' && visualizer({
    filename: './dist/stats.html',
    open: true,
    gzipSize: true,
    brotliSize: true,
  })
]

# Then build and check stats.html
npm run build
```

## Implementation Priority: 🔴 **CRITICAL**

1. Implement #3 (image optimization) - **Immediate 5+ MB savings**
2. Implement #1 (lazy load 3D/charts) - **600KB+ savings**
3. Implement #2 (optimize chunks) - **Better caching**
4. Implement #4-7 (progressive enhancements)

## Quick Win Commands

```bash
# 1. Optimize images immediately
npm install -D sharp
node scripts/optimize-images.js

# 2. Analyze current bundle
npm install -D rollup-plugin-visualizer
npm run build

# 3. Check bundle sizes
ls -lh dist/assets/js/*.js
```
