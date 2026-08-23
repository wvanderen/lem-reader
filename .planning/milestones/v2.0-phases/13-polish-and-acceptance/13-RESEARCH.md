# Phase 13: Polish and Acceptance - Research

**Researched:** 2026-08-18
**Domain:** FOUC elimination (localStorage paint hint), offset-anchored progress semantics, manual SR acceptance logistics, cross-engine e2e core-flow spine, UI chrome polish (header slimming, dialog centering, back nav, library tidy)
**Confidence:** HIGH (codebase-grounded; the one external claim — dialog centering — verified against the WHATWG HTML Rendering spec)

## Summary

Phase 13 is the v2.0 quality gate. Unlike greenfield phases, every substrate it needs already exists in the codebase — this research is therefore primarily a **seam map of the exact files, helpers, and precedents each locked decision rides**, plus one externally verified diagnosis (the top-left dialog bug). Four workstreams land as waves: (1) POLISH-01 kills the first-paint flash via a localStorage mirror + inline pre-React script (`index.html` is currently a 12-line shell — the script is new); (2) POLISH-02 replaces PaginatedSurface's `current/total` ratio with an offset-anchored formula whose substrate (`pageStartGlobalOffset`, `graphemeLength`) and precedent (LibraryRow's D8-11 `graphemeOffset/total` ratio) both already ship; (3) ACPT-05 is a **prepare-then-user-runs-later** deliverable (runbook + record sheet copying the Phase 6 ledger shape); (4) ACPT-06 extends the proven 09-06 two-context round-trip harness into a UI-driven `.md` spine across the 3-engine matrix, folds the Phase 11 fake-timers gap, and ends on the honest `npm run test` exit-0 gate (last green: 12-08, unit 1162/13 skips + e2e 1000/0/6 skips).

The user-widened chrome workstream has concrete diagnoses: the NotePopover "top-left" bug is **`dialog.highlight-popover { margin: 0 }` in app.css L1476 defeating the UA stylesheet's `margin: auto` modal centering** — verified against the WHATWG HTML Rendering §15.3.3 UA stylesheet, and the same `margin: 0` pattern exists on `wipe-confirm`, `library-remove-confirm`, and `import-preview` (all documented as "centered" — the researcher diagnosis D13-14 asks for). Header slimming is bounded by the 09-07 geometry lesson (`minmax(auto, 25%)` cap; TagEntry's form alone is ~103px and forces internal header scroll even at desktop widths — the exact irritant D13-13 removes). The back affordance integrates with the App.tsx hash router (three views; `history.back()` + `#/` fallback; the Gap-3 fragment guard already tolerates `#/` assignment).

**Primary recommendation:** Land polish fixes first (mirror → progress formula → chrome polish), then the ACPT-05 runbook prep + ACPT-06 spine, with the D13-11 fake-timers gap test and the honest full-suite gate last. Install **zero new packages** — every mechanism (localStorage, MutationObserver, pageStartGlobalOffset, the two-context harness, fake timers) already ships in the repo.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D13-01: Sync mirror via localStorage + inline pre-React script.** A localStorage key mirrors the persisted ReaderSettings; a small inline script in `index.html` applies mode/theme/typography to `:root` before React mounts. Dexie stays the source of truth; hydration reconciles and self-corrects a stale hint. Chosen over hold-render: no cold load pays a visible IndexedDB round-trip; this is the standard FOUC remedy.
- **D13-02: The mirror covers ALL settings** — reading mode, theme, and typography in one key, one mechanism, one test. Targets the whole "jumping around on load" family the user reported, not just the mode flip.
- **D13-03: The bar is settings-flash only.** Pagination-settle (pages appearing after measurement) is explicitly out of scope. The SC#1 Playwright cold-load test asserts zero mode/theme/token flip on first paint with persisted non-default settings. Wipe/reset must clear the mirror; storage-failure (STATE-05) paths must not fight it (the mirror is a hint — it never routes recovery UI).
- **D13-04: NVDA+Firefox runs the protocol AS-DOCUMENTED** — the six v1.0 scripted flows + five exploratory charters in `docs/ACCEPTANCE-PROTOCOL.md`, no v2.0 addendum (deferred idea). Honest to SC#3's letter.
- **D13-05: VoiceOver+Safari re-run, scoped to the NEW v2.0 surfaces** (library browse/search/tags, ingest form + refusals, review panel jump/curate, export/import dialogs, book groupings). Supplementary evidence honoring the protocol's own re-run rule ("material change to the reader surface" — five phases' worth) — NOT an ACPT-05 gate. Runnable on the user's macOS hardware.
- **D13-06: Findings policy = fix then re-run (06-06 precedent).** Blocker/major findings are fixed in-phase and affected flows re-run until zero blocker/major; minors are recorded and deferred.
- **D13-07: Prepare-then-run-later logistics.** Plans ship the runbook + record sheet; the user runs NVDA+Firefox manually on Windows hardware on their own schedule after preparation. ACPT-05 flips only when results land (instrument-ships-now / requirement-closes-at-proof — the 04-02 / 06-04 precedent). The VO re-run likewise: user runs it when ready; a findings fix cycle re-runs affected flows (D13-06).
- **D13-08: One deterministic upload format anchors the spine** — planner confirms (recommended: `.md`, network-free and deterministic) — driving ingest → read → highlight → export → re-import across chromium/firefox/webkit. The other intake paths (URL, paste, PDF, EPUB) stay covered by their existing per-phase specs; books are excluded from the spine.
- **D13-09: "Without content loss" = the 09-06 bar, extended.** Exported-then-reimported articles/highlights/notes/positions/preferences are byte-equal at the raw IndexedDB row level; every highlight re-resolves `confident` (tri-state surfacing intact); the reimported article opens, paginates, annotates, and restores location identically.
- **D13-10: Honest full-suite phase gate** — `npm run test` exits 0 in one invocation, fail counts recorded in the phase OUTPUT record (locked discipline, not re-negotiated).
- **D13-11: Fold the Phase 11 acknowledged gap** — the 30s PDF extraction-timeout firing path (withPdfDocument race) gets its fake-timers unit test here: zero production changes, closes 11-VERIFICATION.md § Acknowledged Gaps. The Phase 09 stacked-modal focus item stays deferred (product decision, not a test).
- **D13-12: Scope call — all four chrome items fold into Phase 13.** Explicit user decision during this discussion. REQUIREMENTS.md gains them at planning time (POLISH-03..06 candidates) so traceability stays honest; planning must reflect the widened boundary.
- **D13-13: Header slimmed; TagEntry leaves the persistent header.** Tags edit from a calm metadata spot at the article top (under title/byline — rendered once, not on every paginated page). The header becomes title + essential controls only, minimal because page mode repeats it on every page; target: no internal header scrolling at reference viewports (360×640 — the 09-07 geometry lesson: header growth broke pagination).
- **D13-14: Note/highlight modal pinned top-left is a bug.** Restore the 06-06 intended placement (NotePopover was deliberately promoted to a modal `<dialog>` + showModal); researcher diagnoses the anchoring regression and the fix follows the existing UI-SPEC dialog contracts.
- **D13-15: Standardized nav = a compact "Back to library" affordance at the article header start**, using `history.back()` with a `#/` fallback, same anatomy on every view (article, review panel), keyboard-reachable. Chosen over breadcrumbs (extra vertical chrome vs the slimmed header).
- **D13-16: LibraryView bounded tidy.** Reorganize within existing components — clear sections (continue reading / add content / library list), consistent spacing tokens, calmer control hierarchy. No new features; the researcher first audits what "haphazard" means concretely (ordering, density, visual weight, control placement) before CSS changes.

### the agent's Discretion

