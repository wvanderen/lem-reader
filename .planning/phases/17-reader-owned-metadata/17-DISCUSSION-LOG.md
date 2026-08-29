# Phase 17: Reader-Owned Metadata - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-29
**Phase:** 17-reader-owned-metadata
**Areas discussed:** Edit entry points, Book scope, Search & canonical visibility, Conflict & survival semantics

---

## Edit entry points

| Option | Description | Selected |
|--------|-------------|----------|
| Library row only (Recommended) | Edit affordance beside the remove TrashIcon (13-07 precedent); Reader header stays minimal (260819-qbq) | ✓ |
| Reader only | Edit control in the Reader header; tight space, header deliberately quieted | |
| Both surfaces | Library row + Reader expose editing; most discoverable, two triggers to keep consistent | |

**User's choice:** Library row only
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Native dialog (Recommended) | showModal <dialog> (AddDialog/RemoveConfirm/ImportPreviewDialog precedent): focus trap, Esc, backdrop, data-initial-focus on Cancel | ✓ |
| Inline row editing | Title/author editable in place; new focus/keyboard patterns, rewrites byte-stable row anchors | |

**User's choice:** Native dialog
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Per-field Reset (Recommended) | Each field has its own quiet Reset; canonical values shown as placeholders/help; absent canonical author resets to blank | ✓ |
| Single Restore originals | One action restores both; can't reset just the author | |
| Empty field = clear | Saving empty means use canonical; silent intent-guessing | |

**User's choice:** Per-field Reset
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Calm validation (Recommended) | Title required non-empty; Save disabled/inline explanation until valid; no untitled article possible | ✓ |
| Fallback on save | Form allows empty, save falls back to canonical on empty fields | |

**User's choice:** Calm validation
**Notes:** —

## Book scope

| Option | Description | Selected |
|--------|-------------|----------|
| Articles only (Recommended) | META-01..04 stay article-scoped; book editing → backlog | ✓ |
| Books too | Book rows get the edit dialog (title + authors array); requirements extended; more conflict surface | |
| Books, title only | Book title editable, authors canonical; splits the model | |

**User's choice:** Articles only
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| No chapter editing (Recommended) | Chapters keep ingested titles; one honest scope line | ✓ |
| Chapters too | Chapter sub-rows expose the same override dialog | |

**User's choice:** No chapter editing
**Notes:** —

## Search & canonical visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Override only (Recommended) | D8-06 haystack swaps in effective title/author; what you see is what matches | ✓ |
| Override + canonical | Both values match; find-by-original-name works but results look wrong | |

**User's choice:** Override only
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Dialog only (Recommended) | Canonical visible only as the Reset baseline inside the edit dialog | ✓ |
| Reader provenance line | Quiet "Originally: …" under the edited title in the Reader | |
| Everywhere as subtitle | Canonical surfaces in Highlights/Continue/export citations too | |

**User's choice:** Dialog only
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Effective everywhere (Recommended) | document.title, SectionAnnouncer, ResumeBanner all read the effective value; one name everywhere | ✓ |
| Mixed | Some chrome keeps canonical; two names in SR output vs visible UI | |

**User's choice:** Effective everywhere
**Notes:** —

## Conflict & survival semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Override survives (Recommended) | Same-id re-ingest updates canonical content; reader override stays — a refresh never renames the library back | ✓ |
| Canonical wipes | Re-ingest with fresh canonical values resets to canonical; silently destroys reader work | |

**User's choice:** Override survives
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Report + local default (Recommended) | Explicit conflict row in ImportPreviewDialog; default keeps LOCAL override; per-item choice to take incoming | ✓ |
| Incoming wins | Upsert always takes the incoming override, preview discloses replacements | |
| Drop to canonical | Conflicting overrides silently dropped; violates META-04 explicit reporting | |

**User's choice:** Report + local default
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| In ArticleSchema (Recommended) | Optional readerTitle/readerAuthor fields; bundle v3 union read (v1/v2 unchanged, writers emit 3) | ✓ |
| Separate block | Overrides listed in their own bundle block keyed by id; splits one record across blocks | |

**User's choice:** In ArticleSchema
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Same transaction (Recommended) | Override data deleted atomically with article/highlights/notes (Pitfall 10) | ✓ |
| Lazy sweep | Cleanup pass on library load; orphan window | |

**User's choice:** Same transaction
**Notes:** —

## the agent's Discretion

- Storage model (row columns with strip-mode vs. separate overrides table) — must satisfy D17-10/D17-13 + Pitfall 9
- Effective-value derivation shape (pure policy module vs. denormalized)
- Edit affordance glyph/anatomy, aria-label wording
- Dialog geometry, copy, Reset control shape (UI-SPEC; POLISH-07 tokens)
- Bundle v3 field names + conflict-row copy
- Migration test shape (12-03 precedent)
- Which spec anchors legitimately update

## Deferred Ideas

- Book title/author editing — backlog candidate (D17-05)
- Per-chapter title overrides — revisit with book editing (D17-06)
- Editing from Reader header / Highlights — rejected entry points (D17-01)
- Inline row editing — rejected (D17-02)
- "Originally: …" provenance line — rejected (D17-08)
- Override + canonical dual search matching — rejected (D17-07)
- Separate bundle override block — rejected (D17-12)
- Lazy orphan sweep — rejected (D17-13)
