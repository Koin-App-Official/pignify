module.exports = function (api) {
  api.cache.using(() => process.env.NODE_ENV);
  const isProduction = process.env.NODE_ENV === "production";
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      [
        "module-resolver",
        {
          root: ["."],
          alias: {
            "@": "./src",
            "react-native-worklets": "./node_modules/react-native-worklets",
          },
        },
      ],
      "react-native-worklets/plugin",
      // Strip console.log/debug/info from production bundles (console calls
      // are a documented JS-thread cost); keep error/warn for diagnostics.
      isProduction && ["transform-remove-console", { exclude: ["error", "warn"] }],
    ].filter(Boolean),
  };
};
