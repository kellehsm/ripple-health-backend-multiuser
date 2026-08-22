// wasm asset support + COOP/COEP headers are required for expo-sqlite on web.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push("wasm");

// expo-secure-store has no web implementation — alias to a localStorage shim.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && moduleName === "expo-secure-store") {
    return {
      type: "sourceFile",
      filePath: require.resolve("./src/lib/secureStore.web.stub.ts"),
    };
  }
  if (
    platform === "web" &&
    (moduleName === "../../lib/resolve" || moduleName === "../lib/resolve") &&
    context.originModulePath &&
    context.originModulePath.includes("react-native-svg")
  ) {
    return {
      type: "sourceFile",
      filePath: require.resolve("./src/lib/rn-svg-resolve.web.stub.js"),
    };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

config.server = config.server ?? {};
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  middleware(req, res, next);
};

module.exports = config;
