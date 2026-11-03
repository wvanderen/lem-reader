# Long-work pagination — implementation plan

Status: the first **block-aligned body-prose vertical slice** is implemented; the full foundational step and long-work release are not yet complete. This plan follows the [confirmed product design](collections-and-long-works.md). Deliver long-work reading before Collections; do not require a new import or change saved article identities.

## First vertical slice: implemented scope

- `src/pagination/blockWindow.ts` partitions ordinary body blocks into ephemeral windows of at most 32 blocks / 8,000 graphemes. `MeasurementResult.scope` retains the article ID, revision, and original block range; the existing fragmenter validates and consumes those scoped rows.
- `src/reader/WindowedPaginatedSurface.tsx` measures only the requested window, retains the last visible page while loading, and supports neighboring turns and direct global-passage navigation. Pages and measurements are not persisted. Predecessors are remeasured on demand, not cached without bound.
- Saved identity, canonical text, and annotation coordinates remain unchanged. Work-level boundary state prevents intermediate-window completion; local page counts are explicitly labeled “in this portion.” Restore, TOC/annotation jumps, and spoken following resolve the target window first.
- Synthetic regressions cover a source that exceeds the unchanged 300-page bound, exact ordered block coverage, saved highlights/positions, both boundary directions, one-page-window focus, delayed font-gated reflow, and uninterrupted same-article speech. A stale overflow-repair frame now rejects newer page DOM instead of misreading it against older source slices.

**Required next foundation work:** intra-block source cursors, repeated giant-block splitting, footnote traversal, and capacity-driven continuation within an oversized scope. Until those exist, articles with footnote bodies or individual blocks over the source bound remain on the existing reader path rather than being newly admitted to an incomplete or unbounded windowed view. This is an explicit implementation-stage restriction, not a change to the confirmed product scope. Stable chapters/reading parts, structural persistence/portability, cross-article EPUB handoff, and Collections are not implemented here.

### Local verification of this slice

Verification used Node 22:

- Production build, typecheck, ESLint (excluding unrelated untracked `.github/skills/` scripts), the no-dangerous-HTML gate, and E2E coverage discovery passed. Unqualified `npm run lint` is blocked by errors in those unrelated scripts; they were not edited.
- 29 targeted unit/component files passed: 366 tests, including pagination/measurement, location and selector mapping, and reader orchestration.
- The affected Chromium/Firefox browser run passed 50 tests, with four existing WebKit-only cases intentionally skipped. The six new long-work cases also passed a final 12-execution rerun, including coalesced repeated-key focus handoff.
- Calibration sampling passed for Chromium/Firefox; performance sampling passed for those engines plus throttled Chromium. These are local harness results, not a completed reference-machine budget gate. No fingerprint or approved budget was rewritten.
- WebKit cannot launch on this host because `libicudata.so.74` is missing. Full three-engine/reference calibration and performance verification remains required before release.

## Approach

Keep the complete canonical work as the source of truth, but render, measure, and paginate only a bounded source range around the requested passage. Distinguish three things:

1. **Chapters:** identified content structure, with reliable publisher divisions preferred over heading-derived structure.
2. **Reading parts:** stable, content-based subdivisions for manageable reading. Their boundaries do not depend on current font, viewport, or page count.
3. **Layout windows:** temporary bounded measurement/pagination work inside a reading part. A window may end before its part does and changes with layout constraints. It is not a library item, collection target, or reader-visible structural division.

This distinction makes the agreed guarantees compatible: a reading part can remain stable when large text requires more pages, while the engine works in smaller windows without returning a length-only scrolling fallback.

Do not increase/remove the 300-page safety bound, create child articles from an existing web work, concatenate existing EPUB chapters into a replacement article, or split only after whole-work measurement.

## Code findings that constrain implementation

