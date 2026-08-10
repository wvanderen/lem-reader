# Phase 6: Prototype Acceptance - Context

**Gathered:** 2026-08-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 6 is the **acceptance phase** — it proves readers can rely on the complete prototype across the selected browser, assistive-technology, input, reflow, font, and performance conditions, and it locks the explicit performance budgets that Phases 4 and 5 explicitly deferred. It is primarily a **verification + gap-closure phase**, not a feature-building phase: the reading/annotation/pagination/measurement substrate is delivered and verified by Phases 1–5. Phase 6's job is to consolidate that into acceptance proof, close the genuine coverage gaps, define the budgets, and run the manual protocol.

It delivers 4 requirements (the last un-checked v1 requirements):
- **ACPT-01** — Reader can complete the core reading flow on the representative corpus in current Chromium, Firefox, and WebKit without content loss or blocked navigation.
- **ACPT-02** — Reader can complete documented keyboard-only and manual screen-reader acceptance flows in the selected support matrix.
- **ACPT-03** — Reader retains content and required functions under high zoom, narrow reflow, forced colors, reduced motion, touch, and late or failed font loading scenarios.
- **ACPT-04** — Repagination meets explicit cold and warm performance budgets on the selected article and device profiles selected during implementation planning.

**Phase 6 does NOT ship** (deferred):
- **New reading, annotation, or pagination capabilities** — those landed in Phases 1–5. Phase 6 closes coverage gaps surfaced by the acceptance bar but does not expand product breadth.
- **A formal user-preference / comprehension / completion study** — explicitly Out of Scope (PROJECT.md). Phase 6 is *engineering* acceptance on representative content; comparative user-value validation follows after the engine is trustworthy.
- **v2 capabilities** (ORNT-01/02 orientation aids, RECV-01/02 annotation recovery, PORT-01/02 export/import, PRES-01 calm presets) — all v2.
- **Live extraction / extension packaging** — Out of Scope.

**Substrate already shipped by prior phases (pre-answered — do NOT re-ask):**
- **The 6-fixture corpus** (D3-09: essay-long-form, technical-post, figure-heavy, footnote-academic, list-reference, unsupported-case) = the ACPT-01 / ACPT-03 corpus.
- **The 3-engine Playwright matrix** (chromium / firefox / webkit, `playwright.config.ts:7-11`) = the ACPT-01 automated cross-engine matrix. Not re-negotiated here.
- **A11Y-01..08, PAGE-01..09, ANNO-01..07, STATE-01..05, READ-01..05, DOC-01..06 are all delivered + verified** (REQUIREMENTS.md Traceability). The accessibility contract (keyboard-only operation, focus order/predictability, SR reading order, zoom/reflow, forced-colors, reduced-motion, pointer/touch, concise status) is the substrate Phase 6 proves under acceptance conditions — it is not rebuilt.
- **Phase 3's calibrated measurement substrate** — font gate on `document.fonts.ready` (D3-06), cancel-in-flight + epoch-guard staleness (D3-07), per-kind calibration fingerprint + CI gate (D3-08/D3-10), runtime drift downgrade. This is the ACPT-03 font-failure substrate and the ACPT-04 "feels responsive / falls back without blocking reading" substrate.
- **Phase 3's last-valid-view retention (PAGE-06) + stale-epoch drop (PAGE-07)** — the machinery that makes cold pagination invisible to the reader and makes the fallback path non-blocking.
- **Phase 4's session-mode-override fallback** (Plan 04-05) — flips to scrolling on fallback WITHOUT overwriting the persisted `readingMode`. The always-mounted hidden `ArticleBody` (Plan 04-08) is what makes fallback a non-measuring mode-flip.
- **Phase 3's calibration CI gate** (`npm run calibrate`; `tests/e2e/calibration/` + `calibration/fingerprint.json` + `fingerprint.compare.ts` exits non-zero on drift) = the precedent for an ACPT-04 perf CI gate.
- **STACK.md** locks: Playwright in Chromium/Firefox/WebKit for layout/accessibility truth (NO DOM emulators); Performance — "Repagination must feel responsive and remain stable after fonts settle"; Validation — "Initial success is technical reliability on representative articles."

