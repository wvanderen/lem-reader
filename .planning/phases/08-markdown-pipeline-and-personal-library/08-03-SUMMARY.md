---
phase: 08-markdown-pipeline-and-personal-library
plan: 03
subsystem: ui
tags: [library, react, typescript, personal-library, search, tag-filter, source-badge, progress-hairline, continue-reading, css]

# Dependency graph
requires:
  - phase: 08-markdown-pipeline-and-personal-library
    provides: ArticleSchema.tags field + ArticleSourceSchema widened to 5 variants (Plan 01)
  - phase: 08-markdown-pipeline-and-personal-library
    provides: tagsStore.loadAllTags + loadAllLocations (Plan 02)
  - phase: 07-ingestion-pipeline
    provides: compositeLibraryRepository (UNION of fixtures + Dexie-persisted ingested), ProgressHairline component, IngestControl
provides:
  - LibraryView — default route component at #/ replacing FixtureList; composes ContinueReadingStrip + LibrarySearch + TagFilter + library list of LibraryRow items
  - LibraryRow — per-row article card extending FixtureList `<li>` byte-stably (Pitfall 8-5); carries SourceBadge + ProgressHairline + FinishedMark + display-only tag chips + optional onRemove hook
  - SourceBadge — five-variant per-row source indicator (Sample/Web/Pasted/Markdown/HTML file) with LIB-05 source link
  - ContinueReadingStrip — 1-3 most-recently-opened unfinished articles derived from loadAllLocations; exports FINISHED_THRESHOLD = 0.98
  - LibrarySearch — controlled `<input type="search">` with filter-on-keystroke (D8-06)
  - TagFilter — auto-pruned single-select chip strip with aria-pressed state (D8-07/D8-08)
  - libraryFilter — pure filter helper (filterLibrary + domainOf + LibraryFilter interface)
  - Library CSS layer in app.css (additive selectors only — :root tokens untouched)
