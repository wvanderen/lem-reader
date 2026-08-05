# Phase 4: Responsive Pagination and Dual-Mode Navigation - Research

**Researched:** 2026-08-05
**Domain:** Project-owned responsive pagination engine + dual-mode navigation over a shared canonical document model
**Confidence:** HIGH

## Summary

Phase 4 builds the **project-owned pagination engine** that turns Phase 3's trusted `MeasurementResult` into **explicit source-range page fragments rendered semantically**, plus the dual-mode navigation that lets the reader move predictably through pages and switch (or fall back) to scrolling without losing their logical passage. The stack is fully locked (STACK.md / AGENTS.md): no new dependencies, no CSS-columns engine, no Paged.js, no component suite, no Redux/Zustand. Every locked decision (D4-01 through D4-12) and the four deferred fallback questions are settled in CONTEXT.md and UI-SPEC §23. This research fills the architecture gaps the planner needs.

The single most consequential technical finding: **the calibration fingerprint proves paragraphs are NEVER Pretext-eligible** (`paragraph.eligible === false` across all 2592 sampled cells; `heightDriftP95` 4.9–39.6px; `breaksMatchRatio` 0–1.0) `[VERIFIED: calibration/fingerprint.json]`. Only **headings** are Pretext-eligible (`heading.eligible === true`, drift ~0.01px, breaksMatchRatio 1.0). But D4-02 makes headings ATOMIC (never split). Therefore **Pretext's `measureParagraphWithBreaks` — which returns line-break positions — CANNOT be trusted for paragraph split points**, and the pagination engine MUST derive split points from **DOM `Range.getClientRects()` line-box → source-offset mapping** for every splitting kind (paragraph, list-item, blockquote child). This is the measurement extension the CONTEXT Discretion flagged, and it resolves the "Pretext line-break positions for eligible kinds" option: there are no Pretext-eligible *splitting* kinds in this corpus. The engine is DOM-driven for fragmentation; Pretext remains Phase 3's measurement fast path for heading height only.

The second key finding: the **D-05 grapheme substrate is already complete for passage preservation**. `useScrollSave.computeOffset()` already computes the "top-of-current-view → grapheme offset" in scrolling mode, and `findScrollTarget()` already resolves "grapheme offset → DOM block" in both directions `[VERIFIED: src/reader/useScrollSave.ts, src/reader/restoreLocation.ts]`. The mode-switch anchor (D4-10) and repagination anchor (D4-11) reuse these exact helpers — no parallel implementation. The single content-tree rule (A11Y-03) is satisfied by rendering **one page fragment at a time** (UI-SPEC preferred); the `inert`+`aria-hidden` fallback is documented and `inert` is Baseline-widely-available since April 2023 `[CITED: developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inert]`.

**Primary recommendation:** Build the pagination engine as a pure module `src/pagination/` that (a) consumes the trusted `MeasurementResult` + a fresh DOM line-box pass via `Range.getClientRects()` to compute source-range page fragments, (b) applies the D4-01/D4-02/D4-03/D4-04 fragmentation policy with an exhaustive `BlockKind` switch (Pattern F), (c) reports PAGE-04/PAGE-09 failures through the existing `DiagnosticBus` (`dom-fallback` + `measurement-error` reader-visible; other 4 silent), and (d) reuses `BlockRenderer`'s `BlockView` to render semantic fragments — never forking a parallel renderer. Add `readingMode` to `ReaderSettingsSchema` (schemaVersion 1→2, default `"paginated"`) as a Zod value-shape evolution with **no Dexie store change** (the settings store is key-value; Dexie is opaque to the value shape).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (research THESE deeply — no alternatives)

**Block Fragmentation Policy (PAGE-03):**
- **D4-01:** Booklike flow — split at line boundaries. Paragraphs and other text-container kinds split at line boundaries so each page fills like a real book, with source offsets preserved at every split (D-05 round-trip) and accessible reading order maintained.
- **D4-02:** Atomic set = figure + heading + code-block + footnote-reference + unsupported (NEVER split; move whole to next page). Splitting kinds = paragraph, list item (`<li>` contents), blockquote child blocks.
- **D4-03:** Heading widow rule = heading + first 2 lines of the following block on the same page.
- **D4-04:** Line-level widow/orphan rule = 2-line rule at split boundaries.

**Page Navigation Controls (PAGE-02):**
- **D4-05:** Full keyboard bundle — `PageUp`/`PageDown` + `ArrowLeft`/`ArrowRight` + `Space` (forward) / `Shift+Space` (back).
- **D4-06:** Quiet visible page-turn buttons + left/right swipe. NO invisible click zones.
- **D4-07:** Context-aware focus + concise SR status ("Page N of M"). Only the current page is in the tab/reading order (A11Y-03).
- **D4-08:** "Page N of M" IS the paginated progress signal (hairline region derives from N/M).

**Mode Switch + Passage Anchor (PAGE-01, PAGE-05):**
- **D4-09:** Header toggle + `M` keyboard shortcut.
- **D4-10:** Mode-switch anchor = top-of-current-view → grapheme offset → target.
- **D4-11:** Repagination anchor = same top-of-view rule (one consistent anchor for both triggers).
- **D4-12:** Add `readingMode: "paginated" | "scrolling"` to `ReaderSettingsSchema`, default `"paginated"`, schemaVersion 1→2.

### the agent's Discretion (research options, recommend)

- **Measurement extension for split points** — Phase 3's `MeasurementResult` carries per-block `{kind, heightPx, lineCount}` but NOT line-break positions or per-line source offsets. Phase 4 EXTENDS measurement to carry split-point data. The contract is locked (D-05 grapheme round-trip); the extension mechanics are architecture. *(Resolved by this research: DOM `Range.getClientRects()` is the only viable path — see Standard Stack + Code Examples.)*
- **Page geometry specifics** — width follows `--measure`; height is viewport-bounding. *(Resolved by UI-SPEC §Layout: `height: calc(100vh - 48px - 2px - 2 * var(--space-2xl))`, `2xl`=48px book margin.)*
- **Page-turn button placement + swipe-vs-zoom conflict** — *(Resolved by UI-SPEC §17/§18: page-side chevrons, single-touch horizontal swipe = page turn, multi-touch = native pinch-zoom, `touch-action: pan-y pinch-zoom` on page content-box.)*
- **Fallback policy + diagnostic surfacing (PAGE-04, PAGE-09)** — *(Resolved by UI-SPEC §23: whole-article fallback, 75%-of-page threshold, 300-page non-termination limit, zero-progress detection, `dom-fallback`+`measurement-error` reader-visible, other 4 silent.)*
- **`TextMeasurer` adapter / pagination-engine module boundary** — *(Architecture: see Architecture Patterns — `src/pagination/` module with versioned contract.)*
- **Diagnostic substrate consumption mechanics** — *(Architecture: paginated view subscribes to `DiagnosticBus.subscribe()` + `recent()`; only 2 kinds trigger banner.)*
- **Exact toggle copy/labeling, hairline region layout, "N of M" typography** — *(Locked by UI-SPEC §Copywriting + §Interaction 20.)*

### Deferred Ideas (OUT OF SCOPE — ignore completely)

- **Highlights and notes** → Phase 5 (ANNO-01…07, STATE-03). Phase 4's source-offset fragments + D-05 coordinate are the substrate Phase 5 anchors against. D4-06 (no invisible click zones) chosen partly to avoid Phase 5 selection conflict.
- **Formal cold/warm repagination performance budgets (ACPT-04)** → Phase 6. Phase 4 repagination must FEEL responsive (inherits Phase 3 coalescing + staleness) but formal budget acceptance is Phase 6.
- **Heading navigator and line-focus aid (ORNT-01/02)** → v2. Phase 4 claims arrow keys (D4-05); v2 disambiguates if needed.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PAGE-01 | Reader can switch explicitly between paginated and scrolling modes for the same normalized article. | D4-09 header toggle + `M`; D4-10 top-of-view→grapheme→target anchor; `readingMode` field in `ReaderSettingsSchema` (D4-12); ArticleView mode-aware render branch. See §Architecture Patterns (Mode Switch). |
| PAGE-02 | Reader can move forward and backward through responsive pages using keyboard, pointer, and touch controls. | D4-05 keyboard bundle; D4-06 page-side chevrons + swipe; D4-07 context-aware focus + "Page N of M" announce. See §Architecture Patterns (Page-Turn Controls). |
| PAGE-03 | Pagination preserves every supported content unit exactly once and in canonical order, without silent clipping, duplication, omission, or non-terminating pagination. | D4-01 booklike line-split + D4-02 atomic set + D4-03/D4-04 widow rules; the engine walks `article.blocks` in order producing contiguous source ranges. See §Architecture Patterns (Fragmentation) + §Validation Architecture (exactly-once invariant). |
| PAGE-04 | Pagination terminates with a usable result or an explicit scrolling fallback for oversized or unsupported content. | UI-SPEC §23: 75%-of-page atomic-oversize threshold + 300-page non-termination limit + zero-progress detection → whole-article scrolling fallback at same passage. See §Architecture Patterns (Fallback). |
| PAGE-05 | Reader remains at the same logical passage when switching modes or when viewport/typography/font/asset trigger repagination. | D4-10/D4-11 single anchor rule; Phase 3 `trustedView` retention (PAGE-06) keeps old view mounted during compute. See §Architecture Patterns (Passage Preservation). |
| PAGE-09 | Pagination records actionable diagnostics and presents an understandable reason when it falls back to scrolling. | UI-SPEC §23 mapping: `dom-fallback` + `measurement-error` → reader-visible `.status` banner; other 4 DiagnosticEvent kinds silent record. `DiagnosticBus.subscribe()` seam. See §Architecture Patterns (Diagnostic Surfacing). |
</phase_requirements>

## Project Constraints (from AGENTS.md)

Phase 4 inherits the full STACK.md lock embedded in AGENTS.md. The directives that govern this phase, enforced as hard constraints:

