# Phase 16: Organized Library and Focused Add Flow - Pattern Map

**Mapped:** 2026-08-29
**Files analyzed:** 14 new/modified file targets (incl. two grouped test-batch rows)
**Analogs found:** 14 / 14 (12 exact, 1 role-match, 1 partial)

> This phase is a codebase-internal reorganization: every new surface is a
> structural clone of a proven in-repo pattern. The two load-bearing analog
> pairs are (1) **BookRemoveConfirm.tsx** for the AddDialog's dialog shell
> (it is the ONLY clone that already carries the `cancel` listener D16-10
> extends) and (2) **IngestControl.tsx** for the dialog's submission spine
> (four-state machine + dedupe + G2 reset + `.status`, carried verbatim).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/ingestion/AddDialog.tsx` (NEW) | component | request-response (ingest POST → typed success/refusal) | `src/ingestion/library/BookRemoveConfirm.tsx` (shell) + `src/ingestion/IngestControl.tsx` (spine) | exact (dual) |
| `src/ingestion/ingestCopy.ts` (NEW) | utility | transform (reason enum → calm copy; bytes → base64) | `src/ingestion/IngestControl.tsx` L41-116 (verbatim extraction source) | exact |
| `src/ingestion/library/LibraryView.tsx` (EDIT) | component | CRUD (list derive/filter render; dialog open state) | itself — in-file RemoveConfirm/BookRemoveConfirm wiring L700-743, empty branch L620-631, strip section L553-555 | exact (in-file) |
| `src/app.css` (EDIT) | config (styles) | n/a | `dialog.library-remove-confirm` block L2349-2364 | exact |
| `src/ingestion/IngestControl.tsx` (RETIRE) | — | — | — (source of extraction; deleted same phase) | — |
| `tests/component/AddDialog.test.tsx` (NEW) | test (component) | request-response | `tests/component/IngestControl.test.tsx` | exact |
| `tests/e2e/library/add-dialog.ts` (NEW) | test utility (shared helper) | request-response | `tests/e2e/library/markdown-payload.ts` (non-spec helper convention) | partial (convention only) |
| `tests/e2e/library/focused-add.spec.ts` (NEW) | test (e2e, 3 engines) | request-response + focus events | `tests/e2e/panel-keyboard.spec.ts` | role-match |
| `tests/unit/pdf-copy.test.ts`, `tests/unit/epub-copy.test.ts` (EDIT) | test (unit) | transform | `tests/unit/pdf-copy.test.ts` L12 (import-path-only change) | exact |
| 12 ingest-surface e2e specs (EDIT — see Blast Radius table below) | test (e2e) | request-response | `tests/e2e/ingestion/happy-path.spec.ts` L92-102 form-driving pattern | exact |
| Strengthen: `search-tag-filter`, `reading-views`, `reflow`, `high-zoom`, `a11y` specs (EDIT) | test (e2e) | CRUD view | same files, strengthen-only additions | exact (in-file) |

## Pattern Assignments

### `src/ingestion/AddDialog.tsx` (component, request-response)

**Analogs:** `src/ingestion/library/BookRemoveConfirm.tsx` (dialog shell — clone it
exactly) + `src/ingestion/IngestControl.tsx` (submission body — move verbatim)

**Anti-pattern first (clone-lineage rule):** AddDialog joins the clone lineage —
NO shared Dialog component, and it uses its OWN `.add-dialog*` CSS hooks (never
`.library-remove-confirm`): RemoveConfirm, BookRemoveConfirm, and AddDialog will
all three be mounted in LibraryView, and a shared class breaks strict-mode
`dialog.<class>` locators (BookRemoveConfirm.tsx L19-23 comment states the rule).

**Dialog shell — open-prop sync + explicit initial focus** (BookRemoveConfirm.tsx L63-86, verbatim shape):

```tsx
useEffect(() => {
  const dlg = ref.current;
  if (!dlg) return;
  if (open && !dlg.open) {
    triggerRef.current = document.activeElement as HTMLElement | null;
    dlg.showModal(); // browser: focus→first focusable, trap, inert backdrop, Esc closes
    // WebKit does NOT auto-focus dialog controls (02-01 lesson) — explicit focus:
    const initial =
      dlg.querySelector<HTMLElement>("[data-initial-focus]") ??
      dlg.querySelector<HTMLElement>(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
      ) ??
      dlg;
    initial.focus();
  } else if (!open && dlg.open) {
    dlg.close();
  }
}, [open]);
```

**Dialog shell — close + cancel listeners** (BookRemoveConfirm.tsx L92-111, verbatim):

```tsx
useEffect(() => {
  const dlg = ref.current;
  if (!dlg) return;
  const handleClose = () => {
    triggerRef.current?.focus();
  };
  const handleCancel = (e: Event) => {
    // Esc fires `cancel` then `close`. Route through onCancel so the
    // open-prop mirror resets (09-06: stale open=true wedges reopen).
    e.preventDefault();
    onCancel();
  };
  dlg.addEventListener("close", handleClose);
  dlg.addEventListener("cancel", handleCancel);
  return () => {
    dlg.removeEventListener("close", handleClose);
    dlg.removeEventListener("cancel", handleCancel);
  };
}, [onCancel]);
```

**D16-10 variant (in-flight blocking) — gate the SAME listener on live state.**
Pitfall 3: a plain closure captures a stale `submitting`. Use the live-ref
discipline from LibraryView.tsx L236 (`liveContextRef.current = { view, query, activeTag }`
rewritten EVERY render):

```tsx
// AddDialog sketch (RESEARCH Pattern 1 + LibraryView L236 discipline):
const submittingRef = useRef(false);
submittingRef.current = status === "submitting"; // live mirror, every render

