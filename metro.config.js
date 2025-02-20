const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const defaultAssetExts = require('metro-config/src/defaults/defaults').assetExts

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
    // We need to make sure that only one version is loaded for peerDependencies
    // So we block them at the root, and alias them to the versions in example's node_modules
    resolver: {
      assetExts: [
        ...defaultAssetExts,
        'bin', // ggml model binary
        'mil', // CoreML model asset
      ],
    },
  
  }
  

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
