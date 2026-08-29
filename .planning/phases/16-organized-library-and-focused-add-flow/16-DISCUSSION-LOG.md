# Phase 16: Organized Library and Focused Add Flow - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-29
**Phase:** 16-organized-library-and-focused-add-flow
**Areas discussed:** Add surface & entry point, Source picker & inputs, Recovery & success flow, Library organization polish

---

## Add surface & entry point

### What IS the focused Add workflow surface?

| Option | Description | Selected |
|--------|-------------|----------|
| Native dialog modal | Matches SettingsPanel/ImportPreviewDialog precedent — free focus trap, Esc, inert backdrop, focus restore; no route grammar change; library never unmounts | ✓ |
| #/add route | Third destination — full-page, Back semantics; but new route grammar + librarySession interplay + shell-nav rule revisit | |
| You decide | Defer to planner/UI-SPEC after zoom-matrix research | |

**User's choice:** Native dialog modal
**Notes:** ADD-04 largely satisfied structurally by the native dialog precedent.

### Where does the Add-to-Library trigger live?

| Option | Description | Selected |
|--------|-------------|----------|
| Library-page button | Add is library-scoped (D15-15 philosophy); 48px shell untouched (≤639px crowding, D15-17) | ✓ |
| Shell-header button | Always-available gear-style trigger; grows narrow-width crowding | |
| Both | Library button + quiet header trigger; two triggers to keep consistent | |

**User's choice:** Library-page button

### Where does the Add button sit once the forms move into the dialog?

| Option | Description | Selected |
|--------|-------------|----------|
| Beside the h1 | Old Review-highlights position; first-class placement; no near-empty add section; .status relocates quietly | ✓ |
| Keep add section | Today's section order; section shrinks to button + .status; reads sparse | |
| You decide | Lock only "one calm trigger; byte-stable anchors preserved" | |

**User's choice:** Beside the h1

### How does the empty All view route readers into Add?

| Option | Description | Selected |
|--------|-------------|----------|
| Copy points to button | Single way in; empty-state words point at header-row button ("one predictable home" philosophy) | ✓ |
| Inline Add button | Empty state renders its own prominent Add button; more discoverable; two triggers | |

**User's choice:** Copy points to button

---

## Source picker & inputs

### How does the reader choose the ingestion source?

| Option | Description | Selected |
|--------|-------------|----------|
| 3-way radio picker | Visible Web address / Paste text / Upload file chooser; only selected input renders; fieldset/radio (TagEntry discipline); matches today's three paths 1:1 | ✓ |
| One smart input | Paste-URL detection; fewer controls but implicit magic, fuzzy URL validation | |
| Tabs | Compact; tablist machinery D14-22 avoided; compounded keyboard expectations in dialog | |

**User's choice:** 3-way radio picker

### Within "Upload file", one picker or per-format pickers?

| Option | Description | Selected |
|--------|-------------|----------|
| One combined picker | accept=".md,.html,.pdf,.epub"; OS filters formats; proven extension dispatch + per-format caps | ✓ |
| Per-format pickers | Explicit sub-choice per format; extra step, four near-identical controls | |

**User's choice:** One combined picker

### If the reader switches from Web address to Paste and back, is the typed URL still there?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep input on switch | Typed text + picked file survive switches until dialog closes; no silent loss (ADD-03 spirit) | ✓ |
| Clear on switch | Simpler state; silently discards typed input | |

**User's choice:** Keep input on switch

### Which source is selected when the dialog opens?

| Option | Description | Selected |
|--------|-------------|----------|
| Always Web address | Predictable, no hidden state (mirrors D14-14) | ✓ |
| Remember last source | Persisted preselection; dialog behaves differently between opens | |
| Session-scoped memory | In-memory last-used (librarySession-style middle ground) | |

**User's choice:** Always Web address

---

## Recovery & success flow

### When the reader tries to add something already saved (D7-07 dedupe-refuse), what happens?

