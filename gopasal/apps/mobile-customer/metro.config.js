// Metro, told about the monorepo.
//
// The app lives in `apps/mobile-customer` but imports `@gopasal/tokens`,
// `@gopasal/native-ui` and `@gopasal/api-client` from `packages/*`, and pnpm
// puts the real files behind symlinks in a store at the workspace root. Without
// `watchFolders` Metro never sees edits to those packages, and without
// `nodeModulesPaths` it cannot resolve a dependency that pnpm placed at the
// workspace root rather than in the app.
//
// Hierarchical lookup stays ON, unlike the published Expo monorepo recipe. That
// recipe assumes npm or yarn, where everything is hoisted into one flat root and
// walking up the tree only turns up duplicates. pnpm is the opposite: a
// package's own dependencies live next to it under `.pnpm`, reachable only by
// walking up from the file that imports them. Disabling the walk makes
// `expo-router`'s own `@expo/metro-runtime` unresolvable, which is exactly how
// the first export of this app failed.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
