---
phase: 09-versioned-export-import
verified: 2026-08-15T20:12:14Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Decide among the three recorded candidate resolutions for stacked-modal sequential focus navigation (webkit Tab never reaches inner controls of dialog.import-preview while Settings stays open underneath)"
    expected: "A product decision recorded (accept engine reality / nest dialogs / close-settings-while-preview) and logged against deferred-items.md; the safety properties already hold on all engines"
    why_human: "Rule 4-adjacent structural UI choice — every candidate reverses or complicates a deliberate 09-05 design decision; automated tests assert the universal safety properties but cannot choose between product trade-offs"
    resolution: "RESOLVED 2026-08-15 — Option A (accept engine reality) decided by the developer; rationale recorded in deferred-items.md (safety proven on all engines; B reverses locked 09-05 mount; C breaks spatial orientation). No code change; e2e continues asserting universal safety + chromium wrap-cycle."
  - test: "Visual pass over the new portability surfaces (Settings 'Your data' cluster, import preview dialog, ArticleView 'Export highlights' button) at narrow width"
    expected: "Calm-booklike visual consistency with existing settings/dialog tokens; no layout disturbance from the new cluster; export button does not crowd the article header at 360px"
    why_human: "Axe + RTL + e2e prove structure, roles, content, and keyboard operability; visual calm and typographic fit are perceptual qualities no automated check covers"
    resolution: "RESOLVED 2026-08-15 — verified via delegated machine audit (developer-approved method; full evidence basis in 09-UAT.md test 2): geometric calm audit green at 360px + 320px (no overflow/clipping/overlap, uniform section rhythm), token consistency confirmed at source level (identical custom-property set, zero hardcoded colors), highlights.md byte-matches the locked template. Screenshots captured for optional later human review."
---

# Phase 9: Versioned Export/Import Verification Report

**Phase Goal:** Readers can take their whole library with them — exporting articles, highlights, notes, position, and preferences as a versioned bundle, re-importing it on another machine with validation and conflict reporting, and exporting just their highlights for use outside the reader.
**Verified:** 2026-08-15T20:12:14Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC#1 — Reader can export their entire library as a single versioned bundle carrying `schemaVersion` + per-article source URLs | ✓ VERIFIED | `src/portability/bundle.ts` (z.literal(1) envelope composing the 5 record schemas); `ExportImportService.buildBundleBytes` reads all five record sources through the Zod-validated loaders. Behavioral: `export-service.test.ts` (fixtures-not-serialized, sourceUrl verbatim, preferences always present) + `round-trip.spec.ts` asserts `schemaVersion === 1` and the seeded sourceUrl verbatim in the real captured download — **ran green directly this verification** (chromium, 10/10 portability e2e) |
| 2 | SC#2 — Import with Zod validation, dry-run conflict preview, skip-by-default per-kind overrides, atomic single-transaction apply, Zip Slip guard + filename sanitization | ✓ VERIFIED | `validateBundle` six-refusal pipeline (bomb cap → `isSafeEntryName` on EVERY entry → required entries → version peek → safeParse with ALL issues → manifest recompute); `applyImport` = one `db.transaction("rw", …)` with a puts-only closure; rollback PROVEN by injected Dexie creating-hook failure in `atomic-import.test.ts` (passed in the 125/125 unit run); `zip-slip-regression.spec.ts` both traversal variants refused with zero state change across all five stores — **ran green directly**. Note: "per-entity reader overrides" is implemented at the entity-KIND level per locked decisions D9-11/D9-14 (documented reconciliation, FEATURES L229 defers the per-row merge UI) |
| 3 | SC#3 — Export just highlights as Markdown (with template variables) for external tools | ✓ VERIFIED | `src/portability/markdown.ts` — locked template over the D9-07 variable contract (title/author/source/highlights/notes), blockquote + citation + Note lines, honest *[approx]*/*[orphan]* markers, never-drop orphan section; wired to Settings (library-wide `lem-reader-highlights.md`) and ArticleView (per-article `highlights-{sanitizeFilename(…)}.md`). Behavioral: `markdown.test.ts` (byte-for-byte template lock) + `highlights-export.spec.ts` real download content — **both ran green directly** |
| 4 | SC#4 — Round-trip integrity: offsets survive export/import, no page data in bundle, every highlight re-resolves confident or surfaces honestly ambiguous/orphan | ✓ VERIFIED | `round-trip.spec.ts` (two-context machine A/B harness): position.start/end byte-equal on machine B via raw IndexedDB reads, recursive no-"page"-key walk over bundle.json, note FK intact, compound location key present, prefs applied on fresh device, fixture-backed highlight renders a visible `mark.highlight` in the reader — **ran green directly this verification**; eager tri-state re-resolution in `conflicts.ts` (`resolveQuoteSelectorInText` + three-source lookup, unit-locked in `conflicts.test.ts`) |

