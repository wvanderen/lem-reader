# Phase 12: EPUB Intake - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-17
**Phase:** 12-epub-intake
**Areas discussed:** Book UX in library, Chapter flow & TOC, Chapter admission, Parser dependency

---

## Book UX in library

### Q1: How does a book appear in LibraryView?

| Option | Description | Selected |
|--------|-------------|----------|
| Expandable + Resume | Collapsed row: title/author + book progress + Resume; expands to chapter sub-rows reusing LibraryRow anatomy; no new route | ✓ |
| Book detail route | Book row navigates to a dedicated #/book/<id> chapter-list surface; library stays one-line per book | |
| Flat rows + badge | Chapters as ordinary library rows sharing a book badge/group header | |

**User's choice:** Expandable + Resume
**Notes:** SC#1's "book grouping with expandable chapter articles" read literally.

### Q2: What does the Continue-Reading strip show for a book in progress?

| Option | Description | Selected |
|--------|-------------|----------|
| Book-level entry | One strip entry per in-progress book ("BookTitle — Chapter 4 of 12") resuming the last-read chapter | ✓ |
| Chapter-level entry | Strip lists the last-read chapter row directly with book title as suffix | |
| Book entry, chapter aware | Book-level entries; a directly-opened chapter resolves up to its book entry | |

**User's choice:** Book-level entry
**Notes:** Matches "continue my book" mental model; no double-listing.

### Q3: How is book-level progress computed?

| Option | Description | Selected |
|--------|-------------|----------|
| Chapters-finished ratio | Chapters with a location ÷ total chapters; finished = location ≥98% of chapter text (Phase 8 convention) | ✓ |
| Length-weighted | Weight chapters by grapheme count for truthful partial-chapter progress | |

**User's choice:** Chapters-finished ratio
**Notes:** Zero new measurement, no flicker as locations settle.

### Q4: How do search and tags behave for books vs chapters?

| Option | Description | Selected |
|--------|-------------|----------|
| Tags on book, search both | Tags live on the Book record; tag filter shows the book; search matches book + chapter titles | ✓ |
| Tags per chapter | Each chapter individually taggable/filterable | |
| Book-title search only | Search matches book title only; chapters reached by expanding | |

**User's choice:** Tags on book, search both
**Notes:** "Search the essay I read in that essay collection" must work.

---

## Chapter flow & TOC

### Q1: Where does next/previous-chapter navigation live in the reader?

| Option | Description | Selected |
|--------|-------------|----------|
| End-of-chapter link | Calm "Next chapter" affordance at the very end of a chapter, keyboard-reachable; no persistent chapter chrome | ✓ |
| Persistent controls | Prev/next chapter buttons permanently in reader chrome | |
| Both | Persistent controls + end-of-chapter affordance | |

**User's choice:** End-of-chapter link
**Notes:** Keeps the page-turn spatial model undisturbed.

### Q2: Is a book TOC surface in scope for Phase 12?

| Option | Description | Selected |
|--------|-------------|----------|
| Library expand = TOC | The expandable book grouping is the jump-to-chapter surface; reader TOC deferred with ORNT-01 | ✓ |
| Reader TOC panel | Book TOC popover/dialog in ArticleView header with current chapter marked | |
| TOC as ORNT-01 seed | Ship the reader TOC now and count it as the future navigator's seed | |

**User's choice:** Library expand = TOC
**Notes:** Pitfall 6's "no way to jump chapters" warning satisfied by the library surface.

### Q3: Which chapter wins on reopen (SC#3)?

