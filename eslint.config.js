import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/", "**/node_modules/", "apps/web/public/", "**/test-results/"],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
    languageOptions: { globals: globals.browser },
  },
  {
    // The lesson engine and pack format must stay free of screen and
    // platform code so that other apps (for example a phone app) can reuse them.
    files: ["packages/**/*.ts"],
    rules: {
      "no-restricted-globals": ["error", "window", "document", "navigator", "localStorage"],
      "no-restricted-imports": [
        "error",
        { patterns: ["react", "react-dom", "react/*", "node:*", "vite", "vite/*"] },
      ],
    },
  },
  {
    files: ["tools/**/*.ts", "*.config.{js,ts}", "apps/web/*.config.ts"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["**/*.test.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