**Genuine open inputs Phase 6 resolves (what this context locks):**
- **STATE.md flagged:** *"Concrete browser/OS/screen-reader support combinations and manual protocol remain to be selected."* → locked below (D6-05, D6-06).
- **REQUIREMENTS.md flagged:** ACPT-04 budgets *"selected during implementation planning."* → locked below (D6-01..D6-04).

</domain>

<decisions>
## Implementation Decisions

### Performance Budget Definition (ACPT-04)

- **D6-01: Measure-first, then lock.** The researcher profiles current cold + warm repagination performance across the corpus × device profiles FIRST, then proposes cold/warm budgets at **measured p95 + headroom** for the user to approve before they are committed as the release budget. Grounds the numbers in observed reality rather than guessing at targets the engine cannot hit (or thresholds so loose they are meaningless). Mirrors how Phase 3 derived the calibration tolerance empirically (D3-02). The budget contract is locked here; the numeric thresholds are NOT — they follow the measurement step and an explicit approval.
- **D6-02: Worst-case fixtures × two device profiles.** Profiling targets the **heaviest fixtures** (likely `essay-long-form` for longest text and `figure-heavy` for most non-text — researcher confirms the worst case after a quick corpus survey) on **(a) a desktop profile** and **(b) a throttled mobile profile** (Playwright CPU + network throttling simulating a low-end device). Budgets set at the worst case guarantee the common case feels fast and cover the accessibility-first audience (who may be on older hardware). The full 6-fixture corpus is exercised for *correctness* (ACPT-01/03) but perf budgets are proven at the worst case.
- **D6-03: Fallback shares the warm budget — one gate.** The scrolling-fallback commit must land within the **same warm budget** as a normal repagination. Rationale: fallback is essentially a mode-flip that skips pagination (Phase 4 session-mode-override + the always-mounted hidden `ArticleBody` from Plan 04-08), so it should be at least as fast as a repagination. One gate, clean contract — no separate looser fallback threshold, no reader-visible "fallback was slow" signal to design. (If measurement later proves fallback genuinely needs heavy work, this can be revisited; for MVP it is the same gate.)
- **D6-04: Enforcement = CI perf gate + release manual sign-off.** A **Playwright perf spec runs in CI on the representative (desktop) profile** and fails the build on regression — directly mirroring Phase 3's calibration CI gate precedent (`npm run calibrate` + `fingerprint.compare.ts` exit code). PLUS a **one-time manual sign-off** at release that measures the **full device matrix** (including the throttled-mobile profile that CI hardware cannot faithfully represent). Prevents silent perf regressions between releases; the manual pass covers what CI hardware cannot.

### Manual Acceptance Protocol (ACPT-02)