- **POLISH-02 formula details (not discussed — roadmap prescribes the approach):** exact offset-anchored formula and boundary values (1-page article at open, within-page offset contribution), scrolling-mode parity, whether library progress hairlines adopt the same formula for consistency (Phase 8's ≥98% finished-state convention), PageIndicator "N of M" unchanged unless research finds cause.
- **Mirror mechanics:** localStorage key shape/versioning, write timing (ride the existing debounced save + dual flush), invalidation on WipeConfirm/resetLocalData, first-run (no mirror → defaults paint), cross-engine localStorage behavior in Playwright contexts.
- **Spine format confirmation** (.md recommended — determinism, no network).
- **Runbook/record-sheet format** for the NVDA + VO runs; where results land (13-VERIFICATION.md).
- **Slimmed header composition** — which controls remain (mode toggle, settings, page indicator placement) and the article-top metadata spot anatomy (TagEntry placement, source line integration).
- **Note-modal root-cause diagnosis** — which surface(s) actually pin top-left (reader NotePopover vs review-panel dialogs) and why.
- **Back-affordance details** — icon+label copy, focus behavior, review-panel consistency.
- **LibraryView tidy specifics** — section order, spacing, which controls cluster; calm-voice and token-only CSS discipline apply.
- **Wave ordering** — polish fixes before the acceptance runs; the full-suite gate lands last (gap-closure precedent).

### Deferred Ideas (OUT OF SCOPE)

- **NVDA v2.0-surface addendum flows** — extending ACCEPTANCE-PROTOCOL.md with library/ingest/review/export scripted flows for NVDA+Firefox; future protocol extension when the surface stabilizes.
- **No-reflow-at-all reading surface** — gating content behind pagination/measurement readiness so pages never appear late; revisit only if the settings-flash fix leaves felt jumping (D13-03 boundary).
- **Stacked-modal sequential-focus divergence** (Phase 09 open item) — engine-divergent focus behavior with proven safety properties; stays a human product decision, deliberately not folded (D13-11).
- **Library redesign / new library features** — anything beyond the bounded tidy (D13-16): new organization models, full-text search, folders — future milestone items.
- **JAWS coverage** — protocol already records it as stretch/if-hardware; unchanged.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| POLISH-01 | Reader sees the persisted reading mode on first paint with no flash or snap to a different mode | Flash source pinpointed (SettingsContext L61 `useState(DEFAULT_SETTINGS)` + async Dexie hydrate L81-105 + mount-time `applyTheme(DEFAULT)` L74-76); two-part mirror remedy mapped (inline script in index.html replicating applyTheme's 6 token writes + `data-theme`; lazy-init of SettingsContext state from mirror so the first React render matches); wipe/reset seam (`resetLocalData`) and no-snap test mechanism (addInitScript MutationObserver) documented |
| POLISH-02 | Progress-bar semantics reflect actual position (1-page ≠ 100% on open; multi-page progresses from the start) | Bug located (PaginatedSurface L585 `page={{current, total}}` → ProgressHairline N/M); offset-anchored substrate verified shipped (`pageStartGlobalOffset` anchor.ts L59, `graphemeLength` normalizeText.ts L109, LibraryRow D8-11 ratio precedent); formula options + boundary values documented; strengthen-only audit of progress.spec.ts (scrolling-mode assertions only — no paginated N/M assertions exist to preserve) |
| ACPT-05 | Documented SR acceptance flows complete on NVDA+Firefox, closing the v1.0 A4 boundary | Protocol read (v1.0: 6 flows + 5 charters, D6-07 severity rubric, zero-blocker/major policy); Phase 6 ledger located at `.planning/milestones/v1.0-phases/06-prototype-acceptance/06-VERIFICATION.md` (findings-table shape to copy); D13-07 prepare-then-run split mapped to deliverables (runbook + record sheet; ACPT-05 stays unchecked until results land) |
| ACPT-06 | v2.0 core flow (ingest → read → highlight → export → re-import) across Chromium/Firefox/WebKit without content loss + honest full suite | 09-06 harness mapped (`tests/e2e/portability/_portability.ts` two-context machine A/B + raw IndexedDB row truth + Node bundle builder); UI-driven precedents verified (.md upload via `setInputFiles` in markdown-upload.spec.ts incl. ING-06 threshold-clearing payload; UI highlight creation in annotations specs); D13-11 fake-timers gap test target read (server/pdfToBlocks.ts `withPdfDocument` L619-651); honest-suite baseline = 12-08 record (exit 0) |
| POLISH-03..06 (candidates, added at planning per D13-12) | Chrome polish: header slim / modal placement / back affordance / library tidy | Root causes diagnosed: `margin: 0` defeats UA `margin: auto` dialog centering (WHATWG-verified; affects highlight-popover + wipe-confirm + library-remove-confirm + import-preview); header internal scroll traced to TagEntry ~103px form under the 09-07 `minmax(auto,25%)` cap; back-affordance router integration points mapped (App.tsx parseHash + Gap-3 guard + ReviewView header); LibraryView structure audited (h1 → IngestControl → status → ContinueReadingStrip → search/tag-filter → list) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| First-paint settings application (POLISH-01) | Browser document (inline pre-React script in index.html) | React (SettingsContext lazy-init + Dexie reconcile) | The flash happens between first paint and React mount; only a synchronous script in `<head>`/`<body>` before the module bundle can write `:root` tokens pre-paint. React owns reconciliation; Dexie stays truth |
| Settings truth + persistence | Dexie via `settingsStore` (existing) | localStorage mirror (best-effort hint) | D13-01 locked: mirror is a paint hint only; recovery UI (STATE-05) never reads it |
| Progress ratio computation (POLISH-02) | Pagination engine coordinate substrate (anchor.ts, D-05 grapheme offsets) | PaginatedSurface → ProgressHairline (presentational) | The formula is pure data over `pageStartGlobalOffset`/`graphemeLength`; rendering stays the aria-hidden decorative hairline |
| Manual SR acceptance (ACPT-05) | Human run on Windows hardware (user) | Docs (runbook + record sheet prepared in-phase) | D13-07 locked: instrument ships now, requirement closes at proof |
| Core-flow spine (ACPT-06) | Playwright e2e (3-engine matrix) | Vite dev middleware `/api/ingest` (server pipeline for .md) | The spine is UI-driven end-to-end; the middleware is the real ingest runtime (07-06 guardrail) |
| Dialog placement fix (D13-14) | CSS (app.css) | — | `margin: auto` restores UA centering; no JS positioning (don't hand-roll) |
| Back affordance (D13-15) | App shell (App.tsx router + ArticleView/ReviewView headers) | Browser history API | One shared anatomy component; `history.back()` + `#/` fallback respects the Gap-3 fragment guard |
| Library tidy (D13-16) | LibraryView component tree (existing components) | app.css tokens | Bounded reorg; no new features, no schema/store changes |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (no new packages — all existing) | — | — | Phase 13 installs NOTHING. Every mechanism substrate ships: localStorage (browser), MutationObserver (browser), `pageStartGlobalOffset`/`graphemeLength` (src), the two-context harness (tests/e2e/portability/_portability.ts), Playwright 1.61.1, Vitest fake timers, Dexie 4.4.4 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest `vi.useFakeTimers` | 4.1.10 (installed) | D13-11 30s-timeout race test | Advance the clock past `PDF_EXTRACTION_TIMEOUT_MS`; assert typed `server-error` rejection + `loadingTask.destroy()` in finally |
| Playwright `page.addInitScript` + `expect.poll` | 1.61.1 (installed) | Cold-load no-snap observer; settle-race-proof assertions | addInitScript runs before any app code on navigation — the only reliable "from navigation start" observation point |
| `MutationObserver` (browser) | — | No-snap recording of `documentElement` attribute/style mutations | Installed by addInitScript; records every `data-theme`/custom-property write with timestamps |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| localStorage mirror (D13-01) | Hold-render until Dexie hydrates | Rejected by D13-01 — every cold load pays a visible IndexedDB round-trip; mirror is the standard FOUC remedy |
| localStorage mirror | Cookie mirror | Cookies ship to servers (no server here, but pointless payload) and are size-capped; localStorage is the natural same-origin store |
| Inline script token writes | Flash-hiding `visibility:hidden` gate | Hides ALL first paint (worse); D13-03 also excludes pagination-settle gating |

**Installation:**
```bash
# NOTHING — zero new packages this phase. Any plan that adds a dependency is out of scope.
```

**Version verification:** All versions verified from `package.json` in-repo (2026-08-18): playwright `@playwright/test` 1.61.1, vitest 4.x (`test:unit`), dexie 4.4.4, react 19.2.8. No registry lookups needed — nothing is installed. [VERIFIED: package.json]

## Package Legitimacy Audit

> **No packages installed this phase.** Every recommended mechanism is either a browser platform primitive (localStorage, MutationObserver, `history.back`) or an in-repo module (anchor.ts, _portability.ts). No registry verification required; no `[ASSUMED]` package claims made.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
COLD LOAD (POLISH-01)                          PAGE TURN (POLISH-02)
─────────────────────                          ─────────────────────
index.html                                     PaginatedSurface commit
  └─ inline script (NEW)                         ├─ pages[] + currentPageIdx
      ├─ read mirror key (localStorage)          ├─ pageStartGlobalOffset(article, pages[i])  ← D-05 coords
      ├─ JSON.parse (defensive, try/catch)       ├─ graphemeLength(article)                   ← total
      ├─ write data-theme + 6 tokens on :root    └─ ratio = offset/total (boundary-tested)
      └─ fail silent → CSS literal fallbacks    ProgressHairline (aria-hidden, scaleX, NO motion)
            │                                             ▲
            ▼                                             │ presentational only
React mounts                                            PageIndicator "N of M" (unchanged)
  └─ SettingsContext
      ├─ useState lazy-init reads mirror (NEW)  ← first render ALREADY persisted mode
      ├─ applyTheme(mirror) — no token snap
      └─ loadSettings() (Dexie truth)
          ├─ matches mirror → nothing visibly changes
          └─ differs (stale) → self-correct + resave (mirror rides saveSettings)

SETTINGS SAVE (existing path + mirror write)    CHROME POLISH
────────────────────────────────────            ────────────────────────────
update()/reset() → scheduleSave (400ms debounce)  dialog.margin:0 → margin:auto   (D13-14, UA centering)
  ├─ saveSettings(s) → Dexie (truth)              TagEntry → article-top spot     (D13-13, 09-07 cap)
  └─ mirror write (NEW, same value, try/catch)    Back-to-library affordance      (D13-15, hash router)
flushSave (visibilitychange/pagehide) — mirror rides flush
WipeConfirm db.delete() → resetLocalData → mirror.clear() (NEW)

ACPT-06 SPINE (one spec, 3 engines)
──────────────────────────────────
context A (machine A)                          context B (machine B)
 upload .md via IngestControl  ──/api/ingest──▶ (transfer: export zip file)
 read + create highlight (UI)                    import via SettingsPanel
 export bundle via Settings UI                   ├─ raw IndexedDB rows byte-equal (09-06 bar)
                                                 ├─ highlights re-resolve confident
                                                 └─ reimported article opens/paginates/
                                                    annotates/restores identically

ACPT-05 (prepare now, user runs later)
─────────────────────────────────────
plans ship: runbook (docs/ACCEPTANCE-PROTOCOL.md v1.0 as-documented)
          + record sheet (13-VERIFICATION.md section, Phase 6 ledger shape)
user runs:  NVDA+Firefox on Windows (ACPT-05 — flips only at results)
          + VoiceOver+Safari on macOS (D13-05 supplementary, v2.0 surfaces)
```

### Recommended Project Structure

```
index.html                      # + inline pre-React mirror script (D13-01)
src/settings/
  settingsMirror.ts             # NEW — read/write/clear mirror (single seam; Zod-shape check)
  SettingsContext.tsx           # lazy-init from mirror; mirror rides scheduleSave/flush; resetLocalData clears
  applyTheme.ts                 # UNCHANGED (inline script replicates its writes; tokens.ts maps stay the source)
src/reader/
  PaginatedSurface.tsx          # ProgressHairline props: offset-anchored ratio (POLISH-02)
  ProgressHairline.tsx          # ratio path (offset/total) replaces N/M page prop
src/routes/ArticleView.tsx      # header slimming; article-top metadata spot; Back affordance
src/routes/review/ReviewView.tsx# Back affordance (same anatomy)
src/ingestion/library/LibraryView.tsx (+ siblings)  # bounded tidy (D13-16)
src/app.css                     # dialog margin:auto fixes; header geometry; tidy tokens
docs/
  ACCEPTANCE-PROTOCOL.md        # UNCHANGED (runs as-documented, D13-04)
tests/e2e/
  polish/cold-load-no-snap.spec.ts    # NEW — SC#1
  polish/first-paint-progress.spec.ts # NEW — SC#2 boundary e2e
  portability/core-flow-spine.spec.ts # NEW — ACPT-06 (extends _portability.ts)
  chrome/*.spec.ts                    # NEW — header geometry / dialog centering / back nav / library tidy
tests/unit/
  pagination/progress-formula.test.ts # NEW — formula + boundary values (pure)
  settings/mirror.test.ts             # NEW — mirror read/write/clear/stale/invalid
  server/pdfTimeout.test.ts           # NEW — D13-11 fake-timers race
.planning/phases/13-polish-and-acceptance/13-VERIFICATION.md  # ACPT-05/VO record sheet sections
```

### Pattern 1: Inline mirror script + lazy-init (the two-part FOUC remedy)

**What:** D13-01's inline script can only fix the **pre-React paint** (theme + typography tokens on `:root`). The reading-mode snap is a *React state* problem — `effectiveMode` decides which surface mounts — so the mode needs SettingsContext to **lazy-init its state from the mirror** so the first React render already uses the persisted mode.

**When to use:** Both halves are load-bearing. Without the lazy-init, the mount-time `applyTheme(DEFAULT_SETTINGS)` effect (SettingsContext L74-76) would snap the mirror's tokens back to defaults for the frames before Dexie hydrates — reintroducing the flash through React itself.

**Why:** [VERIFIED: src/settings/SettingsContext.tsx L61, L74-105; src/routes/ArticleView.tsx L361-362] `useState(() => DEFAULT_SETTINGS)` + async `loadSettings()` + the mount effect `applyTheme(settings)` are the three cooperating sources of the flash. The mirror must feed all three.

```html
<!-- index.html — sketch (final shape is planner's) -->
<script>
  // Mirror paint hint (D13-01). try/catch everything: a corrupt/absent/full
  // localStorage must fail SILENTLY to the CSS literal fallbacks (18px/1.6/0
  // — the 02-04 cascade contract). No innerHTML anywhere; setProperty +
  // dataset.theme only (applyTheme's exact writes, T-02-02 parity).
  (function () {
    try {
      var raw = localStorage.getItem("lem-settings-mirror"); // key name: planner
      if (!raw) return; // first run → defaults paint (D13-03)
      var s = JSON.parse(raw);
      if (!s || typeof s !== "object") return;
      var r = document.documentElement;
      // Defensive: every value is enum/number-shaped before it reaches CSS
      r.dataset.theme = String(s.theme);
      r.style.setProperty("--font-size", Number(s.size) + "px");
      // ... --font-body/--line-height/--letter-spacing/--word-spacing/--measure
      // via the same token maps (inline copies of FONT_STACKS/SPACING_PRESETS
      // values keyed by s.font/s.spacing — the script cannot import tokens.ts)
    } catch (e) { /* mirror is a hint — never route recovery UI (D13-03) */ }
  })();