**Score:** 4/4 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/portability/bundle.ts` | Versioned envelope schema | ✓ VERIFIED | 58 lines, substantive; composes the 5 record schemas; `BUNDLE_FILENAME`, `resolveAppVersion` |
| `src/portability/zipSlip.ts` | Zip Slip guard + sanitization | ✓ VERIFIED | 83 lines; virtual path.resolve semantics (stack-walk `..` refusal), URL-decode re-judge, OS-reserved names, `sanitizeFilename` |
| `src/portability/manifest.ts` | Deterministic SHA-256 manifest | ✓ VERIFIED | `crypto.subtle.digest("SHA-256")` confirmed; stringify/parse determinism unit-locked |
| `src/portability/download.ts` | Cross-browser download helper | ✓ VERIFIED | Blob + anchor + deferred revoke; used by all three export actions |
| `src/portability/markdown.ts` | Highlights Markdown renderer | ✓ VERIFIED | 255 lines; escaping guard, tri-state collection, both renderers + section ordering |
| `src/portability/conflicts.ts` | Dry-run conflicts + override resolution | ✓ VERIFIED | 533 lines; all 5 conflict kinds, Pattern 8 three-source lookup, keep-both id minting + note FK rewrite |
| `src/portability/ExportImportService.ts` | Export → validate → atomic apply | ✓ VERIFIED | 343 lines; full six-refusal pipeline; puts-only single Dexie transaction |
| `src/reader/ImportPreviewDialog.tsx` | Preview + confirm dialog | ✓ VERIFIED | 301 lines; alertdialog, focus capture/restore, `[data-initial-focus]` on Cancel, `onProceed` only from Import onClick |
| `src/reader/SettingsPanel.tsx` | "Your data" cluster + import state machine | ✓ VERIFIED | Full pipeline wired (see Key Links); insecure-context disable on all controls + calm status |
| `src/routes/ArticleView.tsx` | Per-article highlights export | ✓ VERIFIED | `collectHighlightEntries` + `renderArticleHighlights` + `sanitizeFilename` filename + live-region announce |
| `tests/unit/portability/` (10 spec files) | Unit truth for all modules | ✓ VERIFIED | **125/125 passed in 1.97s this verification** (`npm run test:unit -- --run tests/unit/portability`) |
| `tests/e2e/portability/` (6 spec files) | Real-browser phase-exit gates | ✓ VERIFIED | **10/10 chromium cells passed this verification** (~4.6s); full 3-engine 30/30 record in 09-07-OUTPUT.md |
| `.planning/…/09-07-OUTPUT.md` | Honest full-suite gate record | ✓ VERIFIED | Exit 0, 1674 passed / 0 failed / 13 intentional skips, single invocation, failing first run recorded verbatim (§4); commits `de0b800`, `9459da1`, `079b7e7` confirmed in git log |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `bundle.ts` | `src/content/schema.ts` | schema composition imports | ✓ WIRED | ArticleSchema/Location/Highlight/Note/ReaderSettings imported (L22-28) |
| `manifest.ts` | Web Crypto | `crypto.subtle.digest("SHA-256")` | ✓ WIRED | 1 occurrence confirmed |
| `vite.config.ts` | `bundle.ts` | `__APP_VERSION__` define | ✓ WIRED | L59 `JSON.stringify(pkg.version)`; declared in `src/vite-env.d.ts` |
| `markdown.ts` | `content/normalizeText.ts` | `resolveQuoteSelector` re-export site | ✓ WIRED | L23 import — REUSE-DO-NOT-FORK held (no forked resolver) |
| `conflicts.ts` | LibrarySource + stores + resolver + fixtures | local reads + three-source lookup | ✓ WIRED | `dexieLibrarySource.list()`, `loadAll{Highlights,Notes,Locations}`, `resolveQuoteSelectorInText`, `fixtures` all imported/used |
| `ExportImportService.ts` | fflate | named imports only | ✓ WIRED | Only `zipSync, unzipSync, strToU8, strFromU8` in src/ (grep-verified) |
| `ExportImportService.ts` | `db.transaction` | atomic 5-store apply | ✓ WIRED | Two explicit-arity calls, one puts-only closure; settings gated by `applyPreferences` |
| `SettingsPanel.tsx` | ExportImportService + ImportPreviewDialog | cluster buttons + dialog | ✓ WIRED | `buildBundleBytes`/`validateBundle`/`applyImport` wired; `applyImport` has exactly ONE call site (the Proceed handler); `<ImportPreviewDialog` mounted as fragment sibling |
| `ArticleView.tsx` | `markdown.ts` | per-article .md export | ✓ WIRED | `collectHighlightEntries` + `renderArticleHighlights` + `downloadBlob` (L1114-1121) |
| `round-trip.spec.ts` | app UI + IndexedDB | real clicks + raw row reads | ✓ WIRED | `waitForEvent("download")`, `indexedDB.open` readRow/countRows in `_portability.ts` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| SettingsPanel export | bundle bytes | `buildBundleBytes` → `dexieLibrarySource.list()` + `loadAll*()` + `loadSettings()` | Yes — e2e captured a real download whose unzipped bundle.json contained the seeded rows | ✓ FLOWING |
| ImportPreviewDialog | preview counts/conflicts | `detectImportPreview(bundle)` over real local Dexie state | Yes — e2e asserts the exact counts sentence against seeded rows | ✓ FLOWING |
| ArticleView export | markdown string | fresh per-article store load → `collectHighlightEntries` | Yes — e2e downloads and asserts file content against seeded highlights | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All portability unit truth (incl. injected-failure rollback, 6 refusal kinds, zip-slip corpus, template lock, override matrix) | `npm run test:unit -- --run tests/unit/portability` | 10 files / 125 passed / 0 failed (1.97s) | ✓ PASS |
| SC#4 round-trip: export A → transfer → import B, offsets byte-equal, no page keys, visible mark | `npx playwright test tests/e2e/portability/ --project=chromium` (round-trip.spec.ts) | 1/1 passed | ✓ PASS |
| SC#2: both crafted traversal zips refused, zero state change, dialog never opens | same run (zip-slip-regression.spec.ts) | 2/2 passed | ✓ PASS |
| PORT-02 dialog flow: Esc no-change, defaults-skip byte-unchanged, keep-both mints id | same run (import-preview.spec.ts) | 2/2 passed | ✓ PASS |
| PORT-03: .md download content matches locked template incl. never-dropped orphans | same run (highlights-export.spec.ts) | 2/2 passed | ✓ PASS |
| a11y: axe WCAG 2.2 AA zero violations on settings cluster + preview dialog, focus trapped, Esc restores | same run (a11y.spec.ts) | 2/2 passed | ✓ PASS |
| Full honest-suite gate (deferred to existing record — not re-run per verification scope) | `npm run test` (09-07-OUTPUT.md §2-3) | exit 0; 1674 passed / 0 failed / 13 intentional skips; both the exit-1 first run and exit-0 re-run recorded verbatim | ✓ PASS (record) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared for this phase; the phase's executable gates are the unit/e2e suites above (run directly). Step 7c: N/A.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PORT-01 | 09-01, 09-02, 09-04, 09-05, 09-06 | Export library + highlights + notes + positions + preferences as versioned bundle | ✓ SATISFIED | SC#1 + SC#4 evidence above; REQUIREMENTS.md marks Complete — confirmed against code |
| PORT-02 | 09-01, 09-03, 09-04, 09-05, 09-06 | Import compatible bundle with validation and conflict reporting | ✓ SATISFIED | SC#2 evidence above; REQUIREMENTS.md marks Complete — confirmed against code |
| PORT-03 | 09-02, 09-05, 09-06 | Export just highlights as Markdown for external use | ✓ SATISFIED | SC#3 evidence above; REQUIREMENTS.md marks Complete — confirmed against code |

**Orphaned requirements:** None. REQUIREMENTS.md maps only PORT-01/02/03 to Phase 9; all three are claimed by plans and verified. (Plan 09-07 additionally cites v1.0 substrate IDs PAGE-03/PAGE-04/ANNO-01/STATE-04 for the pre-existing-failure debt closure — these are v1.0 locked-substrate requirements, not Phase 9 scope; their regression debt is closed per 09-07-OUTPUT.md and the Phase 08 deferred-items closure note, which I verified on disk.)

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | No TBD/FIXME/XXX/TODO/HACK markers, no empty implementations, no placeholder returns in any phase-modified file | — | — |

Informational: the insecure-context (no Web Crypto) disable of the three data actions is fully wired (`dataActionsDisabled = !secureContext || busy` on all buttons + file input, calm status effect) but no test exercises it — acceptable because it is a declarative conditional (presence + wiring determine behavior) and the guard mirrors the established StorageBanner degradation posture.

### Human Verification Required

### 1. Stacked-modal sequential focus navigation — product decision (OPEN deferred item)

**Test:** With the Settings panel open, open the import preview dialog, then press Tab repeatedly inside `dialog.import-preview` in webkit (and compare chromium/firefox).
**Expected:** A recorded decision among the three candidates in `deferred-items.md`: (1) accept engine reality — universal trap safety + chromium wrap cycle asserted (what shipped), (2) nest the preview dialog inside the settings dialog, or (3) close settings while the preview is open. Proven NOT broken on any engine: initial focus on Cancel import, focus never escapes to underlying controls, Esc closes + restores focus, every control operable by real clicks.
**Why human:** Rule 4-adjacent structural UI choice — each candidate reverses or complicates a deliberate 09-05 design decision (Pitfall 8 isolation, mount-outside reading order, live-region placement). Automated tests assert the safety properties but cannot make the product trade-off. Note: Phase 13's success criteria (mode-flash, progress bar, NVDA acceptance, core-flow matrix) do NOT cover this item — it is not deferred to any later phase.

### 2. Visual calm pass over the new portability surfaces

**Test:** Open Settings → "Your data" cluster; pick a bundle to preview; open an article's Export highlights affordance — at both desktop and 360px width.
**Expected:** Visual consistency with existing settings/dialog tokens; the new cluster and dialog feel calm and booklike; the Export highlights button does not crowd the article header at narrow widths (the 09-07 fix caps the header at 25% and makes it scrollable — worth eyeballing that scrolling header feels acceptable).
**Why human:** Axe (WCAG 2.2 AA, zero violations), RTL, and e2e content/keyboard checks all passed directly; perceptual calm and typographic fit have no automated proxy.

### Gaps Summary

No gaps. All four ROADMAP success criteria are verified with direct behavioral evidence the verifier ran itself this session (125/125 portability unit tests; 10/10 chromium portability e2e cells including the SC#4 round-trip and both SC#2 traversal variants), backed by source inspection of every artifact (all substantive, all wired, real data flowing) and the honest full-suite record in 09-07-OUTPUT.md (exit 0; 1674 passed / 0 failed / 13 intentional skips) with its commits verified in git log. All three phase requirement IDs (PORT-01/02/03) are satisfied and accounted for; no orphaned requirements; no debt markers; no stubs.

The "per-entity reader overrides" wording in SC#2 is implemented as bulk per-KIND overrides per the locked D9-11/D9-14 decisions recorded in 09-CONTEXT.md (FEATURES L229 defers the per-row merge UI) — a documented planning reconciliation, not a deviation requiring an override.

Status is `human_needed` solely for the two items above: the phase's own deferred-items.md records the stacked-modal focus divergence as needing a human product choice (not covered by any later phase), plus a routine visual-calm pass over the new surfaces. Neither blocks the phase goal — the goal's truths are all behaviorally proven.

---

_Verified: 2026-08-15T20:12:14Z_
_Verifier: the agent (gsd-verifier)_
