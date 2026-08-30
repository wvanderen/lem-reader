# Phase 18: Reader Orientation - Context

**Gathered:** 2026-08-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 18 is the **v2.1 reader-orientation phase** — readers navigate document
structure through a labeled table of contents and receive non-intrusive
feedback when reopening restores their location:

1. **ORNT-01 — TOC open + jump.** A labeled table of contents derived from
   the canonical article heading hierarchy; activating an entry jumps to
   that structural location.
2. **ORNT-03 — canonical destinations, both modes.** TOC destinations use
   stable canonical locations (grapheme-offset substrate, D-05) and land
   equivalently in scrolling mode (scroll) and paginated mode (page turn)
   — never page numbers or rendered DOM identity.
3. **ORNT-04 — semantic honesty.** Source heading levels are preserved,
   skipped levels and duplicate headings are tolerated, and the TOC
   exposes semantic list/link navigation to keyboard and screen-reader
   users.
4. **ORNT-05 — calm geometry.** At narrow widths / high zoom, opening or
   closing the TOC neither obscures content inertly, traps focus, nor
   changes the reader's logical location.
5. **ORNT-06 — non-intrusive restoration.** Reopening an article
   communicates the restored location via a passive cue that does not
   shift content, block page turns, or require dismissal.

**Phase 18 does NOT ship** (later phases — do not fold in):
- **Book-level cross-chapter TOC** — a chapter-list surface for EPUB books
  is a new capability; deferred to the backlog (D18-11).
- **Cross-block highlights (ANNO-08..12)** — Phase 19.
- **Local image fidelity (IMG-*)** — Phase 20.
- **POLISH-08..11 + acceptance matrix (ACPT-07/08)** — Phase 21.
- **ORNT-02 line-focus aid** — Future Requirements, not this milestone.

**Load-bearing invariants (locked by prior phases — do NOT re-ask):**
- Canonical location = grapheme offsets over normalized text (D-05);
  `restoreLocation.ts` (`findScrollTarget`/`computeTopVisibleOffset`) +
  `data-block-index` mapping exist; never persist page numbers/DOM ids.
- Paginated mode has the D4-10 mode-switch anchor machinery and
  `turnToPage`/`getPages` on the PaginatedSurface handle for
  offset→page navigation.
- Article-scoped triggers live in the shell header behind the
  `articleMounted` gate — `[tags][annotations][mode][gear]`
  (D15-15/D15-18); content headers carry only Back to library + titles.
