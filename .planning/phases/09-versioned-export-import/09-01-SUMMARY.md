---
phase: 09-versioned-export-import
plan: 01
subsystem: portability
tags: [zod, fflate, zip-slip, sha256, crypto-subtle, vite-define, playwright, vitest]

# Dependency graph
requires:
  - phase: 08-markdown-pipeline-and-personal-library
    provides: ArticleSchema tags field, Dexie v4 5-store schema, loadAllLocations bulk-read precedent, RemoveConfirm dialog precedent
provides:
  - ExportBundleSchema versioned v1 envelope composing the 5 existing record schemas (PORT-01/02 versioning hook)
  - isSafeEntryName pure Zip Slip guard + sanitizeFilename (SC#2 hard-gate primitive)
  - computeManifest deterministic per-block SHA-256 manifest + sha256Hex (D9-03)
  - downloadBlob cross-browser Blob + anchor download helper (D9-05)
  - __APP_VERSION__ build-time define wiring (D9-04 diagnostic appVersion)
  - fflate 0.8.3 exact-pinned dependency (D9-02)
  - tests/e2e/portability/ harness proven wired (download capture + 5 sentinels)
  - tests/unit/portability/ regression corpus incl. the mandated SC#2 evil-entry corpus
affects: [09-versioned-export-import plans 09-02..09-07]

# Tech tracking
tech-stack:
  added: ["fflate 0.8.3 (exact pin, dependencies)"]
  patterns:
    - "Versioned envelope: z.literal(1) schemaVersion forward-reject gate composing existing record schemas (no shape re-declared)"
    - "Browser-context virtual path.resolve as a pure string function — NO node:path (Pitfall 3)"
    - "Manifest determinism: hash JSON.stringify of the Zod-parsed block on BOTH sides (Pitfall 2)"
    - "Deferred revokeObjectURL via setTimeout(0) for the WebKit click race (A2)"

key-files:
  created:
    - src/portability/bundle.ts
    - src/portability/zipSlip.ts
    - src/portability/manifest.ts
    - src/portability/download.ts
    - src/vite-env.d.ts
    - tests/unit/portability/bundle-schema.test.ts
    - tests/unit/portability/zip-slip.test.ts
    - tests/unit/portability/manifest.test.ts
    - tests/e2e/portability/download-smoke.spec.ts
    - tests/e2e/portability/round-trip.spec.ts
    - tests/e2e/portability/zip-slip-regression.spec.ts
    - tests/e2e/portability/import-preview.spec.ts
    - tests/e2e/portability/highlights-export.spec.ts
    - tests/e2e/portability/a11y.spec.ts
  modified:
    - package.json
    - package-lock.json
    - vite.config.ts

key-decisions:
  - "books/articleTags omitted from the envelope entirely (absence is the forward-compatible form — tags travel inside ArticleSchema.tags; RESEARCH Pattern 1 recommendation)"
  - "playwright.config.ts NOT modified — download smoke proved acceptDownloads already capturable under Playwright 1.61.1 defaults (A1 verified, Pitfall 9 fallback unneeded)"
  - "sha256Hex parameter typed Uint8Array<ArrayBuffer> — BufferSource requires ArrayBuffer backing under TS 7; the server/safeFetch.ts precedent compiles only because server/ is outside tsconfig scope"
  - "RED commits fail on not-yet-created modules (feature-absent signal for new pure modules); tsc build is intentionally transient-broken only at RED commits, restored at GREEN"

patterns-established:
  - "src/portability/ pure-module conventions: header comment citing D9-xx decisions, named regex constants, pure functions with no I/O, import type for type-only imports"
  - "Wave-0 sentinel e2e scaffolds: visible h1-assert sentinel (not test.todo) + image-stub beforeEach, replaced wholesale in 09-06"

requirements-completed: []  # PORT-01/PORT-02 stay open — they close at the plans that prove end-to-end behavior (mirrors the 04-02 PAGE-01 split precedent)

# Metrics
duration: 7 min
completed: 2026-08-15
status: complete
---

# Phase 9 Plan 1: Versioned Export/Import Foundations Summary

**Versioned ExportBundleSchema (z.literal(1) gate) + pure Zip Slip guard with the mandated SC#2 evil corpus + deterministic SHA-256 manifest + Blob download helper + fflate/appVersion/e2e-harness wiring — 40 unit tests and 6 chromium e2e cells green**

## Performance

- **Duration:** 7 min
- **Started:** 2026-08-15T17:50:08Z
- **Completed:** 2026-08-15T17:57:45Z
- **Tasks:** 3
- **Files modified:** 17 (4 src modules, 3 unit specs, 6 e2e specs, 1 d.ts, 3 config/deps)

## Accomplishments
- fflate 0.8.3 pinned exact (D9-02, audited OK) + `__APP_VERSION__` define read from package.json at Vite config load (A3) with the `src/vite-env.d.ts` declaration
- `ExportBundleSchema` composes the 5 existing record schemas with the PORT-01/02 `z.literal(1)` versioning hook, always-present preferences (D9-12), and `BUNDLE_FILENAME`/`resolveAppVersion()` artifacts
- `isSafeEntryName`/`sanitizeFilename` pure guard implementing SC#2's `path.resolve + startsWith` semantics browser-side (virtual resolve, no `node:path`), locked by the 13-form evil corpus + 4 valid controls
- `computeManifest`/`sha256Hex` deterministic per-block SHA-256 with known-answer verification ("abc" digest) and the JSON stringify/parse round-trip determinism proof (Pitfall 2/A4)
- `downloadBlob` shared .zip/.md download helper with the A2 deferred revoke
- E2e harness proven: download capture fires under current config (A1 — no `acceptDownloads` change needed); 5 Wave-0 sentinels green on chromium

## Task Commits

Each task was committed atomically:

1. **Task 1: Install fflate, wire appVersion, scaffold Wave-0 e2e specs** - `1b3e4c4` (chore)
2. **Task 2: ExportBundleSchema + Zip Slip guard (TDD)** - `04905e3` (test/RED) + `9793d1f` (feat/GREEN)
3. **Task 3: Deterministic SHA-256 manifest + download helper (TDD)** - `d453c27` (test/RED) + `b751164` (feat/GREEN)

## TDD Gate Compliance

Both TDD tasks followed RED → GREEN with the required commit sequence:

| Task | RED commit | GREEN commit | REFACTOR | Status |
|------|-----------|--------------|----------|--------|
| Task 2 (bundle + zipSlip) | `04905e3` | `9793d1f` | not needed (minimal modules) | Pass |
| Task 3 (manifest) | `d453c27` | `b751164` | not needed (minimal modules) | Pass |

RED specs failed on the not-yet-created modules (feature absent); GREEN runs passed 29/29 and 11/11 respectively.

## Files Created/Modified
- `src/portability/bundle.ts` - ExportBundleSchema v1 envelope + ExportBundle type + BUNDLE_FILENAME + resolveAppVersion
- `src/portability/zipSlip.ts` - isSafeEntryName virtual-resolve guard + sanitizeFilename (pure, no I/O, no node:path)
- `src/portability/manifest.ts` - sha256Hex (crypto.subtle) + Manifest type + computeManifest with the determinism contract
- `src/portability/download.ts` - downloadBlob (Blob + anchor + deferred revoke)
- `src/vite-env.d.ts` - `declare const __APP_VERSION__: string` + vite/client reference
- `vite.config.ts` - `define: { __APP_VERSION__ }` from package.json read at config load
- `package.json` / `package-lock.json` - fflate 0.8.3 exact
- `tests/unit/portability/{bundle-schema,zip-slip,manifest}.test.ts` - 40 unit tests incl. the mandated evil corpus (sampleBundle() exported for reuse by later plans)
- `tests/e2e/portability/*.spec.ts` (6 files) - download smoke + 5 sentinels (replaced in 09-06)

## Decisions Made
- Omitted `books`/`articleTags` from the envelope entirely per RESEARCH Pattern 1 (tags already denormalized on ArticleSchema.tags; absence is forward-compatible because the importer validates what IS there)
- Left `playwright.config.ts` untouched — the download-smoke spec captured a real download event under existing config, so the conditional acceptDownloads fallback (Task 1 step 4) was not triggered
- Typed `sha256Hex(bytes: Uint8Array<ArrayBuffer>)` — see Deviations #1

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] sha256Hex parameter rejected by tsc under TS 7 typed-array generics**
- **Found during:** Task 3 (GREEN build verification)
- **Issue:** `npm run build` failed: `Uint8Array<ArrayBufferLike>` is not assignable to `BufferSource` (= `ArrayBufferView<ArrayBuffer> | ArrayBuffer`). The `server/safeFetch.ts` L91-99 precedent passes TextEncoder output inline and compiles only because `server/` is outside tsconfig's include scope — `src/portability/` IS tsc-checked.
- **Fix:** Typed the parameter `Uint8Array<ArrayBuffer>`; verified `TextEncoder.encode()` returns exactly `Uint8Array<ArrayBuffer>` per lib.dom.d.ts (L36490), so both call sites (computeManifest, tests) assign cleanly with no casts.
- **Files modified:** src/portability/manifest.ts
- **Verification:** `npm run build` exit 0; 11/11 manifest tests; 40/40 full portability unit dir
- **Committed in:** b751164 (Task 3 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minimal — a signature-level type tightening required for the plan's own "npm run build exits 0" acceptance criterion. No scope creep.

## Issues Encountered
None beyond the deviation above. The A1 (acceptDownloads) and crypto.subtle-availability assumptions were probed empirically and both held (no config change, no polyfill).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All four pure portability primitives exist and are unit-locked; Plans 09-02..09-06 compose them (markdown renderer, export service, import pipeline, preview dialog, real e2e suites)
- The e2e sentinel scaffolds + proven download capture are the harness substrate for 09-03 (SC#4 round-trip) and 09-06 (real specs)
- `sampleBundle()` is exported from bundle-schema.test.ts for fixture reuse as the plan specified
- Known environment facts for later plans: Playwright 1.61.1 captures downloads under current config; `crypto.subtle.digest` is available under the vitest jsdom unit project

---
*Phase: 09-versioned-export-import*
*Completed: 2026-08-15*

## Self-Check: PASSED

All 14 created files verified present on disk; all 6 task/doc commits (1b3e4c4, 04905e3, 9793d1f, d453c27, b751164, f1eee00) verified in git log. Plan-level verification re-run green: 6/6 e2e (chromium), 40/40 unit, npm run build exit 0, fflate 0.8.3 exact.
