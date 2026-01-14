// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Find the project and workspace directories
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo
config.watchFolders = [monorepoRoot];

// 2. Let Metro know where to resolve packages and in what order
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// 3. Disable hierarchical lookup to work with pnpm symlinks
// Note: Set to false to allow pnpm's symlinked structure to work
config.resolver.disableHierarchicalLookup = false;

// 4. Enable symlinks for pnpm
config.resolver.unstable_enableSymlinks = true;

// 5. Ensure pnpm .pnpm folder is resolved correctly
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
