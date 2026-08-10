# Phase 6: Prototype Acceptance - Research

**Researched:** 2026-08-08
**Domain:** Cross-engine acceptance testing, accessibility verification, performance budgeting, manual screen-reader protocol design
**Confidence:** HIGH (codebase + verified Playwright 1.61.1 docs; budgets deferred to executor measurement per D6-01)

<user_constraints>

## User Constraints (from CONTEXT.md)

Phase 6 is the **acceptance phase**. The substrate (Phases 1–5) is shipped and verified. Phase 6 closes coverage gaps, locks budgets, and runs the manual protocol. **It is verification + gap-closure, not feature-building.** All locked decisions below are the planner's authority.

### Locked Decisions

**Performance Budget Definition (ACPT-04)**
- **D6-01: Measure-first, then lock.** Profile current cold + warm repagination across the corpus × device profiles FIRST, then propose cold/warm budgets at **measured p95 + headroom** for the user to approve before they are committed. The budget CONTRACT is locked (cold + warm wall-clock per repagination; fallback shares warm budget); the NUMERIC THRESHOLDS are NOT — they follow the measurement step and an explicit approval.
- **D6-02: Worst-case fixtures × two device profiles.** Profile the **heaviest fixtures** on **(a) a desktop profile** and **(b) a throttled mobile profile** (Playwright CPU + network throttling simulating a low-end device). Full 6-fixture corpus exercised for *correctness* (ACPT-01/03); perf budgets proven at the worst case.
- **D6-03: Fallback shares the warm budget — one gate.** The scrolling-fallback commit must land within the **same warm budget** as a normal repagination. One gate, no separate fallback threshold.
- **D6-04: Enforcement = CI perf gate + release manual sign-off.** A Playwright perf spec runs in CI on the representative (desktop) profile and fails the build on regression — mirroring Phase 3's calibration CI gate. PLUS a one-time manual sign-off measuring the full device matrix (including throttled-mobile that CI hardware cannot faithfully represent).

**Manual Acceptance Protocol (ACPT-02)**
- **D6-05: Manual SR matrix = NVDA+Firefox + VoiceOver+Safari.** JAWS is a recorded coverage boundary for v1.x, NOT a Phase 6 gate.
- **D6-06: Hybrid protocol — scripted checklist for core flows + exploratory charter for edges.** (a) Scripted checklist with expected SR announcement + exact keyboard sequence per step; (b) exploratory charter for edge scenarios. Both run on both SR pairings.
- **D6-07: Zero-blocker pass policy.** Pass = zero blocker/major issues. Minor SR-output quirks recorded but do not block.
- **D6-08: Versioned `ACCEPTANCE-PROTOCOL.md` in the repo + release re-run.** Executed for Phase 6 acceptance with results in `06-VERIFICATION.md`; flagged "re-run on material reader-surface changes."

**Edge-Condition Acceptance Bar (ACPT-03)**
- **D6-09: One shared invariant applied to EVERY edge condition.** Under each condition (zoom, reflow, forced colors, reduced motion, touch, font-failure): **(a) every fixture's full content is reachable via keyboard in BOTH reading modes; (b) no required function is unreachable; (c) no layout overflow clips or overlaps content.** Existing edge specs audited against this invariant and strengthened where weak; gaps (high-zoom, font-failure) get new specs asserting the same invariant.
- **D6-10: 400% zoom + 320 CSS px reflow (strict).** 400% zoom on 1280px forces single-column reflow; 320 CSS px is the WCAG 1.4.10 target. This strict bar trivially satisfies the WCAG 1.4.4 AA floor (200%).
- **D6-11: Font-failure simulated via Playwright route interception (block / delay / swap).** Three modes: (a) block font → content stays readable in fallback fonts AND last-valid-view retained (no blank flash); (b) delay font → provisional view tagged untrusted until `document.fonts.ready` resolves, then repagination re-commits; (c) font swap mid-read → stale-epoch guard drops stale result (PAGE-07), newer commits. Real-browser, cross-engine.
- **D6-12: Coverage = audit existing edge specs + add the 2 gaps.** Audit `forced-colors.spec.ts`, `reduced-motion.spec.ts`, `reflow.spec.ts`, `touch-targets.spec.ts` against the shared invariant (D6-09); add `high-zoom` (400% + 320px) and `font-failure` (block/delay/swap) asserting the same invariant.

**ACPT-01 Consolidated Corpus Flow**
- **D6-13: ACPT-01 = a consolidated end-to-end core-reading-flow spec across the 6-fixture corpus × 3 engines.** Open → read through → switch mode → restore location → create + navigate a highlight, without content loss or blocked navigation. Reuses existing fixture matrix + selectors.

### the agent's Discretion (research targets this RESEARCH resolves)

- **D6-01 numeric thresholds** — approach + contract locked; NUMBERS follow measurement. *(Resolved below: §D6-01 Measurement Plan — the harness IS the first deliverable; researcher cannot produce p95 without building it. Methodology + contract shape prescribed.)*
- **D6-02 worst-case fixtures + throttle specifics** — *(Resolved below: corpus survey confirms essay-long-form as text worst-case; figure-heavy is NOT perf-relevant in tests [images stubbed]. Structural worst-case = list-reference/technical-post. Throttle mechanics: CPU/network throttle is chromium-only via CDP.)*
- **D6-04 perf spec location + CI wiring** — *(Resolved below: recommend `tests/e2e/perf/` + `npm run perf` mirroring `npm run calibrate` + fingerprint.compare.ts exit-code gate.)*
- **D6-06 SR checklist flow selection + announcement-authoring rule** — *(Resolved below: assert semantic role + accessible name, NOT verbatim phrasing; 6 core scripted flows enumerated.)*
- **D6-07 severity rubric details** — *(Resolved below: blocker/major/minor definitions provided.)*
- **D6-08 ACCEPTANCE-PROTOCOL.md location + structure** — *(Resolved below: recommend `docs/ACCEPTANCE-PROTOCOL.md` with versioned header + 4 sections.)*
- **D6-10 high-zoom spec mechanics** — *(Resolved below: setViewportSize({width:320}) IS the load-bearing reflow assertion cross-engine; document.body.style.zoom=4 is a secondary chromium/firefox126+ check. Playwright has NO native zoom API [VERIFIED].)*
- **D6-11 font-route interception specifics** — *(Resolved below: CRITICAL — Lem Reader loads NO web fonts; harness must INJECT a web font first, then page.route()-intercept the injected URL. Block/delay/swap mechanics prescribed.)*
- **D6-13 consolidated spec: extend vs sibling** — *(Resolved below: recommend a SIBLING `tests/e2e/acceptance/core-reading-flow.spec.ts`; keep open-every-fixture.spec.ts as the DOC-01 mount smoke.)*

### Deferred Ideas (OUT OF SCOPE)