</script>
```

```typescript
// SettingsContext — the lazy-init half (sketch)
const [settings, setSettings] = useState<ReaderSettings>(() => {
  const hinted = readSettingsMirror(); // settingsMirror.ts — validates shape, returns null on any doubt
  return hinted ?? DEFAULT_SETTINGS;   // first run: defaults (current behavior)
});
// Mount effect unchanged: applyTheme(settings) now paints the SAME values the
// inline script wrote → zero token delta between pre-React paint and React mount.
// loadSettings() then reconciles: Dexie truth wins; a stale mirror self-corrects
// on the next scheduleSave (the mirror write rides the existing save path).
```

**Mirror-write seam:** `scheduleSave(next)` already funnels every `update()`/`reset()` (SettingsContext L113-129) and `flushSave` covers tab-hide — the mirror write hangs off the same value (`pendingRef.current`), wrapped in try/catch so a quota-blocked localStorage never classifies as a storage failure. **Mirror-clear seam:** `resetLocalData` (L194-207) — the WipeConfirm path — clears the key; localStorage survives `db.delete()`, so this clear is mandatory or a wiped reader re-paints the dead preferences forever (Pitfall 1 below).

### Pattern 2: Offset-anchored progress (POLISH-02)

**What:** Replace `page.current / page.total` with a D-05 grapheme-offset ratio.

**When to use:** PaginatedSurface → ProgressHairline. Scrolling mode keeps its scroll ratio (already position-anchored: 0 at top; a one-screen article guards `scrollMax ≤ 0` → 0).

**Why:** [VERIFIED: src/reader/PaginatedSurface.tsx L585; src/pagination/anchor.ts L59-76; src/content/normalizeText.ts L109-111; src/ingestion/library/LibraryRow.tsx (`ratio = location.graphemeOffset / total`)] The substrate and the Phase 8 precedent both ship. LibraryRow already renders `ProgressHairline progress={graphemeOffset/total}` — the reader surface adopting the same coordinate system is the consistency play the discretion area names.

```typescript
// Recommended formula (start-anchored — see Open Questions for the discretion)
// PaginatedSurface, on commit/turn:
const pageStart = pageStartGlobalOffset(article, pages[currentPageIdx]!); // D-05 coords
const total = graphemeLength(article);                // canonical length helper
const ratio = total > 0 ? Math.min(1, pageStart / total) : 0;

