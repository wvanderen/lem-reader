# Phase 3: Trustworthy Layout Measurement - Research

**Researched:** 2026-08-04
**Domain:** Browser layout measurement — staleness-safe/cancellable async measurement pipeline, font-readiness gating, and Pretext.js fast-path calibration against rendered DOM across Chromium/Firefox/WebKit
**Confidence:** HIGH (browser APIs and Pretext API verified against official sources this session; calibration tolerances intentionally empirical per D3-02)

## Summary

Phase 3 does not deliver pagination. It delivers the **trustworthy measurement substrate** that Phase 4's paginated view will consume, plus the reader-visible guarantee (PAGE-06) that the scrolling view stays usable while measurement settles. The work splits into three load-bearing pillars:

1. **A staleness-safe measurement pipeline** (PAGE-07) — every trigger (viewport resize, typography change, font swap, asset load) cancels in-flight work for older constraints and only ever lets the newest trustworthy result commit. The mechanism is a monotonic **epoch/generation token** combined with `AbortController` cancellation, layered on the cancelled-flag async pattern already proven in `ArticleView.tsx` (lines 95–117) and `SettingsContext` (lines 81–105). The "last valid view" (PAGE-06) is simply the previously-committed measurement result, retained in React state until a newer trustworthy one supersedes it.

2. **Font-readiness gating** (D3-06) — no measurement result is accepted as trustworthy until `document.fonts.ready` resolves, and a font-set change re-triggers measurement. This is the STACK.md "do not accept pagination as stable until fonts settle" rule made concrete. In the current Phase 2 stack (system-only fonts — `src/settings/tokens.ts`), `document.fonts.ready` resolves near-immediately; the pipeline must also work for the D2-06 deferred dyslexic web-font case.

3. **Pretext.js calibration** (PAGE-08) — `@chenglou/pretext` 0.0.8 is the **primary** measurement path for validated block kinds (D3-03, not merely an optimization). A Playwright harness calibrates Pretext's predicted `{ height, line breaks }` against rendered DOM across the 6 shipped fixtures × 3 engines, producing a committed per-engine fingerprint artifact (D3-08) that CI enforces (D3-10). A lightweight runtime drift guard can downgrade a drifting kind from Pretext to DOM at runtime.

**Primary recommendation:** Build the measurement layer as a single domain module (`src/measurement/`) behind a typed `MeasurementEngine` seam, with the epoch guard, font gate, and trigger coalescing as its internal invariants, and the `TextMeasurer` adapter (Pretext seam) + DOM-measurement path as swappable strategies per block kind. Calibrate against the 6 fixtures (D3-09) with a per-kind, per-engine, per-(font,size,spacing,measure) matrix; record diagnostics (D3-05) for Phase 4's PAGE-09 UI but surface nothing to the reader in Phase 3 (D3-04).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Calibration Tolerance & Gating (PAGE-08, SC3)**
- **D3-01:** **Per block-kind gate.** Pretext eligibility calibrated independently per eligible kind (paragraph, heading). One kind drifting while another passes keeps the passing kind on Pretext; the drifting kind falls back to DOM. Eligibility recorded per kind. (Rich/non-text kinds — blockquote, lists, figure, code-block, footnote-reference, unsupported — are DOM-measured by definition.)
- **D3-02:** **Height + break-position tolerance metric.** A kind is "within tolerance" when block-height drift stays within a small bound AND every predicted line-break position matches rendered DOM. A single shifted line break flags the kind. (Exact numeric bound is empirical — researcher/planner picks after measuring; see Discretion.)
- **D3-03:** **Pretext primary where validated; DOM is calibration reference + fallback.** Once a kind passes calibration, Pretext IS the measurement for it. DOM remains calibration reference and fallback. Implication: calibration confidence is load-bearing → runtime drift guard + CI-enforced fingerprint are REQUIRED, not optional.

**Reader-Visible State While Measuring (SC1)**
- **D3-04:** **Invisible by default in scrolling mode.** No measurement signal shown — the scrolling view just reflows. The Phase 2 `role="status"` + `aria-live="polite"` status-region pattern is RESERVED for consequential fallback events, NOT routine re-measurement chatter.
- **D3-05:** **Record the diagnostic substrate now.** Measurement emits structured diagnostics — drift exceedances, DOM-fallback events, staleness/late-epoch drops, calibration failures, runtime-guard downgrades — into a versioned shape Phase 4's PAGE-09 UI will consume. Recorded but NOT shown in Phase 3.

**Triggers & Coalescing (SC1, PAGE-07)**
- **D3-06:** **Trust is gated on `document.fonts.ready`.** A result is trustworthy only after `document.fonts.ready` resolves. Before that, the reader keeps the last valid view (SC1) and any provisional result is tagged untrusted. Re-measurement fires when the font set changes.
- **D3-07:** **Cancel-in-flight + replace under rapid change.** Each new trigger cancels any in-flight measurement for older constraints and starts fresh; only the newest constraints ever produce an accepted result.

**Trigger surface (locked by SC1):** all four sources in scope — viewport resize (`ResizeObserver`), typography changes (`SettingsContext`), font state (`document.fonts.ready`), asset/figure dimension changes (image load).

**Calibration Harness Design (PAGE-08)**
- **D3-08:** **Hybrid harness — build-time Playwright across 3 engines + runtime drift guard.** Offline Playwright harness calibrates across Chromium/Firefox/WebKit against the corpus (D3-09), producing a committed tolerance report + per-engine metric fingerprint artifact gating which kinds are Pretext-eligible. Runtime guard re-validates sampled blocks (esp. after a font-set change) and can downgrade a kind Pretext→DOM, feeding diagnostics (D3-05).
- **D3-09:** **Corpus = the 6 DOC fixtures** (`essay-long-form`, `technical-post`, `figure-heavy`, `footnote-academic`, `list-reference`, `unsupported-case`). Calibration validity == real reading validity. No separate synthetic set.
- **D3-10:** **CI gate — a calibration regression fails the build.** Playwright calibration harness runs in CI and compares the fresh fingerprint to the committed one. A previously-eligible kind drifting outside tolerance fails the build.