- **Project-owned pagination engine** producing **explicit source-range page fragments rendered semantically** — NOT CSS columns, NOT Paged.js, NOT Vivliostyle. "Render only complete semantic blocks where possible; when text must split, preserve source offsets and accessible reading order."
- **Persisting derived page boundaries is FORBIDDEN** (STACK.md). Paginated mode recomputes on every trigger; never stored. Pagination state is React state/local.
- **Authored CSS layers + custom properties, NO Tailwind, NO shadcn, NO component suite.** New controls are native HTML + authored CSS + inline SVG.
- **Semantic HTML renderer; DOM reading order equals document order in both modes; only the current page is in the tab/reading order in paginated mode** (A11Y-03 — no duplicate active content tree).
- **React 19 + TypeScript + Vite 8 SPA; React state/context only (no Redux/Zustand).**
- **Playwright across Chromium/Firefox/WebKit for layout truth** — pagination correctness MUST be validated in real browsers across the 6-fixture corpus × viewport × typography matrix, NOT in a DOM emulator (jsdom/happy-dom do not implement layout truth).
- **Zod-at-boundary validation** — the new `readingMode` field and any page-fragment contract are Zod-validated.
- **Exhaustive block-kind switch, no default** (Pattern F — BlockRenderer, chooseStrategy) — fragmentation policy uses the same discipline.
- **D-05 grapheme offset is the ONLY durable passage identity** — page numbers are informational, never persisted/bookmarked/treated as coordinates.
- **ESLint `react/no-danger` enabled** — no raw-HTML injection; the fragment renderer emits JSX/text children only.
- **Pitfall 9 (Dexie)**: never edit a shipped version block; schema evolution APPENDS `version(N)` blocks. The `readingMode` change is a value-shape evolution (see §Common Pitfalls).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Page-fragment computation (source ranges) | App / Domain logic (`src/pagination/`) | — | Pure function of `MeasurementResult` + DOM line-box pass; deterministic; never touches React. STACK.md: "Treat pagination as domain logic with deterministic inputs." |
| Line-box → source-offset mapping (split points) | Browser / DOM (`Range.getClientRects`) | App (grapheme offset math) | Only the browser owns CSS layout truth; Pretext is NOT eligible for paragraphs (fingerprint). |
| Page-fragment rendering (semantic DOM) | Browser / Client (React `BlockView`) | — | Reuses `BlockRenderer` — no fork. DOC-02 reading order + D-05 integrity depend on same semantic output. |
| Page-turn input (keyboard/pointer/swipe) | Browser / Client (window listeners) | — | Global listeners mounted on `<article>` in paginated mode; `{ passive: true }`; `preventDefault` only on handled keys. |
| Mode-toggle state + persistence | App (SettingsContext) | Storage (Dexie key-value) | `readingMode` flows through existing `SettingsContext` + debounced persist (D2-03 live-apply). |
| Passage-preservation anchor | App (`restoreLocation`/`useScrollSave` helpers) | — | D-05 grapheme substrate; same helpers in both modes. |
| Fallback surfacing (PAGE-09 banner) | Browser / Client (`.status` region) | App (`DiagnosticBus` subscription) | D3-04 reserves `.status` for consequential fallback; `DiagnosticBus.subscribe()` is the seam. |
| Staleness contract (PAGE-05/SC4 retention) | App (`useMeasurement` `trustedView`) | — | Already implemented Phase 3; Phase 4 consumes it. |
| Page geometry | Browser / Client (CSS) | — | `width: var(--measure)`, `height: calc(100vh - 48px - 2px - 2 * var(--space-2xl))` in authored CSS. |

## Standard Stack

**No new packages.** Phase 4 installs zero dependencies. The entire stack is locked by STACK.md and present since Phase 1–3. The list below documents what the pagination engine CONSUMES and why each is the standard for its role.

### Core (consumed, not installed)

| Library | Version (pinned) | Purpose in Phase 4 | Why Standard |
|---------|---------|---------|--------------|
| React + React DOM | 19.2.8 | Reader shell, mode-aware render branch, page-fragment renderer, page-turn controls, mode-toggle, focus management | SPA with `createRoot`; the paginated surface is React state-driven (current page index). No SSR. `[VERIFIED: package.json]` |
| TypeScript | 7.0.2 | Pagination contracts (`PageFragment`, `SplitPoint`, `FragmentationResult`), exhaustive `BlockKind` switch | Strict TS makes fragmentation boundary/data-shape failures explicit. `[VERIFIED: package.json]` |
| Zod | 4.4.3 | `readingMode` field + page-fragment contract validation at boundaries | The new `readingMode` enum + any persisted-adjacent contract is Zod-validated (V5 boundary discipline). `[VERIFIED: package.json]` |
| Dexie | 4.4.4 | `readingMode` persistence (settings key-value store) | Value-shape evolution only — no store change (see §Common Pitfalls 9). `[VERIFIED: package.json]` |
| `@chenglou/pretext` | 0.0.8 (exact pin) | Phase 3 measurement fast path for heading height | **Phase 4 does NOT add new Pretext usage.** Fingerprint proves paragraphs ineligible; headings are atomic. Pretext stays Phase 3's tool. `[VERIFIED: package.json + calibration/fingerprint.json]` |

### Browser Primitives (Phase 4's actual "stack")

| Primitive | Purpose | Required usage | Source |
|-----------|---------|----------------|--------|
| `Range.getClientRects()` | Map a character sub-range of a block to its DOM line boxes (one `DOMRect` per line) | The split-point primitive. Set `range.setStart`/`setEnd` at character offsets within the block's text node(s); read `rect.top`/`rect.bottom` to find which lines fit on the page. Baseline widely available since July 2015. | `[CITED: developer.mozilla.org/en-US/docs/Web/API/Range/getClientRects]` |
| `Element.getClientRects()` | Whole-element line-box count (already used Phase 3 for `lineCount`) | Cross-check: `el.getClientRects().length` equals the number of line boxes the range walk should produce. A multiline inline-level element has a border box per line. | `[CITED: developer.mozilla.org/en-US/docs/Web/API/Element/getClientRects]` |
| `document.fonts.ready` | Font readiness gate | Inherited from Phase 3 (`awaitFontsReady`). Pagination MUST NOT commit before fonts settle or split points drift. | `[VERIFIED: src/measurement/fontGate.ts]` |
| `ResizeObserver` | Viewport/content-box change trigger | Inherited from Phase 3 coalescer. Page count responds to viewport. | `[VERIFIED: src/measurement/triggers.ts]` |
| `Intl.Segmenter` (granularity: grapheme) | Map DOM character offsets ↔ D-05 grapheme offsets | The bridge between `Range` offsets (UTF-16 code units in a text node) and the canonical D-05 grapheme substrate. Reuse `graphemeClusters()` from `normalizeText.ts` exactly. | `[VERIFIED: src/content/normalizeText.ts]` |
| `inert` global attribute | Hide non-current-page subtree from tab/reading order (FALLBACK only) | Baseline widely available since April 2023. **Preferred: render only one page (no `inert` needed).** Use `inert`+`aria-hidden` only if dual-mount is unavoidable. MDN caveat: "no visual way to tell inert content" — fine here because the reader never sees non-current pages. | `[CITED: developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inert]` |
| Selection/Range APIs | (Phase 5 — not this phase) | Phase 4 does NOT capture selections. | deferred |
| IndexedDB | `readingMode` persistence | Via Dexie. | `[VERIFIED: src/persistence/db.ts]` |

### Alternatives Considered (and rejected — locked by STACK.md)

| Instead of | Could Use | Tradeoff (why rejected) |
|------------|-----------|----------|
| Project-owned pagination engine | Paged.js / Vivliostyle | Print/PDF-oriented CSS Paged Media; lacks interactive responsive repagination + local annotations + always-available scrolling twin. `[CITED: research/STACK.md]` |
| Explicit source-range page fragments | CSS `columns` | Browser fragmentation owns boundaries; complicates explicit page model, stable location mapping, overflow detection, predictable focus/navigation. `[CITED: research/STACK.md + MDN CSS multicol]` |
| DOM `Range.getClientRects()` for split points | Pretext `layoutWithLines` | **Calibration fingerprint proves paragraphs ineligible** (drift 4.9–39.6px, breaksMatchRatio 0). Pretext is canvas-measured; the browser's actual line boxes are the only trustworthy source. `[VERIFIED: calibration/fingerprint.json]` |
| Page-number anchors | D-05 grapheme offsets | Page numbers change with viewport/font/zoom/asset; D-05 is the only stable coordinate. `[CITED: research/STACK.md]` |
| React state/context | Redux/Zustand/XState | Reader UI state is modest; another abstraction obscures document/layout/persistence boundaries. `[CITED: research/STACK.md]` |

**Installation:** `npm install` (no arguments — nothing new). All deps already in `package.json`.

**Version verification (confirmatory, all match package.json):**
- `react`/`react-dom` 19.2.8, `typescript` 7.0.2, `zod` 4.4.3, `dexie` 4.4.4, `@chenglou/pretext` 0.0.8, `@playwright/test` 1.61.1 — all `[VERIFIED: npm registry + package.json]`.

## Package Legitimacy Audit

> Phase 4 installs **zero** external packages. The legitimacy gate is therefore a no-op for new installs. The audit below records the status of the consumed (already-installed) packages for planner reference.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@chenglou/pretext` | npm | pre-1.0 (0.0.8) | low (niche) | github.com/chenglou/pretext | OK (prior-phase verified) | Approved — exact pin retained; `scripts.postinstall` empty (no supply-chain risk) `[VERIFIED: npm view]` |
| `dexie` | npm | ~10 yrs | high | github.com/dexie/Dexie.js | OK | Approved — value-shape evolution only |
| `zod` | npm | ~6 yrs | very high | github.com/colinhacks/zod | OK | Approved — schema bump |
| `react` / `react-dom` | npm | ~12 yrs | very high | facebook/react | OK | Approved |
| `@playwright/test` | npm | ~7 yrs | very high | microsoft/playwright | OK | Approved — pagination truth tests |

**Packages removed due to [SLOP] verdict:** none (no new packages considered).
**Packages flagged as suspicious [SUS]:** none.
**Packages tagged `[ASSUMED]`:** none — every consumed package is verified in prior-phase research and confirmed present in `package.json`.

## Architecture Patterns

### System Architecture Diagram

```
                        ┌─────────────────────────────────────────────┐
                        │            SettingsContext                  │
                        │  readingMode: "paginated" | "scrolling"     │
                        │  (live-apply + debounced Dexie persist)     │
                        └──────────────────┬──────────────────────────┘
                                           │ settings.readingMode
                                           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         ArticleView (route)                              │