- **D6-05: Manual screen-reader matrix = NVDA+Firefox + VoiceOver+Safari.** The manual SR acceptance runs against **NVDA on Firefox (Windows)** and **VoiceOver on Safari (macOS)**. These are the two free, high-signal, runnable-on-dev-hardware pairings; NVDA is the dominant free Windows SR and VoiceOver is the macOS/iOS SR, covering the two screen-reader ecosystems the accessibility-first audience most commonly uses. The 3 Playwright engines (chromium/firefox/webkit) already cover the **automated** cross-engine surface for ACPT-01. JAWS (dominant licensed Windows SR in enterprise/education) is explicitly a **stretch/if-hardware-available** candidate noted for v1.x, not a Phase 6 gate — recorded as a known coverage boundary, not a blocker.
- **D6-06: Hybrid protocol — scripted checklist for core flows + exploratory charter for edges.** The protocol has two parts: (a) a **scripted checklist** for the critical core flows (open article → read end-to-end → switch mode → create / view / navigate / delete a highlight + note → adjust settings), each step with the **expected screen-reader announcement + exact keyboard sequence** so regressions are caught deterministically; (b) an **exploratory charter** for edge scenarios (goal-based scenarios like "complete the full reading + annotation loop using only the screen reader; note anything confusing, lost, or unreachable") that catches real-world usability issues a scripted checklist will miss. Both parts run on both SR pairings.
- **D6-07: Zero-blocker pass policy.** A "pass" = **zero blocker/major issues** — every documented flow is completable using only SR/keyboard, and no content or required function is lost or unreachable. **Minor SR-output quirks** (e.g. announcement phrasing differences across SR versions/settings) are **recorded but do not block acceptance**. Matches ACPT-02's "can complete the flow" language and is realistic about cross-SR output variance (a strict verbatim-output bar would block on cosmetic variance). Findings are recorded with severity so the deferred-item list can carry forward.
- **D6-08: Versioned `ACCEPTANCE-PROTOCOL.md` in the repo + release re-run.** The protocol (checklist + charter + SR/keyboard sequences + expected outcomes + severity rubric) lives as a **versioned doc in the repo** so it is durable and re-runnable. It is **executed for Phase 6 acceptance** with results recorded in `06-VERIFICATION.md`, and flagged **"re-run on material reader-surface changes."** Not bureaucracy — a single canonical artifact future releases can re-run. (PROJECT.md: this is engineering acceptance, not a user study.)

### Edge-Condition Acceptance Bar (ACPT-03)

- **D6-09: One shared invariant applied to EVERY edge condition.** Under each condition (zoom, reflow, forced colors, reduced motion, touch, font-failure), the acceptance invariant is: **(a) every fixture's full content is reachable via keyboard in BOTH reading modes; (b) no required function** (read, mode-switch, create/view/navigate/delete highlight, note, settings, location restore) **is unreachable; (c) no layout overflow clips or overlaps content.** One bar, applied uniformly. The existing edge specs (forced-colors / reduced-motion / reflow / touch-targets) are **audited against this invariant** and strengthened where they assert less than (a)/(b)/(c); the gaps (high-zoom, font-failure) get **new specs asserting the same invariant**. Ensures the single bar actually holds everywhere rather than each spec encoding a different weaker assertion.
- **D6-10: 400% zoom + 320 CSS px reflow (strict).** ACPT-03 targets **400% browser zoom AND 320 CSS px reflow width.** 400% zoom on a 1280px viewport is exactly what forces single-column mobile-equivalent reflow — it actively exercises the reflow path rather than just shrinking text. 320 CSS px is the WCAG 1.4.10 reflow target. This strict bar **trivially satisfies the WCAG 1.4.4 AA floor** (200% without loss), so it is the single target. Matches the accessibility-primary audience. (200%-only is explicitly rejected as under-testing the reflow path that matters most.)
- **D6-11: Font-failure simulated via Playwright route interception (block / delay / swap).** Late/failed font loading is injected via Playwright `page.route()` interception of the font request, in three modes: (a) **block** the font → assert content stays readable in fallback fonts AND last-valid-view is retained (no blank flash — Phase 3 D3-06); (b) **delay** the font → assert the provisional view is tagged untrusted until `document.fonts.ready` resolves, then repagination re-commits correctly; (c) **font swap mid-read** → assert the stale-epoch guard drops the stale result (PAGE-07) and the newer one commits. Real-browser, cross-engine (chromium/firefox/webkit) — STACK.md mandates this; DOM emulators are forbidden for layout/font truth. This is the genuine gap: Phase 3 built the gate (D3-06) and unit-tested the logic, but no acceptance spec exercises it end-to-end.
- **D6-12: Coverage = audit existing edge specs + add the 2 gaps.** The existing specs (`forced-colors.spec.ts`, `reduced-motion.spec.ts`, `reflow.spec.ts`, `touch-targets.spec.ts`) are **audited against the shared invariant** (D6-09) and strengthened where weak; the **2 gap specs** (`high-zoom` at 400% + 320px asserting the invariant, and `font-failure` block/delay/swap asserting D6-11) are added asserting the same invariant. The ACPT-01 consolidated corpus flow (below) folds the per-fixture core-reading-flow check across all 3 engines. No edge condition is left to "trust the existing spec as-is" without confirming it meets the locked invariant.