- One h1 per page; article bodies start at h2 (headings h2-h6 are the
  TOC's source); SectionAnnouncer queries `h2, h3, h4`.
- Native `<dialog>`/showModal precedent (5 shipped dialogs) exists BUT is
  NOT the chosen TOC pattern (D18-01) — the TOC is a new non-modal
  pattern.
- Byte-stable e2e anchors + strengthen-only test discipline; honest
  full-suite gate (`npm run test` exit 0); calm DOC-06 copy;
  reduced-motion gates all motion; 44px touch targets.
- Chapters are articles (`bookId` in ArticleSchema) — they ride article
  machinery for free.

</domain>

<decisions>
## Implementation Decisions

### TOC surface & trigger (ORNT-01, ORNT-05)

- **D18-01: The TOC is a NON-MODAL panel** — slides beside the article
  content with no focus trap, no inert backdrop; the page stays visible
  and keyboard-reachable. Manual Esc handling + focus return to the
  trigger on close (new pattern — the native-dialog precedent is
  deliberately NOT reused here; ORNT-05's no-trapping wording is the
  deciding factor).
- **D18-02: The trigger is a shell-header icon button** joining the
  article-scoped group `[contents][tags][annotations][mode][gear]`
  behind the `articleMounted` gate (D15-18 anatomy: inline-SVG glyph +
  aria-label, quiet-button tokens). The ≤639px wordmark-collapse geometry
  was tuned for 4 buttons — the 5-button row needs a geometry re-check
  (POLISH-07 tokens).
- **D18-03: Activating an entry closes the panel and moves keyboard
  focus to the destination heading** with a visible focus cue — screen
  reader and keyboard readers always know where they landed. Navigation
  is mode-aware: scroll in scrolling mode, page turn in paginated mode
  (both resolve through the canonical offset substrate).
- **D18-04: At narrow widths / high zoom the panel becomes a full-width
  sheet — still non-inert.** The page behind remains keyboard-escapable
  (Tab leaves the panel into the page; Esc closes). No focus trap even
  when visually covering content.

### Restoration cue reshape (ORNT-06)

- **D18-05: The restoration cue is a PASSIVE POSITION MARKER attached at
  the restored location** (calm hairline/edge marker on the restored
  block in scrolling mode / restored page edge in paginated mode) plus
  the polite "Returned to where you left off." announce. No buttons, no
  copy to read past — the cue IS the location.
- **D18-06: The ResumeBanner and its actions RETIRE.** "Resume reading"
  was redundant (restore already lands at the saved spot silently) and
  "Start from top" is cheaply restored by the TOC's Top entry (D18-09)
  or natural scroll/flip back. No replacement action chrome.
- **D18-07: The marker is TRANSIENT** — shows at the restored spot on
  reopen, fades away after a few calm seconds. Reduced-motion honored
  (no fade animation; instant clear or a calm opacity step). Nothing
  lingers while reading past it; no dismissal interaction exists.
- **D18-08: The marker fires on REOPEN-RESTORE ONLY** (ORNT-06's scope).
  TOC jumps carry their own focus-on-heading cue (D18-03); Highlights
  deep-link jumps keep today's behavior. One cue per cause, no
  double-signaling.

### TOC list presentation (ORNT-04)

- **D18-09: The list starts with a "Top of article" entry** (targets the
  article start / h1), then all body headings h2-h6. Restores the
  retired start-from-top affordance cheaply.
- **D18-10: Hierarchy renders as a NESTED `<ul>`** reflecting true
  heading depth — skipped levels (h2→h5) nest deeper WITHOUT invented
  intermediate entries; screen-reader users get depth from list
  structure itself.
- **D18-11 (also edge scope): Duplicate heading texts appear AS-IS** —
  identical headings are identical-text links; list position
  disambiguates. No invented "(2 of 2)" suffixes or parent prefixes.
- **D18-12: The current section's entry carries `aria-current` + a
  subtle visual highlight**, derived from the same scroll-spy substrate
  as SectionAnnouncer (reused detection, not a forked implementation).

### Edge scope: no headings, books

- **D18-13: The TOC trigger is ALWAYS available on any article** — a
  headingless article opens the panel to the "Top of article" entry plus
  a calm note ("This article has no headings." style — exact copy =
  planner/UI-SPEC). Consistent chrome, honest empty state; the trigger
  never appears/disappears per article.
- **D18-14: EPUB chapters get the same TOC as articles** — chapters are
  articles (`bookId`) in the data model; the trigger + panel work
  identically from each chapter's own heading hierarchy. Zero extra
  machinery.
- **D18-15: On open, a long TOC list scrolls internally to bring the
  CURRENT section's entry into view** (orientation-first; pairs with
  D18-12). The panel owns its scrolling; no page-level scroll side
  effects from opening.

### the agent's Discretion

- **Panel implementation mechanics** — how the non-modal panel is built
  (absolutely-positioned aside vs popover=manual vs other), the
  breakpoint value for the full-width sheet, slide/fade motion under
  the reduced-motion gate, and outside-click dismissal policy.
- **Focus-return mechanics** — how focus returns to the trigger on close
  (including Esc), and how the non-inert page interaction is kept calm
  (e.g., whether pointer events pass through to the page beside the
  panel).
- **Offset→destination mapping** — how a heading's canonical destination
  is derived (block-start grapheme offset via the D-05 substrate) and
  resolved per mode (scrollIntoView vs page-lookup through the D4-10
  anchor + turnToPage machinery); reuse `restoreLocation.ts`/
  `data-block-index`, do not fork.
- **Scroll-spy reuse shape** — how SectionAnnouncer's detection
  (IntersectionObserver + scroll listener) is extracted/shared for
  TOC aria-current without breaking the existing announce contract.
- **Marker anatomy + copy** — exact hairline/edge marker styling per
  mode, fade duration, announce copy placement (reuse the polite
  status region discipline), headingless-note copy.
- **Header geometry at ≤639px** — how 5 article-scoped buttons fit the
  48px row (wordmark collapse timing, touch-target audit).
- **Heading depth cap** — whether extremely deep nesting (h5/h6)
  renders any differently (e.g., styling only — structure stays
  semantic per D18-10).
- **Test shape** — new TOC e2e specs + restoration-cue specs across the
  3-engine matrix; ResumeBanner spec retirement is legitimately owned
  by this phase; strengthen-only for untouched specs; honest
  full-suite gate.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project intent & requirements
- `.planning/ROADMAP.md` — §Phase 18 goal + 5 success criteria (labeled
  TOC + jump; same destination both modes; skipped/duplicate levels
  stay semantic; narrow-width/high-zoom calm; non-intrusive restore
  cue). `**UI hint**: yes`.
- `.planning/REQUIREMENTS.md` — ORNT-01/03/04/05/06 (§Reader
  Orientation); traceability table (Phase 18 rows); Future Requirements
  (ORNT-02 explicitly out).
- `.planning/PROJECT.md` — v2.1 milestone framing; Constraints (a11y
  foundational; canonical document model; honesty: no silent garbage;
  performance budget).

### Prior-phase contracts this phase extends
- `.planning/phases/15-application-shell-and-destinations/15-CONTEXT.md`
  — D15-15/D15-18 (article-scoped triggers in the shell header,
  content headers stay title-only — D18-02 follows), D15-17 (≤639px
  wordmark collapse the 5th button re-checks).
- `.planning/phases/16-organized-library-and-focused-add-flow/16-CONTEXT.md`
  — D16-01 native-dialog precedent (deliberately NOT used for the TOC —
  D18-01 records why), dialog discipline vocabulary.
- `.planning/phases/17-reader-owned-metadata/17-CONTEXT.md` — D17-09
  effective-title consumers (TOC label/title surfaces reuse effective
  metadata), articles-vs-books scope-line precedent (D18-14 mirrors).
- v2.0 contracts via STATE.md decision index — D-05 grapheme
  coordinate substrate, D4-10 mode-switch anchor, D5-11
  turnToPage/getPages, Pitfall 9 (no Dexie changes expected this
  phase — TOC is derived data, never persisted).

### Source code contracts (READ before implementing)
- `src/content/schema.ts` — `HeadingBlock` (L58-69: kind/level 1-6/
  content runs — the TOC's source data; NO ids — destinations derive
  from block offsets), `CanonicalArticle`, `bookId` (L242 — chapters
  are articles).
- `src/reader/restoreLocation.ts` — `findScrollTarget`/
  `computeTopVisibleOffset`/`normalizeElText` — the canonical
  offset↔DOM machinery TOC destinations and the marker attach to
  (import, never reimplement).
- `src/reader/SectionAnnouncer.tsx` — scroll-spy detection
  (IntersectionObserver + rAF-throttled scroll fallback, 250ms
  debounce, sentinel line under the 48px header) to extract/share for
  TOC aria-current (D18-12).
- `src/reader/ResumeBanner.tsx` + its ArticleView wiring — the
  retiring surface (D18-06); its polite-announce + auto-dismiss
  listener patterns inform the marker lifecycle (D18-07).
- `src/routes/ArticleView.tsx` — the restore effect + `showResumeBanner`
  state (L243, L1521, L1594-1611 auto-dismiss, L1697 handleResume) the
  marker replaces; `queryBlocks`/`data-block-index` selector; the
  always-mounted hidden measurement ArticleBody (Plan 04-08) that
  keeps offset resolution stable in paginated mode.
- `src/reader/PaginatedSurface.tsx` — the imperative handle
  (`turnToPage`/`getPages`) for paginated TOC jumps + marker page-edge
  placement.
- `src/reader/Header.tsx` — `.header-controls` group + `articleMounted`
  gating where the contents trigger slots (5th button); shell-nav +
  brand structure the panel must not disturb.
- `src/reader/PageIndicator.tsx`, `PageTurnControls.tsx`,
  `ProgressHairline.tsx` — adjacent reading-position chrome the marker
  must stay calm beside.
- `src/reader/BackToLibrary.tsx`, `src/App.tsx` — hash router grammar
  (TOC adds NO routes — panel state is transient, never a destination);
  `parseHash` fragment guard stays byte-stable.
- `src/reader/annotations/AnnotationsDrawer.tsx` — the closest shipped
  "drawer" (actually modal `<dialog>`) — reference for list/scroll/empty
  UI, NOT for the open mechanism (D18-01 is non-modal).
- `src/reader/TagEntry.tsx`, `src/reader/SettingsPanel.tsx` — focus
  discipline + quiet-button token precedents for the trigger glyph.
- `src/app.css` — POLISH-07 tokens, `.header-controls` geometry,
  `.resume-banner` styles to retire, `--space`/measure tokens the panel
  consumes; `prefers-reduced-motion` global gate.
- `tests/e2e/` — pagination/restore/high-zoom/reflow specs the new
  specs join (D6-09 edge-invariant helper, 3-engine matrix); ResumeBanner
  specs retire honestly.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`restoreLocation.ts`** — offset→block and block→offset resolution
  with per-element grapheme caching; TOC destination derivation and
  marker attachment reuse it wholesale.
- **SectionAnnouncer scroll-spy** — the current-section detection the
  TOC's aria-current shares (D18-12); already solves the
  IntersectionObserver-flakiness fallback.
- **PaginatedSurface handle** — `turnToPage`/`getPages` make paginated
  jumps a solved seam (D5-11); D4-10 anchor already converts offsets
  across mode switches.
- **Header `.header-controls` + `articleMounted` gate** — the trigger
  slots in with zero structural change; D5-09/D13-10 icon anatomy is
  the template.
- **Polite status-region discipline** — role=status + aria-live=polite
  (ResumeBanner/SectionAnnouncer/`.status`) is the announce channel for
  the marker (D18-05) and TOC SR feedback.

### Established Patterns
- Canonical offsets as the ONLY durable location currency; derived
  page/DOM positions are computed, never stored.
- One derivation point per truth (readingState, effectiveMetadata) —
  TOC structure derives from the canonical article at render time, no
  persistence (Pitfall 9: no Dexie changes this phase).
- Calm, non-modal over modal where orientation is the goal — D18-01
  breaks from the dialog precedent deliberately; document the new
  pattern's focus/Esc contract explicitly in plans.
- Byte-stable anchors + strengthen-only; honest full-suite gate;
  reduced-motion gates every animation the panel/marker introduce.

### Integration Points
- `Header.tsx` — 5th article-scoped trigger button; ≤639px geometry
  re-check.
- `ArticleView.tsx` — TOC open state + panel mount; restore-effect
  swap from ResumeBanner to the marker; TOC jump handler per mode.
- `PaginatedSurface.tsx` — paginated jump + marker page-edge
  integration.
- `SectionAnnouncer.tsx` — extract/share detection for TOC
  aria-current.
- `src/app.css` — panel/sheet/marker/trigger styles; resume-banner
  styles retire.
- `tests/` — TOC + restoration-cue specs across chromium/firefox/
  webkit; ResumeBanner spec retirement.

</code_context>

<specifics>
## Specific Ideas

- **"The cue IS the location"** — the restoration marker attaches at
  the restored spot itself; no floating copy, no actions, nothing to
  dismiss (D18-05/06/07).
- **"No trap, ever"** — even when the panel visually covers the page
  at narrow width, the page stays keyboard-escapable; Tab out and Esc
  close are always available (D18-04).
- **"The trigger never plays peekaboo"** — the contents button is the
  same chrome on every article; headingless articles get an honest
  note, not a vanishing control (D18-13).
- **"Identical headings are honestly identical"** — no invented
  disambiguation text; position in the list is the disambiguator
  (D18-11).
- **"Open where you are"** — a long TOC opens scrolled to your current
  section, not to the top (D18-15).

</specifics>

<deferred>
## Deferred Ideas

- **Book-level cross-chapter TOC** — a chapter-list navigation surface
  for EPUB books (D18-15's sibling decision, D18-14 keeps chapters
  article-scoped). New capability — backlog candidate for a future
  milestone.
- **Calm duplicate-heading disambiguation** — accessible "(2 of 2)"
  suffixes or parent-section prefixes; rejected (D18-11); revisit only
  on concrete SR-user friction.
- **Marker on every programmatic jump** — one consistent "you landed
  here" cue for Highlights deep-links too; rejected (D18-08) — reopen
  only; revisit if deep-link landings confuse readers.
- **Keyboard shortcut for the TOC trigger** — not committed (plain
  header icon only); revisit with the M-for-mode precedent if readers
  ask.
- **ORNT-02 line-focus aid** — Future Requirements, outside this
  milestone.

</deferred>

---

*Phase: 18-reader-orientation*
*Context gathered: 2026-08-30*
