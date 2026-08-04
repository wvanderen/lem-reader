# Phase 3: Trustworthy Layout Measurement - Context

**Gathered:** 2026-08-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3 delivers the **trustworthy layout-measurement layer**: a calibrated, cancellable, staleness-safe measurement engine that Phase 4 pagination will consume, plus the reader-visible guarantee that the scrolling view stays usable while measurement settles. It does NOT deliver pagination itself.

It delivers 3 requirements:
- **PAGE-06** — Reader can continue using the last valid view while a newer pagination result is being computed.
- **PAGE-07** — Stale pagination work cannot replace a result produced for newer content, viewport, typography, font, or asset constraints.
- **PAGE-08** — The measurement layer is calibrated against browser-rendered fixtures across supported engines before any Pretext.js fast path is enabled.

**Phase 3 does NOT ship** (deferred):
- **Responsive pagination, page-turn controls, dual-mode navigation** — **Phase 4** (PAGE-01, PAGE-02, PAGE-03, PAGE-04, PAGE-05, PAGE-09). Phase 3 builds the measurement engine and staleness contract that Phase 4's paginated view consumes; it does not render pages or wire page navigation.
- **The PAGE-09 fallback-reason UI** — **Phase 4**. Phase 3 *records* the diagnostic substrate (see D3-05) that Phase 4 surfaces; it does not present fallback reasons to the reader.
- **Cold/warm repagination performance budgets (ACPT-04)** — **Phase 6**. Phase 3 measurement must feel responsive, but formal budgets are Phase 6's acceptance work.

**Phase 3's visible surface in this prototype is the scrolling reader from Phase 2.** The reader is always in scrolling mode here, so the "keep last valid view" machinery runs but its effect is subtle (the view reflows rather than flashing blank). Phase 3 is largely **foundational infrastructure** whose payoff lands in Phase 4 — but the trustworthiness contract (calibration, staleness, font-readiness gating) is established and proven here.

**Substrate already locked by prior phases:**
- **D-05** grapheme offsets over `normalizeText(article)` — measurement must respect this single coordinate space.
- **D-06** stable id + monotonic revision.
- **STACK.md**: Pretext 0.0.8 pinned exact, behind a `TextMeasurer` adapter, for *plain paragraph-like text only*; `document.fonts.ready` is the font-readiness primitive; no DOM emulators for layout truth → Playwright in Chromium/Firefox/WebKit.
- **Phase 2** (`SettingsContext` + `applyTheme`) is the live typography trigger source; Phase 2 re-renders scrolling directly and does NOT own the formal measurement/trust pipeline — that is Phase 3's to introduce.

</domain>

<decisions>
## Implementation Decisions

### Calibration Tolerance & Gating (PAGE-08, SC3)