### ACPT-01 Consolidated Corpus Flow

- **D6-13: ACPT-01 = a consolidated end-to-end core-reading-flow spec across the 6-fixture corpus × 3 engines.** The corpus is already opened per-fixture by `tests/e2e/open-every-fixture.spec.ts`, but ACPT-01 specifically requires proving the **complete core reading flow** (open → read through → switch mode → restore location → create + navigate a highlight) **without content loss or blocked navigation** across the full corpus in chromium, firefox, and webkit. Rather than scattering this across the (already-green) per-feature specs, a consolidated ACPT-01 spec asserts the end-to-end flow as one acceptance contract per fixture × engine. Reuses the existing fixture matrix + selectors — this is acceptance consolidation, not new feature code.

### the agent's Discretion

- **Exact cold/warm numeric thresholds (D6-01)** — the *approach* (measure-first → propose at p95 + headroom → user approves) and the *contract* (cold + warm wall-clock per repagination, fallback shares warm budget) are locked; the numbers are NOT. The researcher must measure before proposing.
- **Which fixtures are the worst-case perf targets (D6-02)** — `essay-long-form` (longest text) + `figure-heavy` (most non-text) are the likely candidates, but the researcher confirms after a quick corpus survey. The *profile selection* (desktop + throttled mobile) is locked.
- **Playwright throttling profile specifics (D6-02)** — exact CPU slowdown (e.g. 4× / 6×) and network condition (e.g. Slow 3G) used to simulate the throttled mobile profile. STACK.md mandates Playwright; the throttle numbers are empirical.
- **Perf spec location + CI wiring (D6-04)** — whether it lives in `tests/e2e/perf/`, reuses the calibration harness pattern, or is a dedicated `npm run perf` script mirroring `npm run calibrate`. The CI-gate behavior (regression fails build) + manual sign-off are locked; the file layout is architecture.
- **Exact SR-checklist flows + announcement expectations (D6-06)** — which specific flows make the scripted checklist, and how SR output expectations are authored to avoid over-fitting to one SR version (e.g. assert semantic role + name, not verbatim phrasing). The hybrid shape + zero-blocker policy are locked.
- **Severity rubric details (D6-07)** — the blocker/major/minor definitions used to classify findings. The zero-blocker pass policy is locked; the rubric text is the planner's.
- **`ACCEPTANCE-PROTOCOL.md` location + structure (D6-08)** — exact repo path (`docs/` vs phase dir vs root) and internal structure. The versioned + re-run-on-material-change contract is locked.
- **High-zoom spec mechanics (D6-10)** — how 400% zoom is driven in Playwright (`page.evaluate('document.body.style.zoom')` vs browser-level vs viewport CSS-pixel scaling) across chromium/firefox/webkit (browser zoom APIs differ). The 400% + 320px target is locked; the cross-engine mechanism is empirical.
- **Font-route interception specifics (D6-11)** — which font URL(s) to intercept, delay durations, and swap sequencing. The block/delay/swap modes + assertions are locked; the harness mechanics are the planner's.
- **Whether the ACPT-01 consolidated spec replaces or supplements `open-every-fixture.spec.ts` (D6-13)** — `open-every-fixture` proves every fixture mounts; ACPT-01 proves the full flow. Planner decides whether to extend the existing spec or add a sibling.

