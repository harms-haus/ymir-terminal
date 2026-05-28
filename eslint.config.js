const tsEslint = require("typescript-eslint");
const reactPlugin = require("eslint-plugin-react");
const reactHooksPlugin = require("eslint-plugin-react-hooks");
const prettierConfig = require("eslint-config-prettier");

module.exports = [
  // Global ignores
  {
    ignores: [
      "node_modules",
      "dist",
      ".output",
      "eslint.config.js",
      "**/routeTree.gen.ts",
      "bun.lock",
    ],
  },

  // Base: typescript-eslint recommended
  ...tsEslint.configs.recommended,

  // React config for client app
  {
    files: ["apps/client/**"],
    ...reactPlugin.configs.flat.recommended,
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      ...reactPlugin.configs.flat.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",
    },
  },
  {
    files: ["apps/client/**"],
    ...reactHooksPlugin.configs.flat.recommended,
  },

  // Prettier – must be last to disable conflicting formatting rules
  prettierConfig,
];