│                                                                          │
│  useMeasurement(article, articleRef) ──► trustedView: MeasurementResult │
│  (Phase 3 staleness pipeline — PAGE-06/07; Phase 4 now READS the return) │
│                                                                          │
│  ┌─────────────────────────┐         ┌────────────────────────────────┐ │
│  │  readingMode==="scroll" │         │  readingMode==="paginated"     │ │
│  │  (unchanged Phase 2)    │         │  (NEW Phase 4)                 │ │
│  │                         │         │                                │ │
│  │  <ArticleBody article>  │         │  pageFragments = paginate(     │ │
│  │   (full scroll)         │         │    article, trustedView,       │ │
│  │  useScrollSave (offset) │         │    articleEl, diagnostics)     │ │
│  │  ProgressHairline(ratio)│         │  <PaginatedSurface            │ │
│  │  SectionAnnouncer       │         │    fragments={pageFragments}   │ │
│  └─────────────────────────┘         │    current={currentPageIdx}    │ │
│         ▲                            │    onTurn={handleTurn} />      │ │
│         │ D4-10 anchor               │  + page-turn controls          │ │
│         │ (top-of-view→grapheme)     │  + "N of M" indicator          │ │
│         │                            │  + fallback banner (PAGE-09)   │ │
│         └────────────────────────────┴────────────────────────────────┘ │
│                                                                          │
│  Mode switch (D4-09 toggle / M key) ─► compute anchor offset ─►          │
│     scrolling: findScrollTarget(offset).scrollIntoView                   │
│     paginated: setCurrentPage(fragmentContaining(offset))                │
└──────────────────────────────────────────────────────────────────────────┘
                           │
                           ▼ (pure domain module)
┌──────────────────────────────────────────────────────────────────────────┐
│                  src/pagination/ (NEW — project-owned engine)            │
│                                                                          │
│  paginate(article, measurement, articleEl, diagnostics):                 │
│    FragmentationResult                                                   │
│     │                                                                    │
│     │ 1. For each block in article.blocks (canonical order):            │
│     │    - atomic kind (D4-02)? ─► place whole or move to next page     │
│     │    - splitting kind? ─► read DOM line boxes (Range.getClientRects)│
│     │      map each line box → grapheme offset (graphemeClusters)       │
│     │      apply D4-03 heading widow + D4-04 2-line widow/orphan        │
│     │    - D4-04 fallback: if a single line > page height → oversize    │
│     │                                                                    │
│     │ 2. Emit PageFragment[]: contiguous, non-overlapping source ranges │
│     │    covering [0, graphemeLength(article)) exactly once             │
│     │                                                                    │
│     │ 3. Termination guards: >300 pages → abort; N empty pages → abort  │
│     │    → emit dom-fallback diagnostic → whole-article scrolling        │
│     │                                                                    │
│     └─► FragmentationResult = { pages: PageFragment[], status: "ok"|"fallback" } │
└──────────────────────────────────────────────────────────────────────────┘
```

**Trace the primary use case (reader turns page):** page-turn input (key/swipe/chevron) → `setCurrentPageIdx(idx ± 1)` → React re-renders `<PaginatedSurface>` with the new fragment → `BlockView` renders that fragment's blocks semantically → focus moves per D4-07 → "Page N of M" announce fires (debounced). The article element stays mounted; only the fragment children swap. Old page unmounts; new page mounts. No layout thrash — the page content-box geometry is fixed by CSS.

### Recommended Project Structure

```
src/
├── pagination/                 # NEW — project-owned pagination engine (Phase 4)
│   ├── types.ts                # PageFragment, SplitPoint, FragmentationResult Zod schemas
│   ├── fragment.ts             # paginate() pure function — the engine
│   ├── lineBoxes.ts            # Range.getClientRects → grapheme-offset mapping (DOM read-phase)
│   ├── splitBlock.ts           # per-kind fragmentation (exhaustive BlockKind switch, Pattern F)
│   ├── widowRules.ts           # D4-03 heading widow + D4-04 line widow/orphan
│   └── fragmentRenderer.tsx    # <PageFragmentView> — renders a fragment via BlockView slices
├── reader/
│   ├── PaginatedSurface.tsx    # NEW — mounts current fragment + page-turn controls + indicator
│   ├── ModeToggle.tsx          # NEW — header toggle button (D4-09)
│   ├── PageTurnControls.tsx    # NEW — keyboard bundle + chevrons + swipe (D4-05/06)
│   ├── PageIndicator.tsx       # NEW — "N of M" in hairline region (D4-08)
│   ├── PaginationFallbackBanner.tsx  # NEW — PAGE-09 .status banner
│   ├── ProgressHairline.tsx    # EXTEND — fill source switches N/M (paginated) vs ratio (scrolling)
│   ├── Header.tsx              # EXTEND — add ModeToggle inline-start of gear
│   ├── restoreLocation.ts      # REUSE — findScrollTarget (mode-switch anchor target)
│   └── useScrollSave.ts        # REUSE — computeOffset (mode-switch anchor source in scrolling)
├── content/
│   ├── schema.ts               # EDIT — ReaderSettingsSchema +readingMode, schemaVersion 1→2
│   ├── normalizeText.ts        # REUSE — D-05 grapheme substrate (graphemeClusters, BLOCK_SEPARATOR)
│   └── render/
│       └── BlockRenderer.tsx   # REUSE — BlockView (fragment renderer slices blocks, not forks)
├── settings/
│   ├── defaults.ts             # EDIT — +readingMode: "paginated"
│   └── SettingsContext.tsx     # REUSE — update() already live-applies; readingMode flows through
├── measurement/                # CONSUME — useMeasurement().trustedView; DiagnosticBus
│   ├── types.ts                # POSSIBLY EDIT — extend BlockMeasurement w/ split-point data (see §Patterns)
│   ├── useMeasurement.ts       # REUSE — returns trustedView (Phase 4 wires it in)
│   └── diagnostics.ts          # REUSE — subscribe()/recent() (PAGE-09 consumption seam)
├── persistence/
│   └── db.ts                   # NO CHANGE (value-shape evolution; settings store key-value)
└── routes/
    └── ArticleView.tsx         # EDIT — mode-aware render branch; reads useMeasurement return
```

### Pattern 1: Project-owned pagination engine as pure domain module

**What:** `paginate()` is a pure function `(article, measurement, articleEl, diagnostics) → FragmentationResult`. It lives in `src/pagination/`, NOT in a React component. Its contract is Zod-versioned (`PageFragment` schema). Mirrors the discipline of `MeasurementEngine` (exhaustive switches, Zod-at-boundary, structured diagnostics).

**When to use:** Always — this is the only pagination path. STACK.md forbids libraries.

**Why:** Deterministic inputs + observable failure/fallback results. Testable in isolation (feed a fixture `MeasurementResult` stub + a jsdom HTMLElement stub carrying `.getClientRects()`; assert the source ranges). The DOM read-phase (`lineBoxes.ts`) is the only impure seam; everything downstream is pure arithmetic over offsets.

**Example skeleton:**
```typescript
// src/pagination/types.ts — Zod-versioned contract
export const PageFragmentSchema = z.object({
  schemaVersion: z.literal(1),
  pageIndex: z.number().int().min(0),
  // source range over article.blocks indices + intra-block grapheme offsets (D-05)
  blocks: z.array(z.object({
    blockIndex: z.number().int().min(0),      // index into article.blocks
    startGrapheme: z.number().int().min(0),   // intra-block offset (0 = whole block start)
    endGrapheme: z.number().int().min(0),     // exclusive; == blockLength means whole block
  })),
});
export type PageFragment = z.infer<typeof PageFragmentSchema>;

