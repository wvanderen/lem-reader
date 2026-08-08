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
and manual screen-reader acceptance flows in the selected support matrix").
Per PROJECT.md, this is *engineering acceptance on representative content*, not a
formal user-preference / comprehension / completion study (that is explicitly Out
of Scope). This protocol proves the reader can complete the documented flows using
only a screen reader and keyboard, with no content or required function lost or
unreachable.

**What this is NOT:** A user study, a verbatim-SR-output conformance test, or an
automated test. It is a human-run manual protocol on real hardware.

| Field | Value |
|-------|-------|
| **Version** | 1.0 |
| **Authoritative decisions** | D6-05 (SR matrix), D6-06 (hybrid protocol shape), D6-07 (zero-blocker policy), D6-08 (versioned + re-run) |
| **Applies to** | Lem Reader prototype (v1.0 milestone) |
| **Results recorded in** | `.planning/phases/06-prototype-acceptance/06-VERIFICATION.md` |
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

Six core flows. Run **every flow** on **both SR pairings** (NVDA+Firefox,
VoiceOver+Safari). For each step: perform the **keyboard sequence**, then verify
the **expected outcome** (role + accessible name + state). Record PASS / the
finding severity (§5) per step.

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

| # | Keyboard sequence | Expected outcome (role + name + state) |
|---|-------------------|----------------------------------------|
| C1 | Navigate into a text block and make a selection: **Shift+Right arrow** (or SR selection gesture) across several words | A text selection exists within a single block (D5-05/D5-06 single-block rule). The SR announces the selected text. |
| C2 | A selection toolbar (`.selection-toolbar`) appears; **Tab** to it | Focus moves to the selection toolbar. It exposes a **button** with accessible name **"Highlight"**. |
| C3 | Press **Enter** (or **H** — the highlight shortcut) on the "Highlight" button | A `<mark>` element with the highlight data attribute (`mark.highlight[data-highlight-id]`) wraps the selected text. A **`role="status"` polite live region** announces "Highlight saved." (or equivalent confirmation). |
| C4 | Read the passage containing the mark | The highlighted text is announced/marked. The mark carries a semantic label identifying it as a highlight (D5-15). |

**Pass criterion:** highlight is created from keyboard-only; confirmation is
announced; the mark is present and semantically labeled.

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

Record the run results in **`.planning/phases/06-prototype-acceptance/06-VERIFICATION.md`**
under the **ACPT-02** section. For each pairing, capture:

1. Environment: SR name + version, browser + version, OS.
2. The completed checklist (§3) — PASS/severity per flow.
3. Exploratory charter findings (§4) — observed behavior + severity per scenario.
4. The overall verdict: **PASS** (zero blocker + zero major) **or FAIL** (list
   every blocker/major with reproduction).
5. The deferred-items list: every minor finding, for carry-forward.
6. Coverage-boundary note: if NVDA+Windows was unavailable, state it explicitly
   and record VoiceOver+Safari alone as a **reduced gate** (per D6-05 / research
   assumption A4).

> **ACPT-02 does not close when this protocol is *authored*.** It closes when
> Plan 06-06 **executes** this protocol on real hardware and records a
> zero-blocker / zero-major result. This document is the instrument; the run is
> the gate.

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
