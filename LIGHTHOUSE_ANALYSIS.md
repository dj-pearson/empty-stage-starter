# Lighthouse Performance Analysis

**Date**: 2026-01-02
**URL Tested**: http://localhost:8080 (development server)

## Summary Scores

| Category | Score |
|----------|-------|
| Performance | 41 |
| Accessibility | 91 |
| Best Practices | 92 |
| SEO | 100 |

## Core Web Vitals

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| First Contentful Paint (FCP) | 15.4s | <1.8s | FAIL |
| Largest Contentful Paint (LCP) | 41.3s | <2.5s | FAIL |
| Total Blocking Time (TBT) | 570ms | <200ms | FAIL |
| Cumulative Layout Shift (CLS) | 0 | <0.1 | PASS |
| Speed Index | 18.7s | <3.4s | FAIL |
| Time to Interactive (TTI) | 42.5s | <3.8s | FAIL |

## Critical Issues Identified

### 1. Excessive JavaScript Bundle Size (7,320 KiB total)

**Unused JavaScript**: Est. savings of 2,148 KiB

| Library | Total Size | Wasted | % Unused |
|---------|------------|--------|----------|
| @sentry/react + rrweb | 889 KB | 773 KB | 87% |
| framer-motion | 386 KB | 268 KB | 69% |
| @supabase/supabase-js | 341 KB | 253 KB | 74% |
| react-router-dom | 209 KB | 161 KB | 77% |
| @tanstack/react-query | 109 KB | 97 KB | 89% |
| GSAP core | 169 KB | 68 KB | 40% |
| GSAP ScrollTrigger | 106 KB | 54 KB | 51% |
| lucide-react | 871 KB | 25 KB | 3% |

### 2. Main Thread Work (5.4s)

| File | Total Time | Script Time |
|------|------------|-------------|
| React DOM chunk | 2437ms | 1649ms |
| GSAP core | 646ms | 247ms |
| GSAP ScrollTrigger | 407ms | 64ms |

### 3. Console Errors (Network failures)

- Failed to load Google Fonts: `net::ERR_NAME_NOT_RESOLVED`
- Failed to load Google Tag Manager: `net::ERR_TUNNEL_CONNECTION_FAILED`

### 4. Accessibility Issues

- Color contrast insufficient
- Missing main landmark (`<main>`)
- Touch targets too small
- Label content name mismatch

### 5. Other Issues

- Images without explicit width/height
- Back/forward cache disabled (1 failure reason)
- Unminified JavaScript (dev mode - est savings 2,738 KiB)

## Recommended Fixes

### Priority 1: JavaScript Optimization

1. **Lazy load Sentry replay** - Only load rrweb when needed
2. **Dynamic import framer-motion** - Load on component interaction
3. **Tree-shake lucide-react** - Import only used icons
4. **Lazy load GSAP/ScrollTrigger** - Load on scroll-triggered pages only

### Priority 2: Network Error Handling

1. **Add font loading fallbacks** - Use `font-display: swap`
2. **Conditional analytics loading** - Check for network before loading GTM

### Priority 3: Accessibility

1. **Add `<main>` landmark** to page layouts
2. **Improve color contrast** in UI components
3. **Add explicit image dimensions**

## Files to Modify

- `src/lib/sentry.tsx` - Lazy load replay
- `src/main.tsx` - Dynamic imports
- `src/components/` - Tree-shake icons
- `index.html` - Font loading optimization
- `src/App.tsx` - Add main landmark

---

## Fixes Implemented (2026-01-02)

### 1. Sentry Replay Lazy Loading
- **File**: `src/lib/sentry.tsx`, `src/main.tsx`
- **Change**: Removed eager loading of `replayIntegration` from initial Sentry config
- **New**: Added `lazyLoadReplay()` function that dynamically imports replay only on error
- **Impact**: ~770KB savings from initial bundle (replay now in separate `vendor-sentry-replay` chunk)

### 2. Improved Vite Chunking
- **File**: `vite.config.ts`
- **Change**: Added separate chunks for Sentry, GSAP, and verified framer-motion chunking
- **New Chunks**:
  - `vendor-sentry`: 43KB (core error tracking)
  - `vendor-sentry-replay`: 122KB (loaded only on error)
  - `vendor-gsap`: 149KB (loaded on scroll-animated pages)
  - `vendor-animation`: 80KB (framer-motion, lazy loaded)

### 3. Google Fonts Error Handling
- **File**: `index.html`
- **Change**: Added CSS custom properties with system font fallbacks
- **New**: `onerror` handler on font link, `.fonts-loaded` class for progressive enhancement
- **Impact**: Page renders immediately with system fonts, no FOIT

### 4. Accessibility: Main Landmark
- **File**: `src/pages/Landing.tsx`
- **Change**: Added `<main id="main" role="main">` wrapper around page content
- **New**: Skip-to-content link for keyboard navigation
- **Impact**: Fixes "Document does not have a main landmark" audit

### Build Output Summary
| Chunk | Size (gzip) | Loading |
|-------|-------------|---------|
| index (entry) | 13KB | Immediate |
| vendor-misc (React, UI) | 1.3MB | Immediate |
| vendor-sentry | 15KB | Immediate |
| vendor-sentry-replay | 38KB | On error |
| vendor-gsap | 57KB | Lazy |
| vendor-animation | 25KB | Lazy |
| Landing page | 10KB | Lazy |