- **D3-01:** **Per block-kind gate.** Pretext eligibility is calibrated independently for each eligible block kind (paragraph, heading — the simple inline-run kinds). If one kind drifts outside tolerance while another passes, the passing kind keeps the Pretext fast path and the drifting kind falls back to DOM measurement. Eligibility state is recorded per kind. This maximizes fast-path coverage without letting one weak kind block the others. (Rich/non-text kinds — blockquote, lists, figure, code-block, footnote-reference, unsupported — are DOM-measured by definition per STACK.md's "plain paragraph-like text" scope.)
- **D3-02:** **Height + break-position tolerance metric.** A block kind is "within tolerance" when block-height drift stays within a small bound AND every predicted line-break position matches the rendered DOM. Strictest option — a single shifted line break flags the kind. Justified because Phase 4 pagination consumes break positions for page boundaries, so break fidelity is what makes measurement trustworthy for page splits. (Exact numeric bound is empirical from the corpus — researcher/planner picks after measuring; see Discretion.)
- **D3-03:** **Pretext primary where validated; DOM is calibration reference + fallback.** Once a block kind passes calibration, Pretext IS the measurement for it (not merely an optimization layered over DOM). DOM remains the calibration reference and the fallback when Pretext drifts at runtime or is unavailable. This is a deliberate bet on the fast path's performance upside. **Implication carried into D3-08/D3-10:** because Pretext carries the trustworthy promise for validated kinds, calibration confidence is load-bearing and a runtime drift guard plus CI-enforced fingerprint are required, not optional.

### Reader-Visible State While Measuring (SC1, calm vs. informed)

- **D3-04:** **Invisible by default in scrolling mode.** No measurement signal is shown — the scrolling view just reflows (typography already live-applies via Phase 2). Measurement is infrastructure, not content. Honors READ-04 ("secondary controls do not compete with content") and the calm, booklike aesthetic. The Phase 2 status-region pattern (`role="status"` + `aria-live="polite"`) is **reserved for consequential fallback events** (e.g. a future fallback-to-scrolling in Phase 4), not used for routine re-measurement chatter.
- **D3-05:** **Record the diagnostic substrate now.** Phase 3's measurement layer emits structured diagnostics — drift exceedances, DOM-fallback events, staleness/late-epoch drops, calibration failures, runtime-guard downgrades — into a **versioned shape that Phase 4's PAGE-09 UI will consume**. Diagnostics are recorded but NOT shown to the reader in Phase 3. This avoids Phase 4 having to retrofit hooks into a frozen measurement engine; Phase 4 then builds only the surfacing. (Exact diagnostic shape is the planner's call — see Discretion.)

### Triggers & Coalescing (SC1, PAGE-07)

- **D3-06:** **Trust is gated on `document.fonts.ready`.** A measurement result is accepted as trustworthy only after `document.fonts.ready` resolves. Before that, the reader keeps using the last valid view (SC1) and any provisional result is tagged untrusted. Re-measurement fires when the font set changes (font loading, font swap, or a future web-font like the D2-06 dyslexic option). Matches STACK.md's "do not accept pagination as stable until fonts settle."
- **D3-07:** **Cancel-in-flight + replace under rapid change.** Each new trigger cancels any in-flight measurement for older constraints and starts fresh; only the newest constraints ever produce an accepted result. Directly implements PAGE-07 ("stale work cannot replace a newer result"). Reader never waits behind an obsolete measurement, and stale work cannot pile up during a long drag/resize.

**Trigger surface (locked by SC1, not a decision):** all four sources named in SC1 are in scope — viewport resize (`ResizeObserver`), typography changes (`SettingsContext`), font state (`document.fonts.ready`), and asset/figure dimension changes (image load). The coalescing queue mechanics and debounce window are the planner's call — see Discretion.

### Calibration Harness Design (PAGE-08)

- **D3-08:** **Hybrid harness — build-time Playwright across 3 engines + runtime drift guard.** An offline Playwright harness runs calibration across Chromium, Firefox, and WebKit against the corpus (D3-09), producing a **committed tolerance report + per-engine metric fingerprint artifact** that gates which block kinds are Pretext-eligible. At runtime, a lightweight guard re-validates sampled blocks (especially after a font-set change per D3-06) and can **downgrade a kind from Pretext to DOM if drift appears**, feeding the diagnostic substrate (D3-05). The runtime guard exists precisely because Pretext is primary (D3-03) — a build-time-only check could not detect runtime drift.
- **D3-09:** **Corpus = the 6 DOC fixtures.** Calibration measures against the same representative corpus the reader actually reads (`essay-long-form`, `technical-post`, `figure-heavy`, `footnote-academic`, `list-reference`, `unsupported-case`). These already span the D-01 genre matrix and every supported block kind, so calibration validity == real reading validity. No separate synthetic calibration set to maintain; the fingerprint is grounded in shipped content. (A dedicated edge-case set is deferred unless corpus measurement reveals blind spots.)
- **D3-10:** **CI gate — a calibration regression fails the build.** The Playwright calibration harness runs in CI and compares the fresh fingerprint to the committed one. If a previously-eligible block kind now drifts outside tolerance, the build fails. Prevents a silent change (new Pretext version, font update, fixture edit, engine update) from degrading the primary measurement path. Fits D3-03: eligibility drift is a real failure, not a warning.

### Agent's Discretion

- **Exact numeric tolerance bound** (D3-02) — empirical; the researcher measures the corpus across 3 engines and derives the height/break bound. The metric (height + break position) is locked; the number is not.
- **Coalescing queue mechanics + debounce window** (D3-07) — the cancellation contract (newer wins, in-flight cancelled, epoch-guarded) is locked; the scheduling internals (single queue vs. per-source, debounce band ~ Phase 2's 400ms precedent) are the planner's call.
- **Trigger observation details** — how figure/asset dimension changes are observed (load event vs. `ResizeObserver` on the figure), how a font swap is detected for re-measure — implementation choice.
- **`TextMeasurer` adapter contract / Pretext seam location** — where the adapter lives and its API surface (STACK.md mandates the adapter exists; its shape is architecture).
- **Non-text / rich-block DOM measurement approach** — how blockquote/lists/figure/code-block/footnote-reference are measured in the DOM (the eligible set for Pretext is locked as paragraph + heading; the DOM path for everything else is the planner's).
- **Fingerprint artifact format + storage location** — file format and repo location for the committed calibration report.
- **Diagnostic substrate exact shape** (D3-05) — versioned, structured, consumed by Phase 4's PAGE-09 UI; fields and serialization are the planner's.
- **Runtime guard sampling cadence/threshold** (D3-08) — how often and how much the guard re-validates; tuned against cost.

### Folded Todos
*None — `todo.match-phase` returned no matches for Phase 3.*

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project intent & requirements
- `.planning/PROJECT.md` — product vision, Core Value, Constraints, Key Decisions table. Anchors the accessibility-first, "calm, booklike" promise and the Constraints (Performance: repagination must feel responsive and stable after fonts settle; Accessibility: reduced-motion, semantic order).
- `.planning/REQUIREMENTS.md` — **PAGE-06, PAGE-07, PAGE-08 are this phase's requirements** (§Pagination). §Traceability maps each to Phase 3. PAGE-09 and PAGE-01..05/ACPT-04 are explicitly Phase 4/Phase 6 — out of scope here.
- `.planning/ROADMAP.md` — Phase 3 goal, 3 success criteria, dependency on Phase 2. **Roadmap-level decision:** "Require calibrated browser measurement before enabling any Pretext fast path" (this is PAGE-08's authority).

### Stack & architecture authority
- `.planning/research/STACK.md` — locked stack. Directly governing Phase 3: `@chenglou/pretext` 0.0.8 pinned exact (Pretext section: behind a `TextMeasurer` adapter, plain paragraph-like text only, validate against rendered DOM before primary fast path, no auto-hyphenation); browser primitives `document.fonts.ready` / `FontFaceSet.ready`, `ResizeObserver`, `CanvasRenderingContext2D.measureText()`, `Intl.Segmenter`; **What NOT to use:** DOM emulators for pagination truth (→ Playwright in Chromium/Firefox/WebKit), CSS columns as the engine, page-number anchors. Supporting libs already installed: Playwright 1.61.1, `@axe-core/playwright` 4.12.1.
- `AGENTS.md` — project instructions embedding STACK.md, conventions, architecture notes, GSD workflow enforcement.

### Prior-phase contracts this phase extends
- `.planning/phases/01-canonical-article-foundation/01-CONTEXT.md` — **D-04** (inline marks: link/code/strong/em — defines what text Pretext measures), **D-05** (grapheme-offset coordinate system — measurement must respect), **D-06** (stable id + monotonic revision).
- `.planning/phases/02-accessible-scrolling-reader/02-CONTEXT.md` — the live-apply typography model (D2-03), the status-region pattern (D2-13), and the **D2-06 research flag** (dyslexic-friendly font may ship as a web font requiring `document.fonts.ready` safe-handling — directly relevant to D3-06 font-readiness gating; Phase 3's contract handles either outcome).

### UI design contracts (Phase 3 has UI hint: yes)
- `.planning/phases/01-canonical-article-foundation/01-UI-SPEC.md` — §Interaction patterns: reduced-motion gate, forced-colors gate, focus, status region. Phase 3's invisible-by-default behavior (D3-04) must stay consistent with these.
- `.planning/phases/02-accessible-scrolling-reader/02-UI-SPEC.md` — progress hairline + status-region conventions Phase 3 inherits and does NOT repurpose for measurement chatter (D3-04).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/routes/ArticleView.tsx` — the reading surface where the measurement layer lands and where "last valid view" lives. Currently re-renders scrolling directly on article load with a cancelled-flag async pattern (lines 95–117) that already prevents a slow load overwriting an in-flight swap — the natural template for the epoch/staleness guard (D3-07). The callback-ref + state pattern for the `<article>` DOM node (lines 73–85) is the seam a DOM-measurement path would read.
- `src/settings/SettingsContext.tsx` + `src/settings/applyTheme.ts` — **the typography trigger source.** `applyTheme(settings)` writes `:root` CSS custom properties on every settings change (live-apply); `update(patch)` is what fires a measurement trigger (D3-07). The debounced-save (400ms) + dual-event flush pattern (lines 113–165) is the precedent for a coalesced measurement queue.
- `src/content/schema.ts` — **the block model that gets measured.** Eligible for Pretext fast path: `ParagraphBlock`, `HeadingBlock` (simple `InlineRun` arrays). DOM-measured by definition: `BlockquoteBlock` (recursive), `BulletedListBlock`/`NumberedListBlock` (recursive), `FigureBlock` (image asset), `CodeBlock`, `FootnoteReferenceBlock`, `UnsupportedBlock`. This split is the basis of D3-01 per-kind gating.
- `src/fixtures/index.ts` — **the 6-fixture calibration corpus** (D3-09), each `ArticleSchema.parse`-validated at module load. These are both the reader's content and the calibration target.
- `src/content/normalizeText.ts` — **D-05 grapheme substrate.** Measurement offsets must round-trip against this output (Phase 2's `findScrollTarget` already reuses it exactly — Phase 3 must not fork a parallel implementation).
- `src/app.css` — `:root` custom properties consumed by `applyTheme`; global `prefers-reduced-motion` and `forced-colors` gates; `.status` / `.visually-hidden` helpers. Any measurement-driven affordance inherits these gates (D3-04 reserves status for consequential events only).

### Established Patterns
- **Playwright across Chromium/Firefox/WebKit for layout truth** (STACK.md; Phase 1's `01-03` e2e/axe harness set this up) — the calibration harness (D3-08) extends this pattern, it does not introduce a new test runtime.
- **Cancelled-flag / version-guard async pattern** (ArticleView load, SettingsContext load) — the template for the epoch guard (D3-07).
- **Zod-at-boundary validation** (`schema.ts` single source of truth) — the diagnostic substrate (D3-05) and any persisted measurement metadata must be schema-validated. **Note:** STACK.md forbids storing *derived page boundaries* — Phase 3 must not persist page geometry, only eligibility/diagnostic records if anything.
- **React context, no Redux/Zustand** — measurement state flows through React; no external state library.
- **Authored CSS + custom properties, no Tailwind** — any measurement affordance is authored CSS, not a framework.

### Integration Points
- **`SettingsContext`** (`src/settings/SettingsContext.tsx`) — typography-change trigger source; a measurement-effect hook subscribes here.
- **`ArticleView`** (`src/routes/ArticleView.tsx`) — consumer of the measurement result; "last valid view" retention mounts here.
- **The Playwright e2e harness** (Phase 1's `01-03`) — the calibration harness (D3-08) and its CI gate (D3-10) extend this; a committed fingerprint artifact is produced alongside the existing 3-engine run.
- **Dexie schema** (`src/persistence/db.ts`) — Phase 3 should NOT add page-boundary stores (STACK.md forbids derived-boundary persistence); eligibility/diagnostic state is likely in-memory or a committed artifact, not IndexedDB. Planner confirms.

</code_context>

<specifics>
## Specific Ideas

- "Calm, booklike" remains the guiding aesthetic — measurement is **infrastructure, invisible by default**. The trustworthy promise must hold *without* surfacing churn to the reader. Any visible affordance during measurement would undercut the product's core hypothesis.
- Pretext being **primary** (not merely an optimization) is a deliberate bet on the fast path. The calibration fingerprint is therefore **load-bearing and CI-enforced** (D3-10), not advisory — a regression is a real failure because the primary measurement path is at stake.
- The 6 fixtures **are** the calibration corpus — calibration validity is real-content validity, not synthetic edge-case coverage. The fingerprint is grounded in exactly what the reader reads.
- The runtime drift guard (D3-08) exists specifically because a build-time-only fingerprint cannot see runtime font/fixture/engine changes — and since Pretext is primary, drift at runtime must be caught and downgrade the kind to DOM, not silently degrade.

</specifics>

<deferred>
## Deferred Ideas

None raised that were out of scope. Items explicitly belonging to later phases (confirmed, not new):
- Responsive pagination, page-turn controls, dual-mode navigation, oversize/fallback **diagnostic UI** → **Phase 4** (PAGE-01..05, PAGE-09). Phase 3 records the diagnostic substrate (D3-05) but does not surface it; Phase 4 builds the surfacing and the paginated view that consumes this measurement engine.
- **Passage retention across repagination** (PAGE-05) → **Phase 4**. Phase 3 supplies trustworthy measurement; preserving the reader's logical passage across a re-layout is Phase 4's consumer behavior.
- **Cold/warm repagination performance budgets** (ACPT-04) → **Phase 6**. Phase 3 measurement must feel responsive, but formal budget acceptance is Phase 6.
- **D2-06 dyslexic-friendly web-font decision** → still open from Phase 2. It affects font-state invalidation, but Phase 3's `document.fonts.ready` gating (D3-06) handles either outcome (web font or system stack); the decision itself is not Phase 3's to make.

</deferred>

---

*Phase: 3-trustworthy-layout-measurement*
*Context gathered: 2026-08-04*
