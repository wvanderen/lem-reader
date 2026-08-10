# Phase 3: Trustworthy Layout Measurement - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-04
**Phase:** 3-trustworthy-layout-measurement
**Areas discussed:** Calibration tolerance & gating, Reader-visible state while measuring, Triggers & coalescing, Calibration harness design

---

## Calibration Tolerance & Gating

### Q1 — Gating policy when Pretext drifts outside tolerance

| Option | Description | Selected |
|--------|-------------|----------|
| Per block-kind gate | Calibrate each eligible block kind independently (paragraph, heading); enable Pretext per passing kind; failures fall back to DOM for that kind only. | ✓ |
| Global all-or-nothing | If ANY block kind drifts, disable Pretext entirely and DOM-measure everything. | |
| Per-fixture gate | Decide per article; a single bad block flags the whole article. | |
| You decide | Leave gating granularity to researcher/planner. | |

**User's choice:** Per block-kind gate
**Notes:** Maximizes fast-path coverage while keeping the trustworthy guarantee per kind.

### Q2 — Tolerance metric

| Option | Description | Selected |
|--------|-------------|----------|
| Height + break position | Block-height drift within bound AND every predicted line-break matches rendered DOM. Strictest. | ✓ |
| Height-only (±N px) | Total height within an absolute or relative bound. Simpler but a shifted break can hide inside a matching height. | |
| Break-position-only | Only require break points to match; lets total height drift. | |
| You decide | Researcher picks metric + bound after measuring corpus. | |

**User's choice:** Height + break position
**Notes:** Phase 4 pagination consumes break positions for page boundaries, so break fidelity is what makes measurement trustworthy for page splits.

### Q3 — Default posture (Pretext vs. DOM)

| Option | Description | Selected |
|--------|-------------|----------|
| DOM authoritative, Pretext opt-in | DOM is source of truth everywhere; Pretext is pure acceleration layered on validated kinds. | |
| Pretext primary where validated | Once a kind passes calibration, Pretext IS the measurement; DOM is calibration reference + fallback. | ✓ |
| You decide | Planner picks after measuring corpus performance. | |

**User's choice:** Pretext primary where validated
**Notes:** Deliberate bet on the fast path's performance upside. Implication: calibration confidence becomes load-bearing — elevates the harness (D3-08) and CI enforcement (D3-10) from optional to required, and motivates the runtime drift guard.

**More questions?** → Next area

---

## Reader-Visible State While Measuring

### Q1 — What the reader sees while measurement settles (scrolling mode)

| Option | Description | Selected |
|--------|-------------|----------|
| Invisible by default | No signal in scrolling; view just reflows. Status region reserved for consequential fallback events only. | ✓ |
| Quiet status-region pulse | Brief "repacking…" live-region announce when re-measurement runs long. | |
| Hairline/visual indicator | Subtle visual cue (hairline/shimmer) while measuring. | |
| You decide | Planner/UI-SPEC picks the surfacing. | |

**User's choice:** Invisible by default
**Notes:** Measurement is infrastructure, not content. Honors READ-04 and the calm, booklike aesthetic.

### Q2 — Diagnostic substrate: record now or defer to Phase 4?

| Option | Description | Selected |
|--------|-------------|----------|
| Record substrate now | Phase 3 emits structured diagnostics (drift/fallback/staleness/calibration) into a versioned shape Phase 4 surfaces. Not shown in Phase 3. | ✓ |
| Defer all diagnostics to Phase 4 | Phase 3 ships measurement + staleness only; Phase 4 instruments it later. | |
| Record only failures, not telemetry | Only consequential failure events, not calibration/drift telemetry. | |
| You decide | Researcher scopes against PAGE-09. | |

**User's choice:** Record substrate now
**Notes:** Avoids retrofitting hooks into a frozen measurement engine; Phase 4 builds only the surfacing.

**More questions?** → Next area

---

## Triggers & Coalescing

### Q1 — Font-readiness contract while fonts load/swap

