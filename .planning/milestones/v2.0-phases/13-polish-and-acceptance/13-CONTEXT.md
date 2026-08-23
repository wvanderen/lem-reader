# Phase 13: Polish and Acceptance - Context

**Gathered:** 2026-08-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 13 is the **v2.0 quality gate** — it mirrors v1.0 Phase 6: eliminate the
two known polish regressions, close the acceptance boundaries, and end the
milestone with an honest green full suite. Four locked requirements plus a
**user-widened chrome-polish workstream** (explicit scope call made during this
discussion — see D13-12):

1. **POLISH-01** — first-paint settings flash: the reader sees the persisted
   reading mode (and theme/typography) on first paint with no flash or snap.
2. **POLISH-02** — progress-bar semantics: offset-anchored progress formula
   (ROADMAP-prescribed) with boundary tests; a one-page article no longer reads
   100% on open, a multi-page article progresses from the start.
3. **ACPT-05** — NVDA+Firefox acceptance run of `docs/ACCEPTANCE-PROTOCOL.md`
   as documented, closing the v1.0 ACPT-02 coverage boundary A4. Prepared in
   this phase; **executed by the user after preparation** (D13-07) — the
   requirement flips only when results land.
4. **ACPT-06** — v2.0 core-flow e2e (ingest → read → highlight → export →
   re-import) across Chromium/Firefox/WebKit without content loss + honest
   full-suite gate (`npm run test` exit 0).
5. **Chrome polish (user-added)** — slim the article header (TagEntry out),
   fix the note/highlight modal top-left anchoring bug, add a standardized
   back affordance (library ↔ article), and a bounded LibraryView
   organization tidy.

**Phase 13 does NOT ship** (deferred):
- **No-reflow-at-all reading surface** — pagination-settle (pages appearing
  after measurement) stays; only the settings flash dies (D13-03).
- **NVDA validation of v2.0 surfaces** — protocol runs as-documented (v1.0
  flows); a v2.0 addendum is a deferred idea.
- **Stacked-modal focus divergence decision** (Phase 09 open item) — stays
  parked for human product decision; NOT folded.
- **Home-page redesign / new library features** — the tidy is bounded within
  existing components (D13-16).
- **Accounts/cloud sync, extension packaging** — PROJECT.md Out of Scope
  (carried).

**Load-bearing invariants (locked — do NOT re-ask):**
- Honest full-suite discipline: `npm run test` end-to-end, exit 0, fail counts
  recorded (Key Decision; 04-11 / 09-07 / 12-08 precedent).
- SC#1's Playwright cold-load no-snap test and SC#2's offset-anchored progress
  formula are roadmap-prescribed mechanisms.
- `docs/ACCEPTANCE-PROTOCOL.md` is the durable ACPT instrument — D6-07
  zero-blocker/major policy, role+name outcomes (never verbatim SR phrasing),
  versioned + re-runnable.
- `effectiveMode = sessionModeOverride ?? settings.readingMode` (T-04-15) —
  the FOUC fix must not break fallback-flip semantics; only the user-initiated
  toggle path persists.
- ProgressHairline never animates (no CSS motion of any kind), stays
  `aria-hidden` decorative; AT progress rides SectionAnnouncer.
- Dexie/`loadSettings` remains the sole source of truth for settings; the
  first-paint mirror is a paint hint only (D13-01).
