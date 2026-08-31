---
phase: 20-safe-local-image-fidelity
plan: 06
subsystem: ingestion
tags: [epub, container-extraction, d12-16-retirement, sniff, asset-refs, zero-network, per-figure-refusal, extraction-warnings]

# Dependency graph
requires:
  - phase: 20-safe-local-image-fidelity (Plan 02)
    provides: figureSrcResolver hook on htmlToBlocks, sniffImageAsset network-free seam, rewriteFiguresWithAssets, AssetResolution supertype, asset envelope on the book ok-variant
  - phase: 20-safe-local-image-fidelity (Plan 04)
    provides: EpubIngestionSuccess.assets via validateEnvelopeAssets, AddDialog book-arm BookAsset attribution walk (bookAssetsForChapters), FigureMedia placeholder surface + AssetProvider
provides:
  - EPUB chapter figures extract from the already-open container with ZERO network — every admitted figure is a local asset:img ref with stored dims; D12-16 downgradeFigures retired (function + call site deleted)
  - EPUB-internal figures run the shared sniff caps minus fetch (type/SVG/bytes/pixels/animated) over archive bytes read through EpubArchive.entryBytes; remote-src figures auto-refuse "fetch" keeping originalSrc provenance
  - Chapter-relative srcs resolve through the ONE normalizeEpubHref + dirOf against the entries map; isSafeEntryName on every composed key before byte use
  - Caps identical to the network constants: MAX_FIGURES_PER_ARTICLE unique srcs per chapter unit + the MAX_ARTICLE_ASSET_BYTES per-book running budget with byte-identical twin reuse; over-cap/over-budget refuse per-figure
  - Refused chapter figures disclosed via per-chapter extractionWarnings ("N image(s) could not be included") — never silently dropped; only admitted chapters' deduped assets ride the book envelope
  - rewriteFiguresWithAssets generalized with an optional claimedSrc predicate (default = the pinned http(s) filter; parameterized-not-forked, the safeFetchCore precedent) with an http-only originalSrc provenance rule inside
  - Six new deterministic epub-fixtures builders incl. hand-verified image bytes (8x6 PNG, 2-frame NETSCAPE GIF, IHDR-patched 65536² pixel bomb, SVG) and the 126-figure count-cap corpus
