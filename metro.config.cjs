/**
 * Metro Configuration for EatPal Mobile
 *
 * This config is ONLY used for mobile builds (iOS/Android) via Expo/React Native.
 * The web app uses Vite (vite.config.ts) and is completely isolated.
 *
 * Isolation strategy:
 * - Mobile uses Metro bundler (this config) → bundles from app/ + src/ (shared logic)
 * - Web uses Vite bundler (vite.config.ts) → bundles from src/ only
 * - Web-only packages are excluded from mobile bundles via blockList
 * - Mobile-only packages are excluded from Vite via vite.config.ts externals
 */
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// ─── Path Aliases ────────────────────────────────────────────
// Match tsconfig.json paths so shared code in src/ resolves correctly
config.resolver.alias = {
  '@': path.resolve(__dirname, 'src'),
};

// ─── Platform Extensions ─────────────────────────────────────
// .expo.tsx/.native.tsx files are prioritized for mobile builds
// This allows platform-specific implementations alongside shared code
config.resolver.sourceExts = [
  'expo.tsx',
  'expo.ts',
  'expo.js',
  'native.tsx',
  'native.ts',
  'native.js',
  'tsx',
  'ts',
  'js',
  'json',
];

// ─── Build Isolation ─────────────────────────────────────────
// Exclude web-only files and dependencies from mobile bundles
// This prevents web-specific code from being bundled into the mobile app
config.resolver.blockList = [
  // Exclude web-only entry points and build files
  /src\/main\.tsx$/,
  /src\/App\.tsx$/,

  // Exclude web-only build tooling
  /vite\.config\.ts$/,
  /wrangler\.toml$/,
  /playwright\.config\.ts$/,
  /vitest\.config\.ts$/,

  // Exclude Cloudflare Pages functions
  /functions\//,

  // Exclude web-only test directories
  /tests\/e2e\//,
  /tests\/performance\//,

  // Exclude 3D/Three.js components (too heavy for mobile, use 2D alternatives)
  /src\/components\/ThreeDHeroScene/,
  /src\/components\/LazyFoodOrbit/,
  /src\/components\/BallPit3D/,

  // Exclude web-only components
  /src\/components\/PWAInstallPrompt/,
  /src\/components\/CommandPalette/,
  /src\/components\/SkipToContent/,
  /src\/components\/RouteAnnouncer/,

  // Exclude TipTap editor (web-only rich text)
  /src\/components\/blog\//,

  // Exclude SEO components (not needed on mobile)
  /src\/components\/schema\//,

  // Exclude admin dashboard (web-only)
  /src\/components\/admin\//,

  // Exclude web-only pages
  /src\/pages\//,

  // Exclude docs directory
  /docs\//,

  // Exclude scripts
  /scripts\//,
];

// ─── Asset Extensions ────────────────────────────────────────
// Support all common image and asset types
config.resolver.assetExts = [
  ...config.resolver.assetExts,
  'db',
  'sql',
];

module.exports = config;