- The reading engine cannot tell an ingested article from a fixture — the
  core-flow gate proves this end-to-end across engines (SC#4, ACPT-06).

</domain>

<decisions>
## Implementation Decisions

### First-paint flash (POLISH-01)

- **D13-01: Sync mirror via localStorage + inline pre-React script.** A
  localStorage key mirrors the persisted ReaderSettings; a small inline script
  in `index.html` applies mode/theme/typography to `:root` before React
  mounts. Dexie stays the source of truth; hydration reconciles and
  self-corrects a stale hint. Chosen over hold-render: no cold load pays a
  visible IndexedDB round-trip; this is the standard FOUC remedy.
- **D13-02: The mirror covers ALL settings** — reading mode, theme, and
  typography in one key, one mechanism, one test. Targets the whole
  "jumping around on load" family the user reported, not just the mode flip.
- **D13-03: The bar is settings-flash only.** Pagination-settle (pages
  appearing after measurement) is explicitly out of scope. The SC#1
  Playwright cold-load test asserts zero mode/theme/token flip on first
  paint with persisted non-default settings. Wipe/reset must clear the
  mirror; storage-failure (STATE-05) paths must not fight it (the mirror is
  a hint — it never routes recovery UI).

### Acceptance runs (ACPT-05 + supplementary VoiceOver)

- **D13-04: NVDA+Firefox runs the protocol AS-DOCUMENTED** — the six v1.0
  scripted flows + five exploratory charters in
  `docs/ACCEPTANCE-PROTOCOL.md`, no v2.0 addendum (deferred idea). Honest to
  SC#3's letter.
- **D13-05: VoiceOver+Safari re-run, scoped to the NEW v2.0 surfaces**
  (library browse/search/tags, ingest form + refusals, review panel
  jump/curate, export/import dialogs, book groupings). Supplementary
  evidence honoring the protocol's own re-run rule ("material change to the
  reader surface" — five phases' worth) — NOT an ACPT-05 gate. Runnable on
  the user's macOS hardware.
- **D13-06: Findings policy = fix then re-run (06-06 precedent).** Blocker/
  major findings are fixed in-phase and affected flows re-run until zero
  blocker/major; minors are recorded and deferred.
- **D13-07: Prepare-then-run-later logistics.** Plans ship the runbook +
  record sheet; the user runs NVDA+Firefox manually on Windows hardware on
  their own schedule after preparation. ACPT-05 flips only when results
  land (instrument-ships-now / requirement-closes-at-proof — the 04-02 /
  06-04 precedent). The VO re-run likewise: user runs it when ready; a
  findings fix cycle re-runs affected flows (D13-06).

### Core-flow gate (ACPT-06)

- **D13-08: One deterministic upload format anchors the spine** — planner
  confirms (recommended: `.md`, network-free and deterministic) — driving
  ingest → read → highlight → export → re-import across chromium/firefox/
  webkit. The other intake paths (URL, paste, PDF, EPUB) stay covered by
  their existing per-phase specs; books are excluded from the spine.
- **D13-09: "Without content loss" = the 09-06 bar, extended.** Exported-
  then-reimported articles/highlights/notes/positions/preferences are
  byte-equal at the raw IndexedDB row level; every highlight re-resolves
  `confident` (tri-state surfacing intact); the reimported article opens,
  paginates, annotates, and restores location identically.
- **D13-10: Honest full-suite phase gate** — `npm run test` exits 0 in one
  invocation, fail counts recorded in the phase OUTPUT record (locked
  discipline, not re-negotiated).
- **D13-11: Fold the Phase 11 acknowledged gap** — the 30s PDF
  extraction-timeout firing path (withPdfDocument race) gets its fake-timers
  unit test here: zero production changes, closes 11-VERIFICATION.md §
  Acknowledged Gaps. The Phase 09 stacked-modal focus item stays deferred
  (product decision, not a test).

### Chrome polish (user-widened scope)

- **D13-12: Scope call — all four chrome items fold into Phase 13.** Explicit
  user decision during this discussion. REQUIREMENTS.md gains them at
  planning time (POLISH-03..06 candidates) so traceability stays honest;
  planning must reflect the widened boundary.
- **D13-13: Header slimmed; TagEntry leaves the persistent header.** Tags
  edit from a calm metadata spot at the article top (under title/byline —
  rendered once, not on every paginated page). The header becomes title +
  essential controls only, minimal because page mode repeats it on every
  page; target: no internal header scrolling at reference viewports
  (360×640 — the 09-07 geometry lesson: header growth broke pagination).
- **D13-14: Note/highlight modal pinned top-left is a bug.** Restore the
  06-06 intended placement (NotePopover was deliberately promoted to a
  modal `<dialog>` + showModal); researcher diagnoses the anchoring
  regression and the fix follows the existing UI-SPEC dialog contracts.
- **D13-15: Standardized nav = a compact "Back to library" affordance at the
  article header start**, using `history.back()` with a `#/` fallback, same
  anatomy on every view (article, review panel), keyboard-reachable. Chosen
  over breadcrumbs (extra vertical chrome vs the slimmed header).
- **D13-16: LibraryView bounded tidy.** Reorganize within existing
  components — clear sections (continue reading / add content / library
  list), consistent spacing tokens, calmer control hierarchy. No new
  features; the researcher first audits what "haphazard" means concretely
  (ordering, density, visual weight, control placement) before CSS changes.

### the agent's Discretion

- **POLISH-02 formula details (not discussed — roadmap prescribes the
  approach):** exact offset-anchored formula and boundary values (1-page
  article at open, within-page offset contribution), scrolling-mode parity,
  whether library progress hairlines adopt the same formula for consistency
  (Phase 8's ≥98% finished-state convention), PageIndicator "N of M"
  unchanged unless research finds cause.
- **Mirror mechanics:** localStorage key shape/versioning, write timing
  (ride the existing debounced save + dual flush), invalidation on
  WipeConfirm/resetLocalData, first-run (no mirror → defaults paint),
  cross-engine localStorage behavior in Playwright contexts.
- **Spine format confirmation** (.md recommended — determinism, no network).
- **Runbook/record-sheet format** for the NVDA + VO runs; where results land
  (13-VERIFICATION.md).
- **Slimmed header composition** — which controls remain (mode toggle,
  settings, page indicator placement) and the article-top metadata spot
  anatomy (TagEntry placement, source line integration).
- **Note-modal root-cause diagnosis** — which surface(s) actually pin
  top-left (reader NotePopover vs review-panel dialogs) and why.
- **Back-affordance details** — icon+label copy, focus behavior, review-
  panel consistency.
- **LibraryView tidy specifics** — section order, spacing, which controls
  cluster; calm-voice and token-only CSS discipline apply.
- **Wave ordering** — polish fixes before the acceptance runs; the
  full-suite gate lands last (gap-closure precedent).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project intent & requirements
- `.planning/ROADMAP.md` — §Phase 13 goal + 4 success criteria (cold-load
  no-snap test; offset-anchored progress formula with boundary tests; NVDA
  zero-blocker/major; core-flow across matrix + `npm run test` exit 0).
- `.planning/REQUIREMENTS.md` — POLISH-01/02, ACPT-05/06 (§Polish, §Acceptance);
  traceability table L121-124. **Note D13-12: four user-added chrome items
  join here at planning time.**
- `.planning/PROJECT.md` — v2.0 milestone framing (§Polish bullet: "eliminate
  the initial-load reading-mode flash; fix short-article progress-bar
  semantics"); honest full-suite Key Decision; Out of Scope (carried).

### Acceptance instruments & precedent runs
- `docs/ACCEPTANCE-PROTOCOL.md` — THE durable manual SR instrument: matrix
  (D6-05), hybrid shape (D6-06), zero-blocker/major policy (D6-07), 6
  scripted flows + 5 exploratory charters, re-run rule. NVDA+Firefox runs
  this as-documented (D13-04).
- `.planning/phases/06-prototype-acceptance/06-VERIFICATION.md` — the Phase 6
  acceptance ledger: VoiceOver+Safari zero-blocker run, the A4 NVDA boundary
  this phase closes, 06-06 findings/fixes precedent (incl. the NotePopover
  dialog promotion D13-14 restores).

### Prior-phase contracts
- `.planning/phases/09-versioned-export-import/09-CONTEXT.md` — D9-14
  skip-by-default conflicts; the two-context round-trip harness contract
  D13-09 extends; stacked-modal deferred item (stays deferred, D13-11).
- `.planning/phases/11-pdf-intake/11-CONTEXT.md` — D11-04/05/06 corpus
  discipline; the 30s-timeout acknowledged gap D13-11 closes.
- `.planning/phases/12-epub-intake/12-CONTEXT.md` — books ride the bundle
  (excluded from the core-flow spine, D13-08); chapter chrome the header/
  back-nav work must not disturb.

### Source code contracts (READ before implementing)
- `src/settings/SettingsContext.tsx` — the async-hydration flash source
  (L61-105: DEFAULT_SETTINGS first, Dexie hydrates after); the mirror rides
  its save path; wipe/reset interactions live here.
- `src/settings/applyTheme.ts` — the token-write surface the inline script
  must replicate pre-React (D2-03 live-apply; typography cascade contract:
  never write a bare property the body rule overrides).
- `src/settings/defaults.ts` — DEFAULT_SETTINGS incl. `readingMode:
  "paginated"` (D4-12) — what paints when no mirror exists.
- `index.html` — where the inline pre-React script lands.
- `src/persistence/settingsStore.ts` — loadSettings/saveSettings (Dexie
  truth; mirror writes hang off saves).
- `src/reader/ProgressHairline.tsx` — the current/total bug (paginated
  `current/total`: 1/1 → 100% on open; 1/2 → 50% at start) POLISH-02
  replaces with the offset-anchored formula; NO CSS motion ever.
- `src/reader/PageIndicator.tsx` — "N of M" indicator (expected unchanged).
- `src/routes/ArticleView.tsx` — effectiveMode/T-04-15 machinery the FOUC
  fix must preserve; header mount point (TagEntry lives here today);
  scroll-progress ratio source; location-restore effect.
- `src/reader/TagEntry.tsx` — the component moving out of the header
  (D13-13); Pitfall 8-5 inert-at-mount discipline carries to its new home.
- `src/reader/annotations/NotePopover.tsx` — the top-left anchoring bug
  (D13-14); 06-06 dialog-promotion intent is the spec.
- `src/App.tsx` — hash router; the back affordance's `history.back()` +
  `#/` fallback integrate here.
- `src/ingestion/library/LibraryView.tsx` (+ `LibraryRow.tsx`,
  `ContinueReadingStrip.tsx`, `libraryFilter.ts`, `SourceBadge.tsx`,
  `BookRow.tsx`) — the bounded-tidy surface (D13-16).
- `tests/e2e/portability/round-trip.spec.ts` (+ `_portability.ts`) — the
  09-06 two-context harness the core-flow spine extends (D13-08/09).
- `src/app.css` — token-only authored CSS; the 09-07 header-geometry fix
  (`minmax(auto,25%)` cap) the header slimming must respect.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **09-06 two-context round-trip harness** (`tests/e2e/portability/`) —
  machine A/B surrogate with raw IndexedDB row access; the ACPT-06 spine is
  an extension, not a rebuild.
- **`applyTheme` token writer** — the exact set of custom properties the
  inline script mirrors pre-React; one source of shape truth.
- **SettingsContext save path** (debounced + dual-event flush) — the hook
  point for mirror writes; wipe/reset seams already exist.
- **Phase 6 acceptance ledger + protocol** — the runbook/record-sheet shape
  the NVDA/VO preparations copy.
- **Honest full-suite gate pattern** — 09-07-OUTPUT.md / 12-08-OUTPUT.md
  records define the phase-exit evidence format.

### Established Patterns
- Zod-at-boundary; typed failure catalog; calm DOC-06 voice (`.status` live
  region) for any new UI copy.
- Token-only authored CSS; no CSS motion on progress surfaces;
  prefers-reduced-motion global gate.
- Pitfall 8 destructive-action isolation (single call sites) — preserved
  when moving TagEntry/chrome.
- Additive-only schema/Dexie changes (Pitfall 9) — no store changes
  expected this phase.
- Instrument-ships-now / requirement-closes-at-proof split (04-02 PAGE-01 →
  06-04 ACPT-02 precedent) — D13-07 mirrors it for ACPT-05.

### Integration Points
- `index.html` inline script + `:root` tokens (first paint).
- `SettingsContext`/`settingsStore` (mirror write/clear seams).
- `ArticleView` header + article-top metadata spot; `App.tsx` back
  affordance.
- `ProgressHairline`/`PaginatedSurface` (offset-anchored ratio source).
- `LibraryView` section structure (bounded tidy).
- `tests/e2e/` — cold-load no-snap spec, core-flow spine spec, timeout
  fake-timers unit test, full-suite gate invocation.

</code_context>

<specifics>
## Specific Ideas

- **"The jumping around of content on load is really bad right now"** — the
  user's confirmation that POLISH-01 is a felt pain, and the reason the
  mirror covers all settings, not just mode (D13-02).
- **"In page mode that [header] will be on every page — needs to be pretty
  minimal"** — the slimming principle for D13-13: the header is repeated
  chrome; every pixel is paid per page.
- **"Tag menu shouldn't be there"** — TagEntry's header residency was the
  specific irritant; it moves to a render-once article-top spot.
- **"Highlight/note modal always goes in top-left corner — seems like a
  visual bug"** — treated as a regression against the 06-06 intended
  dialog placement, not a redesign.
- **"There's no real navigation… we need standardized nav"** — one calm,
  consistent back affordance; breadcrumbs explicitly rejected to protect
  the slimmed header.
- **"Home page needs more organization and polish. Feels haphazard"** —
  bounded tidy within existing components; researcher names the concrete
  irritants first (D13-16).

</specifics>

<deferred>
## Deferred Ideas

- **NVDA v2.0-surface addendum flows** — extending ACCEPTANCE-PROTOCOL.md
  with library/ingest/review/export scripted flows for NVDA+Firefox; future
  protocol extension when the surface stabilizes.
- **No-reflow-at-all reading surface** — gating content behind
  pagination/measurement readiness so pages never appear late; revisit only
  if the settings-flash fix leaves felt jumping (D13-03 boundary).
- **Stacked-modal sequential-focus divergence** (Phase 09 open item) —
  engine-divergent focus behavior with proven safety properties; stays a
  human product decision, deliberately not folded (D13-11).
- **Library redesign / new library features** — anything beyond the bounded
  tidy (D13-16): new organization models, full-text search, folders —
  future milestone items.
- **JAWS coverage** — protocol already records it as stretch/if-hardware;
  unchanged.

</deferred>

---

*Phase: 13-polish-and-acceptance*
*Context gathered: 2026-08-18*