const handleCancel = (e: Event) => {
  if (submittingRef.current) {
    e.preventDefault(); // stay open — no state churn, no zombie request
    return;
  }
  e.preventDefault();
  onCancel();
};
```

Also disable the dialog's close/cancel buttons while submitting (defense in
depth — the `cancel` event covers Esc AND mobile back; controls cover clicks).
Initial-focus choice (first radio vs URL input vs Close button) is planner/
UI-SPEC discretion — neither is destructive.

**Source picker — controlled fieldset/radio** (SettingsPanel.tsx L370-402 discipline):

```tsx
// Source: src/reader/SettingsPanel.tsx L370-381 (verbatim shape)
<fieldset className="add-source-picker">
  <legend>Add from</legend>
  <label className="add-source-row">
    <input
      type="radio"
      name="source"
      value="url"
      checked={source === "url"}
      onChange={() => setSource("url")}
    />
    <span>Web address</span>
  </label>
  {/* … Paste text / Upload file … */}
</fieldset>
```

- `useState<"url" | "paste" | "file">("url")` — controlled radios, reset to
  "url" at EVERY open (D16-08; the open-prop sync effect is the reset point —
  Pitfall 9: uncontrolled radios persist checked state in Firefox).
- NOT a tablist (D14-22 machinery deliberately avoided — D16-05).

**Input preservation across source switches (D16-07 / RESEARCH Pattern 3a):**
typed URL/paste text survives trivially (lifted state outlives unmounted
inputs). The FILE input must stay mounted — unmounting clears `input.files`
(read-only, non-reassignable). Keep it always-mounted with the `hidden`
attribute when `source !== "file"`: value + `fileInputRef` + the G2
`resetFilePick` seam then work byte-unchanged.

**Submission spine — carry verbatim from IngestControl.tsx L161-197** (URL/paste arm):

```tsx
async function handleSubmit(which: "url" | "paste") {
  setStatus("submitting");
  setMessage("Fetching article…");
  try {
    const result =
      which === "url"
        ? await ingestUrl(urlValue)
        : await ingestHtml(htmlValue);

    // D7-07 dedupe-refuse: has() BEFORE save — no overwrite, no orphaned highlights.
    const alreadyInLibrary = await dexieLibrarySource.has(result.article.id);
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
    if (e instanceof IngestionError) {
      setMessage(mapReasonToCopy(e.reason));
    } else {
      setMessage(mapReasonToCopy("server-error"));
    }
  }
}
```

Dialog adaptation (D16-12): article success = close the dialog FIRST, then the
hash assignment (close-first runs focus-restore while the trigger is still
mounted). Book success = close + `onBookAdded()` callback → LibraryView's
`setRefreshKey((k) => k + 1)` (the RemoveConfirm onConfirm precedent, LibraryView
L704-716). File arm (extension dispatch + per-format caps + epub book path +
G2 resets at every terminal outcome) carries verbatim from IngestControl.tsx
L231-351 — including `resetFilePick` (L148-151) on failure so retry = re-pick
(D16-11), while URL/paste text is NEVER cleared by an error.

**Status live region inside the dialog** (IngestControl.tsx L450-459, verbatim):

```tsx
<div className="status" role="status" aria-live="polite" aria-atomic="true">
  {status === "submitting" && message !== null && <p>{message}</p>}
  {status === "error" && message !== null && <p>{message}</p>}
  {status === "success" && message !== null && <p>{message}</p>}