| Existing behavior | Evidence | Required change |
| --- | --- | --- |
| Entire body stays mounted in the hidden measurement tree, including before the first paginated commit. | `src/routes/ArticleView.tsx`, paginated-active and paginated-pending branches | Replace the full-body clone in paged mode with the requested bounded source range. Keep scrolling's full semantic body. |
| DOM measurement requires one row for every article block. | `src/measurement/domMeasurer.ts:measureAllBlocks`, `src/measurement/engine.ts:MeasurementEngine.run` | Give a measurement an explicit scope and source mapping. A valid partial measurement must not be mistaken for a broken full-article measurement. |
| Fragmentation walks all blocks, derives their text/lengths, and discards all pages when page 301 is produced. | `src/pagination/fragment.ts:paginateDocument` | Add bounded range/cursor pagination with successful continuation, while keeping genuine failure and zero-progress protection. |
| Overflow repair has another 300-page guard and currently checks that guard before checking whether the displayed page actually overflows. | `src/pagination/overflowGuard.ts:refragmentOverflowingPage` | Keep repair local to a layout window; check actual overflow first and handle exhausted window capacity as continuation rather than a whole-work failure. |
| The page fragment already addresses original block indices and intra-block graphemes. | `src/pagination/types.ts`, `src/pagination/fragmentRenderer.tsx` | Retain original source coordinates. Never render a sliced pseudo-article whose block zero is a different original block. |
| Last page of a multi-page array pins the saved offset to the article's full end. | `src/pagination/anchor.ts:pageAnchorOffset`, `src/reader/readingPosition.ts`, `src/pagination/progress.ts` | Array/window end is not work end. End-pin only when the committed page genuinely reaches the work end, preserving the one-page-on-open rule. |
| TOC/annotation/restore jumps and spoken following search only the current page array, whose last page accepts all later offsets. | `src/pagination/anchor.ts:fragmentContainingOffset`, `src/reader/jumpToOffset.ts`, `src/reader/useReadAloudFollow.ts` | Resolve a global passage through the reader's navigation seam, loading its window before page lookup. An unloaded target must not clamp to the current window's last page. |
| Chapter-end chrome and Mark read and close use local page-number equality. | `src/routes/ArticleView.tsx:handleAnchorChange` and chapter-navigation render branches | Publish absolute work/chapter boundary state independently of local page numbers. |
| Current TOC entries are derived heading destinations, not durable chapter identities. | `src/content/toc.ts:deriveToc`, `src/content/schema.ts:HeadingBlock` | Retain the existing heading TOC while adding validated, honest structural destinations. Duplicate titles are not identifiers. |
| Sanitization discards source element IDs; canonical headings contain only level/content. | `server/htmlToBlocks.ts:SANITIZE_CONFIG`, heading walk; `src/content/schema.ts` | Capture only validated structural evidence while source DOM is available; do not depend on source IDs surviving into rendered HTML. |
| Footnote bodies participate in normalized text, but the page renderer/fragmenter walks body blocks only. | `src/content/normalizeText.ts:normalizeText`, `src/content/render/BlockRenderer.tsx:ArticleBody`, `src/pagination/fragmentRenderer.tsx:PageFragmentView` | Include footnote bodies in paginated source traversal and navigation without moving them into `article.blocks` or changing normalized text. |
| Speech lifecycle ends on article change; existing EPUB chapter transitions are explicit links. | `src/reader/useReadAloud.ts`, `src/routes/ArticleView.tsx:chapterContext` | Same-article window transitions must not recreate speech. Continuous whole-book reading needs an explicit book-aware handoff across existing chapter article IDs. |

A manual guarded-ingestion smoke check of the reference URL returned HTTP 200, 1,466 extracted blocks, no extracted footnote bodies, and one disclosed extraction limitation. Its first page opened successfully in the new paginated path with an 11-block measurement window and no pagination fallback. This verifies initial reading, not complete traversal or the historical failure's exact cause; the old source-specific 300-page-ceiling diagnosis remains unconfirmed. The deterministic synthetic regression separately demonstrates the ceiling in full-document pagination.

## Module interfaces and invariants

### Reading structure: content, not layout

Add a small pure reading-structure module under `src/content/` with operations to derive/validate a structure and resolve a canonical offset to its chapter/reading part.