export const FragmentationResultSchema = z.object({
  schemaVersion: z.literal(1),
  status: z.enum(["ok", "fallback"]),
  pages: z.array(PageFragmentSchema),
  reason: z.string().optional(),              // present when status === "fallback"
});
export type FragmentationResult = z.infer<typeof FragmentationResultSchema>;
```

### Pattern 2: DOM line-box → grapheme-offset mapping (the split-point primitive)

**What:** For each splitting-kind block, walk its text-node character offsets, build a `Range` per candidate boundary, read `Range.getClientRects()` to get the line boxes, and record the `(lineTopPx, charOffset)` pairs. Then map each char offset to a D-05 grapheme offset via `graphemeClusters(blockText, lang)`.

**When to use:** Every pagination pass for every splitting-kind block (paragraph, `<li>`, blockquote child). Atomic kinds skip this entirely (D4-02).

**Why not Pretext:** the calibration fingerprint proves paragraphs are NEVER Pretext-eligible `[VERIFIED: calibration/fingerprint.json]`. Pretext's `measureParagraphWithBreaks` returns `{text, width}[]` lines, but those predictions drift 4.9–39.6px from DOM truth for paragraphs. The browser's own line boxes are the only authoritative source. Headings are Pretext-eligible but atomic, so Pretext's line data is unused for splitting.

**Critical correctness constraint:** the per-block text used for offset math MUST be produced by the SAME rules as `normalizeText`/`normalizeElText` (collapse ASCII whitespace for prose; verbatim for code) `[VERIFIED: src/content/normalizeText.ts, src/reader/restoreLocation.ts]`. Reuse `normalizeElText(el)` from `restoreLocation.ts` — do NOT fork a parallel normalization. Any divergence shifts every split point and breaks the D-05 round-trip.

**Example (conceptual — the DOM read-phase):**
```typescript
// src/pagination/lineBoxes.ts — DOM read-phase; batched (Pitfall 2 read-phase isolation)
// Returns line boundaries as [charOffset, topPx, bottomPx][] for one block.
function readLineBoxes(el: HTMLElement, fullText: string): LineBox[] {
  const range = document.createRange();
  const textNode = el.firstChild as Text; // paragraph renders a single text node
  const boxes: LineBox[] = [];
  // Binary-search-free linear walk: extend the range one char at a time until
  // getClientRects() reports a new top — that's a line break boundary.
  // (Optimization: probe at word boundaries from Intl.Segmenter(word) first,
  // refine within the word that crosses. Phase 4 may start linear; budget is Phase 6.)
  let lastTop = -Infinity;
  for (let i = 0; i <= fullText.length; i++) {
    range.setStart(textNode, 0);
    range.setEnd(textNode, i);
    const rects = range.getClientRects();
    const lastRect = rects[rects.length - 1];
    if (lastRect && Math.round(lastRect.top) !== Math.round(lastTop)) {
      boxes.push({ charOffset: i, topPx: lastRect.top, bottomPx: lastRect.bottom });
      lastTop = lastRect.top;
    }
  }
  return boxes;
}
```
> The linear char-by-char walk is O(textLen) DOM reads per block — acceptable for MVP corpus (longest fixture is essay-long-form, ~minutes of text). Phase 6 budgets may require a word-boundary binary search; that optimization is out of scope here. The contract (`LineBox[]`) stays stable.

### Pattern 3: Splitting a paragraph semantically (preserve inline marks)

**What:** A `ParagraphBlock` has `content: InlineRun[]` where each run is `{text, marks: Mark[]}` (link/code/strong/em). Splitting at a grapheme offset requires: (a) find which run contains the offset, (b) split that run's text at the intra-run offset, (c) emit two paragraph fragments each carrying a slice of the runs with marks intact.

**When to use:** Whenever a page boundary falls inside a paragraph (the common booklike case — D4-01).

**Why:** D-04 locks the 4 inline marks. A split that drops a mark (e.g. cuts a link's anchor text away from its href) corrupts both rendering and the D-05 round-trip (the link's text still contributes to `normalizeText` regardless of split). The fragment renderer emits `<p>` with the run slice; React escapes text children (Pitfall 6 — no raw HTML).

**Example:**
```typescript
// src/pagination/splitBlock.ts — pure; operates on the Block model, not DOM
function splitParagraphRuns(
  runs: InlineRun[],
  splitAtGrapheme: number,   // grapheme offset WITHIN this block's normalized text
  lang: string,
): { before: InlineRun[]; after: InlineRun[] } {
  // Walk runs accumulating grapheme count (via graphemeClusters(run.text, lang)).
  // When the accumulated count crosses splitAtGrapheme, split that run's text
  // into two slices at the intra-run grapheme offset; both slices keep the
  // run's marks verbatim. Slices before → before[]; at-and-after → after[].
  // ... (pure; reuses graphemeClusters from src/content/normalizeText.ts)
}
```

### Pattern 4: Mode-switch + repagination anchor (ONE rule, TWO triggers)

**What:** Both D4-10 (mode switch) and D4-11 (repagination commit) use the SAME anchor: "the grapheme offset at the top of the current view stays at the top of the new view."

**When to use:** On every `readingMode` toggle and on every `trustedView` commit that changes the page fragment containing the current offset.

**How (the seam — REUSE existing helpers, do not fork):**
- **Scrolling → paginated:** `offset = useScrollSave.computeOffset()` (the topmost-visible-block starting offset — already implemented `[VERIFIED: src/reader/useScrollSave.ts:92-119]`). Then `currentPageIdx = fragmentContaining(pages, offset)`.
- **Paginated → scrolling:** `offset = pages[currentPageIdx].blocks[0].startGrapheme + blockStartOffset(blockIndex)` (the first block on the current page → its D-05 offset). Then `findScrollTarget(article, blocks, offset)?.scrollIntoView({block:"start"})` — the EXACT helper Phase 2 location-restore uses `[VERIFIED: src/reader/restoreLocation.ts:81]`.
- **Repagination commit:** capture `offset` BEFORE swapping pages; after `setPages(newPages)`, `setCurrentPageIdx(fragmentContaining(newPages, offset))`. The old page stays mounted until the new one is ready (Phase 3 `trustedView` retention — PAGE-06).

**Why one rule:** the reader's mental model is "I stay where I am," whether they toggled or the viewport changed. Consistency is the accessibility win.

### Pattern 5: Single content tree (A11Y-03)

**What:** Only the current page's DOM is in the tab/reading order. **Preferred: render one `<PageFragmentView>` at a time** (the engine produces one fragment; React swaps which fragment is mounted on turn). The article element stays mounted; only its children swap.

**When to use:** Always in paginated mode.

**Fallback (only if dual-mount unavoidable):** `aria-hidden="true"` + `inert` on non-current pages. `inert` is Baseline since April 2023 `[CITED: MDN inert]` and removes the subtree from tab order, focus, click, selection, find-in-page, AND the accessibility tree. But MDN warns "no visual way to tell inert content" — fine here because non-current pages are not rendered visually either way. The cleaner path (one page mounted) makes `inert` unnecessary; prefer it.

### Pattern 6: PAGE-04/PAGE-09 fallback (whole-article, at same passage)

**What:** When pagination cannot produce a valid result, the engine emits a `dom-fallback` (or `measurement-error`) diagnostic, the view flips `readingMode` to `"scrolling"` FOR THE SESSION (persisted preference NOT overwritten), and the reader lands at the same D-05 offset via the D4-10 anchor. The `.status` banner appears with the UI-SPEC §Copywriting text.

**When to use (the three thresholds — UI-SPEC §23):**
1. **Per-block oversize:** a single atomic block whose measured height > 75% of page content-box height → fallback. (75% leaves room for a heading + few lines of the next block, preserving spatial context.)
2. **Non-termination:** engine produces > 300 pages for one article revision → abort + fallback. (Planner validates against actual corpus page-count range; 300 is a generous ceiling.)
3. **Zero-progress stall:** N consecutive pages with zero new content → abort + fallback. (Defensive — guards a future bug from infinite empty pages.)

**Scope:** whole-article fallback (NOT per-block scrolling region inside paginated). Rationale: per-block scrolling breaks the dual-mode cleanliness (two navigation models in one view) and complicates the keyboard model. STACK.md's "usable scrolling fallback at the same passage" reads most naturally as "switch the whole article to scrolling at the same passage" — exactly what the mode-toggle does, just engine-triggered.

**Banner lifecycle:** non-modal, dismissible `.status` card (reuses Phase 2 banner geometry); auto-dismisses on first scroll/pointer activity (mirrors ResumeBanner) OR on **Switch to pages** / ×. Reappears if fallback re-triggers on a later repagination. Polite announce "Switched to scrolling reading." on appearance.

**Diagnostic mapping (UI-SPEC §23 table — locked):**
| DiagnosticEvent kind | Reader-visible? | Reasoning |
|----------------------|-----------------|-----------|
| `dom-fallback` | YES | Engine couldn't paginate; reader deserves to know why they fell back. |
| `measurement-error` | YES | Measurement failed during a pagination pass; reader deserves to know. |
| `drift-exceedance` | No | Internal health signal; engine falls back to DOM silently; pagination continues. |
| `late-epoch-drop` | No | Staleness contract working as intended; surfacing would alarm about a non-event. |
| `calibration-failure` | No | Startup calibration failed; DOM measurement continues. |
| `runtime-guard-downgrade` | No | Pretext disabled at runtime; DOM continues. |

> **The 6 kinds are the closed set (D3-05).** Phase 4 extends EMISSION, not the shape. No 7th kind. `[VERIFIED: src/measurement/types.ts:128-135]`

### Anti-Patterns to Avoid

- **Forking a parallel paginated renderer.** Reuse `BlockView` / `ArticleBody`. DOC-02 reading order + D-05 offset integrity depend on the same semantic output in both modes. The fragment renderer slices blocks and feeds slices to `BlockView`.
- **Using Pretext for paragraph split points.** The fingerprint proves paragraphs ineligible `[VERIFIED: calibration/fingerprint.json]`. Use DOM `Range.getClientRects()`.
- **Persisting page boundaries.** STACK.md forbids it. Page count/indices change with every viewport/typography/font/asset change; they are React state, never Dexie rows.
- **Page-number anchors.** Use D-05 grapheme offsets. Page numbers are informational (the "N of M" indicator), never identity.
- **Invisible click zones for page-turn.** D4-06 forbids them — they conflict with Phase 5 text selection and are undiscoverable for the accessibility-first reader.
- **Re-normalizing text in the pagination engine.** Reuse `normalizeElText` / `normalizeText` / `graphemeClusters` from `src/content/`. Any divergence shifts every split point and breaks the D-05 round-trip.
- **DOM emulators for pagination truth.** jsdom/happy-dom do not implement `Range.getClientRects()` layout. Pagination correctness tests MUST run in Playwright across Chromium/Firefox/WebKit `[CITED: research/STACK.md]`.
- **Editing Dexie `version(1)` or `version(2)` blocks.** Pitfall 9. The `readingMode` change is a value-shape evolution — append `version(3)` ONLY if an index changes (it does not).
- **Animation on page turn / mode swap / repagination commit.** A11Y-06 + the calm aesthetic. Zero `transition`/`animation` properties on new selectors. Instant swaps.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Text-coordinate mapping | Custom char→offset math | `graphemeClusters()` + `BLOCK_SEPARATOR` from `src/content/normalizeText.ts` | D-05 contract; any divergence corrupts every split + every saved location. `[VERIFIED: src/content/normalizeText.ts]` |
| Offset → DOM block resolution | Custom walker | `findScrollTarget(article, blocks, offset)` from `src/reader/restoreLocation.ts` | Already implements the D-05 accumulation + clamp fallback; reused by Phase 2 location restore. `[VERIFIED: src/reader/restoreLocation.ts:81]` |
| Top-of-view offset capture | Custom scroll math | `useScrollSave.computeOffset()` pattern (the topmost-visible-block starting offset) | The mode-switch anchor in scrolling mode IS this computation. `[VERIFIED: src/reader/useScrollSave.ts:92-119]` |
| Block rendering | Forked paginated JSX | `BlockView` from `src/content/render/BlockRenderer.tsx` | DOC-02 reading order + D-05 integrity + security (React escapes, no `dangerouslySetInnerHTML`). `[VERIFIED: src/content/render/BlockRenderer.tsx]` |
| Block selector | New selector string | `"h2, h3, h4, p, blockquote, li, pre, figure, sup, details"` (already at 3 sites) | Selector drift between measurement/restore/pagination would read different elements. `[VERIFIED: src/measurement/domMeasurer.ts:34, engine.ts:304, ArticleView.tsx:54]` |
| Staleness-safe pagination | New epoch/cancel logic | `useMeasurement()` `trustedView` (Phase 3) | PAGE-06/07 already implemented; Phase 4 consumes the trusted view. `[VERIFIED: src/measurement/useMeasurement.ts]` |
| Diagnostic pub-sub | New event bus | `DiagnosticBus.subscribe()` / `.recent()` | D3-05 shape locked; PAGE-09 consumes the existing seam. `[VERIFIED: src/measurement/diagnostics.ts]` |
| Settings persistence | New Dexie store | `SettingsContext` `update()` (debounced save) | `readingMode` flows the same path as every other preference. `[VERIFIED: src/settings/SettingsContext.tsx]` |
| Focus trap / modal / Esc | Custom | Native `<dialog>`/showModal (Phase 2 pattern) | The fallback banner is NON-modal (no trap needed); only reuse `<dialog>` discipline if a new modal appears. |
| Date/number formatting | Hand-rolled strings | `Intl.NumberFormat` (for "N of M"), `Intl.DateTimeFormat` | UI-SPEC §Copywriting. |

**Key insight:** Phase 4's novelty is **narrow** — the pagination engine's fragmentation logic + the line-box→offset mapping. Everything else (state, persistence, diagnostics, anchor resolution, block rendering, staleness) is a reuse of prior-phase seams. The planner should maximize reuse and minimize new surface area; the risk lives in `src/pagination/`.

## Runtime State Inventory

> Phase 4 is a **new feature phase** (paginated mode), not a rename/refactor/migration. The Runtime State Inventory is included for completeness because it touches the persisted settings shape (`readingMode` addition) — but the scope is minimal.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `settings` Dexie store: existing v1 records under key `"reader-prefs"` carry `schemaVersion: 1` with NO `readingMode` field. | **None (default-on-read).** The Zod schema adds `readingMode: z.enum(...).default("paginated")`; existing records parse with the default. No data migration. (See §Common Pitfalls 9.) `[VERIFIED: src/persistence/db.ts — settings store is key-value; value opaque to Dexie]` |
| Live service config | None — no external services. | None. |
| OS-registered state | None — pure client app. | None. |
| Secrets/env vars | None. | None. |
| Build artifacts | None — `readingMode` is a value-shape change; no build artifact carries it. | None. |

**Canonical question — "After every file is updated, what runtime systems still have the old string?"** The only persisted state is the Dexie `settings` row. Existing v1 rows lack `readingMode`; Zod `.default("paginated")` hydrates them on read. New saves write `schemaVersion: 2`. There is no "old string" to chase — the field is additive.

## Common Pitfalls

### Pitfall 1: Pretext drift on paragraph split points
**What goes wrong:** The engine uses `measureParagraphWithBreaks()` to predict line-break positions for paragraph splitting, then trusts those offsets to place page boundaries.
**Why it happens:** Pretext returns `lines: {text, width}[]` which LOOKS like the data the pagination engine needs. The CONTEXT Discretion even listed it as an option ("Pretext line-break positions for eligible kinds").
**How to avoid:** The calibration fingerprint proves `paragraph.eligible === false` in every one of 2592 sampled cells (heightDriftP95 4.9–39.6px, breaksMatchRatio 0–1.0). **Pretext is structurally ineligible for paragraphs in this corpus.** Use DOM `Range.getClientRects()` for ALL splitting-kind line-box measurement. Pretext's `measureParagraphWithBreaks` is only called by the Phase 3 drift guard for sampling — never for committed split points. `[VERIFIED: calibration/fingerprint.json]`
**Warning signs:** A pagination test passes in Chromium but the same article paginates to a different page count in Firefox/WebKit. Or: page bottoms have large unexpected whitespace (Pretext predicted fewer lines than the browser rendered).

### Pitfall 2: Layout thrash during the line-box read-phase
**What goes wrong:** The pagination engine interleaves DOM reads (`getClientRects`) with React state writes (setCurrentPageIdx), forcing the browser into a synchronous layout reflow per block.
**Why it happens:** `getClientRects()` invalidates layout caches if a write happened since the last layout.
**How to avoid:** BATCH every `Range.getClientRects()` read for all blocks in one pass BEFORE any React state update. The `paginate()` function returns a `FragmentationResult`; the caller (`useEffect`) then commits it via `setPages`. Mirrors Phase 3's `measureAllBlocks` read-phase isolation `[VERIFIED: src/measurement/domMeasurer.ts:83-104]`.
**Warning signs:** Repagination takes >100ms on the essay-long-form fixture; DevTools Performance shows "Recalculate Style" / "Layout" storms.

### Pitfall 3: Normalization drift between split-point math and D-05
**What goes wrong:** The pagination engine computes grapheme offsets using a slightly different text normalization than `normalizeText(article)`, so a split at "offset 500" lands at a different passage than a saved location at "offset 500."
**Why it happens:** Tempting to use `el.textContent` directly. But `normalizeText` collapses ASCII whitespace, keeps code-block source verbatim, and emits footnote markers as visible text.
**How to avoid:** Reuse `normalizeElText(el)` from `src/reader/restoreLocation.ts` (it already mirrors the per-block rules) AND `graphemeClusters(text, lang)` from `src/content/normalizeText.ts`. Do NOT fork. The block selector must be the exact `"h2, h3, h4, p, blockquote, li, pre, figure, sup, details"` string. `[VERIFIED: src/reader/restoreLocation.ts:50-62]`
**Warning signs:** A saved location in scrolling mode lands on a different block after a mode-switch round-trip.

### Pitfall 4: Breaking inline marks across a paragraph split
**What goes wrong:** Splitting a paragraph drops a `link` mark (or duplicates it), so the rendered fragment shows plain text where there should be a hyperlink, or two halves of a link point to different hrefs.
**Why it happens:** The split logic operates on raw text without accounting for `InlineRun[].marks`.
**How to avoid:** `splitParagraphRuns()` walks runs accumulating grapheme count, splits the boundary run's text into two slices, and BOTH slices inherit the run's marks verbatim. A link run split mid-text becomes two link runs with the same href. `[VERIFIED: src/content/schema.ts — Mark union is link/code/strong/em]`
**Warning signs:** Link density on a paginated page differs from the scrolling view of the same passage.

### Pitfall 5: Page geometry depends on a stale viewport measurement
**What goes wrong:** The page height (`calc(100vh - 48px - 2px - 2 * var(--space-2xl))`) is computed once, then the reader resizes the window, and pages overflow or underflow.
**Why it happens:** Hardcoding `100vh` in JS instead of CSS, or computing page count from a cached viewport height.
**How to avoid:** The page content-box geometry lives in **CSS** (`width: var(--measure)`, `height: calc(...)`) on `.paginated-surface`. The engine reads the ACTUAL rendered content-box height from `articleEl.getBoundingClientRect()` on every pass. The Phase 3 `ResizeObserver` trigger fires on viewport change → coalescer → engine re-runs → new `trustedView` → re-paginate. PAGE-05/SC4 anchor (D4-11) keeps the reader at the same offset. `[VERIFIED: src/measurement/triggers.ts (coalescer), UI-SPEC §Layout page geometry]`
**Warning signs:** Resizing the window leaves the old page count; or the last page's content overflows past the bottom margin.

### Pitfall 6: Non-terminating pagination on adversarial content
**What goes wrong:** A pathological block (or a fragmentation bug) produces pages with zero new content, looping forever.
**Why it happens:** A splitting-kind block whose FIRST line is taller than the page (e.g. an enormous font step on a viewport-short device) can't fit even one line — the engine moves it to the next page unchanged, forever.
**How to avoid:** UI-SPEC §23's three termination guards: (1) per-block oversize > 75% of page → fallback; (2) > 300 pages → abort + fallback; (3) N consecutive zero-content pages → abort + fallback. The engine MUST check all three every pass. The 300 ceiling is generous (longest fixture is essay-long-form); the planner may tighten against the actual corpus peak.
**Warning signs:** A pagination test hangs; CPU spikes on opening an article.

### Pitfall 7: Mode-switch loses the passage (anchor computed at wrong time)
**What goes wrong:** The reader toggles mode; the anchor offset is captured AFTER the render swap, so it points at the top of the new view instead of the old.
**Why it happens:** React state updates are async; reading `window.scrollY` or `currentPageIdx` after `setReadingMode` reads the new state.
**How to avoid:** Capture the anchor offset synchronously in the toggle handler BEFORE calling `setReadingMode`. For scrolling→paginated: `offset = computeOffset()` then `setReadingMode("paginated")` then on next commit `setCurrentPageIdx(fragmentContaining(pages, offset))`. For paginated→scrolling: `offset = pages[currentPageIdx].firstBlockOffset` then `setReadingMode("scrolling")` then in the scroll-mode effect `findScrollTarget(...)?.scrollIntoView()`. `[VERIFIED: src/reader/useScrollSave.ts:92 (computeOffset), src/reader/restoreLocation.ts:81 (findScrollTarget)]`
**Warning signs:** Toggling mode jumps to the top of the article.

### Pitfall 8: Reading order inversion with `inert` fallback
**What goes wrong:** If the planner chooses the dual-mount `inert` fallback (instead of the preferred one-page-at-a-time), screen readers may still encounter the inert pages' headings during a "headings list" navigation in some older engine versions, or find-in-page matches invisible content.
**Why it happens:** `inert` support is Baseline since April 2023 but edge cases in heading-list navigation existed in older WebKit.
**How to avoid:** PREFER rendering one page at a time (the engine produces one fragment; React swaps the mounted fragment). The `inert`+`aria-hidden` path is the documented fallback ONLY if dual-mount is unavoidable. If used, test heading-list navigation in Playwright across all 3 engines. `[CITED: MDN inert]`
**Warning signs:** A11Y-03 test (single content tree) fails; VO/NVDA "list headings" announces headings from non-current pages.

### Pitfall 9: Dexie schema bump for a value-shape change (Pitfall 9 inherits)
**What goes wrong:** The planner adds `db.version(3).stores({...})` to "evolve the schema" for `readingMode`, unnecessarily touching the upgrade chain.
**Why it happens:** Confusion between Dexie STORE/index changes (require version bump) and VALUE-shape changes (opaque to Dexie — the `settings` store holds `value: unknown` validated by Zod on read).
**How to avoid:** The `settings` store is `key-value` with `value: unknown` `[VERIFIED: src/persistence/db.ts:15-18, 40]`. Adding `readingMode` to the Zod schema is a PURE value-shape evolution. NO Dexie version bump. NO new `db.version(3)` block. The `schemaVersion: 1 → 2` bump is INSIDE the Zod object (the STATE-04 migration hook), not in Dexie. Existing v1 records hydrate `readingMode: "paginated"` via Zod `.default()`. `[VERIFIED: src/content/schema.ts:209-227]`
**Warning signs:** A new `db.version(3)` block appears in `db.ts`; or existing readers' saved settings are wiped on first load of the new build.

### Pitfall 10: Swipe hijacks pinch-zoom (A11Y-04 regression)
**What goes wrong:** The horizontal-swipe page-turn handler calls `preventDefault()` on multi-touch sequences, breaking native pinch-zoom and reflow.
**Why it happens:** Naive `touchstart`/`touchmove` handlers that don't disambiguate single-touch swipe from multi-touch pinch.
**How to avoid:** UI-SPEC §18 contract: bail the moment `event.touches.length > 1` (multi-touch = browser-owned pinch-zoom). Bail if vertical delta > horizontal delta (vertical scroll = browser-owned). Single-touch horizontal swipe (delta ratio ≥ 1.5×, horizontal delta ≥ ~40px) = page turn. `touch-action: pan-y pinch-zoom` on the page content-box declares the intent. NEVER `preventDefault()` on multi-touch.
**Warning signs:** On a touch device, pinch-zoom doesn't work inside an article; or A11Y-04 reflow test fails at 200% zoom.

## Code Examples

Verified patterns from the codebase and official sources.

### Existing: the trusted-view seam (Phase 4 wires this in)
```typescript
// src/measurement/useMeasurement.ts — Phase 4 now READS the return value
export function useMeasurement(
  article: CanonicalArticle | null,
  articleElRef: RefObject<HTMLElement | null>,
): MeasurementResult | null { /* ... */ }

