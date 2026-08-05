---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 4
current_phase_name: Responsive Pagination and Dual-Mode Navigation
status: verifying
stopped_at: Phase 4 context gathered
last_updated: "2026-08-05T16:12:04.096Z"
last_activity: 2026-08-05
last_activity_desc: Phase 03 complete (2/2 plans, 8/8 truths verified, 7/7 UAT passed), transitioned to Phase 4
progress:
  total_phases: 6
  completed_phases: 3
  total_plans: 11
  completed_plans: 11
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-05)

**Core value:** Readers can move through long-form web content with calm, stable orientation and predictable navigation.
**Current focus:** Phase 04 — responsive-pagination-and-dual-mode-navigation

## Current Position

Phase: 4 — Responsive Pagination and Dual-Mode Navigation
Plan: Not started
Status: Ready to plan
Last activity: 2026-08-05 — Phase 03 complete (2/2 plans, 8/8 truths verified, 7/7 UAT passed), transitioned to Phase 4

Progress: [██████████░░░░░░░░░░] 3/6 phases complete (50%) — 11/11 plans executed

## Performance Metrics

**Velocity:**

- Total plans completed: 10 (this phase, incl. gap closure)
- Average duration: 25 min
- Total execution time: 1.5 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 5 | 14 min | 14 min |
| 02 | 4 | - | - |
| 03 | 2 | - | - |

**Recent Trend:**

- Last 5 plans: 02-04 (5min gap closure), 02-03 (22min), 02-02 (10 min), 02-01 (50min), 01-05 (3 min)
- Trend: stable

| Phase 01 P01 | 14 min | 3 tasks | 25 files |
| Phase 01 P02 | 120 | 3 tasks | 13 files |
| Phase 01 P04 | 11 min | 2 tasks | 5 files |
| Phase 01 P05 | 3 min | 2 tasks | 5 files |
| Phase 02 P01 | 50min | 3 tasks | 19 files |
| Phase 02 P02 | 10 min | 2 tasks | 11 files |
| Phase 02 P03 | 22 min | 3 tasks | 17 files |
| Phase 02 P04 | 5 min | 2 tasks | 7 files |
| Phase 03 P01 | 22 min | 3 tasks | 16 files |
| Phase 03 P02 | 19 min | 2 tasks | 14 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

