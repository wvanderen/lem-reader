import js from "@eslint/js";
import babelParser from "@babel/eslint-parser";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import jsxA11yPlugin from "eslint-plugin-jsx-a11y";
import globals from "globals";

// Flat config (ESLint >=9).
//
// PARSER NOTE (Rule 3 deviation — locked-stack conflict):
//   STACK.md pins TypeScript 7.0.2 AND lists @typescript-eslint/*. However,
//   @typescript-eslint/parser and @typescript-eslint/eslint-plugin v8 both
//   hard-throw at module load when TS 7.x is installed (upstream tracking:
//   typescript-eslint/typescript-eslint#10940). Until upstream ships TS 7
//   support, we parse TS/TSX with @babel/eslint-parser (Babel's TS strip is
//   independent of the TS compiler API and is TS-7-compatible) and rely on
//   @babel/preset-typescript + @babel/preset-react for syntax.
//
//   The packages @typescript-eslint/* remain in devDependencies (stack-listed)
//   so they activate the moment upstream ships TS 7 support; only the active
//   flat-config import is omitted (importing them throws today).
//
// SECURITY GUARANTEES PRESERVED:
//   REQUIRED: eslint-plugin-react supplies the `react/no-danger` rule
//   (Pitfall 6 — stored-XSS via dangerouslySetInnerHTML) and
//   `react/jsx-no-target-blank` (reverse-tabnabbing guard). These silently
//   no-op without the plugin registration below, so the registration is a
//   BLOCKER, not a nicety.
export default [
  {
    ignores: ["dist", "node_modules", "playwright-report"],
  },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: ["@babel/preset-typescript", ["@babel/preset-react", { runtime: "automatic" }]],
        },
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2022,
        sourceType: "module",
      },
      // src/ uses browser globals (document, window); root configs use node globals (process).
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
      "jsx-a11y": jsxA11yPlugin,
    },
    rules: {
      // Pitfall 6: stored XSS via dangerouslySetInnerHTML — forbid statically.
      "react/no-danger": "error",
      // Reverse-tabnabbing guard.
      "react/jsx-no-target-blank": "error",
      // Mark JSX-referenced identifiers as used (prevents no-unused-vars false positives
      // like <StrictMode> or <App> being flagged as unused).
      "react/jsx-uses-react": "error",
      "react/jsx-uses-vars": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      // jsx-a11y recommended ruleset (anchor-has-href, heading-level, list, etc.)
      "jsx-a11y/anchor-has-content": "error",
      "jsx-a11y/anchor-is-valid": "error",
      "jsx-a11y/heading-has-content": "error",
      "jsx-a11y/html-has-lang": "error",
      "jsx-a11y/lang": "error",
      "jsx-a11y/no-autofocus": "error",
      "jsx-a11y/scope": "error",
      "jsx-a11y/tabindex-no-positive": "error",
      // DISABLED: ESLint core `no-unused-vars` cannot see type-position usage
      // when parsing TS via Babel (it false-positives on every `import type`
      // binding used only in annotations). tsc is the authority — tsconfig.json
      // sets `noUnusedLocals` + `noUnusedParameters`, which correctly handles
      // type-only imports. (The @typescript-eslint/no-unused-vars rule would
      // also handle this, but it throws on TS 7 — see parser note above.)
      "no-unused-vars": "off",
      // DISABLED for TS: ESLint core `no-undef` does not understand TypeScript
      // type aliases, z.infer, `as const`, or namespace qualifiers — it flags
      // every type-level identifier as undefined. tsc is the authority for
      // undefined-reference checking in TS files (the @typescript-eslint
      // recommended config disables no-undef for the same reason). We keep it
      // off project-wide since all source is .ts/.tsx and tsc covers it.
      "no-undef": "off",
    },
  },
];