affects: [08-04 (LibraryRemoveConfirm wires LibraryRow onRemove; TagEntry wires setArticleTags), 08-05 (full-suite e2e verifies SC#1 regression targets + library chip filter + continue-reading strip)]

# Tech tracking
tech-stack:
  added: []
  patterns: [byte-stable superset pattern (FixtureList markup preserved verbatim inside LibraryView per Pitfall 8-5), pure filter helper separate from React state (libraryFilter.ts is grep-able + unit-testable in plain Node), aria-pressed for state-beyond-color (forced-colors safety — mirrors Phase 5 mark.unresolved discipline), articleId-keyed latest-location Map for per-row hairline derivation, parallel Promise.all load on mount (listArticles + loadAllLocations + loadAllTags)]

key-files:
  created:
    - src/ingestion/library/LibraryView.tsx
    - src/ingestion/library/LibraryRow.tsx
    - src/ingestion/library/SourceBadge.tsx
    - src/ingestion/library/ContinueReadingStrip.tsx
    - src/ingestion/library/LibrarySearch.tsx
    - src/ingestion/library/TagFilter.tsx
    - src/ingestion/library/libraryFilter.ts
    - tests/unit/library-search.test.ts
  modified:
    - src/App.tsx
    - src/app.css
  renamed:
    - src/routes/FixtureList.tsx → src/routes/LegacyFixtureList.tsx (preserved for reference; no live production imports)
    - tests/component/FixtureList.test.tsx → tests/component/LegacyFixtureList.test.tsx (companion legacy test renamed atomically)

key-decisions:
  - "LibraryView is a SUPERSET of FixtureList per Pitfall 8-5 — the byte-stable regression targets (<h1>Saved articles</h1>, <ul><li><a href='#/article/{id}'>Open article</a>, <h2 id='title-{id}'> + aria-labelledby, main#main, .status live region) are preserved verbatim. LibraryRow carries these stable elements as siblings inside the <li>; new chrome (SourceBadge, hairline, finished mark, tag chips) is additive, not structural."
  - "LibraryFilter is a pure function over CanonicalArticle[] (RESEARCH §Code Examples Example 5 verbatim). No Dexie, no React state — the unit suite runs in plain Node without a DOM emulator. filterLibrary applies tag filter (D8-07 AND-style) and query filter (D8-06 title+author+domain+tag-names) compositionally; both must pass."
  - "SourceBadge uses an exhaustive switch over the closed ArticleSourceSchema enum with NO default clause — when Phase 11 widens to 'pdf' or 'epub-chapter', TypeScript will flag the unhandled case here. The five variants are Sample/Web/Pasted/Markdown/HTML file per UI-SPEC §SourceBadge."
  - "LibraryRow accepts an optional `onRemove?: () => void` prop but renders NO remove button by default in Plan 03 — Plan 04 (LibraryRemoveConfirm) wires it without re-editing this file. Display-only tag chips (D8-05) are <span className='tag-chip tag-chip-readonly'> — no edit affordance on the row."
  - "ContinueReadingStrip returns null while loading OR when the unfinished set is empty — spare chrome per UI-SPEC §ContinueReadingStrip. The strip never widens beyond single column (grid-template-columns: 1fr) so it does not compete with the main 1/2/3-column list."
  - "Rule 3 deviation: plan action specifies a default sort by `addedAt`, but CanonicalArticle does not carry that field (it lives only on the Dexie row type annotation). LibraryView keeps the composite-library order (ingested-first, then fixtures — already natural 'recently-added first'). The original FixtureList did not sort either; v1.0 e2e tests assert row COUNT, not order."
  - "FixtureList renamed (not deleted) to LegacyFixtureList.tsx per plan option A; the companion component test renamed atomically to LegacyFixtureList.test.tsx so both stay green together as 'legacy reference'. No live production imports reference FixtureList; App.tsx uses LibraryView."

patterns-established:
  - "Byte-stable superset: when replacing a v1.0 component, copy the regression-target structure verbatim and add new chrome as siblings (not structural changes). Pitfall 8-5 discipline."
  - "Pure filter helper + controlled input split: libraryFilter.ts owns the predicate (grep-able, unit-testable in Node); LibrarySearch.tsx owns the controlled input (stateless, parent lifts query). Mirrors the IngestControl form discipline."
  - "aria-pressed for state-beyond-color: interactive chip strips convey active state via aria-pressed={bool} + CSS attribute selector [aria-pressed='true'] flipping border + text. Survives forced-colors modes (UI-SPEC §Interaction 10)."
  - "Exhaustive switch over closed Zod enum with no default: SourceBadge's badgeLabel switch over ArticleSourceSchema forces TypeScript to flag future enum widenings. The compiler is the regression gate."
  - "Optional prop as forward-compat hook: LibraryRow.onRemove?: () => void is undefined by default → no remove button in Plan 03; Plan 04 wires it without re-editing this file. Avoids speculative UI."

requirements-completed: [LIB-01, LIB-03, LIB-05, LIB-06]

# Metrics
duration: 11min
completed: 2026-08-13
status: complete
---

# Phase 8 Plan 03: Personal Library View Summary

**LibraryView replaces FixtureList as the default `#/` route — composing ContinueReadingStrip + LibrarySearch + TagFilter + LibraryRow (with byte-stable FixtureList structure per Pitfall 8-5) over the shipped composite library, locationStore, and tagsStore.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-08-13T02:14:02Z
- **Completed:** 2026-08-13T02:25:37Z
- **Tasks:** 3
- **Files modified:** 10 (8 created, 2 modified, 2 renamed)

## Accomplishments
- Shipped `LibraryView` as the default route component — superset of FixtureList per Pitfall 8-5; the byte-stable regression targets (`<h1>Saved articles</h1>`, `<ul><li><a href="#/article/{id}">Open article</a>`, `<h2 id="title-{id}">` + `aria-labelledby`, `main#main`, `.status` live region) are preserved verbatim. Composes ContinueReadingStrip + LibrarySearch + TagFilter + the library list of LibraryRow items.
- Shipped pure `libraryFilter.ts` (RESEARCH §Code Examples Example 5 verbatim): `filterLibrary` applies D8-07 single-tag AND filter + D8-06 query filter (title + author + source-domain via `domainOf` + tag-names); both compose. 16-test unit suite covers all paths including tag AND query composition + domainOf edge cases.
- Shipped `LibrarySearch` (controlled `<input type="search">` with filter-on-keystroke, visually-hidden label for SR context) + `TagFilter` (auto-pruned single-select chip strip with `aria-pressed` state for forced-colors safety — returns null when no tags exist).
- Shipped `SourceBadge` with exhaustive 5-variant switch over the closed `ArticleSourceSchema` enum (Sample/Web/Pasted/Markdown/HTML file). LIB-05 source link wraps the badge text for url + paste variants via `<a rel="noreferrer noopener" target="_blank">` (T-8-12 mitigation — httpUrl-refined at parse time, no javascript:/data: can reach the link).
- Shipped `LibraryRow` extending FixtureList `<li>` byte-stably + SourceBadge + ProgressHairline (D8-11, when 0<ratio<0.98) + FinishedMark (D8-12, ratio>=0.98, filled-circle glyph + text for forced-colors) + display-only tag chips (D8-05) + optional onRemove hook for Plan 04.
- Shipped `ContinueReadingStrip` deriving 1-3 most-recently-opened unfinished articles from listArticles + loadAllLocations; sorts by savedAt descending; exports `FINISHED_THRESHOLD = 0.98`. Returns null while loading OR when the unfinished set is empty.
- App.tsx one-line swap (`FixtureList` → `LibraryView`); parseHash + hashchange + Gap 3 fragment guard byte-unchanged. FixtureList.tsx preserved as LegacyFixtureList.tsx (renamed; companion component test renamed atomically).
- Library CSS layer added to `app.css` — ADDITIVE selectors only (:root tokens untouched). `.library-list` is byte-identical to `.fixture-list` (renamed responsive grid); `.library-row`, `.source-badge`, `.finished-mark`, `.library-row-tags`, `.continue-reading-strip`, `.library-search`, `.tag-filter`, `.tag-chip` + `[aria-pressed="true"]` active state + `.tag-chip-readonly` display variant all declared.
- Full Vitest suite green: 726 passed / 0 failed / 7 skipped (+16 new from library-search.test.ts; zero Phase 7 regressions).
- `tsc && vite build` green; client bundle delta +4.20 KB (659.17 KB → 663.37 KB — the library components + ContinueReadingStrip loader enter the client bundle as expected).

## Task Commits

Each task was committed atomically:

1. **Task 1: libraryFilter helper + LibrarySearch + TagFilter + unit tests** — `9b17ab3` (feat)
2. **Task 2: SourceBadge + LibraryRow + ContinueReadingStrip** — `bcf4149` (feat)
3. **Task 3: LibraryView + App.tsx swap + app.css + FixtureList removal** — `dc98fc6` (feat)

_Note: All three tasks are `type="auto"` (not TDD); each is a single commit._

## Files Created/Modified
- `src/ingestion/library/libraryFilter.ts` — NEW. `filterLibrary(articles, filter)`, `domainOf(url)`, `LibraryFilter` interface. Pure function — no Dexie, no React state. (110 lines)
- `src/ingestion/library/LibrarySearch.tsx` — NEW. Controlled `<input type="search">` lifting query to parent on every keystroke; visually-hidden label for SR context. Stateless.
- `src/ingestion/library/TagFilter.tsx` — NEW. Auto-pruned single-select chip strip; `aria-pressed={bool}` state beyond color (forced-colors safety); returns null when no tags.
- `src/ingestion/library/SourceBadge.tsx` — NEW. Exhaustive 5-variant switch over ArticleSourceSchema (no default); LIB-05 source link for url/paste variants.
- `src/ingestion/library/LibraryRow.tsx` — NEW. Byte-stable FixtureList `<li>` extension (h2 id + aria-labelledby + Open article link) + SourceBadge + ProgressHairline + FinishedMark + display-only tag chips + optional onRemove hook.
- `src/ingestion/library/ContinueReadingStrip.tsx` — NEW. Derives 1-3 most-recently-opened unfinished articles via listArticles + loadAllLocations; exports `FINISHED_THRESHOLD = 0.98`; returns null when empty.
- `src/ingestion/library/LibraryView.tsx` — NEW. Default route at `#/` replacing FixtureList. Composes the seven new components. Parallel Promise.all load on mount (listArticles + loadAllLocations + loadAllTags). D8-04 empty state. (160 lines)
- `tests/unit/library-search.test.ts` — NEW. 16 tests: empty filter, title/author/domain/tag matches, tag AND query composition, nonexistent tag, input not mutated, whitespace-only query, domainOf edge cases (undefined, empty, non-URL, subdomain, bare domain).
- `src/App.tsx` — import swap `FixtureList` → `LibraryView` (L22) + JSX swap (L192). Stale header comment updated. parseHash + hashchange + Gap 3 fragment guard byte-unchanged.
- `src/app.css` — ADDITIVE library CSS selectors appended (new class hooks only; :root tokens untouched). `.library-list` is the renamed `.fixture-list` grid (byte-identical responsive 1/2/3 cols at 640/1024px).
- `src/routes/LegacyFixtureList.tsx` — RENAMED from `FixtureList.tsx` (preserved for reference; no live production imports).
- `tests/component/LegacyFixtureList.test.tsx` — RENAMED from `FixtureList.test.tsx` (companion legacy test; import updated to `LegacyFixtureList`).

## Decisions Made
- **LibraryRow accepts `onRemove?: () => void` but renders NO remove button by default.** Plan 03 ships the row without a remove affordance; Plan 04 wires it via this hook without re-editing this file. Avoids speculative UI + keeps the row byte-stable for SC#1 e2e tests in 08-05.
- **SourceBadge uses an exhaustive switch with no default clause over the closed ArticleSourceSchema enum.** When Phase 11 widens to "pdf" or "epub-chapter", TypeScript will flag the unhandled case here — the compiler is the regression gate. The five variants are exhaustive today per Plan 01.
- **The ContinueReadingStrip loader sorts by `savedAt` descending (most-recently-opened first).** D8-10 says "opening counts" — `savedAt` is updated on every open via `saveLocation` (already shipped in Phase 2), so the strip ordering reflects reading activity, not just first-open.
- **LibraryView uses a parallel `Promise.all([listArticles, loadAllLocations, loadAllTags])` on mount.** Each is independent; the parallel load minimizes waterfall latency. The catch falls through to the existing FixtureList error path ("Couldn't open this article.") so SC#1 e2e tests still see the byte-stable status region.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Test fixture used non-existent `runs` field on ParagraphBlock**
- **Found during:** Task 1 (running `npm run build` to verify the unit suite)
- **Issue:** Initial test helper used `{ kind: "paragraph", runs: [{ type: "text", text: "body" }] }`, but the v1.0 ParagraphBlock schema uses `content: InlineRun[]` where InlineRun is `{ text, marks? }`. The `as CanonicalArticle` cast also failed TS2352 (insufficient overlap) because the inline-run shape was wrong.
- **Fix:** Rewrote `makeArticle` to construct via `ArticleSchema.parse({...})` so the test data is Zod-validated at construction (single source of truth — the schema is authoritative). The block shape is now `{ kind: "paragraph", content: [{ text: "body" }] }` and the schema supplies the default `marks: []` + `footnotes: []` + `tags: []` automatically.
- **Files modified:** `tests/unit/library-search.test.ts`
- **Verification:** `npm run build` exits 0; `npm run test:unit -- --run tests/unit/library-search.test.ts` 16/16 passed.
- **Committed in:** `9b17ab3` (Task 1 commit)

**2. [Rule 3 — Blocking] CanonicalArticle does not carry `addedAt` — LibraryView default sort fell back to composite-library order**
- **Found during:** Task 3 (writing LibraryView)
- **Issue:** The plan action specified a default sort `items.sort((a, b) => (a.addedAt ?? "").localeCompare(b.addedAt ?? ""))` reversed, but `CanonicalArticle` does not carry an `addedAt` field — it lives only on the Dexie row type annotation (`db.articles: Table<{ ..., addedAt?: string, ... }>`). The sort would be a TypeScript error.
- **Fix:** LibraryView keeps the composite-library order (ingested-first, then fixtures — `compositeLibraryRepository.list()` already returns the natural "recently-added first" order since it iterates ingested first). The original FixtureList did not sort either; v1.0 e2e tests assert row COUNT, not order. Documented the deviation in a header comment on LibraryView.
- **Files modified:** `src/ingestion/library/LibraryView.tsx`
- **Verification:** `npm run build` exits 0; `npm run test:unit -- --run` 726/726 passed.
- **Committed in:** `dc98fc6` (Task 3 commit)

**3. [Rule 3 — Blocking] Component test imports FixtureList after rename**
- **Found during:** Task 3 (renaming FixtureList.tsx → LegacyFixtureList.tsx)
- **Issue:** The plan said "rename FixtureList.tsx to LegacyFixtureList.tsx" but the v1.0 component test `tests/component/FixtureList.test.tsx` imports `FixtureList` from `../../src/routes/FixtureList`. After the rename, the import breaks the build.
- **Fix:** Renamed the test atomically to `tests/component/LegacyFixtureList.test.tsx` and updated its import to `from "../../src/routes/LegacyFixtureList"`. The legacy component + its dedicated isolation test stay green together as "reference"; no live production code references either. The byte-stable invariants the test asserts (Saved articles heading, Open article links, loading/error copy) are now ALSO covered by LibraryView + the v1.0 e2e suite.
- **Files modified:** `tests/component/LegacyFixtureList.test.tsx` (renamed from FixtureList.test.tsx)
- **Verification:** `npm run test:unit -- --run` 726/726 passed (the legacy component test still runs and passes against the legacy component).
- **Committed in:** `dc98fc6` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (3 blocking-issues — all direct consequences of the planned work; no scope creep)
**Impact on plan:** All three fixes are required for the build/type system to accept the planned code. The `addedAt` field is genuinely not on the type the plan referenced; the test fixture shape correction is required because the schema is the single source of truth; the test rename is required because the production code was renamed. No silent workarounds.

## Issues Encountered
None beyond the three Rule 3 deviations above.

## User Setup Required
None — no external service configuration required. The plan ships only client-side React components + a pure helper + additive CSS selectors. All data sources (`listArticles`, `loadAllLocations`, `loadAllTags`, `compositeLibraryRepository`) are already shipped and Zod-validated (STATE-04).

## Next Phase Readiness
- Plan 04 can wire `LibraryRemoveConfirm` to `LibraryRow.onRemove` without re-editing LibraryRow.tsx — the optional prop is the forward-compat hook.
- Plan 04 can wire `TagEntry` (in ArticleView) to `setArticleTags` from Plan 02; the per-row display-only tag chips already render any tags the article carries.
- Plan 05's full-suite e2e run will exercise the SC#1 regression targets (Saved articles heading, Open article links, h2+aria-labelledby pattern) against the new LibraryView — they should pass byte-stably because the structure is preserved per Pitfall 8-5.
- No blockers.

## Threat Flags

None. The new surface (LibraryView + sub-components) is fully covered by the existing `<threat_model>` in the plan:
- T-8-10 (Tampering/XSS, tag chip rendering) → tag names render as React text children (`<span>{tag}</span>`); React escapes text by default. No `dangerouslySetInnerHTML` (repo-wide lint gate). Verified in TagFilter.tsx + LibraryRow.tsx.
- T-8-11 (Info Disclosure, stale location row) → `loadAllLocations` Zod-validates every row (STATE-04); the articleId-keyed Map only matches locations to articles that exist in the composite library list. Verified in ContinueReadingStrip.tsx + LibraryView.tsx.
- T-8-12 (Tampering, SourceBadge link href injection) → `article.provenance.sourceUrl` is `httpUrl`-refined at ArticleSchema parse time (only http(s) URLs survive — Pitfall 5). The `<a rel="noreferrer noopener" target="_blank">` prevents reverse-tabnabbing. Verified in SourceBadge.tsx.
- T-8-13 (Spoofing, fixture appears as ingested) → the source badge derives from `article.ingestionMeta?.source ?? "fixture"`; the field is Zod-validated at ingest time. No spoofing surface in Plan 03.

No new security-relevant surface introduced beyond what the threat register anticipated.

---

*Phase: 08-markdown-pipeline-and-personal-library*
*Completed: 2026-08-13*

## Self-Check: PASSED

- All `key-files.created` exist on disk (`src/ingestion/library/LibraryView.tsx`, `LibraryRow.tsx`, `SourceBadge.tsx`, `ContinueReadingStrip.tsx`, `LibrarySearch.tsx`, `TagFilter.tsx`, `libraryFilter.ts`, `tests/unit/library-search.test.ts`).
- All `key-files.modified` exist with the planned changes (`src/App.tsx`, `src/app.css`).
- Renames verified: `src/routes/FixtureList.tsx` → `src/routes/LegacyFixtureList.tsx` (preserved); `tests/component/FixtureList.test.tsx` → `tests/component/LegacyFixtureList.test.tsx` (companion renamed atomically).
- All three task commits present in git log: `9b17ab3` (Task 1, feat), `bcf4149` (Task 2, feat), `dc98fc6` (Task 3, feat).
- Re-ran `npm run test:unit -- --run tests/unit/library-search.test.ts` → 16/16 passed.
- Re-ran `npm run test:unit -- --run` → 726 passed / 0 failed / 7 skipped (zero regressions; +16 new from library-search.test.ts).
- Re-ran `npm run build` → tsc + vite build both green; client bundle delta +4.20 KB (659.17 → 663.37 KB — library components enter the client bundle as expected).