// ArticleView (Phase 3 ignored the return; Phase 4 uses it):
const trustedView = useMeasurement(article, articleRef);
// paginated mode derives pages from trustedView via paginate()
```
`[VERIFIED: src/measurement/useMeasurement.ts:58-61, src/routes/ArticleView.tsx:103]`

### Existing: the offset↔DOM block helpers (REUSE for the anchor)
```typescript
// src/reader/restoreLocation.ts — grapheme offset → DOM block (both directions)
export function findScrollTarget(
  article: CanonicalArticle, blocks: HTMLElement[], offset: number,
): HTMLElement | null { /* walks blocks accumulating grapheme contributions */ }

// src/reader/useScrollSave.ts — top-of-view → grapheme offset (scrolling mode anchor source)
function computeOffset(): number { /* walks blocks, returns topmost-visible-block start offset */ }
```
`[VERIFIED: src/reader/restoreLocation.ts:81, src/reader/useScrollSave.ts:92]`

### Existing: the diagnostic bus (PAGE-09 consumption seam)
```typescript
// src/measurement/diagnostics.ts — Phase 4's banner subscribes here
const unsub = diagnostics.subscribe((event) => {
  if (event.kind === "dom-fallback" || event.kind === "measurement-error") {
    setShowFallbackBanner(true);
  }
});
const recent = diagnostics.recent(); // snapshot for initial banner state
```
`[VERIFIED: src/measurement/diagnostics.ts:58, 69]`

### Existing: the exhaustive BlockKind switch (Pattern F — fragmentation reuses it)
```typescript
// src/measurement/engine.ts:343 — chooseStrategy. The pagination engine's
// per-kind fragmentation policy uses the SAME exhaustive-switch discipline.
export function chooseStrategy(kind: BlockKind, eligibility: EligibilityState) {
  switch (kind) {
    case "heading": return eligibility.heading.pretextEligible ? "pretext" : "dom";
    case "paragraph": return eligibility.paragraph.pretextEligible ? "pretext" : "dom";
    case "blockquote": return "dom";
    // ... every case handled; NO default — TS flags missing cases
  }
}
```
`[VERIFIED: src/measurement/engine.ts:343-366]`

### Authoritative: DOM line-box mapping (MDN)
```typescript
// Source: developer.mozilla.org/en-US/docs/Web/API/Range/getClientRects
// Range.getClientRects() returns one DOMRect per line box in the range.
// Baseline widely available since July 2015 (all evergreen engines).
const range = document.createRange();
range.selectNodeContents(el);
const rects = range.getClientRects(); // DOMRect[] — one per line
```
`[CITED: developer.mozilla.org/en-US/docs/Web/API/Range/getClientRects]`

### Authoritative: inert attribute (Baseline since April 2023)
```html
<!-- Source: developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inert -->
<!-- Removes element + flat-tree descendants from tab order, focus, click,
     selection, find-in-page, AND accessibility tree. -->