### Folded Todos
*None — `todo.match-phase` returned no matches for Phase 6.*

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project intent & requirements
- `.planning/PROJECT.md` — product vision, Core Value ("calm, booklike"), Constraints (Performance: "Repagination must feel responsive and remain stable after fonts settle — visible layout churn would undermine the product's core promise"; Accessibility: the foundational contract; Validation: "Initial success is technical reliability on representative articles — formal preference, comprehension, and completion studies are later validation work"). Out of Scope row: "Formal proof of improved preference, comprehension, or completion" — authority that Phase 6 is engineering acceptance, not user research.
- `.planning/REQUIREMENTS.md` — **ACPT-01, ACPT-02, ACPT-03, ACPT-04 are this phase's requirements** (§Acceptance). §Traceability maps each to Phase 6 (all Pending). Every other requirement (DOC/READ/A11Y/PAGE/ANNO/STATE) is Complete and is the substrate Phase 6 proves.
- `.planning/ROADMAP.md` — Phase 6 goal, 4 success criteria, dependency on Phase 5. Success Criteria 4 is the ACPT-04 authority ("stays within explicit release budgets or falls back without blocking reading").

### Stack & architecture authority
- `.planning/research/STACK.md` — locked stack. Directly governing Phase 6: **Playwright 1.61.1 in Chromium/Firefox/WebKit for layout/accessibility/perf truth** ("DOM emulators do not implement authoritative browser layout and font metrics → Playwright"); **`@axe-core/playwright` 4.12.1** ("Axe reports only automatable issues; retain manual keyboard and screen-reader checks" — authority for D6-05/D6-06 manual protocol); **`document.fonts.ready` / `FontFaceSet.ready`** (the ACPT-03 font-failure primitive); **Performance constraint**: "Repagination must feel responsive and remain stable after fonts settle."
- `AGENTS.md` — project instructions embedding STACK.md, conventions, architecture notes, GSD workflow enforcement.

### Prior-phase contracts this phase proves (the substrate — read to know what is ALREADY done)
- `.planning/phases/03-trustworthy-layout-measurement/03-CONTEXT.md` — **D3-06** (font gate on `document.fonts.ready` — the ACPT-03 font-failure substrate), **D3-07** (cancel-in-flight + epoch guard — the PAGE-07 stale-drop substrate), **D3-08/D3-10** (calibration harness + CI gate — the ACPT-04 CI-gate precedent), **D3-09** (corpus = 6 DOC fixtures — the ACPT-01/03 corpus).
- `.planning/phases/04-responsive-pagination-and-dual-mode-navigation/04-CONTEXT.md` — **D4-02** (atomic set), **D4-06/D4-07** (keyboard bundle + context-aware focus — the ACPT-02 keyboard substrate), **D4-10/D4-11** (mode-switch/repagination anchor — the ACPT-01 mode-switch round-trip substrate), plus the session-mode-override fallback (Plan 04-05) and always-mounted hidden `ArticleBody` (Plan 04-08) that make fallback non-blocking (D6-03).
- `.planning/phases/05-durable-highlights-and-notes/05-CONTEXT.md` — **D5-05/D5-06** (selection + single-block rule), **D5-11** (navigate-back), **D5-15** (mark semantics + forced-colors) — the ACPT-01/ACPT-02 annotation-flow substrate.

