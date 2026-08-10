---
phase: 01-canonical-article-foundation
plan: 01
subsystem: infra
tags: [vite, react, typescript, zod, dexie, vitest, playwright, eslint, intl-segmenter]

# Dependency graph
requires: []
provides:
  - "Runnable Vite 8 + React 19 + TS 7 SPA scaffold (build/lint/test/dev green)"
  - "Frozen Zod document model — 9 block kinds, 4 inline marks (D-04), D-06 identity/revision, Pitfall 4/5 boundary guards"
  - "Inferred types CanonicalArticle / Block / InlineRun (z.infer, single source of truth)"
  - "D-05 grapheme-offset substrate — normalizeText, graphemeClusters, deriveQuoteSelector"
  - "Reserved Dexie version(1) schema (5 store slots) for Phase 2 forward-compat"
  - "73 passing unit tests covering schema/identity/normalizeText/graphemeOffsets/selectors"
affects: [01-02, 01-03, 02-location-persistence, 05-annotations]

# Tech tracking
tech-stack:
  added:
    - "react@19.2.8, react-dom@19.2.8 (runtime)"
    - "dexie@4.4.4, zod@4.4.3 (runtime)"
    - "vite@8.1.5, @vitejs/plugin-react@^6, typescript@7.0.2 (build)"
    - "vitest@4.1.10, @testing-library/react@16.3.2, jsdom (unit/component tests)"
    - "@playwright/test@1.61.1, @axe-core/playwright@4.12.1 (e2e, browsers installed)"
    - "eslint@9 flat config + eslint-plugin-react/hooks/jsx-a11y (security rules)"
    - "@babel/eslint-parser + @babel/preset-typescript/react (TS-7-compatible lint parser)"
    - "prettier (formatting)"
  patterns:
    - "Zod-at-boundary: ArticleSchema.parse() validates every fixture at import (Pitfall 8)"
    - "Discriminated-union block model with exhaustive switch (9 kinds, O(1) parse)"
    - "Two-pass recursive Zod type (hand-written Block union + z.ZodType<Block> annotation — Pitfall 7)"
    - "Grapheme-offset canonical coordinates (Intl.Segmenter ordinals, not UTF-16 — Pitfall 1, D-05)"
    - "ASCII-only whitespace collapse; Unicode/code-block verbatim (Pitfall 2)"
    - "URL scheme allow-list refinement on every URL field (Pitfall 5)"
    - "Dexie version(1) shipped once, never edited (Pitfall 9 forward-compat)"
    - "Authored CSS custom properties (D-07 warm-paper tokens), no Tailwind/shadcn"

key-files:
  created:
    - "package.json — locked STACK.md versions + npm scripts"
    - "tsconfig.json (+ tsconfig.node.json) — strict, noUncheckedIndexedAccess, resolveJsonModule, noUnusedLocals"
    - "vite.config.ts / vitest.config.ts / playwright.config.ts — build + 3-engine test matrix"
    - "eslint.config.js — flat config, eslint-plugin-react registered, react/no-danger + react/jsx-no-target-blank at error"
    - "index.html / src/main.tsx / src/App.tsx / src/app.css — SPA shell + D-07 tokens"
    - "tests/setup.ts — @testing-library/jest-dom/vitest matchers"
    - "src/content/schema.ts — frozen Zod model (ArticleSchema, BlockSchema, Mark, Provenance, FootnoteBody, 9 blocks)"
    - "src/content/types.ts — CanonicalArticle / Block / InlineRun (z.infer re-exports)"
    - "src/content/normalizeText.ts — D-05 substrate (normalizeText, graphemeClusters, graphemeLength, deriveQuoteSelector)"
    - "src/persistence/db.ts — reserved Dexie version(1) schema (5 slots)"
    - "tests/unit/schema.test.ts — 28 boundary cases (Pitfall 4/5/10, D-04, D-06)"
    - "tests/unit/identity.test.ts — 19 identity/revision cases (D-06)"
    - "tests/unit/normalizeText.test.ts — 11 substrate cases (Pitfall 2/3, idempotency)"
    - "tests/unit/graphemeOffsets.test.ts — 9 grapheme cases (Pitfall 1 regression)"
    - "tests/unit/selectors.test.ts — 6 deriveQuoteSelector cases"
    - ".npmrc — legacy-peer-deps (TS 7 + typescript-eslint peer range)"
  modified: []