<section inert aria-hidden="true">...</section>
```
`[CITED: developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inert]`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `offsetHeight` / `scrollHeight` (integer px) for measurement | `getBoundingClientRect().height` (fractional px) | Phase 3 (03-RESEARCH §State of the Art) | Sub-pixel drift no longer hidden; calibration reproducible. Phase 4 inherits. |
| Pretext as a candidate paragraph fast-path | Pretext INELIGIBLE for paragraphs (calibration proven) | Phase 3 calibration (2026-08-05) | Phase 4 MUST use DOM `Range.getClientRects()` for all split-point measurement. |
| `inert` requiring polyfill | `inert` Baseline widely available | April 2023 (all evergreen engines) | The single-content-tree fallback is safe without polyfill — but one-page-at-a-time rendering is still preferred. `[CITED: MDN inert]` |
| `scroll-behavior: smooth` for restore | Instant restore (no smooth anywhere) | Phase 2 (02-RESEARCH anti-pattern) | Phase 4 mode-swap + repagination are instant (A11Y-06). |

**Deprecated/outdated:**
- **CSS `columns` as pagination engine**: browser fragmentation owns boundaries; not the project's path `[CITED: research/STACK.md]`.
- **Paged.js / Vivliostyle**: print/PDF-oriented; lack interactive responsive repagination `[CITED: research/STACK.md]`.
- **Page-number annotation anchors**: PAGE-06/07 + D-05 made grapheme offsets canonical in Phase 1.

## Assumptions Log

> Claims tagged `[ASSUMED]` in this research. The planner/discuss-phase uses this to identify decisions needing user confirmation.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The linear char-by-char `Range.getClientRects()` walk is fast enough for the MVP corpus (longest fixture essay-long-form, minutes of text). | Architecture Patterns §Pattern 2 | If a fixture is much longer than expected, repagination may exceed the Phase 6 "feel responsive" bar before budgets are formal. Mitigation: word-boundary binary search optimization is a known follow-up; the `LineBox[]` contract stays stable so it's a non-breaking change. |
| A2 | The 75% per-block-oversize threshold and 300-page non-termination ceiling (UI-SPEC §23) are correct for the 6-fixture corpus. | Architecture Patterns §Pattern 6 | If a legitimate fixture paginates to >300 pages at some viewport/typography combo, the engine would falsely fall back. Mitigation: the planner validates the actual corpus page-count range at the representative matrix and tightens the ceiling; this is an empirical call the UI-SPEC explicitly delegated. |
| A3 | `Range.getClientRects()` returns one DOMRect per CSS line box for a paragraph's single text node across Chromium/Firefox/WebKit. | Standard Stack, Code Examples | Verified via MDN (Baseline since 2015). Residual risk: an engine quirk on a paragraph with nested inline marks (e.g. a `<strong>` mid-line) where the range spans multiple text nodes. Mitigation: the line-box reader walks the block's text-node children in order; Playwright cross-engine tests (§Validation Architecture) catch any quirk. |
| A4 | The settings Dexie store's value-shape evolution needs NO `db.version(3)` block. | Common Pitfalls 9 | If Dexie's upgrade chain somehow requires a version bump for a value-shape change (it does not — the store declaration is `"key"` only and `value: unknown`), existing readers' settings would fail to hydrate. Mitigation: verified against `src/persistence/db.ts:40` (`settings!: Table<SettingsRecord, string>` with `value: unknown`); the existing Phase 2 evolution already proved value-shape changes are no-ops at the Dexie layer. |

**Note:** Every other claim in this research is `[VERIFIED]` (confirmed via tool against the codebase, the calibration fingerprint, package.json, or `npm view`) or `[CITED]` (referenced from MDN official documentation). The fingerprint-driven conclusion that Pretext is ineligible for paragraphs is `[VERIFIED: calibration/fingerprint.json]` — the single highest-leverage finding in this document.

## Open Questions (RESOLVED)

> All four open questions below are settled. Each `Recommendation:` line is the resolution the planner followed. The architecture decisions they informed are reflected in `04-CONTEXT.md` (locked decisions D4-*) and the PLAN.md files.

1. **Exact `LineBox[]` read strategy — linear vs. word-boundary binary search.**
   - What we know: the linear char-by-char walk is O(textLen) DOM reads per block; correct; matches MDN's described behavior.
   - What's unclear: whether it meets the Phase 6 "feel responsive" bar on the longest fixture at the largest font/spacing. Phase 4 has no formal budget (that's Phase 6 / ACPT-04).
   - RESOLVED Recommendation: ship linear for Phase 4 (correctness first); the `LineBox[]` contract is stable so a word-boundary binary search is a non-breaking Phase 6 optimization if budgets demand it. Add a DEV-only timing probe.

2. **The `MeasurementResult` extension shape — extend `BlockMeasurement` vs. add a parallel `SplitPointData[]`.**
   - What we know: Phase 3's `BlockMeasurement` is `{kind, heightPx, lineCount}` with `schemaVersion: 1` and a locked Zod schema. Adding optional fields risks breaking Phase 3's parse.
   - What's unclear: whether the planner prefers additive optional fields (safe under Zod) or a parallel structure keyed by blockIndex.
   - RESOLVED Recommendation: additive optional fields on `BlockMeasurement` (e.g. `lineBoxes?: LineBox[]`) gated behind a `MeasurementResult.schemaVersion` bump to 2, OR a parallel `pagination` module that reads line boxes independently of `MeasurementResult`. The latter keeps Phase 3's contract byte-unchanged (cleaner separation). Planner's architecture call — both work.

3. **Zero-progress stall threshold N (UI-SPEC §23 names it "N" without a number).**
   - What we know: the engine must abort on consecutive zero-content pages.
   - What's unclear: N=1 (abort on the first empty page) vs. N=2–3 (tolerate a transient).
   - RESOLVED Recommendation: N=1 is the safe choice — a single zero-content page is already a bug per D4-01/D4-02; there is no legitimate reason for an empty page. The 300-page ceiling is the backstop if N=1 somehow misfires.

4. **Fallback banner re-trigger semantics under rapid repagination.**
   - What we know: UI-SPEC §23 says the banner reappears if fallback re-triggers after dismissal.
   - What's unclear: if the reader enlarges the font rapidly (3 steps in 400ms), the banner could flash on/off.
   - RESOLVED Recommendation: the banner appearance is gated by the SAME Phase 3 coalescer/debounce that gates repagination — a rapid font-change burst produces ONE committed pagination result, hence at most ONE banner transition. No extra debouncing needed.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (20.19+ or 22.12+) | Vite 8 dev/build | ✓ | (LTS — Vite 8 requirement) | — |
| Playwright browsers (Chromium/Firefox/WebKit) | Pagination correctness tests (PAGE-03) | ✓ (Phase 1+ harness) | `@playwright/test` 1.61.1 | — |
| `document.fonts.ready` | Font gate before pagination commit | ✓ (all evergreen) | Browser API | — |
| `Range.getClientRects()` | Line-box → split-point mapping | ✓ (Baseline since July 2015) | Browser API | — |
| `Intl.Segmenter` (grapheme) | D-05 offset math | ✓ (already used Phase 1) | Browser API | — |
| `inert` attribute | Single-content-tree fallback (if needed) | ✓ (Baseline since April 2023) | Browser API | Render one page at a time (preferred — no `inert` needed) |
| `ResizeObserver` | Viewport/typography change trigger | ✓ (already used Phase 3) | Browser API | — |
| IndexedDB | `readingMode` persistence | ✓ (already used Phase 2) | Browser API | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none — all required primitives are Baseline-widely-available browser APIs already exercised by prior phases.

**Step 2.6: Environment Availability Audit complete** — every dependency is a verified-present browser primitive or an already-installed npm package. No installation steps; no blocking gaps.

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json`. This section is REQUIRED. Pagination correctness (PAGE-03) is the highest-risk requirement in the prototype — its invariants MUST be validated in real browsers across the corpus × viewport × typography matrix, never in a DOM emulator.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (unit/property) + Playwright 1.61.1 (real-browser layout truth) |
| Config file | `vitest.config.*` (unit) + `playwright.config.ts` (e2e — 3 projects: chromium/firefox/webkit) |
| Quick run command | `npm run test:unit -- --run` (unit, <30s) |
| Full suite command | `npm run test` (unit + `npm run test:e2e` Playwright 3-engine) |

