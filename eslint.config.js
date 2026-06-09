const tsEslint = require("typescript-eslint");
const reactPlugin = require("eslint-plugin-react");
const reactHooksPlugin = require("eslint-plugin-react-hooks");
const prettierConfig = require("eslint-config-prettier");

module.exports = [
  // Global ignores
  {
    ignores: [
      "node_modules",
      "**/dist",
      ".output",
      "eslint.config.js",
      "**/routeTree.gen.ts",
      "bun.lock",
      "src-tauri/target/",
      "src-tauri/gen/",
      "packages/npm/",
      "packages/shared/src/**/*.js",
      "packages/shared/src/**/*.d.ts",
      "apps/client/public/monaco/",
    ],
  },

  // Base: typescript-eslint recommended
  ...tsEslint.configs.recommended,

  // Allow _-prefixed unused vars (standard convention for intentionally
  // unused parameters in callbacks, mocks, and destructuring)
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },

  // Allow console.log in CLI scripts and server entry points
  {
    files: ["apps/cli/src/**/*.ts", "scripts/**/*.ts"],
    rules: { "no-console": "off" },
  },
  {
    files: ["apps/server/src/index.ts", "apps/server/src/server.ts"],
    rules: { "no-console": "off" },
  },

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
