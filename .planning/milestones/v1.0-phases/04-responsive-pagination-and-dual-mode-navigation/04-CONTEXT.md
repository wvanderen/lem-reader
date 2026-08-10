# Phase 4: Responsive Pagination and Dual-Mode Navigation - Context

**Gathered:** 2026-08-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 4 delivers the **paginated reading mode** and the **dual-mode navigation** that lets the reader move predictably through responsive pages and switch (or fall back) to scrolling without losing their logical passage. It consumes Phase 3's trusted measurement (per-block heights + line counts + staleness-safe pipeline) and produces **explicit source-range page fragments rendered semantically**, plus surfaces Phase 3's diagnostic substrate as reader-visible fallback reasons.

It delivers 6 requirements:
- **PAGE-01** — Reader can explicitly switch the same article between semantic paginated and scrolling modes while remaining at the same logical passage.
- **PAGE-02** — Reader can move forward and backward through responsive pages using keyboard, pointer, and touch controls with predictable focus.
- **PAGE-03** — Every supported content unit appears exactly once and in canonical order, without clipping, duplication, omission, or nonterminating pagination.
- **PAGE-04** — Pagination terminates with a usable result or an explicit scrolling fallback for oversized or unsupported content.
- **PAGE-05** — Reader remains at the same logical passage when switching modes or when viewport, typography, font state, or supported asset dimensions trigger repagination.
- **PAGE-09** — Pagination records actionable diagnostics and presents an understandable reason when it falls back to scrolling.