### the agent's Discretion
- **Exact numeric tolerance bound** (D3-02) — empirical; researcher measures corpus across 3 engines and derives the height/break bound. Metric is locked; the number is not.
- **Coalescing queue mechanics + debounce window** (D3-07) — cancellation contract locked (newer wins, in-flight cancelled, epoch-guarded); scheduling internals (single queue vs per-source, debounce band ~ Phase 2's 400ms precedent) are the planner's call.
- **Trigger observation details** — how figure/asset dimension changes are observed (load event vs. `ResizeObserver` on the figure), how a font swap is detected for re-measure.
- **`TextMeasurer` adapter contract / Pretext seam location** — where the adapter lives and its API surface (STACK.md mandates the adapter exists).
- **Non-text / rich-block DOM measurement approach** — how blockquote/lists/figure/code-block/footnote-reference are measured in the DOM.
- **Fingerprint artifact format + storage location** — file format and repo location for the committed calibration report.
- **Diagnostic substrate exact shape** (D3-05) — versioned, structured, consumed by Phase 4's PAGE-09 UI.
- **Runtime guard sampling cadence/threshold** (D3-08) — how often/how much the guard re-validates.

### Deferred Ideas (OUT OF SCOPE)
- Responsive pagination, page-turn controls, dual-mode navigation, oversize/fallback **diagnostic UI** → **Phase 4** (PAGE-01..05, PAGE-09). Phase 3 records the diagnostic substrate (D3-05) but does not surface it.
- **Passage retention across repagination** (PAGE-05) → **Phase 4**.
- **Cold/warm repagination performance budgets** (ACPT-04) → **Phase 6**. Phase 3 measurement must feel responsive, but formal budget acceptance is Phase 6.
- **D2-06 dyslexic-friendly web-font decision** → still open from Phase 2. Phase 3's `document.fonts.ready` gating (D3-06) handles either outcome.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PAGE-06 | Reader can continue using the last valid view while a newer pagination result is being computed. | The "last valid view" is the previously-committed measurement result retained in React state until a newer trustworthy one supersedes it (§Architecture Pattern 1). Phase 3's visible surface is the scrolling reader — the effect is subtle (reflow rather than flash-blank) but the retention machinery is real and proven for Phase 4. |
| PAGE-07 | Stale pagination work cannot replace a result produced for newer content, viewport, typography, font, or asset constraints. | Monotonic epoch/generation token captured at measurement start + checked at commit; `AbortController` cancels in-flight work on each new trigger (§Architecture Pattern 2). The cancelled-flag pattern in `ArticleView.tsx` (lines 95–117) is the existing template. |
| PAGE-08 | The measurement layer is calibrated against browser-rendered fixtures across supported engines before any Pretext.js fast path is enabled. | Playwright calibration harness over the 6 fixtures × 3 engines (§Validation Architecture + §Architecture Pattern 4); per-kind eligibility fingerprint committed and CI-enforced (D3-10); runtime drift guard downgrades on drift (D3-08). |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Viewport resize observation | Browser / Client | — | `ResizeObserver` on the reading-surface content box is the only signal; coalesced by the browser before paint. Writing the result back to async React state is loop-safe. |
| Typography change trigger | Browser / Client (React) | — | `SettingsContext` already owns the live `applyTheme` write; a measurement-effect hook subscribes to `settings` and bumps the epoch. |
| Font readiness gating | Browser / Client | — | `document.fonts.ready` is a client-side `FontFaceSet` promise; resolves near-instantly for system stacks today, may wait on a future web font (D2-06). |
| Asset dimension trigger | Browser / Client | — | `<img>` `load` event (deterministic) and/or `ResizeObserver` on the figure; observer also catches late-decoded intrinsic-size changes. |
| Text-block measurement (fast path) | Browser / Client (canvas) | — | Pretext runs canvas `measureText` in the browser; the `TextMeasurer` adapter wraps it. No server. |
| Non-text block measurement | Browser / Client (DOM) | — | Figures/code/lists/blockquotes are DOM-measured via `getBoundingClientRect` (no canvas proxy exists for them). |
| Calibration reference / truth | Test runtime (Playwright) | — | jsdom/happy-dom are forbidden (STACK.md "What NOT to Use"); rendered Chromium/Firefox/WebKit geometry is the only ground truth. |
| Calibration fingerprint storage | Repo artifact (committed JSON) | — | A versioned, committed report (NOT IndexedDB — STACK.md forbids persisting derived page geometry). Read at runtime only to log a baseline, never to gate reading. |
| Diagnostic substrate (D3-05) | In-memory event stream | (Phase 4: UI surfacing) | Emitted by the engine, consumed by a future Phase 4 panel. Phase 3 only records/forwards; never displays. |

## Standard Stack

### Core (already installed — no new deps required for the measurement engine itself)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@chenglou/pretext` | 0.0.8 (pin exact) | Fast DOM-free text measurement: `prepare()`/`layout()` predict `{ height, lineCount }`; `prepareWithSegments()`/`layoutWithLines()`/`walkLineRanges()` give line-break positions + cursors | Locked by STACK.md. Pre-1.0; pin exact and wrap behind a `TextMeasurer` adapter. [VERIFIED: github.com/chenglou/pretext README + npm registry] |
| `@playwright/test` | 1.61.1 | Real-browser calibration harness across Chromium/Firefox/WebKit | Already the project's layout-truth runtime (Phase 1 `01-03` e2e/axe harness). [VERIFIED: package.json] |
| Browser primitives | (platform) | `document.fonts.ready` (FontFaceSet), `ResizeObserver`, `CanvasRenderingContext2D.measureText`, `Intl.Segmenter`, `AbortController`, `Element.getBoundingClientRect`/`getClientRects` | All Baseline-widely-available; already sanctioned by STACK.md. [CITED: developer.mozilla.org] |

### Supporting (the only NEW dependency this phase adds)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@chenglou/pretext` | 0.0.8 | The fast text-measurement path itself | Install now (not yet in `node_modules`); pin exact. Eligible only for paragraph + heading kinds after calibration passes (D3-01). |

> **No other package installs are anticipated.** The DOM-measurement path uses browser primitives. The diagnostic substrate is plain TypeScript types + Zod validation. The calibration fingerprint is a committed JSON artifact. If the planner reaches for any further dependency, it must re-run the Package Legitimacy Gate.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pretext `prepare()`/`layout()` for paragraph height | DOM `getBoundingClientRect` for every block | DOM truth is always correct but forces sync reflow per block (layout thrash on a 200-block article). Pretext caches canvas-measured segments so re-layout at a new width is pure arithmetic. **Use Pretext for validated kinds; DOM only as reference + fallback** (D3-03). |
| Pretext plain `prepare()` (single font string) | Pretext `@chenglou/pretext/rich-inline` subpath | Plain `prepare()` cannot model a paragraph whose runs have per-run fonts (bold=700, code=monospace). Rich-inline can — it takes `RichInlineItem[]` each with its own `font`/`break`/`extraWidth`. **Decision is empirical per D3-01/D3-02** (see §Open Questions Q1): either (a) use rich-inline to model marks, (b) DOM-measure mark-bearing paragraphs and Pretext-measure only mark-free ones, or (c) measure the plain-text projection and accept the drift bound. The calibration harness must settle this; the metric (height + break-position) is already locked (D3-02). |
| Epoch token + `AbortController` | `Promise.race` against a timeout | Race-with-timeout cannot express "newer constraints superseded older ones" — it only bounds duration. The epoch token IS the staleness contract (PAGE-07). AbortController is the cancellation vehicle. |

**Installation:**
```bash
npm install @chenglou/pretext@0.0.8
```

**Version verification:**
```bash
npm view @chenglou/pretext version          # → 0.0.8 (confirmed 2026-08-04)
npm view @chenglou/pretext scripts.postinstall   # → (none — safe)
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@chenglou/pretext` | npm | ~7 weeks at 0.0.8 (first release 2026-03-27); author chenglou (well-known: ReasonML/React) | ~934k/week | github.com/chenglou/pretext (present, MIT) | OK | Approved — already a locked STACK.md decision; pin exact at 0.0.8 |

`npm view @chenglou/pretext scripts.postinstall` returns empty — **no postinstall script**, no network/filesystem risk. [VERIFIED: npm registry]

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

> **Note on age:** Pretext is young (pre-1.0, ~4.5 months since 0.0.0). STACK.md already mandates the mitigations that a young package demands: pin exact, wrap behind an adapter, validate against rendered DOM before promoting to primary, and CI-enforce the fingerprint (D3-10). The runtime drift guard (D3-08) exists precisely because a build-time-only check cannot detect runtime drift — which is especially relevant for a fast-moving pre-1.0 library. These are all locked decisions; no further gating is required beyond the standard `checkpoint:human-verify` already implicit in "pin exact + adapter + calibrate".

## Architecture Patterns

### System Architecture Diagram

```
                ┌─────────────────────────── TRIGGERS ───────────────────────────┐
                │                                                                │
   ResizeObserver     SettingsContext        document.fonts          <img> load
   (content box)      (settings obj)         (.ready + events)       (figure)
        │                  │                       │                    │
        └──────────────────┴──────────┬────────────┴───────────────────┘
                                       ▼
                          ┌─────────────────────────┐
                          │  TriggerCoalescer       │  debounce ~400ms (D3-07
                          │  (single queue, newest  │  precedent from Phase 2);
                          │   constraints win)      │  bumps EPOCH, aborts
                          └────────────┬────────────┘  in-flight via AbortController
                                       │ {constraints, epoch}
                                       ▼
                          ┌─────────────────────────┐
                          │  FontGate               │  await document.fonts.ready
                          │  (D3-06)                │  BEFORE accepting as trusted;
                          └────────────┬────────────┘  provisional results tagged
                                       │  untrusted until fonts settle
                                       ▼
                          ┌─────────────────────────┐
                          │  MeasurementEngine      │  for each block:
                          │  (per-kind strategy)    │   pick Pretext (if eligible)
                          └─┬─────────────────────┬──┘   or DOM measurement
                            │                     │
              ┌─────────────▼───────┐   ┌─────────▼──────────┐
              │  TextMeasurer       │   │  DomMeasurer       │
              │  (Pretext adapter)  │   │  getBoundingClientRect
              │  prepare/layout     │   │  + getClientRects  │
              │  per-run font       │   │  (figures/code/    │
              │  (rich-inline opt)  │   │   lists/blockquote)│
              └─────────────┬───────┘   └─────────┬──────────┘
                            └──────────┬──────────┘
                                       ▼
                          ┌─────────────────────────┐
                          │  RuntimeDriftGuard      │  samples N blocks; if drift
                          │  (D3-08)                │  > tolerance → downgrade kind
                          └────────────┬────────────┘  Pretext→DOM, emit diag
                                       │ {result, epoch}
                                       ▼
                          ┌─────────────────────────┐
                          │  CommitGuard            │  if result.epoch !== current
                          │  (PAGE-07 staleness)    │  EPOCH → DROP (late result);
                          │                        │  else COMMIT as "trusted view"
                          └────────────┬────────────┘
                                       │
                                       ▼
                          ┌─────────────────────────┐
                          │  React state:           │  PREVIOUS trusted view stays
                          │  trustedView            │  rendered (PAGE-06) until a
                          │  (last valid view)      │  newer one supersedes it
                          └─────────────────────────┘
                                       │
                          ┌────────────┴───────────┐
                          ▼                        ▼
              ┌─────────────────────┐   ┌─────────────────────────┐
              │ DiagnosticBus       │   │ (Phase 4: pagination     │
              │ (D3-05, in-memory)  │   │  consumes trustedView)  │
              │ → recorded, NOT     │   │                         │
              │   shown in Phase 3  │   │                         │
              └─────────────────────┘   └─────────────────────────┘

     ──────── OFFLINE / CI (D3-08, D3-10) ────────
     Playwright calibration harness (Chromium/Firefox/WebKit)
       × 6 fixtures × (font,size,spacing,measure) matrix
       → committed fingerprint JSON (repo artifact)
       → CI gate: regression FAILS the build
```

A reader's scroll/typography change flows: trigger → coalesce → font-gate → measure → drift-guard → commit-guard → trusted view. A late result from an older epoch is dropped at CommitGuard (PAGE-07). The previous trusted view stays mounted throughout (PAGE-06). Diagnostics are recorded for Phase 4 but never shown (D3-04/D3-05).

### Recommended Project Structure
```
src/
├── measurement/                  # NEW — the Phase 3 domain module
│   ├── types.ts                  # Constraints, MeasurementResult, BlockMeasurement,
│   │                             # EligibilityState, DiagnosticEvent (Zod-validated)
│   ├── engine.ts                 # MeasurementEngine orchestrator (per-kind dispatch)
│   ├── triggers.ts               # TriggerCoalescer: ResizeObserver + settings + fonts +
│   │                             # asset-load subscription → coalesced Constraints + epoch
│   ├── fontGate.ts               # document.fonts.ready await + invalidation
│   ├── epoch.ts                  # monotonic epoch token + AbortController wiring
│   ├── textMeasurer.ts           # TextMeasurer adapter (Pretext seam) — the ONLY
│   │                             # import of @chenglou/pretext in the codebase
│   ├── domMeasurer.ts            # getBoundingClientRect + getClientRects for non-text
│   │                             # kinds (blockquote/lists/figure/code-block/footnote/unsupported)
│   ├── driftGuard.ts             # runtime sampling guard (D3-08)
│   ├── diagnostics.ts            # DiagnosticBus (in-memory, versioned shape for Phase 4)
│   └── useMeasurement.ts         # React hook binding engine → trustedView state (the
│                                 # PAGE-06 "last valid view" retention)
├── settings/SettingsContext.tsx  # EXISTING — subscribe here for typography triggers
├── routes/ArticleView.tsx        # EXISTING — mounts useMeasurement; keeps rendering the
│                                 # last trusted view (the scrolling reflow is the visible
│                                 # effect; the retention machinery is the guarantee)
tests/
├── unit/
│   ├── measurement/epoch.test.ts           # staleness invariant (drop late epoch)
│   ├── measurement/textMeasurer.test.ts    # adapter contract (mocked Pretext)
│   └── measurement/diagnostics.test.ts     # event shape validation
└── e2e/
    └── calibration/                        # NEW Playwright project subset
        ├── calibration.harness.ts          # the D3-08 harness driver
        ├── fixtures-matrix.ts              # 6 fixtures × typography matrix
        └── fingerprint.compare.ts          # D3-10 CI gate
calibration/                                # NEW committed artifact (repo root)
└── fingerprint.json                        # per-engine per-kind tolerance report
```

### Pattern 1: "Last Valid View" retention (PAGE-06)
**What:** The reading surface never blank-flashes while a measurement settles. The previously-committed `trustedView` stays mounted until a newer one supersedes it.
**When to use:** Always — this is the core calm guarantee.
**Example:**
```typescript
// src/measurement/useMeasurement.ts (sketch)
// The trustedView state IS the "last valid view" (PAGE-06). It is replaced
// ONLY by a result that passed the font gate AND the epoch commit guard.
const [trustedView, setTrustedView] = useState<TrustedView | null>(null);
useEffect(() => {
  const engine = new MeasurementEngine({ article, constraints });
  const unsub = engine.onTrusted((result) => {
    // engine.onTrusted only fires for results that passed FontGate +
    // CommitGuard (PAGE-07). Provisional/untrusted results do NOT reach here.
    setTrustedView(result);
  });
  return () => { engine.cancel(); unsub(); };
}, [article, constraints]);

// ArticleView keeps rendering <ArticleBody> from trustedView (or the raw
// article on first paint). In scrolling mode this is a reflow; the
// machinery is what matters for Phase 4's paginated mode.
```

### Pattern 2: Epoch token + AbortController staleness guard (PAGE-07)
**What:** A monotonic counter bumped on every trigger. The async measurement captures the epoch at start; at commit it checks the captured epoch still equals the current epoch. `AbortController` cancels the in-flight work so it doesn't keep running after a newer trigger supersedes it.
**When to use:** Any async work whose result must reflect only the newest constraints.
**Example:**
```typescript
// src/measurement/epoch.ts (sketch)
// The cancelled-flag pattern in ArticleView.tsx (lines 95-117) is the simpler
// ancestor; this is its structured upgrade for long-running measurement.
export class Epoch {
  private current = 0;
  private controller = new AbortController();
  /** Bump on every new trigger. Returns the new epoch + a fresh signal. */
  bump(): { epoch: number; signal: AbortSignal } {
    this.controller.abort();                 // cancel in-flight (D3-07)
    this.controller = new AbortController();
    this.current += 1;
    return { epoch: this.current, signal: this.controller.signal };
  }
  /** True iff `candidate` is still the newest epoch. */
  isCurrent(candidate: number): boolean { return candidate === this.current; }
}

// Commit guard at the engine boundary:
async function measure(constraints, epoch, signal): Promise<Result> {
  await document.fonts.ready;                 // D3-06 font gate
  if (signal.aborted) throw new AbortError(); // cancelled mid-gate
  const result = /* per-kind Pretext/DOM measurement */;
  if (signal.aborted || !epoch.isCurrent(captured)) {
    diagnostics.emit({ kind: "late-epoch-drop", ... });  // D3-05
    throw new AbortError();                   // PAGE-07: stale → drop
  }
  return result;                              // trustworthy — commit
}
```

### Pattern 3: Font-readiness gating lifecycle (D3-06)
**What:** `document.fonts.ready` is re-awaitable: each access returns a promise that resolves when the current font-load queue is drained. After any typography/font change, re-await it before trusting a measurement.
**When to use:** On every measurement, between FontGate and the actual measure step.
**Example:**
```typescript
// src/measurement/fontGate.ts (sketch)
// document.fonts.ready is Baseline-widely-available (MDN). The
// onloadingdone EVENT is NOT Baseline (MDN "Limited availability") — do NOT
// rely on it as the sole signal. Re-awaiting .ready after every trigger is
// the portable primitive.
export async function awaitFontsReady(signal: AbortSignal): Promise<void> {
  // system-only stacks (current Phase 2) resolve near-instantly; a future
  // web font (D2-06) makes this wait real. Either way the contract holds.
  await document.fonts.ready;
  if (signal.aborted) throw new AbortError();
}
// Re-measure trigger on font-set change: subscribe to document.fonts
// (loadingdone where available) OR simply re-await .ready after every
// settings change (applyTheme writes tokens synchronously; the next
// measurement's .ready await catches any pending web-font swap).
```

### Pattern 4: Hybrid calibration harness (D3-08, D3-10)
**What:** An offline Playwright script measures every eligible block in every fixture, in all 3 engines, comparing Pretext's predicted `{ height, line-breaks }` against the rendered DOM. Output: a committed JSON fingerprint. CI re-runs and diffs; drift fails the build.
**When to use:** At build time (CI gate) + as the runtime guard's source-of-truth tolerance.
**Example:**
```typescript
// tests/e2e/calibration/calibration.harness.ts (sketch)
// Extends the Phase 1 01-03 e2e pattern (3-engine Playwright + axe). NOT a
// new test runtime — same playwright.config.ts projects.
for (const fixture of fixtures) {           // D3-09: the 6 shipped articles
  for (const variant of TYPOGRAPHY_MATRIX) { // font × size × spacing × measure
    await page.goto(`${BASE}/#/article/${fixture.id}`);
    await applyVariant(page, variant);
    await page.evaluate(() => document.fonts.ready);   // D3-06
    for (const block of eligibleBlocks(fixture)) {
      const predicted = await textMeasurer.measure(block, variant); // Pretext
      const rendered  = await readDomMeasurement(page, block);      // DOM truth
      fingerprint.record(fixture.id, variant, block.kind, engine, {
        heightDrift: rendered.height - predicted.height,
        breaksMatch: deepEqual(predicted.breaks, rendered.breaks),
      });
    }
  }
}
await fingerprint.write("calibration/fingerprint.json");  // committed artifact
// CI gate (D3-10): if any previously-eligible kind now drifts outside
// tolerance → process.exit(1).
```

### Pattern 5: Per-kind strategy dispatch (D3-01, D3-03)
**What:** The engine picks Pretext OR DOM per block based on the kind AND the eligibility state (calibration result + runtime drift state). Rich/non-text kinds are DOM by definition.
**When to use:** Every measurement pass.
```typescript
// Eligible for the Pretext fast path: paragraph, heading (D3-01).
// DOM-measured by definition: blockquote, bulleted-list, numbered-list,
// figure, code-block, footnote-reference, unsupported.
// (Mirrors src/content/schema.ts Block union kinds.)
function chooseStrategy(kind: BlockKind, eligibility: EligibilityState): "pretext" | "dom" {
  if (kind !== "paragraph" && kind !== "heading") return "dom";
  return eligibility[kind].pretextEligible ? "pretext" : "dom";
}
```

### Anti-Patterns to Avoid
- **Persisting derived measurement results / page geometry to IndexedDB.** STACK.md forbids it; measurements are recomputed on every layout, they are not durable reader state. Persist only eligibility/diagnostic *metadata* if anything, and even that is likely better as a committed artifact than IndexedDB. [CITED: STACK.md "What NOT to Use"]
- **Using jsdom/happy-dom as calibration reference.** They do not implement real layout or font metrics. Calibration truth MUST come from Playwright in Chromium/Firefox/WebKit. The vitest config already excludes layout assertions (comment in `vitest.config.ts`). [VERIFIED: vitest.config.ts + STACK.md]
- **Writing layout back to the `ResizeObserver`-observed element synchronously.** Triggers "ResizeObserver loop completed with undelivered notifications". Write measurement results to async React state; if you must mutate geometry, defer via `requestAnimationFrame`. [CITED: developer.mozilla.org/Web/API/ResizeObserver]
- **Trusting a measurement before `document.fonts.ready`.** A font swap after measurement invalidates every predicted line break. D3-06 makes this a hard gate. [CITED: STACK.md + MDN FontFaceSet.ready]
- **Relying on `document.fonts.onloadingdone` as the sole font signal.** MDN marks it "Limited availability" (not Baseline). Re-awaiting `document.fonts.ready` after every trigger is the portable primitive. [CITED: developer.mozilla.org/Web/API/FontFaceSet/loadingdone_event]
- **Measuring with `system-ui` via Pretext for the `sans` font option.** Pretext's own README warns "`system-ui` is unsafe for `layout()` accuracy on macOS." Our `sans` FONT_STACK starts with `system-ui` (`src/settings/tokens.ts`). The calibration harness MUST flag if the sans path cannot meet tolerance; the planner may need to either pin a named sans family for measurement or DOM-measure under sans. [VERIFIED: Pretext README + src/settings/tokens.ts]
- **Surfacing routine measurement chatter to the reader.** D3-04 reserves the status live-region for consequential fallback events only. Routine re-measurement is silent. [CITED: 03-CONTEXT.md D3-04]
- **Hand-rolling text measurement with a raw canvas.** Pretext already solves segmentation (Intl.Segmenter), bidi, word-break/keep-all, soft-hyphen handling, and per-run fonts (rich-inline). Re-implementing is a multi-month trap. [VERIFIED: Pretext README]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Text width / line-break prediction | Raw `canvas.measureText` loop + manual word-wrap | `@chenglou/pretext` `prepare`/`layout`/`layoutWithLines` | Segmentation, bidi, word-break/keep-all, soft-hyphen, browser-parity are already solved and corpus-tested. [VERIFIED: Pretext README] |
| Staleness / cancellation | Custom promise-tracking registry | Monotonic epoch token + `AbortController` | The browser primitive is purpose-built; the epoch token is a 10-line invariant that's easy to test. [CITED: MDN AbortController] |
| Resize debouncing/coalescing | Manual `setTimeout` per resize event | `ResizeObserver` (already coalesces) + a single debounce window | The browser coalesces observations before paint; one debounce on top bounds the work. [CITED: MDN ResizeObserver] |
| Font-readiness detection | Polling `document.fonts.status` | `await document.fonts.ready` | The promise is the spec-defined signal. [CITED: MDN FontFaceSet.ready] |
| Per-line rendered break extraction | Manual character-by-character `getBoundingClientRect` | `Element.getClientRects()` on an inline wrapper (one rect per line) | Returns exactly one DOMRect per CSS line box; fractional pixels included. [CITED: MDN getClientRects] |
| Diagnostics surfacing (Phase 4's job) | Building the PAGE-09 UI now | Record the D3-05 diagnostic substrate; let Phase 4 build the panel | Phase boundary (03-CONTEXT.md). |

**Key insight:** The risky/novel part of Phase 3 is *not* any single mechanism (each is a known primitive) — it is **proving the fast path is trustworthy** (calibration) and **proving stale work can never win** (the epoch invariant). Spend the empirical budget on the calibration matrix and the staleness tests, not on re-building measurement primitives.

## Common Pitfalls

### Pitfall 1: ResizeObserver loop error
**What goes wrong:** Console fills with "ResizeObserver loop completed with undelivered notifications"; in some engines a window `error` event fires.
**Why it happens:** The observer callback synchronously mutates the observed element's geometry, so the browser defers the next observation to the next frame forever.
**How to avoid:** NEVER write measurement-derived width/height back to the `ResizeObserver`-observed element's `style` synchronously. Write to async React state. If a geometry mutation is unavoidable, wrap it in `requestAnimationFrame`.
**Warning signs:** The error string in the console; flaky Playwright failures on the resize test.
[CITED: developer.mozilla.org/Web/API/ResizeObserver]

### Pitfall 2: Layout thrash (forced sync reflow)
**What goes wrong:** Measuring 200 blocks each via `getBoundingClientRect` interleaved with DOM writes causes the browser to recompute layout 200 times — visible jank.
**Why it happens:** The browser must settle all pending writes before returning a layout read. Read-after-write cycles force sync layout.
**How to avoid:** Batch ALL reads before ANY write in a measurement pass. Pretext's `prepare()` does the read-heavy canvas work once and `layout()` is pure arithmetic (no reflow) — this is precisely why D3-03 makes it primary. For DOM-measured kinds, read every block's `getBoundingClientRect` in a single read-phase before touching state.
**Warning signs:** Long task warnings in DevTools; "feels sluggish" during a resize drag.
[ASSUMED — standard browser performance guidance, not re-verified this session]

### Pitfall 3: Font-swap layout shift invalidating measurement
**What goes wrong:** A measurement taken between font-load and font-swap produces predicted breaks that don't match the final rendered geometry. The reader sees a "settle" flash.
**Why it happens:** Web fonts load asynchronously; `font-display: swap` renders with a fallback then swaps.
**How to avoid:** D3-06 gate — never commit a measurement as trusted until `document.fonts.ready` resolves. In the current system-only stack this is near-instant; the gate still protects the D2-06 future web-font case.
**Warning signs:** Predicted breaks match at first paint but drift after ~200ms; calibration passes offline but fails on a cold load.
[CITED: MDN FontFaceSet.ready + STACK.md]

### Pitfall 4: Stale result wins the race (PAGE-07 violation)
**What goes wrong:** A slow measurement for an older viewport finishes AFTER a fast measurement for a newer viewport and overwrites the trusted view.
**Why it happens:** Pure async ordering — `Promise.resolve` ordering doesn't respect "which constraints are newer".
**How to avoid:** Capture the epoch at measurement start; at commit, drop if `capturedEpoch !== currentEpoch`. Cancel in-flight via `AbortController` so it doesn't even finish. Test this invariant directly (§Validation Architecture).
**Warning signs:** During a rapid resize drag, the view occasionally snaps to a wrong size mid-drag.
[VERIFIED: pattern; ArticleView.tsx lines 95-117 is the existing simpler template]

### Pitfall 5: Pretext `system-ui` inaccuracy on macOS (sans font path)
**What goes wrong:** Pretext's predicted heights/breaks drift from rendered DOM when the font stack resolves to `system-ui` on macOS.
**Why it happens:** `system-ui` resolves to different system fonts (and different metrics) than what Pretext's canvas measures; Pretext's README explicitly warns about this.
**How to avoid:** The calibration harness MUST measure the `sans` font variant. If it can't meet tolerance, either (a) pin a named sans family for measurement purposes, or (b) DOM-measure under `sans`. Do NOT silently ship a `sans` path that fails calibration.
**Warning signs:** Calibration passes for `serif` and `dyslexic` but fails for `sans`.
[VERIFIED: Pretext README "Caveats" section]

### Pitfall 6: `word-spacing` not modeled by Pretext
**What goes wrong:** Under the `spacious` spacing preset (`--word-spacing: 0.05em`), Pretext's predicted breaks drift because `prepare()` only accepts `letterSpacing`, not `wordSpacing`.
**Why it happens:** Pretext's API exposes `letterSpacing` (px) but not `wordSpacing`.
**How to avoid:** The calibration matrix MUST include the `spacious` preset. If drift exceeds tolerance under spacious, either (a) DOM-measure under spacious, or (b) compensate by widening each inter-word gap in the text fed to Pretext (approximation). The per-kind gate (D3-01) may legitimately mark a kind eligible under `compact`/`comfortable` but not `spacious`.
**Warning signs:** Calibration passes for compact/comfortable but fails for spacious.
[VERIFIED: Pretext README API glossary — only `letterSpacing` option exists]

### Pitfall 7: Headings have hardcoded geometry independent of the size knob
**What goes wrong:** Pretext measurement of a heading uses the body's `--font-size`/`--line-height`, but the rendered heading has its own hardcoded size (`h1: 32px/1.2/600`, `h2-4: 22px/1.3/600` per `src/app.css` lines 142–153). Predicted heading height is wrong.
**Why it happens:** `app.css` declares heading sizes literally; they do not consume the `--font-size`/`--line-height` custom properties (only `body` does).
**How to avoid:** The `TextMeasurer` adapter MUST derive the `font` and `lineHeight` args per block kind: paragraphs use body geometry; headings use their own. Read computed style or hardcode the heading-size map.
**Warning signs:** Calibration shows heading heights off by a large factor; paragraph calibration clean.
[VERIFIED: src/app.css lines 142-153]

### Pitfall 8: Treating the diagnostic substrate as reader-facing
**What goes wrong:** Measurement events flood the status live-region, breaking the calm aesthetic and violating A11Y-08 ("concise programmatic status… without repetitive announcements").
**Why it happens:** It's tempting to surface "recalculating…" during a resize.
**How to avoid:** D3-04 — measurement is invisible by default. The `role="status"` region is RESERVED for consequential fallback (a future Phase 4 fallback-to-scrolling). Diagnostics go to an in-memory bus (D3-05) for Phase 4's PAGE-09 panel, never to the reader in Phase 3.
**Warning signs:** Screen-reader users hear chatter during resize; status region updates on every typography tweak.
[CITED: 03-CONTEXT.md D3-04 + A11Y-08]

## Code Examples

### Pretext fast-path measurement (paragraph) — verified against official README
```typescript
// src/measurement/textMeasurer.ts
// Source: github.com/chenglou/pretext README (verified 2026-08-04)
// THE ONLY file in the codebase that imports @chenglou/pretext.
import { prepare, layout, prepareWithSegments, layoutWithLines } from "@chenglou/pretext";