### Source code & test contracts (READ before implementing)
- `playwright.config.ts` — the locked 3-engine project matrix (chromium/firefox/webkit); ACPT-04 throttled-mobile profile + ACPT-03 high-zoom/font-failure specs extend this config.
- `tests/e2e/open-every-fixture.spec.ts` — per-fixture mount proof; ACPT-01 consolidated core-reading-flow spec (D6-13) extends or siblings this.
- `tests/e2e/forced-colors.spec.ts`, `reduced-motion.spec.ts`, `reflow.spec.ts`, `touch-targets.spec.ts`, `a11y.spec.ts`, `panel-keyboard.spec.ts`, `section-announce.spec.ts` — existing edge-condition + accessibility specs to audit against the shared invariant (D6-09/D6-12).
- `tests/e2e/pagination/fixtures-matrix.ts` — the corpus × viewport × typography matrix pattern the ACPT-01 consolidated spec + perf spec reuse.
- `tests/e2e/calibration/` + `calibration/fingerprint.json` + `fingerprint.compare.ts` + `npm run calibrate` (`package.json`) — the CI-gate precedent the ACPT-04 perf gate mirrors.
- `tests/e2e/measurement/last-valid-view.spec.ts` + `stale-drop.spec.ts` — PAGE-06/PAGE-07 e2e proof; the ACPT-03 font-failure spec (D6-11) extends this font-timing surface.
- `tests/e2e/pagination/fallback-banner.spec.ts` + `fallback-oversize.spec.ts` — the fallback-path behavior the fallback-shares-warm-budget gate (D6-03) instruments.
- `src/measurement/useMeasurement.ts` + `engine.ts` — the trusted-view + staleness seam a perf measurement harness reads.
- `src/routes/ArticleView.tsx` — the reader route; the perf harness instruments open/repagination here.
- `package.json` scripts (`test`, `test:unit`, `test:e2e`, `calibrate`) — the test commands; a `perf` script / CI gate is added here.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **The 6-fixture corpus** (`src/fixtures/index.ts`, locked D3-09) — both the ACPT-01/03 correctness corpus and the perf-target source. No new fixtures needed.
- **The 3-engine Playwright matrix** (`playwright.config.ts`) — already runs every spec across chromium/firefox/webkit. ACPT-01/03/04 specs plug into it directly; ACPT-04 adds a throttled-mobile project + perf gating.
- **`tests/e2e/pagination/fixtures-matrix.ts`** — the corpus × viewport × typography matrix helper. ACPT-01 consolidated spec, ACPT-03 high-zoom spec, and ACPT-04 perf spec all reuse it rather than re-deriving fixture enumeration.
- **`tests/e2e/open-every-fixture.spec.ts`** — the per-fixture mount proof that ACPT-01 consolidated core-reading-flow spec extends.
- **The calibration CI-gate pattern** (`tests/e2e/calibration/` + `fingerprint.compare.ts` exit code + `npm run calibrate`) — the structural template for the ACPT-04 perf CI gate (regression fails build).
- **The PAGE-06/PAGE-07 e2e harness** (`tests/e2e/measurement/last-valid-view.spec.ts`, `stale-drop.spec.ts`) — already proves last-valid-view retention + stale-drop; the ACPT-03 font-failure spec extends this with `page.route()` font interception.
- **The fallback e2e harness** (`fallback-banner.spec.ts`, `fallback-oversize.spec.ts`) — already proves the scrolling fallback; the fallback-shares-warm-budget gate (D6-03) adds timing instrumentation here.
- **`@axe-core/playwright`** (already a dependency) — the automated a11y surface; STACK.md notes it catches only automatable issues, which is exactly why D6-05/D6-06 add the manual SR protocol alongside it.

### Established Patterns
- **Playwright across Chromium/Firefox/WebKit for layout/accessibility/perf truth** (Phases 1/3/4/5) — every Phase 6 spec runs in all 3 engines; no DOM emulator is ever authoritative for zoom/reflow/font/perf.
- **Honest full-suite execution** (Plan 04-11 / Plan 05-05 precedent: run the FULL `npm run test`, no subset/grep/engine-skip, record fail=0 honestly) — the Phase 6 acceptance gate is a full-suite green run PLUS the new acceptance specs PLUS the manual protocol record.
- **CI-gate-on-regression** (D3-10 calibration fingerprint compare) — the ACPT-04 perf gate mirrors this: a regression fails the build rather than emitting a warning.
- **Zod-at-boundary + authored CSS + custom properties, no Tailwind/Redux** — no new product code is expected, but any harness/assertion helpers follow the repo's no-framework-overhead discipline.
- **Audit-existing-before-adding** — D6-12's "audit existing edge specs against the invariant, then add the gaps" follows the Phase 4/5 gap-closure precedent (verify what exists before assuming it needs replacement).