- Consume the unchanged canonical article and optional validated source outline evidence.
- Use `articleGraphemeIndex`, `blockNormalizedText`, `graphemeClusters`, and the existing raw/normalized mapping. Do not introduce another text-normalization algorithm.
- Express destinations as source ranges and distinguish publisher-authored chapters, heading-derived sections, and generated reading parts. A heading is not automatically proof of an author-written chapter.
- Prefer meaningful block boundaries. When a single splittable block is too large, use safe intra-block grapheme boundaries, preferring sentence/list-item/paragraph structure when available. Preserve nested markup and list numbering through the shared slicing implementation.
- Retain leading text, trailing text, empty-text visual blocks, unsupported placeholders, and footnotes. A zero-length text range does not imply that a figure or other visible block can be dropped.
- Validate complete ordered coverage and prohibit overlapping/gapped or out-of-bounds ranges. Account for canonical separators explicitly; they are coordinate glue, not duplicated visible prose.
- Use revision-scoped stable identifiers derived from source identity/range, not titles, heading ordinal alone, or page indices. Duplicate headings remain distinct destinations.

Persist optional versioned structural metadata on the existing article record, without changing its ID, revision, canonical blocks, normalized text, provenance hash, or annotation selectors. This is a content-division snapshot, not a persisted page layout. Freeze an established snapshot instead of regenerating its identifiers during every typography change or after a generator update. Legacy records derive a safe structure from their saved canonical content; no refetch or invented publisher evidence.

Where no structural snapshot has been saved, rendering can use the same deterministic derivation immediately; failure to persist metadata must surface honestly without destroying reading access. Any lazy write must transact against the matching article revision and preserve concurrent reader metadata edits, not put a stale full article row.

### Range pagination: bounded source in, pages plus continuation out

Refactor the current pagination implementation behind a range-aware interface rather than creating a second paginator. Retain a full-document wrapper for existing short-document callers/tests while they migrate.

Inputs include the original article, a validated source range/cursor, scoped measurement, layout constraints, the existing diagnostic bus, cancellation, and the work-start chrome reserve only when actually at work start.

Results distinguish:

- Successful pages with exact source coverage and an explicit continuation cursor when the requested range has more content.
- Genuine unpageable-content or processing failure with a typed reason and passage context.
- Cancellation/supersession, which never publishes a replacement view or reader-facing error.

A window reaching its work/page capacity is a successful bounded result, not `dom-fallback`. A continuation must advance the source cursor; zero progress still terminates. A giant paragraph/list/blockquote must support repeated splitting, not one before/after split followed by an oversized unprocessed tail.

Scoped measurements carry original source identities and slice origins. Validate their scope and constraints, not only row count. No full-article placeholder measurement array, local block-index renumbering, or cross-scope reuse of a trusted result.

Extend ephemeral fragment source descriptors for footnote bodies explicitly; do not forge footnotes into the canonical block list. Preserve existing block-entry coordinates and capture behavior. Footnote readability/navigation is required; this work does not silently expand annotation eligibility to footnote bodies.

### Reader navigation: passage-based, scope-aware

Put window scheduling and transition behavior behind one reader navigation module. Callers request a canonical passage or a next/previous page; they do not choose a window, translate offsets, or interrogate an incomplete page array themselves.

- Resolve the chapter/part and bounded window containing a passage, render/measure it, then commit the matching page.
- Keep the last valid visible page while preparing its replacement. Tie every asynchronous result and focus action to article/revision, source scope, layout constraints, and a request generation.
- Cancel or ignore stale work on new jumps, rapid turns, typography changes, article swaps, or mode changes. A stale result must not save position or move focus.
- Keep a bounded cache of current/recent/adjacent windows. Prefetch a neighbor only after current reading is usable; never paginate all prior parts to jump near the end.
- Remember enough session-local history for Previous to return through recently visited windows. When direct entry has no preceding cached window, build only a bounded predecessor range and align its end with the current start; do not reconstruct the work from offset zero.
- Route TOC, restore, deep links, annotation navigation, spoken following, and Jump to spoken position through the same passage operation.
- Distinguish user turns, explicit jumps, restoration, and speech follow so focus, announcements, motion, and follow suspension preserve their existing contracts.
- Existing local page arrays remain implementation detail for rendering/overflow repair, not a public answer to whether an arbitrary work-global passage has been loaded.

Publish state containing chapter/part orientation, local page count with explicit scope, global anchor/progress, and absolute start/end flags. Continue to derive overall positional progress from canonical offsets, not local page counts. A local page denominator must describe a fully laid-out bounded scope, not the unmeasured remainder of a chapter/part.

## Ordered implementation slices