- **JAWS manual SR coverage** → v1.x stretch (licensed/costly; NVDA + VoiceOver is the Phase 6 gate per D6-05).
- **Formal user-preference / comprehension / completion study** → post-v1 (Out of Scope, PROJECT.md).
- **Orientation aids, annotation recovery/repair, export/import, calm presets** (ORNT-01/02, RECV-01/02, PORT-01/02, PRES-01) → v2.
- **Live extraction / extension packaging** → Out of Scope.
- **Per-engine perf budgets** → if measurement shows meaningful engine spread, planner may propose per-engine thresholds; for MVP the budget is a single contract with the worst engine/profile setting the floor (D6-02 worst-case).

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **ACPT-01** | Reader can complete the core reading flow on the representative corpus in current Chromium, Firefox, and WebKit without content loss or blocked navigation. | §D6-13 resolution: a sibling `tests/e2e/acceptance/core-reading-flow.spec.ts` iterates the 6-fixture corpus × 3 engines asserting the full flow (open → read through → mode-switch → location-restore → create + navigate highlight). Reuses `fixtures-matrix.ts` FIXTURES + existing selectors (`[data-block-index]`, `getByRole`). |
| **ACPT-02** | Reader can complete documented keyboard-only and manual screen-reader acceptance flows in the selected support matrix. | §D6-06/D6-07/D6-08 resolutions: versioned `docs/ACCEPTANCE-PROTOCOL.md` with 6 scripted flows (assert role+name not verbatim) + exploratory charter; zero-blocker/major severity rubric; run matrix = NVDA+Firefox + VoiceOver+Safari (D6-05). Existing keyboard substrate: `panel-keyboard.spec.ts` (focus trap/restore), `section-announce.spec.ts` (A11Y-08), H/N/M shortcuts in ArticleView. |
| **ACPT-03** | Reader retains content and required functions under high zoom, narrow reflow, forced colors, reduced motion, touch, and late or failed font loading scenarios. | §D6-09 shared invariant + §D6-12 audit-and-add: audit `forced-colors.spec.ts`, `reduced-motion.spec.ts`, `reflow.spec.ts`, `touch-targets.spec.ts` against (a)/(b)/(c); add `high-zoom` (400% + 320px via setViewportSize) and `font-failure` (block/delay/swap via injected-font page.route interception). Font gate substrate: `useMeasurement.ts` + `engine.ts` + `__lemLastTrustedConstraints` DEV hook. |
| **ACPT-04** | Repagination meets explicit cold and warm performance budgets on the selected article and device profiles selected during implementation planning. | §D6-01 measurement plan + §D6-02 worst-case fixtures + §D6-04 CI wiring: `tests/e2e/perf/` spec + `npm run perf` mirroring `npm run calibrate` + `fingerprint.compare.ts` exit-code gate; budgets at measured p95 + headroom on essay-long-form (desktop + throttled-mobile chromium); fallback shares warm budget (D6-03); manual sign-off covers full device matrix. |

</phase_requirements>

## Summary

Phase 6 is the **acceptance gate** for the Lem Reader v1 prototype. The reading/annotation/pagination/measurement substrate is delivered and verified by Phases 1–5 (all DOC/READ/A11Y/PAGE/ANNO/STATE requirements Complete; 996 tests green across chromium/firefox/webkit per Plan 05-05). Phase 6 does not build features — it **consolidates existing proof into acceptance artifacts, closes two genuine coverage gaps (high-zoom + font-failure), locks the performance budgets that Phases 4–5 deferred, and runs the manual screen-reader protocol**. The research surfaced five prescriptive findings the planner lifts directly.

**Primary recommendation:** Reuse the existing substrate aggressively. The 6-fixture corpus, 3-engine Playwright matrix, `fixtures-matrix.ts`, calibration CI-gate pattern, measurement DEV hooks (`__lemLastTrustedConstraints`, `__lemDiagnosticBus`), and edge-condition specs are all in place — Phase 6's work is **consolidation + 2 gap specs + perf harness + manual protocol doc**, not new infrastructure.

**Five empirical findings that change the plan shape:**

1. **Playwright has NO native browser-zoom API** `[CITED: playwright.dev/docs/emulation]`. The 320 CSS px reflow target is driven directly by `page.setViewportSize({width:320})` (already used by `reflow.spec.ts`) — this is the load-bearing assertion. `document.body.style.zoom=4` is a secondary, engine-variable check (chromium yes, firefox 126+, webkit partial). `deviceScaleFactor` is DPR, NOT CSS zoom.

2. **Lem Reader loads NO web fonts** `[VERIFIED: src/settings/tokens.ts + src/app.css + index.html]`. All three FONT_STACKS are OS-installed cascades (serif=Iowan/Georgia/Charter, sans=system-ui/Segoe UI, dyslexic=Verdana/Tahoma). There is no font URL to intercept. The D6-11 font-failure harness must **INJECT a web font first** (`page.addStyleTag` with `@font-face` at a controllable URL), then `page.route()`-intercept the injected URL. This is the only way to exercise the `document.fonts.ready` gate (D3-06), last-valid-view (PAGE-06), and stale-drop (PAGE-07) against a real pending font load.

3. **figure-heavy is NOT the perf worst case in tests.** The corpus survey (normalized text chars) ranks: essay-long-form (2994, heaviest text) > footnote-academic (2601) > list-reference (2456, heaviest recursive structure) > unsupported-case (1908) > technical-post (1691) > figure-heavy (1475, SMALLEST). figure-heavy's figures are stubbed to 1×1 SVG in every existing test (`page.route` image stub), so its measurement cost is trivial. **Recommend essay-long-form (text worst case) + list-reference or technical-post (structural worst case) as the D6-02 perf targets** — not figure-heavy.

4. **CPU/network throttling is chromium-only** in Playwright (CDP `Emulation.setCPUThrottlingRate` / `Network.emulateNetworkConditions`) `[ASSUMED — training knowledge; planner should verify]`. Firefox/WebKit have no native throttle. The D6-02 throttled-mobile profile is effectively chromium-gated for faithful simulation; the manual sign-off (D6-04) covers firefox/webkit on the full matrix.

5. **The measurement DEV hooks already exist** for perf instrumentation: `__lemLastTrustedConstraints` (written on every trusted commit in `useMeasurement.ts` L132-136), `__lemDiagnosticBus` (L155-158), and the calibration harness's per-engine temp-file + Node-merge pattern. The perf spec mirrors this exactly — no new instrumentation surface is needed in `ArticleView.tsx` or `engine.ts`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cross-engine acceptance (ACPT-01) | Test tier (Playwright e2e) | — | Real-browser layout/selection/focus truth is the STACK.md mandate; no DOM emulator is authoritative. The consolidated spec iterates the existing 3-engine matrix. |
| Keyboard/SR acceptance (ACPT-02) | Test tier (automated) + Manual tier (protocol doc) | — | Automated: `panel-keyboard.spec.ts`, `section-announce.spec.ts` already prove the keyboard substrate. Manual: NVDA+Firefox + VoiceOver+Safari per D6-05 — axe cannot catch SR-flow gaps (STACK.md). |
| Edge-condition acceptance (ACPT-03) | Test tier (Playwright e2e) | Browser media emulation | `page.emulateMedia({forcedColors, reducedMotion})` + `setViewportSize` are the cross-engine primitives. Font-failure requires harness-level font injection + route interception (test tier owns the injection). |
| Performance budgeting (ACPT-04) | Test tier (Playwright perf spec) + CI gate + Manual sign-off | — | Perf spec mirrors calibration CI gate (regression fails build). CI covers desktop profile; manual sign-off covers throttled-mobile (chromium-only throttle) + full device matrix. |
| Budget contract definition | Manual tier (measure → propose → approve) | — | D6-01 locks the CONTRACT (cold + warm wall-clock, fallback shares warm); the NUMBERS come from the executor running the harness, then user approves. Researcher cannot produce p95 without the harness (circular). |
| Versioned protocol artifact | Repo docs (`docs/ACCEPTANCE-PROTOCOL.md`) | — | D6-08: durable, re-runnable, versioned. Single canonical artifact future releases re-run. |

## Standard Stack

Phase 6 installs **NO new packages**. It reuses the locked STACK.md dependencies already in `package.json`.

### Core (already installed — DO NOT add alternatives)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@playwright/test` | 1.61.1 | All acceptance specs (ACPT-01/03/04) + perf harness + 3-engine matrix | STACK.md locks Playwright in chromium/firefox/webkit for layout/a11y/perf truth `[VERIFIED: package.json]`. |
| `@axe-core/playwright` | 4.12.1 | Automated WCAG 2.2 AA violation scan (existing `a11y.spec.ts`) | STACK.md: "Axe reports only automatable issues; retain manual keyboard and screen-reader checks." `[VERIFIED: package.json]` — authority for the manual protocol. |

