# Phase 8: Markdown Pipeline and Personal Library - Research

**Researched:** 2026-08-12
**Domain:** Markdown ingestion adapter + reader-facing personal library (React/Dexie/IndexedDB) extending the shipped Phase 7 substrate
**Confidence:** HIGH

## Summary

Phase 8 is the reader-facing surface of v2.0. It wraps a **personal library** (browse / open / read / remove / search / tag / filter / progress / continue-reading) around the working Phase 7 ingestion pipeline, and adds **Markdown** as the second intake format alongside the existing URL and paste-HTML paths. The hard architectural insight is that **almost everything is already shipped**: `compositeLibraryRepository` + `DexieLibrarySource.remove(id)` (cascade), `IngestControl`'s four-state machine, `ProgressHairline`, `locationStore`'s grapheme offset, the `.status` live region, the round-trip anchor gate, and the input-source-agnostic `server/ingest.ts` orchestrator are all present and consumed unchanged. Phase 8 is largely an additive UI + adapter layer that plugs into existing seams.

The two genuinely new pieces of substrate are (a) **`markdownToBlocks`** — a sibling of `server/htmlToBlocks.ts` that walks a strict-CommonMark mdast and emits the same `{ blocks, footnotes, lang, provenancePartial, isReaderable }` shape, and (b) **the library UI** (`LibraryView` replacing `FixtureList` at the `#/` default route, plus tag entry inside `ArticleView`). The Markdown path is the **lowest-risk** intake: strict CommonMark escapes raw HTML by default (no sanitizer needed — the doc model IS the security boundary), the mdast → Block mapping is mechanical (Pattern F exhaustive switch), and the existing `assertRoundTripAnchor` gate proves byte-equivalence with fixtures.

The load-bearing invariants (carried verbatim from CONTEXT.md and not re-litigated): (1) the reading engine cannot tell a Markdown/HTML-upload article from a fixture, (2) `markdownToBlocks` output feeds the SAME `normalizeText` + selectors the annotation machinery uses (no normalization fork — Pitfall 2), (3) `assertRoundTripAnchor` refuses any article whose 5-offset sample does not resolve to `confident`, (4) save-once-read-forever + dedupe-refuse (D7-07) applies unchanged to uploads, (5) Pitfall 9 (Dexie version discipline) — `version(4)` is APPEND-only for any new stores/indexes, v1/v2/v3 are byte-unchanged.

**Primary recommendation:** Build `markdownToBlocks` as a strict sibling of `htmlToBlocks` using `unified` + `remark-parse` + `remark-frontmatter` + `yaml`, denormalize tags onto the article row (additive field + `*tags` multi-entry index in `version(4)`), and replace `FixtureList` with a `LibraryView` that composes the existing `compositeLibraryRepository`, `locationStore`, `ProgressHairline`, and `IngestControl` state-machine patterns.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (verbatim from 08-CONTEXT.md `<decisions>`)

**Carrying forward (locked by v1.0 + Phase 7 — do NOT re-litigate):**
- **Doc model is the security boundary** — `markdownToBlocks` returns Block JSON; React renders Block JSON; `dangerouslySetInnerHTML` exists nowhere; DOMPurify runs only where raw HTML is actually parsed (the HTML paths).
- **One normalizer, one path** (Pitfall 2) — `markdownToBlocks` output feeds the SAME `normalizeText` + `deriveQuoteSelector` / `resolveQuoteSelector` modules the round-trip anchor gate calls. No Markdown-specific normalization fork.
- **Round-trip anchor gate applies to every Markdown/HTML-upload article** — `assertRoundTripAnchor` refuses entry on any sample that doesn't resolve to `confident`.
- **D7-07 save-once-read-forever + dedupe-refuse** — same id → "Already in your library" (no overwrite, no orphaned highlights).
- **Pitfall 9 (Dexie version discipline)** — append `version(N+1)` for any new stores/indexes (e.g. a tags store); never edit shipped v1/v2/v3 blocks.
- **Calm DOC-06/PAGE-09 voice** for all disclosure (D7-04) — refusals, low-confidence banners, empty states, "already in library." Zero new disclosure vocabulary.

**Library surface — card design & layout (LIB-01, LIB-05):**
- **D8-01: Calm minimal row.** title + author (when present) + small per-row source indicator + thin positional progress hairline when partially read. NO excerpt, NO cover thumbnail, NO tag chips on the row itself by default.
- **D8-02: Inline per-row source indicator.** Small text/glyph: fixture / URL / paste / Markdown / HTML-upload. This satisfies SC#1. (Filtering by source is NOT in scope.)
- **D8-03: Default sort = recently-added descending.** Fixtures sit at the bottom of the default sort. Recently-READ is a SEPARATE surface (D8-09).
- **D8-04: Calm empty state pointing at Add.** "Your library is empty. Paste a URL or upload a file to begin."

**Library surface — tagging & search (LIB-03, LIB-04):**
- **D8-05: Tag entry is on the article, not on the card.** Tags edited in `ArticleView`; library card only DISPLAYS tags as chips when present. Document-tags and highlight-tags are separate namespaces; Phase 8 ships document-tags only.
- **D8-06: Search includes title + author + source domain/URL + tag names.** Tags are first-class searchable metadata. Full-text search across bodies is explicitly deferred.
- **D8-07: Single-tag chip filter.** One tag at a time, AND-style within a single tag. No query language.
- **D8-08: Auto-prune empty tags.** A tag no longer carried by any article disappears from the filter chips. No orphan-tag management surface.

**Library surface — recently-read & progress (LIB-06):**
- **D8-09: "Continue reading" strip above the list.** 1–3 most-recently-OPENED articles that aren't finished. Distinct from the default sort.
- **D8-10: "Recently read" = opened.** Opening the article counts; no scroll/turn required.
- **D8-11: Per-article progress = hairline only.** Fill width = `graphemeOffset / total`. Reuses `ProgressHairline`. NO percent text. Zero for unread; full for finished.
- **D8-12: Finished articles leave the strip, marked in the list.** Filled hairline + subtle mark.

**Library surface — remove (LIB-02):**
- **D8-13: Cascade-remove is the existing `DexieLibrarySource.remove(id)`.** Already shipped (Phase 7 Plan 07-06). Removes article + highlights + notes + location in one Dexie transaction.
- **D8-14: Remove affordance placement + confirmation is planner.** Cascade is destructive — confirmation recommended (mirror WipeConfirm pattern, Pitfall 8 spirit).

**Markdown + HTML-upload pipeline (ING-03 + ARCHITECTURE.md "HTML + Markdown"):**
- **D8-15: Ship BOTH `.md` and `.html` file-upload in Phase 8.** ARCHITECTURE.md L344 + L1020 scope Phase 8 as "HTML + Markdown Pipeline." `.html` upload feeds `input.html` through existing `htmlToBlocks` + DOMPurify. `.md` upload adds `markdownToBlocks`. Paste textarea stays.
- **D8-16: Strict CommonMark for `markdownToBlocks`.** Use `remark`/`remark-parse` with raw HTML blocks/inlines escaped by the parser (CommonMark default — no `allowDangerousHtml`). Zero XSS surface from the Markdown path; no sanitizer needed. GFM raw-HTML-via-DOMPurify REJECTED for Phase 8. Output is the same `{ blocks, footnotes, lang, provenancePartial }` shape as `htmlToBlocks`.
- **D8-17: Markdown provenance = front-matter then filename.** YAML `title:` / `author:` / `date:` → `Provenance.{title,author,publishedAt}` when present. Else title falls back to filename (without `.md`); other fields omitted. `originalHtmlHash` = SHA-256 of the `.md` source bytes. NO "first image as cover." `Provenance.sourceUrl` absent.
- **D8-18: Markdown id = content-hash slug; dedupe-refuse on re-upload.** `id = "md-<shortHash(canonical content)>"` mirroring paste-`<shortHash>`. Filename-slug and randomUUID rejected.

### the Agent's Discretion

