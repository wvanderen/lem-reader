# Phase 13: Polish and Acceptance - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-18
**Phase:** 13-polish-and-acceptance
**Areas discussed:** First-paint strategy, NVDA run scope, Core-flow gate shape, Chrome polish items

---

## Gray-area selection

User selected: First-paint strategy, NVDA run scope, Core-flow gate shape — plus substantial freeform input that became the "Chrome polish items" area (four concrete UX complaints). Progress semantics was NOT selected; POLISH-02 details remain roadmap-prescribed at agent discretion.

---

## First-paint strategy

**Q1: How should the persisted reading mode (and friends) reach the first paint?**

| Option | Description | Selected |
|--------|-------------|----------|
| Sync mirror (Recommended) | localStorage mirrors persisted settings; inline script in index.html applies before React mounts; Dexie stays truth; stale hints self-correct | ✓ |
| Hold render | Calm neutral shell until Dexie hydration; never-wrong but every cold load pays visible wait | |
| You decide | Research evaluates both with evidence | |

**Q2: What should the sync mirror cover?**

| Option | Description | Selected |
|--------|-------------|----------|
| All settings (Recommended) | One key mirrors whole ReaderSettings — mode, theme, typography; one mechanism, one test; targets the full "jumping around" family | ✓ |
| Mode only | POLISH-01's letter; theme/typography still swap after hydration | |

**Q3: Where's the bar for 'no jumping on load'?**

| Option | Description | Selected |
|--------|-------------|----------|
| Settings flash only (Recommended) | Mirror kills the settings swap; pagination-settle stays; matches SC#1 letter (cold-load zero-flip assertion) | ✓ |
| No reflow at all | Also gate reading surface behind measurement readiness; bigger mechanism touching pagination | |

**Notes:** User confirmed the load-time jumping is "really bad right now" in their opening freeform input.

---

## NVDA run scope

**Q1: Which flows does the NVDA+Firefox run cover?**

| Option | Description | Selected |
|--------|-------------|----------|
| v1.0 + v2.0 addendum (Recommended) | Documented flows AND a v2.0 addendum (library, ingest, review, export/import, books) | |
| As-documented only | Six documented flows + five charters as written; honest to SC#3's letter | ✓ |

**Q2: Do you also want a VoiceOver+Safari re-run?**

| Option | Description | Selected |
|--------|-------------|----------|
| VO re-run, v2.0 surfaces (Recommended) | Scoped pass over NEW v2.0 surfaces; supplementary evidence, not an ACPT-05 gate | ✓ |
| NVDA only | SC#3's letter only; VO re-run stays a documented gap | |

**Q3: If the NVDA or VO runs surface findings, what's the policy?**

| Option | Description | Selected |
|--------|-------------|----------|
| Fix then re-run (Recommended) | 06-06 precedent: blocker/major fixed in-phase, re-run to zero; minors deferred | ✓ |
| Single pass | Run once, record verbatim; any finding defers the gate | |

**Q4: How does the NVDA run actually happen?**

| Option | Description | Selected |
|--------|-------------|----------|
| You run, human gate (Recommended) | Blocking human gate mid-phase like 11-01/unpdf approval | |
| Prepare, run later | Plans prepare runbook + record sheet; user runs on Windows on own schedule; ACPT-05 flips when results land | ✓ |
| Windows VM attempt | Try NVDA in a VM on macOS; fall back to prepare-only if dishonest | |

**Notes:** User diverged from recommendations on Q1 (as-documented, narrower) and Q4 (prepare, run later) — captured faithfully; the v2.0 NVDA addendum is a deferred idea.

---

## Core-flow gate shape

**Q1: Which intake format anchors the end-to-end core flow?**

| Option | Description | Selected |
|--------|-------------|----------|
| One upload format (Recommended) | One deterministic format (e.g. .md) drives the cross-engine loop; others covered by per-phase specs | ✓ |
| All five formats | Spine ingests via all paths; ~5× runtime, re-tests proven coverage | |
| You decide | Research balances determinism, runtime, coverage | |

**Q2: What does 'without content loss' assert, precisely?**

| Option | Description | Selected |
|--------|-------------|----------|
| 09-06 bar extended (Recommended) | Byte-equal IndexedDB rows across export/re-import; highlights re-resolve confident; reimported article behaves identically; books excluded | ✓ |
| Plus visible-layer | Also assert rendered mark position and screen restore; stronger but more brittle | |
| Data-layer only | Minimum honest reading; offsets + confident re-resolution only | |

**Q3: Fold known debt items?**

| Option | Description | Selected |
|--------|-------------|----------|
| Fold timeout test (Recommended) | Phase 11's 30s-timeout fake-timers unit test (zero production changes); stacked-modal stays deferred | ✓ |
| Fold both | Also decide stacked-modal focus question now | |
| Defer all | Both ride to the milestone audit | |

---

## Chrome polish items

Origin: user freeform input during gray-area selection (not pre-identified areas). Four items surfaced: header title-row bloat (TagMenu residency, internal header scroll), note/highlight modal pinned top-left, no standardized home↔article navigation, haphazard home page.

**Q1: Which fold into Phase 13?**

| Option | Description | Selected |
|--------|-------------|----------|
| Bounded fold (Recommended) | Three bounded items fold; home reorganization deferred | |
| Fold all four | All four including LibraryView organization pass | ✓ |
| Defer all | Strict POLISH-01/02 + ACPT-05/06 boundary | |

**Notes:** Explicit scope-widening call by the user — REQUIREMENTS.md gains the four items at planning time (D13-12).

**Q2: Where does article tagging live once the header is slimmed?**

| Option | Description | Selected |
|--------|-------------|----------|
| Out of header, top spot (Recommended) | TagEntry moves to a calm metadata spot at article top (rendered once, not per page) | ✓ |
| Compact button + popover | Single icon button in header opening existing TagEntry | |
| You decide | Researcher picks against minimal-header principle | |

**Q3: What shape does standardized navigation take?**

| Option | Description | Selected |
|--------|-------------|----------|
| Header back affordance (Recommended) | Compact "Back to library" via history.back() with #/ fallback; consistent across views | ✓ |
| Breadcrumb | Library › Title line; clearer hierarchy but more chrome | |
| Browser back only | Status quo; least work | |

**Q4: How should the home-page organization pass work?**

| Option | Description | Selected |
|--------|-------------|----------|
| Bounded tidy (Recommended) | Reorganize within existing components; researcher audits concrete irritants first | ✓ |
| Design pass first | /gsd-ui-phase or sketch contract before implementation | |
| Describe it myself | User provides the brief in own words | |

---

## the agent's Discretion

- POLISH-02 progress-formula details (not discussed; roadmap-prescribed offset-anchored approach)
- Mirror mechanics (key shape, write timing, wipe invalidation, STATE-05 interaction, first-run)
- Spine format confirmation (.md recommended)
- Runbook/record-sheet format; results location
- Slimmed header composition; article-top metadata spot anatomy
- Note-modal root-cause diagnosis
- Back-affordance copy/focus details
- LibraryView tidy specifics
- Wave ordering

## Deferred Ideas

- NVDA v2.0-surface addendum flows (future protocol extension)
- No-reflow-at-all reading surface (revisit if jumping persists after D13-01..03)
- Stacked-modal sequential-focus divergence (Phase 09 open human decision)
- Library redesign / new library features beyond the bounded tidy
- JAWS coverage (protocol stretch item, unchanged)