Each slice should land with its tests and an observable caller path. Do not build unused abstractions or expand Collections implementation in parallel with reader identity work.

### 0. Establish the regression and fixtures

- Add deterministic generated canonical fixtures exceeding the present page ceiling, a headingless work, a giant single splittable block, nested lists/quotations, duplicate headings, and footnote bodies.
- Add a small sanitized HTML fixture modeling the reference source's conflicting index/heading structure. Prefer synthetic structure and short passages over committing an entire copyrighted book; no live-network dependency in CI.
- Make the fallback reason observable in the DEV pagination diagnostic and assert which guard trips. Do not infer the reason from the current generic banner.
- During implementation, fetch/ingest the reference URL through the existing guarded pipeline and reproduce the real failure in a targeted Playwright run. Record extraction and actual pagination outcomes separately. Do not let a source/network failure block deterministic coverage or claim it verifies the reader.

**Exit:** a failing regression proves that ordinary long prose currently loses paged mode, and the original fixture suites remain the short-document baseline.

### 1. Bounded source pagination and measurement

- Introduce range/cursor contracts, exact-coverage validation, scoped measurement, and continuation in the existing engine.
- Extract reusable block slicing out of the React renderer only as needed; do not fork markup/normalization logic.
- Measure a bounded source projection, including intra-block slices; retain original block identities in both measurement and visible trees.
- Include repeatable single-block splitting, footnote traversal, and typed overflow-repair outcomes in this foundational work. Do not defer these until a silent data-loss bug appears.
- Wire the reader to paginate an initial bounded scope for the generated long fixture; keep the existing short-work path equivalent.

**Exit:** long prose can produce the first usable page without measuring its entire body; its continuation covers the next source range without an error or identity rewrite.

### 2. Window navigation and truthful completion

- Integrate the navigation module with PaginatedSurface, PageTurnControls, jumpToOffset, restoration, and annotation navigation.
- Cross windows via normal Next/Previous; add direct jumps and bounded predecessor loading.
- Replace page-array-final checks in anchors, progress, chapter-end controls, and Mark read and close with absolute boundary facts.
- Handle one-page windows in multi-window works correctly: opening a work still does not finish it, and reaching a noninitial terminal window can finish the actual work without requiring that window itself to have multiple pages.
- Preserve capture-before-swap and the current location-save debounce/flush discipline. Never write a temporary loading anchor of zero or pin an intermediate window to the work end.
- Update DEV readiness to include scope/request identity and guard settlement; reuse `tests/e2e/pagination/_harness.ts` rather than adding fixed sleeps.

**Exit:** all generated text is reachable forward/backward exactly once, late-work jumps are direct, and finishing the first window does not finish the article.

### 3. Stable structural divisions and source evidence

- Add structural metadata schemas, deterministic legacy derivation, lazy revision-safe persistence, and chapter/part orientation.
- Capture reliable source outline evidence during extraction with no additional network requests and no reordering or omission of canonical blocks.
- Match evidence to canonical positions only when reliable and in source order. Repeated/ambiguous labels fall back to honest headings/reading parts, not guessed authorial chapters.
- Keep the existing heading TOC and its duplicate-heading/focus behavior; integrate chapters/parts without making every heading a library item.
- Add portability for persisted structure with a next-available bundle version and backward readers for older bundles. Do not hardcode an assumed available version before checking the implementation branch.
- Ensure conflicting structural snapshots cannot silently invalidate an existing chapter reference. A partial or invalid snapshot is not a valid replacement for local structure.

**Exit:** chapters/parts remain stable across font/viewport changes, old saved articles work without reimport, and backup round trips retain structural destinations.

### 4. Read-aloud and existing EPUB work continuity

- Make spoken following request global passages through navigation, preserving the suspension/reacquisition policy and avoiding repeated competing loads on per-word updates.
- Crossing layout windows/parts of one article must not stop/restart its speech engine or split its canonical saved position.
- Add a book-aware handoff for existing EPUB chapter article IDs. Flush the old chapter's real position before switching to the next; preserve stop/pause intent, rate/voice choice, cancellation, background-stop policy, and detected speech failures.
- Ordinary navigation away still stops speech. A delayed chapter handoff must not restart playback after Stop, a new jump, or leaving the work. Browser refusal must remain explicit rather than simulated continuation.
- Next/Previous within a whole EPUB work must cross existing chapter article IDs without requiring a library detour; retain those IDs and annotation coordinates.
- Keep the future collection assignment stop scope explicit in navigation/speech composition, so chapter-only assignments can stop without teaching the pagination engine about Collections.