### Browser primitives (prefer over dependencies — STACK.md mandate)
| Primitive | Purpose | Verified usage |
|-----------|---------|----------------|
| `page.setViewportSize({width, height})` | 320 CSS px reflow target (ACPT-03) | `[CITED: playwright.dev/docs/emulation]` — sets viewport CSS px directly. Already used by `reflow.spec.ts`. |
| `page.emulateMedia({forcedColors, reducedMotion, contrast, colorScheme})` | Media-feature emulation (ACPT-03) | `[CITED: playwright.dev/docs/emulation]` — already used by `forced-colors.spec.ts`, `reduced-motion.spec.ts`. |
| `page.route(url, handler)` / `context.route()` | Font-failure interception (D6-11) | `[CITED: playwright.dev/docs/network]` — `route.abort()` (block), `route.continue()` with delay (delay), `route.fulfill()` (swap). Already used by every spec for image stubbing. |
| `route.abort()` / `route.fulfill()` / `route.continue()` / `route.fetch()` | Font block / custom-response / modify / fetch-then-modify | `[CITED: playwright.dev/docs/network]` |
| `page.addStyleTag({content})` | Inject `@font-face` for font-failure harness | `[CITED: playwright.dev/docs/api/class-page]` — how the harness creates a real pending font load to intercept. |
| `document.fonts.ready` / `FontFaceSet.ready` | Font gate (D3-06 substrate) | `[VERIFIED: src/measurement/fontGate.ts]` — already awaited in engine.run() and calibration harness. |
| `context.newCDPSession(page)` → `Emulation.setCPUThrottlingRate` | CPU throttle (D6-02, chromium-only) | `[ASSUMED]` — CDP, chromium-only. Planner must verify API availability in Playwright 1.61.1. |
| `process.exit(1)` from Node compare script | CI regression gate (D6-04) | `[VERIFIED: tests/e2e/calibration/fingerprint.compare.ts L269]` — the precedent the perf gate mirrors. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `setViewportSize({width:320})` for reflow | `document.body.style.zoom=4` | Zoom varies by engine (chromium yes, firefox 126+, webkit partial); setViewportSize is the cross-engine load-bearing assertion. STACK.md prefers platform primitives. |
| Injected `@font-face` + page.route for font-failure | Real Google Fonts `<link>` | Google Fonts adds network flakiness; a self-served/inlined woff2 via `addStyleTag` is deterministic. Both require injection because the app loads no web fonts. |
| CDP CPU throttle (chromium-only) | `slowMo` (cross-engine) | slowMo adds artificial action delay, not CPU slowdown — does not faithfully simulate low-end-device repagination. Use CDP on chromium for the faithful sim; manual sign-off covers firefox/webkit. |

**Installation:** None required. All dependencies already in `package.json`.

**Version verification:**
```bash
npx playwright --version   # → Version 1.61.1 [VERIFIED this session]
node --version             # → v22.22.3 [VERIFIED this session]
```

## Package Legitimacy Audit

> **No new packages installed by this phase.** Phase 6 reuses the locked STACK.md dependencies.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@playwright/test` | npm | existing | existing | github.com/microsoft/playwright | OK (prior phases) | Approved — no change |
| `@axe-core/playwright` | npm | existing | existing | github.com/dequelabs/axe-core | OK (prior phases) | Approved — no change |

**Packages removed due to [SLOP] verdict:** none (no new packages introduced).
**Packages flagged as suspicious [SUS]:** none.

*Phase 6 adds no external dependencies. All acceptance infrastructure is built on Playwright APIs already in the dependency tree. If the planner proposes any new package (e.g., a perf-measurement helper), it MUST run the Package Legitimacy Gate before committing.*

## Architecture Patterns

### System Architecture Diagram

The acceptance gate flows from four evidence sources into `06-VERIFICATION.md`:

```
                      ┌─────────────────────────────────────────────┐
                      │         06-VERIFICATION.md (evidence)        │
                      │  ACPT-01..04 results recorded + sign-off     │
                      └──────────────────────┬──────────────────────┘
                                             │
           ┌─────────────────┬───────────────┼───────────────┬─────────────────┐
           │                 │               │               │                 │
   (1) Automated       (2) Edge gap      (3) Perf CI   (4) Manual protocol
       corpus flow         closure           gate             run
           │                 │               │               │                 │
           ▼                 ▼               ▼               ▼                 ▼
  core-reading-      high-zoom.spec    tests/e2e/perf/   ACCEPTANCE-      NVDA+Firefox
  flow.spec.ts ×     font-failure.spec  + npm run perf   PROTOCOL.md      VoiceOver+Safari
  6 fixtures ×       + audited edge      + fingerprint    (scripted +     (D6-05 matrix)
  3 engines          specs vs invariant  .compare.ts       exploratory)
  (ACPT-01)          (ACPT-03)           exit 1 gate      (D6-06/D6-08)    (ACPT-02)
           │                 │               │                                 │
           ▼                 ▼               ▼                                 ▼
  REUSES:             REUSES:           REUSES:                           REUSES:
  fixtures-matrix.ts  emulateMedia      calibration CI gate               ArticleView
  open-every-fixture  setViewportSize   fingerprint.compare.ts            keyboard substrate
  [data-block-index]  page.route()      __lemLastTrustedConstraints       panel-keyboard.spec
                                         __lemDiagnosticBus               section-announce.spec
                                                                                H/N/M shortcuts
                                             │
                                             ▼
                                      MEASURE FIRST (D6-01)
                                      → propose p95 + headroom
                                      → USER APPROVES
                                      → lock budget.json
                                      → CI gate enforces
```

### Recommended Project Structure

```
tests/e2e/
├── acceptance/                      # NEW (ACPT-01 + D6-13)
│   └── core-reading-flow.spec.ts    # consolidated 6-fixture × 3-engine flow
├── perf/                            # NEW (ACPT-04 + D6-04)
│   ├── perf.harness.spec.ts         # measures cold/warm repagination per fixture/profile
│   ├── budget.json                  # committed budget contract (after user approval)
│   └── budget.compare.ts            # exit-1-on-regression Node gate (mirrors fingerprint.compare.ts)
├── high-zoom.spec.ts                # NEW (ACPT-03 + D6-10) — 400% + 320px invariant
├── font-failure.spec.ts             # NEW (ACPT-03 + D6-11) — inject font, block/delay/swap
├── forced-colors.spec.ts            # AUDITED (D6-12) — strengthen to shared invariant
├── reduced-motion.spec.ts           # AUDITED (D6-12) — strengthen to shared invariant
├── reflow.spec.ts                   # AUDITED (D6-12) — strengthen to shared invariant
├── touch-targets.spec.ts            # AUDITED (D6-12) — strengthen to shared invariant
├── pagination/fixtures-matrix.ts    # REUSED (corpus × viewport × typography)
├── calibration/                     # REUSED (the CI-gate precedent)
│   ├── calibration.harness.spec.ts
│   └── fingerprint.compare.ts
└── measurement/                     # REUSED (the font-timing surface)
    ├── last-valid-view.spec.ts
    └── stale-drop.spec.ts

docs/                                # NEW (D6-08)
└── ACCEPTANCE-PROTOCOL.md           # versioned manual protocol artifact

.planning/phases/06-prototype-acceptance/
└── 06-VERIFICATION.md               # records ACPT-01..04 results + budget sign-off