- **`markdownToBlocks` adapter internals** — exact remark plugin set (CommonMark only vs CommonMark + GFM tables/task-lists/footnotes that DON'T introduce raw HTML), mdast-walk structure, `FootnoteReferenceBlock` id allocation (`/^fn-\d+$/` regex locked at schema.ts L115).
- **Tag persistence shape** — denormalize onto article row vs separate `tags` Dexie store vs join table. The contract (flat tags, document-tag namespace, auto-prune empties) is locked; the storage shape is researcher/planner.
- **"Finished" threshold** — last page reached vs ~98% offset vs both. The "drop off strip, mark in list" behavior is locked; mechanics are researcher/planner.
- **Remove UX placement + confirmation design** — card-level trash, ArticleView menu, or both; confirmation copy/shape.
- **Continue-reading strip size cap** — 3 vs 5; default toward calm lower end.
- **Exact copy** for empty state, "finished" indicator label, remove confirmation — voice locked (calm DOC-06); words are UI-SPEC/planner.
- **Upload control placement** — combined single "Add" affordance vs three sibling forms vs tabbed surface. Contract locked; layout planner.
- **`ArticleSource` enum widening exact values** — propose `"markdown"` + `"html-upload"`; closed enum, additive widening locked.
- **File-size cap, multi-file upload, drag-drop** — researcher/planner. Phase 7's content-length cap applies on server side.

### Deferred Ideas (OUT OF SCOPE — ignore completely)
- PDF intake — **Phase 11** (ING-04).
- EPUB intake — **Phase 12** (ING-05).
- Export/import bundles — **Phase 9** (PORT-01..03).
- Annotation review panel — **Phase 10** (RECV-01).
- POLISH-01/02 + NVDA+Firefox — **Phase 13**.
- Cover thumbnails / excerpt on cards.
- Full-text search across article bodies.
- Multi-tag (AND/OR) filter query syntax.
- Folders/collections hierarchy.
- GFM raw-HTML in Markdown.
- Edit-metadata panel.
- Manual tag management / batch operations / tag colors.
- Image proxying/rehosting / first-image-as-cover for Markdown.
- Drag-drop + multi-file upload.
- Library-footer stats ("47 articles • ~12 MB").
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **ING-03** | Reader can add an article by uploading a Markdown document, normalized into the canonical document model. | `markdownToBlocks` adapter (sibling of `htmlToBlocks`) + `IngestControl` file-upload form + `IngestionRequestSchema` widened to accept `{markdown}` + `ArticleSourceSchema` widened with `"markdown"` + `id = md-<shortHash(canonical)>` derivation in `server/ingest.ts`. See §Pattern 1 and §Code Examples. |
| **LIB-01** | Reader can browse their ingested articles in a personal library that replaces the flat fixture list. | `LibraryView` (replaces `FixtureList` at `#/`) consuming the already-shipped `compositeLibraryRepository` (UNION of fixtures + Dexie-persisted ingested). Source badge (D8-02) per row. See §Pattern 5. |
| **LIB-02** | Reader can open, read, and remove any article in their library. | Open + read already work via `#/article/<id>` → `ArticleView`. Cascade-remove is already shipped in `DexieLibrarySource.remove(id)`. Phase 8 adds the affordance (D8-14) + confirmation. See §Pattern 3. |
| **LIB-03** | Reader can search their library by title and metadata. | Client-side linear scan over `compositeLibraryRepository.list()` filtered by normalized title + author + sourceUrl-domain + tag-names (D8-06). No server search surface; no FlexSearch. See §Don't Hand-Roll. |
| **LIB-04** | Reader can tag articles and filter the library by tag (flat tags, no folders). | Tag denormalized onto the article row (`tags: string[]` additive field, `.default([])`, Pitfall 9) + `*tags` multi-entry Dexie index in `version(4)`. Auto-prune via `Array.from(new Set(articles.flatMap(a => a.tags ?? [])))` on read. Single-tag chip filter. See §Pattern 2. |
| **LIB-05** | Reader sees ingestion metadata (source URL, fetch date) and can reach the original source. | `Provenance.sourceUrl` (already `.optional()` for paste/markdown) + `IngestionMeta.fetchedAt` already on the article row. ArticleView already has the conditional "Originally published at {domain}" link (L1168-1170). Library row carries a small source indicator (D8-02). Markdown path: sourceUrl absent → link hides (paste precedent). |
| **LIB-06** | Reader sees recently-read and reading-progress indicators across the library. | Continue-reading strip (1–3 most-recently-OPENED unfinished articles — D8-09) + per-row `ProgressHairline` (D8-11). Both derive from `locationStore` (graphemeOffset per `[articleId+revision]`); `total` = `graphemeClusters(normalizeText(article), article.lang).length`. See §Pattern 4. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Markdown parsing + front-matter recognition | Server (Node middleware — `/api/ingest`) | — | Strict CommonMark + raw-HTML-escape is the security boundary; the server already owns HTML extraction + sanitize. The Markdown adapter is a sibling under `/server` returning the same envelope shape. |
| YAML front-matter parse → `Provenance` | Server (`markdownToBlocks`) | — | The mdast `yaml` node emits a raw YAML string; the server parses it (single-source-of-truth + can fail honestly via the existing `extraction-unsupported` reason). |
| Library list render + sort + filter | Browser (React `LibraryView`) | API (Dexie read via `compositeLibraryRepository`) | Pure client-side; personal-library scale (10s–100s of articles) is well within in-memory filter territory. |
| Library data persistence | Browser (IndexedDB via Dexie) | — | All library rows live locally; `version(4)` append-only for tags. No server-side library store. |
| Tag write/edit | Browser (ArticleView affordance → Dexie) | — | Tagging happens while reading (D8-05); local-only; auto-prune on read. |
| Search (title / author / domain / tag) | Browser | — | Personal-library scale → linear scan over the cached list. No server search surface; no FlexSearch. |
| Cascade-remove | Browser (Dexie transaction) | — | Already shipped in `DexieLibrarySource.remove(id)` (Phase 7 Plan 07-06); Phase 8 only adds the reader-facing affordance. |
| Routing default | Browser (hash router in `App.tsx`) | — | Same hash route (`#/`); only the rendered list-view component swaps from `FixtureList` to `LibraryView`. No router library. |
| Source-original link (LIB-05) | Browser (ArticleView) | — | Already implemented for v1.0 + Phase 7 paste path. Conditional on `Provenance.sourceUrl !== undefined`. Markdown path: link hides. |
| Reading-progress + continue-reading | Browser (LibraryView + LibraryCard) | API (`locationStore`) | Reads persisted `graphemeOffset`; `total` computed client-side. Reuses `ProgressHairline` visual language. |
| Round-trip anchor gate | Server (`assertRoundTripAnchor`) | — | Already shipped; Phase 8 invokes it on the markdown/upload paths unchanged. |
| ID derivation (immutability) | Server (`ingest.ts`) | — | Already shipped for url/paste; Phase 8 adds the `md-<shortHash>` branch. |

## Standard Stack

The libraries below are NET-NEW server-side dependencies. They never enter the client bundle (the `/api/ingest` endpoint is the seam). The full v1.0 + Phase 7 stack (`react`, `react-dom`, `dexie`, `zod`, `jsdom`, `isomorphic-dompurify`, `@mozilla/readability`, etc.) is unchanged.

### Core (NET-NEW — server-only)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `unified` | 11.0.5 | Engine that composes parser + plugins into a mdast pipeline | The unified collective's official engine; 50M weekly downloads; ESM-only (matches `"type": "module"`). `[VERIFIED: npm registry + github.com/unifiedjs/unified]` |
| `remark-parse` | 11.0.0 | CommonMark → mdast parser | Official remark plugin; 46.6M weekly downloads; **parses CommonMark by default** (confirmed in official readme: "Markdown is parsed according to CommonMark"). Raw HTML is escaped by default — no `allowDangerousHTML` flag is set. `[VERIFIED: npm registry + github.com/remarkjs/remark]` |
| `remark-frontmatter` | 5.0.0 | Recognize YAML/TOML front-matter block | Official remark plugin; 4.6M weekly downloads; strips front-matter into an mdast `yaml` (or `toml`) node for downstream parsing. `[VERIFIED: npm registry + github.com/remarkjs/remark-frontmatter]` |
| `yaml` (eemeli/yaml) | 2.9.0 | Strict YAML 1.2 parser | 183M weekly downloads; the recommended modern YAML parser (successor to `js-yaml`); strict YAML 1.2 spec compliance. Used to parse the `value` string of the mdast `yaml` node into `{ title, author, date }`. `[VERIFIED: npm registry + github.com/eemeli/yaml]` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `unified` + `remark-parse` | `mdast-util-from-markdown` directly | The unified collective's own readme names this as an option ("If you don't use plugins and want to access the syntax tree, you can directly use `mdast-util-from-markdown`"). Leaner by ~2 deps but loses `remark-frontmatter` plugin composition — you'd hand-roll front-matter detection. Use unified; the ecosystem is the project's locked choice (ARCHITECTURE.md L344). |
| `yaml` (eemeli) | `js-yaml` | Both work; `js-yaml` is in maintenance; `yaml` is actively developed and strict by default. Recommend `yaml`. |
| strict CommonMark | `remark-gfm` (tables, task-lists, strikethrough, autolink-literals, footnotes) | GFM tables/task-lists would map cleanly to existing Block kinds (tables → `UnsupportedBlock` per D8-16; footnotes → `FootnoteReferenceBlock` + `FootnoteBody` if footnote syntax is enabled). But GFM raw-HTML is rejected by D8-16. Researcher/planner discretion: GFM-without-raw-HTML is a clean addition if the corpus demands it; default to plain CommonMark for Phase 8 to minimize surface. |
| Denormalized `tags: string[]` on article row | Separate `tags` Dexie store with `[articleId]` index | See §Pattern 2 — recommend denormalized for simplicity (auto-prune is trivial; no join). |
| Client-side linear search | FlexSearch / MiniSearch / lunr | Overkill for personal-library scale (10s–100s of articles). Defer until full-text search is in scope (REQUIREMENTS.md Future). |

**Installation (server-only — these never enter the client bundle):**

```bash
npm install unified@11.0.5 remark-parse@11.0.0 remark-frontmatter@5.0.0 yaml@2.9.0
```

**ESM-only confirmation:** All four packages are ESM-only per their official readmes — consistent with the project's `"type": "module"` and Vite 8 + Node 22 LTS baseline. `[VERIFIED: remark-parse readme "This package is ESM only"]`

**Version verification (npm view, run 2026-08-12):**

```
remark-parse   11.0.0   (current latest)
unified        11.0.5   (current latest)
remark-frontmatter 5.0.0 (current latest)
yaml           2.9.0    (current latest)
```

## Package Legitimacy Audit

> Package Legitimacy Gate executed via `gsd-tools query package-legitimacy check --ecosystem npm ...` on 2026-08-12. Registry existence + age + downloads + source repo verified.

| Package | Registry | Age | Weekly Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|------------------|-------------|---------|-------------|
| `unified` | npm | ~6 yrs (v11 published 2024-06) | 50,055,482 | github.com/unifiedjs/unified | OK | Approved |
| `remark-parse` | npm | ~3 yrs (v11 published 2023-09) | 46,600,358 | github.com/remarkjs/remark | OK | Approved |
| `remark-frontmatter` | npm | ~3 yrs (v5 published 2023-09) | 4,665,028 | github.com/remarkjs/remark-frontmatter | OK | Approved |
| `yaml` | npm | ~7 yrs (active) | 182,632,904 | github.com/eemeli/yaml | OK | Approved |
| `mdast` | npm | 10+ yrs (2015) | 449,203 | github.com/wooorm/mdast | **SUS** (deprecated) | REMOVED — deprecated 2015 stub; superseded by `mdast-util-from-markdown` (transitive via `remark-parse`). Do NOT install. |
| `micromark` | npm | active | 51,459,259 | github.com/micromark/micromark | OK | NOT directly installed — transitive dep of `remark-parse` (it's the underlying CommonMark parser). |
| `mdast-util-from-markdown` | npm | active (2026-02) | 50,122,710 | github.com/syntax-tree/mdast-util-from-markdown | OK | NOT directly installed — transitive dep of `remark-parse`. |

**Packages removed due to [SLOP] verdict:** none.
**Packages removed due to deprecated [SUS] verdict:** `mdast` (the 2015 deprecated stub).
**Packages flagged as suspicious [SUS]:** none.

**postinstall-script check:** None of the approved packages declare a `postinstall` script (verified via the legitimacy-check signals: `postinstall: null` across the board). No supply-chain risk from install-time scripts.

*All package names were discovered via the project's own research artifacts (`.planning/research/STACK.md` + `ARCHITECTURE.md` L344) which name the unified/remark collective as the locked SOTA — not via WebSearch or training data. The package legitimacy gate confirms they are not slopsquatted.*

## Architecture Patterns

### System Architecture Diagram

```
                                          READER BROWSER (client)
┌──────────────────────────────────────────────────────────────────────────────┐
│  #/  →  LibraryView (NEW; replaces FixtureList)                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ IngestControl (extended — URL + paste + .md/.html file upload)         │  │
│  │   └─► POST /api/ingest {url} | {html} | {markdown}                     │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────┐  ┌─────────────────────────────────────────────┐    │
│  │ Continue-reading    │  │ Library list (compositeLibraryRepository)   │    │
│  │ strip (1–3 items)   │  │  ┌──────────────────────────────────────┐  │    │
│  │ derived from        │  │  │ per row: title + author + source     │  │    │
│  │ locationStore       │  │  │ badge + ProgressHairline + tags      │  │    │
│  └─────────────────────┘  │  └──────────────────────────────────────┘  │    │
│                            │ Tag chips (auto-pruned) + Search box       │    │
│                            └─────────────────────────────────────────────┘    │
│  #/article/<id>  →  ArticleView (unchanged; tag affordance NEW)              │
│   └─► TagEntry (NEW — writes to Dexie.tags-on-article)                       │
└─────────────────────────────────────────┬────────────────────────────────────┘
                                          │ same-origin POST
                                          ▼
                          Vite Node dev middleware (07-06 RUNTIME_GUARDRAIL)
┌──────────────────────────────────────────────────────────────────────────────┐
│  /api/ingest → server/ingestAdapter → server/ingest(input)                   │
│                                                                              │
│  input.url  ──► safeFetch ──┐                                                │
│  input.html ──────────────┐ │                                                │
│  input.markdown ─────────┐│ │                                                │
│                          ││ │                                                │
│                          ▼▼ ▼                                                │
│            ┌─────────────────────────────────┐                               │
│            │ markdownToBlocks (NEW)          │  ← unified+remark-parse+       │
│            │   OR extractAndNormalize        │    remark-frontmatter+yaml;   │
│            │       (existing htmlToBlocks)   │    strict CommonMark;         │
│            │ Output: { blocks, footnotes,    │    raw HTML escaped           │
│            │   lang, provenancePartial,      │                               │
│            │   isReaderable }                │                               │
│            └─────────────┬───────────────────┘                               │
│                          ▼                                                   │
│            id derivation: url→slugifyUrl / paste+html-upload→paste-<hash>    │
│                           / markdown→md-<shortHash(canonical)>               │
│                          ▼                                                   │
│            ArticleSchema.parse (Zod-at-boundary)                             │
│                          ▼                                                   │
│            assertRoundTripAnchor (5-offset gate — Pitfall 2)                 │
│                          ▼                                                   │
│            deriveConfidence → IngestionResponse                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

A reader can trace: pick a `.md` file → IngestControl POSTs `{markdown}` → server parses to mdast → walks to Block tree → ArticleSchema.parse → round-trip anchor gate → response → client saves to Dexie → compositeLibraryRepository surfaces it on next render → ArticleView opens it identically to a fixture.

### Recommended Project Structure

```
src/
├── content/
│   ├── schema.ts                   # EDIT: widen ArticleSourceSchema + IngestionMeta.origin
│   └── repository.ts               # unchanged — compositeLibraryRepository already shipped
├── ingestion/
│   ├── IngestControl.tsx           # EDIT: add .md/.html file-upload form
│   ├── IngestionClient.ts          # EDIT: add ingestMarkdown / ingestHtmlUpload
│   ├── LibrarySource.ts            # EDIT: tag read/write surface (denormalized on article)
│   ├── types.ts                    # EDIT: widen IngestionRequestSchema + failure catalog
│   └── library/                    # NEW directory
│       ├── LibraryView.tsx         # NEW: default route component (replaces FixtureList)
│       ├── LibraryRow.tsx          # NEW: one row (title + author + source badge + hairline + tags)
│       ├── ContinueReadingStrip.tsx # NEW: 1–3 most-recently-opened unfinished articles
│       ├── TagFilter.tsx           # NEW: chip strip (auto-pruned)
│       ├── LibrarySearch.tsx       # NEW: title/author/domain/tag input
│       └── tagsStore.ts            # NEW: load/add/remove tags (writes via DexieLibrarySource)
├── reader/
│   ├── ArticleView.tsx             # EDIT: mount tag-entry affordance
│   └── TagEntry.tsx                # NEW: small tag-edit surface in reader chrome
├── persistence/
│   └── db.ts                       # EDIT: append version(4) — articles table gains *tags multi-entry index
├── routes/
│   └── (FixtureList.tsx — REMOVED or renamed LegacyFixtureList)
├── fixtures/                       # unchanged — fixtures appear badged source:"fixture" in library
└── App.tsx                         # EDIT: list-view component swap (FixtureList → LibraryView)

server/
├── ingest.ts                       # EDIT: dispatch {markdown} → markdownToBlocks; id branch md-<shortHash>
├── htmlToBlocks.ts                 # unchanged — .html upload feeds input.html through this
└── markdownToBlocks.ts             # NEW: unified+remark-parse+remark-frontmatter+yaml adapter
                                      #     (sibling of htmlToBlocks; same output shape)

tests/
├── unit/
│   ├── server/
│   │   └── markdown-to-blocks.spec.ts   # NEW: mdast→Block mapping + YAML front-matter
│   ├── ingestion-tags.test.ts           # NEW: tag denormalize + auto-prune
│   └── library-search.test.ts           # NEW: title/author/domain/tag filter
└── e2e/
    ├── library/                         # NEW directory
    │   ├── browse-open.spec.ts          # SC#1 library is default route + fixtures badged
    │   ├── remove-cascade.spec.ts       # SC#2 cascade-remove
    │   ├── search-tag-filter.spec.ts    # SC#3 search + tag + filter
    │   ├── markdown-upload.spec.ts      # SC#4 .md upload + front-matter
    │   ├── progress-recent.spec.ts      # SC#5 hairline + continue-reading
    │   └── v1-regression.spec.ts        # SC#1 no v1.0 e2e test regressing
    └── ingestion/
        └── dexie-migration.spec.ts      # EDIT: extend to assert v3→v4 additive (tags index)
```

### Pattern 1: `markdownToBlocks` adapter (strict CommonMark → Block tree)

**What:** A pure function `markdownToBlocks(md: string): Promise<{ blocks, footnotes, lang, provenancePartial, isReaderable }>` that is a sibling of `server/htmlToBlocks.ts:extractAndNormalize`. Returns the exact same shape; the orchestrator treats them identically downstream.

**When to use:** Whenever the input envelope is `{ markdown: string }`. Dispatch in `server/ingest.ts`.

**mdast → Block kind mapping table (locked by D8-16 — strict CommonMark only):**

| mdast node | Block/Mark kind | Notes |
|------------|-----------------|-------|
| `root` | iterate `.children` | top-level walk |
| `heading` (depth 1–6) | `HeadingBlock` (level = depth) | depth maps 1:1 to level |
| `paragraph` | `ParagraphBlock` | inline content via `extractInline` (below) |
| `blockquote` | `BlockquoteBlock` (recursive: walk `children` into `.children`) | mirrors htmlToBlocks L310-316 |
| `list` (`ordered: false`) | `BulletedListBlock` | each `listItem` → `{ content: Block[] }` (walk item children) |
| `list` (`ordered: true`) | `NumberedListBlock` (`start` from `list.start` or 1) | same shape; GFM task-lists would be `[{ kind: "paragraph", content: [{ text: "[ ]" }, ...] }]` (no special-casing in Phase 8) |
| `code` (fenced or indented) | `CodeBlock` (`language` from `code.lang` if fenced + parseable) | source = `code.value` |
| `image` (block-level standalone) | `FigureBlock` | alt = `image.alt`, src = `image.url` (must be http(s); else → `UnsupportedBlock`) |
| `html` (raw HTML block) | **escape to text** (CommonMark default) | D8-16: raw HTML is NOT carried; the node's value becomes a paragraph of plain text |
| `inlineCode` | `CodeMark` | inline; emits `{ type: "code" }` on the run |
| `strong` | `StrongMark` | inline |
| `emphasis` | `EmMark` | inline |
| `link` | `LinkMark` | href must be http(s)/mailto else demoted to plain text (mirrors htmlToBlocks L141-144) |
| `text` | inline run | whitespace-collapsed (mirrors htmlToBlocks L125) |
| `break` | inline `" "` | mirrors htmlToBlocks br handling |
| `thematicBreak` | skip (no Block kind) | decorative |
| `yaml` (front-matter node) | **does NOT become a Block** — feed its `.value` to `yaml.parse()` → `provenancePartial` | D8-17 |
| anything else (`table`, `math`, `toml`, …) | `UnsupportedBlock` with `plainDescription` | DOC-06 disclosure |

**Footnote handling (researcher discretion per CONTEXT.md):** Plain CommonMark has NO footnote syntax. If the planner enables `remark-gfm` (footnotes extension), map `footnoteReference` → `FootnoteReferenceBlock` with `footnoteId = "fn-" + identifier`, and `footnoteDefinition` → `FootnoteBody` (id must match `/^fn-\d+$/` — sanitize non-numeric identifiers by allocating a monotonic counter, mirroring htmlToBlocks L290-296). For Phase 8 MVP, ship plain CommonMark (no footnote syntax); footnotes are a clean additive later.

**Inline-run extraction:** Reuse the SAME logic shape as `htmlToBlocks.ts:extractInline` (L121-156) — recursive accumulation of D-04 marks (exactly link/code/strong/em). Do NOT fork tidyRuns; extract a shared helper if it's not already exported.

**Example (skeleton):**

```typescript
// server/markdownToBlocks.ts (skeleton — full impl is planner)
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import { parse as parseYaml } from "yaml";
import type { Block, InlineRun } from "../src/content/schema";

type ProvenancePartial = {
  sourceUrl?: string; title?: string; author?: string; publishedAt?: string;
};

export interface MarkdownToBlocksResult {
  blocks: Block[];
  footnotes: { id: string; content: InlineRun[] }[];
  lang: string;
  provenancePartial: ProvenancePartial;
  isReaderable: boolean;
}

const processor = unified().use(remarkParse).use(remarkFrontmatter); // strict CommonMark + YAML

export async function markdownToBlocks(md: string): Promise<MarkdownToBlocksResult> {
  const tree = processor.parse(md);
  // Walk root.children exhaustively (Pattern F); see mapping table above.
  // Extract the yaml node's value → provenancePartial (D8-17).
  const blocks: Block[] = [];
  let provenancePartial: ProvenancePartial = {};
  for (const node of tree.children) {
    if (node.type === "yaml") {
      const meta = parseYaml(node.value) as Record<string, unknown>;
      if (typeof meta.title === "string") provenancePartial.title = meta.title;
      if (typeof meta.author === "string") provenancePartial.author = meta.author;
      if (typeof meta.date === "string") provenancePartial.publishedAt = new Date(meta.date).toISOString();
      continue;
    }
    blocks.push(...visit(node)); // exhaustive switch — see mapping table
  }
  return {
    blocks,
    footnotes: [], // strict CommonMark has no footnotes
    lang: "en",    // Markdown carries no lang attribute; default "en" (mirrors htmlToBlocks detectLang default)
    provenancePartial,
    isReaderable: blocks.length >= 3, // mirrors deriveConfidence; planner tunes
  };
}
```

**Source:** `[CITED: github.com/remarkjs/remark/tree/main/packages/remark-parse]` — official readme confirms CommonMark-by-default + mdast output + ESM-only + `remark-frontmatter` plugin composition. The mdast node types (`root`, `heading`, `paragraph`, `code`, `list`, `blockquote`, `image`, `link`, `strong`, `emphasis`, `inlineCode`, `text`, `html`, `yaml`) are documented at `[CITED: github.com/syntax-tree/mdast]`.

### Pattern 2: Tag persistence (denormalized on article row)

**What:** Document tags are stored as `tags: string[]` directly on the article row in the existing `articles` Dexie store. A new `*tags` multi-entry index is declared in `version(4)`. No separate `tags` store, no join table.

**When to use:** Phase 8 default. Auto-prune is trivial. Read is a single table scan.

**Why denormalized wins for Phase 8:**

| Approach | Read | Write | Auto-prune | Schema cost | Verdict |
|----------|------|-------|------------|-------------|---------|
| **Denormalized `tags: string[]`** on article row + `*tags` multi-entry index | `db.articles.orderBy('addedAt').reverse()` → filter in memory by `a.tags?.includes(tag)` | `db.articles.update(id, { tags })` | `Array.from(new Set(list.flatMap(a => a.tags ?? [])))` | `version(4)` APPEND — add `*tags` index to `articles`; NO new store | **RECOMMENDED** |
| Separate `tags` store (`{ id, name }`) + join table (`{ tagId, articleId }`) | Two-table join on every library render | Three writes (tag upsert + join insert + article update) | Aggregate query over the join table | New `tags` store + new `tagArticles` store — heavier `version(4)` | Overkill for personal-library scale; better if tag colors/metadata are added later |
| Separate `tags` store with `[articleId]` index only | Aggregate per tag | One write per (tag, article) pair | Aggregate distinct | New `tags` store only | Middle ground; loses tag-metadata extensibility |

**Index declaration (Dexie `version(4)` append):**

```typescript
// src/persistence/db.ts — APPEND ONLY (Pitfall 9: never edit v1/v2/v3)
this.version(4).stores({
  articles: "id, revision, source, addedAt, *tags", // *tags = multi-entry index over the tags array
  settings: "key",
  location: "[articleId+revision]",
  highlights: "id, [articleId+revision]",
  notes: "id, highlightId",
});
// NO .upgrade() callback — additive index only; Dexie re-indexes on next open.
// Existing v3 article rows that lack `tags` hydrate to `undefined` on read;
// the type is `tags?: string[]` and the planner reads defensively with `a.tags ?? []`.
```

**Auto-prune implementation (read-time derivation):**

```typescript
// src/ingestion/library/tagsStore.ts (skeleton)
export async function loadAllTags(): Promise<string[]> {
  const articles = await dexieLibrarySource.list();
  const set = new Set<string>();
  for (const a of articles) for (const t of a.tags ?? []) set.add(t);
  return [...set].sort((a, b) => a.localeCompare(b));
}

export async function setArticleTags(articleId: string, tags: string[]): Promise<void> {
  await db.articles.update(articleId, { tags });
  // Auto-prune is implicit: on next loadAllTags(), any tag no longer present
  // on any article simply doesn't appear in the Set. No cleanup write needed.
}
```

**Zod boundary:** widen `ArticleSchema` with `tags: z.array(z.string().min(1)).default([]).optional()` — additive, backward-compatible with v1.0 fixtures + Phase 7 ingested rows (which omit the field and hydrate to `undefined`/`[]`). This mirrors the `ingestionMeta: IngestionMetaSchema.optional()` precedent (Pitfall 9 — `.optional()`/`.default()` migration mechanism).

### Pattern 3: Cascade-remove affordance (LIB-02)

**What:** `DexieLibrarySource.remove(id)` is already shipped (Phase 7 Plan 07-06 — `src/ingestion/LibrarySource.ts` L108-151). It removes the article + highlights + notes + location in ONE Dexie transaction. Phase 8 only adds the reader-facing affordance.

**Confirmation (cascade mechanics):**
- Transaction across `articles`, `highlights`, `notes`, `location` stores.
- Highlights deleted via compound-index range query on `[articleId+revision]`.
- Notes cascade through collected highlight ids (`db.notes.where("highlightId").anyOf(highlightIds).delete()`).
- Location deleted via the same compound-index range.
- ALL within ONE Dexie transaction — atomic commit or rollback (Pitfall 10).

**Phase 8 NEW work:**
1. Surface a remove affordance. Placement is planner discretion (D8-14): card-level trash, ArticleView menu, or both.
2. **Confirmation dialog** — cascade is destructive (every highlight/note/location is gone). Mirror the WipeConfirm pattern (Pitfall 8 spirit — destructive action behind a confirm; default focus on the non-destructive button).
3. After confirmation, call `dexieLibrarySource.remove(id)`; on success, navigate back to `#/` and refresh the library list.

**Copy (D7-04 — calm DOC-06 voice, locked):** planner authors; should NOT leak jargon ("Dexie", "transaction", "cascade"). Recommended shape: "Remove this article? Your highlights and notes for it will also be removed."

### Pattern 4: Continue-reading strip + per-row progress hairline (LIB-06)

**What:** Two distinct visual signals driven by the same `locationStore` substrate (D-05 grapheme offset).

**Continue-reading strip (D8-09, D8-10):**

```typescript
// ContinueReadingStrip.tsx (skeleton)
async function loadContinueReading(cap: number = 3): Promise<CanonicalArticle[]> {
  const all = await compositeLibraryRepository.list();
  // Load the latest location per article (max savedAt per articleId).
  const locations = await loadAllLocations(); // returns LocationRecord[] indexed by articleId
  const annotated = all.map((a) => {
    const loc = locations.find((l) => l.articleId === a.id);
    const total = graphemeClusters(normalizeText(a), a.lang).length;
    const progress = loc ? loc.graphemeOffset / total : 0;
    return { article: a, lastOpened: loc?.savedAt ?? null, progress };
  });
  return annotated
    .filter((x) => x.lastOpened !== null && x.progress < FINISHED_THRESHOLD) // unfinished
    .sort((a, b) => (a.lastOpened! < b.lastOpened! ? 1 : -1)) // most-recently-opened first
    .slice(0, cap)
    .map((x) => x.article);
}
```

**`loadAllLocations()` doesn't exist yet** — the current `locationStore.ts` reads ONE `[articleId+revision]` at a time. The planner adds a new module-level `loadAllLocations(): Promise<LocationRecord[]>` (a single `db.location.toArray()` + Zod-validate each row). No Dexie version bump needed (the store schema is unchanged).

**Per-row progress hairline (D8-11):**

```typescript
// LibraryRow.tsx (skeleton)
import { ProgressHairline } from "../reader/ProgressHairline";

function LibraryRow({ article, location }: { article: CanonicalArticle; location?: LocationRecord }) {
  const total = useMemo(
    () => graphemeClusters(normalizeText(article), article.lang).length,
    [article]
  );
  const ratio = location ? Math.min(1, location.graphemeOffset / total) : 0;
  return (
    <li>
      <a href={`#/article/${article.id}`} aria-labelledby={`title-${article.id}`}>
        <h2 id={`title-${article.id}`}>{article.provenance.title}</h2>
        {article.provenance.author && <p className="meta">{article.provenance.author}</p>}
        <SourceBadge source={article.ingestionMeta?.source ?? "fixture"} sourceUrl={article.provenance.sourceUrl} />
        {ratio > 0 && <ProgressHairline progress={ratio} />}
      </a>
    </li>
  );
}
```

**Reuses `ProgressHairline` unchanged** — the component takes `progress?: number` in `[0, 1]` and renders the fill via `scaleX`. The library-row use case is identical to the ArticleView scroll-progress use case (same component, same CSS).

**"Finished" threshold (researcher discretion per CONTEXT.md):** recommend `FINISHED_THRESHOLD = 0.98` — graphemeOffset >= 98% of total drops the article off the strip and shows the filled-hairline + subtle "finished" mark in the list. Reasoning: page-count-based thresholds require knowing the article's pagination (which only the paginated renderer computes); an offset ratio is mode-agnostic (works for paginated AND scrolling) and is cheap to compute on the library list. Cross-engine drift (which the calibration harness measures) is irrelevant because the threshold is a coarse 98%, not a precise count.

### Pattern 5: Default-route swap (LibraryView replaces FixtureList)

**What:** `App.tsx` already does hash-based two-view routing (`View = { name: "list" } | { name: "article"; id }`). Phase 8 swaps the list-view component from `FixtureList` to `LibraryView`. The hash route `#/`, the `parseHash` function, the `hashchange` listener, and the `Gap 3 fragment guard` (`!hash.startsWith("#/")`) are all unchanged.