- [Roadmap]: Use one canonical document coordinate system before any durable location, pagination, or annotation behavior.
- [Roadmap]: Keep semantic scrolling continuously viable before and during pagination work.
- [Roadmap]: Require calibrated browser measurement before enabling any Pretext fast path.
- [Phase ?]: D-04 inline marks locked to 4 (link/code/strong/em); D-05 grapheme coordinates over normalized text; D-06 slug id + monotonic revision
- [Phase ?]: Recursive Block type uses two-pass Zod declaration (hand-written union + z.ZodType annotation — Pitfall 7)
- [Phase ?]: Rule 3 deviation: @typescript-eslint hard-throws on TS 7.0; eslint.config.js uses @babel/eslint-parser instead, all security rules (react/no-danger etc.) preserved and verified firing
- [Phase ?]: [Phase 01-02]: One h1 per page — ArticleView renders title from provenance; article bodies start at h2 (a11y)
- [Phase ?]: [Phase 01-02]: Hash-based routing confirmed (A2) — window.location.hash + hashchange, no router library
- [Phase 01]: [Phase 01-04]: Inset unification lives on main#main (not per-view wrappers) — closes fixture-list flush-edge gap with one rule, no double inset
- [Phase 01]: [Phase 01-04]: Error heading level split by page context — ArticleView uses <h1> (standalone error page), FixtureList uses <h2> (page already has <h1>Saved articles</h1>); preserves one-h1-per-page
- [Phase ?]: [Phase 01-05]: Route/fragment distinction lives in the hashchange handler (not parseHash) — parseHash must still map bad #/ deep links to the list; the guard prevents fragment-only hashes from reaching setView so native scroll targets stay mounted
- [Phase ?]: [Phase 01-05]: Footnote back-link visible glyph is U+21A9 as a React text child + aria-label 'Return to reference N'; fn.id schema-locked to digits-only so suffix is injection-safe; no new CSS (app.css owned by sibling 01-04)
- [Phase ?]: Phase 02-01: Native <dialog>/showModal chosen for settings panel; manual triggerRef.current?.focus() restore in close listener (Pitfall 1) — Free focus trap/Esc/inert/backdrop; canonical per 02-RESEARCH anti-pattern #1
- [Phase ?]: Phase 02-01: applyTheme writes data-theme + 6 CSS custom properties on documentElement (D2-03 live-apply) — Single token swap honors authored-CSS/no-Tailwind constraint; values derive from Zod-validated enums/numbers (no XSS surface, T-02-02)
- [Phase ?]: Phase 02-01: Dexie version(2) re-declares same stores — schema no-op in Dexie >=3; anchors STATE-04 migration hook (Pitfall 9 honored) — v1 wrote zero records; no data migration needed; gives Plan 02 clean place to evolve
- [Phase ?]: Phase 02-01: Explicit focus on first control after showModal + removed <form method=dialog> wrapper — WebKit does not auto-focus modal-dialog controls; form wrapper interfered with Chromium focus-trap wrap-around (focus escaped to body)
- [Phase ?]: Phase 02-02: db.delete() lives ONLY in WipeConfirm.tsx onDestructiveClick (stricter-than-plan Pitfall 8 reading per critical_constraints) — SettingsContext.resetLocalData only clears in-memory state; the sole executable db.delete call site is the destructive button onClick (verified via repo-wide grep)
- [Phase ?]: Phase 02-02: WipeConfirm cancel button carries [data-initial-focus] (NOT autoFocus prop) — safer default focus on the non-destructive action; an accidental Enter cannot wipe data
- [Phase ?]: Phase 02-02: Dexie LemReaderDB Table<> property annotations added with definite-assignment `!` — PATTERNS.md line 106 LOW-risk authorization; version(1) block byte-unchanged (Pitfall 9); runtime behavior unaffected
- [Phase ?]: Phase 02-02: UnknownError routes to unupgradeable FIRST (conservative) — appears in both unupgradeable + unavailable Dexie error sets; conservative routing surfaces WipeConfirm rather than the banner but never auto-wipes (Pitfall 8 holds in ambiguous classification)
- [Phase ?]: Phase 02-02: StorageBanner dismiss is session-scoped (resets on reload per D2-13) — if storageState returns to "ok", the dismiss flag clears so a future unavailable state re-surfaces the banner
- [Phase ?]: Phase 02-03: Dexie [field+field] store syntax declares a COMPOUND PRIMARY KEY queried as array [val1, val2] — NOT a field named '[field+field]'; the 02-01 LocationRecordRow had a bogus bracketed string field; fixed to use array key db.location.get([id,rev])
- [Phase ?]: Phase 02-03: IntersectionObserver alone is insufficient for scroll-spy (batches callbacks + flaky percentage rootMargin) — added passive rAF-throttled scroll listener as fallback trigger; both feed same debounced detect() function
- [Phase ?]: Phase 02-03: Callback-ref + state pattern for DOM elements needed by child components — React refs don't trigger re-renders; useState + callback ref bridges the gap so SectionAnnouncer receives the article element when it mounts
- [Phase ?]: Phase 02-03: findScrollTarget reuses normalizeRunText + graphemeClusters from src/content/normalizeText EXACTLY (D-05 contract — no parallel implementation); saved grapheme offset round-trips precisely with restored DOM block target
- [Phase ?]: Phase 02-03: ProgressHairline fill has NO CSS transition/animation property — inline scaleX write tracks scroll like a native scrollbar; global prefers-reduced-motion gate trivially satisfied (UI-SPEC §Interaction 12)
- [Phase 02]: Phase 02-04 (gap closure): transform-origin grammar is PHYSICAL-ONLY (left|center|right|top|bottom — NO logical-keyword variants); inline-start/inline-end are valid for inset/margin/padding logical properties but NOT for transform-origin; browsers silently ignore the unknown value and fall back to initial 50% 50% (center). LTR English uses the physical `left` keyword; a [dir="rtl"] override to `right` is deferred to a future RTL milestone.
- [Phase 02]: Phase 02-04 (gap closure): Typography cascade contract — applyTheme writes custom properties (--font-size / --line-height / --letter-spacing / --word-spacing) on <html>; the SECOND body rule consumes them via var() with literal first-paint fallbacks (18px / 1.6 / 0). Mirrors the working --font-body + --measure pattern. NEVER write a bare property the body rule will override via CSS specificity.
- [Phase ?]: Phase 03-01: Font trigger via addEventListener('loadingdone'), not a polling re-await loop — polling hot-looped on already-resolved font promises and starved the event loop; EVENT form is Baseline per MDN
- [Phase ?]: Phase 03-01: awaitFontsReady uses Promise.race(document.fonts.ready, abortPromise) so a never-resolving font promise still surfaces a mid-flight abort as AbortError (D3-06)
- [Phase ?]: Phase 03-01: DiagnosticEvent defined as 6-kind discriminated union now (late-epoch-drop + measurement-error emitted in Plan 01; the other 4 reserved for Plan 02) so Phase 4 PAGE-09 extends emission not the shape (D3-05)
- [Phase ?]: Phase 03-01: DEV-only window.__lemLastTrustedConstraints debug hook under import.meta.env.DEV lets the PAGE-07 e2e observe the latest committed Constraints without exposing internal state to production
- [Phase ?]: Phase 03-02: 'kind-downgraded' (kebab-case) is the canonical diagnostic event field — committed Zod schema in types.ts is source of truth; plan's kindDowngraded would fail V5 boundary parse
- [Phase ?]: Phase 03-02: Engine measures DOM for ALL blocks (correct reference + safe fallback); Pretext predictions computed only for sampled eligible blocks to feed drift guard
- [Phase ?]: Phase 03-02: Calibration harness split — Playwright per-engine parallel + Node compare merge avoids cross-worker coordination for single fingerprint write
- [Phase ?]: Phase 03-02: Calibration evidence — headings eligible (216/216 chromium+firefox, 156/216 webkit); paragraphs 0/216 (rich-inline marks + wordSpacing Pitfall 6 + system-ui sans Pitfall 5) — D3-01 per-kind gate's purpose realized
- [Phase ?]: Phase 03-02: fingerprint.compare.ts refuses empty input (exit 2) — never overwrite committed fingerprint with placeholder

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 3 → resolved]: Pretext adoption tolerances + metric fingerprints landed in Phase 3 (calibration/fingerprint.json committed; headings eligible chromium/firefox, partial webkit, paragraphs DOM-only; runtime drift guard + CI gate in place).
- [Phase 4]: Image readiness and performance profiles for pagination still require empirical planning; rich-content fragmentation and oversize policies need corpus-driven rules.
- [Phase 5]: Offset units, grapheme handling, overlap semantics, and anchor confidence thresholds need explicit decisions.
- [Phase 6]: Concrete browser/OS/screen-reader support combinations and manual protocol remain to be selected.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| v2 | Orientation aids, annotation recovery, portability, and presentation presets | Deferred | Roadmap creation |

## Session Continuity

Last session: 2026-08-05T16:12:04.088Z
Stopped at: Phase 4 context gathered
Resume file: .planning/phases/04-responsive-pagination-and-dual-mode-navigation/04-CONTEXT.md