> **Critical (STACK.md):** jsdom/happy-dom do NOT implement authoritative layout or `Range.getClientRects()` line-box geometry. **Unit tests cover pure logic (offset math, fragmentation policy, widow rules, anchor round-trips); Playwright covers layout truth (page count, exactly-once coverage, no-overflow, focus restoration).** Mixing these is the #1 pagination-test anti-pattern.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PAGE-01 | Mode switch preserves passage (paginated↔scrolling round-trip) | e2e (real browser) | `playwright test tests/e2e/pagination/mode-switch-anchor.spec.ts -x` | ❌ Wave 0 |
| PAGE-02 | Keyboard bundle + chevrons + swipe turn pages; focus predictable | e2e + unit | `playwright test tests/e2e/pagination/page-turn-controls.spec.ts -x` | ❌ Wave 0 |
| PAGE-03a | Every content unit appears exactly once (no omission/duplication) | e2e (corpus matrix) | `playwright test tests/e2e/pagination/coverage-invariant.spec.ts -x` | ❌ Wave 0 |
| PAGE-03b | No clipping (page content never overflows the content-box) | e2e (corpus matrix) | `playwright test tests/e2e/pagination/no-overflow-invariant.spec.ts -x` | ❌ Wave 0 |
| PAGE-03c | Termination within budget (< 300 pages; no infinite loop) | e2e + unit | `playwright test tests/e2e/pagination/termination.spec.ts -x` | ❌ Wave 0 |
| PAGE-03d | Canonical order preserved (D-05 source-offset round-trip) | unit | `vitest tests/unit/pagination/fragmentOrder.test.ts` | ❌ Wave 0 |
| PAGE-04 | Oversized/unsupported → scrolling fallback at same passage | e2e | `playwright test tests/e2e/pagination/fallback-oversize.spec.ts -x` | ❌ Wave 0 |
| PAGE-05 | Reader anchored through viewport/typography/font/asset change | e2e (reuses stale-drop harness pattern) | `playwright test tests/e2e/pagination/repagination-anchor.spec.ts -x` | ❌ Wave 0 |
| PAGE-09 | Fallback records diagnostic + shows understandable banner | e2e + unit | `playwright test tests/e2e/pagination/fallback-banner.spec.ts -x` | ❌ Wave 0 |
| (cross) | Widow/orphan rules (D4-03/D4-04) applied | unit | `vitest tests/unit/pagination/widowRules.test.ts` | ❌ Wave 0 |
| (cross) | Split-point offset ↔ grapheme round-trip | unit | `vitest tests/unit/pagination/lineBoxMapping.test.ts` | ❌ Wave 0 |
| (cross) | readingMode schema evolution (default-on-read for v1 records) | unit | `vitest tests/unit/settingsSchema.test.ts` (extend) | ✅ exists (extend) |

### Observable Invariants (the PAGE-03 contract — what "correct" means)

These are the properties the Playwright corpus matrix MUST assert on every (fixture × viewport × typography) cell:

1. **Exactly-once coverage:** concatenate every page fragment's source ranges; the union MUST equal `[0, graphemeLength(article))` with no gaps and no overlaps. Assert via D-05 grapheme math over the rendered text.
2. **No clipping:** no page's rendered content overflows its content-box (`articleEl.scrollHeight <= contentBoxHeight + tolerance` per page). The page is `overflow: hidden`; any overflow is a fragmentation bug.
3. **No duplication:** the same D-05 offset range appears on exactly one page. (Cross-check: total rendered text length across all pages == `graphemeLength(article)`.)
4. **Canonical order:** for any two pages i < j, every offset on page i < every offset on page j. (Walk pages in order; offsets strictly monotonic.)
5. **Termination:** pagination produces a finite `pages[]` with `pages.length <= 300`; the engine returns within a bounded wall-clock (defensive against infinite loops).
6. **D-05 round-trip:** a saved offset in scrolling mode, after mode-switch to paginated, lands on the page containing that offset; switching back to scrolling re-lands on the same block (via `findScrollTarget`).
7. **Focus restoration (D4-07):** after a turn triggered from content, focus lands on the new page's first heading/focusable; after a turn from a control, focus stays on the control.
8. **Fallback-on-oversized (PAGE-04):** an atomic block > 75% of page height triggers `dom-fallback` diagnostic + whole-article scrolling at the same offset.

### Sampling Rate

- **Per task commit:** `npm run test:unit -- --run` (unit — fragmentation policy, offset math, widow rules, schema). Fast feedback on pure logic.
- **Per wave merge:** `npm run test:e2e -- --grep pagination` (Playwright pagination subset, 3 engines). Catches layout-truth regressions before the phase gate.
- **Phase gate (before `/gsd-verify-work`):** full Playwright corpus matrix — 6 fixtures × (viewport: 360px / 768px / 1024px+) × (typography: serif-18-comfortable-64 default + sans-22-spacious-72 stress + dyslexic-16-compact-52 stress) × 3 engines. This is the PAGE-03 acceptance surface. The Phase 3 calibration harness (`tests/e2e/calibration/fixtures-matrix.ts`) is the template for the matrix enumeration.

### Wave 0 Gaps

