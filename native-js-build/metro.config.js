const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  resolver: {
    // Only resolve .js files, not .ts or .tsx
    sourceExts: ['js', 'json', 'jsx'],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
