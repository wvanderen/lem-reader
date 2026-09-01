# Lem Reader — Manual Screen-Reader + Keyboard Acceptance Protocol

<!--
  GSD-managed document. Mirrors the AGENTS.md markdown discipline (top-of-file
  summary header, explicit sectioning, "Downstream agents MUST read" cross-references).
  Do not edit casually — this is the durable, re-runnable ACPT-02 instrument.
  Re-run on material reader-surface changes.
-->

> **Re-run this protocol on any material change to the reader surface** — new
> reading controls, annotation flows, settings panel, pagination behavior,
> focus management, or announced status. It is the canonical manual gate that
> automation cannot replace (STACK.md: `@axe-core/playwright` catches only
> automatable issues; screen-reader and keyboard flow is not automatable
> cross-engine).

**What this is:** The durable, re-runnable **engineering** acceptance instrument
for the Lem Reader prototype's manual screen-reader (SR) + keyboard flows — the
direct fulfillment of **ACPT-02** ("Reader can complete documented keyboard-only
and manual screen-reader acceptance flows in the selected support matrix") and,
since **v1.3**, of **ACPT-08** ("Library, Highlights, Add, and Reader flows pass
the documented keyboard/NVDA/VoiceOver/reduced-motion/forced-colors/reflow/zoom
matrix with no blocker or major finding" — D21-14 grew the protocol by the
v2.1 capability flows §3 G–L; the automated matrix arms live in the extended
edge-invariant specs, this protocol owns the human SR layer).
Per PROJECT.md, this is *engineering acceptance on representative content*, not a
formal user-study instrument. This protocol proves the reader can complete the
documented flows using only a screen reader and keyboard, with no content or
required function lost or unreachable.

**What this is NOT:** A user study, a verbatim-SR-output conformance test, or an
automated test. It is a human-run manual protocol on real hardware.

| Field | Value |
|-------|-------|
| **Version** | 1.3 |
| **Authoritative decisions** | D6-05 (SR matrix), D6-06 (hybrid protocol shape), D6-07 (zero-blocker policy), D6-08 (versioned + re-run), D21-14 (v1.3 capability flows / ACPT-08), D21-12 (Safari image-flow fold-in) |
| **Applies to** | Lem Reader v2.1 (v1.0 reader/settings flows A–F + v2.1 capability flows G–L) |
| **Results recorded in** | `.planning/phases/21-integrated-refinement-and-acceptance/21-VERIFICATION.md` (v1.3 runs; the v1.0–v1.2 history lives in `06-VERIFICATION.md` / `13-VERIFICATION.md`) |
| **First run** | _Run date:_ _____________ _(filled at execution — Plan 06-06)_ |
| **Last run** | _Run date:_ _____________ _(filled at each re-run)_ |
| **Run by** | _Tester name + SR/OS versions:_ _____________ |

---

## 1. Screen-Reader + Keyboard Matrix (D6-05)

The manual SR acceptance runs against **two screen-reader + browser pairings**,
covering the two free, high-signal, runnable-on-developer-hardware screen-reader
ecosystems the accessibility-first audience most commonly uses:

| Screen reader | Browser | OS | Status |
|---------------|---------|----|--------|
| **NVDA** (free, dominant Windows SR) | **Firefox** | Windows | **Phase 6 gate** |
| **VoiceOver** (macOS/iOS built-in SR) | **Safari** | macOS | **Phase 6 gate** |

Both pairings are **required** for a complete ACPT-02 pass. Both the scripted
checklist (§3) and the exploratory charter (§4) run on **each** pairing.

### Coverage boundary: JAWS (NOT a Phase 6 gate)

**JAWS** (the dominant licensed Windows SR in enterprise/education) is recorded
as a **v1.x stretch / if-hardware-available** candidate, **NOT a Phase 6 gate.**
It is licensed and costly to run on developer hardware. NVDA + VoiceOver cover
the two SR ecosystems for the prototype; JAWS coverage is deferred to a v1.x
follow-up. If a JAWS-licensed machine is available at run time, run the same
checklist + charter on JAWS + Chrome/Edge as a bonus data point, but a JAWS gap
does not block ACPT-02.

### v1.3 scope: the four-destination surface (ACPT-08, D21-14)

The v1.0 instrument covered the **reader + settings** surface (flows A–F). The
v2.1 milestone grew the application to four destinations — **Library, Highlights,
Add dialog, Reader** — so v1.3 adds one scripted flow per v2.1 capability
(§3 G–L: library views/filters, Add dialog, metadata edit, TOC navigation,
cross-block highlight + review, images). The **automated** arms of the ACPT-08
matrix (keyboard, reduced-motion, forced-colors, 320px reflow, 400% zoom, touch
targets across all four destinations on chromium/firefox/webkit) live in the
extended D6-09 edge-invariant specs (`tests/e2e/_edge-invariant.ts` +
`assertDestinationInvariant`); this protocol does not re-prove them — it adds
the human SR layer on top. The Add-dialog flow (H) retires the Phase 16
manual-SR deferral (`.planning/phases/16-organized-library-and-focused-add-flow/16-VALIDATION.md`
§Manual SR row — axe covered the automatable checks only; the SR pass was
deferred to this instrument).

### Relationship to the automated cross-engine matrix (ACPT-01)

The **three Playwright engines** (chromium / firefox / webkit, declared in
`playwright.config.ts`) already cover the **automated** cross-engine surface for
**ACPT-01** (core reading flow without content loss). This manual protocol is the
**ACPT-02** layer that automation cannot reach: real screen-reader announcement
and keyboard-only flow. The automated keyboard substrate that this protocol
*layers onto* is:

- **`tests/e2e/panel-keyboard.spec.ts`** — proves the settings `<dialog>`
  (`showModal`) focus trap, inert backdrop, Escape-to-close, and focus-restore
  to the gear trigger across all three engines. Asserts `dialog.settings-panel`
  contains the active element (role/structure, not SR phrasing).
- **`tests/e2e/section-announce.spec.ts`** — proves A11Y-08: the polite
  `role="status"` live region announces "Section: {heading}." on heading change
  (debounced, no flood), and READ-05 (no page-number/percentage identity text).
- **Keyboard shortcuts** (D4-06 keyboard bundle): **M** (mode toggle), **H**
  (highlight), and the settings gear all reachable by keyboard.

> This protocol does **not** re-prove what those automated specs assert; it adds
> the screen-reader verification layer on top of verified automated behavior.

---

## 2. How to Author Expected Outcomes (Pitfall 7 — read before running)

> **Authoring rule (D6-06 / D6-07, Pitfall 7):** Every scripted step's *expected
> outcome* is written as **role + accessible name + state** — properties that are
> **programmatically verifiable** and stable across screen-reader versions,
> voices, and settings. It is **NOT** written as verbatim SR phrasing.

Screen-reader output is **not stable** across versions, voices, speech rates, and
settings. An expected outcome like *"NVDA says 'Reading settings, dialog, focused'"*
will flake the moment NVDA changes phrasing or a tester uses a different voice. So:

- **Expected (gate):** focus moves to a control with `role="dialog"` and
  accessible name **"Reading settings"** — verifiable via the accessibility tree.
- **Informational phrasing (guide, NOT a gate):** *"NVDA typically announces
  'Reading settings, dialog' / VoiceOver typically announces 'Reading settings,
  web dialog'."* Use this only as a tester orientation aid. A phrasing difference
  with no functional impact is a **minor** finding (§5), never a blocker.

When running a step, verify the **gate** (role + name + state) and record any
**informational** phrasing observations separately with severity = minor.

---

## 3. Scripted Core-Flow Checklist (D6-06)

Flows **A–F** are the v1.0 reader/settings core (unchanged). Flows **G–L**
(v1.3, D21-14) are the v2.1 capability flows — one per capability, each run on
**both SR pairings**. For each step: perform the **keyboard sequence**, then
verify the **expected outcome** (role + accessible name + state). Record PASS /
the finding severity (§5) per step.

**Recommended fixtures:** `essay-long-form` (longest text — end-to-end reading),
`technical-post` (3 h2 headings — exercises A11Y-08 section announce), and any
fixture with rich structure (e.g. `footnote-academic`, `list-reference`).

### Setup (before each pairing)

1. Launch the dev server: `npm run dev` (Vite, http://localhost:5173).
2. Launch the screen reader:
   - **NVDA+Firefox:** start NVDA, open Firefox, navigate to the app URL.
   - **VoiceOver+Safari:** enable VoiceOver (⌘F5), open Safari, navigate to the app URL.
3. Wipe local state if a prior run left highlights/notes: open the settings panel
   → "Clear local data" (or clear IndexedDB `lem-reader` in devtools), then reload.

---

### Flow A — Open article and read end-to-end

**Goal:** A screen-reader user can open a fixture and read the entire article
without losing content or orientation.

| # | Keyboard sequence | Expected outcome (role + name + state) |
|---|-------------------|----------------------------------------|
| A1 | From the fixture list, **Tab** to an article link (e.g. "essay-long-form") and press **Enter** | Navigation occurs; the article view mounts. The page exposes a **heading level 1** (`<h1>`) containing the article title. The SR lands on or can reach the `<h1>`. |
| A2 | **Down arrow** / **read-all** (NVDA: `NVDA+↓`; VoiceOver: `VO+↓`) through the article | Content is read in document order. Every block (headings, paragraphs, lists, blockquotes, figures, code blocks, footnotes) is reachable. **No content is skipped or repeated.** |
| A3 | Press **H** (or use the SR's heading-navigation: NVDA `H`, VoiceOver `VO+⇧+H`) | The SR moves between headings in reading order. Each heading announces its role (heading) + its text (accessible name). |
| A4 | Scroll/advance past an `<h2>` boundary and pause ~600ms | A **`role="status"` polite live region** announces "Section: {heading text}." for the section just entered. (Automated substrate: `section-announce.spec.ts` — A11Y-08.) |
| A5 | Read to the end of the article | The last block is reachable; no dead-end. No page-number or percentage identity text is announced (READ-05 — progress is conveyed via the live region, not "Page X of Y"). |

**Pass criterion:** every block is reachable in reading order; no content lost;
section changes announce; no progress-identity noise.

---

### Flow B — Switch reading mode (M)

**Goal:** The reader can toggle between paginated and scrolling modes using only
the keyboard, with location and orientation preserved (D4-10/D4-11 anchor).

| # | Keyboard sequence | Expected outcome (role + name + state) |
|---|-------------------|----------------------------------------|
| B1 | While reading an article (any mode), press **M** | The reading mode toggles (paginated ↔ scrolling). A **`role="status"` live region** announces the new mode (e.g. "Scrolling mode." / "Paginated mode."). The reader's reading location is preserved (the same passage is visible/focused after the switch). |
| B2 | Press **M** again | The mode toggles back. Location is again preserved. |
| B3 | In paginated mode, use **Right/Left arrow** (or the page-turn controls) | The page advances / retreats. A `role="status"` region announces the turn if applicable. No content is lost at the page boundary. |
| B4 | Switch to scrolling mode and read-all | The full article reads continuously (no pagination boundaries interrupt). |

**Pass criterion:** mode toggles via M from anywhere; location preserved on each
switch; both modes fully readable; no content lost across the switch.

---

### Flow C — Create a highlight

**Goal:** A keyboard/SR user can select text and create a highlight, and receives
confirmation. (Substrate: `capture-highlight.spec.ts` proves the automated path;
ANNO-01.)

> **Primary SR path = the selection toolbar (Tab → Enter).** Screen readers
> reserve single-letter keys for their own navigation — VoiceOver single-key
> Quick Nav (VO-Q) maps **H = next heading**, and NVDA browse mode and the JAWS
> virtual buffer do the same — so the bare **H** highlight shortcut is consumed
> by the SR before it reaches the app and is a **sighted keyboard/mouse
> convenience only**, not a reliable SR path. Under an SR, create highlights via
> the toolbar's real `<button>`s (`role="toolbar"`, Tab-reachable, Enter /
> VoiceOver **VO+Space** activatable); this path is tester-confirmed working
> under VoiceOver. Since the G6 fix (Plan 13-11), the toolbar is
> keyboard-reachable via a single **Tab** from the reading context in all
> supported engines. That single-Tab reachability holds whenever a real Tab
> keydown reaches the page — the sighted keyboard, or NVDA **focus mode**.
> NVDA **browse mode** binds **Tab** as its own navigation gesture and moves
> focus itself via accessibility APIs WITHOUT delivering any keydown to the
> page (official NVDA user guide), so under NVDA the tester enters focus
> mode at C2 (see `.planning/debug/g7-nvda-tab-bypass-selection-toolbar.md`,
> gap G7). The focus-mode instruction at C2 has a sibling precondition one
> step earlier, at C1 — by default, NVDA browse-mode text selection exists
> only within NVDA's virtual buffer and never changes the Firefox document
> selection ("not within the application itself" — official NVDA User Guide,
> §Native Selection Mode), so the tester MUST enable Native Selection Mode
> (**NVDA+shift+f10**) BEFORE the C1 Shift+arrows selection or the toolbar
> cannot mount and no announce can fire; see the note below the checklist
> and `.planning/debug/g8-toolbar-never-mounts-nvda.md` (gap G8).

| # | Keyboard sequence | Expected outcome (role + name + state) |
|---|-------------------|----------------------------------------|
| C1 | Navigate into a text block and make a selection: **Shift+Right arrow** (sighted keyboard), or the SR text-selection gesture (VoiceOver: **VO+Enter** to start, arrow keys to extend, **VO+Enter** to end; NVDA (Firefox): enable Native Selection Mode first (**NVDA+shift+f10**, NVDA >= 2024.1 — required, see the note below), then browse-mode **Shift+arrows**) across several words | A text selection exists within a single block (D5-05/D5-06 single-block rule). The SR announces the selected text. A polite live-region announcement (**"Highlight actions available."**) confirms the toolbar has appeared once the selection settles — the mount cue to listen for after this step. With Native Selection Mode on, the selection is also reflected in the page itself (visible on screen). |
| C2 | A selection toolbar (`.selection-toolbar`) appears. **NVDA (Firefox): press NVDA+Space to enter focus mode FIRST, then Tab** (the tester hears NVDA's focus-mode toggle confirmation before the Tab); sighted keyboard users **Tab** directly | Focus moves to the selection toolbar (`role="toolbar"`, accessible name **"Highlight actions"**). It exposes a **button** with accessible name **"Highlight"** (and a second button **"Highlight + note"**). |
| C3 | With focus on the **"Highlight"** button, press **Enter** (VoiceOver: **VO+Space**; NVDA (Firefox): **Enter** — you are in focus mode from C2, where keys pass through to the control; **NVDA+Space** also activates) | A `<mark>` element with the highlight data attribute (`mark.highlight[data-highlight-id]`) wraps the selected text. A **`role="status"` polite live region** announces "Highlight saved." (or equivalent confirmation). |
| C4 | Read the passage containing the mark | The highlighted text is announced/marked. The mark carries a semantic label identifying it as a highlight (D5-15). |

> **Sighted keyboard/mouse convenience (not an SR path):** the bare **H**
> shortcut (highlight) and **N** (highlight + note) also create highlights from a
> selection, but screen readers intercept bare single letters for their own
> navigation (see the note above), so H/N are documented as keyboard/mouse
> conveniences and are intentionally NOT part of this SR flow. The toolbar
> buttons are the equivalent SR path for both actions.

> **NVDA Native Selection Mode (required at C1):** **WHY** — by default on
> every NVDA since 2024.1 (the per-document toggle; NVDA 2026.3 adds a
> persistent Browse Mode setting, also disabled by default), browse-mode
> Shift+arrows selects only within NVDA's virtual buffer: the selection is
> not visible on screen and the page's document selection never changes. The
> toolbar's lifecycle is driven by the document selection, so with native
> selection off the toolbar cannot appear — and NO page-side code can observe
> a buffer-only selection. This is a platform boundary, not a product defect
> (NVDA User Guide §Native Selection Mode;
> `.planning/debug/g8-toolbar-never-mounts-nvda.md`, gap G8). **WHAT TO DO** —
> NVDA >= 2024.1: press **NVDA+shift+f10** (per-document; NVDA announces the
> mode change) BEFORE the C1 Shift+arrows; on NVDA 2026.3+ it can be made
> persistent in Browse Mode settings (still off by default). **FALLBACK** —
> older NVDA or a document where the toggle is unavailable: press **F7** to
> enable Firefox caret browsing (confirm the prompt), then select with
> Shift+arrows from focus mode — the caret selection IS the document
> selection (page-visible), then continue at C2 as written. **RE-RUN READING
> AID** — the C1 mount cue ("Highlight actions available.") is the
> confirmation the document selection followed; and keep C1 selections
> within a single block — a selection crossing a block boundary mounts the
> toolbar in a silent hint variant (no buttons, no announce).

**Pass criterion:** highlight is created from keyboard-only (or SR-only via the
toolbar); confirmation is announced; the mark is present and semantically labeled.

---

### Flow D — View, edit, and delete a highlight + note (drawer)

**Goal:** A keyboard/SR user can open the annotations drawer, review saved
highlights, add/edit a note, and delete a highlight. (Substrate: drawer +
`notesStore` + `highlightsStore` from Phase 5.)

| # | Keyboard sequence | Expected outcome (role + name + state) |
|---|-------------------|----------------------------------------|
| D1 | **Tab** to the annotations-drawer trigger button and press **Enter** | The annotations drawer opens. It is a region/landmark reachable by the SR. It contains one or more **entries** (`.drawer-entry`) for each saved highlight. |
| D2 | **Down arrow** / **Tab** through the drawer entries | Each entry exposes the highlighted text (accessible name/content) and any controls. The SR reads each entry's content. |
| D3 | On an entry with no note, activate the **add/edit note** control and type text | A note editor (text input / textarea) receives focus (`role="textbox"` or equivalent). The typed text saves (debounced) and is readable in the entry. |
| D4 | Focus the **delete** control on a highlight entry and activate it (Enter) | The highlight (and its note) is removed from the drawer. A **`role="status"` region** announces deletion. The drawer re-lists the remaining entries. |
| D5 | Close the drawer (**Escape**) | The drawer closes; focus returns to the trigger (or a predictable location). |

**Pass criterion:** drawer is fully operable by keyboard/SR; note add/edit works;
delete works with confirmation; close restores focus.

---

### Flow E — Navigate from a saved annotation back to its passage (D5-11)

**Goal:** From the drawer, the reader can jump back to the highlighted passage
in the article body, with focus landing on the mark.

| # | Keyboard sequence | Expected outcome (role + name + state) |
|---|-------------------|----------------------------------------|
| E1 | In the annotations drawer, focus an entry and activate its **jump/navigate-to** control (Enter) | The view navigates to the passage containing the highlight. Focus lands on the `<mark>` element (`mark.highlight[data-highlight-id]`) in the article body. The SR announces the mark + its surrounding context. |
| E2 | Continue reading from the mark (Down arrow / read-all) | Reading resumes from the highlighted passage in document order. No orientation is lost. |

**Pass criterion:** jump returns the reader to the passage; focus lands on the
mark; reading resumes predictably. (Automated substrate: `navigate-back.spec.ts`
proves the focus-land retry path.)

---

### Flow F — Adjust settings (typography / theme / measure)

**Goal:** A keyboard/SR user can open the settings panel, adjust typography,
theme, and measure, and close the panel — all via keyboard, with focus managed.
(Automated substrate: `panel-keyboard.spec.ts` — A11Y-01/02, focus trap/restore.)

| # | Keyboard sequence | Expected outcome (role + name + state) |
|---|-------------------|----------------------------------------|
| F1 | **Tab** to the settings gear trigger (a **button** with accessible name **"Reading settings"**) and press **Enter** | A **`role="dialog"`** with accessible name **"Reading settings"** opens. Focus moves **into** the dialog (the active element is contained by `dialog.settings-panel`). |
| F2 | **Tab** / **Shift+Tab** within the dialog | Focus cycles **only** within the dialog (focus trap) — it never escapes to an interactive control outside the dialog. Typography controls (font family, font size, line height, letter/word spacing), theme controls, and measure controls are all reachable. Each control exposes its role + name + current value. |
| F3 | Adjust a typography control (e.g. font size) via keyboard | The value changes and applies live (D2-03). The SR announces the new value/state of the control. The reading surface updates. |
| F4 | Adjust the theme control (e.g. light/dark/sepia) | The theme applies live (`data-theme` on the document element). |
| F5 | Press **Escape** (or activate the **"Close reading settings"** button) | The dialog closes. Focus is **restored to the gear trigger** (the "Reading settings" button is the active element). |

**Pass criterion:** dialog opens as `role="dialog"` named "Reading settings";
focus traps inside; all settings reachable + operable; close restores focus to
the trigger. (This is the manual SR layer over the `panel-keyboard.spec.ts`
automated substrate.)

---

### Flow G — Library views, search, and tag filters (v2.1)

**Goal:** A keyboard/SR user can re-orient inside the library — switch reading
views, narrow by search and by tag, and reach an article from every filtered
list. (Substrate: `reading-views.spec.ts`, `search-tag-filter.spec.ts`.)

| # | Keyboard sequence | Expected outcome (role + name + state) |
|---|-------------------|----------------------------------------|
| G1 | From `#/`, **Tab** to the "Library views" **navigation** and activate a view link (e.g. **Unread (N)**) with **Enter** | The view switches. The activated link carries `aria-current="page"`. The **heading level 1** "Saved articles" remains; the article list re-renders with that view's membership. Empty views show their calm empty-state **heading level 2** (e.g. "Nothing unread"). |
| G2 | **Tab** to the **searchbox** "Search your library", type a title fragment | The list narrows live to matching rows; each row remains a **link** whose accessible name contains the article title. Clearing the query restores the list. A non-matching query shows the no-matches state with its "Clear search and filters" **button** present. |
| G3 | **Tab** to a tag chip (a **button** whose accessible name contains the tag) inside the "Filter by tag" group and press **Enter** | The chip's `aria-pressed` state becomes `"true"`; the list narrows to articles carrying that tag. Activating again returns `aria-pressed` to `"false"` and restores the list. |
| G4 | **Tab** to an article row **link** and press **Enter** | The reader opens at that article (heading level 1 = the article title). |

**Pass criterion:** every view/filter control is reachable + operable by
keyboard; view/filter state is conveyed beyond color (aria-current,
aria-pressed, row membership); an article is reachable from every filtered
list; no view traps or silently empties without a stated empty state.

---

### Flow H — Add an article through the Add dialog (retiring the Phase 16 deferral)

**Goal:** A keyboard/SR user can add an article by web address through the
focused Add dialog, with every submission state announced calmly. This flow
retires the Phase 16 manual-SR deferral
(`.planning/phases/16-organized-library-and-focused-add-flow/16-VALIDATION.md`
§Manual SR row — "Open Add dialog with NVDA/VoiceOver, submit a URL, confirm
status announcements and refusal copy are read calmly"). (Substrate:
`focused-add.spec.ts`, `upload-queue.spec.ts`.)

| # | Keyboard sequence | Expected outcome (role + name + state) |
|---|-------------------|----------------------------------------|
| H1 | From `#/`, **Tab** to the **button** "Add to Library" and press **Enter** | A **`role="dialog"`** with accessible name **"Add to your library"** opens; focus moves **into** it — onto the **radio** "Web address" (checked state `"true"`). The library behind the dialog is inert. |
| H2 | **Tab** / **Shift+Tab** inside the dialog; **ArrowDown/ArrowUp** on the source radios | Focus stays within the dialog (never an interactive control outside). The arrow keys move the checked state across **Web address → Paste text → Upload file**; only the selected source's input is visible. |
| H3 | With "Web address" checked, **Tab** to the **textbox** "Add by URL", type a URL, then **Enter** on the **button** "Add" | The **`role="status"`** live region inside the dialog announces the submission state (fetching). On success the dialog closes and the reader opens at the new article (**heading level 1** = its title). |
| H4 | Repeat with a URL that cannot be read reliably | The dialog **stays open** in a calm error state: the **`role="status"`** region announces the refusal copy (no jargon, no stack detail); the typed URL is retained and the "Add" **button** remains enabled for retry. |
| H5 | Press **Escape** (dialog idle) | The dialog closes and focus **restores to the "Add to Library" trigger** (the active element). |

**Pass criterion:** dialog opens named + focused; source picker fully operable
by keyboard with state beyond color; submission states (fetching, refusal,
success) are announced calmly through the live region; Escape restores focus;
no submission path strands the reader.

---

### Flow I — Edit article metadata

**Goal:** A keyboard/SR user can correct an article's title/author from the
library row and see the new name everywhere. (Substrate: `metadata-edit.spec.ts`
+ the META-02 one-name-everywhere contract.)

| # | Keyboard sequence | Expected outcome (role + name + state) |
|---|-------------------|----------------------------------------|
| I1 | On `#/`, **Tab** to a row's **button** "Edit title and author for {title}" and press **Enter** | A **`role="dialog"`** with accessible name **"Edit title and author"** opens; focus moves into it (the non-destructive Cancel). |
| I2 | **Tab** to the **textbox** "Title", replace the text; same for "Author"; activate the **button** "Save" | The dialog closes (focus restored to the row's edit trigger). The library row's accessible name now carries the new title; opening the article shows **heading level 1** with the new title. |
| I3 | Reopen the dialog, clear the Title field, then activate "Save" | The save is refused calmly: the Save **button** carries `disabled` state (or the field's constraint is announced), no partial write happens — the previous title survives. |

**Pass criterion:** the edit dialog is keyboard-operable end to end; the new
name follows the article (row + reader); an invalid edit is refused calmly with
state, never a silent partial write.

---

### Flow J — Navigate with the table of contents (TOC)

**Goal:** A keyboard/SR user can open the TOC, hear where they are, and jump
between sections in both reading modes. (Substrate: `toc-navigation.spec.ts`,
`section-announce.spec.ts` — D18-02/D18-12.)

| # | Keyboard sequence | Expected outcome (role + name + state) |
|---|-------------------|----------------------------------------|
| J1 | While reading an article, **Tab** to the **button** "Table of contents" (it carries `aria-expanded="false"`) and press **Enter** | The button's `aria-expanded` becomes `"true"`; a **navigation** with accessible name **"Table of contents"** opens (popover), focus moves into it. Entries are **links** ("Top of article", then the article's headings in order). |
| J2 | **Down arrow** / read through the entries | The entry list reads in document order; the entry matching the current section carries `aria-current` (state, beyond color). On a headingless article the panel states that there is no table of contents (honest refusal, no empty list). |
| J3 | **Enter** on a section link | The panel closes (button returns to `aria-expanded="false"`, focus restores to the trigger) and the reader lands at that section: in scrolling mode the passage scrolls into view; in paginated mode the page turns to the section's page. Reading resumes in order (Down arrow / read-all). |
| J4 | Press **Escape** while the panel is open | The panel closes and focus restores to the "Table of contents" trigger. |

**Pass criterion:** TOC opens/closes by keyboard with expanded-state + focus
management; current section conveyed by state; jumps land at the section in
both modes; headingless articles refuse honestly.

---

### Flow K — Cross-block highlight + review in Highlights

**Goal:** A keyboard/SR user can highlight a passage that spans two blocks,
then find it again from the Highlights destination and jump back to it.
(Substrate: Phase 19 cross-block capture + `review-panel` suites; the Flow C
toolbar path is the SR route — see its NVDA native-selection preconditions.)

| # | Keyboard sequence | Expected outcome (role + name + state) |
|---|-------------------|----------------------------------------|
| K1 | In an article, make a selection that crosses a block boundary (e.g. the last words of one paragraph into the next — the Flow C1 selection gestures apply, including the NVDA Native Selection Mode precondition) | The selection toolbar mounts (**`role="toolbar"`**, accessible name **"Highlight actions"**) with the **button** "Highlight". The polite live region announces the actions are available. |
| K2 | Activate the **"Highlight"** button (Tab → **Enter**; VoiceOver **VO+Space**; NVDA focus mode **Enter**) | A **`<mark>`** (highlight) wraps the passage **in both blocks** — one mark per block, no silent gap at the boundary. A **`role="status"`** region announces the save. |
| K3 | Navigate to the Highlights destination (shell **navigation** "Primary" → **link** "Highlights") | The **heading level 1** "Highlights" page lists the new highlight: a **button** whose accessible name begins "Go to highlight:" and contains the quoted passage, with its date + confidence state conveyed as text (badge) where applicable. |
| K4 | **Enter** on the row button | The reader opens at the highlighted passage; focus lands on the `<mark>`. Reading resumes in document order (Down arrow / read-all). |

**Pass criterion:** cross-block selections are highlightable via the toolbar
path; the mark renders across BOTH blocks with no gap; the Highlights row
names the passage; the jump lands on the mark.

---

### Flow L — Images: save → offline reopen → view

**Goal:** A keyboard/SR user saves an article containing images, and the images
survive offline reopen as local assets (never remote fetches) with alternative
text reachable by SR. (Substrate: Phase 20 imagery suites; anti-beacon
guarantee — `img` elements render only from resolved local assets.)

| # | Keyboard sequence | Expected outcome (role + name + state) |
|---|-------------------|----------------------------------------|
| L1 | Through the Add dialog (Flow H), add a document containing images (e.g. an `.epub` with embedded figures via the "Upload file" source) | The submission announces calmly; the reader opens the new document. Each figure renders as a **figure** with a **figcaption** where the source carried one, and its **img** exposes an accessible name (alt text) — reachable by SR (Down arrow / read-all in document order). |
| L2 | Go offline (browser offline mode / disconnect), reopen the saved document from the library | The document opens WITHOUT the network; every admitted figure still renders from its local asset (same accessible names, same captions). No figure degrades to a remote fetch or a broken image; refused figures show their calm disclosure placeholder with text, never a silent hole. |
| L3 | Read a figure with the SR | The img's accessible name (or the figcaption) is announced; the figure is reachable in document order in both reading modes; no figure is skipped or read out of order. |

**Pass criterion:** images survive save + offline reopen as local assets;
figures are announced with their names/captions in order; refusals are
disclosed calmly with text.

> **D21-12 fold-in (VoiceOver+Safari session only):** after Flow L, the Safari
> session additionally completes the one-time real-Safari image-flow
> verification — **save → offline reopen → export → import with images** (a
> real EPUB-with-images upload is the network-free way to write real asset
> rows). Verify the exported-and-reimported figures still render locally and
> decode (announced names intact). Record the evidence in the v1.3 results
> sheet (§6) — `21-VERIFICATION.md` points at that record. This closes the
> Playwright-webkit Blob→IndexedDB boundary question on real Safari hardware
> (Phase 20 deferred-items ledger; D21-12).

---

### Checklist completion record (per pairing)

For each pairing, record: flow → PASS or severity (§5) + notes.

| Flow | NVDA+Firefox | VoiceOver+Safari |
|------|--------------|------------------|
| A — read end-to-end | ☐ | ☐ |
| B — switch mode (M) | ☐ | ☐ |
| C — create highlight | ☐ | ☐ |
| D — view/edit/delete + note | ☐ | ☐ |
| E — navigate back to passage | ☐ | ☐ |
| F — adjust settings | ☐ | ☐ |
| G — library views/search/tags (v1.3) | ☐ | ☐ |
| H — Add dialog (v1.3, retires Phase 16 deferral) | ☐ | ☐ |
| I — edit metadata (v1.3) | ☐ | ☐ |
| J — TOC navigation (v1.3) | ☐ | ☐ |
| K — cross-block highlight + review (v1.3) | ☐ | ☐ |
| L — images: save → offline reopen → view (v1.3) | ☐ | ☐ (VO run additionally completes the D21-12 export/import sighted pass) |

---

## 4. Exploratory Charter (D6-06)

The scripted checklist catches deterministic regressions; the exploratory charter
catches real-world usability the checklist misses. Run **each charter** on **both
SR pairings**. Goal-based: pursue the goal, note anything confusing, lost, or
unreachable.

### Charter 1 — Full reading + annotation loop, SR-only

> **Goal:** Complete the entire reading + annotation loop using only the screen
> reader (open → read → switch mode → create a highlight → add a note → navigate
> back to the passage → delete the highlight → adjust settings → return to
> reading). **Note anything confusing, lost, or unreachable.**

Look for: lost focus after an action, ambiguous announcements, controls the SR
cannot reach, content that reads out of order, actions with no confirmation,
marks/notes that are not announced.

### Charter 2 — Every fixture, end-to-end, both modes

> **Goal:** Open every one of the six corpus fixtures (`essay-long-form`,
> `technical-post`, `figure-heavy`, `footnote-academic`, `list-reference`,
> `unsupported-case`) and read each end-to-end in **both** paginated and
> scrolling modes. Confirm every block kind (headings, paragraphs, links,
> quotations, lists, images/captions, footnotes, code blocks) is reachable and
> correctly announced in both modes. **Note any block kind that is lost,
> mis-ordered, or unreachable in either mode.**

### Charter 3 — Fallback orientation

> **Goal:** Trigger a pagination fallback (an oversize block that cannot fit a
> page, forcing the scrolling fallback). Confirm the reader is **oriented**:
> the fallback is announced, no content is lost, and reading continues without
> disorientation. **Note whether the fallback transition is calm or jarring.**

### Charter 4 — Edge conditions under SR

> **Goal:** With the screen reader active, exercise the edge conditions from
> ACPT-03 at a flow level: high zoom (400%), narrow reflow (320 CSS px), forced
> colors, reduced motion. Confirm content and required functions remain reachable
> and operable under each condition via SR + keyboard. **Note anything that
> breaks orientation or reachability under an edge condition.**

### Charter 5 — Discoverability without prior knowledge

> **Goal:** Approaching the reader as someone who does not know the keyboard
> shortcuts, discover how to: switch mode, create a highlight, open settings,
> open the annotations list. Are these functions discoverable by SR/keyboard
> alone (tab order, announced names), or does the reader need external
> documentation? **Note any function that is operable but undiscoverable.**

**Record each charter finding** with: pairing, scenario, observed behavior,
severity (§5), and whether it blocks.

---

## 5. Severity Rubric (D6-07)

Classify **every finding** from the scripted checklist and the exploratory
charters using this rubric.

### Severity definitions

| Severity | Definition | Examples |
|----------|------------|----------|
| **Blocker** | A documented flow **cannot be completed** using only SR/keyboard, **or** content is lost, **or** a required function is entirely unreachable. The acceptance contract is broken. | The settings dialog cannot be opened from keyboard; a fixture's text is unreachable via SR; the highlight button does nothing; focus is trapped outside any control with no escape. |
| **Major** | A required function is reachable and completable but only with significant difficulty, **or** the reader loses orientation/function intermittently, **or** a core step works but produces a confusing/wrong outcome that materially harms usability without fully preventing completion. | Focus is lost after mode-switch (recoverable but disorienting); a drawer entry cannot be activated without retry; an announcement is so misleading the reader believes the action failed when it succeeded. |
| **Minor** | A cosmetic or phrasing-level quirk with **no functional impact**. The step completes correctly; only the surface presentation differs. | SR phrasing differs from a prior version; a control announces a verbose but correct description; a non-critical decorative element reads redundantly. |

### Boundary case: confusing-but-completable announcement

> **Default boundary rule:** an announcement that is confusing or phrased
> differently from another SR/version but where the step **still completes
> correctly** is **minor** — *unless* the reader cannot complete the step or
> loses content/function (then it is **major** or **blocker**).
>
> Record the rationale per finding. The exploratory charter (§4) catches the
> subjective cases the rubric cannot pre-classify.

### Pass policy

> **A PASS = ZERO blocker AND ZERO major issues** across both SR pairings, both
> the scripted checklist and the exploratory charter.
>
> Every documented flow must be completable using only SR/keyboard, and no
> content or required function may be lost or unreachable.
>
> **Minor SR-output quirks** (announcement phrasing differences across SR
> versions/settings) are **RECORDED with severity, but do NOT block acceptance.**
> They carry forward to the deferred-items list so they can be addressed later.

This honors ACPT-02's "can complete the flow" language while being realistic
about cross-SR output variance — a strict verbatim-output bar would block on
cosmetic difference (D6-07).

---

## 6. Recording Results

Record the v1.3 run results in
**`.planning/phases/21-integrated-refinement-and-acceptance/21-VERIFICATION.md`**
(the Phase 21 verification artifact) under the **ACPT-08** section, using the
blank results sheets below. The v1.0–v1.2 run history remains in
`06-VERIFICATION.md` / `13-VERIFICATION.md`. For each pairing, capture:

1. Environment: SR name + version, browser + version, OS.
2. The completed checklist (§3) — PASS/severity per flow (A–L at v1.3).
3. Exploratory charter findings (§4) — observed behavior + severity per scenario.
4. The overall verdict: **PASS** (zero blocker + zero major) **or FAIL** (list
   every blocker/major with reproduction).
5. The deferred-items list: every minor finding, for carry-forward.
6. Coverage-boundary note: if NVDA+Windows was unavailable, state it explicitly
   and record VoiceOver+Safari alone as a **reduced gate** (per D6-05 / research
   assumption A4).
7. (VoiceOver+Safari only) The D21-12 image-flow evidence — save → offline
   reopen → export → import with images — recorded in the pairing's results
   sheet below; `21-VERIFICATION.md` points at that record.

> **ACPT-02 does not close when this protocol is *authored*.** It closes when
> Plan 06-06 **executes** this protocol on real hardware and records a
> zero-blocker / zero-major result. This document is the instrument; the run is
> the gate.

> **ACPT-08 flip policy (v1.3, carried forward from D13-06/D13-07):** ACPT-08
> flips ONLY when the human NVDA+Firefox AND VoiceOver+Safari runs of THIS
> protocol (v1.3) both land **zero blocker / zero major** — via verify-work,
> with the documented fix-then-re-run loop for any blocker/major finding. The
> automated matrix arms (edge-invariant specs) are necessary but never
> sufficient.

### v1.3 results sheet — NVDA + Firefox (Windows)

| Field | Value |
|-------|-------|
| Run date | _____________ |
| Tester | _____________ |
| NVDA version | _____________ |
| Firefox version | _____________ |
| Windows version | _____________ |
| Protocol version | 1.3 |

| Flow | Result (PASS / severity + notes) |
|------|----------------------------------|
| A — read end-to-end | ☐ |
| B — switch mode (M) | ☐ |
| C — create highlight | ☐ |
| D — view/edit/delete + note | ☐ |
| E — navigate back to passage | ☐ |
| F — adjust settings | ☐ |
| G — library views/search/tags | ☐ |
| H — Add dialog | ☐ |
| I — edit metadata | ☐ |
| J — TOC navigation | ☐ |
| K — cross-block highlight + review | ☐ |
| L — images: save → offline reopen → view | ☐ |

| Charter (§4) | Findings (observed + severity + blocks?) |
|--------------|-------------------------------------------|
| 1 — full reading + annotation loop | ☐ |
| 2 — every fixture, both modes | ☐ |
| 3 — fallback orientation | ☐ |
| 4 — edge conditions under SR | ☐ |
| 5 — discoverability without prior knowledge | ☐ |

Verdict: _____________ (PASS = zero blocker + zero major) — blockers/majors
with reproduction: _____________ . Minors carried to deferred items:
_____________ .

### v1.3 results sheet — VoiceOver + Safari (macOS)

| Field | Value |
|-------|-------|
| Run date | _____________ |
| Tester | _____________ |
| VoiceOver (macOS) version | _____________ |
| Safari version | _____________ |
| Protocol version | 1.3 |

| Flow | Result (PASS / severity + notes) |
|------|----------------------------------|
| A — read end-to-end | ☐ |
| B — switch mode (M) | ☐ |
| C — create highlight | ☐ |
| D — view/edit/delete + note | ☐ |
| E — navigate back to passage | ☐ |
| F — adjust settings | ☐ |
| G — library views/search/tags | ☐ |
| H — Add dialog | ☐ |
| I — edit metadata | ☐ |
| J — TOC navigation | ☐ |
| K — cross-block highlight + review | ☐ |
| L — images: save → offline reopen → view | ☐ |

| Charter (§4) | Findings (observed + severity + blocks?) |
|--------------|-------------------------------------------|
| 1 — full reading + annotation loop | ☐ |
| 2 — every fixture, both modes | ☐ |
| 3 — fallback orientation | ☐ |
| 4 — edge conditions under SR | ☐ |
| 5 — discoverability without prior knowledge | ☐ |

**D21-12 image-flow evidence (this pairing only):** save → offline reopen →
export → import with images — figures render + decode locally after the round
trip: _____________ (recorded here; `21-VERIFICATION.md` points at this row).

Verdict: _____________ (PASS = zero blocker + zero major) — blockers/majors
with reproduction: _____________ . Minors carried to deferred items:
_____________ .

---

## 7. Re-run Contract (D6-08)

**Re-run this protocol on any material change to the reader surface**, including:

- New reading controls, annotation flows, or settings panel controls.
- Changes to focus management, keyboard shortcuts, or announced status regions.
- Changes to pagination behavior, fallback, or mode-switching.
- Changes that affect the accessibility tree (roles, names, states) of any
  reader-surface element a documented flow touches.

Bump the **Version** field in the header when the protocol itself changes
(new/edited flows, rubric revisions). Record each run's date and tester in the
header table. This is a **durable, re-runnable artifact** — a single canonical
instrument future releases re-run, not a one-off checklist (D6-08).