// Boundary values this formula produces (encode as unit tests):
//   1-page article, open       → pageStart 0 / total T → 0%   (SC#2 ✓ — was 100%)
//   N-page article, page 1     → 0/T                    → 0%  (SC#2 ✓ — "progresses from the start")
//   N-page article, last page  → (T − lastLen)/T        → <100% (progress grows monotonically per turn)
//   empty/defensive            → 0 (ProgressHairline already clamps [0,1])
```

**PageIndicator is unchanged** ("N of M", D-05: page numbers are never persistent identity — the research found no cause to touch it). ProgressHairline stays `aria-hidden`, `transform: scaleX`, `transformOrigin: left`, **zero CSS motion** (UI-SPEC §Interaction 12 — the no-transition assertion in progress.spec.ts must keep passing). Strengthen-only audit: [VERIFIED: tests/e2e/progress.spec.ts] all five existing tests assert scrolling-mode behavior + the no-motion/origin invariants — none assert the paginated N/M value, so replacing the paginated ratio removes no existing assertion.

### Pattern 3: Dialog centering restoration (D13-14)

**What:** `dialog.highlight-popover { margin: 0 }` (app.css L1476) defeats the UA stylesheet's `margin: auto` modal centering. Restore auto margins.

**Why (root cause, externally verified):** [CITED: html.spec.whatwg.org/multipage/rendering.html §15.3.3] The WHATWG UA stylesheet centers `dialog` via `margin: auto` with `position: fixed` + `inset-block: 0` + `inset-inline-start/end: 0` under `dialog:modal`. Author `margin: 0` overrides the auto margins, so the over-constrained fixed box resolves to the start edges — **inline-start + block-start = top-left in LTR**. The CSS comment at app.css L1489-1490 ("showModal centers the element in the viewport") documents the intended centered box; the `margin: 0` declaration above it silently defeats that intent. This is the entire regression — no JS positioning is involved or needed.

**Scope of the diagnosis (D13-14 asks which surfaces):** [VERIFIED: src/app.css grep] The same `margin: 0` + "centered" intent pattern exists on FOUR modal dialogs:

| Surface | CSS block | Intended placement | Currently |
|---------|-----------|--------------------|-----------|
| `dialog.highlight-popover` (NotePopover — the reported bug) | app.css L1475 | centered box (comment L1489) | pinned top-left |
| `dialog.wipe-confirm` | app.css L669 | "vertically centered via auto margin" (comment L678-679) | pinned top-left |
| `dialog.library-remove-confirm` | app.css L2030 | centered modal (clone of wipe-confirm) | pinned top-left |
| `dialog.import-preview` | app.css L2240 | centered modal | pinned top-left |

The two **side sheets** — `dialog.settings-panel` (L442) and `dialog.annotations-drawer` (L1699) — intentionally use `margin: 0` geometry (anchored to the inline end via their sheet rules); **do not touch them**. The planner should fix all four centered modals in one sweep (`margin: auto` — or `margin-inline: auto; margin-block: auto`) since they share one root cause and one 06-06 dialog contract; a centered-dialog e2e assertion (boundingBox horizontally+vertically centered within tolerance, all 3 engines) covers the family.

### Pattern 4: UI-driven core-flow spine (ACPT-06)

**What:** One spec extends the 09-06 harness: everything through the real UI.

**When to use:** `tests/e2e/portability/core-flow-spine.spec.ts` (or similar), plain `test(...)` so it inherits the 3-project matrix automatically. [VERIFIED: playwright.config.ts declares chromium/firefox/webkit projects; no per-project testMatch filtering]

**Reusable precedents (do not fork):**
- `.md` upload: [VERIFIED: tests/e2e/library/markdown-upload.spec.ts] `setInputFiles` with a Buffer; payload must clear ING-06 thresholds (≥3 blocks AND ≥500 chars) and the 5-offset anchor gate — the spec's `MARKDOWN_WITH_FRONTMATTER` payload is proven; reuse it (or a sibling with interleaved unique tokens per the 12-04 prose-uniqueness lesson).
- UI highlight creation: [VERIFIED: tests/e2e/annotations/] capture-highlight.spec.ts + `_fixtures.ts` prove real-UI selection→toolbar→mark flows.
- Export/import through Settings UI: [VERIFIED: _portability.ts `openSettings`/`bundleInput` helpers + round-trip.spec.ts] the two-context machine A/B pattern with `context` isolation; raw IndexedDB row reads for byte-equality (D13-09).
- Books are excluded (D13-08) — the books round-trip already has its own SC#4 spec (round-trip.spec.ts L296).

**Boundary:** "the reading engine cannot tell an ingested article from a fixture" — the spine's reimported article must open, paginate, annotate, and restore location identically (assert via the existing pagination/persistence helpers, not new forks).

### Pattern 5: Fake-timers race test (D13-11)

**What:** Unit test for `withPdfDocument`'s 30s timeout branch. [VERIFIED: server/pdfToBlocks.ts L619-651 — the exact `Promise.race` + `timer` + `destroy`-in-finally shape; 11-VERIFICATION.md § Acknowledged Gaps names this closure path]

```typescript
// Sketch — zero production changes (the gap's own closure terms)
vi.useFakeTimers();
const neverResolvingOp = () => new Promise(() => {}); // never settles
// getDocumentProxy must resolve (stub a minimal proxy: numPages within cap,
// loadingTask.destroy = vi.fn())
const promise = withPdfDocument(bytes, neverResolvingOp);
await vi.advanceTimersByTimeAsync(PDF_EXTRACTION_TIMEOUT_MS); // 30_000
await expect(promise).rejects.toMatchObject({
  // IngestionError "server-error" — "PDF extraction timed out — the document
  // was too complex to read safely." (assert the typed reason + copy)
});
expect(proxy.loadingTask.destroy).toHaveBeenCalled(); // always-destroy finally
```

Note the file lives in `server/` (outside tsconfig's src scope — the 09-01 precedent acknowledges this layout); existing `tests/unit/server/` specs already import from `server/`, so the test placement is established.

### Anti-Patterns to Avoid

- **Blanket-fixing every `dialog` selector:** the settings panel + annotations drawer are intentional `margin: 0` side sheets — a global `dialog { margin: auto }` "fix" breaks them.
- **JS-positioning the modal** (manual top/left math in NotePopover): the UA already centers via margin; hand-rolled positioning is the anti-pattern the bug demonstrates.
- **Gating render on mirror presence** (hold-render): rejected by D13-01/D13-03.
- **Routing STATE-05 recovery off the mirror:** the mirror is a paint hint; `loadSettings()` remains the sole error-classification path (D13-03).
- **Persisting a page-number-derived progress anywhere:** the ratio is derived per layout; never persisted (D-05; Pitfall 9 additive-only means no store changes this phase anyway).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Modal dialog centering | JS top/left positioning math | UA `margin: auto` centering (`dialog:modal` fixed + auto margins) | The platform centers dialogs natively; the current bug is precisely what hand-positioning drift looks like [CITED: WHATWG rendering spec] |
| First-paint observation in tests | Screenshot-diff loops / fixed sleeps | `addInitScript` MutationObserver recording `documentElement` mutations from navigation start | Only init scripts run before app code; sleep-based flash detection flakes (the 12-08 progress-spec lesson) |
| Progress position math | New offset accumulation walking blocks | `pageStartGlobalOffset` (anchor.ts) + `graphemeLength` (normalizeText.ts) | The D-05 coordinate system already ships; forking it risks the exact offset-drift class 04-09 fixed |
| Machine A/B isolation | Fresh browser instances + manual file plumbing | `_portability.ts` two-context harness + `readRow`/`countRows` | Proven across engines since 09-06; raw IndexedDB row reads are the byte-equality truth path |
| 30s timeout verification | Real 30s waits | `vi.useFakeTimers` + never-resolving op | 30s real waits are flaky budget-eaters; the race is timer-shaped [CITED: 11-VERIFICATION.md closure path] |
| Mirror JSON safety | Ad-hoc `typeof` ladders inline in index.html | One `settingsMirror.ts` seam (shape check + null-on-doubt) reused by script (via inline copy discipline) and React lazy-init | Single validation point; the inline script can't import modules, but its defensive checks mirror the seam's contract (planner decides duplication shape) |

**Key insight:** Phase 13's risk is not missing tooling — it's **forking shipped substrate**. Every formula/helper/harness this phase needs exists and is test-proven; plans should grep-verify reuse (the REUSE-DO-NOT-FORK discipline from 09-03/10-01) rather than write parallel implementations.

## Common Pitfalls

### Pitfall 1: The mirror survives the wipe
**What goes wrong:** `WipeConfirm` runs `db.delete()` — IndexedDB dies, **localStorage does not**. A wiped reader cold-loads to the dead preferences forever (and Dexie then persists them again on the first debounced save — the zombie settings resurrection).
**Why it happens:** Two different storage mechanisms; the destructive path only knows Dexie.
**How to avoid:** `resetLocalData` (SettingsContext L194-207) clears the mirror key — it is the single post-wipe seam (grep-verifiable, mirrors the db.delete single-call-site discipline).
**Warning signs:** e2e wipe test that only asserts Dexie emptiness; a cold-load test passing with a stale mirror.

### Pitfall 2: React re-introduces the flash the inline script killed
**What goes wrong:** Inline script paints persisted theme; React mounts; `applyTheme(DEFAULT_SETTINGS)` fires on mount (SettingsContext L74-76) and snaps tokens to defaults until Dexie hydrates.
**Why it happens:** The mount effect paints state, and state initialized to defaults ≠ mirror.
**How to avoid:** Lazy-init state from the mirror (Pattern 1) so the mount `applyTheme` writes byte-identical values to the inline script. The no-snap test (MutationObserver) catches any residual write that changes a token's value between first record and hydration settle.
**Warning signs:** No-snap test only asserting the pre-React paint, not the full record timeline.

### Pitfall 3: STATE-05 paths fight the mirror
**What goes wrong:** `loadSettings()` returns `unavailable`/`corrupt` and the app resets in-memory to defaults — if that path also *repaints*, a reader with a valid mirror gets a flash on a storage failure; worse, recovery UI keyed off mirror contents.
**Why it happens:** Temptation to make the mirror authoritative when Dexie fails.
**How to avoid:** D13-03 is explicit: the mirror never routes recovery UI. On storage failure, keep what's painted (defaults or mirror — planner picks, but no second flash); classification stays `loadSettings()`'s job. A corrupt *mirror* is even simpler: the read seam returns null → defaults paint (the mirror's own try/catch discipline).
**Warning signs:** Any `localStorage.getItem` in recovery components.

### Pitfall 4: localStorage writes classified as storage failures
**What goes wrong:** Mirror write throws (quota exceeded / blocked storage) and the code routes it through `classifyStorageError` → a StorageBanner appears for a cosmetic hint failure.
**Why it happens:** Sharing the saveSettings error path.
**How to avoid:** Mirror writes are fire-and-forget try/catch no-ops on failure — the hint is best-effort by contract (D13-01).
**Warning signs:** `setStorageState` reachable from a mirror write.

### Pitfall 5: Header slimming re-breaks pagination geometry
**What goes wrong:** Moving TagEntry out but adding a taller metadata spot (or the back affordance) regrows the pinned header row past the `minmax(auto, 25%)` cap at 360×640 — the exact 09-07 regression class (67px viewport → bogus `oversized-block` fallback).
**Why it happens:** The header row is paid on every page; its height subtracts from page capacity.
**How to avoid:** Keep the 09-07 cap rule byte-unchanged; the acceptance bar is **no internal header scrolling at 360×640** (D13-13's own target). Run the pagination corpus specs (PAGE-03/04) after slimming; add a chrome geometry assertion at the reference viewport. The 12-06 chapter-nav is `position: fixed` chrome outside the grid flow — leave it there (mounting in-flow chrome perturbs `.page-viewport` geometry; the 12-06 decision records exactly why).
**Warning signs:** Pagination fallback e2e cells reddening after a "CSS-only" header change.

### Pitfall 6: TagEntry move breaks focus + isolation contracts
**What goes wrong:** The moved TagEntry (or its new container) auto-focuses on mount, stealing focus from the article body (Pitfall 8-5), or the move accidentally touches the destructive-call-site isolation (tagsStore writes are safe, but the pattern discipline carries).
**Why it happens:** New mount point, new effects.
**How to avoid:** Pitfall 8-5 discipline verbatim at the new home: no autoFocus prop, no mount-time `.focus()`, verified by the same grep acceptance; the open-every-fixture + v1-regression specs assert article-body initial focus — keep them green.
**Warning signs:** open-every-fixture.spec.ts focus assertions failing.

### Pitfall 7: `history.back()` exits the app
**What goes wrong:** A reader who deep-links straight into `#/article/x` (fresh tab, no in-app history) presses "Back to library" → `history.back()` navigates *out* of the app (or no-ops).
**Why it happens:** `history.back()` is only correct when there is in-app history to return to.
**How to avoid:** D13-15's own contract: `history.back()` **with a `#/` fallback**. The guard checks whether an in-app entry exists (e.g., `performance.getEntriesByType("navigation")[0].type`/document.referrer heuristics are unreliable — simplest robust shape: maintain an app-history flag set on first in-app navigation, or fall back to `location.hash = "#/"` when `history.length` ≤ 1 or the previous entry wasn't app-routed). Router facts that make the fallback safe: [VERIFIED: src/App.tsx L170-177] the hashchange handler routes any `#/`-prefixed hash; `parseHash` maps unknown `#/` deep links to the list. Setting `location.hash = "#/"` is therefore always a valid route-to-library.
**Warning signs:** Back button tests that only exercise the library→article path.

