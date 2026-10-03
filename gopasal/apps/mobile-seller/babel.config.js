// Reanimated's worklets plugin must be LAST in the plugin list — it rewrites
// functions marked as worklets into code the UI thread can run, and any plugin
// after it would transform output it no longer recognises.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: ["react-native-worklets/plugin"],
  };
};
