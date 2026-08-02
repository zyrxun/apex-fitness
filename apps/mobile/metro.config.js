// Metro in an npm-workspaces monorepo.
//
// `@apex/shared` is a *source-level* workspace package: its package.json points
// `exports` straight at `./src/index.ts`, so Metro has to (a) watch a folder
// outside apps/mobile and (b) be willing to resolve a `.ts` entry point. Both
// are handled below; without them the import fails at bundle time rather than
// at typecheck time, which is exactly the failure mode ADR 0001 task 1 exists
// to rule out.
//
// https://docs.expo.dev/guides/monorepos/

const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch the whole workspace so edits in packages/shared trigger a rebuild.
config.watchFolders = [workspaceRoot];

// 2. Resolve modules from the app first, then from the hoisted root store.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Honour the "exports" field so `@apex/shared` resolves to its TS source,
//    and make sure Metro will actually take a `.ts` file as a package entry.
config.resolver.unstable_enablePackageExports = true;
config.resolver.sourceExts = Array.from(new Set([...config.resolver.sourceExts, 'ts', 'tsx']));

// 4. `packages/*` is written for Node ESM, where relative imports must carry a
//    `.js` extension even though the file on disk is `.ts` — `export * from
//    './enums.js'`. tsc and Vite both understand that convention; Metro does
//    not, and fails with "Unable to resolve module ./enums.js". Strip the
//    extension, but only for imports *originating inside the workspace
//    packages*, so app code is still held to Metro's own rules.
const packagesDir = path.join(workspaceRoot, 'packages') + path.sep;
const JS_EXT = /\.(?:c|m)?js$/;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const fromPackages = context.originModulePath?.startsWith(packagesDir) ?? false;
  if (fromPackages && moduleName.startsWith('.') && JS_EXT.test(moduleName)) {
    return context.resolveRequest(context, moduleName.replace(JS_EXT, ''), platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