### Pitfall 8: Full-suite gate flakes (the two known classes)
**What goes wrong:** `npm run test` exits 1 on environment races, not code: (a) webkit `page.goto` dev-server timeouts under full-suite parallelism (12-08 run 2: 4 cells); (b) firefox rAF-throttled scroll/announce settle (12-08 run 1: the progress hairline cell).
**Why it happens:** Documented engine/load races — the 09-07/12-08 records name both classes.
**How to avoid:** Write new specs with `expect.poll` end-condition polling (no fixed sleeps); the gate protocol itself is the precedent: record every run honestly, fix real races (12-08 fixed the sleep in run 1), and only environmental non-reproducers get the "green in isolation + later run" note (12-08 run 2 treatment).
**Warning signs:** New specs using `waitForTimeout` for load-bearing assertions.

### Pitfall 9: The spine's .md payload trips the confidence/anchor gates
**What goes wrong:** A minimal .md fixture produces <3 blocks or <500 chars → ING-06 refuses; or repetitive prose makes a sampled anchor resolve ambiguous → the ingest round-trip gate refuses the article the spine needs.
**Why it happens:** The gates are doing their jobs; fixtures must clear them by construction.
**How to avoid:** Reuse the proven `MARKDOWN_WITH_FRONTMATTER` shape (verified clearing thresholds; prose interleaves distinct tokens). If new prose is written, follow the 12-04 contract: a unique token at least every ~64 graphemes.
**Warning signs:** "This page couldn't be read"-family refusals in the spine's first cell.

