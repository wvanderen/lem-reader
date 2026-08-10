# Phase 6: Prototype Acceptance - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-07
**Phase:** 6-prototype-acceptance
**Areas discussed:** Performance budgets, Manual acceptance protocol, Edge-condition acceptance bar

---

## Gray-Area Selection

4 phase-specific gray areas were presented. User selected 3 (did NOT select "Support matrix" — the matrix choice was folded into the Manual acceptance protocol area instead, since the protocol cannot be defined without it).

| Area | Selected |
|------|----------|
| Support matrix | |
| Performance budgets | ✓ |
| Manual acceptance protocol | ✓ |
| Edge-condition acceptance bar | ✓ |

---

## Performance budgets

### Q1 — How should the cold/warm budgets get defined?

| Option | Description | Selected |
|--------|-------------|----------|
| Measure-first, then lock | Researcher profiles current repagination perf across corpus × device profiles, proposes budgets at measured p95 + headroom for approval. Mirrors Phase 3 calibration tolerance derivation. | ✓ |
| Commit target numbers now | User sets target budgets upfront; phase validates/tunes. Faster to spec, risks unachievable or meaningless thresholds. | |
| You decide | Researcher/planner picks both approach and numbers. | |

**User's choice:** Measure-first, then lock
**Notes:** ACPT-04 numbers are greenfield (Phases 4/5 deferred). Grounds numbers in observed reality.

### Q2 — Which article(s) + device profiles to measure against?

| Option | Description | Selected |
|--------|-------------|----------|
| Worst-case fixture, 2 profiles | Heaviest fixtures on a desktop profile AND a throttled mobile profile. Worst case guarantees common case feels fast. | ✓ |
| All 6 fixtures, 1 profile | Full corpus on a single representative desktop profile. Simpler; may miss mobile/low-end pain. | |
| You decide | Researcher picks after a corpus survey. | |

**User's choice:** Worst-case fixture, 2 profiles
**Notes:** Likely essay-long-form + figure-heavy; researcher confirms worst case.

### Q3 — What does the fallback path's budget look like?

| Option | Description | Selected |
|--------|-------------|----------|
| Fallback shares the warm budget | Fallback commit must land within the same warm budget. One gate, clean contract. | ✓ |
| Fallback gets its own (looser) budget | Separate threshold + reader-visible signal if exceeded. | |
| Fallback is always instant — no budget | Fallback just unmounts pagination (always-mounted hidden body). No measurement, so no budget. | |

**User's choice:** Fallback shares the warm budget
**Notes:** Phase 4 session-mode-override + always-mounted ArticleBody (Plan 04-08) make fallback a mode-flip.

### Q4 — How are budgets enforced going forward?

| Option | Description | Selected |
|--------|-------------|----------|
| CI perf gate + manual sign-off | CI Playwright perf spec on representative profile (regression fails build) + one-time manual sign-off on full device matrix. | ✓ |
| CI perf gate only | Automated CI spec is the sole gate. CI hardware won't match throttled mobile profile. | |
| Manual measurement protocol only | Documented manual run on target devices at release. A future change could silently regress. | |

**User's choice:** CI perf gate + manual sign-off
**Notes:** Mirrors Phase 3 calibration CI-gate precedent.

---

## Manual acceptance protocol

### Q1 — Which screen-reader/OS/browser combinations for the manual protocol?

| Option | Description | Selected |
|--------|-------------|----------|
| NVDA+Firefox + VoiceOver+Safari | Two free, high-signal, runnable-on-dev-hardware pairings. Covers Windows + macOS. | ✓ |
| Add JAWS or Narrator as a 3rd | Broader Windows coverage; JAWS licensed/costly. | |
| You decide | Researcher proposes based on audience + available hardware. | |

**User's choice:** NVDA+Firefox + VoiceOver+Safari
**Notes:** Support matrix was not selected as a separate area; folded in here. JAWS noted as v1.x stretch (licensed), not a Phase 6 gate. The 3 Playwright engines cover automated ACPT-01.

### Q2 — What form does the documented manual acceptance protocol take?

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid: checklist + charter | Scripted checklist for critical core flows (expected SR output + keyboard sequence) + exploratory charter for edges. Best of both. | ✓ |
| Scripted checklist only | Maximally repeatable; misses exploratory usability issues. | |
| Exploratory charter only | Catches real-world issues; harder to pass/fail and rerun. | |

**User's choice:** Hybrid: checklist + charter

### Q3 — What constitutes a "pass" for ACPT-02?

| Option | Description | Selected |
|--------|-------------|----------|
| Zero-blocker policy | Zero blocker/major issues; all flows completable; no lost/unreachable info. Minor SR-output quirks recorded but don't block. | ✓ |
| Severity rubric + thresholds | Defined levels with explicit pass thresholds per flow. More structure; thresholds arbitrary. | |
| Strict exact-output | Every step must produce expected SR announcement verbatim. Likely unachievable on cosmetic variance. | |

**User's choice:** Zero-blocker policy
**Notes:** Matches ACPT-02's "can complete the flow" language; realistic about cross-SR variance.