| Option | Description | Selected |
|--------|-------------|----------|
| Refusal message only | Calm "Already in your library."; honest refusal, no surprise navigation | ✓ |
| Refusal + Open action | Message gains "Open it" navigating to the existing item | |

**User's choice:** Refusal message only

### Can the reader dismiss the Add dialog while a submission is in flight?

| Option | Description | Selected |
|--------|-------------|----------|
| Block until settle | Dialog stays put until request settles; no zombie requests, no save ambiguity, no duplicate risk | ✓ |
| Close anytime | Background completion; "did it save?" ambiguity + duplicate re-submission risk | |

**User's choice:** Block until settle

### After a file submission fails, how does retry work?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep G2 reset | Pick clears on failure (proven no-no-op); reason stays visible; retry = re-pick | ✓ |
| Keep pick + Try again | Direct resubmit button; must solve same-file no-op + retryable-vs-terminal distinction | |

**User's choice:** Keep G2 reset

### After a successful add, where does the reader land?

| Option | Description | Selected |
|--------|-------------|----------|
| Article opens, book to library | Today's contract — article navigates to reader; book lands on library with new row (books have no single open target) | ✓ |
| Always to library | Uniform calm landing; delays reading what you added | |
| Always open it | Article to reader; book to first/resume chapter; uniform "added = reading" | |

**User's choice:** Article opens, book to library

---

## Library organization polish

### When search/tag narrows the current view to zero rows, what does the reader see?

| Option | Description | Selected |
|--------|-------------|----------|
| No-matches line + clear | Calm "no matches" distinct from membership empty states (D14-26) + clear-filters affordance | ✓ |
| No-matches line only | Feedback without clear control; quieter, more manual recovery | |

**User's choice:** No-matches line + clear

### Which views show the Continue Reading strip?

| Option | Description | Selected |
|--------|-------------|----------|
| All view only | Duplicates In-progress rows / shows absent items elsewhere; All is where recency belongs | ✓ |
| All views (today) | Maximum resume reach; duplicates + displaces on other views | |
| Hide when duplicating | Strip except In-progress; conditional presence less predictable | |

**User's choice:** All view only

### Beyond placement, does the strip's own treatment change?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep current surface | Cap 3, single column, hairlines, policy membership; minimal churn; anchors hold | ✓ |
| Redesign treatment | Visual re-treatment via UI-SPEC; more churn vs proven specs | |

**User's choice:** Keep current surface

### While a search or tag filter is active, what do the view-switcher counts show?

| Option | Description | Selected |
|--------|-------------|----------|
| Membership totals | "Unread (3)" always means 3 exist (D14-23 unchanged); search never rewrites counts | ✓ |
| Filtered counts | "Unread (1 of 3)"; second number system to keep honest | |

**User's choice:** Membership totals

---

## the agent's Discretion

- Dialog component architecture (new AddDialog vs IngestControl refactor; seams reused either way)
- Dialog open-state location (LibraryView-local vs App-lifted)
- Dialog/picker geometry at 320px + 400% zoom (UI-SPEC; POLISH-07 tokens)
- Radio group markup details, labels, per-source helper copy
- In-flight blocking mechanics
- Book-success landing mechanics (refreshKey, focus target)
- No-matches + clear-filters control shape and aria wiring
- Status live-region placement inside the dialog
- Test migration structure (IngestControl.test.tsx → Add dialog specs)

## Deferred Ideas

- Shell-header Add trigger (rejected D16-02) — revisit on reported friction
- Smart single input with URL detection (rejected D16-05)
- Per-format file pickers (rejected D16-06)
- Remembering last-used source, incl. session-scoped (rejected D16-08)
- Dedupe "Open it" action (rejected D16-09)
- Dismissible-during-flight dialog (rejected D16-10)
- Filtered switcher counts (rejected D16-16)
- Continue Reading on non-All views / strip redesign (rejected D16-14/15)