### Integration Points
- **`playwright.config.ts`** — ACPT-04 adds a throttled-mobile project (CPU + network throttle) and the perf gate; ACPT-03 high-zoom/font-failure specs may need engine-specific config (browser-zoom APIs differ).
- **`package.json` scripts** — a `perf` script (mirroring `calibrate`) is added; the acceptance gate may extend `test` or run as a separate release step.
- **`tests/e2e/`** — new specs: `perf/` (ACPT-04), `high-zoom` + `font-failure` (ACPT-03 gaps), ACPT-01 consolidated core-reading-flow spec. Existing edge specs audited/strengthened in place.
- **`docs/ACCEPTANCE-PROTOCOL.md`** (new, D6-08) — the versioned manual protocol artifact; referenced from `06-VERIFICATION.md`.
- **`06-VERIFICATION.md`** — records ACPT-01..04 results: full-suite green + acceptance specs + manual SR protocol run + perf measurement + budget sign-off.
- **REQUIREMENTS.md / ROADMAP.md / PROJECT.md** — ACPT-01..04 flip to Complete after the acceptance gate passes (the v1 milestone's final requirement set).

</code_context>

<specifics>
## Specific Ideas

- **Phase 6 is acceptance, not invention.** The product's core hypothesis — that web content can be repaginated quickly and reliably without sacrificing semantic HTML, keyboard access, reduced-motion, or reader choice — is *proven* here, not retried. The substrate is built; Phase 6 closes gaps and locks budgets.
- **Measure-first is the philosophical through-line from Phase 3.** Just as the calibration tolerance was derived empirically from the rendered corpus (D3-02) rather than asserted, the ACPT-04 budgets are measured before they are locked (D6-01). The product does not guess at its own performance envelope.
- **One shared edge-condition bar, not six.** D6-09 deliberately applies a single invariant to every condition so acceptance means the same thing everywhere — "the reader loses nothing" — rather than six different weaker per-spec assertions. This is the accessibility-first audience's actual need: predictable completeness under any condition.
- **400% zoom is the meaningful accessibility target.** For a product whose wedge is accessibility, 200% (the WCAG floor) under-tests the reflow path that matters; 400% actively forces the reflow the audience depends on (D6-10).
- **The manual SR matrix is pragmatic, not exhaustive.** NVDA + VoiceOver covers the free, high-signal, runnable pairings (D6-05); JAWS is recorded as a known coverage boundary for v1.x rather than a gate. Honest about what a prototype can prove.
- **Zero-blocker, not verbatim-output.** Screen-reader output varies across versions; ACPT-02's "can complete the flow" is honored by a zero-blocker policy (D6-07) rather than an impossible verbatim-announcement bar.
- **The acceptance protocol is a durable artifact, not a one-off.** D6-08 makes it versioned in the repo so future releases re-run it — the same "trustworthy + repeatable" discipline as the calibration fingerprint.
- **Fallback is non-blocking by construction, so one budget covers it.** D6-03 collapses fallback into the warm budget because Phase 4 already made fallback a mode-flip over an always-mounted body — no separate slow path to budget.

</specifics>

<deferred>
## Deferred Ideas

None raised that were out of scope. Items explicitly belonging to later phases/releases (confirmed, not new):
- **JAWS manual SR coverage** → **v1.x stretch** (licensed/costly to run on dev hardware; NVDA + VoiceOver is the Phase 6 gate per D6-05; recorded as a known coverage boundary, not a blocker).
- **Formal user-preference / comprehension / completion study** → **post-v1** (Out of Scope, PROJECT.md). Phase 6 is engineering acceptance.
- **Orientation aids, annotation recovery/repair, export/import, calm presets** (ORNT-01/02, RECV-01/02, PORT-01/02, PRES-01) → **v2**.
- **Live extraction / extension packaging** → **Out of Scope** (the milestone isolates the reading engine).
- **Per-engine perf budgets** → if measurement shows a meaningful engine spread, the planner may propose per-engine thresholds; for MVP the budget is a single contract with the worst engine/profile setting the floor (D6-02 worst-case).

</deferred>

---

*Phase: 6-prototype-acceptance*
*Context gathered: 2026-08-07*
