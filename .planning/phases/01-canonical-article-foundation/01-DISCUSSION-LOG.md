# Phase 1: Canonical Article Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-28
**Phase:** 1-canonical-article-foundation
**Areas discussed:** Fixture corpus, Canonical content model, Default visual direction, Fixture delivery & authoring

---

## Fixture corpus

### Q1 — Structural mix

| Option | Description | Selected |
|--------|-------------|----------|
| Diverse publishing styles | ~5-7 articles spanning distinct real genres (essay, technical w/ code, figure/photo-heavy, footnote/academic, list-heavy); each stresses different supported elements; ≥1 unsupported-content case. | ✓ |
| Minimal per-element coverage | ~3-4 articles where each supported element appears at least once. Faster to author; weaker edge-case validation. | |
| You decide | Let planner/researcher propose the corpus mix and list for review. | |

**User's choice:** Diverse publishing styles (~5-7 articles).
**Notes:** Defines "representative" for validating layout, semantics, and the unsupported-content path.

### Q2 — Corpus source

| Option | Description | Selected |
|--------|-------------|----------|
| Real articles, curated | Actual published long-form articles normalized into the canonical model; provenance shows real source URL + author + date (DOC-03). | ✓ |
| Synthetic realistic samples | Hand-authored original fixture text per genre; zero licensing risk; less realism. | |
| Hybrid | A couple of real articles for realism + synthetic samples to hit hard-to-find edge cases. | |

**User's choice:** Real articles, curated.
**Notes:** Most realistic validation; sourcing/licensing decided per-article during research.

### Q3 — Candidate selection process

| Option | Description | Selected |
|--------|-------------|----------|
| I'll name specific articles | User provides specific URLs/domains now for the researcher to fetch/normalize. | |
| Lock criteria, propose later | Lock selection criteria now; researcher proposes a concrete candidate list for approval before normalization. | ✓ |
| Planner picks freely | Don't constrain beyond "diverse real long-form." | |

**User's choice:** Lock criteria, propose later.
**Notes:** User does not pre-name articles; researcher proposes candidates against the D-01 genre/coverage criteria.

---

## Canonical content model

### Q1 — Inline formatting richness

| Option | Description | Selected |
|--------|-------------|----------|
| Standard prose set | strong + em on top of links + inline code. Covers most long-form emphasis; small inline model. | ✓ |
| Extended set | strong, em, strikethrough, sub, sup. More faithful to technical/academic; more node types. | |
| Minimal | Links + inline code only; strip all other emphasis. Simplest; loses authorial emphasis. | |

**User's choice:** Standard prose set (links + inline code + strong + em).
**Notes:** Strikethrough/sub/sup normalized away in Phase 1.

### Q2 — Text coordinate unit (DOC-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Grapheme clusters | User-perceived chars via Intl.Segmenter; robust to emoji/accented text; STACK-aligned. Offsets ≠ JS string indexes. | ✓ |
| Unicode code points | Each Unicode scalar = 1; fragile across precomposed/decomposed forms. | |
| UTF-16 code units | JS string index; emoji/astral count as 2; drifts on modern content. | |

**User's choice:** Grapheme clusters via Intl.Segmenter.
**Notes:** Single coordinate space over normalized text in reading order; foundational for Phase 2 location + Phase 5 annotations.

### Q3 — Article identity & revision (DOC-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Stable ID + revision int | Stable ID + monotonic integer that bumps on content change; saved locations detect mismatch. | ✓ |
| Content hash | Identity derived from hash of normalized text; trivial fixes change identity. | |
| Stable ID + semver | major/minor/patch; more expressive, more policy to enforce upfront. | |

**User's choice:** Stable ID + monotonic revision integer.
**Notes:** Feeds ANNO-07 orphan path and STATE-01 mismatch detection.

---

## Default visual direction

### Q1 — Confirm or adjust UI-SPEC defaults

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm warm-paper booklike | Lock serif body + warm surface #FBF8F3 + warm-brown accent #6B4423. The booklike hypothesis under test. | ✓ |
| Booklike, but neutral palette | Serif + booklike layout but near-white/cool surface + dark grey ink. | |
| Rethink it | Different direction (e.g. sans-serif, specific brand reference). | |

**User's choice:** Confirm warm-paper booklike.
**Notes:** Clears all three `⚠ default — review before executor` flags in `01-UI-SPEC.md`. Rest of visual surface locked by the UI-SPEC.

---

## Fixture delivery & authoring

### Q1 — Delivery mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Bundled JSON at build | Static canonical JSON imported at build; in-memory article repository; Dexie schema may be defined for Phase 2 but fixtures are static assets. | ✓ |
| Dexie-seeded on first run | Seed IndexedDB on first run; open-article flow reads through real Dexie repository. | |
| Repo interface, in-memory now | Define repository interface now with in-memory impl; Dexie drops in Phase 2. | |

**User's choice:** Bundled JSON at build.
**Notes:** Simplest Phase-1 foundation; keeps persistence seam clean.

### Q2 — Authoring method

| Option | Description | Selected |
|--------|-------------|----------|
| Dev-time transform script + review | Throwaway script reads saved HTML → emits canonical JSON; human reviews/corrects; emitted JSON is source of truth. | ✓ |
| Hand-author all fixtures | Write every canonical JSON fixture by hand; maximum control, slowest. | |
| Hand-author a couple, defer rest | Validate schema on little real data; risk bulk authoring slipping to Phase 2. | |

**User's choice:** Dev-time transform script + human review.
**Notes:** Script is throwaway, dev-time only (NOT the out-of-scope live-extraction feature). Surfaces normalization friction early.

---

## Agent's Discretion

Deferred to researcher/planner (user did not need to decide):
- Block taxonomy granularity/nesting, footnote internal model, Zod schema strictness, fixture file/repo layout.
- How unsupported runs are recorded in the fixture for the DOC-06 disclosure (must render inline at canonical position per UI-SPEC §Interaction 3).
- Whether to define the in-memory repository behind an interface for a clean Phase 2 Dexie swap.

## Deferred Ideas

None new — discussion stayed within phase scope. Items reaffirmed as belonging to later phases: typography/theme controls + settings UI (Phase 2); location restore + preference persistence (Phase 2); pagination/measurement/Pretext/dual-mode (Phases 3-4); highlights and notes (Phase 5).
