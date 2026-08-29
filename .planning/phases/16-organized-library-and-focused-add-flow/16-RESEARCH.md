# Phase 16: Organized Library and Focused Add Flow - Research

**Researched:** 2026-08-29
**Domain:** Accessible React UI reorganization — native `<dialog>` focused-add workflow + library filter feedback (client-only SPA, zero new dependencies)
**Confidence:** HIGH

## Summary

Phase 16 is a **codebase-internal reorganization phase** on a mature, heavily-tested codebase (15 prior phases, ~2500 passing tests). Every platform primitive it needs is already proven in-repo: six native `<dialog>`/showModal components (SettingsPanel, WipeConfirm, RemoveConfirm, BookRemoveConfirm, ImportPreviewDialog, ReviewNoteDialog), the complete ingest service boundary (`IngestionClient` + `mapReasonToCopy` + dedupe seams), and the compose-within-view filter pipeline (`libraryFilter.ts`). The research found **zero new packages** and **zero schema/storage changes** (Pitfall 9 holds). The work is: (1) move the retiring 462-line three-form `IngestControl` into a focused `AddDialog` behind a Library-page header button, (2) add the honest filtered-to-zero feedback layer LIB-09 requires, (3) gate the Continue Reading strip to the All view.

The single most consequential finding is the **test blast radius**: 16-CONTEXT's discretion note names `IngestControl.test.tsx` + `happy-path.spec.ts`, but **twelve spec files** drive the ingest surface (`pdf-intake`, `epub-intake`, `markdown-upload`, `upload-queue`, `browse-open`, `remove-cascade`, `search-tag-filter`, `a11y`, `portability/round-trip`, `portability/core-flow-spine`, `chrome/library-tidy`, plus the two named) — each needs an "open the Add dialog first" step (or shared helper) when the forms leave the page. Conversely, the LIB-10 strip gate is nearly free: every existing strip assertion runs on `#/` (the All view), so `progress-recent.spec.ts`, `epub-intake.spec.ts`, and `round-trip.spec.ts` stay green unedited. [VERIFIED: codebase — grep of tests/ this session]

The D16-10 no-dismissal-while-submitting mechanism is platform-verified: the `<dialog>` `cancel` event (Baseline since March 2022) fires for **every** close request — Esc on desktop AND the back button on mobile — and `event.preventDefault()` in a cancel listener keeps the dialog open. One listener gated on `status === "submitting"` covers all dismissal paths, and the exact listener shape (cancel → preventDefault → route through onCancel) already ships in `BookRemoveConfirm.tsx` L98-104. [CITED: MDN HTMLDialogElement cancel event]

**Primary recommendation:** Build `AddDialog` as a structural clone of the RemoveConfirm dialog lineage (own CSS hook classes, `data-initial-focus`, cancel+close listeners) hosting IngestControl's four-state submission spine verbatim; extract `mapReasonToCopy` (+ `bytesToBase64`) into a new `src/ingestion/` module so the two byte-pinning copy tests survive the component's retirement with only an import-path change; land a shared e2e helper `openAddDialog(page)` and update all twelve ingest-surface specs in the same plan that dissolves the add section.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Add surface & entry point (ADD-01)**