playwright.config.ts                 # EXTENDED — add throttled-mobile project (chromium-only throttle)
package.json                         # EXTENDED — add "perf" script mirroring "calibrate"
```

### Pattern 1: CI-gate-on-regression (mirror calibration) — D6-04
**What:** A Playwright spec writes per-engine timing data to temp files; a Node compare script merges, diffs against a committed budget, and `process.exit(1)` on regression.
**When to use:** ACPT-04 perf gate. Directly mirrors Phase 3's calibration CI gate.
**Example (the precedent):**
```typescript
// tests/e2e/calibration/fingerprint.compare.ts L197-276 — the structural template
// 1. Spec writes per-engine JSON to .calibration-tmp/<engine>.json (afterAll)
// 2. Node script: node tests/e2e/calibration/fingerprint.compare.ts
//    - loadTempResults() → if empty, exit 2 (refuse to overwrite with placeholder)
//    - aggregate → build fresh fingerprint
//    - writeFileSync(fingerprint.json) (regenerate committed artifact)
//    - diff fresh vs committed → regressions.length > 0 → process.exit(1)
//
// Perf gate mirrors this EXACTLY:
//   npm run perf  →  playwright test perf.harness && node tests/e2e/perf/budget.compare.ts
// budget.compare.ts exits 1 if any measured p95 exceeds the committed budget by > tolerance.
```
`[VERIFIED: tests/e2e/calibration/fingerprint.compare.ts — read in full this session]`

### Pattern 2: Shared edge-condition invariant — D6-09/D6-12
**What:** One assertion block applied to EVERY edge condition: (a) full content reachable via keyboard in BOTH modes; (b) no required function unreachable; (c) no layout overflow.
**When to use:** Every ACPT-03 edge spec (existing + new).
**Example:**
```typescript
// tests/e2e/high-zoom.spec.ts (NEW) — the shared invariant as a reusable helper
async function assertEdgeInvariant(page: Page, fixture: string, condition: string) {
  // (a) full content reachable via keyboard in BOTH modes
  //     — Tab through the article, collect text content; assert it matches
  //       the fixture's normalized text (every block represented)
  //     — Toggle mode (M), assert content still present
  // (b) required functions reachable: open settings (gear), toggle mode (M),
  //     H to highlight (needs selection), N for note, drawer trigger
  // (c) no overflow: body.scrollWidth <= clientWidth + 1 (mirror reflow.spec.ts L40-49)
  const overflow = await page.evaluate(() => ({
    scrollW: document.body.scrollWidth,
    clientW: document.body.clientWidth,
  }));
  expect(overflow.scrollW, `${condition}: horizontal overflow`).toBeLessThanOrEqual(
    overflow.clientW + 1,
  );
  // ... (a) and (b) assertions
}
// Apply to high-zoom: setViewportSize({width:320,height:800}) + document.body.style.zoom=4
// Apply to font-failure: inject @font-face + page.route block/delay/swap
```

### Pattern 3: SR announcement assertion — role+name, not verbatim — D6-06/D6-07
**What:** Assert the semantic role + accessible name of an element, NOT the verbatim SR announcement (which varies across SR versions/settings).
**When to use:** Manual protocol checklist expected-outcome authoring.
**Example:**
```markdown
# GOOD (assert role + name — survives SR-version variance):
Step: Open settings
Expected: focus moves to a control with role="dialog" and accessible name "Reading settings"
         (panel-keyboard.spec.ts already asserts this automated-ly)

# BAD (over-fits to one SR version's phrasing):
Step: Open settings
Expected: NVDA says "Reading settings, dialog, focused"
         (NVDA 2024 vs 2025 may phrase differently; VoiceOver uses different conventions)
```
`[VERIFIED: panel-keyboard.spec.ts L38-46 asserts dlg.contains(activeElement) — role/structure, not phrasing]`

### Anti-Patterns to Avoid
- **Asserting verbatim SR output.** SR phrasing varies across versions, settings, and engines. Assert role + accessible name (programmatically verifiable), record phrasing as informational. D6-07 zero-blocker policy exists precisely because verbatim output is not stable.
- **Using a DOM emulator (jsdom/happy-dom) for any ACPT-03/04 assertion.** STACK.md forbids it; they do not implement authoritative layout, font metrics, zoom, or selection. The measurement/pagination/zoom/reflow/font specs MUST run in real browsers. (The repo's unit suite uses jsdom for logic only — never for layout truth.)
- **Guessing the perf budget instead of measuring.** D6-01 explicitly locks measure-first. Setting a threshold the engine cannot hit (or one so loose it's meaningless) is the failure mode. The harness IS the first deliverable.
- **Treating figure-heavy as the perf worst case.** Its figures are stubbed to 1×1 SVG in tests; its normalized text (1475 chars) is the SMALLEST in the corpus. Use essay-long-form (text) + list-reference/technical-post (structure).
- **Intercepting a font URL that doesn't exist.** Lem Reader loads no web fonts. The harness must inject one first. Calling `page.route('**/*.woff2')` on the unmodified app intercepts nothing.
- **Splitting the budget into per-fixture or per-engine thresholds for MVP.** D6-02 locks worst-case-at-two-profiles. Per-engine budgets are deferred unless measurement shows meaningful spread.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Perf CI gate | Custom regression-detection logic | Mirror `fingerprint.compare.ts` exit-code pattern exactly | Phase 3 already proved the per-engine-temp-file + Node-merge + exit-1-on-regression shape. Forking it adds risk for no gain. |
| Corpus × engine × viewport enumeration | Re-derive fixture lists | `fixtures-matrix.ts` FIXTURES + VIEWPORTS + SAMPLED_TYPOGRAPHY + CORPUS_MATRIX | Already verified against `src/fixtures/index.ts`; forking risks drift. |
| Font-failure simulation | Mock `document.fonts` JS API | Inject a real `@font-face` + `page.route()` interception | Mocking the JS API doesn't exercise the real browser font-load pipeline that D3-06/PAGE-06/PAGE-07 depend on. Real pending font load is the only faithful test. |
| High-zoom emulation | `deviceScaleFactor` (that's DPR) | `setViewportSize({width:320})` for reflow + `document.body.style.zoom` for zoom-level | deviceScaleFactor does NOT trigger reflow; it changes pixel density. `[CITED: playwright.dev/docs/emulation]` |
| Throttled mobile (firefox/webkit) | Custom throttle wrapper | CDP on chromium + manual sign-off for firefox/webkit | Playwright has no cross-engine CPU/network throttle. Pretending otherwise produces false confidence. |
| SR-output capture in automated tests | Build a VoiceOver/NVDA automation harness | Manual protocol (D6-06) — scripted checklist + exploratory charter | Automating SR output is brittle, version-coupled, and beyond MVP scope. The manual protocol is the pragmatic, honest approach (D6-05). |
| Measurement instrumentation in ArticleView | Add timing probes to production code | Read `__lemLastTrustedConstraints` + DiagnosticBus (DEV hooks already present) | The hooks exist for exactly this. Adding production timing code violates D3-04 (invisible by default) and adds a maintenance surface. |

**Key insight:** Phase 6's discipline is **subtractive** — prove the substrate holds under acceptance conditions using the infrastructure Phases 3–5 already built. The two NEW specs (high-zoom, font-failure) and the perf harness are the only net-new test code; everything else is audit-in-place + a manual protocol doc.

## Common Pitfalls

### Pitfall 1: No font URL to intercept (D6-11)
**What goes wrong:** `page.route('**/*.woff2', ...)` silently matches nothing; the font-failure test passes vacuously without exercising the font gate.
**Why it happens:** Lem Reader loads zero web fonts. All FONT_STACKS are OS-installed cascades. `document.fonts.ready` resolves immediately.
**How to avoid:** The harness MUST inject a web font first: `await page.addStyleTag({ content: '@font-face { font-family: "TestFont"; src: url("/test-font.woff2") format("woff2"); }' })` (or a `<link>` to a controllable URL), THEN `page.route('**/test-font.woff2', handler)`. Apply the injected font to the article body so it becomes part of the active font set, making `document.fonts.ready` genuinely pending.
**Warning signs:** The "block" mode test passes but `document.fonts.ready` resolved instantly (no pending load). Verify the font is actually requested via `page.on('request')`.

### Pitfall 2: deviceScaleFactor mistaken for zoom (D6-10)
**What goes wrong:** Tester sets `deviceScaleFactor: 4` expecting 400% zoom; the reflow path is never exercised because layout didn't change.
**Why it happens:** `deviceScaleFactor` is DPR (pixel density), not CSS zoom. `[CITED: playwright.dev/docs/emulation]`
**How to avoid:** Use `page.setViewportSize({width: 320, height: 800})` for the reflow target (this IS the WCAG 1.4.10 320px condition and forces single-column reflow). Add `document.body.style.zoom = 4` as a secondary zoom-level check where supported.
**Warning signs:** The test passes at `deviceScaleFactor: 4` but the article still renders multi-column (no reflow occurred).

### Pitfall 3: CSS zoom engine variance (D6-10)
**What goes wrong:** `document.body.style.zoom = 4` produces different layout behavior on chromium vs firefox vs webkit; the test flakes or gives false confidence.
**Why it happens:** CSS `zoom` is non-standard historically; chromium always supported it, firefox added support in v126 (2024), webkit/safari support varies.
**How to avoid:** Treat the 320px `setViewportSize` assertion as load-bearing (cross-engine). Treat the `zoom: 4` assertion as engine-aware (skip on engines where it's unsupported, or assert only that no content is LOST, not exact layout). Document the variance in the spec comment.
**Warning signs:** Test passes on chromium, fails on firefox/webkit with layout diffs.

### Pitfall 4: Perf budget set before measuring (D6-01)
**What goes wrong:** The budget is too tight (engine can't hit it → CI always fails → team ignores the gate) or too loose (regressions slip through).
**Why it happens:** Guessing at targets rather than grounding them in observed p95.
**How to avoid:** Follow D6-01 strictly: build the harness → run it on the worst-case fixtures × 2 profiles × 3 engines → compute p95 → propose budget at p95 + headroom → USER APPROVES → commit `budget.json`. The harness is Wave 1; the budget commit is a later checkpoint.
**Warning signs:** A budget proposed in the PLAN before the harness has run.

### Pitfall 5: Throttled-mobile claimed cross-engine (D6-02)
**What goes wrong:** The perf spec declares a throttled-mobile project for chromium/firefox/webkit, but firefox/webkit silently ignore the throttle (no native support), producing misleadingly-fast numbers.
**Why it happens:** CDP `Emulation.setCPUThrottlingRate` is chromium-only. `[ASSUMED — verify]`
**How to avoid:** Gate the throttled-mobile project to chromium (chromium is the faithful sim). Cover firefox/webkit via the manual sign-off (D6-04) on real low-end hardware OR document that the throttled profile is chromium-only and the warm budget applies unthrottled on firefox/webkit.
**Warning signs:** The throttled-mobile firefox/webkit timings are identical to the desktop timings.

### Pitfall 6: ACPT-01 spec duplicates existing per-feature specs
**What goes wrong:** The consolidated spec re-implements mode-switch, location-restore, and highlight-creation logic that already lives in pagination/annotations specs, creating a maintenance burden and divergent assertions.
**Why it happens:** Temptation to make the acceptance spec "comprehensive."
**How to avoid:** The consolidated spec asserts the END-TO-END FLOW as one contract (open → read → switch → restore → highlight + navigate) using the EXISTING selectors and helpers. It does not re-prove PAGE-01/ANNO-01/etc. in isolation — those specs stay authoritative. The consolidated spec is the "reader can complete the whole loop" acceptance lens. `[VERIFIED: open-every-fixture.spec.ts pattern — iterates fixtures, uses getByRole]`

### Pitfall 7: Verbatim SR-output assertion flakes (D6-06/D6-07)
**What goes wrong:** The manual protocol's expected announcements are written as exact NVDA/VoiceOver phrasing; a SR update changes the phrasing and the protocol "fails" on cosmetic variance.
**Why it happens:** SR output is not stable across versions/voices/settings.
**How to avoid:** Author expected outcomes as "role + accessible name + state" (programmatically verifiable) and "informational expected phrasing" (a guide, not a gate). D6-07 zero-blocker policy: minor phrasing differences are RECORDED, not blocking.
**Warning signs:** A protocol step whose only failure mode is "SR said X instead of Y" with no functional impact.

## Code Examples

Verified patterns from the actual codebase + official Playwright docs.

### D6-11: Inject a web font, then intercept it (the font-failure harness)
```typescript
// tests/e2e/font-failure.spec.ts (NEW)
// Source: pattern derived from playwright.dev/docs/network + src/measurement/useMeasurement.ts
// CRITICAL: Lem Reader loads no web fonts — the harness MUST inject one.
import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5173";
const FIXTURE = "essay-long-form";
const FONT_URL = "**/test-injected-font.woff2";