</div>
```

**Imports pattern** (IngestControl.tsx L25-37 — the seam set, reused not forked):

```tsx
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ingestUrl, ingestHtml, ingestMarkdown, ingestPdf, ingestEpub,
  IngestionError, type IngestionSuccess,
} from "./IngestionClient";
import { dexieLibrarySource } from "./LibrarySource";
import { hasBook, saveBook } from "../persistence/booksStore";
import { EPUB_MAX_BYTES, PDF_MAX_BYTES } from "./types";
import { mapReasonToCopy, bytesToBase64 } from "./ingestCopy"; // NEW import after extraction
```

---

### `src/ingestion/ingestCopy.ts` (utility, transform)

**Analog:** `src/ingestion/IngestControl.tsx` L41-116 — the extraction source.
Move BOTH functions byte-identically; strings are load-bearing product surface.

- `mapReasonToCopy(reason: IngestionFailureReason): string` (L55-97) — the
  20-reason → calm DOC-06 copy map, currently EXPORTED and byte-pinned by
  `tests/unit/pdf-copy.test.ts` + `tests/unit/epub-copy.test.ts`. Keep the
  export + doc comment; only the file moves.
- `bytesToBase64(bytes: Uint8Array): string` (L108-116) — 0x8000-chunked
  base64 (a one-shot spread on a 10MB PDF throws RangeError). Currently
  private; export it from the new module so AddDialog imports it.

Import-path-only edits follow in the two copy tests (see Tests section).

---

### `src/ingestion/library/LibraryView.tsx` (component, CRUD) — EDIT

**Analog:** itself — every edit point is an established in-file pattern.

**Header row — the Add button's landing zone (D16-03)** (LibraryView.tsx L538-549):

```tsx
<header className="library-header">
  {/* byte-stable page heading … the header returns to the calm h1 row POLISH-06 established. */}
  <h1 ref={h1Ref} tabIndex={-1}>
    Saved articles
  </h1>
</header>
```

`.library-header` is already `display:flex; justify-content:space-between`
(app.css L2214-2222) — the button slots in with zero CSS churn. Trigger
markup precedent (Header.tsx L230-243, the gear button):

```tsx
<button
  type="button"
  className="…"          // own hook class, e.g. .library-add-button
  onClick={onOpenSettings}
  aria-label="Reading settings"
  aria-haspopup="dialog"
  aria-expanded={settingsOpen}
>
```

Open-state location is planner discretion (CONTEXT); LibraryView-local
`const [addOpen, setAddOpen] = useState(false)` is the recommended shape
(the trigger is in-page; settingsOpen is App-level only because the shell
header triggers it).

**Strip gating (D16-14)** — LibraryView.tsx L550-555, wrap the existing section:

```tsx
<section className="library-section library-section-continue">
  <ContinueReadingStrip />