**Edit shape:**

```typescript
// src/App.tsx (one-line swap)
- import { FixtureList } from "./routes/FixtureList";
+ import { LibraryView } from "./ingestion/library/LibraryView";
  ...
  {view.name === "list" ? (
-   <FixtureList />
+   <LibraryView />
  ) : (
    <ArticleView ... />
  )}
```

**`FixtureList.tsx` is the blueprint** for `LibraryView` — both render an `<h1>` + `<main id="main">` + a status live region + a `<ul>` of articles. `LibraryView` adds the continue-reading strip + tag chips + search + source badges + per-row hairline + tags; everything else mirrors FixtureList's structure.

**SC#1 regression guard:** the existing `tests/e2e/open-every-fixture.spec.ts` test "fixture list exposes one row per curated fixture (DOC-01)" (L65-69) MUST still pass — LibraryView shows the same N rows (fixtures + any ingested). The `#/article/<id>` route is unchanged so every per-fixture open test passes as-is. The `tests/e2e/ingestion/happy-path.spec.ts` paste-HTML flow MUST still pass — the `<h1>Saved articles</h1>` heading assertion (L93) may need to update if the planner rephrases the library heading (planner's call — keep the heading stable to avoid churning tests, or update both atomically).

### Anti-Patterns to Avoid