// Use-case 1: just the height (cheap hot path on re-layout).
export function measureParagraphHeight(
  text: string,
  font: string,        // canvas shorthand, e.g. "400 18px Georgia, serif"
  letterSpacingPx: number,
  lineHeightPx: number,
  maxWidthPx: number,
): { height: number; lineCount: number } {
  const prepared = prepare(text, font, { letterSpacing: letterSpacingPx });
  // layout() is PURE ARITHMETIC over cached widths — no reflow. Re-call on
  // every width change; do NOT re-prepare for the same text+font.
  return layout(prepared, maxWidthPx, lineHeightPx);
}

// Use-case 2: height + line-break positions (calibration needs this for D3-02
// break-position fidelity; Phase 4 pagination will need it for page boundaries).
export function measureParagraphWithBreaks(
  text: string,
  font: string,
  letterSpacingPx: number,
  lineHeightPx: number,
  maxWidthPx: number,
): { height: number; lineCount: number; lines: { text: string; width: number }[] } {
  const prepared = prepareWithSegments(text, font, { letterSpacing: letterSpacingPx });
  const { height, lineCount, lines } = layoutWithLines(prepared, maxWidthPx, lineHeightPx);
  return { height, lineCount, lines: lines.map((l) => ({ text: l.text, width: l.width })) };
}
// NOTE: Pretext LayoutCursor is {segmentIndex, graphemeIndex}, NOT a raw
// string offset. Phase 4 pagination will map these back to the D-05 grapheme
// offset substrate (src/content/normalizeText.ts). Phase 3 only needs height
// + break COUNT/POSITION for calibration; the offset mapping is Phase 4's.
```

### DOM truth read for calibration (rendered line breaks) — verified against MDN
```typescript
// tests/e2e/calibration/readDom.ts
// Source: developer.mozilla.org/Web/API/Element/getClientRects (verified 2026-08-04)
// For an INLINE element, getClientRects() returns ONE DOMRect PER LINE.
// To count rendered line breaks in a <p>: wrap its content in an inline
// <span> (or use a Range) and read getClientRects().length.
export async function readRenderedLineCount(page: Page, blockSelector: string): Promise<number> {
  return await page.evaluate((sel) => {
    const el = document.querySelector(sel)!;
    // Block-level el has 1 rect; its inline child span has N rects (one per line).
    const span = el.querySelector("span.measure-ref") as HTMLElement | null;
    if (span) return span.getClientRects().length;
    // Fallback: derive from height / computed line-height (integer-ish, less precise).
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight);
    return lh > 0 ? Math.round(el.getBoundingClientRect().height / lh) : 1;
  }, blockSelector);
}

