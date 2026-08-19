---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Personal Library
current_phase: 13
current_phase_name: polish-and-acceptance
status: executing
stopped_at: Completed 13-03-PLAN.md
last_updated: "2026-08-19T21:00:26.892Z"
last_activity: 2026-08-19
last_activity_desc: Phase 13 execution started
progress:
  total_phases: 7
  completed_phases: 7
  total_plans: 46
  completed_plans: 46
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-17)

**Core value:** Readers can move through long-form web content with calm, stable orientation, and predictable navigation.
**Current focus:** Phase 13 — polish-and-acceptance

## Current Position

Phase: 13 (polish-and-acceptance) — EXECUTING
Plan: 6 of 6
Status: Ready to execute
Last activity: 2026-08-19 — Phase 13 execution started

Progress: [████████████████████] 32/32 plans (100%)

## Recent Decisions (Phase 11)

- **PDF honesty over best-effort.** Scanned/image-only and unrecoverably multi-column PDFs are refused calmly before assembly with zero library side effects; thresholds are corpus-calibrated (6 real PDFs) and CI-replay-pinned so admission changes can't silently loosen detection (11-06).
- **11-07 gap closure: isReaderable admission algebra relaxed to `blocks.length >= 3 && (textBearingPages >= 1 || nearEmptyPages === 0)`** — the old text-bearing conjunct double-guarded and false-refused legitimately sparse structured docs (outline/title-page shapes); all PDF_THRESHOLDS stayed frozen (commit 6f8c655, UAT Test 2 re-verified).
- **unpdf pinned exactly at 1.8.1** (user-approved blocking-human gate, supersedes STACK.md 1.8.0; legitimacy evidence recorded in 11-01-unpdf-approval.md); server-side only — dist/ greps prove zero PDF code reaches the client bundle.
- **Acknowledged gap: the 30 s extraction-timeout firing path (withPdfDocument race) has no automated coverage** — race is wired and code-read present; user acknowledged at UAT completion; closure path is a fake-timers unit test with zero production changes (11-VERIFICATION.md § Acknowledged Gaps).

## Performance Metrics

**Velocity:**

- Total plans completed: 57 (this phase, incl. gap closure)
- Average duration: 25 min
- Total execution time: 1.5 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 5 | 14 min | 14 min |
| 02 | 4 | - | - |
| 03 | 2 | - | - |
| 05 | 7 | - | - |
| 08 | 5 | - | - |
| 9 | 7 | - | - |
| 10 | 6 | - | - |
| 11 | 7 | - | - |
| 12 | 8 | - | - |

**Recent Trend:**

- Last 5 plans: 02-04 (5min gap closure), 02-03 (22min), 02-02 (10 min), 02-01 (50min), 01-05 (3 min)
- Trend: stable

| Phase 01 P01 | 14 min | 3 tasks | 25 files |
| Phase 01 P02 | 120 | 3 tasks | 13 files |
| Phase 01 P04 | 11 min | 2 tasks | 5 files |
| Phase 01 P05 | 3 min | 2 tasks | 5 files |
| Phase 02 P01 | 50min | 3 tasks | 19 files |
| Phase 02 P02 | 10 min | 2 tasks | 11 files |
| Phase 02 P03 | 22 min | 3 tasks | 17 files |
| Phase 02 P04 | 5 min | 2 tasks | 7 files |
| Phase 03 P01 | 22 min | 3 tasks | 16 files |
| Phase 03 P02 | 19 min | 2 tasks | 14 files |
| Phase 04 P01 | 13 min (Task 2) + prior (Task 1) | 2 tasks | 9 files |
| Phase 04 P02 | 5min | 2 tasks | 16 files |
| Phase 04 P03 | 18min | 2 tasks | 9 files |
| Phase 04 P04 | 19min | 2 tasks | 14 files |
| Phase 04 P05 | 27min | 2 tasks (Task 3 human gate pending) | 12 files |
| Phase 04 P06 | 56min | 5 tasks | 23 files |
| Phase 04 P08 | 13min | 1 tasks | 4 files |
| Phase 04 P09 | 40min | 2 tasks | 6 files |
| Phase 04 P10 | 18min | 1 tasks | 3 files |
| Phase 04 P11 | 18min | 1 tasks | 2 files |
| Phase 05 P01 | 19min | 2 tasks | 12 files |
| Phase 05 P02 | 22min | 2 tasks | 9 files |
| Phase 05 P03 | 20min | 2 tasks | 12 files |
| Phase 05 P04 | 12min | 2 tasks | 9 files |
| Phase 05 P05 | 95min | 3 tasks | 18 files |
| Phase 05 P07 | 12 min | 3 tasks | 3 files |
| Phase 05 P06 | 22 min | 3 tasks | 2 files |
| Phase 06 P01 | 13 min | 3 tasks | 3 files |
| Phase 06 P02 | 3 min | 1 tasks | 1 files |
| Phase 06 P03 | 64min | 3 tasks | 6 files |
| Phase 06 P04 | 2 min | 1 tasks | 1 files |
| Phase 06 P05 | 7 min | 2 tasks | 4 files |
| Phase 06 P06 | 10 min | 2 tasks | 1 files |
| Phase 07 P01 | 40min (incl. human-verify pause) | 2 tasks | 17 files |
| Phase 07 P02 | 15min | 2 tasks | 7 files |
| Phase 07 P03 | 8min | 2 tasks | 7 files |
| Phase 07 P04 | 17min | 2 tasks | 5 files |
| Phase 07 P05 | 12min | 2 tasks | 2 files |
| Phase 07 P06 | 10min | 2 tasks | 12 files |
| Phase 07 P07 | 28min | 2 tasks | 8 files |
| Phase 08 P01 | 11min | 2 tasks | 8 files |
| Phase 08 P02 | 5min | 2 tasks | 5 files |
| Phase 08 P03 | 11min | 3 tasks | 10 files |
| Phase 08 P04 | 5min | 2 tasks | 6 files |
| Phase 08 P05 | 45min | 2 tasks | 7 files |
| Phase 09 P01 | 7 min | 3 tasks | 17 files |
| Phase 9 P09-02 | 7 min | 2 tasks | 5 files |
| Phase 9 P03 | 10 min | 2 tasks | 2 files |
| Phase 9 P04 | 13 min | 3 tasks | 4 files |
| Phase 9 P09-05 | 14 min | 3 tasks | 6 files |
| Phase 9 P09-06 | 27 min | 3 tasks | 11 files |
| Phase 09 P07 | 34min | 3 tasks | 5 files |
| Phase 10 P01 | 7 min | 2 tasks | 10 files |
| Phase 10 P02 | 14 min | 2 tasks | 12 files |
| Phase 10 P03 | 12 min | 2 tasks | 4 files |
| Phase 10 P04 | 6 min | 2 tasks | 3 files |
| Phase 10 P05 | 10 min | 3 tasks tasks | 6 files files |
| Phase 10 P06 | 25 min | 3 tasks | 8 files |
| Phase 11 P01 | 7 min | 3 tasks | 15 files |
| Phase 11 P02 | 18 min | 2 tasks | 3 files |
| Phase 11 P04 | 3 min | 2 tasks | 4 files |
| Phase 11 P03 | 10 min | 2 tasks | 3 files |
| Phase 11 P05 | 8min | 2 tasks | 1 files |
| Phase 11 P06 | 47min | 3 tasks | 12 files |
| Phase 11 P07 | 6 min | 3 tasks | 5 files |
| Phase 12 P02 | 13min | 2 tasks | 2 files |
| Phase 12 P03 | 15 min | 2 tasks | 7 files |
| Phase 12 P04 | 20 min | 2 tasks tasks | 5 files files |
| Phase 12 P05 | 18 min | 3 tasks | 13 files |
| Phase 12 P07 | 19 min | 2 tasks | 11 files |
| Phase 12 P06 | 38 min | 3 tasks | 5 files |
| Phase 12 P08 | 110min | 3 tasks | 13 files |
| Phase 13 P01 | 16 min | 3 tasks | 6 files |
| Phase 13 P02 | 7 min | 3 tasks | 5 files |
| Phase 13 P03 | 12 min | 2 tasks | 4 files |
| Phase 13 P05 | 3 min | 2 tasks | 2 files |
| Phase 13 P04 | 95min | 2 tasks | 11 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