- **Do NOT introduce a `remark-rehype` + `rehype-sanitize` pipeline.** That serializes mdast → hast → HTML and re-parses, opening the sanitize-then-re-introduce mXSS class (Pitfall 4) and adding two unnecessary deps. Walk mdast directly to Block JSON; React renders Block JSON. `[CITED: .planning/research/PITFALLS.md Pitfall 4]`
- **Do NOT use a separate React state library (Redux/Zustand/XState).** Library list + tag state + search + filter are all React state/context (STACK.md "What NOT to use"). `[CITED: .planning/research/STACK.md]`
- **Do NOT use a CSS framework for the library chrome.** Authored CSS + custom properties only (existing tokens). `[CITED: .planning/research/STACK.md]`
- **Do NOT compute progress from page numbers.** Page numbers change with viewport/font/typography (PAGE-09/PROJECT.md). Use graphemeOffset / total only. `[CITED: schema.ts PageNumber rejection + PROJECT.md]`
- **Do NOT auto-migrate v3 article rows to add `tags`.** `version(4)` is APPEND-only with `*tags` multi-entry index; existing rows hydrate to `undefined`/`[]` via the `.optional()`/`.default()` mechanism (Pitfall 9). `[CITED: src/persistence/db.ts + Pitfall 9]`
- **Do NOT fork `normalizeText` or the selector modules.** `markdownToBlocks` output feeds the SAME `normalizeText` + `deriveQuoteSelector` + `resolveQuoteSelector` the round-trip anchor gate calls. Any drift silently orphans every anchor on every markdown article (Pitfall 2). `[CITED: server/ingest.ts L40-45]`
- **Do NOT persist DOM nodes, XPath anchors, or page numbers in the library.** The library is a thin view over `CanonicalArticle` + `LocationRecord` (graphemeOffset). `[CITED: PROJECT.md What NOT to use]`
- **Do NOT silently coerce a corrupt tag row.** `tagsStore` validates via `z.array(z.string().min(1))`; a corrupt row is dropped (mirrors `DexieLibrarySource.list` L57-62 STATE-04 defense).
- **Do NOT leak jargon in remove confirmation copy.** "Dexie transaction" / "cascade" / "FK" → "Your highlights and notes for it will also be removed." (D7-04).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Markdown parsing | Hand-rolled line-by-line tokenizer | `unified` + `remark-parse` + `remark-frontmatter` | CommonMark is a 60+ page spec with subtle rules (lazy continuation, setext headings, link reference definitions, entity handling, list tightness). Hand-rolling will produce block shapes that fail `assertRoundTripAnchor` on real `.md` files. |
| YAML front-matter parsing | Regex extraction + manual key-value split | `remark-frontmatter` (extraction) + `yaml` (parsing) | YAML is deceptively complex (multi-line strings, anchors, type coercion). `yaml` is strict 1.2; safe by default. |
| Block-tree → React rendering | Already shipped — DO NOT re-render | existing `src/reader/BlockView.tsx` (consumed by ArticleView unchanged) | The whole point of the doc model is one rendering path. Markdown/upload articles render through it identically. |
| Cascade-delete | Already shipped — DO NOT re-implement | `DexieLibrarySource.remove(id)` (LibrarySource.ts L108-151) | Re-implementing risks orphaning rows (Pitfall 10) and breaking the existing transaction guarantee. |
| Tag auto-prune | Background cleanup job / scheduled task | read-time derivation `Array.from(new Set(list.flatMap(a => a.tags ?? [])))` | The set is naturally empty when no article carries the tag. No cleanup needed. |
| Reading progress | Page-count tracking / scroll-percentage persistence | `locationStore` (existing graphemeOffset) + `ProgressHairline` | Page numbers are not stable; the grapheme substrate IS stable. |
| Routing | React Router / Next.js / a router library | existing hash-based `App.tsx` (A2 — `window.location.hash` + `hashchange`) | STACK.md: no premature abstractions. Phase 8 swaps one component. |
| Search index | FlexSearch / MiniSearch / lunr / hand-rolled inverted index | in-memory linear scan over `compositeLibraryRepository.list()` | Personal-library scale (10s–100s of articles) + title/metadata only = no index needed. Defer until full-text (REQUIREMENTS.md Future). |
| Confirmation dialog | Custom modal | existing `<dialog>` + `showModal` pattern (SettingsPanel/WipeConfirm precedent) | Native focus-trap + Esc + inert + backdrop for free (02-RESEARCH anti-pattern #1). |

**Key insight:** Phase 8 is mostly composition over shipped substrate. The genuinely new code is `markdownToBlocks.ts`, the library UI components, the tag store, and a handful of additive schema edits. Almost everything else is "wire the existing pieces together."

## Runtime State Inventory

> Phase 8 involves additive schema evolution (ArticleSource enum widening + IngestionMeta.origin widening + Dexie version(4) for tags index). The Phase 7 v3 substrate already shipped; this section answers the canonical question for the v3→v4 evolution.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data (Dexie)** | v3 article rows (currently zero in v1/v2; populated by Phase 7 ingests) carry NO `tags` field; v3 `ArticleSource` enum is `"fixture" \| "url" \| "paste"`. | **None — additive only.** `version(4)` appends `*tags` index; existing rows hydrate to `undefined`/`[]` via `.optional()`/`.default()` (Pitfall 9). Widened enum accepts existing values unchanged; new `"markdown"` + `"html-upload"` are forward-only. NO `.upgrade()` callback. |
| **Live service config** | The Vite Node dev middleware serves `/api/ingest` (07-06 RUNTIME_GUARDRAIL). No external service config. | **None — code edit only.** `server/ingest.ts` adds a `markdownToBlocks` dispatch branch; `server/markdownToBlocks.ts` is new code, not config. |
| **OS-registered state** | None. The SPA has no OS-level registrations (no Task Scheduler / launchd / pm2 / systemd). | **None.** Verified by repo grep — no pm2 ecosystem file, no launchd plist, no systemd unit. |
| **Secrets/env vars** | No new secrets. The pipeline reads no env vars for the markdown path (`safeFetch` env config is URL-path only and stays untouched). | **None.** Markdown path bypasses `safeFetch` entirely (no fetch). |
| **Build artifacts** | `node_modules/` will gain `unified`/`remark-parse`/`remark-frontmatter`/`yaml` after `npm install`. Vite client bundle MUST NOT include them — they're server-only. | **Verify via `npm run build`** that the client bundle size doesn't grow materially. The `/server` boundary + Vite's static analysis keeps them out of the client entry; assert in a unit test (`tests/unit/server/` precedent — see the Phase 7 spike-jsdom-workers.spec.ts pattern). |

**Nothing found in category:** "OS-registered state" — verified by repo grep (no pm2/launchd/systemd artifacts). "Secrets/env vars" — verified by reading `server/ingest.ts` (no env-var reads outside `safeFetch` URL-path config).

## Common Pitfalls

### Pitfall 8-1: `markdownToBlocks` produces block shapes that fail `assertRoundTripAnchor`

**What goes wrong:** Markdown inline content has subtly different whitespace rules than HTML. CommonMark collapses adjacent inline nodes differently than the HTML `extractInline` path; list tightness affects whether `paragraph` blocks emit; setext headings can produce odd whitespace at the start of the content array. If the markdown adapter emits block shapes whose `normalizeText` output drifts even one character from what `deriveQuoteSelector` expects, the round-trip gate refuses the article ("round-trip-anchor-failed") and every markdown upload fails.

**Why it happens:** The round-trip gate is the integration truth (Phase 7 SC#1). It's not a markdown-specific check — it just samples 5 offsets, derives a quote selector, and resolves it. Any normalization drift between the markdown adapter's block output and `normalizeText`'s expectations trips the gate.

**How to avoid:**
- Reuse the SAME `extractInline` logic shape as `htmlToBlocks.ts` (L121-156) — same whitespace collapse (`/\s+/g → " "`), same D-04 mark set, same `tidyRuns` post-processing (L159-181).
- Extract a shared `inlineRunsFromMdast` / `inlineRunsFromDom` pair if there's risk of drift; or share a single helper if shapes converge.
- **Round-trip test every markdown fixture before declaring the adapter done** — mirror the Phase 7 happy-path test (`tests/e2e/ingestion/happy-path.spec.ts`) for the markdown path. A markdown corpus fixture (front-matter + heading + paragraph + list + blockquote + code) MUST pass `assertRoundTripAnchor` to enter the library.

**Warning signs:** Every `.md` upload returns `{ ok: false, reason: "round-trip-anchor-failed" }`. Block content arrays start or end with whitespace-only runs. Tight-vs-loose list differences produce extra paragraph children.

### Pitfall 8-2: Raw HTML in `.md` files sneaks into the Block tree

**What goes wrong:** Strict CommonMark escapes raw HTML to plain text by default — BUT if the planner enables `remark-gfm` (or any extension that re-introduces raw-HTML handling), the mdast may carry `html` nodes whose value is arbitrary HTML. If `markdownToBlocks` carries that HTML into a `ParagraphBlock`'s text, the renderer (which never uses `dangerouslySetInnerHTML`) is safe — but if a future refactor re-introduces HTML serialization, the doc-model-is-the-boundary guarantee is broken.

**Why it happens:** CommonMark's default is to treat `<script>alert(1)</script>` in a `.md` as an `html` block node whose `value` is the literal string. The string is inert text. But the moment the adapter routes that string through a re-parser (e.g. if someone adds a "render markdown raw HTML via DOMPurify" path later — explicitly rejected by D8-16), the surface opens.

**How to avoid:**
- In the mdast walker, explicitly handle `node.type === "html"` by emitting a `ParagraphBlock` whose inline run text is `node.value` (escaped). DO NOT carry the html node's value as a structured payload.
- Add a unit test: a `.md` containing `<script>alert(1)</script>` must produce blocks whose rendered DOM has zero `<script>` elements (mirror the Phase 7 mXSS suite pattern, `tests/unit/server/mxss.spec.ts`).
- Document the D8-16 invariant in a header comment in `server/markdownToBlocks.ts` so the next maintainer can't silently re-open the surface.

**Warning signs:** A test that includes raw `<` in a `.md` fails to produce an `html` node (means the parser config was changed). The adapter imports `rehype-*` packages (means someone added the HTML serialization path).

### Pitfall 8-3: Tags don't auto-prune (orphan tags persist in the chip strip)

**What goes wrong:** The reader removes the last tag from article X, expecting the tag chip to disappear from the filter. But the chip stays because the previous implementation wrote tags to a separate `tags` store and never deletes them.

**Why it happens:** Separate-store tag implementations require an explicit cleanup pass over the join table. The reader's "remove the last occurrence" gesture doesn't trigger that cleanup.

**How to avoid:**
- Denormalize `tags: string[]` on the article row (see §Pattern 2). The chip list is computed via `Array.from(new Set(articles.flatMap(a => a.tags ?? [])))` on every library render — when no article carries the tag, it falls out of the Set naturally.
- Add a unit test: tag X applied to article A only; remove X from A; reload the library; the chip strip no longer contains X.

**Warning signs:** The chip strip contains tags the reader doesn't remember applying. A `tags` store row count exceeds the distinct-tag count across articles.

### Pitfall 8-4: Continue-reading strip includes finished articles

**What goes wrong:** The reader reaches the end of an article; the next time they open the library, the article is still in the continue-reading strip even though they're done with it.

**Why it happens:** `locationStore` saves the offset on every scroll/turn. At end-of-article, `graphemeOffset ≈ total`. Without a "finished" filter, the strip shows the article because it WAS the most-recently-opened.

**How to avoid:** Filter the strip by `progress < FINISHED_THRESHOLD` (recommend 0.98 — see §Pattern 4). Add a "finished" indicator in the library list (D8-12). The finished article stays in the library; it just leaves the strip.

**Warning signs:** The strip's progress hairlines are all at 100%. The reader sees the same "almost done" article for weeks.

### Pitfall 8-5: v1.0 e2e regression — fixture list changes break SC#1

**What goes wrong:** Replacing `FixtureList` with `LibraryView` breaks one of the v1.0 e2e tests — most likely the heading-name assertion in `tests/e2e/open-every-fixture.spec.ts` L65-69 (`fixtures.length` row count) or `tests/e2e/ingestion/happy-path.spec.ts` L93 (`<h1>Saved articles</h1>`).

**Why it happens:** The existing tests were authored against `FixtureList`'s specific DOM. Any heading-text change, list-item structure change, or per-row markup change can break them.

**How to avoid:**
- Keep the `<h1>` text stable ("Saved articles" or change atomically across all tests in one commit).
- Keep the `<ul>` → `<li>` → `<a href="#/article/<id>">` structure (LibraryView is a superset — source badge + hairline are siblings inside the `<li>`, not a structural change).
- Add `tests/e2e/library/v1-regression.spec.ts` as an explicit SC#1 gate — open every v1.0 fixture from the library, assert the same invariants `open-every-fixture.spec.ts` asserts.

**Warning signs:** v1.0 tests pass in isolation but fail when LibraryView adds the tag-entry affordance to ArticleView (focus shifts to the tag input on mount). Plan to mount TagEntry as inert until the reader activates it.

### Pitfall 8-6: Client bundle accidentally includes `unified` / `remark-parse`

**What goes wrong:** Vite's static analysis fails to keep `/server/*` out of the client entry (e.g. if a client module imports a type from a server module and Vite follows the import graph). The client bundle balloons by ~150KB.

**Why it happens:** ESM import graphs are static — if `src/ingestion/IngestionClient.ts` (client) imports a type from `server/markdownToBlocks.ts` (server), Vite may pull the whole module into the client.

**How to avoid:**
- Use `import type` ONLY when the client needs a type from a server module — TypeScript erases type-only imports and Vite respects the boundary.
- Add a bundle-size assertion to CI (`npm run build` + check `dist/assets/*.js` total size against a baseline).
- Mirror the Phase 7 pattern: `/server/*` modules are never imported by `/src/*` modules at runtime; only shared schemas in `src/content/schema.ts` are bidirectionally importable.

**Warning signs:** `dist/assets/` contains a chunk with `unified` or `remark` in the sourcemap. Build size grows > 10KB after the markdown deps install.

## Code Examples

### Example 1: `IngestionRequestSchema` widening (additive)

```typescript
// src/ingestion/types.ts — EDIT (additive widening)
import { z } from "zod";
import { ArticleSchema, httpUrl } from "../content/schema";

export const IngestionRequestSchema = z.union([
  z.object({ url: httpUrl }),
  z.object({ html: z.string().min(1) }),
  // NEW — Phase 8 ING-03:
  z.object({ markdown: z.string().min(1) }),
  // NEW — Phase 8 D8-15 (.html upload reuses html path; the discriminator
  // is whether the client got it from a .html file upload vs a textarea paste.
  // The server treats both identically: htmlToBlocks + DOMPurify. The client
  // may add an "html-upload" origin tag via the article's ingestionMeta.)
]);
```

### Example 2: `ArticleSourceSchema` + `IngestionMetaSchema.origin` widening

```typescript
// src/content/schema.ts — EDIT (additive widening; the closed-enum evolution
// ARCHITECTURE.md L390 anticipated: "fixture", "url", "html-upload",
// "markdown", "pdf", "epub-chapter").
export const ArticleSourceSchema = z.enum([
  "fixture", "url", "paste",
  "markdown",     // NEW — Phase 8 ING-03
  "html-upload",  // NEW — Phase 8 D8-15 (paste textarea stays as "paste";
                  //       .html file-upload carries "html-upload" for the
                  //       D8-02 source badge distinction)
]);
// `origin` discriminator widens symmetrically:
//   origin: z.enum(["url", "paste", "upload"]).optional()
// "upload" covers both markdown + html-upload (both come from file picker);
// the `source` field carries the format distinction.
```

### Example 3: `server/ingest.ts` dispatch + id derivation branch

```typescript
// server/ingest.ts — EDIT (add a markdown branch to the existing dispatch)

// NEW: import the adapter
import { markdownToBlocks } from "./markdownToBlocks";

export async function ingest(input: IngestionRequest): Promise<IngestionResponse> {
  // Stage 0 — input validation: exactly one of {url} | {html} | {markdown}.
  const hasUrl = "url" in input && input.url !== undefined;
  const hasHtml = "html" in input && input.html !== undefined;
  const hasMarkdown = "markdown" in input && input.markdown !== undefined;
  if ((hasUrl ? 1 : 0) + (hasHtml ? 1 : 0) + (hasMarkdown ? 1 : 0) !== 1) {
    throw new IngestionError("server-error");
  }

  try {
    let blocks, footnotes, lang, provenancePartial, isReaderable;
    let id: string;
    let origin: "url" | "paste" | "upload";
    let source: "url" | "paste" | "markdown" | "html-upload";
    let fetchedAt: string | undefined;

    if (hasUrl) {
      const fetched = await safeFetch(input.url as string);
      const extracted = await extractAndNormalize(fetched.html, fetched.finalUrl);
      ({ blocks, footnotes, lang, provenancePartial, isReaderable } = extracted);
      id = slugifyUrl(fetched.finalUrl);
      origin = "url"; source = "url"; fetchedAt = new Date().toISOString();
    } else if (hasHtml) {
      const extracted = await extractAndNormalize((input as { html: string }).html, undefined);
      ({ blocks, footnotes, lang, provenancePartial, isReaderable } = extracted);
      id = `paste-${shortHash((input as { html: string }).html)}`;
      origin = "paste"; source = "paste";
    } else {
      // MARKDOWN path — NEW
      const md = (input as { markdown: string }).markdown;
      const extracted = await markdownToBlocks(md);
      ({ blocks, footnotes, lang, provenancePartial, isReaderable } = extracted);
      // D8-18: id = "md-<shortHash(canonical content)>" — content-hash, NOT filename.
      id = `md-${shortHash(md)}`;
      origin = "upload"; source = "markdown";
    }

    // (the existing ArticleSchema.parse + assertRoundTripAnchor + deriveConfidence
    // stages run identically on all three paths — the load-bearing invariant.)
    // ...
  } catch (e) { /* existing typed-reason catch */ }
}
```

### Example 4: File-upload form (extension of IngestControl)

```typescript
// src/ingestion/IngestControl.tsx — EDIT (add a file-upload form)

async function handleFileSubmit(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();
  const input = fileInputRef.current;
  if (!input || !input.files || input.files.length === 0) return;
  const file = input.files[0];

  // Client-side size cap (researcher/planner discretion per CONTEXT.md):
  if (file.size > 5 * 1024 * 1024) {
    setStatus("error");
    setMessage(mapReasonToCopy("response-too-large")); // reuse existing reason
    return;
  }

  const text = await file.text();
  setStatus("submitting");
  setMessage("Reading file…");

  // Dispatch by extension; the server envelope carries the format-specific key.
  try {
    const isMarkdown = /\.md$/i.test(file.name);
    const result = isMarkdown ? await ingestMarkdown(text) : await ingestHtml(text);

    // D7-07 dedupe-refuse — same check as URL/paste paths.
    if (await dexieLibrarySource.has(result.article.id)) {
      setStatus("error");
      setMessage(mapReasonToCopy("already-in-library"));
      return;
    }

    // D8-17 title fallback: if markdownToBlocks didn't find front-matter, the
    // server sets Provenance.title from the filename (without extension). The
    // server owns this fallback (single-source-of-truth); the client passes
    // the filename as a hint if the planner wires that channel.
    await dexieLibrarySource.save(result.article);
    setStatus("success");
    window.location.hash = `#/article/${result.article.id}`;
  } catch (e) {
    setStatus("error");
    setMessage(e instanceof IngestionError
      ? mapReasonToCopy(e.reason)
      : mapReasonToCopy("server-error"));
  }
}

