# Phase 21: Integrated Refinement and Acceptance - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-31
**Phase:** 21-integrated-refinement-and-acceptance
**Areas discussed:** Reading-width truth, Tag menu + Highlights fixes, Impeccable audit scope, WebKit Blob residual, Acceptance mechanics

---

## Reading-width truth (POLISH-09)

| Option | Description | Selected |
|--------|-------------|----------|
| Cap at 64 | Remove the 72 step; far-right = 64ch, delivered visually + programmatically | ✓ |
| Make 72 truthful | Keep 72 as max and fix whatever makes the far-right lie | |
| Diagnose first | Researcher diagnoses where the 64 cap bites, then the plan picks | |

**User's choice:** Cap at 64 (Recommended)
**Notes:** Matches the requirement's "displayed 64-character maximum" wording; calm-reading ceiling.

| Option | Description | Selected |
|--------|-------------|----------|
| Keep 52–64 | Three steps, minimal change, no new geometry churn | |
| Extend downward | Add narrower steps (e.g. [40, 46, 52, 58, 64]) — real choice at high zoom / large type | ✓ |
| Calibrated steps | Planner picks from typography research (possibly size-relative) | |

**User's choice:** Extend downward
**Notes:** Exact steps are planner territory; stored measure:72 clamps calmly to 64 on read (agent-handled).

| Option | Description | Selected |
|--------|-------------|----------|
| Current readout | Keep inline "Reading width N ch"; truth = value + aria + rendered column agree | ✓ |
| Endpoint labels | Also label slider ends (Narrow / Widest 64ch) | |
| Agent decides | Planner picks as part of the POLISH-11 audit pass | |

**User's choice:** Current readout (Recommended)

---

## Tag menu + Highlights fixes (POLISH-08/10)

| Option | Description | Selected |
|--------|-------------|----------|
| Keep auto+anchor | Keep popover=auto (light-dismiss + Esc); fix anchoring so it tracks the trigger | ✓ |
| Match TocPanel | Converge on popover=manual, no light-dismiss, explicit Esc/close | |

**User's choice:** Keep auto+anchor (Recommended)
**Notes:** Positioning tech (CSS anchor vs JS reposition on resize/scroll) is researcher/planner territory.

| Option | Description | Selected |
|--------|-------------|----------|
| Visible row affordance | Keep whole-row jump; add a quiet open-in-reader glyph per row | ✓ |
| Section headings link | Section h2s become the article-context entry; rows unchanged | |
| No new chrome | Grid conformance + verification only | |

**User's choice:** Visible row affordance (Recommended)
**Notes:** Row semantics, disabled/ambiguous rules, orphan-tail shape unchanged.

| Option | Description | Selected |
|--------|-------------|----------|
| Token conformance | Shared tokens/rules; deviations fixed; intentional differences cited (POLISH-07 discipline) | ✓ |
| Literal shared grid | Highlights rows adopt the .library-list grid template | |

**User's choice:** Token conformance (Recommended)
**Notes:** Researcher diagnoses the concrete .review-* deviations.

---

## Impeccable audit scope (POLISH-11)

| Option | Description | Selected |
|--------|-------------|----------|
| All surfaces | Library (+ views/filters/Add), Highlights, Reader (both modes, TOC, annotations), Settings/dialogs, error states | ✓ |
| Four destinations | Library, Highlights, Add, Reader only | |
| Reader only | Reading surface focus | |

**User's choice:** All surfaces (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| After fixes | Audit the corrected state; findings validate the three fixes too | ✓ |
| Before fixes | Audit first, one remediation wave | |
| Both passes | Early scan + full post-fix audit | |

**User's choice:** After fixes (Recommended)
**Notes:** Implied ordering: POLISH fixes → audit → remediation → acceptance runs last.

| Option | Description | Selected |
|--------|-------------|----------|
| Fix major, log minor | Blocker/major fixed in-phase (ACPT-08 bar); minors to deferred-items with severity | ✓ |
| Fix everything | All findings fixed in-phase | |
| Human picks | Audit report → user picks remediation set | |

**User's choice:** Fix major, log minor (Recommended)

---

## WebKit Blob residual (ACPT-07)

| Option | Description | Selected |
|--------|-------------|----------|
| Skips + real Safari | Keep D20-15 Blob shape + 5 documented skips; one-time real-Safari image-flow verification as evidence | ✓ |
| Migrate to Uint8Array | Pay the migration; webkit e2e engine-complete | |
| Carry as-is | Skips stay; real-Safari assumption uncited | |

**User's choice:** Skips + real Safari (Recommended)
**Notes:** v1.0 A4 reduced-gate honesty precedent; Uint8Array alternative stays recorded with revisit trigger.

| Option | Description | Selected |
|--------|-------------|----------|
| Fold into ACPT-08 | Ride the VoiceOver+Safari session (already in Safari) + one sighted pass | ✓ |
| Earlier standalone | Separate Safari smoke before the acceptance wave | |

**User's choice:** Fold into ACPT-08 (Recommended)

---

## Acceptance mechanics (ACPT-07/08)

| Option | Description | Selected |
|--------|-------------|----------|
| Integrated spine | One continuous end-to-end journey spec × 3 engines (ACPT-06 precedent) | ✓ |
| Segmented matrix | Per-capability specs × 3 engines | |
| Spine + segments | Spine plus segments for riskiest capabilities | |

**User's choice:** Integrated spine (Recommended)
**Notes:** Webkit image-save cells ride the documented skips (D21-11).

| Option | Description | Selected |
|--------|-------------|----------|
| Capability flows | ~8-10 scripted flows covering each v2.1 capability once (incl. the Phase-16-deferred Add SR pass) | ✓ |
| Destination flows only | Four destination-level flows | |
| Exhaustive flows | Every Phase 14-20 capability gets its own flow | |

**User's choice:** Capability flows (Recommended)
**Notes:** Flip policy carried forward (not re-decided): ACPT-08 flips only on human zero-blocker NVDA+Firefox AND VoiceOver+Safari runs.

| Option | Description | Selected |
|--------|-------------|----------|
| Fix this phase | Scoped disable-with-justification; milestone closes with lint green | ✓ |
| Carry as debt | Leave recorded in deferred-items | |

**User's choice:** Fix this phase (Recommended)
**Notes:** The 3 pre-existing zipSlip.ts lint errors (Phase 9).

---

## the agent's Discretion

- Slider internals (exact lower steps, clamp mechanism, e2e cell updates)
- Tag-menu anchoring mechanics (CSS anchor positioning vs JS repositioning; cross-engine support decides)
- Highlights deviation diagnosis + glyph choice
- Audit execution mechanics + findings severity mapping
- Spine spec composition (fixtures, seeding, byte-equality assertions, webkit skip cells)
- Protocol v1.3 authoring (flow wording, role+name+state outcomes, results sheets)
- Safari verification evidence location
- Phase gate shape (workers contention control, lint gate wiring)

## Deferred Ideas

- Uint8Array asset-row migration (revisit trigger: real-Safari image defect or Playwright-WebKit fix)
- Animated-AVIF residual (Phase 20 A4)
- Literal shared grid for Highlights rows
- Section-heading links into article context on Highlights