### Pitfall 10: PageIndicator / hairline contract drift during POLISH-02
**What goes wrong:** The ratio change quietly adds motion (transition), text content, or aria role to the hairline — breaking UI-SPEC §Interaction 12 / READ-05 / A11Y-08 invariants the existing specs pin.
**Why it happens:** Touching the component invites "improvements."
**How to avoid:** ProgressHairline stays aria-hidden decorative with zero motion (the two invariant tests in progress.spec.ts must stay green byte-unchanged); AT progress rides SectionAnnouncer only; PageIndicator untouched. Strengthen-only: new boundary assertions add, never relax.
**Warning signs:** Any transition property or text node in the hairline diff.

## Code Examples

### No-snap cold-load test mechanism (SC#1)

```typescript
// Source: mechanism derived from Playwright addInitScript semantics + the
// repo's established MutationObserver/e2e discipline (02-03 scroll-spy pattern).
// Sketch — the observer must be installed BEFORE the app bundle runs.
await page.addInitScript(() => {
  // Record every documentElement mutation from navigation start.
  (window as any).__paintRecords = [] as Array<{ t: number; theme: string | null; fontSize: string | null }>;
  const read = () => {
    const cs = getComputedStyle(document.documentElement);
    (window as any).__paintRecords.push({
      t: performance.now(),
      theme: document.documentElement.dataset.theme ?? null,
      fontSize: cs.getPropertyValue("--font-size").trim() || null,
    });
  };
  new MutationObserver(read).observe(document.documentElement, {
    attributes: true, attributeFilter: ["data-theme", "style"],
  });
});
// Seed BOTH truths like a real reader: Dexie reader-prefs (raw put — the
// persistence.spec.ts L90 seeding precedent) + the mirror key, same values,
// NON-default (e.g. theme "dark", readingMode "scrolling", size 22).
// Then: page.goto(article URL); wait for hydration settle (Dexie load effect
// + applyTheme run — poll for a stable record tail); assert:
//   1. records[0] already carries the persisted tokens (inline script worked)
//   2. NO record ever shows a DIFFERENT theme/font-size than the persisted
//      values (no default→persisted flip anywhere in the timeline)
//   3. the mounted mode (scrolling surface, not paginated) is present from
//      the first ArticleView paint — mode assertion via the surface selector.
```

### Back affordance (D13-15 sketch)

