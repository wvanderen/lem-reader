# Phase 15: Application Shell and Destinations - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-25
**Phase:** 15-application-shell-and-destinations
**Areas discussed:** Shell nav anatomy + geometry, Brand-home & Highlights naming, Return-context restore, Control context-gating

---

## Shell nav anatomy + geometry

### Where does the Library / Highlights destination navigation live?

| Option | Description | Selected |
|--------|-------------|----------|
| In the app-header | Links inline-start beside the wordmark in the existing 48px bar; one row, quiet chrome preserved | ✓ |
| Second nav row | Dedicated nav strip under the header; clearer landmark separation but adds vertical chrome; CSS constants reference the 48px geometry | |
| Per-view headers | Each destination carries its own nav row in its content; least persistent chrome but placement shifts between destinations | |

### Is the destination nav visible while reading an article?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, persistent everywhere | The shell is always the same in all three destinations; reading position saved anyway | ✓ |
| Hidden in Reader | Calmer reading header at 320px, but shell differs by context — weaker NAV-01 consistency | |
| Collapsed in Reader | Nav collapses into wordmark-as-menu or overflow button; full destinations but menu machinery | |

### What does POLISH-07 "coherent gutters, headers, spacing" mean concretely?

| Option | Description | Selected |
|--------|-------------|----------|
| Token audit + drift fixes | Audit all four surfaces against existing tokens (main#main inset, --space scale, 48px header, measure) and fix drift; visual details to UI-SPEC | ✓ |
| Shared shell layout component | Structural enforcement via a header + content wrapper all surfaces render inside; bigger refactor mid-milestone | |
| Minimal — touch only new UI | Only align what Phase 15 touches; leave broader audit to Phase 21 | |

### With shell nav in the header, what happens to the in-content "Back to library" button (D13-15)?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep it | At the head of Reader and Highlights content; history.back() + NAV-03 restore returns to exact library spot | ✓ |
| Remove it | Shell nav + brand cover return navigation; loses the labeled first-in-content affordance | |
| Reader only | Keep in Reader (deepest context); Highlights relies on shell nav + brand | |

---

## Brand-home & Highlights naming

### Where does the Lem Reader brand link point (NAV-02)?

| Option | Description | Selected |
|--------|-------------|----------|
| Always #/ (All) | Same target as the cold fallback (D14-14); one predictable home, no hidden state | ✓ |
| Last-used view | Fewer clicks for filtered browsing, but view persistence was explicitly rejected (D14-14) | |
| #/ for brand, nav link = library | Brand as app-home, Library nav link as destination anchor | |

### Does the destination get renamed to "Highlights"?

| Option | Description | Selected |
|--------|-------------|----------|
| Rename to Highlights | Route #/highlights, h1 "Highlights", title "Highlights — Lem Reader"; matches milestone language | ✓ |
| Keep Review naming | Zero churn in routes/e2e anchors/copy, but public name stays review-flavored | |
| Label only, keep route | Rename visible label but keep #/review byte-stable; URL vocabulary drifts | |

### What happens to the old #/review URL after the rename?

| Option | Description | Selected |
|--------|-------------|----------|
| Alias redirect | parseHash maps #/review → Highlights, replaceState-normalized to #/highlights; ONE canonical form | ✓ |
| Fallback to library | #/review hits the unknown-segment → library fallback (D14-16); stale bookmarks silently land elsewhere | |
| No compat, document | #/review is just an unknown route, documented as intentional | |

### Does an Add destination appear in the shell now (POLISH-07 names Add as a surface)?

| Option | Description | Selected |
|--------|-------------|----------|
| No — two destinations | Add stays as today's in-page IngestControl; Phase 16 introduces the destination when it exists | ✓ |
| Yes — placeholder now | Third shell entry pointing at the current inline control's future route; contradicts NAV-05 and front-runs Phase 16 | |
| Stage the entry point | No nav entry, but reserve header geometry for Phase 16's drop-in | |

### Brand → #/ and a Library nav link → #/ would be two links to the same place — how does the header handle that?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep both | Different semantic roles (app-home vs destination); Library link carries aria-current when active | ✓ |
| Brand is the Library link | Wordmark IS the destination entry; asymmetric shell nav entries | |
| Library link tracks view | Library nav link targets the current view route; view-state-dependent hrefs complicate the VIEW_HREFS constant table | |

### What accessible name does the brand link carry?

| Option | Description | Selected |
|--------|-------------|----------|
| "Lem Reader" as-is | The wordmark text IS the accessible name; no extra vocabulary | ✓ |
| "Lem Reader home" | Announces home semantics explicitly (common logo-link practice) | |
| Planner decides | Copy-level detail for UI-SPEC / planner | |

---

## Return-context restore

### What exactly restores when returning from Reader or Highlights (NAV-03)?

| Option | Description | Selected |
|--------|-------------|----------|
| View + filters + scroll + row focus | View from URL; query + tag + scroll from session; focus to the launched-from row (extends D14-05/D14-10 layering) | ✓ |
| View + filters + scroll, h1 focus | Simpler focus story; SR users re-orient from the top (D14-08 baseline) | |
| Scroll only | Least state to manage, but NAV-03 explicitly names "active filters" | |

### Where does the restorable library context live?

| Option | Description | Selected |
|--------|-------------|----------|
| Session module | Session-scoped module/App state; LibraryView reads on mount, writes on change/unmount; no Dexie writes | ✓ |
| Keep-alive mount | LibraryView stays mounted hidden; effects/listeners keep running; router unmount discipline changes | |
| Persisted to Dexie | Restore survives reloads, but contradicts D14-14's no-persistence stance; adds schema writes | |

### Which return paths restore context — and when the landing view differs from the captured one?

| Option | Description | Selected |
|--------|-------------|----------|
| All returns, view-matched | BackToLibrary + shell Library link + brand all restore filters; scroll + row focus only when landing view matches captured view | ✓ |
| BackToLibrary only | Full restore on the labeled return affordance; shell links are fresh navigations | |
| Everything incl. view | Every warm return restores view too; overrides fixed-href discipline, blurs link honesty | |

### How do restore failures degrade?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-field graceful | Row gone → h1 focus; scroll clamped to bottom; view mismatch → filters apply, scroll/focus reset | ✓ |
| All-or-nothing | Any failed field skips the whole restore; loses the query/tag you did still have | |
| Planner decides | Capture the principle, let implementation detail follow | |

---

## Control context-gating

### Does the reading-mode toggle become reader-only (NAV-05)?

| Option | Description | Selected |
|--------|-------------|----------|
| Reader-only | Joins tags/annotations behind the articleMounted gate; header reads [tags][annotations][mode][gear] in Reader, shell nav + gear elsewhere | ✓ |
| Keep everywhere | Defensible as a global preference, but it's an inactive control outside reader context — what NAV-05 targets | |
| Reader-only + panel fallback | Hide outside Reader; preference settable from SettingsPanel if it grows a mode control | |

### How do "globally meaningful preferences" stay accessible outside the article (NAV-05)?

| Option | Description | Selected |
|--------|-------------|----------|
| Gear everywhere, no quick controls | SettingsPanel on all surfaces IS the mechanism; no header quick-controls added | ✓ |
| Add a quick control | Surface-level quick control (e.g. theme toggle); more chrome to keep calm | |
| Split panel by context | Global prefs everywhere; reading prefs only from Reader; fragments one calm panel | |

### At 320px in Reader the header cannot hold wordmark + 2 links + 4 icon buttons — what gives?

| Option | Description | Selected |
|--------|-------------|----------|
| Collapse wordmark | Below a breakpoint the wordmark visually collapses; brand link stays keyboard/SR-reachable; touch targets stay 44px | ✓ |
| Wrap to two rows | Everything visible at full size, but shell grows vertically where space is scarcest | |
| Icon-only in Reader | Destination labels shrink to glyphs; asymmetric anatomy between surfaces | |

### Do the article-scoped triggers (tags, annotations, mode) stay in the shell header or move into Reader content?

| Option | Description | Selected |
|--------|-------------|----------|
| Stay in shell header | Current D5-09/D13-10 anatomy, gated by articleMounted; content headers carry only Back to library + titles | ✓ |
| Move into Reader content | Cleanest context story, but a bigger relocation of proven controls/e2e anchors mid-milestone | |
| Planner confirms | Leave placement as-is; planner/UI-SPEC settles exact grouping if the audit surfaces a conflict | |

---

## the agent's Discretion

- Nav landmark shape (aria-label naming distinct from the view-switcher nav)
- Session module API shape; scroll capture timing
- View-match comparison mechanics
- Wordmark collapse breakpoint + compact-mark vs visually-hidden treatment
- Alias-redirect implementation (parseHash + replaceState ordering)
- Row-focus capture/re-find mechanics
- e2e spec structure (shell nav, three-path restore matrix, gating, rename compat)
- Title copy details; token audit ordering and drift-vs-intentional judgment

## Deferred Ideas

- Add as a shell destination / focused add workflow — Phase 16 (ADD-01..04, LIB-09/LIB-10)
- Quick header controls (theme toggle outside the panel) — rejected this phase
- Splitting SettingsPanel into global vs reading sections — rejected this phase
- Persisting library context (filters/scroll) across reloads — rejected (session-only)
- Second nav row / per-view nav placement — rejected
- Icon-only destination links at narrow widths — rejected