key-decisions:
  - "D-04 inline marks locked to exactly 4 (link/code/strong/em) — no strikethrough/sub/sup"
  - "D-05 canonical coordinates are grapheme-cluster ordinals over normalized text in reading order; footnote bodies participate after body blocks"
  - "D-06 identity = stable slug id + monotonic integer revision; id is never the source URL"
  - "URL scheme allow-list (http/https/mailto for links; http/https for figures+provenance) enforced in Zod, not just React"
  - "Dexie version(1) reserved with all 5 store slots; Phase 2 adds version(2) without editing version(1) (Pitfall 9)"
  - "Recursive Block type uses two-pass declaration (hand-written union + z.ZodType<Block>) because Zod cannot infer a self-referential const (Pitfall 7)"

patterns-established:
  - "Zod schema is the single source of truth; types are z.infer, never hand-written (except the recursive Block union escape hatch)"
  - "Every persisted/imported record crosses ArticleSchema.parse() at the boundary"
  - "graphemeClusters(text, locale) returns the segment substring array; canonical offset = array index N, never segment.index"
  - "normalizeText is pure and deterministic — same article revision in, same string out, always"
  - "ESLint security rules (react/no-danger, react/jsx-no-target-blank) verified firing via --print-config, not assumed"
  - "tsc owns unused-var detection (noUnusedLocals/Parameters); ESLint no-unused-vars disabled (false-positives on type-only imports)"

requirements-completed: [DOC-04, DOC-05]

# Metrics
duration: 14 min
completed: 2026-07-28
status: complete
---

# Phase 1 Plan 1: Canonical Article Foundation Summary

**Greenfield Vite 8 + React 19 + TS 7 scaffold with the two frozen Phase 1 contracts — a 9-kind/4-mark Zod document model (D-04/D-06, Pitfall 4/5 guards) and the D-05 grapheme-offset substrate (Pitfall 1/2/3 regression tests) — plus a reserved Dexie v1 schema, all backed by 73 passing unit tests.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-07-28T17:31:57Z
- **Completed:** 2026-07-28T17:46:46Z
- **Tasks:** 3
- **Files modified:** 25 (all new — greenfield)

## Accomplishments

- Runnable, type-safe, lint-clean, test-green SPA on the locked STACK.md versions (React 19.2.8, TS 7.0.2, Vite 8.1.5, Dexie 4.4.4, Zod 4.4.3).
- Frozen Zod document model: `z.discriminatedUnion("kind", [...])` over exactly 9 block kinds; `Mark = z.union` of exactly 4 (D-04); scheme allow-list refinements reject `javascript:`/`data:`/`file:` hrefs at parse time (Pitfall 5); footnote id regex `/^fn-\d+$/` (Pitfall 4); heading levels 1–6 (Pitfall 10); D-06 slug id + monotonic revision.
- D-05 grapheme-offset substrate: `normalizeText` produces one deterministic string per revision; `graphemeClusters` counts `Intl.Segmenter` ordinals (not UTF-16 — Pitfall 1); footnote bodies participate after body blocks (Pitfall 3); ASCII-only whitespace collapse with Unicode/code-block verbatim (Pitfall 2); `deriveQuoteSelector` round-trips through the grapheme array.
- Reserved Dexie `version(1)` schema with 5 store slots (articles/settings/location/highlights/notes) declared exactly once (Pitfall 9).
- `eslint-plugin-react` registered with `react/no-danger` (Pitfall 6 stored-XSS guard) and `react/jsx-no-target-blank` both at `error` — verified firing via `--print-config`.

## Task Commits

Each task was committed atomically (TDD tasks have RED → GREEN):

1. **Task 1: Greenfield scaffold** — `e95c4aa` (feat) — package.json, configs, ESLint flat config, SPA shell, Playwright browsers installed.
2. **Task 2 RED: schema + identity tests** — `81abce9` (test) — 28+19 failing boundary cases.
3. **Task 2 GREEN: frozen Zod model + Dexie** — `ba6f249` (feat) — schema.ts, types.ts, db.ts; 47 tests green.
4. **Task 3 RED: normalizeText/grapheme/selectors tests** — `2410013` (test) — 26 failing substrate cases.
5. **Task 3 GREEN: grapheme-offset substrate** — `e2ecf80` (feat) — normalizeText.ts; 73 total tests green.

## Files Created/Modified