async function injectTestFont(page: import("@playwright/test").Page): Promise<void> {
  // Inject an @font-face so document.fonts.ready becomes genuinely pending.
  // Apply it to the article body so the font is part of the active set.
  await page.addStyleTag({
    content: `
      @font-face {
        font-family: "TestInjectedFont";
        src: url("/test-injected-font.woff2") format("woff2");
      }
      .article-body, .page-fragment { font-family: "TestInjectedFont", var(--font-body); }
    `,
  });
}

test.describe("ACPT-03 font-failure (D6-11)", () => {
  test("BLOCK: font request aborted → content stays readable, last-valid-view retained", async ({ page }) => {
    // (a) BLOCK the injected font
    await page.route(FONT_URL, (route) => route.abort());
    await page.goto(`${BASE}/#/article/${FIXTURE}`);
    await injectTestFont(page);
    // Assert: h1 + first paragraph visible (last-valid-view — no blank flash)
    // Assert: document.fonts.ready still resolves (blocked font → fallback)
    // Assert: shared edge invariant (D6-09)
  });

  test("DELAY: font delayed → provisional view untrusted until fonts.ready, then re-commits", async ({ page }) => {
    // (b) DELAY the font by 1500ms
    await page.route(FONT_URL, async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await page.goto(`${BASE}/#/article/${FIXTURE}`);
    await injectTestFont(page);
    // Assert: content visible during the delay (last-valid-view)
    // Assert: after delay, __lemLastTrustedConstraints updates (re-commit)
  });

  test("SWAP: font swap mid-read → stale-epoch guard drops stale result", async ({ page }) => {
    // (c) Fulfill with font A, then re-route to font B mid-read
    // Assert: stale-drop (PAGE-07) — only the newer result commits
    // Reuses the stale-drop.spec.ts harness pattern + __lemLastTrustedConstraints hook
  });
});
```
`[VERIFIED: page.route/abort/continue/fulfill API at playwright.dev/docs/network; __lemLastTrustedConstraints hook at src/measurement/useMeasurement.ts L132-136]`

### D6-04: The perf CI gate (mirror fingerprint.compare.ts)
```typescript
// tests/e2e/perf/budget.compare.ts (NEW) — mirrors fingerprint.compare.ts L197-276
// Source: tests/e2e/calibration/fingerprint.compare.ts (read in full this session)
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = process.cwd();
const BUDGET_PATH = resolve(REPO_ROOT, "tests/e2e/perf/budget.json");
const TMP_DIR = resolve(REPO_ROOT, ".perf-tmp");

interface PerfSample {
  fixture: string; profile: "desktop" | "throttled-mobile"; engine: string;
  phase: "cold" | "warm"; wallClockMs: number;
}

function main(): void {
  // 1. Load per-engine temp results (mirrors loadTempResults)
  const samples = loadTempResults();
  if (samples.length === 0) {
    console.error("[perf] no results — refusing to overwrite budget.json");
    process.exit(2); // mirror fingerprint.compare.ts empty-input guard
  }
  // 2. Compute p95 per (fixture, profile, engine, phase)
  const p95 = computeP95(samples);
  // 3. Diff against committed budget
  const budget = loadBudget();
  const regressions = budget
    ? findRegressions(p95, budget)
    : [];
  // 4. Regenerate budget.json with fresh measurements (after approval flow)
  // 5. Gate
  if (regressions.length > 0) {
    console.error("[perf] REGRESSION — p95 exceeded budget:");
    for (const r of regressions) console.error(`  ${r}`);
    process.exit(1); // THE CI GATE
  }
  console.log("[perf] gate PASSED");
  process.exit(0);
}
main();
```
```json
// package.json (EXTENDED) — mirror the calibrate script
{
  "scripts": {
    "perf": "playwright test perf.harness && node tests/e2e/perf/budget.compare.ts"
  }
}
```
`[VERIFIED: package.json L14 calibrate script + fingerprint.compare.ts exit-code pattern]`

### D6-09: The shared edge invariant (reusable helper)
```typescript
// tests/e2e/_edge-invariant.ts (NEW helper) — the D6-09 contract as code
// Source: D6-09 in 06-CONTEXT.md + reflow.spec.ts overflow check
import { expect, type Page } from "@playwright/test";

export async function assertSharedEdgeInvariant(
  page: Page,
  fixture: string,
  condition: string,
): Promise<void> {
  // (c) No layout overflow clips or overlaps content
  const overflow = await page.evaluate(() => ({
    body: { scrollW: document.body.scrollWidth, clientW: document.body.clientWidth },
  }));
  expect(
    overflow.body.scrollW,
    `${condition} ${fixture}: horizontal overflow (reflow broken)`,
  ).toBeLessThanOrEqual(overflow.body.clientW + 1);

  // (a) Full content reachable via keyboard — Tab through, verify article present
  const article = page.getByRole("article");
  await expect(article).toBeVisible();
  // (Verify every [data-block-index] block is represented in the rendered DOM)
  const blockCount = await page.locator("[data-block-index]").count();
  expect(blockCount, `${condition} ${fixture}: blocks missing`).toBeGreaterThan(0);

  // (b) Required functions reachable: gear (settings), mode toggle, H/N (annotation)
  await expect(page.getByRole("button", { name: "Reading settings" })).toBeVisible();
  // (Mode toggle + H/N verified via keyboard interaction in the consolidated spec)
}
```
`[VERIFIED: reflow.spec.ts L40-49 overflow pattern + [data-block-index] selector in ArticleView.tsx L121]`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CSS `zoom` (non-standard) | Firefox added `zoom` support in v126 | 2024 | `document.body.style.zoom` is now usable across chromium + firefox; webkit support varies. Still NOT the load-bearing reflow mechanism (setViewportSize is). |
| Per-SR-automation harnesses | Manual protocol + automated role/name checks | Ongoing | Automating NVDA/VoiceOver is brittle and version-coupled; the manual protocol (D6-06) is the pragmatic standard for MVP-scale acceptance. |
| DOM-emulator-based layout tests | Real-browser Playwright (chromium/firefox/webkit) | STACK.md (Phase 0) | Lem Reader mandates Playwright for ALL layout/a11y/perf truth; jsdom/happy-dom only for pure logic. |

**Deprecated/outdated:**
- **`deviceScaleFactor` as a zoom proxy:** It is DPR, not CSS zoom. Does not trigger reflow.
- **`page.emulateMedia({ media: 'screen' })` for zoom:** Media type is unrelated to zoom level.

## Assumptions Log

> Claims tagged `[ASSUMED]` — planner/discuss-phase should confirm before locking.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | CDP `Emulation.setCPUThrottlingRate` (chromium-only) is the Playwright CPU-throttle mechanism; firefox/webkit have no native CPU throttle. | Standard Stack; D6-02; Pitfall 5 | If wrong (cross-engine throttle exists), the throttled-mobile project can run on all 3 engines. Planner should verify by checking Playwright 1.61.1 changelog/CDP session docs. |
| A2 | `document.body.style.zoom = 4` is supported in chromium + firefox 126+ but partial/variable in webkit. | D6-10; Pitfall 3 | If webkit supports it cleanly, the zoom assertion can be cross-engine. If not, keep it chromium/firefox-secondary. |
| A3 | The two NEW specs (high-zoom, font-failure) plus audited existing specs are sufficient to cover ACPT-03's six conditions. | Validation Architecture | If an existing spec's audit reveals it cannot be strengthened to the shared invariant in-place, a replacement spec may be needed. |
| A4 | NVDA+Firefox + VoiceOver+Safari (D6-05) is runnable on the developer's hardware (macOS for VoiceOver; Windows VM or partition for NVDA). | Environment Availability | If NVDA cannot be run, the ACPT-02 manual matrix is blocked. Planner should confirm hardware availability before the manual-protocol task. |
| A5 | The perf harness can measure cold + warm repagination distinctly by instrumenting `__lemLastTrustedConstraints` writes (cold = first write; warm = subsequent). | D6-01 Measurement Plan | If the hook doesn't expose enough signal, a richer instrumentation point (or a new DEV hook) may be needed. The hook is already written on every trusted commit, so this is low-risk. |

## Open Questions

1. **Exact CPU slowdown factor + network condition for the throttled-mobile profile (D6-02)**
   - What we know: It's chromium-only via CDP; the profile simulates a low-end device for the accessibility-first audience.
   - What's unclear: 4× vs 6× CPU slowdown; Slow 3G vs Regular 3G network. These are empirical — the executor should pick values that meaningfully stress the worst-case fixtures without making the harness flaky.
   - Recommendation: Start with 4× CPU + Slow 3G (the Chrome DevTools default "Low-end mobile" preset). Document the choice in `budget.json` rationale. Adjust if measurements are indistinguishable from desktop.

2. **Whether the ACPT-01 consolidated spec should run the FULL CORPUS_MATRIX (54 cells × 3 engines) or a sampled subset**
   - What we know: D6-13 locks "6-fixture corpus × 3 engines." The full matrix × typography exists but is 54 cells × 3 engines = 162 runs.
   - What's unclear: Whether the core-reading-flow needs all typography variants or one representative typography.
   - Recommendation: One representative typography (D-07 default serif/18/64/comfortable) × 6 fixtures × 3 engines = 18 runs for the consolidated FLOW spec. Typography-stress is already covered by the PAGE-03 corpus matrix. Keeps the acceptance spec fast and focused on the flow.

3. **Severity rubric boundary cases (D6-07)**
   - What we know: blocker/major/minor framework; zero-blocker/major = pass.
   - What's unclear: Where a confusing-but-completable SR announcement falls (major vs minor).
   - Recommendation: Default to minor unless the reader cannot complete the step or loses content/function (then major/blocker). Record the rationale per finding. The exploratory charter catches the subjective cases the rubric can't pre-classify.

## Environment Availability

> Phase 6 depends on external tools/runtimes/services beyond the project's own code.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All test commands | ✓ | v22.22.3 `[VERIFIED this session]` | — |
| npm | Script runner | ✓ | 10.9.8 `[VERIFIED this session]` | — |
| Playwright | All e2e/perf specs | ✓ | 1.61.1 `[VERIFIED this session]` | — |
| Chromium (Playwright bundled) | ACPT-01/03/04 specs | ✓ | via Playwright | — |
| Firefox (Playwright bundled) | ACPT-01/03 specs | ✓ | via Playwright | — |
| WebKit (Playwright bundled) | ACPT-01/03 specs | ✓ | via Playwright | — |
| CDP session (chromium) | D6-02 CPU/network throttle | ✓ | via Playwright chromium | firefox/webkit: manual sign-off (D6-04) |
| NVDA (Windows) | ACPT-02 manual matrix | `[ASSUMED]` — needs Windows VM/partition | — | If unavailable: record as coverage boundary; VoiceOver+Safari alone is a reduced-but-defensible gate |
| VoiceOver (macOS) | ACPT-02 manual matrix | ✓ (macOS built-in) | — | — |
| Firefox browser (for NVDA) | ACPT-02 manual matrix | `[ASSUMED]` — needs install on Windows | — | — |
| Safari browser (for VoiceOver) | ACPT-02 manual matrix | ✓ (macOS built-in) | — | — |

**Missing dependencies with no fallback:**
- None that block the automated suite. All Playwright engines + Node are present.

**Missing dependencies with fallback:**
- **NVDA + Windows** (ACPT-02): If the developer cannot run NVDA on Windows, the manual SR matrix reduces to VoiceOver+Safari only. This is a REDUCED gate (one SR ecosystem instead of two) and must be recorded as a known coverage boundary in `06-VERIFICATION.md`. The planner should add a `checkpoint:human-verify` before the manual-protocol task to confirm NVDA access. `[ASSUMED]`

## Validation Architecture

> `workflow.nyquist_validation: true` in `.planning/config.json`. This section defines the acceptance test suite's sampling + coverage + backstops. The planner lifts covered edges + backstops into PLAN must_haves.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright 1.61.1 (e2e/acceptance/perf) + Vitest 4.1.10 (unit) |
| Config file | `playwright.config.ts` (3-engine matrix; will extend with throttled-mobile project) |
| Quick run command | `npm run test:e2e -- --grep acceptance` (acceptance specs only) |
| Full suite command | `npm run test` (unit + e2e, all 3 engines — the Plan 04-11/05-05 precedent) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ACPT-01 | Core reading flow across corpus × 3 engines, no content loss | e2e (acceptance) | `npm run test:e2e -- --grep "core-reading-flow"` | ❌ Wave 1 (NEW) |
| ACPT-02 | Keyboard-only flows (automated substrate) | e2e (existing) | `npm run test:e2e -- --grep "panel-keyboard\|section-announce"` | ✅ (audit) |
| ACPT-02 | Manual SR flows (NVDA+Firefox, VoiceOver+Safari) | manual-only | Per `docs/ACCEPTANCE-PROTOCOL.md` | ❌ Wave 1 (NEW doc) |
| ACPT-03 | High zoom (400%) + 320px reflow, shared invariant | e2e (edge) | `npm run test:e2e -- --grep "high-zoom"` | ❌ Wave 1 (NEW) |
| ACPT-03 | Font-failure (block/delay/swap), shared invariant | e2e (edge) | `npm run test:e2e -- --grep "font-failure"` | ❌ Wave 1 (NEW) |
| ACPT-03 | Forced colors, shared invariant | e2e (existing→audit) | `npm run test:e2e -- --grep "forced-colors"` | ✅ (audit D6-12) |
| ACPT-03 | Reduced motion, shared invariant | e2e (existing→audit) | `npm run test:e2e -- --grep "reduced-motion"` | ✅ (audit D6-12) |
| ACPT-03 | Reflow @ 320px, shared invariant | e2e (existing→audit) | `npm run test:e2e -- --grep "reflow"` | ✅ (audit D6-12) |
| ACPT-03 | Touch targets ≥ 44×44, shared invariant | e2e (existing→audit) | `npm run test:e2e -- --grep "touch-targets"` | ✅ (audit D6-12) |
| ACPT-04 | Cold/warm perf within budget (desktop) | e2e (perf) + CI gate | `npm run perf` | ❌ Wave 1 (NEW harness + gate) |
| ACPT-04 | Perf on throttled-mobile (chromium) | e2e (perf) | `npm run perf -- --project=chromium-throttled-mobile` | ❌ Wave 1 (NEW) |
| ACPT-04 | Perf on full device matrix (incl. firefox/webkit mobile) | manual-only | Per `06-VERIFICATION.md` sign-off | ❌ (release step) |

### The Validation Surface (what the planner must lift into must_haves)

The acceptance gate proves the **shared invariant holds across the full condition matrix**:

**Covered edges (automated, cross-engine chromium/firefox/webkit):**
1. **Condition matrix:** {baseline, high-zoom (400%+320px), reflow (320px), forced-colors, reduced-motion, touch, font-failure (block/delay/swap)} × {6 fixtures} × {both reading modes} × {3 engines}
2. **ACPT-01 corpus flow:** 6 fixtures × 3 engines, full reading+annotation loop
3. **ACPT-04 perf:** worst-case fixtures (essay-long-form + structural) × {desktop, throttled-mobile-chromium} × 3 engines, cold + warm, within budget OR fallback-within-warm-budget

**Property-based / held-out backstops:**
1. **Shared invariant (D6-09) as a property:** For EVERY edge condition × fixture × mode × engine combination: (a) full content reachable via keyboard; (b) no required function unreachable; (c) no overflow clips content. This is the single property applied uniformly — the planner should express it as a reusable assertion helper applied to every edge spec.
2. **Zero-blocker SR pass policy (D6-07) as a manual backstop:** The scripted checklist + exploratory charter on NVDA+Firefox + VoiceOver+Safari produce zero blocker/major findings. Minor quirks recorded, not blocking. This is the manual backstop automated testing cannot replace (STACK.md: axe catches only automatable issues).

**The 4 success criteria → validation ownership:**
| Success Criterion | Automated Ownership | Manual Ownership |
|-------------------|---------------------|------------------|
| 1. Corpus flow in 3 engines, no content loss | `core-reading-flow.spec.ts` (ACPT-01) | — |
| 2. Keyboard + SR flows in support matrix | `panel-keyboard.spec.ts`, `section-announce.spec.ts` (keyboard substrate) | `docs/ACCEPTANCE-PROTOCOL.md` run on NVDA+Firefox + VoiceOver+Safari (ACPT-02) |
| 3. Content/functions retained under 6 edge conditions | high-zoom + font-failure (NEW) + audited forced-colors/reduced-motion/reflow/touch-targets (ACPT-03) | — |
| 4. Perf within budgets or non-blocking fallback | `tests/e2e/perf/` + CI gate (ACPT-04) | Full device-matrix sign-off in `06-VERIFICATION.md` |

### Sampling Rate
- **Per task commit:** `npm run test:e2e -- --grep <spec>` (the relevant slice, 3 engines)
- **Per wave merge:** `npm run test` (full suite — the Plan 04-11/05-05 honest-counts precedent: no subset, no grep, no engine-skip)
- **Phase gate:** Full `npm run test` exit 0 + acceptance specs green + manual SR protocol run recorded + perf budget signed off

### Wave 0 Gaps
- [ ] `tests/e2e/acceptance/core-reading-flow.spec.ts` — covers ACPT-01
- [ ] `tests/e2e/perf/perf.harness.spec.ts` + `budget.compare.ts` + `budget.json` — covers ACPT-04
- [ ] `tests/e2e/high-zoom.spec.ts` — covers ACPT-03 (high-zoom gap)
- [ ] `tests/e2e/font-failure.spec.ts` — covers ACPT-03 (font-failure gap)
- [ ] `tests/e2e/_edge-invariant.ts` — shared-invariant helper (D6-09)
- [ ] `docs/ACCEPTANCE-PROTOCOL.md` — versioned manual protocol (D6-08)
- [ ] `playwright.config.ts` extension — throttled-mobile project (chromium-only)
- [ ] `package.json` extension — `"perf"` script

*(Existing edge specs audited in place — no new file for those.)*

## Security Domain

> `security_enforcement: true` (ASVS Level 1) in `.planning/config.json`.

Phase 6 is an **acceptance/verification phase with no new production code paths**. It adds test harnesses, a manual protocol doc, and CI wiring. The security surface is therefore minimal — but the ACPT-02 keyboard/SR flows and ACPT-03 edge conditions re-verify the existing security-relevant accessibility contract.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth in this prototype (local-first, no accounts — PROJECT.md Out of Scope). |
| V3 Session Management | no | No sessions (local IndexedDB via Dexie; no server). |
| V4 Access Control | no | No authorization surface (single-user local data). |
| V5 Input Validation | yes (re-verified) | Zod-at-boundary (fixtures, persisted records) — already enforced Phases 1–5. ACPT-01/03 re-verify no malformed content breaks the flow. No NEW validation in Phase 6. |
| V6 Cryptography | no | No crypto (local storage, no sync — PROJECT.md Out of Scope). |
| V7 Error Handling | yes (re-verified) | Measurement errors → diagnostic, never throw to reader (engine.ts V7 classification). ACPT-03 font-failure re-verifies the reader is never blocked by a measurement/font failure. |
| V12 Files & Resources | yes (test-only) | Font-failure harness injects a font + intercepts routes — TEST-TIER ONLY, never shipped. No production font-loading change. |
| V13 API & Web Service | no | No API (static SPA, no backend — STACK.md). |

### Known Threat Patterns for the Lem Reader stack

| Pattern | STRIDE | Standard Mitigation | Phase 6 Role |
|---------|--------|---------------------|--------------|
| Reverse tabnabbing (source-URL link) | Spoofing | `rel="noopener noreferrer"` on target=\_blank (already in ArticleView L6-7) | Re-verified by ACPT-01 flow; no change |
| Malformed fixture → pagination bug | Tampering | Zod ArticleSchema.parse at module load (src/fixtures/index.ts) | Re-verified by ACPT-01 corpus run; no change |
| Measurement failure blocks reader | Denial of Service | V7 classification → diagnostic, last-valid-view retained (engine.ts) | ACPT-03 font-failure DIRECTLY exercises this — proves the reader keeps reading |
| Storage corruption/full/unavailable | Tampering | STATE-05 recoverable error (WipeConfirm two-step) | Re-verified by ACPT-01 reopen flow; no change |

**Phase 6 introduces NO new attack surface.** All new code is test-tier (Playwright specs, Node compare script) or docs-tier (ACCEPTANCE-PROTOCOL.md). The font-injection in font-failure.spec.ts is a test-only `page.addStyleTag` — never present in production builds. No new production dependencies, no new network calls, no new persistence.

## Project Constraints (from AGENTS.md)

Extracted from `./AGENTS.md` (project instructions embedding STACK.md, conventions, architecture, GSD workflow):

| Directive | Authority | Phase 6 Compliance |
|-----------|-----------|--------------------|
| **No DOM emulators for layout truth** — Playwright in chromium/firefox/webkit | STACK.md | All ACPT-01/03/04 specs run in 3 engines. Font-failure + high-zoom + perf are real-browser only. |
| **`@axe-core/playwright` catches only automatable issues** — retain manual keyboard + SR checks | STACK.md | D6-05/D6-06 manual protocol is the direct fulfillment of this directive. |
| **Performance: "Repagination must feel responsive and remain stable after fonts settle"** | PROJECT.md Constraints | ACPT-04 budget + D6-11 font-failure spec directly verify this. The budget's "stable after fonts settle" dimension is the warm-budget gate. |
| **Validation: "Initial success is technical reliability on representative articles"** | PROJECT.md Constraints | Phase 6 IS this validation gate. Formal user studies are Out of Scope (deferred). |
| **Authored CSS + custom properties, no Tailwind/Redux** | STACK.md | No new production UI code in Phase 6; any harness helpers follow the no-framework-overhead discipline. |
| **Zod-at-boundary** | STACK.md | No new boundaries in Phase 6 (acceptance phase); existing boundaries re-verified. |
| **Honest full-suite execution** (Plan 04-11/05-05 precedent) | Process | Phase gate = full `npm run test` exit 0 + acceptance specs + manual protocol + perf sign-off. No subset/grep/engine-skip. |
| **GSD workflow enforcement** — no direct repo edits outside a GSD command | AGENTS.md | This research is part of `/gsd-plan-phase`; execution flows through `/gsd-execute-phase`. |

## Sources

### Primary (HIGH confidence)
- **Codebase (read in full this session):** `playwright.config.ts`, `package.json`, `tests/e2e/pagination/fixtures-matrix.ts`, `tests/e2e/open-every-fixture.spec.ts`, `tests/e2e/calibration/calibration.harness.spec.ts`, `tests/e2e/calibration/fingerprint.compare.ts`, `tests/e2e/measurement/last-valid-view.spec.ts`, `tests/e2e/measurement/stale-drop.spec.ts`, `tests/e2e/forced-colors.spec.ts`, `tests/e2e/reduced-motion.spec.ts`, `tests/e2e/reflow.spec.ts`, `tests/e2e/touch-targets.spec.ts`, `tests/e2e/a11y.spec.ts`, `tests/e2e/panel-keyboard.spec.ts`, `tests/e2e/section-announce.spec.ts`, `src/measurement/useMeasurement.ts`, `src/measurement/engine.ts`, `src/routes/ArticleView.tsx`, `src/fixtures/index.ts`, `src/settings/tokens.ts` (FONT_STACKS).
- **Playwright Emulation docs** — `https://playwright.dev/docs/emulation` — viewport, deviceScaleFactor (DPR not zoom), emulateMedia (forcedColors/reducedMotion/contrast/colorScheme), offline. `[CITED]`
- **Playwright Network docs** — `https://playwright.dev/docs/network` — page.route/context.route, route.abort/fulfill/continue/fetch, glob patterns. `[CITED]`
- **Playwright API (class-browser)** — `https://playwright.dev/docs/api/class-browser` — full context option list (forcedColors, reducedMotion, contrast, offline confirmed). `[CITED]`
- **Environment probe:** Node v22.22.3, npm 10.9.8, Playwright 1.61.1 — all `[VERIFIED this session]`.

### Secondary (MEDIUM confidence)
- **Corpus survey (normalized text chars):** essay-long-form 2994 > footnote-academic 2601 > list-reference 2456 > unsupported-case 1908 > technical-post 1691 > figure-heavy 1475. `[VERIFIED this session via node script]`
- **No-web-fonts finding:** grep of `src/` for `@font-face|woff|googleapis|font-family` + FONT_STACKS inspection + index.html review. `[VERIFIED this session]`

### Tertiary (LOW confidence — flag for validation)
- **CDP CPU/network throttle is chromium-only** — `[ASSUMED]` training knowledge; planner must verify against Playwright 1.61.1 docs/changelog before relying on it. `[ASSUMED]`
- **`document.body.style.zoom` engine support** — `[ASSUMED]` chromium yes / firefox 126+ / webkit partial; verify behavior in the actual test run. `[ASSUMED]`

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — all deps verified in package.json; Playwright APIs cited from official docs.
- Architecture (reuse substrate): **HIGH** — all reusable assets read in full from the codebase.
- Pitfalls: **HIGH** — font-injection + zoom-mechanics + corpus-worst-case are empirical findings from the actual codebase, not training knowledge.
- Perf budget numbers: **N/A** — deliberately deferred to executor measurement (D6-01 measure-first); researcher cannot produce p95 without the harness (circular).
- SR protocol details: **MEDIUM** — framework locked (D6-05/D6-06/D6-07); exact flow selection + severity-boundary cases are planner/executor discretion within the locked shape.

**Research date:** 2026-08-08
**Valid until:** 2026-09-07 (30 days — Playwright/stack are stable; the codebase findings are durable)

---

*Phase: 6-prototype-acceptance*
*Research completed: 2026-08-08*

## RESEARCH COMPLETE

**Phase:** 6 - Prototype Acceptance
**Confidence:** HIGH

### Key Findings
- **Playwright has NO native zoom API** — `setViewportSize({width:320})` is the load-bearing reflow assertion; `deviceScaleFactor` is DPR (not zoom); `document.body.style.zoom=4` is a secondary engine-variable check. `[CITED: playwright.dev/docs/emulation]`
- **Lem Reader loads NO web fonts** — the D6-11 font-failure harness MUST inject a `@font-face` first (`page.addStyleTag`), then `page.route()`-intercept the injected URL. Calling route on the unmodified app intercepts nothing. `[VERIFIED: src/settings/tokens.ts + src/app.css]`
- **figure-heavy is NOT the perf worst case** (figures stubbed to 1×1 SVG in tests; smallest normalized text at 1475 chars). Use **essay-long-form** (text worst case, 2994 chars) + **list-reference/technical-post** (structural worst case) for D6-02. `[VERIFIED: corpus survey]`
- **The perf CI gate mirrors `fingerprint.compare.ts` exactly** — per-engine temp-file → Node merge → exit-1-on-regression. `npm run perf` mirrors `npm run calibrate`. The DEV hooks (`__lemLastTrustedConstraints`, `__lemDiagnosticBus`) already exist for instrumentation. `[VERIFIED: tests/e2e/calibration/]`
- **CPU/network throttle is chromium-only** (CDP) `[ASSUMED]` — the throttled-mobile project is chromium-gated; manual sign-off (D6-04) covers firefox/webkit.

### File Created
`.planning/phases/06-prototype-acceptance/06-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | All deps verified in package.json; no new packages; Playwright APIs cited from official docs. |
| Architecture (reuse substrate) | HIGH | All reusable assets (fixtures-matrix, calibration gate, measurement hooks, edge specs) read in full from the codebase. |
| Pitfalls | HIGH | Font-injection, zoom-mechanics, and corpus-worst-case are empirical findings from the actual codebase + verified Playwright docs. |
| Perf budget numbers | N/A | Deliberately deferred to executor measurement (D6-01 measure-first); cannot produce p95 without building the harness. |
| SR protocol | MEDIUM | Framework locked; exact flows + severity boundaries are planner discretion within the locked shape. |

### Open Questions
1. Exact CPU slowdown (4× vs 6×) + network condition (Slow 3G) for throttled-mobile — empirical, executor picks.
2. Whether ACPT-01 consolidated spec uses one typography or the full matrix — recommend one representative (D-07 default) for the flow; typography-stress already covered by PAGE-03.
3. Severity rubric boundary cases (confusing-but-completable SR announcement) — default to minor; exploratory charter catches subjective cases.

### Ready for Planning
Research complete. Planner can now create PLAN.md files. The five empirical findings (no-zoom-API, no-web-fonts, figure-heavy-not-worst-case, calibration-gate-mirror, chromium-only-throttle) are the load-bearing inputs that shape the plan.