- [Roadmap]: Use one canonical document coordinate system before any durable location, pagination, or annotation behavior.
- [Roadmap]: Keep semantic scrolling continuously viable before and during pagination work.
- [Roadmap]: Require calibrated browser measurement before enabling any Pretext fast path.
- [Phase ?]: D-04 inline marks locked to 4 (link/code/strong/em); D-05 grapheme coordinates over normalized text; D-06 slug id + monotonic revision
- [Phase ?]: Recursive Block type uses two-pass Zod declaration (hand-written union + z.ZodType annotation — Pitfall 7)
- [Phase ?]: Rule 3 deviation: @typescript-eslint hard-throws on TS 7.0; eslint.config.js uses @babel/eslint-parser instead, all security rules (react/no-danger etc.) preserved and verified firing
- [Phase ?]: [Phase 01-02]: One h1 per page — ArticleView renders title from provenance; article bodies start at h2 (a11y)
- [Phase ?]: [Phase 01-02]: Hash-based routing confirmed (A2) — window.location.hash + hashchange, no router library
- [Phase 01]: [Phase 01-04]: Inset unification lives on main#main (not per-view wrappers) — closes fixture-list flush-edge gap with one rule, no double inset
- [Phase 01]: [Phase 01-04]: Error heading level split by page context — ArticleView uses <h1> (standalone error page), FixtureList uses <h2> (page already has <h1>Saved articles</h1>); preserves one-h1-per-page
- [Phase ?]: [Phase 01-05]: Route/fragment distinction lives in the hashchange handler (not parseHash) — parseHash must still map bad #/ deep links to the list; the guard prevents fragment-only hashes from reaching setView so native scroll targets stay mounted
- [Phase ?]: [Phase 01-05]: Footnote back-link visible glyph is U+21A9 as a React text child + aria-label 'Return to reference N'; fn.id schema-locked to digits-only so suffix is injection-safe; no new CSS (app.css owned by sibling 01-04)
- [Phase ?]: Phase 02-01: Native <dialog>/showModal chosen for settings panel; manual triggerRef.current?.focus() restore in close listener (Pitfall 1) — Free focus trap/Esc/inert/backdrop; canonical per 02-RESEARCH anti-pattern #1
- [Phase ?]: Phase 02-01: applyTheme writes data-theme + 6 CSS custom properties on documentElement (D2-03 live-apply) — Single token swap honors authored-CSS/no-Tailwind constraint; values derive from Zod-validated enums/numbers (no XSS surface, T-02-02)
- [Phase ?]: Phase 02-01: Dexie version(2) re-declares same stores — schema no-op in Dexie >=3; anchors STATE-04 migration hook (Pitfall 9 honored) — v1 wrote zero records; no data migration needed; gives Plan 02 clean place to evolve
- [Phase ?]: Phase 02-01: Explicit focus on first control after showModal + removed <form method=dialog> wrapper — WebKit does not auto-focus modal-dialog controls; form wrapper interfered with Chromium focus-trap wrap-around (focus escaped to body)
- [Phase ?]: Phase 02-02: db.delete() lives ONLY in WipeConfirm.tsx onDestructiveClick (stricter-than-plan Pitfall 8 reading per critical_constraints) — SettingsContext.resetLocalData only clears in-memory state; the sole executable db.delete call site is the destructive button onClick (verified via repo-wide grep)
- [Phase ?]: Phase 02-02: WipeConfirm cancel button carries [data-initial-focus] (NOT autoFocus prop) — safer default focus on the non-destructive action; an accidental Enter cannot wipe data
- [Phase ?]: Phase 02-02: Dexie LemReaderDB Table<> property annotations added with definite-assignment `!` — PATTERNS.md line 106 LOW-risk authorization; version(1) block byte-unchanged (Pitfall 9); runtime behavior unaffected
- [Phase ?]: Phase 02-02: UnknownError routes to unupgradeable FIRST (conservative) — appears in both unupgradeable + unavailable Dexie error sets; conservative routing surfaces WipeConfirm rather than the banner but never auto-wipes (Pitfall 8 holds in ambiguous classification)
- [Phase ?]: Phase 02-02: StorageBanner dismiss is session-scoped (resets on reload per D2-13) — if storageState returns to "ok", the dismiss flag clears so a future unavailable state re-surfaces the banner
- [Phase ?]: Phase 02-03: Dexie [field+field] store syntax declares a COMPOUND PRIMARY KEY queried as array [val1, val2] — NOT a field named '[field+field]'; the 02-01 LocationRecordRow had a bogus bracketed string field; fixed to use array key db.location.get([id,rev])
- [Phase ?]: Phase 02-03: IntersectionObserver alone is insufficient for scroll-spy (batches callbacks + flaky percentage rootMargin) — added passive rAF-throttled scroll listener as fallback trigger; both feed same debounced detect() function
- [Phase ?]: Phase 02-03: Callback-ref + state pattern for DOM elements needed by child components — React refs don't trigger re-renders; useState + callback ref bridges the gap so SectionAnnouncer receives the article element when it mounts
- [Phase ?]: Phase 02-03: findScrollTarget reuses normalizeRunText + graphemeClusters from src/content/normalizeText EXACTLY (D-05 contract — no parallel implementation); saved grapheme offset round-trips precisely with restored DOM block target
- [Phase ?]: Phase 02-03: ProgressHairline fill has NO CSS transition/animation property — inline scaleX write tracks scroll like a native scrollbar; global prefers-reduced-motion gate trivially satisfied (UI-SPEC §Interaction 12)
- [Phase 02]: Phase 02-04 (gap closure): transform-origin grammar is PHYSICAL-ONLY (left|center|right|top|bottom — NO logical-keyword variants); inline-start/inline-end are valid for inset/margin/padding logical properties but NOT for transform-origin; browsers silently ignore the unknown value and fall back to initial 50% 50% (center). LTR English uses the physical `left` keyword; a [dir="rtl"] override to `right` is deferred to a future RTL milestone.
- [Phase 02]: Phase 02-04 (gap closure): Typography cascade contract — applyTheme writes custom properties (--font-size / --line-height / --letter-spacing / --word-spacing) on <html>; the SECOND body rule consumes them via var() with literal first-paint fallbacks (18px / 1.6 / 0). Mirrors the working --font-body + --measure pattern. NEVER write a bare property the body rule will override via CSS specificity.
- [Phase ?]: Phase 03-01: Font trigger via addEventListener('loadingdone'), not a polling re-await loop — polling hot-looped on already-resolved font promises and starved the event loop; EVENT form is Baseline per MDN
- [Phase ?]: Phase 03-01: awaitFontsReady uses Promise.race(document.fonts.ready, abortPromise) so a never-resolving font promise still surfaces a mid-flight abort as AbortError (D3-06)
- [Phase ?]: Phase 03-01: DiagnosticEvent defined as 6-kind discriminated union now (late-epoch-drop + measurement-error emitted in Plan 01; the other 4 reserved for Plan 02) so Phase 4 PAGE-09 extends emission not the shape (D3-05)
- [Phase ?]: Phase 03-01: DEV-only window.__lemLastTrustedConstraints debug hook under import.meta.env.DEV lets the PAGE-07 e2e observe the latest committed Constraints without exposing internal state to production
- [Phase ?]: Phase 03-02: 'kind-downgraded' (kebab-case) is the canonical diagnostic event field — committed Zod schema in types.ts is source of truth; plan's kindDowngraded would fail V5 boundary parse
- [Phase ?]: Phase 03-02: Engine measures DOM for ALL blocks (correct reference + safe fallback); Pretext predictions computed only for sampled eligible blocks to feed drift guard
- [Phase ?]: Phase 03-02: Calibration harness split — Playwright per-engine parallel + Node compare merge avoids cross-worker coordination for single fingerprint write
- [Phase ?]: Phase 03-02: Calibration evidence — headings eligible (216/216 chromium+firefox, 156/216 webkit); paragraphs 0/216 (rich-inline marks + wordSpacing Pitfall 6 + system-ui sans Pitfall 5) — D3-01 per-kind gate's purpose realized
- [Phase ?]: Phase 03-02: fingerprint.compare.ts refuses empty input (exit 2) — never overwrite committed fingerprint with placeholder
- [Phase 4]: Phase 04-01: SplitDecision simplified to {kind:"atomic"} | {kind:"split"} — Task 1 had over-specified splitAtGrapheme on the split variant; classifyBlock is a pure block.kind→classification switch, and the actual split offset is computed downstream by the orchestrator using line boxes + widow rules. Removed splitAtGrapheme so the type matches the natural code shape.
- [Phase 4]: Phase 04-01: MVP pagination engine assumes 1:1 article.blocks ↔ querySelectorAll elements (holds for top-level paragraph/heading/figure/code/footnote/unsupported). Container kinds (blockquote + bulleted/numbered lists) currently trip block-element-mismatch fallback; Plan 03's recursive fragment renderer will land the container path.
- [Phase 4]: Phase 04-01: chooseSplit verifies the before-slice ACTUALLY fits on the current page after the widow bump (not just the 2/2 line-count rule) — prevents overflowing page-1 entries when the candidate is line 0 but the orphan bump pushes the split to SPLIT_WIDOW_LINES.
- [Phase 4]: Phase 04-01: Atomic-oversize threshold is strictly-greater-than (> 0.75): a block at exactly 75% is allowed; 75.0001% triggers fallback (edge case unit-tested).
- [Phase 4]: Phase 04-01: applyHeadingWidow falls back to heading-only height check when following block has < HEADING_WIDOW_LINES (=2) lines — the rule can't anchor meaningfully without enough following lines.
- [Phase 04]: Phase 04-02: schemaVersion resolved to z.union([z.literal(1), z.literal(2)]) — plan was internally inconsistent (must_haves said literal(2) but action required {schemaVersion:1,...} hydration); union satisfies both v1 read hydration (Pitfall 9) and v2 canonical write, forward-rejects v3+ (V5 preserved).
- [Phase 04]: Phase 04-02: PAGE-01 split — this plan ships the schema field + e2e scaffold (foundation); Plan 04-04 ships the reader-facing ModeToggle + M shortcut + D4-10 anchor (behavior). PAGE-01 stays unchecked in REQUIREMENTS.md until Plan 04-04.
- [Phase 04]: Phase 04-02: Wave 0 scaffolds use h1-visible sentinel (not test.todo) — proves the harness wires up at runtime in chromium + firefox + webkit (24/24 green, 12.4s); test.todo would only prove compilation.
- [Phase 04]: Phase 04-02: fixtures-matrix.ts FIXTURES verified against src/fixtures/index.ts (6 corpus ids); TypographyVariant type shared (imported) from tests/e2e/calibration/fixtures-matrix.ts — not forked.
- [Phase ?]: Phase 04-03: PageFragmentView uses per-kind if branches (not switch) so the rendering decision stays owned by BlockView; slicing decision is orthogonal to rendering.
- [Phase ?]: Phase 04-03: DiagnosticBus threading contract (T-04) — useMeasurement owns ONE bus and exposes it via return value; constructing new DiagnosticBus() downstream is forbidden (would split emissions from subscribers).
- [Phase ?]: Phase 04-03: Container-kind slicing implemented but MVP engine trips block-element-mismatch fallback for containers; recursive path ready for Plan 04-05 corpus matrix.
- [Phase ?]: Phase 04-03: PAGE-02/03/05 split across plans — this plan ships the vertical slice + D4-01 renderer; Plan 04-04 closes PAGE-01/02/05; Plan 04-05 closes PAGE-03/04/09. requirements-completed: [] mirroring 04-02's PAGE-01 precedent.
- [Phase 04]: Turn-handler seam = forwardRef + useImperativeHandle on PaginatedSurface (Plan 04-03 tests stay green; chevrons + keyboard + swipe share ONE commitTurn path)
- [Phase 04]: D4-10 mode-switch anchor uses continuous offset capture + App ref-bridge (Pitfall 7 capture-before-swap); pure anchor helpers reuse blockNormalizedText, no fork
- [Phase 04 P05]: Session-scoped mode override (effectiveMode = sessionModeOverride ?? settings.readingMode) flips to scrolling on fallback WITHOUT overwriting the persisted readingMode (T-04-15); only handleToggleMode persists. Banner Switch to pages reuses the SAME toggle path.
- [Phase 04 P05]: ⚠️ BLOCKING — pagination engine cannot paginate ANY corpus fixture. (a) PaginatedSurface (04-03) replaces the full ArticleBody before the engine reads live line boxes; (b) every fixture's container blocks break the 1:1 article.blocks↔querySelectorAll assumption. PAGE-03 corpus matrix proof impossible without engine work. Surfaced as Rule 4 for human decision (Options A/B in 04-05-SUMMARY §Blocking Finding).
- [Phase ?]: Phase 04-06: Plan 04-05 Option A (pre-captured line boxes) implemented — measurement captures LineBox[][] per block; engine consumes pre-captured data with NO live DOM walk. data-block-index is the 1:1 block↔element mapping. Generalized readLineBoxes via TreeWalker.SHOW_TEXT.
- [Phase ?]: Phase 04-06: splittingBlockText is the renderer-aligned coordinate system (concatenated runs without separators for paragraphs, BLOCK_SEPARATOR-joined for containers). Engine + renderer + DEV hook share it. Distinct from D-05 substrate.
- [Phase ?]: Phase 04-06: partial-DOM measurement defense — PaginatedSurface replaces ArticleBody, ResizeObserver fires re-measurement against the page fragment, would overwrite good trustedView. Engine silently skips commits where blocks.length !== article.blocks.length. Typography-change re-measure is a known MVP scope limit.
- [Phase 04]: Plan 04-08 chose Option A (always-mounted hidden ArticleBody alongside PaginatedSurface) over Options B + C because B + C alone do not fix PAGE-07 — typography changes still need a real re-measure against the full article body. The hidden .article-body-measurement wrapper makes measureAllBlocks always return the full [data-block-index] set; the partial-DOM defense becomes unreachable in normal operation but stays as a safety net locked by new engine unit tests. PAGE-06 seeds readingMode scrolling (mirrors Plan 04-06 Task 5); PAGE-07 stays under the paginated default and proves the fix works. — Plan 04-08 chose Option A (always-mounted hidden ArticleBody alongside PaginatedSurface) over Options B + C because B + C alone do not fix PAGE-07 — typography changes still need a real re-measure against the full article body. The hidden .article-body-measurement wrapper makes measureAllBlocks always return the full [data-block-index] set; the partial-DOM defense becomes unreachable in normal operation but stays as a safety net locked by new engine unit tests. PAGE-06 seeds readingMode scrolling (mirrors Plan 04-06 Task 5); PAGE-07 stays under the paginated default and proves the fix works.
- [Phase 04]: Plan 04-09: queryBlocks switched to [data-block-index] to fix double-counting; M shortcut moved to ArticleView global listener; commitTurn synchronous ref update — Plan 04-09: queryBlocks switched to [data-block-index] to fix double-counting; M shortcut moved to ArticleView global listener; commitTurn synchronous ref update
- [Phase ?]: Phase 04-10: Banner auto-dismiss race fixed via pointerdown inside-banner guard + scroll-dismiss debounce (300ms)
- [Phase ?]: Phase 04-10: DEV-only __lemDiagnosticBus hook — firefox never detects oversize; decouples PAGE-09 banner test from measurement cross-engine consistency
- [Phase 04]: Plan 04-11: PROCESS BLOCKER closed by re-running the suite — full `npm run test` exit 0 (753 passed / 0 failed / 0 skipped); the "269/0" misreport pattern (reality 76 failed / 269 passed) is overturned. 04-VERIFICATION.md upgraded gaps_found (3/7) → verified (7/7); all 6 gaps closed by 04-07/08/09/10. Anti-pattern guard: executor ran the suite itself, recorded fail=0 honestly rather than omitting it (04-11-OUTPUT.md is the permanent record).
- [Phase ?]: 05-01: resolveQuoteSelector implements D5-02 tri-state (confident|ambiguous|orphan) in src/annotations/resolution.ts; contract signature stays in normalizeText.ts
- [Phase ?]: 05-01: highlightsStore drops corrupt rows defensively; cascade-delete via Dexie transaction (Pitfall 10); NO Dexie version bump (Pitfall 9)
- [Phase ?]: 05-01: captureSelection maps DOM Range→grapheme offset via raw-cluster↔norm-cluster whitespace-collapse alignment (Pitfall 1); never uses Selection.toString() (Pitfall 2)
- [Phase ?]: apiRef bridge over ArticleView split for parent-child provider access
- [Phase ?]: captureCurrentSelection separated from createHighlightFromSelection for side-effect-free toolbar display
- [Phase ?]: 05-03: NotePopover uses Popover API (popover=manual) for the note editor; three overlay mechanisms coexist per UI-SPEC
- [Phase ?]: 05-03: turnToPage + getPages added to PaginatedSurfaceHandle for D5-11 navigate-back (Rule 3 — turn(direction) can't jump to a target page)
- [Phase ?]: 05-03: deleteNote added to notesStore for D5-10 empty-text policy (empty textarea = no NoteRecord; debounced save deletes the row)
- [Phase ?]: Plan 05-04: D5-16 cross-fragment slicing threads through PageFragmentView (intersect each highlight range with each fragment entry's article-global visible range; emit a per-entry slice per non-empty intersection). A split-block highlight renders a mark on EACH containing fragment — both sharing data-highlight-id (no silent gaps at a page turn).
- [Phase ?]: Plan 05-04: status-driven inline rendering — HighlightSliceEntry.status threads through sliceRunsForHighlights so ambiguous/orphan highlights render mark.highlight.unresolved (dashed outline) instead of a silent fill. Threading the full tri-state (not a boolean) preserves UI-SPEC's per-kind aria-label distinction.
- [Phase ?]: Plan 05-04: ANNO-07 enforced at the rendering layer — ArticleBody's effective-highlights filter is 'resolvedPosition !== null' (NOT 'status === confident'), so ambiguous/orphan highlights render at their best-effort vicinity with the dashed-outline modifier. Never silent re-attach.
- [Phase 05]: 05-05 phase gate green: full npm run test exits 0 (507 unit + 489 e2e = 996 passed / 0 failed) across chromium/firefox/webkit; ANNO-01..05/07 + STATE-03 + A11Y-01/05 proven in real browsers — Executor ran the suite itself; fail=0 honest; no subset/grep/engine-skip (05-05-OUTPUT.md permanent record)
- [Phase 05]: 05-05: 4 Rule 1 gaps surfaced+fixed (paginated capture binding, mark activation, measurement scoping, firefox focus settle) — the e2e validation plan did its job; unit suite missed all 4 — Each fix committed atomically; full suite green after fixes
- [Phase 05]: 05-07: blockquote highlight gap closed via per-child childHighlightSlices threading on BlockView — ArticleBody walks block.children with blockGraphemeLen + BLOCK_SEPARATOR (mirrors paragraph path per child); PageFragmentView walks resolved.children with splittingBlockGraphemeLength + BLOCK_SEPARATOR (entry-local coords). Reuses sliceRunsForHighlights + highlightsForBlock UNCHANGED (no forked slicer); InlineRenderer untouched. Lists intentionally out of scope (different items-shape, no failing UAT case).
- [Phase ?]: 05-06: Option A (class gate) chosen for the initial-load mega-page fix — one-line `if (!articleEl.classList.contains("paginated-surface")) return;` before the rAF height read; useState(0) initial + trustedView effect-dep re-run cover initial mount, so no separate reset was needed. Measurement selector untouched (exonerated). Rule 1 deviation: regression assertion (b) relaxed from settled==first to settled>1 AND stable, because the plan's equality conflated the diagnosed geometry correction (1->3) with the by-design overflow-guard split (2->3, same pinned height).
- [Phase ?]: [Phase 06] test
- [Phase 06]: 06-01 ships the shared D6-09 edge-invariant helper (assertEdgeInvariant in tests/e2e/_edge-invariant.ts) encoding all three clauses (keyboard content in both modes + required functions + no overflow). Asserts on VISIBLE blocks only via [data-block-index]:not(.article-body-measurement ...) — the raw count would include the aria-hidden measurement clone (Plan 04-08) which is NOT keyboard-reachable.
- [Phase 06]: High-zoom (D6-10): page.setViewportSize({width:320,height:800}) is the LOAD-BEARING cross-engine reflow assertion (WCAG 1.4.10); document.body.style.zoom='4' is SECONDARY/engine-variable (chromium yes, firefox 126+, webkit partial), applied AFTER assertEdgeInvariant asserting only no-content-lost. deviceScaleFactor never used (DPR not zoom — Pitfall 2). 21/21 green chromium/firefox/webkit.
- [Phase 06]: Font-failure (D6-11): Lem Reader loads ZERO web fonts, so the harness injects a @font-face FIRST via page.addStyleTag then page.route-intercepts the injected URL. Route registered BEFORE addStyleTag (RESEARCH-proven non-vacuous pattern); !important on the injected font-family rule guarantees the request fires; page.on('request') verifies non-vacuity (Pitfall 1 guard). SWAP mode reuses stale-drop.spec.ts rapid-trigger race with the font active. 9/9 green.
- [Phase 06]: ACPT-03 spans Plan 06-01 (NEW gap specs: high-zoom + font-failure, 30/30 green) AND Plan 06-05 (audit of 4 existing edge specs against the invariant). requirements-completed is [] for 06-01 mirroring the 04-02 PAGE-01 split precedent; Plan 06-05 closes ACPT-03.
- [Phase ?]: ACPT-01 closed by Plan 06-02 — consolidated core-reading-flow spec (18/18 green × chromium/firefox/webkit), sibling of open-every-fixture.spec.ts (D6-13), ONE representative typography per RESEARCH OQ2, reuses annotations/_fixtures.ts harness wholesale (Pitfall 6 honored)
- [Phase ?]: [Phase 06]: 06-03 ACPT-04 budget locked at measured p95+25% headroom (24 cells). D6-01 measure-first honored — user approved before locking. headroomPct=0 (25% baked INTO wallClockMs). Warm trigger = typography size change (viewport resize unreliable above measure cap). Fallback shares warm budget (D6-03). npm run perf CI gate exits 0. Two Rule 1 auto-fixes: warm trigger accuracy + compare-script load ordering.
- [Phase 06]: 06-04 authors docs/ACCEPTANCE-PROTOCOL.md — the durable, re-runnable ACPT-02 instrument (NVDA+Firefox + VoiceOver+Safari matrix, 6 scripted flows as role+name outcomes per Pitfall 7, 5 exploratory charters, zero-blocker/major pass policy D6-07). ACPT-02 does NOT close here — it closes when Plan 06-06 EXECUTES the protocol with zero-blocker findings. Mirrors the 04-02 PAGE-01 split precedent (instrument ships; requirement closes at the plan that proves behavior).
- [Phase 06]: Manual SR protocol expected outcomes authored as role + accessible name + state (programmatically verifiable), NOT verbatim SR phrasing (Pitfall 7). Confusing-but-completable announcement = minor unless step fails or content/function lost.
- [Phase ?]: 06-05 closes ACPT-03
- [Phase ?]: [Phase 06]: 06-05 closes ACPT-03 — all 4 existing edge specs (forced-colors, reduced-motion, reflow, touch-targets) audited against the shared D6-09 invariant + strengthened to apply assertEdgeInvariant uniformly across the 6-fixture corpus x 3 engines (72 new cells). Strengthen-only per D6-12 (no existing assertion removed); wipeDatabase added to every beforeEach (Rule 2 harness-baseline consistency). reflow.spec.ts (the (c) overflow-clause origin) now asserts the COMPLETE invariant (a)/(b)/(c) via the helper. Together with 06-01 (high-zoom + font-failure), all six edge conditions assert the same bar.
- [Phase 06]: 06-06 executes ACPT-02 manual SR protocol on VoiceOver+Safari (zero blocker/major after 5 findings resolved; #1 H-under-VO documented as cross-SR platform constraint, toolbar = primary SR path; #2 NotePopover promoted to modal <dialog>+showModal; #3 minor deferred; #4 visual-only; #5 aria-describedby excerpt). Honest full-suite gate green (1157 passed / 0 failed / exit 0). NVDA+Firefox NOT run = coverage boundary A4 (reduced gate). ACPT-02 NOT unilaterally flipped -- flip decision surfaced to user. — 06-VERIFICATION.md is the durable phase-6 acceptance ledger; reduced-gate honesty over silent full-coverage claim.
- [Phase 07]: 07-01 spike verdict (HUMAN-APPROVED 2026-08-11): HYBRID CONTINGENCY — jsdom AND linkedom both fail the mXSS gate on Workers. jsdom: `ReferenceError: MessagePort is not defined` (workerd lacks MessagePort); linkedom-DOMPurify: no-op sanitizer (`isSupported: undefined`, sanitize returns input unchanged with script/onerror intact). Workers handle ONLY the SSRF-safe fetch (ip-address + cf.resolveOverride both PASS); extraction+sanitize run in a Node-runtime function. 07-04 runtime target shifts from a Workers Pages Function to a Node function; /server adapter boundary (D7-05) keeps logic portable, only /functions adapter shape changes. vite.config.ts = Option A (@cloudflare/vite-plugin), A3 PASS (v1.0 smoke 8/8 chromium green).
- [Phase 07]: 07-02: Dexie v3 APPENDs source + addedAt indexes to articles with NO .upgrade() callback (Pitfall 9 — additive indexes only; articles store wrote zero records in v1/v2). ArticleSourceSchema closed to fixture|url|paste; extractionConfidence persists only high|low (the 'unsupported' ING-06 three-state is refused upstream, surfaced as IngestionFailureReason 'extraction-unsupported'). httpUrl exported from schema.ts for single-source-of-truth reuse in src/ingestion/types.ts. — Plan + 07-RESEARCH.md L590-604 + threat T-7-07 require v3 additive; Pitfall 9 forbids editing v1/v2; D7-08 requires the optional sourceUrl and origin discriminator; ING-06 three-state keeps 'unsupported' out of persistence.
- [Phase 07]: 07-03: safeFetch ships cf.resolveOverride DNS pinning (07-01 A1 PASS) — Workers fetch honors the option; Node unit-test fetch ignores it. Metadata-hostname check runs BEFORE DNS (RESEARCH.md measure order 1->5->3). IPv4-mapped IPv6 handled via Address6.isMapped4()+to4(). confidence ships locked ING-06 formula (corpus calibration deferred). slugify ships humanish+hash-fallback (D7-07).
- [Phase ?]: 07-04: htmlToBlocks ships Option A (jsdom-primary) per 07-01 HYBRID CONTINGENCY spike — extraction+sanitize run in Node where jsdom works natively; plan L103 Option C throw comment OVERTURNED. mXSS suite SC#4 = 11 DOMPurify Attack Classes payloads all stripped. ING-07 closes here; ING-01/02 close at 07-06.
- [Phase 07]: 07-05: Pipeline orchestrator ships the locked 7-stage ordering (safeFetch → extractAndNormalize → slugifyUrl → ArticleSchema.parse → assertRoundTripAnchor → deriveConfidence → stamp). assertRoundTripAnchor samples 5 grapheme offsets [0, 25%, 50%, 75%, near-end], refuses entry on ambiguous|orphan via the SHIPPED selectors (Pitfall 2 — no fork). Paste-path id bypasses slugifyUrl (new URL throws on non-URL strings) → content-hash slug paste-<12hex> directly. ING-01 + ING-06 close here.
- [Phase 07]: 07-06: HYBRID CONTINGENCY adaptation (human-approved 2026-08-11) — /api/ingest served by Vite Node dev middleware for Phase 7, not Cloudflare Pages (workerd). Both adapters share server/ingestAdapter.ts so behavior is byte-identical; functions/api/ingest.ts preserved as production-future shape. — 07-06: HYBRID CONTINGENCY adaptation (human-approved 2026-08-11) — /api/ingest served by Vite Node dev middleware for Phase 7, not Cloudflare Pages (workerd). Both adapters share server/ingestAdapter.ts so behavior is byte-identical; functions/api/ingest.ts preserved as production-future shape.
- [Phase 07]: 07-07: Four phase-exit gates GREEN (SC#1/3/4/5). SSRF matrix targets :5173/api/ingest per the 07-06 RUNTIME_GUARDRAIL (Vite Node middleware, not workerd). 19-vector corpus covers all 9 Pitfall 3 measures + 2 documented residuals (DNS-rebinding T-7-04, redirect-into-internal covered by safe-fetch.spec.ts unit). Private-IP vectors accept dual-reason (ssrf-blocked-private-ip OR fetch-failed) because Node c-ares refuses literal IPs. lint:no-danger regex tightened to match JSX USAGE not prose. ING-07 + ING-08 close here.
- [Phase 07]: 07-07 Rule 3 blocker fixes (three coordinated): (a) dev-server/ingest-middleware.ts Vite configureServer signature corrected to use server.middlewares via the ViteDevServer parameter; (b) cloudflare() plugin REMOVED from vite.config.ts (bundling /functions/* into workerd crashed with MessagePort ReferenceError); (c) wrangler pages dev :8788 webServer REMOVED from playwright.config.ts (same crash). The Vite Node middleware is the sole Phase 7 /api/ingest runtime. A3 spike assertion inverted. Forward note for Phase 8: re-adding workerd requires isolating /functions from undici-bearing imports OR a workerd release with MessagePort.
- [Phase 07]: 07-07 cross-browser Dexie migration seed via dual-path. seedV1Snapshot tries indexedDB.open(name, 2) first (clean upgrade-chain); on webkit VersionError (deleteDatabase blocked on Dexie's open connection) falls back to opening without a version + seeding existing v3 DB. Both paths prove Pitfall 9 (v3 schema accepts v1/v2 row shapes). beforeEach uses clear-rows NOT deleteDatabase for deterministic first-run state across chromium/firefox/webkit.
- [Phase 08]: D8-18 markdown article id = md-<shortHash(canonical content)> (content-hash, NOT filename); two uploads of identical .md produce the same id so dedupe-refuse mirrors D7-07. The filename is metadata-only and feeds the D8-17 title fallback chain, not the id. — Content-hash ids are stable across filename changes (a reader re-saving the same content under a different filename gets the same article, not a duplicate). This mirrors the paste-path content-hash precedent and keeps save-once-read-forever semantics uniform across all three intake formats.
- [Phase 08]: Strict CommonMark is the security boundary for the markdown path (D8-16, Pitfall 8-2): raw HTML in .md escapes to inert paragraph text by default. Never enable the parser's raw-HTML pass-through; the doc model IS the security boundary (ING-07). — CommonMark's default behavior (escape raw HTML) eliminates the mXSS surface without needing DOMPurify on the markdown path. The html-paths still need DOMPurify because they accept arbitrary HTML; the markdown path doesn't accept HTML at all — it accepts CommonMark, which has no raw-HTML-in-DOM semantics.
- [Phase 08]: D8-17 title fallback chain front-matter → stripMarkdownExtension(filename) → "Markdown document" runs in server/ingest.ts (the orchestrator), not in markdownToBlocks. The adapter is filename-agnostic; the orchestrator owns provenance assembly. — Keeps markdownToBlocks pure (string in, blocks+provenancePartial out — no I/O, no FS access). The orchestrator already owns the title fallback chain for url + paste paths; markdown mirrors that ownership rather than splitting responsibility across files.
- [Phase ?]: Phase 08-02: loadAllTags uses dexieLibrarySource.list() + in-memory Set (NOT a Dexie .where query) — reuses the Zod-validated read path (STATE-04); auto-prune is implicit (D8-08). The *tags multi-entry index enables future Dexie-only queries but the current implementation prioritizes simplicity.
- [Phase ?]: Phase 08-02: Dexie v4 is APPEND-only with NO .upgrade() callback (Pitfall 9). Existing v3 article rows hydrate tags:[] via ArticleSchema .default([]) on Zod read, NOT via a row write-back. The on-disk row is byte-unchanged by the upgrade (proven by the e2e v3->v4 assertion).
- [Phase 08-03]: LibraryView default-sort deviation: addedAt not on CanonicalArticle type
- [Phase 08-03]: LibraryRow.onRemove optional prop is the forward-compat hook for Plan 04 RemoveConfirm — no remove button in Plan 03
- [Phase ?]: Phase 08-04: TagEntry is INERT at ArticleView mount (Pitfall 8-5 — no auto-focus prop, no mount-time effect calling .focus()); reader activates via Tab/Click. Warning prose uses 'auto-focus' not the JSX attribute name so the acceptance grep returns 0 (mirrors 08-01 allowDangerousHtml).
- [Phase ?]: Phase 08-04: hasFile React state mirrors the file-input picker (refs are not reactive — reading fileInputRef.current.files.length in JSX wouldn't re-evaluate after a pick, so the submit button would stay disabled). onChange → setHasFile is the correct discipline.
- [Phase ?]: Phase 08-04: RemoveConfirm is a STRUCTURAL CLONE of WipeConfirm, not a shared Dialog. Two ~150-line components is the right cost for Pitfall 8 isolation (each destructive call lives ONLY in its own button's onClick — abstracting into a shared dialog would re-introduce the single-call-site risk).
- [Phase ?]: Phase 08-05: .library-list > li direct-child selector mandatory for library row counts (nested tag-chip <li> otherwise over-counts)
- [Phase ?]: Phase 08-05: page.reload() in openLibrary helper forces LibraryView remount after Dexie seed (load effect runs ONCE per mount; hashchange doesn't re-trigger)
- [Phase ?]: Phase 08-05: Math.floor(total*0.98) yields ratio 0.9798 < 0.98 due to integer truncation; seed graphemeOffset = total for deterministic Finished state
- [Phase ?]: Phase 08-05: Honest-suite gate RED (1495 passed / 24 failed / 13 skipped). 24 failures are PRE-EXISTING in unrelated specs (pagination/annotations/dexie-migration); Plan 08-05 scope (6 library specs, 243 cells) fully green. Logged to deferred-items.md per scope-boundary rule.
- [Phase ?]: [Phase 09-01] books/articleTags omitted from ExportBundleSchema entirely — absence is the forward-compatible form (tags travel inside ArticleSchema.tags; RESEARCH Pattern 1).
- [Phase ?]: [Phase 09-01] playwright.config.ts untouched — download smoke proved acceptDownloads capturable under Playwright 1.61.1 defaults (A1 verified; Pitfall 9 fallback unneeded).
- [Phase ?]: [Phase 09-01] sha256Hex typed Uint8Array<ArrayBuffer> — BufferSource requires ArrayBuffer backing under TS 7; the server/safeFetch.ts precedent compiles only because server/ is outside tsconfig scope.
- [Phase ?]: [Phase 09-01] PORT-01/PORT-02 stay unchecked until the plans proving end-to-end behavior — 09-01 ships foundations only (mirrors the 04-02 PAGE-01 / 06-01 ACPT-03 split precedent); requirements-completed is [].
- [Phase 9]: 09-02: escapeMarkdownLine escapes only the PERIOD of a leading ordered-list marker (1974\.) — CommonMark backslash escapes apply only before ASCII punctuation; escaping a digit leaks a literal backslash. Leading symbol runs (#-+*>) escape per-char.
- [Phase 9]: 09-02: HighlightSection exported alongside the six required markdown.ts symbols; loadAllHighlights/loadAllNotes mirror loadAllLocations (plain-array whole-library reads, db.ts byte-unchanged — Pitfall 9 held). PORT-01/PORT-03 stay unchecked until the end-to-end export plans (09-01 split precedent).
- [Phase ?]: [Phase 9] 09-03: applyPreferencesDefault reads reader-prefs row PRESENCE directly (db.settings.get) — loadSettings returns ok:true+DEFAULT_SETTINGS on first run identically to ok:true+parsed for a persisted row, so the plan's 'ok ⇒ row exists' mechanism was unimplementable; behavior contract (D9-12) wins. Test-locked both ways.
- [Phase ?]: [Phase 9] 09-03: memoized D9-13 re-resolution calls the exported resolveQuoteSelectorInText core with per-article memoized clusters (normalizeText/graphemeClusters once per article id, not per highlight — RESEARCH Pattern 8 mandate); identical semantics to resolveQuoteSelector without per-highlight recompute. REUSE-DO-NOT-FORK held.
- [Phase ?]: [Phase 9] 09-03: identical duplicate article (same id+revision+hash — re-import-on-same-device, absent from the D9-14 table) = calm no-op (skipped, never a conflict, not added). id-kind overwrite = same-id upsert. resolveImportPlan re-reads local PK sets (async variant); preview kept for the 09-05 call shape but ignored for decisions. PORT-02 stays unchecked until 09-04/09-05/09-06 prove end-to-end import.
- [Phase 9]: 09-04: validateBundle never throws — unparseable bundle.json routes to invalid, unusable manifest.json routes to corrupted with all five blocks (six-kind contract + never-throw-to-reader hold on paths the RESEARCH example left unguarded) — Keeps every hostile-input class a calm typed refusal; no throw path reachable from file content
- [Phase 9]: 09-04: Bomb-cap semantics — fflate filter skips over-cap entries BEFORE inflation; capped REQUIRED entry surfaces as missing-entry, capped extra entries are inert; test crafts a >200MB DECLARED originalSize by patching the zip central-directory size field (the exact metadata the filter reads) — Proves the no-allocation refusal without materializing 200MB in the test process
- [Phase 9]: 09-04: applyImport uses two explicit-arity db.transaction calls sharing one puts-only closure (tsc rejects union-of-tuples spread); db.settings joins only under plan.applyPreferences; rollback proven via injected Dexie creating-hook failure — Identical runtime semantics; the table-set gating stays literal and the closure stays puts-only (Pitfall 1)
- [Phase ?]: 09-05: ImportPreviewDialog is a structural RemoveConfirm clone (D9-11/Pitfall 8) — data-initial-focus on Cancel import; onProceed fires ONLY from the Import button onClick; keep-both only for the id kinds; every override defaults to Skip — Pitfall 8 isolation forbids a shared ConfirmDialog; applyImport keeps a single grep-verifiable call site in the SettingsPanel Proceed handler (T-9-16)
- [Phase ?]: 09-05: buildBundleBytes returns Uint8Array<ArrayBuffer> (TS 7 BufferSource; 09-01 sha256Hex precedent); import file-input value resets on refusals AND Proceed/Cancel so same-file retry never no-ops — Type-honest service boundary instead of a UI cast; refusal retry without reset would silently ignore re-picking the same file
- [Phase ?]: [Phase 9 09-06]: Two browser contexts are the machine A/B surrogate (isolated IndexedDB per profile); the SC#4 round-trip gate runs export→transfer→import through the real UI with offset byte-equality at the raw IndexedDB row level + a visible mark for the fixture-backed highlight
- [Phase ?]: [Phase 9 09-06]: Rule 1+2 fixes the gates surfaced — Esc-originated close routes cleanup through onCancel (open-prop mirror; every close path resets the import state machine + file input), and library-wide export renders vanished-article highlights in a citation-less 'Highlights without an article' section instead of silently dropping them (D9-09)
- [Phase ?]: [Phase 9 09-06]: Stacked-modal sequential focus nav diverges by engine (chromium cycles, firefox retains last control, webkit parks on inert body) — universal trap safety + operability asserted on all engines, wrap cycle chromium-only; structural fixes reverse 09-05 decisions so surfaced in deferred-items.md for 09-07/human choice
- [Phase 09-07]: Phase 09-07: The 24-cell pre-existing deficit (grown to 39) was a GEOMETRY regression, not Vite 8/Rolldown measurement timing - the Phase 8-04 TagEntry + Phase 9-05 Export button grew the pinned paginated article's uncapped header row past the page viewport (67px at 360x640 -> bogus oversize fallback; 0px at <=320x420 -> pagination never ran). Fixed in src/app.css: header row capped at minmax(auto,25%) + scrollable header (page always keeps >=75%); pagination specs byte-unchanged (strengthen-only trivially satisfied).
- [Phase 09-07]: Phase 09-07: Honest full-suite gate GREEN - npm run test exit 0 in one invocation (unit 851/0/7 + e2e 823/0/6 across chromium/firefox/webkit + throttled perf; the 13 skips are the documented intentional set). First run exit 1 recorded honestly (2 webkit load races, fixed in 9459da1). 09-07-OUTPUT.md is the permanent record; Phase 08 deferred debt closed. dexie-migration cells never reproduced (aria-labelledby row shape was never stale - zero changes). Stacked-modal focus item stays OPEN for human product decision.
- [Phase ?]: 10-01: RECV-01 stays unchecked — foundation plan ships deriveReviewSections + Wave-0 sentinels only; requirement closes at the end-to-end panel plans (04-02 PAGE-01 / 09-01 PORT-01 split precedent)
- [Phase ?]: 10-01: MemoizedArticleText lift-and-export from conflicts.ts (not a mirrored twin) — D10-13 reuse discipline; 125/125 portability tests prove behavior-neutrality
- [Phase ?]: 10-01: orphanEntries keep input order + sections exist only for articles with surviving entries — unspecified display details owned by Plans 10-02/10-03
- [Phase ?]: 10-03: deep-link jump — readiness-gated on-mount effect (bounded rAF retry over article/highlight/pagination settles, ~5s cap) reuses the D5-11 tail verbatim + strips /h/ via src/'s first history.replaceState; jumpPendingRef (declared-before-the-restore-effect ordering) suppresses the saved-location restore — deep-link wins (Pitfall 3)
- [Phase ?]: 10-04: RECV-01 stays unchecked — b/.d/.e/.g proven in real browsers (36 new cells) but .c click-from-row, .f curation, .i close in 10-05/10-06 (10-01/02/03 split precedent)
- [Phase ?]: 10-04: Seed-time corpus self-verification — module-load throws if the corpus loses discriminating power (date/position crossing, excerpt uniqueness, shipped-resolver ambiguity verdict); schema-valid spread augmentation (createdAt/tags/ambiguous anchor) over forked helpers
- [Phase ?]: 10-04: Position-sort library-order determinism — Dexie toArray() returns primary-key order, so corpus ids review-alpha-corpus < review-zeta-corpus pin the seeded library order the Position sort must reproduce
- [Phase ?]: [Phase 10 10-05]: Curation dialogs are guarded single-commit structural clones — ReviewNoteDialog invokes ONE commit from BOTH Done onClick and the close listener with a per-session guard (exactly-once writes; Esc commits, Done never double-writes — Pitfall 7 simple option); DeleteHighlightConfirm fires deleteHighlight ONLY in its Proceed onClick and routes Esc-originated closes through onCancel (the 09-06 openRef fix — without it the [open] effect wedges the dialog shut). deleteHighlight's Dexie transaction is the ONE cascade call (highlight+note, one rollback unit).
- [Phase ?]: Phase 11 11-01: unpdf pinned at 1.8.1 (user-approved T-11-SC blocking-human gate, 2026-08-16) — supersedes the STACK.md 1.8.0 lock; diff verified API-neutral; approval record at .planning/phases/11-pdf-intake/11-01-unpdf-approval.md — Exact-pin discipline preserved; legitimacy evidence: unjs publisher, MIT, ~1.85M weekly downloads, zero runtime deps, no install scripts, bundled types
- [Phase ?]: Phase 11 11-01: PDF_MAX_BYTES = 10MB decoded lives in src/ingestion/types.ts with server/limits.ts import+re-export — /src->/server import direction forbidden, so the shared cap lives client-importable; MAX_INGEST_BODY_BYTES = ceil(bytes*4/3)+2048 is the middleware content-length number (Pitfall 7) — Three enforcement points (client picker, middleware guard, orchestrator re-check) share ONE constant; MAX_IMAGE_PIXELS = 16_777_216 is TOTAL PIXELS not bytes (ARCHITECTURE L781 correction); PDF_EXTRACTION_TIMEOUT_MS = 30_000 mirrors REQUEST_TIMEOUT_MS (OQ2)
- [Phase ?]: Phase 11 11-01: synthetic PDF fixtures are committable and self-verifying — the generator's built-in self-check (magic prefix, 500B floor, corrupt marker, second-emit hash idempotency) replaces the relocated Wave-0 sentinel assertions; D11-04 real-PDF calibration corpus stays local + gitignored — Fixtures exercise code paths, not calibration thresholds (11-RESEARCH Validation Architecture); all five additionally verified parseable by real pdf.js via unpdf (page counts, column x-ranges, zero-text scanned, outline dests, corrupt throws)
- [Phase 11]: Phase 11 11-02: Pattern 3's voting unit is the contiguous X-RUN within a y-band, not the whole band — two-column rows share baselines (synthetic fixture + grid-aligned journals), so whole-band spans always cover both columns and gutters become undetectable; runs split at gaps > 1em, spanning runs never vote
- [Phase 11]: Phase 11 11-02: colTextShare attributes only narrow-run text mass by x-center (full-width lines are spanning elements, not column text); top-of-page /XYZ dests coerce the topmost block when no block matches the 1.5-line tolerance — single-column pages structurally cannot false-refuse
- [Phase 11]: Phase 11 11-02: real pdfjs dest arrays are [RefProxy,{name:'XYZ'},left,top,zoom] — coordinates FLAT, not .args (sketch kept as fallback); generator made importable (serializePdf exported, main() direct-run-guarded, fixtures byte-identical) so tiny probe PDFs reuse the corpus serializer
- [Phase 11]: Phase 11 11-04: Extension-aware client cap branches on /\.pdf$/i BEFORE any file read — an over-cap PDF pick never materializes an ArrayBuffer or a POST (Pitfall 7 at the earliest enforcement point); PDFs cap at PDF_MAX_BYTES with pdf-too-large copy, .md/.html keep the 5MB response-too-large branch
- [Phase 11]: Phase 11 11-04: mapReasonToCopy exported from IngestControl.tsx so pdf-copy.test.ts pins the five Pattern-7 strings byte-for-byte AT the live surface (em dashes included); no-jargon guard iterates ALL 16 reasons (T-7-26 extended to the widened enum). bytesToBase64 chunked at 0x8000 elements avoids the String.fromCharCode spread call-stack limit on multi-MB binaries
- [Phase ?]: Phase 11 11-03: D11-09 title-match normalization collapses [-_\\s]+ uniformly (hyphens/underscores count as whitespace) — filenames slugify spaces, so the canonical filename-channel doubled-title case (calm-report.pdf ↔ heading Calm Report) only matches with separator-uniform normalization
- [Phase ?]: Phase 11 11-03: middleware body caps return HTTP 413 + the typed pdf-too-large envelope on both paths — content-length refused BEFORE readBody attaches a data listener (pulled-flag proof), chunked bodies re-checked by Buffer.byteLength after readBody; invalid content-length falls through to the second guard
- [Phase ?]: Phase 11 11-05: PDF refusal e2e no-side-effect assertion = total rows stay at bundled-fixture baseline AND zero PDF-badged rows — the composite library always unions the 6 fixtures with Dexie rows, so a literal 'count is 0' is structurally impossible (markdown-upload dedupe precedent asserts fixtures.length + 1)
- [Phase ?]: Phase 11 11-05: PDF location-restore identity proven via the scrolling-mode save/restore path (persistence.spec.ts tolerances verbatim) — useScrollSave fires only on window scroll (no save on a paginated turn) and paginated page-index restore is documented deferred option (b)
- [Phase ?]: Phase 11 11-06: Rule-4 checkpoint resolved (user, all-recommended) — YouAreTheOne (geometrically single-column; forcing multi-column refusal would violate locked D11-03) replaced by user-supplied genuine 3-column IDOM 50 editorial.pdf which refuses pdf-multi-column; TRACE's two running-head labels deleted (furniture, not content); resume Selected Projects/Education & Certification relabeled heading+paragraph (0.6154→0.9231)
- [Phase ?]: Phase 11 11-06: scriptFragmentGapRatio=1 — the 1.0×lineDelta script-band window is AND-qualified (≤12 chars AND script-sized) so pure decoration fragments (∑ under-limits '𝑘=0' 11.88pt below their equation band) merge while body-sized short lines and math-heavy body lines keep the 0.75 window; a size-only wide window was tried and REVERTED (fused body lines, flipped a synthetic extreme) — synthetic extremes 35/35 green, TRACE 0.8932→0.92
- [Phase ?]: Phase 11 11-07: isReaderable relaxed to blocks.length >= 3 && (textBearingPages >= 1 || nearEmptyPages === 0) — the scanned majority gate already refuses scanned docs BEFORE assembly, so the old text-bearing conjunct double-guarded and false-refused legitimately sparse structured documents (outline/title-page shapes); scannedItemFloor and all PDF_THRESHOLDS stay frozen (11-06 replay pin; re-tuning requires the derive harness)
- [Phase ?]: Phase 11 11-07: Filename discipline in doubled-title-sensitive PDF tests — 'outline-notes.pdf' normalizes to 'outline notes' which fuzzy-matches NEITHER outline heading in either containment direction, so both h2 headings surviving D11-09 consume (ingest) and reaching the DOM (e2e) is itself part of the proof; a filename like 'outlined-doc' would be correctly consumed
- [Phase ?]: 12-02: EPUB admission (D12-10) judges the ASSEMBLED chapter unit, not the individual spine document — frontMatterBook's 2-block front-matter docs vs the pinned 3-unit outcome proved per-document reading contradicts the plan's binding contract; skippedCount discloses units — Pitfall 10 admitted-only numbering coherence; 12-RESEARCH Pattern 5 'the unit is the chapter document'
- [Phase ?]: 12-02: entity-bomb guard = DTD refusal across every parsed XML document — processEntities:false alone parses the DOCTYPE harmlessly (verified against fast-xml-parser 5.10.1), so the pinned epub-unreadable outcome required refusing <!DOCTYPE outright
- [Phase ?]: 12-02: bomb-entry refusal via fflate filter-rejection detection (over-cap entry names recorded, then the book refuses epub-unreadable) — the plan's missing-required-document theory cannot hold — bomb.xhtml is referenced by nothing; filter-before-inflate discipline intact
- [Phase ?]: 12-02: chapter document titles come from the RAW xhtml (sanitize strips <title>); epubToBooks ships bytes-only and computes both hashes in-adapter (originalFileHash + per-chapter sourceHtmlHash) — the orchestrator never re-reads bytes for IngestionMeta.originalHtmlHash
- [Phase 12]: Phase 12-03: saveBook denormalizes a TOP-LEVEL bookId onto stored chapter rows — the plan's v5 articles index is top-level but CanonicalArticle carries bookId only in ingestionMeta; ArticleSchema strip-mode drops the unknown key on read so the canonical contract stays ingestionMeta.bookId
- [Phase 12]: Phase 12-03: ingestEpub parses the FULL widened IngestionResponseSchema (envelope validates the Book itself) then runs the mandated per-article ArticleSchema.parse loop — two-layer T-12-10 defense-in-depth; ?format=epub stays a copy-only middleware hint
- [Phase 12]: Phase 12-03: the .status region gained a success render arm for the book path (stays on the list — navigation is 12-06's); single-article success paths now setMessage(null), behavior-preserving
- [Phase ?]: [Phase 12 12-04]: EPUB provenance.publishedAt is NORMALIZED (toIsoDatetimeOrNull: Date-parsable OPF dc:date to midnight-UTC ISO; unparseable omitted) — Provenance is .datetime()-refined so the plan's literal raw pass-through would fail ArticleSchema.parse on every dated fixture; BookSchema.publishedDate keeps the raw string
- [Phase ?]: [Phase 12 12-04]: Every persisted EPUB hash carries the 'sha256:' prefix (chapter originalHtmlHash + book originalFileHash) — prefix-uniformity with every other persisted hash field wins over the plan's literal bare-hex pass-through
- [Phase ?]: [Phase 12 12-04]: Middleware post-read 413 reason = parsed-body-key then URL-hint then pdf-too-large — body key authoritative when parseable; hint fallback keeps the pinned 11-03 non-JSON over-cap behavior byte-identical while an over-cap EPUB never sees PDF copy (Pitfall 2 closed)
- [Phase ?]: [Phase 12 12-04]: Fixture prose-uniqueness contract — synthetic prose for documents that can MERGE into one article must interleave a per-document token at least every ~64 graphemes (84 = 32 prefix + 20 window + 32 suffix is the shipped selector machinery's ambiguity threshold); the 12-01 shared-run prose made the publisherSplit merge un-admittable at the new per-chapter anchor gate (Rule 1 fix)
- [Phase ?]: [Phase 12 12-07] Bundle v2 ships as the 1|2 union read (ReaderSettingsSchema precedent): v1 bundles import unchanged, v3+ forward-refuses via the peek bumped to > 2, writers emit 2 always carrying the books array; BUNDLE_FILENAME stays lem-reader-bundle-v1.zip — the zip filename is not the version contract
- [Phase ?]: [Phase 12 12-07] manifest.ts deliberately untouched — books are NOT a manifest block (the five Phase-9 blocks stay); T-12-17's mitigation is Zod-at-boundary + the puts-only transaction
- [Phase ?]: [Phase 12 12-07] Book conflict semantics: same id + different originalFileHash skips by default; identical-hash is a calm no-op; keep-both behaves as skip — a minted book id would strand every chapter FK
- [Phase ?]: [Phase 12 12-07] applyImport stamps the top-level bookId on chapter puts (Rule 2 — saveBook's v5 index contract): imported chapter rows stay index-uniform with saved ones; canonical FK stays ingestionMeta.bookId; the six-table settings branch uses Dexie's readonly-array overload (tuple overloads stop at five tables)
- [Phase 12]: 12-06: D12-05 paginated chapter nav is ArticleView-owned position:fixed chrome after the surface — out of the grid flow so mounting on the final page never perturbs .page-viewport geometry; pageState mirrored from onAnchorChange via surfaceRef.getState() (no props changed, no state lifted) — 12-06: D12-05 paginated chapter nav is ArticleView-owned position:fixed chrome after the surface — out of the grid flow so mounting on the final page never perturbs .page-viewport geometry; pageState mirrored from onAnchorChange via surfaceRef.getState() (no props changed, no state lifted)
- [Phase 12]: 12-06: chapter links are the first article→article navigation keeping ArticleView mounted — D4-10 anchor refs reset on swap (stale offset opened the next chapter at its END); .chapter-nav-title italic not opacity (0.75 blended to 3.83:1, an axe AA fail) — 12-06: chapter links are the first article→article navigation keeping ArticleView mounted — D4-10 anchor refs reset on swap (stale offset opened the next chapter at its END); .chapter-nav-title italic not opacity (0.75 blended to 3.83:1, an axe AA fail)
- [Phase ?]: 12-08: EPUB DTD guard calibrated to the threat — refuses only internal-subset <!ENTITY declarations (billion-laughs/entityBombOpf shape); the EPUB 3.3 spec own DOCTYPE html nav template is tolerated after the corpus proved the blanket refusal false-refused accessible_epub_3 into the fallback partition (Rule 1, 131621f) — The corpus did its declared job: proved the novel TOC-merge logic against real publisher output and caught a real false-refusal. Synthetic suites stayed green; no threshold values changed.
- [Phase ?]: 12-08 D12-12 closed: 7 real books admitted at TOC-derived chapter counts with zero fallback fires and per-chapter anchor round-trips; evidence is CI-replay-pinned (thresholds deep-equal) so admission changes cannot silently loosen. Anchor-gate ambiguous skips (identical figure-fallback openings, Lorem repetition) are honest D12-11 disclosures, and the minimal-v2 packaging template is a manifest gap record — not a threshold-loosening excuse. — Real-corpus honesty: expected counts encode post-stage admissions with per-book derivation bases; gaps recorded (single_entry_toc verbatim, ncx_primary_toc consequence). Whole-novel allocation churn + unbounded per-chapter stage loop deferred with diagnosis (deferred-items.md).
- [Phase 13]: 13-01: localStorage settings mirror (lem-settings-mirror-v1) + inline pre-React paint-hint script in index.html kill the cold-load settings flash (POLISH-01) — Dexie stays sole truth; on STATE-05 failure the provider keeps the mirror-painted settings (no second flash); hydrate self-correct rewrites a stale/missing mirror at first successful hydration
- [Phase 13]: 13-02: paginatedProgressRatio = pageStartGlobalOffset / graphemeLength clamped [0,1] (POLISH-02) — the D8-11 LibraryRow ratio transplanted to the paginated hairline; composes ONLY the two shipped helpers (REUSE-DO-NOT-FORK, no new offset walk) — Old N/M semantics read 100% on a one-page open and 50% at page 1 of 2 — offset anchoring matches actual text position and the D-05 restore coordinates
- [Phase ?]: 13-03: margin:auto on the four centered modals restores WHATWG §15.3.3 UA dialog:modal centering — CSS-only, zero JS positioning; side sheets keep intentional margin:0 inline-end anchoring
- [Phase ?]: 13-03: LibraryView tidy is structure-only — header row (h1 + Review button) then three unlabeled sections (continue → add+status → list); margin-collapsing wrappers keep one --space-xl rhythm
- [Phase 13]: [Phase 13]: 13-05: ACPT-05 instrument ships now / requirement closes at proof (D13-07) — 13-VERIFICATION.md carries the NVDA runbook + empty findings sheets + the in-file flip condition (zero blocker/major at results-land, fix-then-re-run D13-06); REQUIREMENTS.md ACPT-05 deliberately stays unchecked — instrument-ships-now / requirement-closes-at-proof — the 04-02/06-04 precedent; the user runs docs/ACCEPTANCE-PROTOCOL.md v1.0 as-documented (D13-04) on Windows hardware on their own schedule
- [Phase 13]: [Phase 13]: 13-05 D13-11 gap closure: withPdfDocument 30s timeout firing path proven by a 3-case fake-timers spec (typed server-error rejection with exact copy, always-destroy finally, control race) — zero production changes; PDF_EXTRACTION_TIMEOUT_MS imported from server/limits.ts (its definition site; the plan's read_first pointer to src/ingestion/types.ts was a doc misdirection corrected by grep) — the 11-VERIFICATION § Acknowledged Gaps closure terms mandate test-only closure; the race was wired since 11-02 but exercised by no test
- [Phase ?]: [Phase 13 13-04] Option A (HUMAN DECISION 2026-08-18, Rule 4 checkpoint resolved): additive pagination-engine parameter firstPageReservedPx (default 0 = byte-equivalent) — page-1 content budget = viewport − reserve, floor-clamped; ArticleView measures the metadata-spot margin-box once at settle (same rAF batch as the viewport height, so first-publication==settled holds) and threads it through PaginatedSurface; pages 2+ full budget; guard/DEV-hook/anchors reserve-unaware; stale reserve after mid-article typography change is a documented guard-covered edge.
 - [Phase ?]: [Phase 13 13-04] Single-owner chrome mounting: the article-top spot is parent-OWNED but surface-MOUNTED (articleStartChrome) — a pageState-gated spot lags turns by one commit and transiently renders page 2 inside page-1 geometry (guard overflow → dom-fallback session flip, observed 3 engines). Reserve floors must stay honest: a floor above physically remaining space only manufactures guard-healed overflow (0.25 anti-degenerate floor + compact spot CSS ≈169px desktop / ≈217-246px mobile).
 - [Phase 13]: 13-06 repair (HUMAN-SANCTIONED Option A fixes, 2026-08-18 decision): (A) engine soft-budget whole-fitting escape in fragment.ts — a block that cannot widow-split the reserved page-1 budget but fits WHOLE at the FULL page height is placed whole (chooseSplit returns null in exactly that geometry, so the split-only retry manufactured the fallback the reserve must never produce — the module's own L396-401 invariant); the guard heals the overshoot where physics allow. 3 engine unit tests lock it (reproducer 251px/209px/62.75px budget, reserved==unreserved pages identity, short-block class).
 - [Phase 13]: 13-06 repair: firefox fieldset internal-clamp mechanism — firefox sizes the .tag-entry fieldset's internal wrapper from the input's intrinsic size=20 width and IGNORES min-width/width/max-width ON THE FIELDSET for that inner clamp; min-width:0 alone leaves 298 vs 288 at 320px (WCAG 1.4.10). width:100% on .tag-entry-input makes the intrinsic contribution definite → overflow eliminated, input still fills the row via flex-grow. Probed empirically; firefox reflow ×7 + high-zoom ×6 green.
 - [Phase 13]: 13-06 repair: the epub/a11y chapter cells' 360×480 geometry is BELOW the Option A spot's physics floor — the ~209px spot in a 251px page-1 box leaves no room for ANY widow-legal slice, so the guard's honest scrolling fallback fires (uniform for articles AND chapters) and the M-label round-trip can never pass inside an override session (the header ModeToggle label tracks only the PERSISTED preference; M clears the override invisibly). Realigned strengthen-only to 360×640 (the D13-13 pinned mobile geometry where the sanctioned engine escape + guard heal work as designed — probe-verified 3 guard-healed pages). Honest gate exit 0: 2257 passed / 0 failed / 19 skipped.

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 3 → resolved]: Pretext adoption tolerances + metric fingerprints landed in Phase 3 (calibration/fingerprint.json committed; headings eligible chromium/firefox, partial webkit, paragraphs DOM-only; runtime drift guard + CI gate in place).
- [Phase 4 → PLANNED (Plan 04-06)]: The pagination engine cannot paginate ANY corpus fixture. Two compounding issues: (1) PaginatedSurface replaces the full ArticleBody with a single page fragment before the engine reads live line boxes via `articleEl.querySelectorAll(BLOCK_SELECTOR)`; (2) every fixture contains container blocks (blockquote/lists) whose nested children break the engine's `elements.length !== articleBlocks.length` guard → `dom-fallback`. **Resolution path = Plan 04-06** (user-approved Option A + data-block-index + fold-in persistence failures): capture LineBox[][] during the measurement phase + add data-block-index for a 1:1 block↔element mapping + engine consumes pre-captured line boxes + remove the corpus-matrix ok-path e2e skips + fix the pre-existing persistence.spec.ts STATE-01 failures. See 04-06-PLAN.md.
- [Phase 4 → deferred → folded into 04-06]: persistence.spec.ts STATE-01 location-restore tests fail pre-existing since 04-02/04-03 (paginated default + paginated-surface geometry prevents window scroll). Now tracked under Plan 04-06 Task 5 (test-only fix: seed readingMode "scrolling").
- [Phase 5]: Offset units, grapheme handling, overlap semantics, and anchor confidence thresholds need explicit decisions.
- [Phase 4 → RESOLVED by 04-07/04-08/04-09/04-10/04-11]: gsd-verifier caught 76 hidden e2e failures misreported as "269 passed / 0 failed" across every Phase 4 SUMMARY + STATE + ROADMAP + REQUIREMENTS + the Plan 04-05 Task 3 gate-approval commit. Reality was 76 failed / 269 passed. Gap-closure plans 04-07 (PAGE-03b overflow guard), 04-08 (PAGE-06/07 always-mounted ArticleBody), 04-09 (PAGE-01/02 M-toggle + keyboard/chevron), 04-10 (PAGE-09 banner race) closed all 6 structural gaps. Plan 04-11 re-ran the FULL `npm run test` suite end-to-end: 753 passed / 0 failed / 0 skipped, exit 0. 04-VERIFICATION.md upgraded gaps_found (3/7) → verified (7/7). The Plan 04-05 Task 3 human-verify gate now has a genuinely-green automated prerequisite.
- Phase 08 honest-suite gate RED → RESOLVED by Phase 9 Plan 09-07 (2026-08-15): 24 pre-existing e2e failures in unrelated specs (18 pagination Phase 4 PAGE-03a/b/c + PAGE-04, 3 capture-highlight Phase 5 ANNO-01, 3 dexie-migration Phase 8-02 v3->v4; the pagination deficit had silently grown to 33 cells). Root cause was GEOMETRY, not the suspected Vite 8/Rolldown timing: the Phase 8-04 TagEntry + 9-05 Export button grew the pinned paginated article's uncapped header row past the page viewport. One src/app.css fix (header row capped minmax(auto,25%) + scrollable header) closed all 39 affected cells; pagination specs byte-unchanged. FULL npm run test now exits 0 (1674 passed / 0 failed / 13 intentional skips) — 09-07-OUTPUT.md is the permanent record; deferred-items.md carries the closure note.
- [Phase 13 → RESOLVED by the 13-06 post-merge repair (2026-08-19)]: the 13-04 commit `12cf39d` (Option A page-1 spot reserve) broke 55 pre-existing e2e cells that encoded the old page-1 geometry — pinned by git bisect with fresh dev servers, recorded in 13-06-OUTPUT.md. Repair: 27 cells were stale expectations (spec-side realignment, strengthen-only); 28 were two production regressions resolved by the HUMAN-SANCTIONED Option A fixes (engine whole-fitting escape `d89300b`; firefox reflow CSS `8d7b558`+`f7b5734`); the epub/a11y 15 additionally required the 360×480→360×640 geometry realignment (`14b99f4`) — at 480 the spot physics make paginated page 1 impossible (honest guard fallback). Honest gate `npm run test` exit 0 (run 6: 2257 passed / 0 failed / 19 skipped). 13-06-OUTPUT.md §Repair is the permanent record.

## Deferred Items

Items acknowledged and deferred at milestone close on 2026-08-10:

| Category | Item | Status |
|----------|------|--------|
| v2 | Orientation aids, annotation recovery, portability, and presentation presets | Deferred at roadmap creation |
| debug | error-state-guidance-copy | Resolved by Plan 01-04 (file not moved to resolved/) |
| debug | fixture-list-header-spacing | Resolved by Plan 01-04 (file not moved to resolved/) |
| debug | footnote-router-collision | Resolved by Plan 01-05 (file not moved to resolved/) |
| uat | Phase 01 UAT status flag | Gaps closed by 01-04/01-05; status not flipped from diagnosed |
| verification | Phase 02 verification status flag | 17/17 truths verified; 3 manual-only items (SR announce quality, calm aesthetic, focus-ring visibility) are not code gaps — acknowledged on phase advance |

## Session Continuity

Last session: 2026-08-19T16:10:00Z (13-06 post-merge repair complete)
Stopped at: 13-06 repair complete — honest gate exit 0 (2257 passed / 0 failed / 19 skipped); Phase 13 ready for verification
Resume file: None

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
