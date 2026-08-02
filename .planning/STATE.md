---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 02
current_phase_name: accessible-scrolling-reader
status: executing
stopped_at: Completed 02-02-PLAN.md (settings persistence + STATE-05 recovery)
last_updated: "2026-08-02T17:08:00.000Z"
last_activity: 2026-08-02
last_activity_desc: Phase 02 Plan 02 executed — persistence + STATE-05 recovery
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 8
  completed_plans: 7
  percent: 19
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-26)

**Core value:** Readers can move through long-form web content with calm, stable orientation and predictable navigation.
**Current focus:** Phase 02 — accessible-scrolling-reader

## Current Position

Phase: 02 (accessible-scrolling-reader) — EXECUTING
Plan: 3 of 3
Status: Ready to execute Plan 02-03 (location restore + hairline + announcer)
Last activity: 2026-08-02 — Plan 02-02 complete (persistence + STATE-05)

Progress: [██████████░░░░] 88% (Phase 02: 2 of 3 plans done)

## Performance Metrics

**Velocity:**

- Total plans completed: 2
- Average duration: 30 min
- Total execution time: 1.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 5 | 14 min | 14 min |
| 02 | 2 (in progress) | 60 min | 30 min |

**Recent Trend:**

- Last 5 plans: 02-01 (50min), 01-05 (3 min), 01-04 (11 min), 01-02 (120 min), 01-01 (14 min)
- Trend: stable

| Phase 01 P01 | 14 min | 3 tasks | 25 files |
| Phase 01 P02 | 120 | 3 tasks | 13 files |
| Phase 01 P04 | 11 min | 2 tasks | 5 files |
| Phase 01 P05 | 3 min | 2 tasks | 5 files |
| Phase 02 P01 | 50min | 3 tasks | 19 files |
| Phase 02 P02 | 10 min | 2 tasks | 11 files |

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

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 3]: Pretext adoption tolerances, metric fingerprints, image readiness, and performance profiles require empirical planning.
- [Phase 4]: Rich-content fragmentation and oversize policies require corpus-driven rules.
- [Phase 5]: Offset units, grapheme handling, overlap semantics, and anchor confidence thresholds need explicit decisions.
- [Phase 6]: Concrete browser/OS/screen-reader support combinations and manual protocol remain to be selected.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| v2 | Orientation aids, annotation recovery, portability, and presentation presets | Deferred | Roadmap creation |

## Session Continuity

Last session: 2026-08-02T17:08:00.000Z
Stopped at: Completed 02-02-PLAN.md (settings persistence + STATE-05 recovery)
Resume file: None