- `package.json` — locked runtime + dev dependency versions, npm scripts (dev/build/test/lint/format).
- `tsconfig.json` / `tsconfig.node.json` — strict TS config with `noUncheckedIndexedAccess`, `resolveJsonModule`, `noUnusedLocals`.
- `vite.config.ts` / `vitest.config.ts` / `playwright.config.ts` — build + jsdom unit env + 3-engine e2e matrix.
- `eslint.config.js` — flat config; `eslint-plugin-react` + hooks + jsx-a11y registered; security rules at `error`.
- `.prettierrc.json` / `.gitignore` / `.npmrc` / `index.html` — formatting, ignores, peer-dep pin, SPA entry.
- `src/main.tsx` / `src/App.tsx` / `src/app.css` — `createRoot` mount, placeholder shell, D-07 warm-paper CSS tokens.
- `tests/setup.ts` — `@testing-library/jest-dom/vitest` matchers.
- `src/content/schema.ts` — frozen Zod model (ArticleSchema, BlockSchema, Mark, Provenance, FootnoteBody, 9 per-kind blocks).
- `src/content/types.ts` — `CanonicalArticle` / `Block` / `InlineRun` z.infer re-exports.
- `src/content/normalizeText.ts` — D-05 substrate (normalizeText, graphemeClusters, graphemeLength, deriveQuoteSelector, selectors).
- `src/persistence/db.ts` — reserved Dexie `LemReaderDB` + `db` instance, `version(1)` once.
- `tests/unit/{schema,identity,normalizeText,graphemeOffsets,selectors}.test.ts` — 73 tests.

## Decisions Made

- **Recursive Block type (Pitfall 7):** Used the Zod-documented two-pass pattern — hand-write the recursive `Block` union type, then annotate `BlockSchema: z.ZodType<Block>`. The getter form handles runtime laziness for `BlockquoteBlock.children` and `ListItem.content`; the annotation gives TS a concrete type so `z.infer<typeof BlockSchema>` yields the precise union (not `unknown`), enabling `.kind`/`.content` access in consumers (normalizeText, tests). This is the accepted exception to "never hand-write a parallel type" — it only applies to recursive schemas, and the hand-written union mirrors the `discriminatedUnion` validated by tests.
- **Exported `normalizeRunText`:** The plan's test spec asserts `normalizeRunText` idempotency directly. Exported it (a pure deterministic function) so the test can call it; harmless and enables direct substrate testing.
- **tsc owns unused-var detection:** Enabled `noUnusedLocals` + `noUnusedParameters` in tsconfig and disabled ESLint's `no-unused-vars` (it false-positives on type-only imports parsed via Babel). tsc correctly sees type-position usage; this is the more accurate setup.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] `@typescript-eslint` hard-throws on TypeScript 7.0.2**
- **Found during:** Task 1 (`npm run lint`).
- **Issue:** The locked STACK.md pins TypeScript 7.0.2 AND lists `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin`. Both packages v8.65.0 throw at module load when TS 7.x is installed: `Error: typescript-eslint does not support TS 7.0.` (upstream tracking: typescript-eslint/typescript-eslint#10940). This is a hard runtime guard, not a peer-dep warning — the parser and plugin refuse to load, so any flat config importing them fails before linting begins. The plan's `<read_first>`/`<action>` assumed `@typescript-eslint` works with TS 7; it does not.
- **Fix:** Parse TS/TSX with `@babel/eslint-parser` (`@babel/preset-typescript` + `@babel/preset-react`), which is TS-7-compatible (Babel's TS strip is independent of the TS compiler API). Keep ALL security rules the plan gates on — `react/no-danger`, `react/jsx-no-target-blank`, `react-hooks/*`, `jsx-a11y/*` — from their original plugins (`eslint-plugin-react` etc.), verified firing via `--print-config`. The `@typescript-eslint/*` packages remain in `devDependencies` (stack-listed) so they activate the moment upstream ships TS 7 support; only the active flat-config import is omitted (importing them throws today). Also added `.npmrc` with `legacy-peer-deps=true` (TS 7 exceeds `@typescript-eslint`'s declared peer range `<6.1.0`).
- **Files modified:** `eslint.config.js`, `package.json` (+ `@babel/core`, `@babel/eslint-parser`, `@babel/preset-typescript`, `@babel/preset-react` devDeps), `.npmrc` (new).
- **Verification:** `npm run lint` exits 0; `npx eslint --print-config src/main.tsx` shows `react/no-danger: [2]` (error) and `react/jsx-no-target-blank: [2]`; all 73 tests pass; `npm run build` exits 0.
- **Committed in:** `e95c4aa` (Task 1 commit), with config refinements in `ba6f249` and `e2ecf80`.

**2. [Rule 3 — Blocking] ESLint `no-unused-vars` / `no-undef` incompatible with TS-via-Babel parsing**
- **Found during:** Task 2/3 (`npm run lint`).
- **Issue:** ESLint's core `no-undef` flagged every TypeScript type-level identifier (`type X`, `z.infer`, `as const`, namespace qualifiers) as undefined, and `no-unused-vars` flagged every `import type` binding used only in type annotations. Both rules operate on value-position references and cannot see type-position usage when TS is parsed via Babel (the `@typescript-eslint` rules that normally handle this throw on TS 7 — see deviation 1).
- **Fix:** Disabled `no-undef` and `no-unused-vars` for the project (all source is `.ts`/`.tsx`) and made tsc the authority: enabled `noUnusedLocals` + `noUnusedParameters` in `tsconfig.json`. tsc correctly handles type-only imports and unused detection; `npm run build` (which runs `tsc`) verifies every import is genuinely used.
- **Files modified:** `eslint.config.js`, `tsconfig.json`.
- **Verification:** `npm run lint` exits 0; `npm run build` (tsc strict + noUnusedLocals) exits 0 — confirms no genuinely-unused bindings.
- **Committed in:** `ba6f249` (no-undef), `e2ecf80` (no-unused-vars + noUnusedLocals).

**3. [Rule 3 — Blocking] Vitest exits code 1 when no test files exist**
- **Found during:** Task 1 verification.
- **Issue:** `npm run test:unit -- --run` exits 1 when the test globs match zero files (Vitest 4 default). Task 1 ships the harness but no tests yet; Tasks 2–3 add them.
- **Fix:** For Task 1's verification gate only, ran with `--passWithNoTests`. Did not modify the `test:unit` script (it stays `vitest` so real regressions aren't masked). Tasks 2–3 added 73 real tests, so the default invocation is now the authoritative gate.
- **Verification:** Task 1 gate passed with the flag; final `npm run test:unit -- --run` (no flag) reports 73 passing.
- **Committed in:** n/a (verification-only flag; no file change).