// JSX:
<form onSubmit={handleFileSubmit}>
  <label htmlFor="ingest-file">Upload a file</label>
  <input
    id="ingest-file"
    ref={fileInputRef}
    type="file"
    accept=".md,.html"
    disabled={submitting}
  />
  <button type="submit" disabled={submitting || (fileInputRef.current?.files?.length ?? 0) === 0}>
    Add file
  </button>
</form>
```

### Example 5: Search + tag filter (client-side, in-memory)

```typescript
// src/ingestion/library/libraryFilter.ts (skeleton)

export interface LibraryFilter {
  query: string;        // empty = no query
  activeTag: string | null;  // null = no tag filter
}

export function filterLibrary(
  articles: CanonicalArticle[],
  filter: LibraryFilter,
): CanonicalArticle[] {
  const q = filter.query.trim().toLowerCase();
  return articles.filter((a) => {
    // Tag filter (D8-07 — single tag, AND-style within a tag)
    if (filter.activeTag !== null) {
      if (!(a.tags ?? []).includes(filter.activeTag)) return false;
    }
    // Search (D8-06 — title + author + sourceUrl-domain + tag-names)
    if (q.length > 0) {
      const haystack = [
        a.provenance.title,
        a.provenance.author ?? "",
        domainOf(a.provenance.sourceUrl),
        ...(a.tags ?? []),
      ].join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

function domainOf(url: string | undefined): string {
  if (!url) return "";
  try { return new URL(url).hostname; } catch { return ""; }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `js-yaml` for YAML parsing | `yaml` (eemeli/yaml) — strict YAML 1.2 | active development; `js-yaml` in maintenance | `yaml` is the recommended modern parser; safer defaults. |
| `remark` v14 / `remark-parse` v10 | `remark-parse` v11 + `unified` v11 | 2023-09 | ESM-only; matches `"type": "module"`. |
| React Router / Next.js for SPA routing | Hash-based two-view router (project standard) | v1.0 | No router library — STACK.md "no premature abstractions." |
| Hand-rolled markdown parsers | `remark-parse` (CommonMark-compliant) | universal | The unified collective's parser is the SOTA; do not roll your own. |

**Deprecated/outdated (do NOT use):**
- `mdast` (the 2015 package) — deprecated; superseded by `mdast-util-from-markdown` (transitive via `remark-parse`).
- `remark-rehype` + `rehype-sanitize` + `rehype-stringify` — would re-introduce the sanitize-then-re-introduce mXSS surface (Pitfall 4). Walk mdast directly to Block JSON.
- `js-yaml` — maintenance mode; prefer `yaml`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Personal-library scale is 10s–100s of articles (not 10,000s). | §Don't Hand-Roll (search) | If wrong, linear-scan search becomes slow at ~10k+ articles; mitigate by adding FlexSearch in a later phase (already deferred per REQUIREMENTS.md Future). |
| A2 | Strict CommonMark escapes raw HTML blocks to plain text by default (no `allowDangerousHTML` flag needed). | §Pattern 1 / Pitfall 8-2 | If wrong, a `.md` containing `<script>` could carry HTML into the Block tree. Mitigated by the mXSS-style unit test recommended in Pitfall 8-2. Confidence HIGH per `[CITED: remark-parse readme]`. |
| A3 | `remark-frontmatter` emits a `yaml` mdast node with a `.value` string (the raw YAML). | §Pattern 1 | If wrong, the front-matter extraction path needs adjustment (e.g. it's a `toml` node, or the value is structured). Confidence HIGH per `[CITED: github.com/remarkjs/remark-frontmatter]`. |
| A4 | The "finished" threshold of 0.98 is a reasonable cross-engine / cross-mode default. | §Pattern 4 | If wrong, readers see finished articles lingering in the strip (threshold too high) or unfinished articles marked done (threshold too low). Planner's discretion per CONTEXT.md; easy to tune. |
| A5 | `loadAllLocations()` is implementable as a single `db.location.toArray()` + Zod-validate. | §Pattern 4 | If wrong (e.g. the location store is too large for a single read), mitigate with a Dexie query for distinct articleIds. Personal-library scale makes this unlikely. |
| A6 | Continuing `App.tsx`'s hash-based router (no router library) is correct for the library-as-default-route. | §Pattern 5 | Not really at risk — STACK.md locks this; carried verbatim from v1.0. |
| A7 | The client bundle stays small after adding `unified` / `remark-parse` / `remark-frontmatter` / `yaml` because they're `/server`-only. | §Pitfall 8-6 | If wrong, mitigate with a bundle-size CI gate and `import type` discipline. |

**All other claims in this research are tagged `[VERIFIED: ...]` or `[CITED: ...]` — no user confirmation needed.**

## Open Questions

1. **GFM tables/task-lists in Phase 8?**
   - What we know: Plain CommonMark has no tables/task-lists/footnotes (they're GFM extensions). Tables can't map to any existing Block kind (would become `UnsupportedBlock`).
   - What's unclear: Whether the Phase 8 markdown corpus will include tables (real-world `.md` often does).
   - Recommendation: **Default to plain CommonMark** for Phase 8 MVP (D8-16 locks it). If the test corpus trips on tables frequently, the planner can add `remark-gfm` (without raw-HTML) in a follow-up plan. The schema doesn't need to change — tables already become `UnsupportedBlock` cleanly via the existing DOC-06 disclosure pattern.

2. **Combined vs sibling Add controls**
   - What we know: CONTEXT.md leaves the layout planner-discretion (D8-15 + "Upload control placement").
   - What's unclear: Whether the three input forms (URL / paste / upload) share one "Add an article" surface or live as three siblings.
   - Recommendation: Recommend **three sibling forms under one heading** (mirror the existing IngestControl pattern at minimum cost). A combined single "Add" affordance (dropdown/tabbed) is a UX-polish decision the planner can make.

3. **Remove confirmation copy + placement**
   - What we know: Cascade is destructive (D8-13/14). Voice is locked (D7-04).
   - What's unclear: Exact words + whether the affordance is card-level or in-ArticleView.
   - Recommendation: Card-level trash icon → small native `<dialog>` confirmation → on confirm, navigate to `#/` + refresh list. Mirror WipeConfirm pattern.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js ≥ 20.19 (22 LTS preferred) | `unified` / `remark-parse` (ESM-only) | ✓ | 22.22.3 (verified via `node --version` run during research) | — |
| Vite 8.1.5 dev server | Existing dev path + `/api/ingest` middleware | ✓ | 8.1.5 (package.json) | — |
| Playwright (Chromium + Firefox + WebKit) | Library + markdown e2e | ✓ | 1.61.1 (package.json) | — |
| `fake-indexeddb` (unit tests) | Tag store + library filter unit tests | ✓ | 6.2.5 (package.json devDeps) | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

`Step 2.6: All required tooling is already installed as part of the Phase 7 + v1.0 baseline.`

## Validation Architecture

> `workflow.nyquist_validation: true` in `.planning/config.json` → section included.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (unit) + Playwright Test 1.61.1 (e2e, chromium + firefox + webkit) |
| Config file | `vitest.config.ts` (project root, inferred) + `playwright.config.ts` (project root) |
| Quick run command | `npm run test:unit -- --run` |
| Full suite command | `npm run test` (Vitest unit + Playwright e2e across all 3 engines) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ING-03 | `.md` upload → article opens in reader; front-matter recognized | e2e (3 engines) | `npx playwright test tests/e2e/library/markdown-upload.spec.ts` | ❌ Wave 0 |
| ING-03 | markdownToBlocks mdast → Block mapping (heading/para/list/quote/code/figure) | unit | `npx vitest run tests/unit/server/markdown-to-blocks.spec.ts` | ❌ Wave 0 |
| ING-03 | markdownToBlocks raw-HTML escaped to text (mXSS-style gate) | unit | `npx vitest run tests/unit/server/markdown-to-blocks.spec.ts -t "raw html"` | ❌ Wave 0 |
| ING-03 | markdown id = `md-<shortHash>`; re-upload dedupes | unit | `npx vitest run tests/unit/server/ingest-adapter.spec.ts -t "markdown"` | ✅ (extend) |
| LIB-01 | Library is default route at `#/`; v1.0 fixtures present + badged | e2e (3 engines) | `npx playwright test tests/e2e/library/browse-open.spec.ts` | ❌ Wave 0 |
| LIB-01 | No v1.0 e2e test regresses | e2e (3 engines) | `npx playwright test tests/e2e/library/v1-regression.spec.ts tests/e2e/open-every-fixture.spec.ts` | ❌ Wave 0 (v1-regression); ✅ (open-every-fixture) |
| LIB-02 | Open + read any article (existing path; reuse open-every-fixture) | e2e | `npx playwright test tests/e2e/open-every-fixture.spec.ts` | ✅ |
| LIB-02 | Remove cascades to highlights + notes + location | unit + e2e | unit: `npx vitest run tests/unit/ingestion-client.test.ts -t "remove"`; e2e: `npx playwright test tests/e2e/library/remove-cascade.spec.ts` | ✅ (unit); ❌ Wave 0 (e2e) |
| LIB-03 | Search by title/author/domain/tag | e2e + unit | unit: `npx vitest run tests/unit/library-search.test.ts`; e2e: `npx playwright test tests/e2e/library/search-tag-filter.spec.ts -t "search"` | ❌ Wave 0 |
| LIB-04 | Tag an article; filter by tag; auto-prune empty tags | unit + e2e | unit: `npx vitest run tests/unit/ingestion-tags.test.ts`; e2e: `npx playwright test tests/e2e/library/search-tag-filter.spec.ts -t "tag"` | ❌ Wave 0 |
| LIB-05 | Ingestion metadata + source link visible per row + on ArticleView | e2e | `npx playwright test tests/e2e/library/browse-open.spec.ts -t "source"` | ❌ Wave 0 |
| LIB-06 | Per-row progress hairline; continue-reading strip | e2e + unit | unit: `npx vitest run tests/unit/library-search.test.ts -t "progress"`; e2e: `npx playwright test tests/e2e/library/progress-recent.spec.ts` | ❌ Wave 0 |
| Pitfall 9 | Dexie v3→v4 additive (tags index; no `.upgrade()`; existing rows hydrate `[]`) | e2e | `npx playwright test tests/e2e/ingestion/dexie-migration.spec.ts` | ✅ (extend with v4 assertion) |
| Pitfall 2 | Markdown article passes `assertRoundTripAnchor` (5-offset gate) | unit | `npx vitest run tests/unit/server/markdown-to-blocks.spec.ts -t "round-trip"` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm run test:unit -- --run` (Vitest only; < 30s on the existing 408-test suite)
- **Per wave merge:** `npm run test` (Vitest + Playwright across chromium + firefox + webkit)
- **Phase gate:** Full `npm run test` exits 0 (mirrors the Phase 7 + v1.0 "honest-suite" discipline from PROJECT.md Key Decision #9)

### Wave 0 Gaps

- [ ] `tests/unit/server/markdown-to-blocks.spec.ts` — covers ING-03 (mdast mapping, raw-HTML escape, front-matter, round-trip)
- [ ] `tests/unit/ingestion-tags.test.ts` — covers LIB-04 (denormalize, auto-prune)
- [ ] `tests/unit/library-search.test.ts` — covers LIB-03 + LIB-06 (filter, progress computation)
- [ ] `tests/e2e/library/browse-open.spec.ts` — covers SC#1 (LIB-01 + LIB-05)
- [ ] `tests/e2e/library/remove-cascade.spec.ts` — covers SC#2 (LIB-02)
- [ ] `tests/e2e/library/search-tag-filter.spec.ts` — covers SC#3 (LIB-03 + LIB-04)
- [ ] `tests/e2e/library/markdown-upload.spec.ts` — covers SC#4 (ING-03)
- [ ] `tests/e2e/library/progress-recent.spec.ts` — covers SC#5 (LIB-06)
- [ ] `tests/e2e/library/v1-regression.spec.ts` — covers SC#1 regression bar
- [ ] Extend `tests/e2e/ingestion/dexie-migration.spec.ts` — assert v3→v4 additive (`*tags` index; existing rows hydrate `[]`)

*(No framework install needed — Vitest + Playwright already wired.)*

## Security Domain

> `security_enforcement: true` + `security_asvs_level: 1` in `.planning/config.json` → section included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A — local-first, no accounts (PROJECT.md). |
| V3 Session Management | no | N/A — local-first. |
| V4 Access Control | no | N/A — single-user local library. |
| V5 Input Validation | **yes** | Zod-at-boundary on EVERY entry: `IngestionRequestSchema` (server) + `ArticleSchema.parse` (server) + `ArticleSchema.parse` again on client read (STATE-04 defense-in-depth, `IngestionClient.ts`). Markdown content is validated by `markdownToBlocks` → `ArticleSchema.parse` (the doc model is the boundary). YAML front-matter is parsed by `yaml` (strict, type-safe by default). |
| V6 Cryptography | no (hashing only) | SHA-256 via `node:crypto` for `originalHtmlHash` + `md-<shortHash>` id (mirrors Phase 7 `paste-<shortHash>`). Not cryptography-for-security; traceability only. |
| V7 Error Handling | **yes** | Every refusal path → typed `IngestionResponse({ ok: false, reason })` (existing 11-reason catalog). Markdown/upload refusals reuse the catalog: `extraction-unsupported`, `already-in-library`, `response-too-large`. No new disclosure vocabulary (D7-04). |
| V8 Data Protection | **yes (client-side)** | Local-first; no data leaves the browser except the same-origin `/api/ingest` POST. Markdown content is sent to the server for normalization but never persisted server-side (stateless). |
| V12 Files & Resources | **yes** | `.md` / `.html` upload — client-side size cap (recommended 5MB; researcher/planner discretion per CONTEXT.md). Server re-applies Phase 7's content-length cap. No multipart; the body is JSON with text content. Filename is sanitized (used only as a title fallback). |
| V13 API & Web Service | **yes** | `/api/ingest` widens to accept `{markdown}`; existing same-origin POST + `connect-src 'self'` CSP applies unchanged. |

### Known Threat Patterns for Markdown + Library (stack-specific)

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Raw HTML in `.md` carrying `<script>` / event handlers | Tampering / XSS | Strict CommonMark escapes raw HTML to plain text by default (`remark-parse` without `allowDangerousHTML`). The mdast walker explicitly maps `html` nodes to `ParagraphBlock` text (escaped). No DOMPurify needed for the markdown path; no `dangerouslySetInnerHTML` anywhere (existing repo-wide lint gate). `[CITED: remark-parse readme + D8-16]` |
| `javascript:` / `data:` URIs in markdown links/images | Tampering / XSS | mdast `link.url` is validated against the same scheme allow-list as `htmlToBlocks` (http/https/mailto for links; http/https for images). Non-conforming URLs are demoted to plain text (mirror htmlToBlocks L141-144). The schema's `linkableUrl` / `httpUrl` refinements re-validate at `ArticleSchema.parse` time. |
| Markdown content bomb (multi-MB `.md`) | DoS | Client-side size cap (5MB recommended) reusing the existing `response-too-large` refusal copy. Server re-applies the Phase 7 content-length cap. |
| Malicious YAML ( billion-laughs / type coercion) | DoS / Tampering | `yaml` package is strict YAML 1.2 (no implicit type coercion by default; safe-schema). The front-matter is parsed once, never re-serialized. Validate the parsed shape via Zod before merging into `provenancePartial`. |
| DOMPurify bypass via HTML-upload path | Tampering / XSS | The `.html` upload path feeds `input.html` straight through the existing `htmlToBlocks` + DOMPurify + SANITIZE_CONFIG (Pitfall 4) — same path paste-HTML uses today. The mXSS suite (`tests/unit/server/mxss.spec.ts`) already gates this. Phase 8 does NOT re-open the surface. |
| Tag injection (XSS via tag name) | Tampering / XSS | Tag names are stored as plain strings; React escapes text children (Pitfall 8 — `react/no-danger` lint gate). No HTML parsing of tag values. |
| Cross-article data leakage via stale Dexie rows | Info Disclosure | `DexieLibrarySource.remove(id)` cascades atomically (existing transaction). The library view reads via `compositeLibraryRepository.list()` which Zod-validates every row (STATE-04). |
| Tag-store row injection (corrupt tag row) | Tampering | `tagsStore` validates via `z.array(z.string().min(1))` on read; corrupt rows are dropped (mirrors `DexieLibrarySource.list` STATE-04 discipline). |

**No new SSRF surface** — the markdown path bypasses `safeFetch` entirely (the content is local; no fetch). The existing URL-path SSRF matrix (Phase 7 SC#3) is untouched and continues to gate the URL input.

## Sources

### Primary (HIGH confidence)

- **`src/content/schema.ts`** — the locked Zod doc model + ArticleSourceSchema (L207) + IngestionMetaSchema (L215-223). Read in full.
- **`src/ingestion/LibrarySource.ts`** — the shipped `DexieLibrarySource` (list/open/save/has/remove) + `compositeLibraryRepository`. Read in full.
- **`src/persistence/db.ts`** — the shipped Dexie v1/v2/v3 declarations (Pitfall 9 byte-unchanged). Read in full.
- **`server/ingest.ts`** — the shipped 7-stage pipeline orchestrator + `assertRoundTripAnchor` + `shortHash`. Read in full.
- **`server/htmlToBlocks.ts`** — the shipped HTML adapter (the sibling `markdownToBlocks` mirrors). Read in full.
- **`src/ingestion/IngestControl.tsx`** — the shipped four-state ingest form pattern (D7-04 voice). Read in full.
- **`src/ingestion/IngestionClient.ts`** + **`types.ts`** — the shipped client wrapper + IngestionRequest/Response schemas. Read in full.
- **`src/routes/FixtureList.tsx`** — the transitional surface Phase 8 replaces (blueprint for LibraryView). Read in full.
- **`src/App.tsx`** — the hash-based router (default-route swap target). Read in full.
- **`src/reader/ProgressHairline.tsx`** — the v1.0 hairline component reused per-row. Read in full.
- **`tests/e2e/open-every-fixture.spec.ts`** + **`tests/e2e/ingestion/happy-path.spec.ts`** + **`tests/e2e/ingestion/dexie-migration.spec.ts`** — the v1.0 + Phase 7 regression tests Phase 8 must not break. Read in full.
- **`tests/unit/ingestion-client.test.ts`** — the existing DexieLibrarySource + composite test pattern (Phase 8 tag tests mirror). Read in full.
- **`08-CONTEXT.md`** — the locked decisions + agent's discretion areas. Read in full.
- **`.planning/research/ARCHITECTURE.md` §Pattern 3** (L337-350) — Markdown adapter design (locked: `remark`/`remark-parse`, mdast walk, no sanitizer for strict CommonMark). Read in full.
- **`.planning/research/FEATURES.md` §Feature Area 3 — Personal Library** (L138-199) — the calm-library positioning + table-stakes/differentiator split. Read in full.
- **`.planning/research/PITFALLS.md` Pitfalls 2, 4, 9** — the substrate-protection pitfalls Phase 8 inherits.
- **`.planning/research/STACK.md`** — the v2.0 locked stack (names `unified@11.0.5` + `remark-parse@11.0.0` as SOTA).

### Secondary (MEDIUM confidence — verified against authoritative sources)

- `npm view` for `unified`, `remark-parse`, `remark-frontmatter`, `yaml` (versions + publish dates confirmed 2026-08-12).
- `gsd-tools query package-legitimacy check --ecosystem npm` for the four packages + the deprecated `mdast` + transitive `micromark` / `mdast-util-from-markdown` — all OK except `mdast` (deprecated).
- `github.com/remarkjs/remark/tree/main/packages/remark-parse` (official readme) — confirms CommonMark-by-default + ESM-only + `remark-frontmatter` plugin composition.
- `github.com/syntax-tree/mdast` — the authoritative mdast node-types reference.

### Tertiary (LOW confidence — none)

No LOW-confidence sources used. Every claim is VERIFIED (via npm registry + gsd-tools legitimacy gate + repo source) or CITED (from official docs or repo artifacts).

## Metadata

**Confidence breakdown:**

- Standard stack: **HIGH** — verified via `gsd-tools query package-legitimacy` + `npm view` + the official remark-parse readme. Package names sourced from the project's own `.planning/research/STACK.md` (not WebSearch or training data).
- Architecture: **HIGH** — every seam (compositeLibraryRepository, DexieLibrarySource.remove, IngestControl state machine, ProgressHairline, locationStore, hash router) is read in source. The Phase 8 design is composition over shipped substrate.
- Pitfalls: **HIGH** — Pitfalls 2, 4, 9 carried verbatim from the project's `.planning/research/PITFALLS.md`; Phase 8-specific pitfalls (8-1..8-6) derived from the substrate's actual shape.
- Tag persistence shape: **MEDIUM** — denormalized is the recommendation; the planner may pick a separate store. Tradeoffs documented.

**Research date:** 2026-08-12
**Valid until:** 2026-09-12 (30 days; the underlying stack is stable unified/remark with no breaking releases expected)