</section>
```
becomes `{view === "all" && ( <section …>…</section> )}`. The strip component
itself (ContinueReadingStrip.tsx, 255 L) is byte-unchanged (D16-15) — it
already self-gates on empty (returns null, L220).

**Add-section dissolution (D16-03 + Pitfall 7)** — LibraryView.tsx L556-574.
`<IngestControl />` leaves; the `.status` load live region SURVIVES byte-stable
(role/aria/copy verbatim), re-homed under a surviving wrapper in the SAME commit:

```tsx
<section className="library-section library-section-add">
  <IngestControl />
  <div className="status" role="status" aria-live="polite" aria-atomic="true">
    {status === "loading" && <p>Opening article…</p>}
    {status === "error" (<>…Couldn't open this article.…) }
  </div>
</section>
```

`chrome/library-tidy.spec.ts` pins `.library-section-add` DOM order +
`.library-section-add > .status` scoping — its structural assertions update as
legitimate anchor changes; the region's role/aria/copy contract must NOT.

**No-matches branch (D16-13)** — extends the ELSE arm of the L620-631 conditional:

```tsx
{viewArticles.length === 0 && viewBooks.length === 0 && status === "ready" ? (
  <>
    <h2>{EMPTY_COPY[view].heading}</h2>
    <p>{EMPTY_COPY[view].body}</p>
  </>
) : (
  <ul className="library-list" ref={listRef} onClick={launchCapture}>…rows…</ul>
  // ADD beside/inside the ul: when membership-non-empty AND
  // visibleItems.length + visibleBooks.length === 0 && status === "ready" →
  // <p className="library-no-matches"> + clear-filters <button type="button">
  // (onClick: setQuery("") + setActiveTag(null) — RESEARCH Pattern 5 sketch)
)}
```

Membership key stays `viewArticles`/`viewBooks` (pre-filter, L462-483); the
no-matches key is `visibleItems`/`visibleBooks` (post-filter, L509/523).
Counts (`stateCounts`/`allCount`, L490-502) already derive pre-filter — zero
change (D16-16), add the spec assertion.

**Dialog wiring precedent (in-file)** — LibraryView.tsx L700-743 shows exactly
how the two existing dialogs mount + their confirm callbacks (state reset →
`setRefreshKey((k) => k + 1)` → conditional hash fallback). AddDialog follows:
book-success callback bumps refreshKey; article success navigates inside the
dialog (no LibraryView involvement needed). The dialog never unmounts the
Library, so `librarySession` capture/restore (L265-343) is structurally safe —
do NOT touch it.

---

### `src/app.css` (styles) — EDIT

**Analog:** `dialog.library-remove-confirm` block (app.css L2349-2364) — the
centered-modal geometry the `dialog.add-dialog` rules clone (POLISH-07 tokens):

```css
dialog.library-remove-confirm {
  margin: auto;                          /* UA dialog centering (13-03 POLISH-04) */
  padding: 0;
  border: 1px solid var(--hairline);
  border-radius: 8px;
  background: var(--surface-raised);
  color: var(--ink);
  width: calc(100vw - var(--space-xl));  /* safe at 320px */
  max-width: 480px;                      /* AddDialog may widen 560-640px (UI-SPEC OQ5) */
  overflow: auto;                        /* tall content / high zoom scrolls */
}
dialog.library-remove-confirm::backdrop {
  background: rgba(31, 27, 22, 0.5);
}
```

Clone with `.add-dialog`-prefixed own hooks (`.add-dialog-inner`,
`.add-source-picker`, `.library-no-matches`, …). Reuse existing token rules
verbatim for inputs/buttons: `--touch` min-height on interactive elements
(app.css L359-361 + `.ingest-control input` L852-866), `--font-ui` labels,
`--surface`/`--hairline` input borders, `--space-*` gaps, global focus-visible
ring. Retire `.ingest-control` (L808-880+) in the same commit that dissolves
the component; `.status` card rules (L326-338) stay — both regions consume
them. `.library-header` (L2214-2227) needs only the button's own hook class.
Zero motion properties by design.

---

### `tests/component/AddDialog.test.tsx` (test, request-response) — NEW

**Analog:** `tests/component/IngestControl.test.tsx` — migrate its mock
structure + state-machine/copy/dedupe coverage, then add picker cases.

**Mock pattern** (IngestControl.test.tsx L25-54 — keep verbatim, extend with
`ingestMarkdown/ingestPdf/ingestEpub` + `booksStore` mocks):

```tsx
vi.mock("../../src/ingestion/IngestionClient", () => ({
  ingestUrl: vi.fn(),
  ingestHtml: vi.fn(),
  IngestionError: class IngestionError extends Error {
    readonly reason: string;
    constructor(reason: string, message?: string) {
      super(message ?? reason);
      this.name = "IngestionError";
      this.reason = reason;
    }
  },
}));
vi.mock("../../src/ingestion/LibrarySource", () => ({
  dexieLibrarySource: { has: vi.fn(), save: vi.fn() },
}));
```

jsdom caveats already solved in the analog (L81-90): stub the
`window.location.hash` setter for success-path navigation. Component tests
assert state machine + copy + roles ONLY — focus-trap/Esc/geometry belong to
Playwright (Pitfall 5; jsdom has no dialog top layer). Carry over the
strongest cases verbatim-in-shape: "Fetching article…" announcement (L113-127),
ingestUrl→has→save ordering (L129-145), dedupe-refuse no-write (L165-183),
calm-copy mappings + no-jargon guard (L185-263). ADD: radio group renders
3 options with only selected input visible; input survives source switches;
always opens on Web address (D16-08); close controls disabled while submitting.

---

### `tests/unit/pdf-copy.test.ts` + `tests/unit/epub-copy.test.ts` (test) — EDIT

**Import-path-only change.** Current import (pdf-copy.test.ts L12):

```tsx
import { mapReasonToCopy } from "../../src/ingestion/IngestControl";
```
→ `from "../../src/ingestion/ingestCopy"`. Strings stay byte-identical — the
byte-for-byte pins (EXPECTED_PDF_COPY table L20-30) hold untouched.

---

### `tests/e2e/library/add-dialog.ts` (test utility) — NEW shared helper

**Analog (convention):** `tests/e2e/library/markdown-payload.ts` — the shared,
non-spec home under `tests/e2e/library/`. Its header comment (L3-10) states the
binding rule: a non-spec filename (not matched by Playwright's default
testMatch) registers nothing, and specs must NEVER import a `.spec.ts`
(re-registers cells). Same convention as `portability/_portability.ts` and
`annotations/_fixtures.ts`. No page-driving helper exists yet — the shape comes
from RESEARCH Pattern 7 (`openAddDialog(page)` / `pickSource(page, source)`),
with accessible names centralized so a copy change is a one-file edit.

---

### `tests/e2e/library/focused-add.spec.ts` (test, 3-engine) — NEW

**Analog:** `tests/e2e/panel-keyboard.spec.ts` — the dialog focus/trap/Esc/
restore e2e precedent (assertions: focus moves into dialog on open, Tab cycles
within, Escape closes, focus restores to trigger — via
`document.activeElement` checks inside `page.evaluate`). Clone that assertion
style for: trigger focus-restore on close, WebKit explicit initial focus,
Esc-during-submit BLOCKED (D16-10 — assert dialog still open + still
submitting), reopen-on-Web-address (D16-08), close-then-navigate ordering
(article success), switch-away-and-back keeps file pick (D16-07).

---

### 12 ingest-surface e2e specs (test) — EDIT (helper migration)

**Analog:** `tests/e2e/ingestion/happy-path.spec.ts` L92-102 — the current
driving pattern every spec repeats:

```tsx
await page.goto(`${BASE}/#/`);
await expect(page.getByRole("heading", { name: "Saved articles" })).toBeVisible();
await page.getByRole("textbox", { name: /paste html/i }).fill(PASTE_HTML);
await page.getByRole("button", { name: /add pasted article/i }).click();
```

**Blast radius (grep-verified this session)** — these are the exact queries
that break when the forms leave the page; each spec gains an
`openAddDialog(page)` (+ `pickSource` when not URL) step:

| Spec file | Driving queries used today |
|-----------|---------------------------|
| `tests/e2e/ingestion/happy-path.spec.ts` | `textbox /paste html/i`, `button /add pasted article/i`, `textbox /url/i`, `button /^add$/i` |
| `tests/e2e/pdf-intake.spec.ts` | `input#ingest-file`, `button /add file/i` |
| `tests/e2e/epub-intake.spec.ts` | `input#ingest-file`, `button /add file/i` (book success stays on Library) |
| `tests/e2e/library/markdown-upload.spec.ts` | `input#ingest-file`, `button /add file/i` |
| `tests/e2e/library/upload-queue.spec.ts` | `input#ingest-file` (incl. re-pick L120-129), `.ingest-control .status` scoping |
| `tests/e2e/library/browse-open.spec.ts` | paste-text seed form |
| `tests/e2e/library/remove-cascade.spec.ts` | `input#ingest-file` seed |
| `tests/e2e/library/search-tag-filter.spec.ts` | paste-text seed (also strengthened: no-matches + clear-filters cases) |
| `tests/e2e/a11y.spec.ts` | ingest form scan (strengthen: dialog-open axe scan) |
| `tests/e2e/portability/round-trip.spec.ts` | `input#ingest-file` seed |
| `tests/e2e/portability/core-flow-spine.spec.ts` | `input#ingest-file` seed |
| `tests/e2e/chrome/library-tidy.spec.ts` | `.library-section-add` boundingBox L120/137 + DOM order (legitimate anchor updates) |

Update all twelve in the SAME plan that dissolves the add section — never a
follow-up (RESEARCH Pitfall 1). Strengthen-only applies to untouched specs;
the honest full-suite gate (`npm run test` exit 0, fresh dev server — the
15-04 webkit lesson) closes the phase.

---

## Shared Patterns

### Native `<dialog>` clone lineage (all modals)
**Source:** `src/ingestion/library/BookRemoveConfirm.tsx` L63-111 (fullest clone — includes the cancel listener)
**Apply to:** `AddDialog.tsx` (only new modal this phase)
1. Open-prop sync effect with idempotent guards (`if (open && !dlg.open)` / `else if (!open && dlg.open)`).
2. Capture `document.activeElement` into `triggerRef` BEFORE `showModal()`.
3. Explicit focus on `[data-initial-focus]` after showModal (WebKit 02-01).
4. `close` listener restores trigger focus; `cancel` listener preventDefaults + routes through the React close path (09-06 open-prop wedge).
5. Own CSS hook classes per dialog; `<form method="dialog">` is FORBIDDEN (Chromium focus-trap interference, SettingsPanel L349-353 comment) — every control `type="button"` or prevented-submit.

### Live-ref state mirror for event listeners
**Source:** `src/ingestion/library/LibraryView.tsx` L236 — `liveContextRef.current = { view, query, activeTag }` rewritten every render
**Apply to:** AddDialog's `submittingRef` (D16-10 cancel gating), any long-lived listener reading async-flipped state.

### `.status` live region discipline
**Source:** `src/ingestion/IngestControl.tsx` L450-459 + `LibraryView.tsx` L562-573
**Apply to:** the dialog's own status region. Two DISTINCT regions after this phase: LibraryView's load-status (byte-stable anchor — survives the dissolution untouched) and AddDialog's submit-status (its own copy of the same aria shape).

### Controlled fieldset/legend/radio groups
**Source:** `src/reader/SettingsPanel.tsx` L370-402; `src/reader/TagEntry.tsx` L110 (the fieldset+legend discipline)
**Apply to:** the 3-way source picker. `name` groups (free arrow keys), `<label>` wrapping (hit area), `checked` controlled (Firefox persistence quirk), reset to default at every open.

### Dedupe-refuse before save (D7-07)
**Source:** `src/ingestion/IngestControl.tsx` L173-178 (articles: `dexieLibrarySource.has`), L282-287 (books: `hasBook`)
**Apply to:** AddDialog, verbatim — refusal-only ("Already in your library."), never an overwrite, never an "Open it" action (D16-09).

### G2 file-picker reset seam
**Source:** `src/ingestion/IngestControl.tsx` L148-151
**Apply to:** AddDialog file arm — every terminal outcome (refusal, dedupe, success, error) routes through the ONE `resetFilePick` helper; URL/paste text is never cleared by an error (D16-11).

### Success navigation split (D16-12)
**Source:** `IngestControl.tsx` L186/L339 (article: `window.location.hash = \`#/article/${id}\``) + `LibraryView.tsx` L704-716 (RemoveConfirm onConfirm: state reset → refreshKey bump → conditional hash)
**Apply to:** AddDialog success arms — article: close dialog FIRST, then hash; book: close + refreshKey bump via callback (landing focus = h1 rule D14-05, planner may gate on ready for row focus).

### POLISH-07 token discipline
**Source:** `src/app.css` — `--surface-raised` L9, `--hairline` L16, `--touch` L30, `--space-*`, `--font-ui`; dialog clone block L2349-2364
**Apply to:** all new `dialog.add-dialog*` / `.library-no-matches` / `.library-header` button styles. No motion properties; min-height `var(--touch)` on interactive elements; 320px + 400% zoom safe via `width: calc(100vw - var(--space-xl))` + `overflow:auto`.

## No Analog Found

| File | Role | Data Flow | Reason / Disposition |
|------|------|-----------|----------------------|
| `tests/e2e/library/add-dialog.ts` | test utility | request-response | No page-driving shared helper exists in-repo (markdown-payload.ts is a payload constant, not a Page helper). Follow its NON-SPEC FILENAME convention; implement from RESEARCH.md Pattern 7 sketch. |

Everything else has an exact or role-match analog. No file this phase needs an
external/RESEARCH-only pattern for its core implementation.

## Metadata

**Analog search scope:** `src/ingestion/**`, `src/reader/**`, `src/app.css`, `tests/component/`, `tests/unit/`, `tests/e2e/` (grep over all 16 ingest-surface test files)
**Files read in full:** IngestControl.tsx (462 L), BookRemoveConfirm.tsx (174 L), RemoveConfirm.tsx (151 L), LibraryView.tsx (746 L), ContinueReadingStrip.tsx (255 L), IngestControl.test.tsx (264 L), happy-path.spec.ts (163 L), pdf-copy.test.ts (68 L)
**Files read targeted:** SettingsPanel.tsx (L100-179, L360-429), Header.tsx (L222-251), app.css (L806-880, L2212-2266, L2345-2384)
**Pattern extraction date:** 2026-08-29