affects: [20-07 corpus cap re-check + full-suite gate (3 documented e2e webkit skips), 20-08 verification (EPUB figure path now mirrors the article path)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Parameterize-the-shared-seam: when a shipped helper's filter cannot express a new caller's class of srcs, add an OPTIONAL predicate defaulting to the pinned behavior (assetStage claimedSrc) — never a forked sibling rewrite"
    - "Per-doc resolution maps keyed by the RAW marker src: the same src string in two chapters at different depths is two container entries — maps are per-document, caps/budgets are per-unit/per-book"
    - "Extraction runs AFTER the D12-10 admission gate: skipped plates never spend sniff work and never contribute assets (D20-03 scope held structurally, not by filtering)"
    - "http-only originalSrc rule inside the rewrite helper: provenance is written only for URL-shaped srcs; container-relative markers keep provenance in the refusal disclosure (originalSrc is httpUrl-typed — a forced non-URL would fail ArticleSchema.parse and silently kill chapters)"

key-files:
  created: []
  modified:
    - server/epubToBooks.ts
    - server/assetStage.ts
    - server/ingest.ts
    - tests/unit/server/epub-fixtures.ts
    - tests/unit/server/epub-to-books.spec.ts
    - tests/e2e/epub-intake.spec.ts
    - .planning/phases/20-safe-local-image-fidelity/deferred-items.md

key-decisions:
  - "rewriteFiguresWithAssets generalized via an optional claimedSrc predicate (default byte-stable for the pinned network path) instead of a forked EPUB rewrite — the shipped helper's http-only gate could not express container-relative markers, so the plan's mandated reuse was otherwise a no-op (Rule 3; assetStage.spec untouched and green)"
  - "Remote http(s) figure srcs in EPUB chapters map to the 'fetch' refusal arm — the honest zero-network treatment (D20-01/T-12-05): remote figures can never admit from the container, and the refusal keeps originalSrc provenance exactly like the network path"
  - "originalSrc is omitted on the EPUB marker path (both accepted and refused) — it is httpUrl-typed in the schema, and a chapter-relative path is not a URL; provenance lives in the disclosure + asset meta instead (plan action's own guidance, enforced inside the shared helper)"
  - "Figure extraction happens per chapter unit AFTER admission; per-book budget charges in admission order across units with byte-identical twin reuse (D7-07) — skipped units take no assets, and ingestEpubBook emits only ADMITTED chapters' deduped assets (no orphan bytes ride the envelope)"
  - "AddDialog + IngestionClient needed ZERO changes — 20-04 Task 1's wiring already threads validated book assets into saveBook and the shapes line up exactly (verified against bookAssetsForChapters)"
  - "The admitted-figure e2e cell carries a documented webkit test.skip mirroring the 20-05 pattern — Playwright's WebKit cannot put ANY Blob into IndexedDB (re-probed during this plan); the refusal cell stays green on webkit (zero asset rows)"

patterns-established:
  - "Honest engine-skip with phase-ledger accounting: a new skip extends deferred-items.md's residual count for the phase gate owner (2 → 3) rather than hiding behind a weakened assertion"

requirements-completed: [IMG-01, IMG-02]

# Metrics
duration: 31min
completed: 2026-08-31
status: complete
---

# Phase 20 Plan 06: EPUB Container Extraction — D12-16 Retirement Summary

**EPUB chapter figures now extract from the already-open container with zero network — marker srcs resolve through OPF-dir path math, sniff through the shared seam (type/SVG/bytes/pixels/animated caps, no fetch), rewrite through the shared stage helper into local asset:img refs with stored dims, and refuse calmly per-figure with extractionWarnings disclosure — retiring D12-16's downgrade-everything pass and its remote-beacon workaround in favor of local-assets-only**

## Performance

- **Duration:** 31 min
- **Started:** 2026-08-31T19:17:11Z
- **Completed:** 2026-08-31T19:48:29Z
- **Tasks:** 2 (Task 1 TDD: RED→GREEN)
- **Files modified:** 7 (0 created, 7 modified)

## Accomplishments

- **D12-16 retired end-to-end**: `downgradeFigures` and its walkChapterDocument call site deleted; `walkChapterDocument` passes a `figureSrcResolver` container-marker claim (RESEARCH Pattern 5 option (a)) so chapter figures survive the walk as FigureBlocks carrying raw relative srcs — the url/paste path passes nothing and stays byte-stable (extraction.spec untouched)
- **Zero-network proven three ways**: structurally (no fetch/safeFetch anywhere in epubToBooks), behaviorally (unit cell: extraction succeeds + admits with global fetch stubbed to throw), and by treatment (remote srcs refuse "fetch" — the container is the only read source; the 20-04 renderer emits `<img>` only on the resolved object-URL branch)
- **Same caps discipline as network assets**: `sniffImageAsset` over entry bytes read through the new `EpubArchive.entryBytes` (isSafeEntryName on every composed key first), MAX_FIGURES_PER_ARTICLE per chapter unit (126-figure corpus proves the per-figure "count" refusal + twin dedupe to ONE asset/ONE budget charge), MAX_ARTICLE_ASSET_BYTES per-book running guard (Pitfall 6)
- **Honest disclosure everywhere**: per-chapter `figureRefusedCount` → `extractionWarnings` in the 20-02 count tone; the e2e refusal cell pins the exact persisted warning string + the placeholder surface + the caption surviving + zero asset rows
- **Covers untouched (D20-03)**: coverMetaBook (OPF cover meta + real admissible PNG entry referenced by nothing) proves zero book-level assets; extraction runs only after chapter admission so plate chapters never spend sniff work
- **Full-suite honesty**: 1577 unit tests passed / 0 failed / 13 documented skips; epub-intake e2e 41 passed / 1 documented webkit skip / 0 failed across chromium+firefox+webkit; happy-path + library EPUB sweep green on chromium (strengthen-only held — zero pre-existing cells modified)

## Task Commits

Each task was committed atomically (Task 1 TDD: RED test commit → GREEN feat commit):

1. **Task 1: Container extraction — resolve, sniff-cap, rewrite, disclose** — `da7b4b9` (test/RED: 7 failing cells + 6 fixture builders + tsc-clean scaffold) + `e0391d6` (feat/GREEN: 36/36 + ingest-epub 25/25)
2. **Task 2: EPUB e2e realignment + figure rendering cells** — `71fd8ec` (feat)

## TDD Gate Compliance

- Task 1: RED `da7b4b9` (7 failing cells — 6 new container-extraction cells + the honestly-realigned imageChapterBook cell — failing behaviorally against the tsc-clean placeholder scaffold; 29 pre-existing green) → GREEN `e0391d6` (36/36 in epub-to-books.spec + 61/61 across both plan specs) ✓
- RED failed for the right reasons (behavior absent, not syntax — tsc clean; failures inspected before committing)

## Files Created/Modified

- `server/epubToBooks.ts` — downgradeFigures deleted; figureSrcResolver marker claim; `EpubArchive.entryBytes`; `extractUnitFigures` (per-unit collect → count-cap → container resolve → sniff → per-book budget → shared rewrite → per-figure disclosure); ChapterDraft.assets + figureRefusedCount; header/decision-lineage comments updated
- `server/assetStage.ts` — `rewriteFiguresWithAssets(blocks, resolution, claimedSrc?)`: optional predicate defaulting to the pinned http(s) filter; http-only originalSrc provenance rule (both arms); existing callers + spec byte-stable
- `server/ingest.ts` — ingestEpubBook: per-chapter extractionWarnings disclosure; admitted-chapters-only deduped assets on the book envelope via the existing toAssetEnvelope
- `tests/unit/server/epub-fixtures.ts` — 6 new builders (figureChapterBook w/ nested text/ chapter + ../ markers, coverMetaBook, renderedFigureBook, refusedFigureBook, figureSpamBook, + FIGURE_SPAM_COUNT coupling export), 4 hand-assembled image-byte constants (verified against image-size@2.0.2 + is-animated@2.0.2), self-check registration + discriminators
- `tests/unit/server/epub-to-books.spec.ts` — realigned imageChapterBook cell (D20-01/D12-16-retirement citation) + the 8-cell 20-06 describe (admitted/dims, animated+SVG+bomb refusals, dangling, zero-network, no-cover, substrate identity, count cap)
- `tests/e2e/epub-intake.spec.ts` — 20-06 describe: admitted-figure render cell (blob img, naturalWidth, dims, caption, Dexie assets row; documented webkit skip) + refused-figure cell (placeholder, zero img, caption, persisted warning, zero rows; 3-engine green); realignment note citing D20-01/UI-SPEC Regression Targets
- `.planning/phases/20-safe-local-image-fidelity/deferred-items.md` — webkit Blob→IDB boundary re-confirmed + residual count 2 → 3 for the 20-07 gate

## Decisions Made

- The claimedSrc-predicate generalization (not a fork): the shipped `rewriteFiguresWithAssets` http-only gate made the plan's mandated reuse a no-op for marker srcs; the optional-parameter shape keeps the same function object serving both paths — the exact discipline 20-01 applied to safeFetchCore
- Remote-src figures refuse "fetch" rather than being skipped silently — the refusal count discloses them and originalSrc keeps the URL provenance; no code path can ever render them (IMG-03 structural guarantee composes)
- Marker provenance never enters originalSrc (httpUrl-typed): enforced inside the shared helper so no future caller can force a non-URL into the schema (a forced path string would fail ArticleSchema.parse and silently kill whole chapters — the landmine avoided by construction)
- Per-doc resolution maps + per-unit caps: same src string in two documents at different depths resolves to two entries; the count cap counts unique srcs across the merged unit (the article the reader experiences), matching the network path's per-article semantics
- No IngestionClient/AddDialog changes: 20-04 Task 1's EpubIngestionSuccess.assets + bookAssetsForChapters wiring was verified against the real envelope shapes and holds as-shipped

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] rewriteFiguresWithAssets claimedSrc parameter (file beyond the plan's list)**
- **Found during:** Task 1 GREEN design
- **Issue:** the plan mandates reuse of `rewriteFiguresWithAssets` ("no forked EPUB rewrite") but the shipped helper only rewrites http(s) srcs — called directly with container-relative markers it is a silent no-op, and a parallel EPUB rewrite would be exactly the fork the plan forbids
- **Fix:** optional third parameter `claimedSrc: (src) => boolean` defaulting to the internal HTTP_SRC predicate; default behavior byte-identical (assetStage.spec.ts untouched, 13/13 green); provenance writes made http-only inside so the EPUB path can never force a non-URL originalSrc
- **Files modified:** server/assetStage.ts (+14 lines)
- **Verification:** assetStage.spec.ts 13/13; full unit suite 1577/0
- **Committed in:** e0391d6

**2. [Rule 1 - Honest realignment] imageChapterBook unit cell + measurement-body e2e selectors**
- **Found during:** Task 1 RED (unit) and Task 2 first run (e2e)
- **Issue:** the old unit cell pinned the downgrade ("zero figure-kind blocks survive") — retired WITH the feature per the plan's own realignment mandate; on e2e, `figure img` count is 2 (the always-mounted hidden measurement body renders inside the provider — Plan 04-08) and the placeholder's first match can be the hidden clone
- **Fix:** unit cell realigned with the D20-01/D12-16-retirement citation (figures stay FigureBlocks; the zero-beacon property re-pinned as "no src key carries a remote URL" + originalSrc provenance); e2e selectors realigned to the 20-04 happy-path discipline (count > 0 + first() + naturalWidth poll)
- **Files modified:** tests/unit/server/epub-to-books.spec.ts, tests/e2e/epub-intake.spec.ts
- **Verification:** 36/36 unit; 41/1/0 e2e 3-engine
- **Committed in:** da7b4b9 + 71fd8ec

**3. [Rule 3 - Pre-existing blocker surfaced] WebKit Blob→IndexedDB boundary on the admitted-figure e2e cell**
- **Found during:** Task 2 3-engine run
- **Issue:** the render cell's saveBook writes a D20-15 `data: Blob` asset row — Playwright's WebKit refuses ALL Blob puts into IndexedDB (UnknownError; plain `new Blob(["hello"])` fails identically — re-probed). Pre-existing (20-04's happy-path asset cell fails on webkit today; deferred-items.md documented the boundary and prescribed exactly this handling for 20-06)
- **Fix:** documented `test.skip(browserName === "webkit")` mirroring the 20-05 pattern, with the chromium+firefox proof carrying the flow; deferred-items.md residual count updated 2 → 3; the refused-figure cell needs NO skip (green on webkit)
- **Files modified:** tests/e2e/epub-intake.spec.ts, .planning/phases/20-safe-local-image-fidelity/deferred-items.md
- **Verification:** epub-intake 3-engine: 41 passed / 1 skipped / 0 failed
- **Committed in:** 71fd8ec

---

**Total deviations:** 3 auto-fixed (1 blocking seam generalization, 2 honest realignements incl. one pre-existing engine boundary handled per the phase ledger)
**Impact on plan:** All three were required to execute the plan's own mandates (reuse-not-fork, honest realignment, 3-engine gate) — no scope creep; one file beyond the plan's list (assetStage.ts, +14 lines, default byte-stable).

## Issues Encountered

- The fixture self-check caught a deflated-OPF discriminator invisibility on first run (coverMetaBook's `name="cover"` marker) — fixed by storing that OPF, the entityBombOpf/protoPollutionOpf precedent
- A hand-crafted minimal animated GIF first reported `animated: false` against is-animated@2.0.2 — traced to malformed block structure (missing sub-block length byte / short GCE), rebuilt correctly and verified against the real libs before embedding
- jsdom returns the RAW attribute from `img.src` for relative srcs under the about:blank base (probe-verified) — the marker approach's precondition held exactly as 20-02 designed it

## User Setup Required

None — no external services, no new packages (composition over 20-01/02/04 outputs; the fixture image bytes are hand-assembled constants verified against the pinned sniff libraries).

## Threat Surface

All five threat-register mitigations landed as planned: T-20-23 (isSafeEntryName on every composed key before byte use — the entries map is the only read source), T-20-24 (sniffImageAsset authoritative raster-only gate — the SVG fixture cell), T-20-25 (MAX_ASSET_PIXELS decode-bomb stop — the IHDR-patched 65536² cell), T-20-26 (MAX_ARTICLE_ASSET_BYTES per-book guard, over-budget per-figure refusal — Pitfall 6), T-20-27 (zero-network extraction + asset-only rendering — the fetch-stubbed unit cell + the refused remote-src treatment). No new security-relevant surface beyond the plan's threat model.

## Next Phase Readiness

- 20-07 (corpus cap re-check + full-suite gate) must count the 3 documented e2e webkit skips (2 from 20-05 + 1 from this plan) and owns the open Rule-4 Blob-row decision per deferred-items.md
- 20-08 (verification) can exercise the EPUB figure path with renderedFigureBook/refusedFigureBook exactly like the article path; the epub-intake 20-06 cells are the template
- The whole phase-20 ingestion story is now uniform: every intake format's figures are local assets or calm disclosed refusals; the renderer's one-surface guarantee covers all of them

## Self-Check: PASSED

- Modified files exist: server/epubToBooks.ts ✓, server/assetStage.ts ✓, server/ingest.ts ✓, tests/unit/server/epub-fixtures.ts ✓, tests/unit/server/epub-to-books.spec.ts ✓, tests/e2e/epub-intake.spec.ts ✓
- All three task commits present in git log: da7b4b9, e0391d6, 71fd8ec ✓
- Verification commands re-run: `npx vitest run tests/unit/server/epub-to-books.spec.ts tests/unit/server/ingest-epub.spec.ts` → 61/61 ✓; full unit suite → 1577 passed / 0 failed / 13 documented skips ✓; `npx playwright test tests/e2e/epub-intake.spec.ts --project=chromium --project=firefox --project=webkit` → 41 passed / 1 documented skip / 0 failed ✓; happy-path chromium (cross-check) 3/3 ✓
- Acceptance greps: `rg downgradeFigures server/epubToBooks.ts` → 0 ✓; sniffImageAsset ×3 / rewriteFiguresWithAssets ×3 / figureSrcResolver ×4 ✓; EpubIngestionSuccess.assets exposed ✓; zero fetch/safeFetch in epubToBooks ✓; no cover-meta reading code path ✓

---
*Phase: 20-safe-local-image-fidelity*
*Completed: 2026-08-31*