**Exit:** an oversized EPUB chapter paginates and whole-work navigation/read-aloud crosses real chapter boundaries without replacing saved articles.

### 5. Honest failures, accessibility, and release verification

- Replace the generic pagination banner's inference with typed reasons and preserve a retry/scroll/original-source escape route without silently changing the selected mode.
- Ensure genuine unpageable content remains an explicit limit rather than a successful continuation with no source progress.
- Preserve the single accessible content tree; hidden measurement must have no tab stops, duplicate exposed footnote IDs, or accidental selection targets.
- Reuse the one polite status-region discipline and shared focus handoff. Don't move focus on speech follow; cancel stale destination focus requests.
- Verify the reference URL and existing saved-work scenarios, plus cross-browser layout, focus, zoom, annotations, and mode-switch round trips.
- Run calibration/performance harnesses against the existing approved gates on the reference environment. Capture new long-work first-page/jump/window-load observations without inventing or relaxing numeric budgets.

**Exit:** all long-work release criteria in the confirmed spec have evidence; outstanding source-specific limitations are disclosed rather than hidden by fixture success.

## Verification plan

Unit tests own source-range coverage/order, stable structural identities, continuation progress/termination, offset mapping, scope/generation checks, absolute-end predicates, and legacy/schema/portability behavior. DOM-emulator tests may verify orchestration but never claim layout truth.

Targeted Playwright specs own rendering/no clipping, markup/list continuation, footnote access and return, restoration, font/viewport changes, focus, keyboard/swipe, read-aloud follow, and existing EPUB continuity. Check both same-document navigation and cold reload so stale DEV publications cannot satisfy readiness.

Existing suites to extend/reuse:

- `tests/unit/pagination/{fragmentOrder,termination,pageAnchor,overflowGuard,firstPageReserved,progress-formula}.test.ts`
- `tests/unit/measurement/{engine,domMeasurerSlicing,epoch}.test.ts`
- `tests/unit/{jumpToOffset,toc,graphemeOffsets,normalizeText}.test.ts`
- `tests/e2e/pagination/`, `tests/e2e/toc/`, `tests/e2e/readaloud/`, `tests/e2e/epub-intake.spec.ts`
- Existing annotations, restoration, portability, and accessibility specs affected by each slice.

Commands, selected per slice rather than run as one blanket suite:

```sh
uptime
npm run typecheck
npm run lint
npm run test:unit -- --run tests/unit/pagination tests/unit/measurement tests/unit/jumpToOffset.test.ts
npx playwright test tests/e2e/pagination/<affected-spec>.spec.ts --project=chromium
# Targeted layout/focus/selection/reflow specs also run in firefox and webkit.
npm run calibrate
npm run perf
```

Follow [shared-machine test discipline](../agents/test-discipline.md): inspect load, cap commands at 15 minutes, keep local browser runs targeted, and let CI own comprehensive PR coverage. Performance evidence must come from comparable hardware/load; do not interpret contention as a regression or silently update budgets.

## Collections follow-on

Only after the long-work delivery is verified:

1. Add repository-backed Collections with ordered non-owning targets for articles, existing EPUB books/chapters, and stable in-article chapters; generated parts are not targets.
2. Add shared chapter-completion records and explicit completion overrides independent of the canonical passage location. Do not invent legacy chapter coverage from a later saved offset. Preserve existing whole-work completion semantics unless an explicitly tested compatibility change is necessary.
3. Add collection navigation context (last active entry), assignment-scoped resume and stop behavior, deliberate Next reading, and completion counts. A navigation-context record is not a second passage location.
4. Add accessible editing, affected-collection deletion confirmation, and transactional reference cleanup. Collections never call owning book-deletion logic merely to remove membership.
5. Add ordinary backup/import support, explicit keep-local/use-imported/keep-both conflicts, and reference validation against the *resolved winning* content and chapter snapshots. Copying a collection must not duplicate underlying readings.

These are follow-on slices, not hidden prerequisites for making the reference work readable in paged mode.