```typescript
// Same anatomy component used by ArticleView header start + ReviewView header.
// Native button (keyboard-reachable by construction); calm copy; the router
// facts that make the fallback safe are [VERIFIED: src/App.tsx L43-61, L160-177].
function BackToLibrary({ hasAppHistory }: { hasAppHistory: boolean }) {
  const goBack = () => {
    if (hasAppHistory) history.back();       // preserves the reader's place in history
    else location.hash = "#/";               // Gap-3 guard routes #/ to the list (parseHash fallback)
  };
  return (
    <button type="button" className="back-to-library" onClick={goBack}>
      Back to library
    </button>
  );
}
// hasAppHistory tracking: planner's call (flag on first in-app hashchange in
// App.tsx is the cheap shape; SSR/refresh nuance: a reload mid-article has
// history but back would exit to the prior site — the flag-from-navigation-
// start approach handles this because a fresh load has no prior in-app entry).
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `popover="manual"` div note editor | Native `<dialog>` + showModal (06-06 finding #2) | Phase 6 | The modal AT context is right; only the CSS `margin: 0` regression remains (D13-14 restores centering) |
| Paginated progress = N/M pages | Offset-anchored grapheme ratio (roadmap-prescribed) | This phase | Aligns the reader hairline with the library rows' existing D8-11 ratio and the D-05 restore coordinate system |
| Settings paint = DEFAULT then async swap | localStorage mirror + inline script + lazy-init (D13-01) | This phase | The standard FOUC remedy pattern for local-first settings (Dexie stays truth) |
| Suite gate = per-plan subset honesty | Full `npm run test` single-invocation exit-0 record | Since 04-11 (04-11/09-07/12-08 precedent) | Phase 13 ends on it (D13-10) |

**Deprecated/outdated:**
- Nothing in the dependency set changes; no deprecations apply this phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | NVDA+Firefox on Windows hardware is unavailable to the agent/user-at-planning-time (hence D13-07's prepare-then-run split) — inferred from CONTEXT.md D13-07 itself; environment audit confirms host is macOS | ACPT-05, Environment Availability | None — the split is already the locked decision; if Windows hardware were available earlier the requirement still closes only at recorded results |
| A2 | The inline script cannot import `tokens.ts` (module scripts + inline ordering), so FONT_STACKS/SPACING_PRESETS values are duplicated inline under a sync-check test (unit test asserting the inline strings match the module maps) | Pattern 1 | Low — a drift would only mis-paint typography until Dexie hydrates; the sync test catches it |
| A3 | `expect.poll`-style end-condition polling remains the repo's flake-proofing convention for new specs (12-08 precedent generalized) | Pitfall 8 | Low — worst case a new spec flakes once and gets the 12-08 treatment |
| A4 | The `.md` spine format confirmation (D13-08 "planner confirms") follows the research recommendation (.md) — deterministic, network-free, middleware-served, threshold-clearing payload proven | Pattern 4 | Low — HTML-upload variant also has spec precedent if the planner diverges |
| A5 | Chrome-polish items enter REQUIREMENTS.md as POLISH-03..06 at planning time (D13-12 states this; exact IDs are the planner's) | Phase Requirements | None material — traceability bookkeeping |

**All other claims are [VERIFIED: file:line] against the working tree or [CITED: WHATWG/protocol/ledger] against named project documents.**

## Open Questions (RESOLVED)

> All five questions resolved at plan time (2026-08-18). Per-question resolutions cite the adopting plan; the recommendation lines below are preserved for context.

1. **Within-page offset contribution for POLISH-02**
   - What we know: start-anchored (page-start offset / total) satisfies both SC#2 boundaries (1-page opens 0%, multi-page starts ~0% and grows per turn); library rows + scrolling short-article behavior both already show 0-at-start semantics (parity argument).
   - What's unclear: whether the final page should read as "complete" for anyone relying on the hairline shape (start-anchored never shows 100% — matching the library rows' separate `Finished` mark convention, which the reader surface does not have).
   - Recommendation: ship pure start-anchored; boundary tests encode 1-page→0%, page1→0%, monotonic growth, last-page→<100%. If the planner wants a finish signal, mirror the D8-12 `● Finished` mark convention rather than distorting the ratio (discretion area explicitly names the ≥98% convention).
   - Resolution (RESOLVED via 13-02): pure start-anchored formula adopted — `paginatedProgressRatio` in src/pagination/progress.ts with boundary unit tests encoding 1-page→0%, page-1→0%, monotonic per-turn growth, last-page<100%; no finish signal added (the hairline stays a pure ratio; the library rows keep their separate Finished mark).
2. **Mirror key name + write-back policy on stale hydration**
   - What we know: one key, all settings, versioned shape (D13-02); rides scheduleSave + flushSave.
   - What's unclear: exact key name and whether a stale-mirror self-correct happens immediately at hydration (write mirror at hydrate-diff) or only on next save.
   - Recommendation: name it after the settings record it mirrors (`lem-reader-settings-mirror-v1` shape is planner's); self-correct at hydrate when values differ (one extra write, kills drift in the same session).
   - Resolution (RESOLVED via 13-01): key = `lem-settings-mirror-v1` (SETTINGS_MIRROR_KEY in settingsMirror.ts); stale mirror self-corrects immediately at hydration — loadSettings writes the corrected mirror on divergence — and mirror writes ride scheduleSave/flushSave thereafter.
3. **Article-top metadata spot anatomy in paginated mode (D13-13)**
   - What we know: TagEntry + source line leave the pinned header; the pinned header keeps title + essential controls; "rendered once" implies the metadata spot is not permanently visible chrome.
   - What's unclear: whether the spot renders (a) only on page 1 / article start as flow content inside the surface, or (b) a collapsed affordance in the slimmed header. Option (a) is truer to "rendered once" but interacts with page-fragment geometry (chrome must not enter page capacity math — the 12-06 fixed-chrome lesson); option (b) risks re-growing the header.
   - Recommendation: prefer (a) — article-start flow content rendered outside the pagination fragment stream (ArticleView-owned, like the chapter nav's out-of-flow discipline); planner validates geometry against the 360×640 no-scroll bar.
   - Resolution (RESOLVED via 13-04): option (a) adopted — an ArticleView-owned article-top spot rendered exactly once, mounted OUTSIDE the grid header row (no page-viewport oscillation) and OUTSIDE the pagination block stream (no page-capacity math), visible at article start (first page); geometry validated against the 360×640 no-internal-scroll bar with a documented visibility fallback if corpus specs object.
4. **Back-affordance history guard shape** — see Pitfall 7; the flag-on-first-in-app-hashchange shape is recommended but the planner owns the exact mechanism (including the reload-mid-article edge).
   - Resolution (RESOLVED via 13-04): flag-on-first-post-mount-in-app-hashchange adopted — App.tsx tracks `hasAppHistory`, flips it on the first in-app hashchange after mount (initial load and reload-mid-article do not count), passes it as a prop to both views; `history.back()` when true, else `location.hash = "#/"` (parseHash routes it to the library list).
5. **Whether the four centered dialogs get one fix sweep or NotePopover only** — research diagnosed all four sharing the root cause; the sweep is recommended (one CSS change class + one parameterized assertion), but scope confirmation is the planner's per D13-14's letter ("the fix follows the existing UI-SPEC dialog contracts" — all four carry the same contract).
   - Resolution (RESOLVED via 13-03): one sweep — all four centered modals (highlight-popover, wipe-confirm, library-remove-confirm, import-preview) get `margin: auto`; the intentional side sheets (settings-panel, annotations-drawer) stay byte-unchanged; one parameterized dialog-centering.spec.ts covers the family across 3 engines.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 22 LTS (Vite 8 requirement) | dev server, full suite | ✓ (repo runs Vite 8 dev server in CI/tests today) | 22.x | — |
| Playwright browsers (chromium/firefox/webkit) | e2e matrix | ✓ (playwright.config 3 projects; 12-08 ran 1000 e2e cells) | @playwright/test 1.61.1 | — |
| Vite dev server + `/api/ingest` Node middleware | .md spine ingest | ✓ (webServer config; the 07-06 guardrail runtime) | vite 8.x | — |
| NVDA + Firefox on Windows | ACPT-05 execution | ✗ on this host (macOS) — **by design** (D13-07: user runs later on their Windows hardware) | — | Prepare runbook + record sheet; requirement closes at recorded results |
| VoiceOver + Safari on macOS | D13-05 supplementary re-run | ✓ user's hardware (not agent-runnable in CI) | — | User runs when ready; findings fix cycle per D13-06 |
| `npm run test` full suite | ACPT-06 gate | ✓ (last green record: 12-08, exit 0) | — | — |

**Missing dependencies with no fallback:** none blocking — the only unavailable capability (NVDA execution) is explicitly a prepare-then-user-runs deliverable per D13-07.

**Missing dependencies with fallback:** none.

## Validation Architecture

> `workflow.nyquist_validation` is `true` in .planning/config.json — section included.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.x (unit; `npm run test:unit -- --run`) + Playwright Test 1.61.1 (e2e; `npm run test:e2e`); React Testing Library 16.3.2 available for component tests |
| Config file | playwright.config.ts (3 engine projects + throttled perf project); vitest via package defaults + tests/setup.ts |
| Quick run command | `npx vitest run tests/unit/pagination/progress-formula.test.ts` (formula-only) / `npx playwright test tests/e2e/polish/cold-load-no-snap.spec.ts` |
| Full suite command | `npm run test` (vitest --run && playwright test — the D13-10 gate) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| POLISH-01 | Cold load with persisted non-default settings paints them first with zero mode/theme/token flip | e2e (3 engines) | `npx playwright test cold-load-no-snap` | ❌ Wave 0 |
| POLISH-01 | Mirror read/write/clear; stale/invalid mirror → defaults; wipe clears mirror; STATE-05 paths unaffected | unit | `npx vitest run tests/unit/settings/mirror.test.ts` | ❌ Wave 0 |
| POLISH-02 | Offset-anchored formula boundary values (1-page→0%, page1→0%, monotonic, clamp) | unit (pure) | `npx vitest run tests/unit/pagination/progress-formula.test.ts` | ❌ Wave 0 |
| POLISH-02 | 1-page article not 100% on open; multi-page progresses from start (real layout, paginated surface) | e2e (3 engines) | `npx playwright test first-paint-progress` | ❌ Wave 0 |
| POLISH-02 | No-motion + transform-origin + aria-hidden invariants hold (strengthen-only) | e2e (existing) | `npx playwright test progress.spec.ts` | ✅ (keep green byte-unchanged) |
| ACPT-05 | NVDA+Firefox protocol run, zero blocker/major | manual-only (user-run on Windows hardware — D13-07) | — (record sheet in 13-VERIFICATION.md) | ❌ runbook prep (Wave 0 deliverable, not a spec) |
| ACPT-06 | Ingest .md → read → highlight → export → re-import, byte-equal rows + confident re-resolution + identical open/paginate/annotate/restore, 3 engines | e2e (3 engines) | `npx playwright test core-flow-spine` | ❌ Wave 0 |
| ACPT-06 | Full suite exit 0, honest counts recorded | e2e+unit gate | `npm run test` | ✅ command exists; record = phase OUTPUT (12-08 format) |
| D13-11 | withPdfDocument 30s timeout fires typed server-error + destroy-in-finally | unit (fake timers) | `npx vitest run tests/unit/server/pdfTimeout.test.ts` | ❌ Wave 0 |
| POLISH-03 (header) | No internal header scrolling at 360×640; pagination corpus specs stay green | e2e | chrome header-geometry spec | ❌ Wave 0 |
| POLISH-04 (modal) | Centered modals horizontally+vertically centered (boundingBox tolerance), 3 engines | e2e | chrome dialog-centering spec | ❌ Wave 0 |
| POLISH-05 (back) | Back affordance routes to library from article + review; deep-link fallback; keyboard-reachable | e2e | chrome back-nav spec | ❌ Wave 0 |
| POLISH-06 (library) | Tidy structure assertions (section order/visibility); existing library specs byte-unchanged | e2e (existing + light new) | `npx playwright test library/` | ✅ existing; add tidy assertions |

### Sampling Rate
- **Per task commit:** the task's targeted spec (unit or single e2e spec) green
- **Per wave merge:** `npm run test:unit -- --run` + the touched e2e directories
- **Phase gate:** full `npm run test` single invocation, exit 0, fail counts recorded (D13-10) — runs LAST (gap-closure precedent)

### Wave 0 Gaps
- [ ] `tests/e2e/polish/cold-load-no-snap.spec.ts` — POLISH-01/SC#1
- [ ] `tests/unit/settings/mirror.test.ts` — POLISH-01 mirror seam
- [ ] `tests/unit/pagination/progress-formula.test.ts` — POLISH-02 boundary values
- [ ] `tests/e2e/polish/first-paint-progress.spec.ts` — POLISH-02 e2e boundary
- [ ] `tests/e2e/portability/core-flow-spine.spec.ts` — ACPT-06
- [ ] `tests/unit/server/pdfTimeout.test.ts` — D13-11
- [ ] `tests/e2e/chrome/*` — header geometry / dialog centering / back nav / tidy
- [ ] `13-VERIFICATION.md` ACPT-05 + VO record-sheet sections — runbook prep

## Security Domain

> `security_enforcement: true` (config) — included. ASVS Level 1.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | Local-first prototype; no accounts (PROJECT.md Out of Scope) |
| V3 Session Management | no | No sessions |
| V4 Access Control | no | No server-side resources beyond the ingest middleware (unchanged this phase) |
| V5 Input Validation | yes | Mirror payload is untrusted-parsed JSON → defensive try/catch + shape check before any value reaches CSS custom properties or React state (mirror seam returns null on any doubt); values only ever flow into `style.setProperty`/`dataset` (no selector parsing — T-02-02 precedent); spine fixtures stay Zod-validated at the ingest boundary (unchanged) |
| V6 Cryptography | no | Nothing new hashes/encrypts |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Mirror poisoning (hand-edited localStorage → unexpected CSS values) | Tampering | Shape-check at the read seam; every value coerced to enum/number form before `setProperty`; worst case is a bad-looking theme, never script execution (no innerHTML anywhere; `react/no-danger` gate stands) |
| localStorage quota/block exceptions crashing settings saves | DoS (local) | Mirror writes wrapped in try/catch no-op; NEVER classified through `classifyStorageError` (Pitfall 4) |
| Spine fixture regressing the ingest security boundary | Tampering | Reuse the proven payload + the shipped Zod-at-boundary pipeline; strict CommonMark stays the .md boundary (D8-16 — no raw HTML pass-through) |
| New UI copy leaking internal jargon | Informational | Calm DOC-06 voice; `.status` live regions for any new copy (established pattern) |

**No network surface changes, no new dependencies, no store/schema changes (Pitfall 9 additive-only: nothing to add).**

## Project Constraints (from AGENTS.md)

- **GSD workflow enforcement:** work enters through GSD commands (`/gsd-plan-phase` spawned this research; execution via `/gsd-execute-phase`); no direct repo edits outside a GSD workflow.
- **Stack discipline (STACK.md in AGENTS.md):** semantic HTML + authored CSS custom properties (no Tailwind/component suite); React 19 + Vite 8 SPA, `createRoot`, no SSR framework; project-owned pagination engine; Dexie for IndexedDB; Zod at boundaries; Playwright (3 engines) owns layout truth — DOM emulators are not authoritative; no Redux/Zustand (React state/context + domain services); page numbers never persisted as identity; W3C-inspired selectors over normalized text.
- **Anti-danger gate:** `react/no-danger` / `lint:no-danger` — no `dangerouslySetInnerHTML` anywhere (the inline mirror script writes only via `setProperty`/`dataset`).
- **Conventions:** not yet established section — the codebase's de-facto conventions (header comments citing locked decisions, single-responsibility components, verbatim UI-SPEC class hooks, calm copy) carry per the canonical refs.
- **Project skills:** none exist (AGENTS.md reports none) — skip.

## Sources

### Primary (HIGH confidence)
- Working tree (2026-08-18): `src/settings/SettingsContext.tsx`, `src/settings/applyTheme.ts`, `src/settings/defaults.ts`, `src/settings/tokens.ts`, `index.html`, `src/main.tsx`, `src/persistence/settingsStore.ts`, `src/reader/ProgressHairline.tsx`, `src/reader/PageIndicator.tsx`, `src/reader/PaginatedSurface.tsx` (L585), `src/routes/ArticleView.tsx`, `src/reader/Header.tsx`, `src/reader/TagEntry.tsx`, `src/reader/annotations/NotePopover.tsx`, `src/App.tsx`, `src/pagination/anchor.ts`, `src/content/normalizeText.ts`, `src/ingestion/library/{LibraryView,LibraryRow,ContinueReadingStrip}.tsx`, `src/app.css` (L442-477, L665-704, L990-1064, L1449-1539, L2030-2045, L2240-2260), `server/pdfToBlocks.ts` (L600-655), `package.json`, `playwright.config.ts`
- WHATWG HTML Standard, Rendering §15.3.3 (dialog UA stylesheet; fetched 2026-08-18) — dialog `margin: auto` centering + `dialog:modal` fixed positioning
- `docs/ACCEPTANCE-PROTOCOL.md` v1.0 (the ACPT-05 instrument — read in full)
- `.planning/phases/13-polish-and-acceptance/13-CONTEXT.md` (all decisions)
- `.planning/milestones/v1.0-phases/06-prototype-acceptance/06-VERIFICATION.md` (A4 boundary, findings table shape, NotePopover promotion precedent)
- `.planning/phases/11-pdf-intake/11-VERIFICATION.md` § Acknowledged Gaps (D13-11 closure terms)
- `.planning/phases/12-epub-intake/12-08-OUTPUT.md` (honest-suite record format; known flake classes)
- `tests/e2e/progress.spec.ts`, `tests/e2e/portability/_portability.ts`, `tests/e2e/portability/round-trip.spec.ts`, `tests/e2e/library/markdown-upload.spec.ts` (harness precedents)

### Secondary (MEDIUM confidence)
- None — no low-authority web sources were needed; all search providers disabled in config, and the single external claim resolved to the primary spec above.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nothing new installs; all substrate verified in-repo at file:line granularity
- Architecture (mirror remedy, progress formula, spine): HIGH — every seam, helper, and precedent exists and is test-proven; the one design nuance (lazy-init necessity) is derived directly from the verified mount-effect code path
- Pitfalls: HIGH — each traces to a recorded project lesson (09-07 geometry, 12-04 prose uniqueness, 12-08 flake classes, Pitfall 8-5/9 conventions) or the verified spec text; dialog root cause externally verified
- ACPT-05 logistics: HIGH for the instrument (read in full) / MEDIUM for runbook format specifics (planner discretion)

**Research date:** 2026-08-18
**Valid until:** 2026-09-17 (stable internal-codebase research; the WHATWG rendering behavior is effectively evergreen)