---

**Total deviations:** 3 auto-fixed (3 Rule 3 blocking).
**Impact on plan:** All three are forced by the locked stack's internal TS-7-vs-tooling conflict (typescript-eslint, ESLint core TS rules). Each fix preserves the plan's hard requirements (locked versions, security rules firing, build/lint/test green) with the minimum change. No scope creep; no architectural change; no runtime behavior change. The deviations are dev-tooling compatibility shims that will naturally resolve when `@typescript-eslint` ships TS 7 support.

## Issues Encountered

- The locked STACK.md internally conflicts: it pins TypeScript 7.0.2 (released mid-2026) AND lists `@typescript-eslint/*` v8, which hard-throws on TS 7 (upstream not yet supporting it as of the research date). The research/planning did not catch this because both pins are individually correct against their own release notes; the incompatibility is at the intersection. Resolved via deviation 1 above. Recommend the STACK.md "Version Compatibility" table be updated to note typescript-eslint TS-7 support is pending (issue #10940).

## Authentication Gates

None — this plan has no external service or auth surface (greenfield scaffold + pure domain model).

## User Setup Required

None — no external service configuration required. Static SPA, local persistence reserved only.

## Next Phase Readiness

- Plan 02 can build its article repository, renderer, and routes directly on the frozen contracts (`CanonicalArticle`, `Block`, `InlineRun`, `ArticleSchema.parse`) without renegotiating them.
- The D-05 coordinate substrate (`normalizeText`, `graphemeClusters`, `deriveQuoteSelector`) is ready for Phase 2 (location restore) and Phase 5 (annotations) to persist offsets against.
- The reserved Dexie `version(1)` schema is ready for Phase 2 to extend with `version(2).stores({...})`.
- **One follow-up for the user/toolchain:** when `@typescript-eslint` ships TS 7 support, swap `@babel/eslint-parser` back to `@typescript-eslint/parser` in `eslint.config.js` and re-enable the `@typescript-eslint` recommended ruleset (the packages are already in devDependencies).

---
*Phase: 01-canonical-article-foundation*
*Completed: 2026-07-28*

## Self-Check: PASSED

- All must_haves artifacts verified present on disk (`package.json`, `schema.ts`, `types.ts`, `normalizeText.ts`, `db.ts`, all 5 test files). (`eslint.config.ts` listed in the check was a typo — the file is correctly `eslint.config.js`, which exists.)
- All 5 task commits verified in git log: `e95c4aa`, `81abce9`, `ba6f249`, `2410013`, `e2ecf80`.
- Final gate re-run: `npm run build` PASS, `npm run lint` PASS, `npm run test:unit -- --run` PASS (73 tests, 5 files).