### Q4 — Where is the acceptance protocol recorded, and what's the run cadence?

| Option | Description | Selected |
|--------|-------------|----------|
| Versioned repo doc + release re-run | Versioned ACCEPTANCE-PROTOCOL.md; executed for Phase 6 (results in 06-VERIFICATION.md); re-run on material reader-surface changes. | ✓ |
| Phase-6-only artifact | Lives only in Phase 6 verification; not maintained as ongoing gate. | |
| You decide | Researcher/planner picks location + cadence. | |

**User's choice:** Versioned repo doc + release re-run
**Notes:** Engineering acceptance, not user research (PROJECT.md Out of Scope).

---

## Edge-condition acceptance bar

### Q1 — What is the acceptance invariant for ACPT-03?

| Option | Description | Selected |
|--------|-------------|----------|
| Shared invariant: reachable + functional + no clipping | Full content reachable via keyboard in both modes; no required function unreachable; no overflow clips/overlaps. Applied to EACH condition. | ✓ |
| Per-condition specific assertions | Tailored per condition. More precise; more surface area. | |
| You decide | Researcher proposes after auditing existing specs. | |

**User's choice:** Shared invariant: reachable + functional + no clipping
**Notes:** Existing edge specs audited against it; gaps get new specs asserting the same invariant.

### Q2 — What zoom level + reflow breakpoint does ACPT-03 target?

| Option | Description | Selected |
|--------|-------------|----------|
| 400% zoom + 320 CSS px reflow (strict) | 400% on 1280px forces single-column reflow; 320px is WCAG 1.4.10 target. Trivially satisfies WCAG 1.4.4 AA floor (200%). | ✓ |
| 200% zoom + 320 CSS px (WCAG AA floor) | Universal baseline. 200% doesn't force reflow on most desktop viewports — under-tests reflow path. | |
| You decide | Researcher profiles corpus across zoom/width sweep and proposes thresholds. | |

**User's choice:** 400% zoom + 320 CSS px reflow (strict)
**Notes:** Accessibility-primary product; the strict bar matches the wedge.

### Q3 — How is "late or failed font loading" simulated and accepted?

| Option | Description | Selected |
|--------|-------------|----------|
| Playwright font injection (block/delay/swap) | page.route() intercepts font: block→fallback+last-valid-view; delay→untrusted-until-ready then re-commit; swap→stale-drop (PAGE-07). Real-browser cross-engine. | ✓ |
| Manual smoke only | Rely on Phase 3 unit tests + manual smoke. DOM emulators get font timing wrong. | |
| You decide | Researcher checks what Playwright can faithfully reproduce across engines. | |

**User's choice:** Playwright font injection (block/delay/swap)
**Notes:** Genuine gap — Phase 3 built D3-06 gate + unit tests but no e2e font-failure acceptance spec.

### Q4 — How does ACPT-03 coverage get built given existing specs?

| Option | Description | Selected |
|--------|-------------|----------|
| Audit existing + add the 2 gaps | Audit forced-colors/reduced-motion/reflow/touch against the invariant, strengthen weak ones; add high-zoom + font-failure asserting same invariant. | ✓ |
| Add gaps only, trust existing | Add only high-zoom + font-failure. Risks existing specs asserting less than the locked invariant. | |
| You decide (audit-first) | Researcher audits and reports; only gaps get new work. | |

**User's choice:** Audit existing + add the 2 gaps

---

## the agent's Discretion

Areas where the user locked the contract but deferred the specifics to the researcher/planner:
- **Exact cold/warm numeric thresholds** (D6-01) — measure-first; numbers follow measurement + approval.
- **Which fixtures are worst-case perf targets** (D6-02) — likely essay-long-form + figure-heavy; researcher confirms.
- **Playwright throttling profile specifics** (D6-02) — CPU slowdown + network condition numbers.
- **Perf spec location + CI wiring** (D6-04) — file layout; CI-gate behavior + manual sign-off locked.
- **Exact SR-checklist flows + announcement expectations** (D6-06) — how to avoid over-fitting to one SR version.
- **Severity rubric details** (D6-07) — blocker/major/minor definitions.
- **`ACCEPTANCE-PROTOCOL.md` location + structure** (D6-08) — exact repo path.
- **High-zoom spec mechanics** (D6-10) — cross-engine browser-zoom API differences.
- **Font-route interception specifics** (D6-11) — font URLs, delay durations, swap sequencing.
- **Whether ACPT-01 consolidated spec replaces or supplements open-every-fixture.spec.ts** (D6-13).

## Deferred Ideas

None raised that were out of scope. Items explicitly belonging to later phases/releases (confirmed, not new):
- **JAWS manual SR coverage** → v1.x stretch (licensed; NVDA + VoiceOver is the Phase 6 gate).
- **Formal user-preference / comprehension / completion study** → post-v1 (Out of Scope, PROJECT.md).
- **v2 capabilities** (ORNT/RECV/PORT/PRES) → v2.
- **Live extraction / extension packaging** → Out of Scope.