| Option | Description | Selected |
|--------|-------------|----------|
| Last-read by savedAt | Latest-savedAt LocationRecord within the book; identical semantics to per-article restore | ✓ |
| First unfinished chapter | First chapter without a ≥98%-finished location (ARCHITECTURE's original sketch) | |

**User's choice:** Last-read by savedAt
**Notes:** Predictability over read-in-order assumptions.

### Q4: Does the reader show book context while reading a chapter?

| Option | Description | Selected |
|--------|-------------|----------|
| Chapter context line | Small "Book Title · Chapter 4 of 12" line in the reader header for epub-chapter articles | ✓ |
| No label | No in-reader book context | |
| Line + book progress | Context line plus a subtle in-reader book-progress indicator | |

**User's choice:** Chapter context line
**Notes:** Progress display stays on the library row.

---

## Chapter admission

### Q1: What is a "chapter" when spine and TOC disagree?

| Option | Description | Selected |
|--------|-------------|----------|
| TOC-driven chapters | nav/NCX declares the logical unit; spine items mapping to the same TOC entry merge; fallback to one-per-spine-item | ✓ |
| One per spine item | Every spine item is a chapter (ARCHITECTURE's original sketch) | |

**User's choice:** TOC-driven chapters
**Notes:** Publisher intent preserved — "Chapter 4 of 12" matches the book's own count.

### Q2: How are non-content spine items handled?

| Option | Description | Selected |
|--------|-------------|----------|
| Skip non-content items | No-readerable-text items (cover, nav, image plates) silently excluded; front matter with text stays | ✓ |
| Keep every spine item | Every spine item becomes a chapter | |

**User's choice:** Skip non-content items
**Notes:** Reuses isReaderable admission (11-07 relaxed form).

### Q3: When some chapters fail extraction or the anchor gate, what happens?

| Option | Description | Selected |
|--------|-------------|----------|
| Skip + disclose per book | Failed chapters skipped with a calm note in the book grouping; whole book refuses only when zero chapters admit | ✓ |
| Refuse whole book | Any failing chapter refuses the entire EPUB | |
| Best-effort include | Failed chapters included as partial articles without the anchor gate | |

**User's choice:** Skip + disclose per book
**Notes:** Extends the tri-state ethos to the book container.

### Q4: Does Phase 12 mirror Phase 11's real-file corpus calibration discipline?

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror D11-04 discipline | Real EPUBs local + gitignored; committed manifest + evidence replay in CI; synthetic fixtures for code paths | ✓ |
| Synthetic only | Committed synthetic EPUB fixtures; no real-book corpus | |
| Commit real EPUBs | Public-domain EPUBs committed directly to the repo | |

**User's choice:** Mirror D11-04 discipline
**Notes:** Same CI trade-off the user accepted for PDFs.

---

## Parser dependency

### Q1: Which library reads the EPUB zip container?

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse fflate | fflate 0.8.3 already in-tree unzipping Phase 9 bundles; zero new zip deps | ✓ |
| Add JSZip | JSZip 3.10.1 per STACK.md's original (pre-fflate) pick | |

**User's choice:** Reuse fflate
**Notes:** D9-02's JSZip size rejection supersedes STACK.md's pick.

### Q2: How are OPF/NCX/nav XML structures parsed?

| Option | Description | Selected |
|--------|-------------|----------|
| fast-xml-parser + jsdom | fast-xml-parser for manifests; chapters through existing jsdom + DOMPurify path | ✓ |
| jsdom for everything | Stretch jsdom's DOMParser to XML; zero new deps | |

**User's choice:** fast-xml-parser + jsdom
**Notes:** epub2 rejected throughout (unmaintained — STACK.md L131).

### Q3: Does fast-xml-parser go through the unpdf-style human gate?

| Option | Description | Selected |
|--------|-------------|----------|
| Exact pin + sign-off | Exact-pinned version, legitimacy evidence doc, user sign-off as blocking gate | ✓ |
| Normal semver range | Caret-range dependency, no blocking approval | |

**User's choice:** Exact pin + sign-off
**Notes:** 11-01 unpdf precedent.

### Q4: What happens to EPUB images (cover + in-chapter)?

| Option | Description | Selected |
|--------|-------------|----------|
| Text-first, defer images | In-chapter images → UnsupportedBlock with plainDescription; no cover image; no asset extraction | ✓ |
| Cover image only | Extract OPF cover as data-URL for the library row | |
| Full asset extraction | Cover + in-chapter images as data-URLs into image blocks | |

**User's choice:** Text-first, defer images
**Notes:** PDF precedent; Phase 9 bundle anticipated assets later.

---

## the agent's Discretion

- Chapter/article id scheme; BookSchema exact Zod shape; TOC-merge algorithm
  and nav-over-NCX precedence; DRM marker detection specifics; EPUB
  size/time limits; failure-reason enumeration granularity and calm copy;
  expand/collapse interaction details; end-of-chapter link anatomy; export
  bundle version mechanics for books; review-panel book-title prefixing;
  book-removal cascade confirmation copy.

## Deferred Ideas

- Reader-internal book TOC panel — ORNT-01 (future navigator).
- Cover image + in-chapter image asset extraction — later milestone (Phase 9
  bundle format anticipated).
- Per-chapter tags — future library extension.
- Length-weighted book progress — revisit only if ratio proves misleading.
- EPUB → Markdown conversion / OPF-fragment export — FEATURES anti-features.