- **D16-01: The focused Add workflow is a native `<dialog>` modal** (showModal) — matches the SettingsPanel/RemoveConfirm/ImportPreviewDialog precedent. Free focus trap, Esc-dismissal, inert backdrop, and focus restore give most of ADD-04 structurally. No route grammar change; the Library never unmounts behind it.
- **D16-02: The trigger is a Library-page button only** — no shell-header trigger; the 48px shell stays exactly two destinations (D15-08 confirmed permanent). Add is library-scoped (D15-15 context-gating philosophy); the shell avoids the ≤639px crowding problem entirely.
- **D16-03: The Add button sits BESIDE the h1 in the library header row** (the old Review-highlights button position). The near-empty "add content" section dissolves; the library-load `.status` live region survives (byte-stable anchor — it is the list's "Opening article…" / "Couldn't open this article" surface, not an ingest surface).
- **D16-04: The empty All view routes readers to Add via copy only** — the header-row button is the single way in; the empty-state words point to it (exact copy = planner/UI-SPEC). No second inline button.

**Source picker & inputs (ADD-02)**

- **D16-05: Source choice is a visible 3-way source-first picker — Web address / Paste text / Upload file** — then ONLY the selected source's input renders. No detection magic; explicit choice. Native fieldset/radio semantics (the TagEntry discipline); NOT tabs (tablist machinery D14-22 deliberately avoided).
- **D16-06: Upload file keeps ONE combined picker** (`accept=".md,.html,.pdf,.epub"`) with today's extension dispatch + per-format size caps (PDF_MAX_BYTES / EPUB_MAX_BYTES / 5MB). No per-format sub-choices.
- **D16-07: Input survives source switches until the dialog closes** — typed URL/paste text and a picked file are kept across switches within one dialog session; no silent loss (the ADD-03 spirit applied to navigation inside the workflow).
- **D16-08: The dialog always opens on Web address** — no persistence, no last-used-source memory (mirrors D14-14's no-persistence stance; predictable every open).

**Recovery & success flow (ADD-03, ADD-04)**

- **D16-09: Dedupe-refuse stays a calm refusal message only** — "Already in your library." via the existing copy; NO "Open it" action; no surprise navigation.
- **D16-10: No dismissal while a submission is in flight** — the dialog blocks (Esc + close controls inert) until the request settles; then retry/close are available. No zombie requests, no "did it save?" ambiguity, no duplicate re-submission risk.
- **D16-11: File retry keeps the G2 reset discipline** — on failure the pick clears, the refusal reason stays visible, and retry = re-pick the same file. URL/paste text is preserved across failures (never cleared by an error).
- **D16-12: Success behavior splits by kind (today's contract):** an article success closes the dialog and opens the article in the reader (`#/article/<id>`); a book success closes the dialog and lands on the Library where the new book row now is (with the D12-11 skip disclosure preserved when skippedCount > 0).

**Library organization polish (LIB-09, LIB-10)**

- **D16-13: Filtered-to-zero shows a calm no-matches line + a clear-filters affordance** — visually/copy distinct from the per-view membership empty states (D14-26: filtered-out ≠ empty view); clearing resets query and/or active tag. Exact copy = planner/UI-SPEC.
- **D16-14: The Continue Reading strip renders on the All view ONLY.** On In-progress it duplicated the first rows; on Unread/Finished it showed items absent from the view. All is the "everything" overview where recency belongs.
- **D16-15: The strip's own surface is unchanged** — cap 3, single column, title/author/hairline rows, policy-driven membership (D14-20). LIB-10 is satisfied by placement, not a redesign.
- **D16-16: View-switcher counts ALWAYS show membership totals** (D14-23 unchanged) — never filtered counts. A search narrowing the visible rows never rewrites what "Unread (3)" means.

### the agent's Discretion

- **Dialog component architecture** — new `AddDialog` component vs in-place refactor of `IngestControl`; either way the three-form `IngestControl` retires from `LibraryView`. The ingest seams (`IngestionClient`, `mapReasonToCopy`, `dexieLibrarySource.has/save`, `hasBook`/`saveBook`, `bytesToBase64`) are reused, not forked.
- **Dialog open-state location** — LibraryView-local state (the trigger is in-page; settingsOpen is App-level only because the header triggers it) or App-lifted; planner's call.
- **Picker + dialog geometry** — dialog width/max-width, margins at 320px, 400% zoom behavior (UI-SPEC; POLISH-07 token discipline extends to the new surface).
- **Radio group markup details** — fieldset/legend/radio exact shape, labels, helper copy per source ("Accepts .md, .html, PDF, and EPUB books" style hints).
- **In-flight blocking mechanics** — how close listeners are gated during `submitting` (cancel-event prevention vs disabled close controls).
- **Book-success landing mechanics** — refreshKey re-trigger, whether focus lands on the new row or the h1 (D14-05 layering applies).
- **No-matches + clear-filters control shape** — link vs button vs chip-dismiss; aria wiring.
- **Status live-region placement inside the dialog** — mirrors the IngestControl `.status` discipline; exact DOM position is free.
- **Test migration** — `IngestControl.test.tsx` + `happy-path.spec.ts` anchor updates are legitimately owned by this phase; strengthen-only applies to untouched specs; honest full-suite gate.

### Deferred Ideas (OUT OF SCOPE)

- **Shell-header Add trigger** — rejected (D16-02); revisit only if readers report friction adding from Reader/Highlights context.
- **Smart single input with URL detection** — rejected (D16-05 alternative).
- **Per-format file pickers after choosing Upload** — rejected (D16-06 alternative).
- **Remembering last-used source** — rejected (D16-08), including the session-scoped middle ground; revisit on concrete reader demand.
- **Dedupe-refuse "Open it" action** — rejected (D16-09); revisit if re-adding existing items becomes a frequent flow.
- **Dismissible-during-flight dialog** — rejected (D16-10).
- **Filtered counts in the view switcher ("1 of 3")** — rejected (D16-16).
- **Continue Reading on non-All views / hide-when-duplicating** — rejected (D16-14); strip redesign beyond placement — rejected (D16-15).
- **Metadata editing, TOC, cross-block highlights, images, POLISH-08+ audits** — Phases 17-21 (not this phase).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LIB-09 | Search and tag filters narrow the selected view without contradictory results or reading states | Filter composition already correct (state filter runs before query/tag in LibraryView L462-527; `libraryFilter.ts` unchanged). This phase adds the honest feedback layer: no-matches branch beside the D14-26 membership-empty branch (L620-631 else-arm) + clear-filters affordance (D16-13) |
| LIB-10 | Continue Reading complements rather than duplicates/displaces the library organization | Strip gate: `ContinueReadingStrip` (L553-555, currently unconditional) renders only when `view === "all"` (D16-14); strip surface byte-unchanged (D16-15); all existing strip specs run on `#/` so they stay green |
| ADD-01 | Focused Add workflow instead of permanently-mounted ingestion controls | `AddDialog` (native `<dialog>` showModal, D16-01) opened from a header-row button beside the h1 (D16-03); `.library-section-add` dissolves; LibraryView `.status` survives byte-stable; dialog precedent fully mapped (6 existing dialogs) |
| ADD-02 | Every existing source available; only relevant inputs visible | 3-way fieldset/radio picker (D16-05) following the SettingsPanel radio discipline (L370-402); combined file picker + extension dispatch preserved verbatim (D16-06); input preservation across switches (D16-07) |
| ADD-03 | Cancel/retry/recover without losing input, duplicates, or refusal reasons | Four-state machine + dedupe-refuse + G2 reset carried over verbatim from IngestControl; in-flight dismissal blocking via cancel-event preventDefault (MDN-verified; BookRemoveConfirm L98-104 precedent); URL/paste preserved across failures (D16-11) |
| ADD-04 | Predictable focus, dismissal, success, narrow-width, high-zoom behavior | Native dialog supplies trap/Esc/inert/backdrop; WebKit explicit initial focus (`data-initial-focus`); trigger focus-restore on close; centered-modal geometry precedent (`margin:auto`, `max-width:480px`, `calc(100vw - var(--space-xl))`); success navigation split (D16-12) |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- **GSD workflow enforcement:** all file changes go through GSD entry points (this phase runs under `/gsd-plan-phase` → `/gsd-execute-phase`).
- **Accessibility foundational:** semantic HTML, keyboard navigation, screen-reader compatibility, visible focus, reduced motion — the dialog/radio/no-matches surfaces must honor all of these (native elements only; no component suite).
- **Reading modes:** paginated + scrolling both stay available (untouched this phase).
- **Persistence local-first:** no accounts, no cloud — the AddDialog writes only through the existing Dexie seams.
- **Security:** the canonical document model is the security boundary; sanitize once at ingest; **never `dangerouslySetInnerHTML`** (repo has a `lint:no-danger` regex guard — Phase 7); ingestion refuses private/internal endpoints and caps sizes — all reused verbatim, zero new ingest surface.
- **Honesty:** no silent garbage — refusal copy stays calm + reader-visible (`mapReasonToCopy` byte-pinned); annotations never silently re-attach (untouched).
- **Performance:** CI budget untouched (no pagination/measurement changes).
- **Conventions:** "not yet established — follow existing patterns found in the codebase" (CONVENTIONS.md) — this research maps those patterns explicitly.

## Architectural Responsibility Map

Client-only SPA — no server, no CDN, no database changes this phase. Tiers are in-app layers.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Add trigger button + open state | LibraryView (Browser UI) | — | Trigger is in-page (D16-02/D16-03); LibraryView-local state suffices — settingsOpen is App-level only because the shell header triggers it |
| Source picker + per-source input rendering | AddDialog (Browser UI) | — | Pure presentation state; native fieldset/radio; no persistence (D16-08) |
| Input preservation across source switches | AddDialog local state | — | Dialog-session-scoped only; dies with the dialog close (D16-07) |
| Submission state machine (idle/submitting/success/error) | AddDialog (Browser UI) | — | Carries over from IngestControl as the dialog's spine |
| In-flight dismissal blocking | AddDialog cancel listener + disabled controls | Browser dialog engine | Platform `cancel` event is cancelable; preventDefault blocks Esc + mobile back |
| Ingest network + typed refusals | IngestionClient (domain service) | /api/ingest middleware | Reused verbatim — NOT forked; `IngestionError.reason` → `mapReasonToCopy` |
| Dedupe-refuse (has/hasBook before save/saveBook) | Persistence seams (Dexie) | — | `dexieLibrarySource.has/save` + `hasBook/saveBook` unchanged (D7-07) |
| Refusal copy mapping | Pure module (`mapReasonToCopy`) | — | Byte-pinned by pdf-copy/epub-copy tests; must survive component retirement |
| Success navigation (article → `#/article/<id>`; book → Library + refreshKey) | AddDialog callbacks | LibraryView refreshKey | Navigation is a hash assignment (existing router); book landing re-derives the list |
| Filter composition within view | `libraryFilter.ts` (pure domain) | LibraryView render body | Already LIB-09-correct; zero changes |
| No-matches feedback + clear filters | LibraryView (Browser UI) | — | New render branch keyed on membership-non-empty AND filtered-to-zero |
| Continue Reading gating | LibraryView (Browser UI) | — | `view === "all"` gate; strip component byte-unchanged |
| Switcher counts (membership totals) | readingState.ts + countByState (pure) | LibraryView render body | D16-16: derivation stays pure — filtered counts never touch it |
| Session restore protection | librarySession.ts (untouched) | — | Dialog keeps Library mounted, so capture/restore semantics hold structurally |

## Standard Stack

### Core

No new packages. The phase is built entirely on the existing, locked stack (STACK.md) and browser primitives. Versions verified in package.json this session. [VERIFIED: codebase]

| Library / Primitive | Version | Purpose in this phase | Why Standard |
|---------------------|---------|----------------------|--------------|
| React + React DOM | 19.2.8 | AddDialog component, controlled radio/inputs, LibraryView branches | Controlled-input discipline + refs already proven across 6 dialogs |
| Native `<dialog>` + showModal | Browser platform (Baseline) | Focused Add surface (D16-01) | Free focus trap, Esc, inert backdrop, top layer; 6 in-repo precedents |
| `<dialog>` `cancel` event | Browser platform (Baseline since March 2022) | In-flight dismissal blocking (D16-10) | Cancelable; covers Esc AND mobile back; BookRemoveConfirm precedent |
| fieldset/legend/radio | Browser platform | 3-way source picker (D16-05) | SettingsPanel L370-402 discipline; free arrow-key group semantics |
| CSS custom properties (POLISH-07 tokens) | Browser platform | Dialog + no-matches styling | `--surface-raised`, `--hairline`, `--touch`, `--space-*`, `--font-ui` |
| TypeScript | 7.0.2 | Contracts (AddDialogProps, source union type) | Strict typing of the source-kind discriminated state |

### Supporting (reused verbatim — do not fork)

| Seam | File | Contract |
|------|------|----------|
| `ingestUrl/ingestHtml/ingestMarkdown/ingestPdf/ingestEpub` + `IngestionError` | `src/ingestion/IngestionClient.ts` | The five POST functions + typed refusal; reused verbatim |
| `mapReasonToCopy` (EXPORTED) | currently `src/ingestion/IngestControl.tsx` L55-97 | 20-reason → calm DOC-06 copy map; byte-pinned by 2 unit tests |
| `bytesToBase64` (private) | currently `src/ingestion/IngestControl.tsx` L108-116 | 0x8000-chunked base64 (call-stack safety) |
| `dexieLibrarySource.has/save` | `src/ingestion/LibrarySource.ts` | D7-07 dedupe-refuse seam |
| `hasBook/saveBook` | `src/persistence/booksStore.ts` | Book-level dedupe + one-transaction save |
| `PDF_MAX_BYTES` / `EPUB_MAX_BYTES` | `src/ingestion/types.ts` | Extension-aware client caps |
| `filterLibrary` / `filterBooks` | `src/ingestion/library/libraryFilter.ts` | Pure compose-within-view filter — zero changes |
| `articleReadingState`/`bookReadingState`/`countByState` | `src/ingestion/library/readingState.ts` | ONE membership/counts policy (D14-20/23, D16-16) |
| `librarySession` capture/restore | `src/ingestion/library/librarySession.ts` | Untouched; protected structurally (Library never unmounts behind dialog) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `<dialog>` (D16-01) | Custom modal / Popover API | Rejected by locked decision; NotePopover history proves non-`<dialog>` overlays break VoiceOver modal context (13-11 lesson) |
| fieldset/radio picker (D16-05) | tablist (D14-22 machinery) | Rejected — tab semantics for a form choice; radio gives free arrow-group + checked state |
| One combined file picker (D16-06) | Per-format pickers | Rejected — extra choices for zero capability; extension dispatch is tested |
| Cancel-event blocking (D16-10) | Disabled close controls only | Controls alone miss Esc + mobile back; cancel preventDefault covers all close requests. Use BOTH (defense in depth) |

**Installation:** none — `npm install` unchanged.

## Package Legitimacy Audit

> This phase installs **zero external packages**. All work rides the existing dependency set (verified against package.json this session: react 19.2.8, @playwright/test 1.61.1, vitest 4.1.10, @testing-library/react 16.3.2, @axe-core/playwright 4.12.1). The gate does not apply.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| — (none) | — | — | — | — | — | No new packages |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                        ┌──────────────────────────────────────────────┐
                        │  Library page (#/, #/unread, #/in-progress,  │
                        │               #/finished)                    │
                        │                                              │
   Reader ──click──▶ [Add button]   [View switcher]  [LibrarySearch]  │
                        │                │              [TagFilter]   │
                        ▼                ▼                 │          │
              ┌── AddDialog ──┐   replaceState      query + activeTag │
              │ (showModal;   │   + direct setView        │           │
              │  Library stays │        │                 ▼           │
              │  mounted+inert)│        │      membership filter first │
              │                │        │      (readingState policy)   │
              │ ◉ Web address  │        │              │               │
              │ ○ Paste text   │        │              ▼               │
              │ ○ Upload file  │        │      filterLibrary/filterBooks│
              │ (fieldset/radio)│       │         │        │           │
              │   │ only the   │        │         ▼        ▼           │
              │   │ selected   │        │   visible rows   membership  │
              │   │ input      │        │        │         empty?      │
              │   ▼ renders    │        │        │      │      │       │
              │ [submit] ──┐  │        │        │   EMPTY_COPY  filtered│
              └────────────┼──┘        │        │   (D14-26)   -to-zero │
                           │           │        │        │      │       │
                           ▼           │        │        │   [no-matches│
                 IngestionClient       │        │        │    + clear   │
                 POST /api/ingest      │        │        │   filters]   │
                           │           │        │        │   (D16-13)   │
              ok:false ◀───┴──▶ ok:true│        │        │              │
               IngestionError          │        │     [ContinueReading- │
               (typed reason)          │        │      Strip — All view │
                     │                 │        │      ONLY, D16-14]   │
                     ▼                 │        │                      │
              mapReasonToCopy          │        │                      │
              (calm refusal,          │        │                      │
               stays in dialog)       │        │                      │
                     │                 │        │                      │
              has()/hasBook()? ──yes──▶ "Already in your library."     │
                     │ no               │                               │
                     ▼                 │                               │
              save()/saveBook()        │                               │
                     │                 │                               │
        ┌────────────┴──────────┐      │                               │
        ▼ article               ▼ book │                               │
   close dialog            close dialog + refreshKey                   │
   hash → #/article/<id>   land on Library (new book row;              │
   (reader opens)          D12-11 skip disclosure)                     │
                        └──────────────────────────────────────────────┘

  In-flight (submitting): cancel listener preventDefault (Esc + mobile
  back blocked); close controls disabled; .status announces progress.
```

Trace the primary use case: Reader on Library clicks the header Add button → AddDialog opens on Web address → picks source, fills input, submits → IngestionClient POSTs → typed success/refusal → dedupe gate → save → dialog closes → article opens in reader OR book lands in the refreshed Library list.

### Recommended Project Structure

```
src/
├── ingestion/
│   ├── ingestCopy.ts          # NEW (recommended) — mapReasonToCopy +
│   │                          #   bytesToBase64 extracted; the 2 copy-test
│   │                          #   imports update; strings byte-identical
│   ├── AddDialog.tsx          # NEW — the focused add workflow (dialog clone
│   │                          #   lineage: own CSS hooks, data-initial-focus,
│   │                          #   cancel+close listeners, .status region)
│   ├── IngestControl.tsx      # RETIRED — component deleted after extraction
│   ├── IngestionClient.ts     # UNCHANGED (reused verbatim)
│   └── library/
│       ├── LibraryView.tsx    # EDIT — header Add button; add section
│       │                      #   dissolves (.status survives); no-matches
│       │                      #   branch; strip gated on view === "all"
│       ├── ContinueReadingStrip.tsx  # UNCHANGED (gate lives in LibraryView)
│       └── libraryFilter.ts   # UNCHANGED
├── reader/SettingsPanel.tsx   # UNCHANGED (the radio + dialog precedent)
└── app.css                    # EDIT — dialog + picker + no-matches styles on
                               #   POLISH-07 tokens; retire .ingest-control
tests/
├── component/AddDialog.test.tsx        # NEW (migrated from IngestControl.test.tsx)
├── unit/pdf-copy.test.ts               # EDIT — import path only
├── unit/epub-copy.test.ts              # EDIT — import path only
└── e2e/…                               # 12 specs: open-dialog step/helper
```

### Pattern 1: The dialog clone lineage (D16-01)

**What:** Every modal in this codebase is a structural clone of the SettingsPanel/WipeConfirm lineage — NOT a shared Dialog component. Pitfall 8 isolation: each dialog owns its classes, its open-prop sync effect, its close/cancel listeners. [VERIFIED: codebase — SettingsPanel.tsx L116-154, RemoveConfirm.tsx L49-85, BookRemoveConfirm.tsx L83-111]

**When to use:** AddDialog follows it exactly. The load-bearing pieces:

1. **Open-prop sync** (idempotent guards): `if (open && !dlg.open) { triggerRef.current = document.activeElement; dlg.showModal(); initial.focus(); } else if (!open && dlg.open) { dlg.close(); }`
2. **Explicit initial focus** (WebKit does NOT auto-focus dialog controls — 02-01 lesson): `dlg.querySelector("[data-initial-focus]") ?? first-focusable ?? dlg` then `.focus()`.
3. **Close listener** restores focus to the captured trigger (`triggerRef.current?.focus()` — showModal does not do this).
4. **Cancel listener** (BookRemoveConfirm L98-104): Esc fires `cancel` then `close`; preventDefault + route through onCancel keeps the open-prop mirror in sync (the 09-06 openRef discipline — otherwise a stale `open=true` wedges the dialog shut on reopen).

**Initial focus choice for AddDialog:** The non-destructive default discipline (WipeConfirm) suggests the Cancel/Close button… but AddDialog's primary flow is typing a URL. Focusing the first radio (Web address, the D16-08 default) or the URL input puts the reader one Tab from working. Planner/UI-SPEC call; both honor the discipline (neither is destructive).

```tsx
// Source: src/ingestion/library/BookRemoveConfirm.tsx L92-111 (verbatim shape)
useEffect(() => {
  const dlg = ref.current;
  if (!dlg) return;
  const handleClose = () => { triggerRef.current?.focus(); };
  const handleCancel = (e: Event) => {
    e.preventDefault();          // blocks the native close…
    onCancel();                  // …and routes through the React mirror
  };
  dlg.addEventListener("close", handleClose);
  dlg.addEventListener("cancel", handleCancel);
  return () => {
    dlg.removeEventListener("close", handleClose);
    dlg.removeEventListener("cancel", handleCancel);
  };
}, [onCancel]);
```

**D16-10 variant:** in `handleCancel`, gate on the submitting state — `if (submitting) { e.preventDefault(); return; }` (stay open, no state churn) — and disable the Cancel/close buttons while submitting. The cancel listener must read the LIVE submitting value: a ref mirror (`submittingRef.current = status === "submitting"` rewritten every render — the `liveContextRef` discipline from LibraryView L236) or an effect re-registration keyed on status. [CITED: MDN cancel event — preventDefault keeps the dialog open; fires for Esc, requestClose(), and mobile back]

### Pattern 2: Source picker — fieldset/radio, controlled (D16-05/D16-08)

**What:** Native radio group following the SettingsPanel discipline. Controlled React radios; `checked` renders authoritatively (also neutralizes Firefox's dynamic-checked-persistence quirk across loads). [CITED: MDN input type=radio]

```tsx
// Source: src/reader/SettingsPanel.tsx L370-402 (verbatim shape)
<fieldset className="add-source-picker">
  <legend>Add from</legend>
  <label className="add-source-row">
    <input type="radio" name="source" value="url"
           checked={source === "url"} onChange={() => setSource("url")} />
    <span>Web address</span>
  </label>
  {/* … Paste text / Upload file … */}
</fieldset>
```

**When to use:** exactly this shape — `name` groups the radios (free arrow-key navigation between sources), `label` wrapping enlarges the hit area, `value` attributes are meaningful. D16-08: `useState<"url" | "paste" | "file">("url")` — reset on dialog open (no persistence). NOT a tablist (D14-22 machinery deliberately avoided).

### Pattern 3: Input preservation across source switches (D16-07)

**What:** Three independent state values (`urlValue`, `htmlValue`, picked `File`) live in dialog state; switching the radio only changes WHICH input renders. Typed text trivially survives (state persists when the input unmounts). A picked `File` survives in state, but the native `<input type="file">` loses its `files` FileList when unmounted — and `input.files` is NOT programmatically re-assignable.

**Two honest implementations (planner picks — see Open Questions):**

- **(a) Hidden-but-mounted file input** — keep the file input mounted at all times; when `source !== "file"` hide it (`hidden`/display). The DOM value AND `fileInputRef` survive switches; `handleFileSubmit` and the G2 `resetFilePick` seam work byte-unchanged. "Only the selected source's input renders" is satisfied visually (hidden ≠ visible) but the element stays in the a11y tree unless `hidden` is used (use the `hidden` attribute — removes from tree AND keeps value). [VERIFIED: codebase — the always-mounted measurement ArticleBody precedent, Plan 04-08, is the same keep-it-mounted solution for the same unmount-loses-state problem]
- **(b) State-held File** — store the `File` object in state on change; render a retained-file affordance ("Selected: name.pdf" + Remove file) when re-entering Upload; submit reads the state File, not `input.files`. More code; the ref-read in `handleFileSubmit` changes.

**Recommendation:** (a) — least code, G2 seam verbatim, one `hidden` attribute.

### Pattern 4: Success navigation split (D16-12)

**What:** The existing IngestControl contracts, carried into the dialog:

- **Article success:** close the dialog, then `window.location.hash = \`#/article/${id}\``. Order matters: closing first runs the focus-restore listener while the trigger is still mounted; navigation then unmounts LibraryView normally. (The reverse order unmounts the dialog's parent before close fires — the close listener's `triggerRef.current?.focus()` on a detached node is a harmless no-op, but close-first is cleaner.) [VERIFIED: codebase — RemoveConfirm onConfirm pattern: parent state reset first, then conditional hash change]
- **Book success:** close the dialog + `setRefreshKey((k) => k + 1)` — the LibraryView load effect re-derives from Dexie and the new book row appears. The refreshKey bump does NOT replay the session restore (the [status]-keyed restore effect sees ready→ready, no transition — LibraryView L281-343 comment). Skip disclosure: the D12-11 copy ("N chapters could not be read.") surfaces per the existing book arm — decide whether it announces in-dialog before close or on landing (planner; today it renders in `.status` on the list).

### Pattern 5: No-matches branch (D16-13)

**What:** LibraryView L620's conditional keys on MEMBERSHIP (`viewArticles.length === 0 && viewBooks.length === 0 && status === "ready"`). Filtered-to-zero (membership non-empty, `visibleItems.length + visibleBooks.length === 0`) currently renders an empty `ul` by design (D14-26). The no-matches treatment extends the ELSE arm: when membership-non-empty AND filtered-to-zero, render the calm line + clear-filters affordance beside/inside the empty ul.

```tsx
// Sketch (planner refines copy/shape):
{membershipEmpty ? (
  <><h2>{EMPTY_COPY[view].heading}</h2><p>{EMPTY_COPY[view].body}</p></>
) : (
  <>
    <ul className="library-list" ref={listRef} onClick={launchCapture}>…rows…</ul>
    {status === "ready" && visibleItems.length === 0 && visibleBooks.length === 0 && (
      <p className="library-no-matches">
        No articles match your search. <button type="button" onClick={clearFilters}>Clear search and filters</button>
      </p>
    )}
  </>
)}
```

**Clear-filters semantics:** resets `query` to `""` and `activeTag` to `null` (both — or only the active ones; both is simpler and honest). The control is a `<button>` (action, not navigation — link vs button is planner discretion; button is the correct semantic for "change state"). Copy must be visually/verbally DISTINCT from EMPTY_COPY headings (D16-13). Also: D16-04 — `EMPTY_COPY.all.body` ("Paste a URL or upload a file to begin.") points at the header Add button by copy only.

**Counts stay pure:** `stateCounts`/`allCount` derive from `standaloneArticles`/`books` BEFORE `filterLibrary` — a mid-search view never rewrites "Unread (3)" (D16-16). Zero code change needed; add the assertion to specs.

### Pattern 6: Strip gating (D16-14/D16-15)

**What:** In LibraryView, the strip section (L553-555) currently mounts unconditionally. Gate on `view === "all"`:

```tsx
{view === "all" && (
  <section className="library-section library-section-continue">
    <ContinueReadingStrip />
  </section>
)}
```

The strip component itself is byte-unchanged (D16-15). Detail: today an empty section wrapper renders even when the strip returns null (spare-chrome precedent); gating the whole section for non-All views is strictly calmer. All existing strip assertions run on `#/` (All) → no spec edits. [VERIFIED: codebase — epub-intake L445/L1088, round-trip L458, progress-recent L273 all navigate to `#/` before strip assertions]

### Pattern 7: e2e dialog-opening helper

**What:** Twelve specs drive the ingest surface. After the redesign each needs: click the header Add button → dialog visible → (switch source radio if file/paste) → drive the input. A shared helper keeps the migration mechanical:

```ts
// tests/e2e/library/add-dialog.ts (sketch)
export async function openAddDialog(page: Page): Promise<void> {
  await page.getByRole("button", { name: /add to library/i }).click();
  await expect(page.locator("dialog.add-dialog")).toBeVisible();
}
export async function pickSource(page: Page, source: "paste" | "file" | "url"): Promise<void> {
  await page.getByRole("radio", { name: source === "paste" ? /paste text/i : source === "file" ? /upload file/i : /web address/i }).check();
}
```

Naming note: the exact accessible names are UI-SPEC decisions — the helper centralizes them so a copy change is a one-file edit.

### Anti-Patterns to Avoid

- **Shared Dialog abstraction** — Pitfall 8: two dialogs with distinct destructive seams justified the clone lineage; AddDialog joins it. A shared component re-centralizes risk and breaks the "own CSS hooks" locator discipline (BookRemoveConfirm CSS comment: shared classes break strict-mode dialog locators when dialogs mount simultaneously — RemoveConfirm/BookRemoveConfirm/AddDialog will all three be mounted in LibraryView).
- **`<form method="dialog">` wrapper** — interfered with the Chromium focus trap (SettingsPanel L349-353 comment); every control is `type="button"` or a prevented-submit form.
- **Detection-magic source picker** — rejected (D16-05); explicit radio only.
- **Forgetting the cancel listener** — without it, Esc closes the native dialog but React's `open` prop stays true → the dialog wedges shut on reopen (the 09-06 lesson, fixed in BookRemoveConfirm).
- **Filter-scoped counts** — never derive switcher counts from `visibleItems`/`visibleBooks` (D16-16).
- **Killing the `.status` byte-stable anchor** — LibraryView's load-status live region (L562-573) survives the add-section dissolution; it is the "Opening article…"/"Couldn't open this article" surface, queried by library-tidy and reading-views specs (legitimately updated for position, but its role/aria/copy contract holds).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Focus trap / Esc / inert backdrop | Manual roving tabindex + inert management | `<dialog>.showModal()` | Free, battle-tested in 6 repo dialogs; VoiceOver needs the native modal context (NotePopover 13-11 lesson) |
| Esc + mobile-back blocking during flight | Keydown interception / history hacks | `cancel` event listener + `preventDefault()` | Platform close-request funnel (Baseline 2022); one listener covers all paths |
| Radio group keyboard semantics | Arrow-key handlers / aria-tablist | Native `input[type=radio][name=…]` in fieldset | Free group semantics; SettingsPanel precedent |
| Ingest pipeline / refusal copy | Any re-implementation | `IngestionClient` + `mapReasonToCopy` verbatim | 20-reason catalog, SSRF-guarded, byte-pinned by tests |
| Dedupe logic | Re-check logic in the dialog | `has()`/`hasBook()` BEFORE save (D7-07) | Content-hash ids make re-adds deterministic; seams unchanged |
| File re-pick behavior | Scattered input clears | `resetFilePick` G2 seam | Same-file re-pick must re-fire onChange (13-08); one seam, all terminal outcomes |
| Base64 for big files | One-shot `String.fromCharCode(...bytes)` | Chunked `bytesToBase64` (0x8000) | 10MB PDF throws RangeError on spread (verified in Phase 11) |
| Dialog centering / geometry | JS positioning | `margin: auto` + `width: calc(100vw - var(--space-xl))` + `max-width` | WHATWG UA dialog centering (13-03 POLISH-04 fix); CSS-only |

**Key insight:** this phase's entire risk profile is *wiring already-proven primitives into a new shape*. Every hand-roll opportunity above already has a tested in-repo implementation — the AddDialog is a re-arrangement, not new engineering.

## Common Pitfalls

### Pitfall 1: Underestimating the ingest-surface test blast radius
**What goes wrong:** Plans that only touch `IngestControl.test.tsx` + `happy-path.spec.ts` leave ~10 e2e specs red at the honest gate.
**Why it happens:** The forms' accessible names (`Paste HTML or text`, `Add pasted article`, `Add file`, `input#ingest-file`) are used as seed helpers across the suite — `pdf-intake`, `epub-intake`, `markdown-upload`, `upload-queue`, `browse-open`, `remove-cascade`, `search-tag-filter`, `a11y`, `portability/round-trip`, `portability/core-flow-spine` — plus `chrome/library-tidy` pins `.library-section-add` DOM order and `.ingest-control .status` scoping (upload-queue L47).
**How to avoid:** Enumerate ALL of them in the plan (list above is grep-verified this session); add the shared `openAddDialog` helper (Pattern 7); update every driver spec in the SAME plan that dissolves the add section — never a follow-up. These are legitimate strengthen-only-compatible surface changes the phase owns honestly (the CONTEXT's "legitimate surface changes this phase owns honestly" clause covers them).
**Warning signs:** full `npm run test` exit 1 with failures clustered in ingestion/library/portability specs.

### Pitfall 2: Stale open-prop wedge after Esc close
**What goes wrong:** Esc closes the native dialog; React `open` state stays true; reopening does nothing.
**Why it happens:** `close()` via Esc bypasses React; without a `cancel` listener routing through onCancel the state mirror desyncs (the 09-06 bug, fixed in BookRemoveConfirm).
**How to avoid:** Register BOTH `close` (focus restore) and `cancel` (preventDefault + route through the React close path) listeners — Pattern 1.
**Warning signs:** dialog opens once per page load; e2e "reopen after Esc" fails.

### Pitfall 3: The cancel-blocking listener reads stale state
**What goes wrong:** D16-10's `if (submitting) e.preventDefault()` silently stops working — Esc closes the dialog mid-flight.
**Why it happens:** The listener closure captures the `submitting` value from when the effect registered; the async submit flips state after registration.
**How to avoid:** Live-ref mirror (`submittingRef.current = status === "submitting"` every render — the LibraryView `liveContextRef` L236 discipline) or re-register the listener keyed on `status`.
**Warning signs:** Esc-during-submit test passes when clicked before submit but fails after.

### Pitfall 4: File pick lost on source switch (D16-07 violation)
**What goes wrong:** Reader picks a file, peeks at Paste text, returns to Upload — the pick is gone.
**Why it happens:** Unmounting `<input type="file">` clears its FileList; `input.files` cannot be reassigned programmatically.
**How to avoid:** Pattern 3(a) — keep the input mounted with the `hidden` attribute when another source is selected; state-held File (3b) also works but changes the submit read path.
**Warning signs:** e2e "switch away and back keeps the pick" fails; hasFile mirror desyncs from input.

### Pitfall 5: jsdom blindness for dialog behavior
**What goes wrong:** Component tests pass while real browsers break (or vice versa).
**Why it happens:** jsdom does not implement the dialog top layer, inert, or engine-specific focus behavior (the standing STACK.md rule; 02-01 WebKit lesson; 09-06 stacked-modal engine divergence).
**How to avoid:** Component tests assert state machine + copy + roles; focus-trap/Esc/geometry/success-navigation assertions run in Playwright across chromium/firefox/webkit (panel-keyboard.spec.ts is the precedent). Dialog focus/inert claims need real-browser proof (ADD-04).
**Warning signs:** component-only coverage for ADD-04.

### Pitfall 6: Success navigation ordering
**What goes wrong:** Article success navigates while the dialog is open → LibraryView unmounts under the open dialog; or book success closes without refreshKey → new row absent until reload.
**Why it happens:** Two coordinated effects (close + navigate / close + refresh) have an ordering contract.
**How to avoid:** Pattern 4 — article: close then hash-assign; book: close + refreshKey bump (the RemoveConfirm onConfirm precedent).
**Warning signs:** flaky e2e around `waitForURL` after submit; "book added but row missing" failures.

### Pitfall 7: Dissolving `.library-section-add` breaks the byte-stable `.status`
**What goes wrong:** The load-status live region loses its parent section or its copy/role contract changes.
**Why it happens:** It currently lives INSIDE `.library-section-add` (L560-574); D16-03 dissolves the section but the region itself survives as a byte-stable anchor.
**How to avoid:** Move the region to a surviving wrapper in the same commit; keep `role="status" aria-live="polite" aria-atomic="true"` + copy verbatim; update `library-tidy.spec.ts`'s structural assertions (`.library-section-add > .status` scoping) as a legitimate anchor change.
**Warning signs:** reading-views / library-tidy failures mentioning `.status` or "Opening article…".

### Pitfall 8: WebKit starvation / stale dev server at the honest gate
**What goes wrong:** Full suite exits 1 on webkit-only beforeEach starvations despite green specs in isolation.
**Why it happens:** Reused Vite dev server hours old (`reuseExistingServer: !CI`) — the 15-04 permanent lesson.
**How to avoid:** Fresh dev server for the phase-gate run; "identical-cell failure across engines = regression; webkit-only + isolation-green = harness/environment."
**Warning signs:** webkit timeouts with zero code-level failures.

### Pitfall 9: Radio default that isn't (D16-08)
**What goes wrong:** Dialog opens on the last-used source (accidental persistence) or on nothing (no input visible).
**Why it happens:** State initializer reading session storage; or uncontrolled radios keeping DOM state across open/close cycles (Firefox even persists checked across loads).
**How to avoid:** Controlled radios with `useState<Source>("url")` reset at every open (the open-prop sync effect is the reset point); key the picker on dialog-open if needed.
**Warning signs:** reopen-shows-previous-source test failure.

## Code Examples

### The IngestControl submission spine (carries into AddDialog near-verbatim)
```tsx
// Source: src/ingestion/IngestControl.tsx L161-197 (URL/paste arm — verbatim shape)
async function handleSubmit(which: "url" | "paste") {
  setStatus("submitting");
  setMessage("Fetching article…");
  try {
    const result = which === "url" ? await ingestUrl(urlValue) : await ingestHtml(htmlValue);
    const alreadyInLibrary = await dexieLibrarySource.has(result.article.id); // D7-07 BEFORE save
    if (alreadyInLibrary) {
      setStatus("error");
      setMessage(mapReasonToCopy("already-in-library")); // "Already in your library." (D16-09)
      return;
    }
    await dexieLibrarySource.save(result.article);
    setStatus("success");
    setMessage(null);
    window.location.hash = `#/article/${result.article.id}`; // D16-12 article arm
  } catch (e) {
    setStatus("error");
    setMessage(e instanceof IngestionError ? mapReasonToCopy(e.reason) : mapReasonToCopy("server-error"));
  }
}
```

### The G2 reset seam (D16-11)
```tsx
// Source: src/ingestion/IngestControl.tsx L148-151 — every terminal outcome routes here
function resetFilePick() {
  if (fileInputRef.current !== null) fileInputRef.current.value = ""; // same-file re-pick re-fires onChange
  setHasFile(false);
}
```

### The dialog status live region (mirrors the IngestControl discipline)
```tsx
// Source: src/ingestion/IngestControl.tsx L450-459 — the dialog owns its own region
<div className="status" role="status" aria-live="polite" aria-atomic="true">
  {status === "submitting" && message !== null && <p>{message}</p>}
  {status === "error" && message !== null && <p>{message}</p>}
  {status === "success" && message !== null && <p>{message}</p>}
</div>
```

### Centered-modal geometry (POLISH-07 tokens)
```css
/* Source: src/app.css L2349-2364 (library-remove-confirm) — the clone the AddDialog extends */
dialog.add-dialog {
  margin: auto;                             /* WHATWG UA dialog centering (13-03) */
  padding: 0;
  border: 1px solid var(--hairline);
  border-radius: 8px;
  background: var(--surface-raised);
  color: var(--ink);
  width: calc(100vw - var(--space-xl));     /* safe at 320px */
  max-width: 480px;                         /* planner may widen for the picker */
  overflow: auto;                           /* tall content / high zoom scrolls */
}
dialog.add-dialog::backdrop { background: rgba(31, 27, 22, 0.5); }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Permanently-mounted ingest forms on the Library page | Focused `<dialog>` workflow behind one header button | This phase (ADD-01) | Calmer library page; dialog gives free a11y modal semantics |
| Esc always dismisses | Cancelable close requests (`cancel` event) funnel Esc + requestClose + mobile back | Baseline since March 2022 [CITED: MDN] | One listener implements D16-10 across all platforms |
| Filtered-to-zero renders a bare empty ul (deliberate D14-26) | Honest no-matches line + clear filters | This phase (LIB-09) | Filtered-out ≠ empty view; feedback layer completes LIB-09 |
| Strip on all views | Strip on All only | This phase (LIB-10/D16-14) | Ends duplication on In-progress / orphans on Unread/Finished |

**Deprecated/outdated:**
- `requestClose()` is newly specified but NOT needed here — no code path requires programmatic close-request gating; `close()` + disabled controls + cancel-listener cover everything. [ASSUMED — based on MDN method list; not used by any decision]
- Do not reach for Popover API for the dialog surface — NotePopover history (13-11): non-`<dialog>` overlays lack the VoiceOver modal context.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `requestClose()` is unnecessary for this phase (close() + cancel listener + disabled controls suffice) | State of the Art | Low — if needed later it composes with the same cancel listener |
| A2 | React 18+ treats setState on unmounted components as a silent no-op (article-success close/navigation ordering edge) | Pattern 4 | Low — close-first ordering avoids the question entirely |
| A3 | Recommended (not locked): extract `mapReasonToCopy`+`bytesToBase64` to `src/ingestion/ingestCopy.ts`; alternative is keeping IngestControl.tsx as an export host | Project Structure | Low-moderate — either works; the two copy tests' imports must update either way if the file moves |

All other claims were verified against the codebase this session or cited from MDN.

## Open Questions

1. **File-pick preservation mechanism (D16-07 × D16-05 tension)**
   - What we know: FileList is lost on input unmount; `input.files` is read-only; D16-07 demands the pick survives switches; D16-05 says only the selected source's input renders.
   - What's unclear: whether "renders" means visually-present (hidden-but-mounted input OK) or strictly mounted-only-when-selected (state-held File required).
   - Recommendation: hidden-but-mounted (`hidden` attribute removes it from the a11y tree AND keeps value + ref + G2 seam verbatim) — Pattern 3(a). Planner decides; a UI-SPEC sketch would settle it.
2. **Where `mapReasonToCopy` lives after IngestControl retires**
   - What we know: two byte-pinning tests import it from `IngestControl.tsx`; the component retires (CONTEXT discretion).
   - What's unclear: new module vs. file-as-export-host.
   - Recommendation: new `src/ingestion/ingestCopy.ts` + import-path updates in the 2 copy tests (strings byte-identical, pins hold).
3. **Book-success focus landing (discretion item)**
   - What we know: refreshKey reload is async; the new row exists only after the load resolves; D14-05 layering gives the uniform h1 rule.
   - Recommendation: h1 focus (default scroll) — row-targeted focus would need a ready-gated lookup (extra machinery for one path). Planner may prefer row focus; then gate on the loading→ready transition.
4. **Exact copy set (UI hint: yes)**
   - Dialog title/labels, radio labels + helper hints, initial-focus choice, no-matches line + clear-filters label, empty-All pointer copy, book-success landing announcement (in-dialog vs on-list) — all UI-SPEC decisions this research intentionally does not fix.
5. **Dialog max-width**
   - 480px is the confirm-dialog precedent; the AddDialog hosts a radio group + input + status — possibly wants 560-640px. Geometry at 320px + 400% zoom is the constraint that matters (reflow spec extension).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Vite 8 dev server, CI | ✓ | 22 LTS (STACK.md baseline) | — |
| npm | installs | ✓ | project lockfile | — |
| Vite dev server :5173 | e2e webServer + /api/ingest middleware | ✓ | 8.1.5 | fresh server for gates (15-04 lesson) |
| Playwright browsers (chromium/firefox/webkit) | 3-engine e2e | ✓ | 1.61.1 lockfile-pinned | — |
| Vitest + jsdom | unit/component | ✓ | 4.1.10 | — |
| React Testing Library | AddDialog component tests | ✓ | 16.3.2 (+ @testing-library/dom) | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

> Nyquist validation enabled (`workflow.nyquist_validation: true` in .planning/config.json).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (unit + component, jsdom via `test.projects`) + Playwright Test 1.61.1 (chromium / firefox / webkit) |
| Config files | `vitest.config.ts` (two projects: `unit`, `server`), `playwright.config.ts` (3 desktop projects + chromium-throttled-mobile) |
| Quick run command | `npx vitest run tests/component/AddDialog.test.tsx && npx playwright test tests/e2e/ingestion/happy-path.spec.ts --project=chromium` |
| Full suite command | `npm run test` (unit `--run` then e2e; honest gate = exit 0 in ONE invocation, fresh dev server) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LIB-09 | Filtered-to-zero shows no-matches line (distinct from membership empty); clear-filters resets query+tag; membership-empty still shows EMPTY_COPY | e2e | `npx playwright test tests/e2e/library/search-tag-filter.spec.ts` | ✅ (strengthen: add no-matches cases) |
| LIB-09 | Switcher counts stay membership-pure mid-search (D16-16) | e2e | `npx playwright test tests/e2e/library/reading-views.spec.ts` | ✅ (strengthen: search-active count assertion) |
| LIB-10 | Strip visible on All; absent on Unread/In-progress/Finished; surface unchanged on All | e2e | `npx playwright test tests/e2e/library/reading-views.spec.ts tests/e2e/library/progress-recent.spec.ts` | ✅ progress-recent (All) / ❌ view-gating cases → Wave 0 additions to reading-views |
| ADD-01 | Header button opens dialog; three forms absent from page; Library stays mounted (inert behind backdrop) | e2e | `npx playwright test tests/e2e/ingestion/happy-path.spec.ts` (migrated) | ✅ (migrate + strengthen) |
| ADD-01 | Dialog a11y: axe scan open-state | e2e | `npx playwright test tests/e2e/a11y.spec.ts` | ✅ (strengthen: dialog-open scan) |
| ADD-02 | 3 radios (fieldset/legend); only selected input visible; combined picker + extension dispatch | component + e2e | `npx vitest run tests/component/AddDialog.test.tsx` | ❌ Wave 0 (migrated from IngestControl.test.tsx) |
| ADD-02 | Input survives source switches; always opens on Web address (D16-07/08) | component | same | ❌ Wave 0 |
| ADD-03 | Dedupe-refuse copy + no-save; refusal copy byte-stable (`mapReasonToCopy`) | unit | `npx vitest run tests/unit/pdf-copy.test.ts tests/unit/epub-copy.test.ts` | ✅ (import-path update only) |
| ADD-03 | URL/paste preserved across failure; file pick cleared (G2) + retry re-pick fires | component + e2e | component + `npx playwright test tests/e2e/library/upload-queue.spec.ts` | ✅ upload-queue (migrate helpers) |
| ADD-03 | No duplicate submission: dismissal blocked while submitting (Esc + close controls) | e2e | `npx playwright test tests/e2e/ingestion/` (new focused-add spec) | ❌ Wave 0 |
| ADD-04 | Focus: trigger restore on close, WebKit explicit initial focus, Esc-dismiss when idle | e2e | `npx playwright test tests/e2e/panel-keyboard.spec.ts`-style new spec, 3 engines | ❌ Wave 0 |
| ADD-04 | Success navigation: article → `#/article/<id>`; book → Library + new row + skip disclosure | e2e | happy-path (article, migrated) + epub-intake (book, migrated) | ✅ (migrate) |
| ADD-04 | 320px reflow + 400% zoom: dialog + picker operable, no horizontal overflow | e2e | `npx playwright test tests/e2e/reflow.spec.ts tests/e2e/high-zoom.spec.ts` | ✅ (strengthen: dialog-open states) |
| ADD-04 | Keyboard walkthrough: radio arrows, Tab order, focus ring visible | e2e | a11y.spec.ts keyboard-walkthrough pattern | ✅ (strengthen or new focused-add spec) |

### Sampling Rate

- **Per task commit:** quick run — the migrated/added component spec + the single most-related e2e spec on chromium (`npx vitest run tests/component/AddDialog.test.tsx && npx playwright test <spec> --project=chromium`).
- **Per wave merge:** the library + ingestion e2e directories on all 3 engines (`npx playwright test tests/e2e/library tests/e2e/ingestion tests/e2e/chrome/library-tidy.spec.ts`).
- **Phase gate:** full `npm run test` exit 0 in one invocation, fresh Vite dev server (the 15-04 webkit-starvation lesson) — the honest-gate discipline (04-11/09-07/15-04 precedent).

### Wave 0 Gaps

- [ ] `tests/component/AddDialog.test.tsx` — NEW; migrate the IngestControl state-machine/copy/dedupe coverage + add picker/switch-preservation/always-Web-address cases (covers ADD-02/03 component layer)
- [ ] `tests/e2e/library/add-dialog.ts` — NEW shared openAddDialog/pickSource helper (Pattern 7)
- [ ] `tests/e2e/library/focused-add.spec.ts` — NEW; dismissal-blocking (Pitfall 3), focus restore, switch-preservation e2e, reopen-on-Web-address, close-then-navigate ordering (covers ADD-03/04 e2e layer)
- [ ] Strengthen `search-tag-filter.spec.ts` (no-matches + clear-filters), `reading-views.spec.ts` (strip gating + counts-pure-mid-search), `reflow/high-zoom` (dialog-open states)
- [ ] Migrate the 12 ingest-surface driver specs to the helper (same plan as the add-section dissolution — Pitfall 1)

*(Test framework itself: no gaps — vitest/playwright/RTL all configured and green at Phase 15 close: 2529 passed / 0 failed / 23 documented skips.)*

## Security Domain

> `security_enforcement: true`, ASVS level 1, block on high. This phase adds **no new trust boundaries** — it re-arranges UI over existing, hardened seams.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | No auth in scope (local-first, no accounts) |
| V3 Session Management | no | No sessions (local-first) |
| V4 Access Control | no | No multi-user surface |
| V5 Input Validation | yes | Existing stack, reused verbatim: Zod at the ingest boundary (client re-validation via `ArticleSchema.parse` — STATE-04); extension-aware client size caps BEFORE any read (T-8-14/T-11-02/T-12-09); server caps re-check (defense in depth). The dialog adds no new validation surface — same inputs, same pipeline |
| V6 Cryptography | no | No new crypto (existing export hashing untouched) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation (all existing, reused) |
|---------|--------|--------------------------------------------|
| SSRF via URL ingest | Tampering/Elevation | `safeFetch` measure chain — unchanged; refusal copy routes through `mapReasonToCopy` in the dialog (T-7-26 no-jargon guard keeps pinning) |
| Content bombs via upload | DoS | Client extension-aware caps pre-read + middleware 413 + decoded re-check — carried over byte-identically into the dialog's file arm |
| XSS via pasted/ingested HTML | Tampering | The canonical document model is the boundary (sanitize once at ingest; never `dangerouslySetInnerHTML`); the dialog renders only controlled inputs + React-escaped copy; `lint:no-danger` guard unaffected |
| Duplicate submission during flight | Tampering (integrity) | NEW this phase, solved by design: D16-10 blocks dismissal while submitting + submit guards on `status === "submitting"` (existing IngestControl guard) — no double-POST path |
| Re-ingest overwrite / orphaned annotations | Tampering | D7-07 dedupe-refuse BEFORE save (has/hasBook) — reused verbatim (D16-09 keeps it refusal-only) |
| DOM XSS via filter-derived strings in no-matches copy | Tampering | None — query/tag strings render as React text children (escaped by construction, the libraryFilter T-8-12 analysis holds) |

**Security-relevant greps for verification:** `dangerouslySetInnerHTML` (expect 0 in src/), `db.delete|removeBook|dexieLibrarySource.remove` call sites (expect unchanged single-call-site discipline), `mapReasonToCopy` string table (expect byte-identical — the copy tests enforce).

## Sources

### Primary (HIGH confidence)

- **Codebase (read in full this session):** `src/ingestion/IngestControl.tsx` (462 L), `src/ingestion/library/LibraryView.tsx` (746 L), `src/ingestion/library/RemoveConfirm.tsx`, `src/ingestion/library/BookRemoveConfirm.tsx`, `src/ingestion/library/ContinueReadingStrip.tsx`, `src/ingestion/library/libraryFilter.ts`, `src/ingestion/library/librarySession.ts`, `src/ingestion/library/LibrarySearch.tsx`, `src/ingestion/library/TagFilter.tsx`, `src/ingestion/IngestionClient.ts`, `src/reader/SettingsPanel.tsx`, `src/reader/TagEntry.tsx`, `src/App.tsx`, `src/app.css` (dialog/library/token blocks), `vitest.config.ts`, `playwright.config.ts`, `package.json`
- **Codebase (grepped + excerpted):** the 16 ingest-surface test files; `Header.tsx` (`aria-haspopup="dialog"` trigger precedent); `booksStore.ts`/`LibrarySource.ts` export seams
- [MDN: HTMLDialogElement cancel event](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/cancel_event) — page modified 2026-08-27; Baseline March 2022; Esc + requestClose + mobile-back; cancelable; preventDefault semantics
- [MDN: input type=radio](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/radio) — page modified 2026-06-09; name-grouping, fieldset/legend, label hit-area, Firefox checked-persistence note
- `.planning/phases/16-…/16-CONTEXT.md` — D16-01..16 + discretion + deferred (the governing decisions)
- `.planning/phases/14-…` and `15-…` CONTEXT contracts as summarized in 16-CONTEXT (D14-12..26, D15-08/11..16, POLISH-07)

### Secondary (MEDIUM confidence)

- STATE.md accumulated decisions cited in-pattern: 02-01 (WebKit focus), 09-06 (openRef wedge), 13-03 (margin:auto centering), 13-08 (G2 reset), 15-04 (dev-server starvation) — all cross-checked against the code where load-bearing

### Tertiary (LOW confidence)

- None — no WebSearch-only claims; the three [ASSUMED] items are logged above

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages; everything verified in package.json + code this session
- Architecture: HIGH — every pattern cloned from read-in-full in-repo precedents; platform facts MDN-cited
- Pitfalls: HIGH — blast radius grep-verified; pitfalls drawn from documented STATE.md lessons + live code reading
- Validation: HIGH — framework configs read; Wave 0 gaps enumerated from the actual test tree

**Research date:** 2026-08-29
**Valid until:** 2026-09-28 (stable codebase-internal domain; re-check only if Phase 17+ lands first)