**Phase 4 does NOT ship** (deferred):
- **Highlights and notes** — **Phase 5** (ANNO-01…07, STATE-03). Phase 4's source-offset fragments and D-05 grapheme coordinate are the substrate Phase 5 anchors against; Phase 4 does not build selection/note UI.
- **Formal cold/warm repagination performance budgets (ACPT-04)** — **Phase 6**. Phase 4 repagination must feel responsive (reusing Phase 3's coalescing + staleness pipeline), but formal budget acceptance is Phase 6.
- **Heading navigator and line-focus aid (ORNT-01/02)** — **v2**. Phase 4 reserves the arrow keys carefully (D4-05) so the future line-focus aid has a home.

**Substrate already locked by prior phases (pre-answered — do NOT re-ask):**
- **D-05** grapheme offsets over `normalizeText(article)` — the canonical "logical passage" coordinate. Mode-switch (PAGE-01) and repagination (PAGE-05) round-trip through this, never through page numbers.
- **D3-04** `.status` live region is RESERVED for consequential fallback events. PAGE-09 surfaces there; routine repagination is silent.
- **D3-05** DiagnosticEvent 6-kind discriminated-union shape is defined. Phase 4 extends *emission/surfacing*, not the shape.
- **D3-06 / D3-07** font-gate + cancel-in-flight + epoch commit guard = the staleness contract PAGE-05/SC4 relies on. Phase 4 consumes `useMeasurement()`'s trusted view; it does not re-implement trust.
- **D2-01 / D2-02** slim persistent header + slide-over settings panel = the chrome any new control lives in (READ-04 calm).
- **D2-12** thin hairline + screen-reader section announcer already exist; page number is NOT treated as permanent identity (READ-05).
- **STACK.md** locks the approach: **project-owned pagination engine** producing **explicit source-range page fragments rendered semantically** (NOT CSS columns, NOT Paged.js); "render only complete semantic blocks where possible; when text must split, preserve source offsets and accessible reading order"; **persisting derived page boundaries is FORBIDDEN** (paginated mode is recomputed, never stored).

**Critical substrate gap Phase 4 must bridge:** Phase 3's `MeasurementResult` (`src/measurement/types.ts`) carries per-block `{kind, heightPx, lineCount}` — **no line-break positions and no per-line source offsets**. Booklike fragmentation (D4-01) needs split-point data, so Phase 4 EXTENDS measurement to carry it (see Discretion). Also: `ReaderSettingsSchema` (`src/content/schema.ts:209`) has **no `readingMode` field** despite STATE-02 being marked complete — Phase 4 must add it (D4-12).

</domain>

<decisions>
## Implementation Decisions

### Block Fragmentation Policy (PAGE-03, the core engine decision)

- **D4-01:** **Booklike flow — split at line boundaries.** Paragraphs (and other text-container kinds) split at line boundaries so each page fills like a real book, with source offsets preserved at every split (D-05 round-trip) and accessible reading order maintained. This is the most demanding option but matches PROJECT.md's "calm, booklike" promise and STACK.md's "when text must split, preserve source offsets and accessible reading order." Rejected alternatives: whole-blocks-only (left large whitespace at page bottoms on the essay-long-form / footnote-academic fixtures — undercut "calm"); hybrid-threshold (added a tunable knob without a clear corpus-driven value).
- **D4-02:** **Atomic set = figure + heading + code-block + footnote-reference + unsupported.** These kinds NEVER split — they move whole to the next page if they don't fit. Splitting kinds: **paragraph**, **list item** (`<li>` contents), and **blockquote child blocks**. Code stays whole (splitting code between lines risks semantic misreading); figures stay whole (image + caption are inseparable); headings stay whole (a split heading is meaningless — see D4-03 widow rule). Multi-page single-paragraph is normal booklike flow (no special case).
- **D4-03:** **Heading widow rule = heading + first 2 lines of the following block.** A heading must keep the first 2 lines of the following block on the same page; if they don't fit, the heading moves to the next page. Standard book typography (widow/orphan = 2). Critical for the accessibility-first audience, who are most sensitive to losing spatial context at a page boundary.
- **D4-04:** **Line-level widow/orphan rule = 2-line rule at split boundaries.** Beyond headings, split paragraphs also avoid leaving a single line stranded at a page boundary (orphan at the bottom / widow at the top): keep at least 2 lines of a paragraph on each side of a split. Consistent with D4-03.

### Page Navigation Controls (PAGE-02, A11Y-01/02/03/07/08, READ-04/05)

- **D4-05:** **Full keyboard bundle.** `PageUp`/`PageDown` + `ArrowLeft`/`ArrowRight` + `Space` (forward) / `Shift+Space` (back). Covers web convention (PageUp/Down), book convention (arrows), and reader convention (Space). Maximizes accessibility (A11Y-01 keyboard-only) and discoverability across mental models. Arrows are included despite a potential future conflict with v2 ORNT-02 line-focus aid — Phase 4 claims them now; v2 will disambiguate if needed.
- **D4-06:** **Quiet visible page-turn buttons + left/right swipe.** Small, low-contrast page-turn buttons (matching the calm hairline aesthetic) for pointer input, PLUS left/right swipe for touch. **No invisible click zones** — they would conflict with Phase 5 text-selection annotations and with link clicks, and they are undiscoverable for the accessibility-first reader. Button placement and swipe-vs-pinch-zoom conflict resolution are UI-SPEC / researcher (see Discretion).
- **D4-07:** **Context-aware focus + concise SR status.** On page turn: if the turn was triggered via button or keyboard, focus STAYS on the control (predictable); if focus was in content, focus moves to the top of the new page (first heading or first focusable element). The screen reader hears a CONCISE "Page N of M" status (A11Y-08) — never a full content re-read, never repetitive page-turn chatter. Only the current page is in the tab/reading order (A11Y-03 — no duplicate active content tree).
- **D4-08:** **"Page N of M" IS the paginated progress signal.** A quiet, low-contrast "N of M" text lives in the hairline region; the Phase 2 hairline DERIVES from N/M in paginated mode and stays scroll-ratio in scrolling mode. The page number is informational (it changes with viewport/typography), not permanent identity — consistent with READ-05. The Phase 2 SectionAnnouncer (heading changes) stays in both modes.

### Mode Switch + Passage Anchor (PAGE-01, PAGE-05, SC4, STATE-02)

- **D4-09:** **Header toggle + `M` keyboard shortcut.** A quiet mode-toggle button in the existing slim header (next to the gear, per D2-02) + the `M` key. Discoverable, immediate, explicit (PAGE-01). Not buried in the settings panel — mode is a primary reading control, not a typography preference. Exact copy/labeling is UI-SPEC.
- **D4-10:** **Mode-switch anchor = top-of-current-view → grapheme offset → target.** When the reader switches paginated↔scrolling (PAGE-01), the anchor is the first visible block (scrolling) / the first block on the current page (paginated). It maps to a D-05 grapheme offset, then to a target in the new mode. Predictable — matches the reader's sense of "where I am reading."
- **D4-11:** **Repagination anchor = same top-of-view rule (one consistent anchor).** When repagination commits after a viewport/typography/font/asset change (PAGE-05/SC4), the grapheme offset currently at the TOP of the viewport stays at the top (or as close as possible) of the new first-visible page. The reader stays put — they did not ask to move. This is the SAME anchor rule as D4-10 (mode-switch), giving one consistent passage-preservation principle across both triggers. Pairs with PAGE-06: the old page stays mounted during compute (Phase 3's trustedView retention), and the new page anchors to the same offset when it commits.
- **D4-12:** **Add `readingMode: "paginated" | "scrolling"` to `ReaderSettingsSchema`, default `"paginated"`, schemaVersion 1→2.** PROJECT.md: "Pagination is the distinctive default experience, but it is not mandatory." New and migrated readers get paginated as the homepage of the reading experience; scrolling remains one tap away. The field is added to the Zod schema with default-on-read for existing v1 records (the settings Dexie store is key-value, so this is a value-shape evolution — likely no Dexie store change, planner confirms against Pitfall 9).

### the agent's Discretion

- **Measurement extension for split points** — Phase 3's `MeasurementResult` carries per-block heights + line counts but NOT line-break positions or per-line source offsets. Booklike fragmentation (D4-01) requires both. Phase 4 EXTENDS measurement to carry split-point data: **Pretext line-break positions + grapheme offset per break** for eligible kinds (paragraph, heading — per D3-01 eligibility); **DOM `getClientRects` line-box mapping → source offset** for DOM-measured splitting kinds (list items, blockquote children). The contract is locked (D-05 grapheme round-trip); the extension mechanics are architecture.
- **Page geometry specifics** — width follows the existing `--measure` content-box (`.article-body { max-width }`); height is viewport-bounding (forced by Phase 3's `ResizeObserver` trigger surface — page count MUST respond to viewport). Internal page padding/margins are UI-SPEC concerns (book pages have generous margins; exact values refine against the corpus).
- **Page-turn button placement + swipe-vs-zoom conflict** — where the quiet buttons live (page sides vs a bottom bar) and how swipe gestures coexist with native pinch-zoom / reflow (A11Y-04) are UI-SPEC / researcher decisions against the viewport/device matrix.
- **Fallback policy + diagnostic surfacing (PAGE-04, PAGE-09)** — the user deferred this area. What's LOCKED: the surface (D3-04 `.status` live region), the shape (D3-05 DiagnosticEvent 6 kinds — Phase 4 extends emission, not shape), and the behavior contract (STACK.md: "Report a structured pagination failure reason" + "a usable scrolling fallback at the same passage"). What's OPEN / empirical: the fallback THRESHOLD (single block taller than a page? cumulative oversize? non-terminating detection — page count > N?), per-block fallback (scrolling region inside paginated) vs whole-article fallback, the `.status` banner copy + lifecycle, and which DiagnosticEvent kinds go reader-visible vs silent record. The researcher/planner picks the threshold against the corpus (especially the `unsupported-case` and `figure-heavy` fixtures).
- **`TextMeasurer` adapter / pagination-engine module boundary** — where the pagination engine lives and its API surface (STACK.md mandates it be a project-owned internal module with a versioned contract; its shape is architecture).
- **Diagnostic substrate consumption mechanics** — how the paginated view subscribes to `DiagnosticBus.recent()` and which events surface to the `.status` region vs are silent record only.
- **Exact toggle copy/labeling, hairline region layout, "N of M" typography** — UI-SPEC refines; the model (header toggle, hairline region, calm low-contrast) is locked.

### Folded Todos
*None — `todo.match-phase` returned no matches for Phase 4.*

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project intent & requirements
- `.planning/PROJECT.md` — product vision, Core Value ("calm, booklike"), Constraints (Performance: repagination stable after fonts settle; Accessibility: reduced-motion, semantic order), Key Decisions table (the Phase 3 row validates the measurement substrate Phase 4 builds on). Anchors "Pagination is the distinctive default experience, but it is not mandatory" (authority for D4-12).
- `.planning/REQUIREMENTS.md` — **PAGE-01, PAGE-02, PAGE-03, PAGE-04, PAGE-05, PAGE-09 are this phase's requirements** (§Pagination). §Traceability maps each to Phase 4. PAGE-06/07/08 are Phase 3 (Complete) — Phase 4 consumes their substrate. ACPT-04 (perf budgets) is Phase 6.
- `.planning/ROADMAP.md` — Phase 4 goal, 5 success criteria, dependency on Phase 3.

### Stack & architecture authority
- `.planning/research/STACK.md` — locked stack. Directly governing Phase 4: **Project-owned pagination engine** (NOT Paged.js / Vivliostyle / CSS columns); **"Render only complete semantic blocks where possible; when text must split, preserve source offsets and accessible reading order"** (authority for D4-01/D4-02); **"Report a structured pagination failure reason"** (authority for PAGE-09); **Stack Patterns by Variant** (the dual-mode canonical document + source-range fragments + per-kind measurement + post-render overflow guard + passage preservation across repagination); **What NOT to use:** CSS columns as the engine, page-number anchors, persisted DOM Range/XPath, Redux/Zustand, DOM emulators for pagination truth (→ Playwright in Chromium/Firefox/WebKit); **persisting derived page boundaries is FORBIDDEN.**
- `AGENTS.md` — project instructions embedding STACK.md, conventions, architecture notes, GSD workflow enforcement.

### Prior-phase contracts this phase extends (READ ALL THREE)
- `.planning/phases/01-canonical-article-foundation/01-CONTEXT.md` — **D-04** (inline marks: link/code/strong/em — defines the inline text that splits), **D-05** (grapheme-offset coordinate system — THE passage-preservation substrate; every mode-switch and repagination anchor round-trips through this), **D-06** (stable id + monotonic revision), **D-07** (warm-paper defaults), **D-09** (dev-time normalization script).
- `.planning/phases/02-accessible-scrolling-reader/02-CONTEXT.md` — **D2-01/D2-02** (settings panel + slim persistent header — the chrome home for D4-09 toggle), **D2-03** (live-apply typography — the repagination trigger source), **D2-12** (hairline + SectionAnnouncer — D4-08 extends), **D2-13** (`.status` region pattern — PAGE-09 surface).
- `.planning/phases/03-trustworthy-layout-measurement/03-CONTEXT.md` — **D3-01** (per-kind eligibility — paragraph + heading Pretext-eligible), **D3-02** (height + break-position tolerance — Phase 4 consumes break positions), **D3-03** (Pretext primary where validated — Phase 4 trusts these predictions for split points), **D3-04** (`.status` reserved for consequential fallback — PAGE-09 surface), **D3-05** (DiagnosticEvent 6-kind shape — Phase 4 extends emission, not shape), **D3-06/D3-07** (font-gate + cancel-in-flight + epoch guard — the staleness contract PAGE-05/SC4 relies on), **D3-09** (corpus = 6 DOC fixtures — calibration AND pagination validation target).

### UI design contracts (Phase 4 has UI hint: yes)
- `.planning/phases/01-canonical-article-foundation/01-UI-SPEC.md` — §Interaction patterns: reduced-motion gate, forced-colors gate, focus, status region, skip-link. Phase 4's page-turn transitions, focus behavior (D4-07), and fallback banner MUST stay consistent.
- `.planning/phases/02-accessible-scrolling-reader/02-UI-SPEC.md` — header + settings panel + hairline + SectionAnnouncer conventions Phase 4 extends (D4-08 derives the hairline from N/M; D4-09 adds the toggle to the header).

### Source code contracts (READ before implementing)
- `src/measurement/types.ts` — `MeasurementResult`, `BlockMeasurement` (per-block `{kind, heightPx, lineCount}`), `Constraints`, `EligibilityState`, `DiagnosticEvent` schema. **Phase 4 EXTENDS `BlockMeasurement` (or adds a parallel structure) to carry split-point data — see D4-01 Discretion.**
- `src/measurement/engine.ts` — `MeasurementEngine.onTrusted(handler)` is the trusted-view seam; `chooseStrategy` exhaustive switch; `BlockKind` union. The pagination engine consumes the trusted view.
- `src/measurement/useMeasurement.ts` — `useMeasurement(article, articleElRef)` returns `trustedView: MeasurementResult | null` — **the hook Phase 4's paginated mode reads instead of ignoring** (ArticleView currently ignores the return value; Phase 4 wires it in).
- `src/measurement/diagnostics.ts` — `DiagnosticBus` (pub-sub + ring buffer); PAGE-09 UI subscribes via `subscribe()` / `recent()`.
- `src/content/schema.ts` — `ReaderSettingsSchema` (L209 — **has NO `readingMode` field; Phase 4 adds it per D4-12**), `Block` union, `LocationRecordSchema` (D-05 grapheme offset substrate).
- `src/content/render/BlockRenderer.tsx` — `BlockView` exhaustive switch + `ArticleBody` (renders all blocks in array order + footnotes section). **Phase 4's paginated renderer renders source-range fragments of these same blocks — it does not fork a parallel renderer** (DOC-02 reading order + D-05 coordinate integrity depend on reusing the same semantic output).
- `src/routes/ArticleView.tsx` — the reader route. Currently renders `<ArticleBody article={article} />` directly into scrolling and ignores `useMeasurement`'s return. **Phase 4 branches here: scrolling mode keeps `<ArticleBody>`; paginated mode renders page fragments derived from the trusted view.** The callback-ref + state seam for the `<article>` DOM node (L73–85) is the measurement input.
- `src/measurement/domMeasurer.ts` + `src/routes/ArticleView.tsx:51` — the exact block selector `"h2, h3, h4, p, blockquote, li, pre, figure, sup, details"` reused at three sites. Pagination MUST NOT fork a fourth selector.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/measurement/useMeasurement.ts` — **the trusted-view source.** Returns `MeasurementResult | null`. ArticleView currently ignores it; Phase 4's paginated mode reads it to derive pages. The staleness contract (PAGE-06/PAGE-07) is already inside — Phase 4 inherits "last valid view retained" for free.
- `src/measurement/engine.ts` — `MeasurementEngine` + `chooseStrategy` + `BlockKind` union. Phase 4's pagination engine is a new module that CONSUMES measurement; it does not modify the trust pipeline.
- `src/measurement/diagnostics.ts` — `DiagnosticBus.subscribe()` + `recent()` are the PAGE-09 consumption seam.
- `src/content/render/BlockRenderer.tsx` — `BlockView` + `ArticleBody`. Phase 4 renders fragments of these same blocks (preserves DOC-02 reading order + D-05 offset integrity). A fragment renderer wraps/extends this, not replaces it.
- `src/content/normalizeText.ts` — D-05 grapheme substrate. Every page boundary and every passage-preservation anchor round-trips through `normalizeText(article)`. Phase 2's `findScrollTarget` already reuses it exactly — Phase 4 must not fork a parallel implementation.
- `src/routes/ArticleView.tsx` — the branching point. Phase 4 adds a mode-aware render branch; the existing scroll-save, restore, hairline, and SectionAnnouncer stay (they serve scrolling mode; paginated mode derives the hairline from N/M per D4-08).
- `src/reader/Header.tsx` — the slim persistent header (D2-02). Phase 4 adds the mode toggle here (D4-09) and the page-turn buttons may live here or at page sides (D4-06 discretion).
- `src/reader/ProgressHairline.tsx` + `SectionAnnouncer.tsx` — Phase 4 reuses/extends both (hairline derives from N/M in paginated mode per D4-08; SectionAnnouncer stays in both modes).
- `src/settings/SettingsContext.tsx` + `src/content/schema.ts:209` — **the readingMode field addition site (D4-12).** `applyTheme` pattern shows how a new preference flows through to the reader.
- `src/app.css` — `:root` custom properties, global `prefers-reduced-motion` and `forced-colors` gates, `.status` / `.visually-hidden` helpers. Page-turn transitions and the fallback banner inherit these gates.

### Established Patterns
- **Project-owned pagination engine with versioned contract** (STACK.md) — Phase 4's pagination module is domain logic, not a library import. Mirror the discipline of `MeasurementEngine` (exhaustive switches, Zod-at-boundary, structured diagnostics).
- **Zod-at-boundary validation** (`schema.ts`, `types.ts` single sources of truth) — any persisted record (the new `readingMode` field) and any page-fragment contract must be Zod-validated. **Persisting derived page boundaries is FORBIDDEN** (STACK.md) — pagination recomputes.
- **Cancelled-flag / epoch-guard async pattern** (ArticleView load, SettingsContext load, MeasurementEngine) — the template for any pagination pass that must not overwrite a newer layout.
- **React context, no Redux/Zustand** — reading-mode state flows through `SettingsContext`; pagination state is React state/local.
- **Authored CSS + custom properties, no Tailwind** — page-turn buttons, hairline N/M indicator, and the fallback banner are authored CSS, not a framework.
- **Playwright across Chromium/Firefox/WebKit for layout truth** (Phase 1's `01-03` harness; Phase 3's calibration harness) — Phase 4's pagination correctness (PAGE-03 "exactly once, no clipping/duplication/omission/nonterminating") MUST be validated in real browsers across the 6-fixture corpus × viewport × typography matrix, NOT in a DOM emulator.
- **Exhaustive block-kind switch, no default** (BlockRenderer, chooseStrategy) — pagination's per-kind fragmentation policy (D4-02) uses the same Pattern F so TS flags missing cases.

### Integration Points
- **`useMeasurement()` return value** (`src/measurement/useMeasurement.ts`) — Phase 4 wires ArticleView to read `trustedView` and derive pages from it (currently ignored).
- **`SettingsContext`** (`src/settings/SettingsContext.tsx`) — (a) typography-change trigger source (already wired to measurement); (b) the new `readingMode` preference lives here (D4-12).
- **`ArticleView`** (`src/routes/ArticleView.tsx`) — mode-aware render branch point; passage-preservation anchor (D4-10/D4-11) computes here on every mode switch and repagination commit.
- **`DiagnosticBus`** (`src/measurement/diagnostics.ts`) — PAGE-09 UI subscribes here.
- **`ReaderSettingsSchema`** (`src/content/schema.ts:209`) — schemaVersion 1→2 to add `readingMode` (D4-12).
- **Dexie schema** (`src/persistence/db.ts`) — settings is a key-value store; the `readingMode` evolution is likely a Zod value-shape change with default-on-read, NOT a Dexie store change (planner confirms against Pitfall 9 — do NOT edit shipped version blocks).
- **The Playwright e2e harness** (Phase 1's `01-03` + Phase 3's calibration harness) — pagination correctness + fallback tests extend this pattern.

</code_context>

<specifics>
## Specific Ideas

- **"Calm, booklike" is the guiding aesthetic for pagination, not just scrolling.** Pages fill like a real book (D4-01); the page-turn controls are quiet low-contrast (D4-06); the "N of M" indicator is glanceable, not loud (D4-08); repagination keeps the reader anchored silently (D4-11). Any visible churn during pagination would undercut the product's core hypothesis.
- **Accessibility-first audience drives the decisions.** Predictable focus on turn (D4-07), widow/orphan control for spatial stability (D4-03/D4-04), discoverable header toggle (D4-09), full keyboard bundle (D4-05). The reader most sensitive to losing their place is the primary reader.
- **Pagination is the distinctive default** (PROJECT.md) — new and migrated readers land in paginated mode (D4-12); scrolling is always one tap/`M` away (D4-09). This is the product's wedge, validated first.
- **One passage-preservation rule, two triggers.** D4-10 (mode switch) and D4-11 (repagination) use the SAME anchor (top-of-current-view → D-05 grapheme offset → target). This consistency is deliberate — the reader's mental model is "I stay where I am," whether they switched modes or the viewport changed.
- **Dual mode shares one document model.** Paginated fragments render from the same normalized blocks as scrolling (reuse `BlockRenderer`); both modes round-trip through D-05. There is no parallel paginated document — only a different presentation of the same canonical article.

</specifics>

<deferred>
## Deferred Ideas

None raised that were out of scope. Items explicitly belonging to later phases (confirmed, not new):
- **Highlights and notes** (selection, highlight creation, note attach, anchor round-trip across repagination) → **Phase 5** (ANNO-01…07, STATE-03). Phase 4's source-offset fragments and D-05 coordinate are the substrate Phase 5 anchors against. D4-06 (no invisible click zones) was chosen partly to avoid conflict with Phase 5 text selection.
- **Formal cold/warm repagination performance budgets** (ACPT-04) → **Phase 6**. Phase 4 repagination must feel responsive (inherits Phase 3 coalescing + staleness pipeline), but formal budget acceptance is Phase 6.
- **Heading navigator and line-focus aid** (ORNT-01/02) → **v2**. Phase 4 claims the arrow keys (D4-05); v2 will disambiguate if line-focus aid needs them.
- **The PAGE-04/PAGE-09 fallback-area discussion was deferred by the user.** The constraints are locked (D3-04 surface, D3-05 shape, STACK.md behavior); the empirical threshold + per-block-vs-whole-article fallback + banner copy are agent discretion (see Decisions §Discretion). If the planner/researcher finds the locked constraints insufficient, a follow-up discussion can revisit.

</deferred>

---

*Phase: 4-responsive-pagination-and-dual-mode-navigation*
*Context gathered: 2026-08-05*