export async function readRenderedBlockHeight(page: Page, blockSelector: string): Promise<number> {
  return await page.evaluate((sel) => {
    const el = document.querySelector(sel)!;
    return el.getBoundingClientRect().height;   // fractional, border-box
  }, blockSelector);
}
```

### Epoch-guarded async commit (the PAGE-07 invariant)
```typescript
// src/measurement/engine.ts (sketch — full invariant lives in tests)
// The cancelled-flag ancestor: src/routes/ArticleView.tsx lines 95-117.
async function runMeasurement(
  article: CanonicalArticle,
  constraints: Constraints,
  epoch: Epoch,
): Promise<void> {
  const { epoch: captured, signal } = epoch.bump();
  try {
    await awaitFontsReady(signal);                         // D3-06
    const result = await measureAllBlocks(article, constraints, signal); // per-kind dispatch
    // CommitGuard (PAGE-07):
    if (!epoch.isCurrent(captured) || signal.aborted) {
      diagnostics.emit({ kind: "late-epoch-drop", captured, current: epoch.current });
      return;                                              // stale → DROP
    }
    trustedView.commit(result);                            // newest → COMMIT
  } catch (e) {
    if (e instanceof AbortError) return;                   // cancelled, expected
    diagnostics.emit({ kind: "measurement-error", message: String(e) });
    // Reader keeps the last trusted view (PAGE-06) — no blank state.
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `document.fonts.onloadingdone` event for font-settle detection | `await document.fonts.ready` (re-awaitable promise) | `ready` is Baseline since Jan 2020; `loadingdone` event still "Limited availability" (MDN) | Use `.ready` as the portable primitive; treat the event as a bonus signal where available. |
| `offsetHeight`/`scrollHeight` for block measurement | `getBoundingClientRect().height` (fractional) + `getClientRects()` for per-line | Baseline for years | Fractional pixels matter for tolerance bounds; integer properties round and hide sub-pixel drift. |
| Cancelled-flag boolean (Phase 1/2 async pattern) | Epoch token + `AbortController` | Standard pattern | Scales to long-running measurement where multiple generations may race; the boolean is the simpler ancestor kept for short loads. |
| DOM measurement as primary, Pretext as optimization | Pretext primary where validated, DOM as reference + fallback (D3-03) | This phase | Calibration confidence becomes load-bearing → CI fingerprint (D3-10) + runtime guard (D3-08) are mandatory. |

**Deprecated/outdated:**
- `document.fonts.onloadingdone` as sole font signal — not Baseline (MDN). [CITED]
- `system-ui` as a Pretext-measurable font — explicitly unsafe per Pretext README. [VERIFIED]
- Hand-rolled canvas text measurement — Pretext solves it; do not re-implement.

## Validation Architecture

> Required by `.planning/config.json` `workflow.nyquist_validation: true`. The plan-phase workflow greps for this heading.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (unit/component) + `@playwright/test` 1.61.1 (e2e + calibration) |
| Config files | `vitest.config.ts` (unit/component, jsdom env — NOT authoritative for layout), `playwright.config.ts` (3-engine: chromium, firefox, webkit) |
| Quick run command | `npm run test:unit -- --run` |
| Full suite command | `npm run test` (unit + e2e; calibration harness is a separate `npm run calibrate` / CI job) |
| Calibration command | `npx playwright test --project=chromium tests/e2e/calibration/` (×3 engines; or a dedicated `calibrate` script the planner adds) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PAGE-06 | Last valid view retained while newer measurement computes | e2e (real layout) | `npx playwright test tests/e2e/measurement/last-valid-view.spec.ts` | ❌ Wave 0 |
| PAGE-07 | Late-epoch result never replaces newer trusted layout | unit (epoch invariant) + e2e (rapid-trigger) | `npm run test:unit -- --run tests/unit/measurement/epoch.test.ts` + `npx playwright test tests/e2e/measurement/stale-drop.spec.ts` | ❌ Wave 0 |
| PAGE-08 | Fast path within documented tolerances vs rendered DOM across 3 engines | e2e (calibration harness) | `npx playwright test tests/e2e/calibration/` (× chromium, firefox, webkit) | ❌ Wave 0 |
| D3-06 | Measurement untrusted until `document.fonts.ready` | unit (fontGate) | `npm run test:unit -- --run tests/unit/measurement/fontGate.test.ts` | ❌ Wave 0 |
| D3-08 | Runtime drift guard downgrades kind Pretext→DOM on drift | unit (driftGuard) | `npm run test:unit -- --run tests/unit/measurement/driftGuard.test.ts` | ❌ Wave 0 |
| D3-10 | CI fingerprint regression fails build | e2e (calibration compare) | `node tests/e2e/calibration/fingerprint.compare.js` (CI step) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test:unit -- --run` (fast; epoch/diagnostics/adapter unit tests).
- **Per wave merge:** `npm run test` (full unit + existing e2e; ensures no regression in scrolling reader).
- **Phase gate (before `/gsd-verify-work`):** full suite + the calibration harness across all 3 engines with the committed fingerprint passing the D3-10 diff. The calibration run is the load-bearing gate for PAGE-08.

### Calibration Matrix (the PAGE-08 evidence)
The harness measures Pretext-predicted vs rendered-DOM for every eligible block across:
- **6 fixtures** (D3-09 — the shipped corpus: `essay-long-form`, `technical-post`, `figure-heavy`, `footnote-academic`, `list-reference`, `unsupported-case`).
- **Typography variants:** font {serif, sans, dyslexic} × size {16,18,20,22,24} × spacing {compact, comfortable, spacious} × measure {52,58,64,72}. (Full matrix = 3×5×3×4 = 180 variants × 6 fixtures × 3 engines. The planner MAY sample a representative subset if the full matrix is too slow for CI, but MUST cover every font × spacing combination since those are the drift drivers — see Pitfalls 5 & 6.)
- **Eligible block kinds:** paragraph, heading (h1/h2/h3/h4 — note h1/h2/h3/h4 have distinct hardcoded geometry, Pitfall 7).
- **Per-block metrics (D3-02):** block-height drift (px) AND break-position match (boolean per line). A kind passes for a (fixture, variant, engine) cell iff height-drift ≤ bound AND every break matches.
- **Fingerprint artifact:** `calibration/fingerprint.json` — `{ engine, fixtureId, variant, kind: { eligible, heightDriftP95, breaksMatchRatio } }`. Committed; CI diffs.

**The empirical tolerance bound (D3-02 discretion) is derived from the FIRST calibration run:** record the observed height-drift distribution across all passing cells; pick a bound that (a) every cell clearly inside it passes both height AND breaks, and (b) intentionally-injected drift (e.g. a 1px font-size perturbation) crosses it. Document the chosen bound + rationale in the fingerprint artifact header.

### Signal / Failure-Detection Boundaries
- **Unit tests (Vitest/jsdom):** prove the *invariants* (epoch drops late work; fontGate awaits; diagnostics shape validates; adapter calls Pretext with correct args). They do NOT prove layout correctness — jsdom is forbidden for layout truth (vitest.config.ts comment).
- **Playwright e2e:** prove *reader-visible behavior* (last valid view retained; no console errors during rapid resize; calibration regression fails CI). These ARE authoritative for layout.
- **Calibration harness:** proves *measurement correctness* (Pretext within tolerance of DOM across the matrix). The committed fingerprint is the evidence PAGE-08 demands.

### Wave 0 Gaps
- [ ] `src/measurement/` module skeleton (types, engine, epoch, fontGate, textMeasurer, domMeasurer, driftGuard, diagnostics, useMeasurement) — no tests pass until this exists.
- [ ] `tests/unit/measurement/epoch.test.ts` — PAGE-07 invariant.
- [ ] `tests/unit/measurement/fontGate.test.ts` — D3-06.
- [ ] `tests/unit/measurement/textMeasurer.test.ts` — adapter contract (Pretext mocked).
- [ ] `tests/unit/measurement/driftGuard.test.ts` — D3-08.
- [ ] `tests/unit/measurement/diagnostics.test.ts` — D3-05 shape validation.
- [ ] `tests/e2e/measurement/last-valid-view.spec.ts` — PAGE-06.
- [ ] `tests/e2e/measurement/stale-drop.spec.ts` — PAGE-07 e2e.
- [ ] `tests/e2e/calibration/` — calibration harness + fingerprint compare (PAGE-08, D3-08, D3-10).
- [ ] `calibration/fingerprint.json` — initial committed artifact (produced by the first harness run).
- [ ] `package.json` — add `@chenglou/pretext@0.0.8` to dependencies; consider a `calibrate` script.

*(Existing test infrastructure — Vitest config, Playwright config, the 3-engine project matrix, the image-stub + IndexedDB-wipe `beforeEach` pattern from `tests/e2e/typography-live-apply.spec.ts` — covers the harness runtime needs. No new framework install required.)*

## Security Domain

> `security_enforcement: true` in `.planning/config.json`; ASVS level 1.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth in this prototype (local-only). |
| V3 Session Management | no | No sessions. |
| V4 Access Control | no | No privileged operations; measurement is client-local. |
| V5 Input Validation | yes | `Constraints` and `DiagnosticEvent` shapes MUST be Zod-validated at the boundary (mirrors the project's Zod-at-boundary pattern, `src/content/schema.ts`). The diagnostic substrate is consumed by Phase 4 UI — unvalidated shape is an injection vector. |
| V6 Cryptography | no | No crypto. |
| V7 Error Handling | yes | Measurement errors MUST be classified (drift / abort / measurement-error) and emitted as diagnostics, never thrown to the reader. The reader keeps the last valid view (PAGE-06) on any error — no denial-of-reading. |
| V12 Files & Resources | yes (light) | `@chenglou/pretext` is the only new dependency; verified no `postinstall` script (npm registry). Pin exact 0.0.8. |

### Known Threat Patterns for the measurement layer

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed diagnostic event reaching Phase 4 UI | Tampering | Zod-validate `DiagnosticEvent` at emit AND consume boundary; never `any`. |
| Dependency supply-chain (Pretext) | Tampering | Pin exact 0.0.8; verified no postinstall; locked STACK.md decision; CI fingerprint (D3-10) detects behavioral drift even if the package is later mutated. |
| Measurement error blocking reading | Denial of Service | Errors → diagnostics + retain last valid view (PAGE-06); reading NEVER depends on measurement succeeding. |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@chenglou/pretext` | Fast text-measurement path (PAGE-08) | ✗ (not yet in `node_modules`) | 0.0.8 (to install) | DOM measurement (correct, slower) — this IS the documented fallback (D3-03) |
| Playwright browsers (chromium, firefox, webkit) | Calibration harness + e2e | ✓ (installed; Phase 1 setup) | 1.61.1 | — |
| `Intl.Segmenter` (browser) | Pretext runtime requirement | ✓ (all 3 target engines) | platform | DOM measurement (Pretext cannot run) |
| Canvas 2D `measureText` (browser) | Pretext runtime requirement | ✓ (all 3 target engines) | platform | DOM measurement |
| `document.fonts.ready` (browser) | D3-06 font gate | ✓ (Baseline since Jan 2020) | platform | None needed (portable) |
| `ResizeObserver` (browser) | Viewport trigger | ✓ (Baseline since Jul 2020) | platform | window resize event (coarser) |
| `AbortController` (browser) | Cancellation (D3-07) | ✓ (Baseline) | platform | Epoch-token-only drop (works but wastes CPU finishing cancelled work) |
| Node.js | Build / CI | ✓ | 22 LTS (per STACK.md) | — |

**Missing dependencies with no fallback:** none — every missing piece (Pretext itself) has the DOM path as the documented fallback.
**Missing dependencies with fallback:** Pretext (not yet installed) → DOM measurement (D3-03 fallback).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Pretext `prepare()` does not accept a `wordSpacing` input (only `letterSpacing`). | Pitfall 6, Standard Stack | If wrong and it does accept wordSpacing, the spacious-preset drift is a non-issue. Verified against the README API glossary this session — only `letterSpacing` is listed. LOW risk. |
| A2 | The calibration matrix can run in CI within a tolerable time window at full breadth (180 typography variants × 6 fixtures × 3 engines). | Validation Architecture | If too slow, the planner must sample — but MUST retain full font × spacing coverage. MEDIUM risk (empirical). |
| A3 | A runtime drift guard sampling ~N blocks per measurement pass is cheap enough not to defeat Pretext's performance purpose. | Pattern 4, D3-08 | If too expensive, cadence must be lowered (e.g. sample only after font-set changes). MEDIUM risk (empirical; D3-08 explicitly defers cadence to planner). |
| A4 | `getClientRects()` on an inline `<span>` wrapper reliably returns one rect per rendered line across all 3 engines. | Code Examples, Pitfall 2 | Verified against MDN ("a multiline inline-level element has a border box around each line"). LOW risk. |
| A5 | The D3-09 corpus (6 fixtures) exposes every drift-relevant case; no hidden blind spot needs a synthetic edge-case set. | Validation Architecture | If a blind spot exists, the runtime drift guard (D3-08) is the backstop. 03-CONTEXT.md D3-09 explicitly defers a dedicated edge-case set unless calibration reveals blind spots. MEDIUM risk. |

**If this table is empty:** All other claims were `[VERIFIED]` or `[CITED]` from official sources this session.

## Open Questions

1. **Pretext strategy for paragraphs containing width-changing marks (code/strong/em)** (D3-01/D3-02 discretion)
   - What we know: A `ParagraphBlock`/`HeadingBlock` contains `InlineRun[]` whose marks include `code` (monospace, different width), `strong` (700 weight), `em` (italic), `link` (no width change). Pretext plain `prepare()` takes one `font` string — it cannot model per-run fonts. Pretext ships `@chenglou/pretext/rich-inline` which CAN model per-item fonts.
   - What's unclear: Which of (a) rich-inline, (b) DOM-measure mark-bearing blocks, (c) plain-text-projection approximation, gives the best tolerance/coverage tradeoff.
   - Recommendation: The FIRST calibration run measures all three approaches against the corpus. Pick the one with the best coverage at the chosen tolerance bound (D3-02). Document the choice in the fingerprint artifact. This is exactly the empirical work D3-01/D3-02 anticipated.

2. **Exact tolerance bound** (D3-02 discretion)
   - What we know: Metric is height-drift (px) AND break-position match. Both must pass.
   - What's unclear: The numeric height-drift bound.
   - Recommendation: Derive from the first calibration run (§Validation Architecture "Calibration Matrix"). A defensible starting heuristic: height-drift ≤ 1px (sub-line) AND zero mismatched breaks; loosen only if the corpus consistently fails a tighter bound for non-load-bearing reasons.

3. **`sans` font path viability under Pretext** (Pitfall 5)
   - What we know: Pretext README warns `system-ui` is unsafe on macOS; our `sans` stack starts with `system-ui`.
   - What's unclear: Whether the sans path can meet tolerance at all, or whether it must always DOM-measure.
   - Recommendation: Calibration settles it. If sans fails, either pin a named sans family for measurement, or mark `sans` DOM-only (the per-kind gate becomes per-(kind,font) gate — still consistent with D3-01's spirit).

4. **Fingerprint artifact storage + CI wiring** (D3-08/D3-10 discretion)
   - What we know: Must be a committed repo artifact; CI must diff and fail on regression.
   - What's unclear: Exact JSON schema, repo path, and which CI step runs it (GitHub Actions? a `precommit`? a separate `calibrate` script invoked from CI).
   - Recommendation: Planner picks; `calibration/fingerprint.json` at repo root + a `npm run calibrate` script invoked in CI is the minimal viable shape.

5. **Diagnostic substrate exact shape** (D3-05 discretion)
   - What we know: Versioned, structured, consumed by Phase 4's PAGE-09 UI. Event kinds: drift-exceedance, dom-fallback, late-epoch-drop, calibration-failure, runtime-guard-downgrade, measurement-error.
   - What's unclear: Exact field names + serialization.
   - Recommendation: Planner defines a Zod-validated `DiagnosticEvent` discriminated union in `src/measurement/types.ts` (mirrors `src/content/schema.ts` patterns). Phase 4 will extend, not rewrite.

## Sources

### Primary (HIGH confidence — verified this session via tool + authoritative source)
- **Pretext official repository** — `github.com/chenglou/pretext` README + `raw.githubusercontent.com/chenglou/pretext/main/{package.json,CHANGELOG.md}`. Confirms: 0.0.8 current; `prepare`/`layout`/`prepareWithSegments`/`layoutWithLines`/`walkLineRanges`/`measureLineStats`/`layoutNextLineRange`/`materializeLineRange`/`clearCache`/`setLocale` API; `@chenglou/pretext/rich-inline` subpath (since 0.0.5) with `prepareRichInline`/`walkRichInlineLineRanges`; "Automatic hyphenation is not built in"; "`system-ui` is unsafe for `layout()` accuracy on macOS"; runtime needs `Intl.Segmenter` + Canvas 2D; `letterSpacing` option exists, no `wordSpacing` option.
- **npm registry** (`npm view @chenglou/pretext`) — confirms 0.0.8 published 2026-06-12, ~934k weekly downloads, repo URL present, no `postinstall` script, not deprecated, MIT.
- **MDN FontFaceSet.ready** — `developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/ready`. Baseline widely available since Jan 2020; promise resolves once fonts loaded + layout done + no further loads needed.
- **MDN FontFaceSet.check** — `developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/check`. Returns true if rendering won't trigger a font swap (note: returns true for nonexistent/system fonts too).
- **MDN FontFaceSet.loadingdone_event** — `developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/loadingdone_event`. Marked "Limited availability" (not Baseline) — use `.ready` as the portable primitive.
- **MDN ResizeObserver** — `developer.mozilla.org/en-US/docs/Web/API/ResizeObserver`. Baseline since Jul 2020; coalesces observations before paint; "ResizeObserver loop completed with undelivered notifications" error + rAF/expected-size mitigations.
- **MDN Element.getClientRects** — `developer.mozilla.org/en-US/docs/Web/API/Element/getClientRects`. One DOMRect per CSS border box; for inline elements one rect PER LINE. Baseline since Jul 2015.

### Secondary (MEDIUM confidence — codebase + prior decisions)
- `src/routes/ArticleView.tsx` (cancelled-flag async pattern, callback-ref DOM node seam).
- `src/settings/SettingsContext.tsx` + `src/settings/applyTheme.ts` (typography trigger source, 400ms debounce precedent).
- `src/content/schema.ts` (Block union — eligible vs DOM-measured kinds).
- `src/content/normalizeText.ts` (D-05 grapheme substrate).
- `src/settings/tokens.ts` (FONT_STACKS — `system-ui` in sans; system-only in Phase 2).
- `src/app.css` lines 125–209 (typography cascade: body consumes `--font-size`/`--line-height`; headings have hardcoded geometry).
- `src/persistence/db.ts` (Dexie schema; STACK.md forbids derived-boundary persistence).
- `playwright.config.ts` + `vitest.config.ts` (3-engine matrix; jsdom forbidden for layout truth).
- `.planning/research/STACK.md` (locked stack authority).

### Tertiary (LOW confidence — training knowledge, marked `[ASSUMED]`)
- Layout-thrash guidance (Pitfall 2) — standard browser performance knowledge, not re-verified this session.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Pretext API verified against official repo + npm registry; browser APIs verified against MDN.
- Architecture (staleness/font-gate/calibration): HIGH — patterns verified; epoch-guard ancestor proven in `ArticleView.tsx`.
- Tolerances: MEDIUM (intentionally) — exact numeric bounds are empirical (D3-02 discretion); the metric (height + breaks) is locked, the number is deferred to the first calibration run.
- Pitfalls: HIGH for the verified ones (system-ui, word-spacing, heading geometry, RO loop, font-swap); MEDIUM for layout-thrash (standard guidance, not re-verified).

**Research date:** 2026-08-04
**Valid until:** 2026-09-03 (30 days — stable browser APIs; Pretext is fast-moving pre-1.0 so re-check Pretext version/changelog if planning slips)
