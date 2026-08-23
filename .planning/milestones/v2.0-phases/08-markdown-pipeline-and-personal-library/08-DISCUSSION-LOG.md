# Phase 8: Markdown Pipeline and Personal Library - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-12
**Phase:** 8-markdown-pipeline-and-personal-library
**Areas discussed:** Library card design, Tagging & search relationship, Recently-read + progress surface, Markdown scope & raw-HTML policy

---

## Library card design

### What should each library row/card show by default?

| Option | Description | Selected |
|--------|-------------|----------|
| Calm minimal row | Title + author + small source indicator (icon/badge for fixture/url/paste/markdown) + thin progress hairline when partially read. Matches PROJECT.md "calm reading-room shelf"; lowest cognitive load. | ✓ |
| Rich card | Title + author + source badge + 1-2 line excerpt + cover thumbnail + progress hairline + tag chips. Closer to Readwise/Pocket; more scannable but heavier. | |
| Minimal now, extensible | Start minimal in Phase 8; leave room to add excerpt/cover in a later phase. | |

**User's choice:** Calm minimal row
**Notes:** Carries the visual identity of the whole library surface. Title + author + source indicator + thin progress hairline only. No excerpt, no cover thumb, no tag chips on the row by default (tags display only when present — see D8-06).

### How should the source/origin (fixture/url/paste/markdown) show on each row?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline per-row indicator | Small text/glyph per row next to the title. SC#1 requires fixtures badged `source: "fixture"`. | ✓ |
| Filter, no inline badge | No per-row badge; a filter/sort control groups by source. SC#1 still satisfied but readers can't tell origin at a glance. | |
| Both badge + filter | Inline indicator + source filter control. Covers SC#1 literally + the light-weight-filter differentiator. | |

**User's choice:** Inline per-row indicator
**Notes:** Cheapest way to honor SC#1. Source filter is NOT in Phase 8 scope.

### What's the default sort order for the library?

| Option | Description | Selected |
|--------|-------------|----------|
| Recently added | Newest-added first. Matches research default + read-it-later convention. | ✓ |
| Recently read | Most-recently-OPENED first. Matches one half of SC#5. | |
| Added default + Recently-read strip | Recently added is the default AND a separate "Continue reading" strip above the list surfaces recently-opened unfinished. | |

**User's choice:** Recently added
**Notes:** Recently-READ is handled as a separate surface in Area 3 (Continue-reading strip).

### What should the empty library look like (no ingested articles yet)?

| Option | Description | Selected |
|--------|-------------|----------|
| Calm hint toward Add | Honest, calm empty state pointing at the Add control. Mirrors FixtureList "No articles yet" + DOC-06 voice. | ✓ |
| Seed with fixtures only | Empty state always shows 6 fixtures as starter samples. Conflicts with SC#1. | |
| You decide | Voice is locked (calm DOC-06); exact copy is planner/UI-SPEC. | |

**User's choice:** Calm hint toward Add
**Notes:** Empty state copy: "Your library is empty. Paste a URL or upload a file to begin." Fixtures still appear via `compositeLibraryRepository` merge once added.

---

## Tagging & search relationship

### Where does the reader apply tags to an article?

| Option | Description | Selected |
|--------|-------------|----------|
| On-article edit, card displays | Tags edited in ArticleView; library cards only display existing tags as chips. Matches Readwise/Hypothes.is "tag while reading." | ✓ |
| Inline edit on card | Tags edited inline on each library card. Faster bulk-tagging; adds editing affordances to the calm minimal row. | |
| Dedicated tag panel | Separate Tag panel/screen for managing all tags and applying them. Heavyweight for a calm library. | |
| Both | On-article AND inline-on-card. Maximizes flexibility; more surface to maintain. | |

**User's choice:** On-article edit, card displays
**Notes:** Keeps the calm minimal row uncluttered. Document-tags and highlight-tags remain separate namespaces (Phase 8 ships document-tags only).

### Does typing a tag name in the search box surface articles with that tag?

