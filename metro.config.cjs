const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Add path aliases to match existing tsconfig paths
config.resolver.alias = {
  '@': path.resolve(__dirname, 'src'),
};

// Support platform-specific extensions
// .expo.tsx will be prioritized over .tsx for mobile
config.resolver.sourceExts = [
  'expo.tsx',
  'expo.ts', 
  'expo.js',
  'tsx',
  'ts',
  'js',
  'json'
];

// Exclude web-only code from mobile bundles if needed
// Uncomment if you want to prevent certain files from being bundled on mobile
// config.resolver.blacklistRE = /(\/src\/pages\/)|(\/src\/App\.tsx$)/;

module.exports = config;