| Option | Description | Selected |
|--------|-------------|----------|
| Gate trust on fonts.ready | Result accepted as trustworthy only after document.fonts.ready; pre-fonts results untrusted; re-measure on font-set change. | ✓ |
| Provisional then refine | Measure with fallback fonts, show provisional, silently swap when fonts settle. | |
| Block entirely until ready | Hold/blank until fonts.ready + first trusted measurement. | |
| You decide | Planner picks the contract. | |

**User's choice:** Gate trust on fonts.ready
**Notes:** Matches STACK.md "do not accept pagination as stable until fonts settle." Handles either outcome of the open D2-06 web-font decision.

### Q2 — Cancellation philosophy under rapid change

| Option | Description | Selected |
|--------|-------------|----------|
| Cancel-in-flight + replace | Each new trigger cancels in-flight work for older constraints; newest constraints win. | ✓ |
| Queue + coalesce, process last | Debounce into one measurement per idle window; earlier triggers collapse to final state. | |
| You decide | Planner picks scheduling; contract locked. | |

**User's choice:** Cancel-in-flight + replace
**Notes:** Directly implements PAGE-07. Contract locked: newer constraints win, in-flight cancelled, epoch-guarded. Queue mechanics + debounce window left to planner.

**More questions?** → Next area

---

## Calibration Harness Design

### Q1 — Harness model

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid: build-time + runtime guard | Offline Playwright across 3 engines → committed fingerprint gates eligibility; runtime guard re-validates and can downgrade a kind to DOM. | ✓ |
| Build-time artifact only | Committed report decides eligibility; no runtime re-check. | |
| Runtime self-check only | No committed artifact; cold-start spot-check enables fast path dynamically. | |
| You decide | Researcher scopes against corpus. | |

**User's choice:** Hybrid: build-time + runtime guard
**Notes:** Runtime guard exists precisely because Pretext is primary (D3-03) — a build-time-only check cannot detect runtime drift.

### Q2 — Calibration corpus

| Option | Description | Selected |
|--------|-------------|----------|
| The 6 DOC fixtures | Calibrate against the same representative corpus the reader reads. | ✓ |
| Dedicated calibration set | Separate synthetic edge-case set. | |
| Both | DOC fixtures + dedicated edge-case set. | |
| You decide | Researcher picks corpus. | |

**User's choice:** The 6 DOC fixtures
**Notes:** Already span the D-01 genre matrix and every supported block kind; calibration validity == real reading validity.

### Q3 — Fingerprint enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| CI gate — regression fails build | Playwright harness in CI compares to committed fingerprint; drift fails the build. | ✓ |
| Advisory artifact only | Committed and reviewable but not enforced; regression surfaces as a warning. | |
| You decide | Planner decides enforcement rigor. | |

**User's choice:** CI gate — regression fails build
**Notes:** Fits D3-03 — eligibility drift is a real failure because Pretext is the primary path.

**More questions?** → Next area (none remaining)

---

## Agent's Discretion

- Exact numeric tolerance bound (D3-02) — empirical from corpus measurement across 3 engines.
- Coalescing queue mechanics + debounce window (D3-07) — contract locked, internals open.
- Trigger observation details (figure load vs ResizeObserver; font-swap detection).
- `TextMeasurer` adapter contract / Pretext seam location.
- Non-text / rich-block DOM measurement approach (blockquote/lists/figure/code-block/footnote-ref).
- Fingerprint artifact format + storage location.
- Diagnostic substrate exact shape (D3-05) — versioned, consumed by Phase 4.
- Runtime guard sampling cadence/threshold (D3-08).

## Deferred Ideas

None raised out of scope. Confirmed-later-phase items:
- Pagination, page-turn controls, dual-mode nav, PAGE-09 fallback UI → Phase 4.
- Passage retention across repagination (PAGE-05) → Phase 4.
- Cold/warm repagination budgets (ACPT-04) → Phase 6.
- D2-06 dyslexic web-font decision → open from Phase 2; Phase 3's fonts.ready gating handles either outcome.