- [ ] `tests/e2e/pagination/` directory + the 8 e2e specs above — covers PAGE-01/02/03/04/05/09 in real browsers
- [ ] `tests/unit/pagination/` directory + the 4 unit specs above — covers pure fragmentation/offset/widow logic
- [ ] `tests/e2e/pagination/fixtures-matrix.ts` — corpus × viewport × typography enumeration (mirror Phase 3's `tests/e2e/calibration/fixtures-matrix.ts`)
- [ ] Extend `tests/unit/settingsSchema.test.ts` — `readingMode` field + default-on-read for v1 records
- [ ] Framework install: none needed (`vitest` + `@playwright/test` already present)

*(If no gaps: "None — existing test infrastructure covers all phase requirements" — NOT the case here; pagination is new surface and needs its own harness.)*

## Security Domain

> `security_enforcement: true` in `.planning/config.json` (ASVS Level 1). Phase 4 introduces new reader-facing UI surfaces (mode toggle, page-turn controls, fallback banner, keyboard handlers, swipe handlers) and extends a persisted schema. The domain is low-risk (no auth, no network, no secrets, local-only) but the new surfaces have specific security considerations.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth in this prototype (local-only). |
| V3 Session Management | no | No sessions. |
| V4 Access Control | no | No privileged operations; all reader-facing. |
| V5 Input Validation | **yes** | `readingMode` is a Zod-validated enum at the schema boundary; the `PageFragment` contract is Zod-versioned. `DiagnosticBus.emit()` already re-parses at the boundary (D3-05/V5). The fallback banner copy is static (no reader input reflected). `[VERIFIED: src/measurement/diagnostics.ts:43]` |
| V6 Cryptography | no | No crypto. |
| V7 Error Handling | **yes** | Pagination failures become `dom-fallback`/`measurement-error` diagnostics → reader-visible banner, NEVER a throw to the reader (inherits Phase 3 V7 discipline). The engine's `paginate()` returns a `FragmentationResult` with `status: "fallback"`; it does not throw on oversize/non-termination. |
| V8 Data Protection | **yes (minimal)** | `readingMode` is a non-sensitive preference (not PII). Persisted via the existing debounced Dexie save. No new sensitive data. |
| V12 Files & Resources | **yes (minimal)** | No new dependencies (no supply-chain risk). The `@chenglou/pretext` postinstall is empty (re-verified). Page fragments render via `BlockView` which emits only JSX/text children — no `dangerouslySetInnerHTML` (ESLint `react/no-danger` enforced). |

### Known Threat Patterns for the Phase 4 stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via pagination banner copy | Tampering | Banner copy is static UI-SPEC text; no reader input is reflected. `DiagnosticEvent` fields (kind, message) are NEVER rendered raw — the banner maps `dom-fallback`/`measurement-error` to fixed copy. `[VERIFIED: UI-SPEC §Copywriting + §Interaction 23]` |
| XSS via page-fragment rendering | Tampering | Reuse `BlockView` — React escapes text/attribute children; `react/no-danger` ESLint rule forbids raw-HTML injection. The fragment renderer slices the SAME `Block` model the scrolling view renders (no new injection surface). `[VERIFIED: src/content/render/BlockRenderer.tsx header comment]` |
| DOM clobbering via fragment ids | Tampering | Footnote ids are schema-locked to `/^fn-\d+$/` (Phase 1, Pitfall 4). Pagination reuses the same id scheme; no new id generation. `[VERIFIED: src/content/schema.ts:112]` |
| Keylogger via global keyboard handler | Information Disclosure | The page-turn keyboard handler reads only `event.key` / `event.code` and calls `preventDefault()` on handled keys; it does NOT read form-field input (bails on `event.target` in input/dialog). It registers on `window` only while an article is mounted in paginated mode; removed on unmount/mode-switch. `[VERIFIED: UI-SPEC §Interaction 16]` |
| Swipe handler hijacking touch data | Tampering | The swipe handler reads only `touchstart`/`touchend` coordinates and `touches.length`; it bails on multi-touch (pinch-zoom stays native) and never transmits touch data anywhere (local-only). |
| Denial of service via non-terminating pagination | Denial of Service | UI-SPEC §23 three termination guards (75% oversize, 300-page ceiling, N zero-progress). Engine returns within bounded wall-clock. `[VERIFIED: UI-SPEC §23]` |
| Schema-confusion attack on `readingMode` | Tampering | Zod enum rejects any value outside `"paginated" | "scrolling"` at the read boundary. A tampered IndexedDB row with `readingMode: "evil"` fails parse → STATE-05 routing (StorageBanner/WipeConfirm), never reaches the renderer. `[VERIFIED: src/content/schema.ts — Zod-at-boundary discipline]` |

## Sources

### Primary (HIGH confidence)
- `calibration/fingerprint.json` — Phase 3 calibration result proving paragraphs Pretext-ineligible (2592 cells, heightDriftP95 4.9–39.6px, breaksMatchRatio 0–1.0); headings eligible (drift ~0.01px, breaksMatchRatio 1.0). `[VERIFIED via Read]`
- `src/measurement/types.ts` — `MeasurementResult`, `BlockMeasurement` (`{kind, heightPx, lineCount}`), `DiagnosticEvent` 6-kind union. `[VERIFIED via Read]`
- `src/measurement/useMeasurement.ts` — `trustedView` seam; Phase 4 reads the return. `[VERIFIED via Read]`
- `src/measurement/engine.ts` — `chooseStrategy` exhaustive switch; `BlockKind` union; Pretext sampling. `[VERIFIED via Read]`
- `src/measurement/domMeasurer.ts` — `getBoundingClientRect().height` + `getClientRects().length`; the block selector reused 3×. `[VERIFIED via Read]`
- `src/measurement/textMeasurer.ts` — `measureParagraphWithBreaks` (Phase 4 does NOT use for split points); `fontStringFor` heading geometry. `[VERIFIED via Read]`
- `src/measurement/diagnostics.ts` — `DiagnosticBus.subscribe()` / `.recent()` PAGE-09 seam. `[VERIFIED via Read]`
- `src/content/normalizeText.ts` — D-05 grapheme substrate; `graphemeClusters()`, `BLOCK_SEPARATOR`. `[VERIFIED via Read]`
- `src/content/schema.ts` — `ReaderSettingsSchema` (L209, no `readingMode`), `Block` union, `LocationRecordSchema`. `[VERIFIED via Read]`
- `src/content/render/BlockRenderer.tsx` — `BlockView` exhaustive switch; the renderer to reuse. `[VERIFIED via Read]`
- `src/reader/restoreLocation.ts` — `findScrollTarget()` (offset→DOM block, both directions); `normalizeElText()`. `[VERIFIED via Read]`
- `src/reader/useScrollSave.ts` — `computeOffset()` (top-of-view→offset, scrolling anchor source). `[VERIFIED via Read]`
- `src/settings/SettingsContext.tsx` — `update()` live-apply; the `readingMode` flow path. `[VERIFIED via Read]`
- `src/persistence/db.ts` — `settings` store key-value with `value: unknown` (value-shape evolution safe). `[VERIFIED via Read]`
- `src/routes/ArticleView.tsx` — mode-aware render branch point; `useMeasurement` currently ignored. `[VERIFIED via Read]`
- `package.json` — all consumed package versions confirmed. `[VERIFIED via Read]`
- `npm view` confirmations: dexie 4.4.4, @chenglou/pretext 0.0.8 (postinstall empty), zod 4.4.3, react 19.2.8, @playwright/test 1.61.1. `[VERIFIED via npm registry]`
- `tests/e2e/measurement/stale-drop.spec.ts` + `last-valid-view.spec.ts` — Playwright harness templates for pagination tests. `[VERIFIED via Read]`

### Secondary (MEDIUM confidence — official docs)
- [MDN: Range.getClientRects()](https://developer.mozilla.org/en-US/docs/Web/API/Range/getClientRects) — Baseline widely available since July 2015; one DOMRect per line box in the range. `[CITED]`
- [MDN: Element.getClientRects()](https://developer.mozilla.org/en-US/docs/Web/API/Element/getClientRects) — multiline inline-level element has a border box per line; fractional pixel offsets. `[CITED]`
- [MDN: inert global attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inert) — Baseline widely available since April 2023; removes subtree from tab order + a11y tree; "no visual way to tell inert content." `[CITED]`
- `research/STACK.md` (embedded in AGENTS.md) — project-owned pagination engine mandate; what NOT to use; D-05 grapheme substrate authority. `[CITED]`
- `.planning/phases/04-*/04-UI-SPEC.md` — locked UI contract (page geometry, controls, fallback policy, diagnostic mapping, copywriting). `[CITED]`

### Tertiary (LOW confidence)
- None. Every claim is VERIFIED (codebase/fingerprint/npm) or CITED (MDN/STACK/UI-SPEC). No training-only assumptions are presented as fact; the 4 `[ASSUMED]` items are flagged in the Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — all packages verified in package.json + npm registry; no new deps; all browser primitives Baseline-widely-available.
- Architecture: **HIGH** — every seam (`trustedView`, `findScrollTarget`, `computeOffset`, `DiagnosticBus`, `SettingsContext`, `BlockView`) verified in the codebase; the only new module is `src/pagination/` whose contract is sketched from verified primitives.
- Pitfalls: **HIGH** — Pitfall 1 (Pretext ineligibility) is the load-bearing finding, verified against the calibration fingerprint; the rest are verified against prior-phase code patterns.
- Validation: **HIGH** — Playwright harness pattern proven in Phase 3 (stale-drop/last-valid-view); corpus matrix template proven in calibration harness.
- Fallback policy: **MEDIUM-HIGH** — the 75%/300/N thresholds are UI-SPEC §23 researcher calls (A2 in Assumptions Log); the planner validates against the actual corpus page-count range.

**Research date:** 2026-08-05
**Valid until:** 2026-09-05 (30 days — stable domain; the stack is locked and the fingerprint is committed). The Pretext-ineligibility finding is stable as long as the calibration fingerprint is not regenerated with different tolerances.
