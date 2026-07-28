# Phase 01 — Deferred Items (out-of-scope discoveries)

Logged during plan 01-01 execution. These are pre-existing/transitive issues NOT
caused by this plan's work and outside its scope (per executor scope-boundary rule).

## 1. `npm audit` high-severity transitive vulnerabilities (dev-toolchain only)

**Discovered during:** Task 1 (`npm install`).
**Status:** Out of scope — not fixable without breaking the locked stack.

- 7 high-severity advisories, all in transitive `brace-expansion` / `minimatch`
  (DoS via unbounded expansion) pulled in by ESLint and its plugins
  (`eslint`, `eslint-plugin-react`, `eslint-plugin-jsx-a11y`, `@eslint/config-array`).
- **Impact:** Development-time only. These packages never ship to production
  (the app bundle is React + Dexie + Zod). DoS-class, not RCE/auth-bypass.
- **Why not fixed:** `npm audit fix --force` would downgrade
  `eslint-plugin-react` to 7.22.0 (breaking change) — violating the plan's
  hard requirement that `eslint-plugin-react` is present and its
  `react/no-danger` / `react/jsx-no-target-blank` rules fire. The locked
  STACK.md pins the security-critical deps; the vulns are in transitive
  toolchain deps the plan does not control.
- **Follow-up:** Re-run `npm audit` after a future `@typescript-eslint` /
  ESLint upgrade (when typescript-eslint ships TS 7 support — see deviation
  D2 in 01-01-SUMMARY.md). The brace-expansion/minimatch chain should clear
  once the toolchain moves forward.