| Option | Description | Selected |
|--------|-------------|----------|
| Include tag names | Search matches title + author + source-domain/URL + TAG NAMES. Tags are first-class searchable metadata (SC#3). | ✓ |
| Title/author/domain only | Search only title/author/source-domain. Tags reachable only via tag-filter chip. | |
| Separate controls | Search box (title/author/domain) + separate tag-filter mechanism. | |

**User's choice:** Include tag names
**Notes:** SC#3 says "search by title and metadata"; tags ARE metadata. Most intuitive for readers.

### How does the reader filter the library by tag (LIB-04)?

| Option | Description | Selected |
|--------|-------------|----------|
| Single-tag chip filter | Tag chips above/beside the list; clicking a chip filters to that tag (one at a time, AND-style). Matches "flat tags, no query language." | ✓ |
| Multi-tag filter | Multi-select tag filter (AND or OR across multiple tags). Power-user; drifts toward query territory. | |
| Search box only | Just the search box (since tag names participate in search). No "browse by tag" gesture. | |

**User's choice:** Single-tag chip filter
**Notes:** PROJECT.md commits to flat tags + no folders. Research warns against query-language drift.

### What happens to a tag when the last article carrying it is untagged/removed?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-prune empty tags | Tag with zero articles disappears from the filter chips automatically. No orphan management. | ✓ |
| Persistent tag set | Tags persist as a managed set even when unused; reader can rename/delete explicitly. Readwise-style. | |
| You decide | Contract ("flat tags, no folders, tag chips filter the list") is locked; semantics are planner. | |

**User's choice:** Auto-prune empty tags
**Notes:** Tags exist only as long as they're applied. Simplest model.

---

## Recently-read + progress surface

### How should "recently-read shortcuts" appear in the library (SC#5)?

| Option | Description | Selected |
|--------|-------------|----------|
| Continue-reading strip above list | Distinct strip ABOVE the library list showing 1-3 most-recently-OPENED unfinished articles. Separates SC#5's two signals cleanly. | ✓ |
| Sort option only | No separate strip; "recently-read" is just a sort option. Fewer chrome surfaces; collapses two signals into one. | |
| Single "last read" hint | Small "Last read: <article>" inline hint. Calmer; surfaces ONE item only. | |

**User's choice:** Continue-reading strip above list
**Notes:** Strip handles "recently-read shortcuts"; list default-sort (recently-added) handles the rest of SC#5.

### When does an article count as "recently read"?

| Option | Description | Selected |
|--------|-------------|----------|
| On open | Opening the article (ArticleView mount) counts. Matches locationStore semantics. | ✓ |
| On first advance | Only count if reader advances (turns page or scrolls past first viewport). Prevents "I clicked it by mistake." | |
| Only when offset > 0 | Only count articles with non-zero saved graphemeOffset. Strictest. | |

**User's choice:** On open
**Notes:** Simple + deterministic; matches locationStore (location captured on mount/turn/scroll).

### How should per-article reading progress show on the library row (SC#5 "positional reading-progress indicators")?

| Option | Description | Selected |
|--------|-------------|----------|
| Hairline only | Thin hairline along the row; fill width = graphemeOffset/total. Reuses v1.0 ProgressHairline visual language. | ✓ |
| Percent text | Small percentage text (e.g. "42%"). Explicit but adds text to the calm minimal row. | |
| Hairline + percent | Both. Most informative; heaviest visually. | |
| Three-state only | "unread" / "reading" / "finished" (no positional info). Loses positional signal SC#5 asks for. | |

**User's choice:** Hairline only
**Notes:** Reuses Phase 02-03 ProgressHairline visual language. Zero for unread; full for finished.

### What happens to an article in the Continue-reading strip once the reader finishes it?

| Option | Description | Selected |
|--------|-------------|----------|
| Leave strip, mark finished in list | Finished articles drop off the strip; remain in library list with a small "finished" indicator. | ✓ |
| Stay in strip | Finished articles stay in the strip too (easy re-read). Strip grows with use. | |
| You decide | Contract (Continue-reading strip + hairline progress per row) is locked; threshold is researcher/planner. | |

**User's choice:** Leave strip, mark finished in list
**Notes:** Strip stays focused on unfinished work. "Finished" threshold mechanics (last page vs ~98% offset; paginated vs scrolling) are researcher/planner.

---

## Markdown scope & raw-HTML policy

### Should Phase 8 also ship .html file-upload alongside Markdown?

| Option | Description | Selected |
|--------|-------------|----------|
| .md AND .html | ARCHITECTURE.md L344/L1020 scope Phase 8 as "HTML + Markdown Pipeline." Pipeline is input-source-agnostic; .html feeds existing htmlToBlocks+DOMPurify. Cost is one extra file-picker accept. | ✓ |
| .md only | Only .md uploads; .html defers despite ARCHITECTURE.md framing. | |
| .md upload + paste stays for HTML | .md upload + keep existing paste-HTML textarea (Phase 7) as HTML path. Pragmatic middle ground. | |

**User's choice:** .md AND .html
**Notes:** ARCHITECTURE.md explicitly scopes this phase as "HTML + Markdown Pipeline." Paste-HTML textarea stays; Phase 8 ADDS file-upload for both formats.

### How should markdownToBlocks handle raw HTML in a .md document?

| Option | Description | Selected |
|--------|-------------|----------|
| Strict CommonMark (escape raw HTML) | Raw HTML blocks/inlines escaped by the parser (CommonMark default). No sanitizer needed (mdast has no HTML by default). Zero XSS surface from markdown. | ✓ |
| GFM raw HTML via DOMPurify | Enable GFM raw-HTML blocks but route through existing htmlToBlocks + DOMPurify. Preserves author intent; reuses Phase 7 sanitization. | |
| You decide | Contract (markdownToBlocks returns Block shape, ArticleSchema.parse) is locked; policy is researcher/spike. | |

**User's choice:** Strict CommonMark (escape raw HTML)
**Notes:** doc model IS the security boundary. GFM raw-HTML-via-DOMPurify is REJECTED for Phase 8; could be re-opened deliberately in a later phase.

### How should Markdown provenance (title/author/date) be derived (ING-03 "YAML front-matter recognized as metadata")?

| Option | Description | Selected |
|--------|-------------|----------|
| Front-matter then filename | YAML front-matter (title/author/date) → Provenance when present; filename (without .md) → title fallback when absent. originalHtmlHash = hash of .md bytes. No "first image as cover" (figures stay in body). | ✓ |
| Filename always | Always use filename as title (ignore front-matter). Simpler; loses user-authored metadata. | |
| Front-matter required | Refuse upload if title/author/date absent. Strictest; refuses most notes. | |

**User's choice:** Front-matter then filename
**Notes:** Provenance.sourceUrl absent (no canonical URL, like paste). originalHtmlHash = SHA-256 of .md source bytes.

### How should a Markdown upload get its article id (and dedupe against re-uploads)?

| Option | Description | Selected |
|--------|-------------|----------|
| Content-hash id | id = "md-<shortHash(canonical content)>". Two uploads of same .md → same id → D7-07 dedupe-refuse. Renamed copy with identical content also dedupes. Mirrors paste-<hash> pattern (server/ingest.ts L177). | ✓ |
| Filename-slug id | id = "md-<slugify(filename)>". Distinct filenames always create distinct entries. Two uploads of "article.md" still dedupe. | |
| Random id (no dedupe) | id = "md-<randomUUID>". Allows duplicates; conflicts with save-once-read-forever + D7-07. | |

**User's choice:** Content-hash id
**Notes:** Honors ArticleSchema.id `/^[a-z0-9-]+$/` regex. Mirrors Phase 7 paste pattern.

---

## The Agent's Discretion

- `markdownToBlocks` adapter internals (exact remark plugin set, mdast-walk structure, footnote-id allocation).
- Tag persistence shape (denormalize onto article row vs separate Dexie `tags` store vs join table).
- "Finished" threshold mechanics (last page vs ~98% offset; paginated vs scrolling parity).
- Remove UX placement + confirmation design (card-level trash vs ArticleView menu vs both; confirmation dialog copy).
- Continue-reading strip size cap (3 vs 5).
- Exact copy for empty state, "finished" indicator label, remove confirmation.
- Upload control placement (combined single "Add" vs three sibling forms vs tabbed surface).
- `ArticleSource` enum widening exact values ("markdown" + "html-upload" naming TBD by researcher).
- File-size cap, multi-file upload, drag-drop (researcher/planner).

## Deferred Ideas

- PDF intake — Phase 11 (ING-04).
- EPUB intake — Phase 12 (ING-05).
- Export/import bundles — Phase 9 (PORT-01..03).
- Annotation review panel — Phase 10 (RECV-01).
- POLISH-01/02 + NVDA+Firefox acceptance — Phase 13.
- Cover thumbnails / excerpt on cards — deferred per D8-01.
- Full-text search across article bodies — FEATURES.md L164 differentiator for a later phase.
- Multi-tag (AND/OR) filter query syntax — Phase 8 ships single-tag chip filter only (D8-07).
- Folders/collections hierarchy — PROJECT.md defers; flat tags only.
- GFM raw-HTML in Markdown — Phase 8 ships strict CommonMark (D8-16).
- Edit-metadata panel — FEATURES.md L95; not in Phase 8.
- Manual tag management / batch operations / tag colors — Phase 8 ships auto-prune flat tags only.
- Image proxying/rehosting / first-image-as-cover for Markdown — figures stay in body.
- Drag-drop + multi-file upload — Phase 8 ships single-file picker only.
- Library-footer stats ("47 articles • ~12 MB") — FEATURES.md L166 differentiator; not in Phase 8.
