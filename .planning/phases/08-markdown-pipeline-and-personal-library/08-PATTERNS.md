# Phase 8: Markdown Pipeline and Personal Library - Pattern Map

**Mapped:** 2026-08-12
**Files analyzed:** 22 (10 new, 12 modified)
**Analogs found:** 22 / 22 (every file has a concrete in-repo blueprint — Phase 8 is composition over shipped substrate)

## File Classification

### New Files

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `server/markdownToBlocks.ts` | service (server adapter) | transform (string → Block tree) | `server/htmlToBlocks.ts` | **exact** (sibling — same output shape, same contract) |
| `src/ingestion/library/LibraryView.tsx` | route component | request-response (reads repository, renders list) | `src/routes/FixtureList.tsx` | **exact** (replaces it at `#/`) |
| `src/ingestion/library/LibraryRow.tsx` | presentational component | render (pure props → JSX) | `FixtureList.tsx` `<li>` block (L63-76) + `ProgressHairline.tsx` | **role-match** (row is a superset) |
| `src/ingestion/library/ContinueReadingStrip.tsx` | presentational component | render (subset of list) | `FixtureList.tsx` `<ul>` block (L63-76) | **role-match** |
| `src/ingestion/library/TagFilter.tsx` | presentational component | render (chips from derived list) | `src/ingestion/IngestControl.tsx` form pattern | **role-match** (form/button rendering) |
| `src/ingestion/library/LibrarySearch.tsx` | form component | request-response (input → filter) | `IngestControl.tsx` URL form (L143-159) | **exact** (text input + onSubmit) |
| `src/ingestion/library/libraryFilter.ts` | utility (pure) | transform (filter + sort) | — none — | **no analog** (pure helper; contract in RESEARCH Ex 5) |
| `src/ingestion/library/tagsStore.ts` | store | CRUD (Dexie read/write) | `src/persistence/locationStore.ts` + `DexieLibrarySource` (LibrarySource.ts) | **role-match** (Zod-validated read + Dexie write) |
| `src/reader/TagEntry.tsx` | form component | CRUD (tag edit in reader chrome) | `src/ingestion/IngestControl.tsx` (state machine + `.status` region) | **role-match** (small form + write-through) |
| `src/ingestion/library/RemoveConfirm.tsx` | dialog component | request-response (confirm → destructive) | `src/reader/WipeConfirm.tsx` | **exact** (destructive `<dialog>` + `showModal` + focus management) |

### Modified Files

| Modified File | Role | Data Flow | Closest Analog (the file itself) | Match Quality |
|---------------|------|-----------|----------------------------------|---------------|
| `src/content/schema.ts` | config (Zod schema) | — | itself — additive enum widening | **exact** |
| `src/ingestion/IngestControl.tsx` | form component | request-response | itself — add third form mirroring first two | **exact** |
| `src/ingestion/IngestionClient.ts` | service (client wrapper) | request-response | itself — add `ingestMarkdown` mirroring `ingestHtml` | **exact** |
| `src/ingestion/LibrarySource.ts` | store | CRUD | itself — add tag read/write methods | **exact** |
| `src/ingestion/types.ts` | config (Zod schema) | — | itself — widen `IngestionRequestSchema` union | **exact** |
| `src/reader/ArticleView.tsx` | route component | render + event-driven | itself — mount `<TagEntry>` sibling of `<header>` (L1159) | **exact** |
| `src/persistence/db.ts` | config (Dexie schema) | — | itself — append `version(4)` | **exact** |
| `src/persistence/locationStore.ts` | store | CRUD | itself — add `loadAllLocations` | **exact** |
| `src/App.tsx` | route shell | render | itself — one-line list-view swap (L22 import, L192 JSX) | **exact** |
| `server/ingest.ts` | service (orchestrator) | transform (7-stage pipeline) | itself — add `markdown` branch (L140-152 dispatch) | **exact** |
| `src/routes/FixtureList.tsx` | route component | — | removed/renamed (or kept as legacy; planner decides) | n/a |
| `tests/e2e/ingestion/dexie-migration.spec.ts` | test | e2e | itself — extend with `version(4)` assertion | **exact** |

### New Test Files

| New Test File | Type | Analog | Match Quality |
|---------------|------|--------|---------------|
| `tests/unit/server/markdown-to-blocks.spec.ts` | unit | `tests/unit/server/extraction.spec.ts` + `tests/unit/server/mxss.spec.ts` | **exact** (same adapter test shape) |
| `tests/unit/ingestion-tags.test.ts` | unit | `tests/unit/ingestion-client.test.ts` | **exact** (fake-indexeddb + Dexie pattern) |
| `tests/unit/library-search.test.ts` | unit | `tests/unit/ingestion-client.test.ts` | **role-match** (pure helper + sample articles) |
| `tests/e2e/library/browse-open.spec.ts` | e2e | `tests/e2e/open-every-fixture.spec.ts` + `tests/e2e/ingestion/happy-path.spec.ts` | **exact** (paste path + per-row assertions) |
| `tests/e2e/library/remove-cascade.spec.ts` | e2e | `tests/e2e/ingestion/happy-path.spec.ts` (IndexedDB wipe + assert) | **role-match** |
| `tests/e2e/library/search-tag-filter.spec.ts` | e2e | `tests/e2e/ingestion/happy-path.spec.ts` | **role-match** |
| `tests/e2e/library/markdown-upload.spec.ts` | e2e | `tests/e2e/ingestion/happy-path.spec.ts` (paste path) | **exact** (upload form → middleware → ArticleView) |
| `tests/e2e/library/progress-recent.spec.ts` | e2e | `tests/e2e/persistence.spec.ts` (location seed + assert) | **role-match** |
| `tests/e2e/library/v1-regression.spec.ts` | e2e | `tests/e2e/open-every-fixture.spec.ts` | **exact** (SC#1 regression bar) |

---

## Pattern Assignments

### `server/markdownToBlocks.ts` (service, transform)

**Analog:** `server/htmlToBlocks.ts` (the locked sibling — RESEARCH §Pattern 1)

This is the **most load-bearing new file** in Phase 8. The contract is locked: return the EXACT same `{ blocks, footnotes, lang, provenancePartial, isReaderable }` shape so the orchestrator (`server/ingest.ts`) treats both adapters identically downstream.

**Imports pattern** — copy verbatim from `server/htmlToBlocks.ts` L28-31, then add the unified collective:
```typescript
// server/htmlToBlocks.ts L28-31 (existing sibling imports — same convention)
import type { Block, InlineRun } from "../src/content/schema";

// server/markdownToBlocks.ts ADDS (server-only — never client-bundled, Pitfall 8-6):
import { unified } from "unified";
import remarkParse from "remark-parse";        // strict CommonMark (raw HTML escaped by default)
import remarkFrontmatter from "remark-frontmatter"; // emits mdast `yaml` node
import { parse as parseYaml } from "yaml";      // strict YAML 1.2 (safe-schema)
```

**Output shape** — copy `HtmlToBlocksResult` from `server/htmlToBlocks.ts` L252-258 + the `ExtractAndNormalizeResult` extension at L462-464:
```typescript
// server/htmlToBlocks.ts L252-258 — the shape the orchestrator consumes
export interface HtmlToBlocksResult {
  blocks: Block[];
  footnotes: { id: string; content: InlineRun[] }[];
  lang: string;
  provenancePartial: ProvenancePartial;
}
// server/htmlToBlocks.ts L462-464 — the isReaderable addition the orchestrator destructures
export interface ExtractAndNormalizeResult extends HtmlToBlocksResult {
  isReaderable: boolean;
}
```
The markdown adapter should export an identical `MarkdownToBlocksResult` interface (RESEARCH.md L337-343).

**Inline-run extraction (D-04 marks — exactly link/code/strong/em)** — `markdownToBlocks` MUST reuse the SAME logic shape as `server/htmlToBlocks.ts` L121-181 (`extractInline` + `tidyRuns`). This is Pitfall 2 / Pitfall 8-1 territory: whitespace drift between adapters silently fails `assertRoundTripAnchor`. RESEARCH.md §Pattern 1 recommends extracting a shared `inlineRunsFromMdast` / `inlineRunsFromDom` pair — the planner should prefer that over copy-forking.
```typescript
// server/htmlToBlocks.ts L121-156 — the inline-run accumulator markdownToBlocks must mirror
function extractInline(node: Node, marks: Mark[]): InlineRunT[] {
  const runs: InlineRunT[] = [];
  for (const child of Array.from(node.childNodes ?? [])) {
    if (isText(child)) {
      const text = (child.textContent ?? "").replace(/\s+/g, " "); // whitespace collapse — Pitfall 8-1
      if (text.trim().length > 0) runs.push({ text, marks });
      else if (text.length > 0) runs.push({ text: " ", marks });
    } else if (isEl(child)) {
      const tag = child.tagName.toLowerCase();
      // ... D-04 marks: link (http(s)/mailto only — L141), code, strong, em
    }
  }
  return runs;
}

// server/htmlToBlocks.ts L159-181 — tidyRuns (drop leading/trailing ws, merge adjacent)
function tidyRuns(runs: InlineRunT[]): InlineRun[] { /* ... */ }
```
For mdast, the analog walk recurses `.children` instead of `.childNodes`, and node types are `text` / `link` / `code` (inline) / `strong` / `emphasis` — see RESEARCH §Pattern 1 mapping table.

**Exhaustive block-kind switch (Pattern F — no `default` clause)** — copy the structure of `server/htmlToBlocks.ts` `visit()` L272-366. The mdast walker maps each node type per RESEARCH §Pattern 1 L298-317; anything unmappable (`table`, `math`, `toml`) → `UnsupportedBlock` with a `plainDescription` (DOC-06).
```typescript
// server/htmlToBlocks.ts L272-366 — the exhaustive-switch structure to mirror
function visit(el: Element, footnoteCounter: { n: number }): Block[] {
  const tag = el.tagName.toLowerCase();
  // exhaustive if-chain: heading → paragraph → blockquote → list → figure → pre → hr → unsupported
  // NO `default:` clause — the unsupported branch IS the catch-all (Pattern F)
  // ...
  return [{ kind: "unsupported", originalKind: tag,
            plainDescription: `A ${tag} element from the original article that the reader could not render.` }];
}
```

**Footnote id allocation** — if `remark-gfm` (footnotes) is enabled, the mdast `footnoteDefinition` → `FootnoteBody` mapping MUST sanitize non-numeric identifiers via a monotonic counter so the result matches the `/^fn-\d+$/` regex locked at `src/content/schema.ts` L115 + L171. Mirror `server/htmlToBlocks.ts` L290-296 + L395-415 (the `footnoteCounter` + `extractFootnoteBodies` pattern).

**YAML front-matter → ProvenancePartial** — the mdast `yaml` node's `.value` string is parsed via `parseYaml(node.value)` and merged into `ProvenancePartial` per D8-17. Shape mirrors `server/htmlToBlocks.ts` `buildProvenance()` L432-453 (only `title` / `author` / `publishedAt` carried; everything else dropped).

**Raw-HTML escape (Pitfall 8-2 — security boundary)** — strict CommonMark emits mdast `html` nodes whose `.value` is the literal HTML string. The walker MUST map these to a `ParagraphBlock` whose inline text is the escaped string — NEVER carry the raw value as structured payload. Add a unit test mirroring `tests/unit/server/mxss.spec.ts` (the existing mXSS gate).

---

### `src/ingestion/library/LibraryView.tsx` (route component, request-response)

**Analog:** `src/routes/FixtureList.tsx` (the file it replaces at the `#/` default route)

`LibraryView` is a SUPERSET of `FixtureList`: same `<main id="main">` shell, same `<h1>Saved articles</h1>` heading (Pitfall 8-5 — keep the heading stable or change atomically with the test), same `.status` live region, same `<ul>` of articles. It adds the Continue-reading strip, tag chips, search box, source badges, per-row hairline, and Add control.

**Copy the entire structure of `src/routes/FixtureList.tsx` L13-78** and extend. Critical excerpts:

**Imports + loading state (copy L8-32):**
```typescript
// src/routes/FixtureList.tsx L8-32 — copy verbatim, swap component name
import { useEffect, useState } from "react";
import { listArticles } from "../content/repository";   // compositeLibraryRepository wrapper
import type { CanonicalArticle } from "../content/types";
import { IngestControl } from "../ingestion/IngestControl";

export function LibraryView() {  // was: FixtureList
  const [items, setItems] = useState<CanonicalArticle[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    listArticles()
      .then((articles) => { if (cancelled) return; setItems(articles); setStatus("ready"); })
      .catch(() => { if (cancelled) return; setStatus("error"); });
    return () => { cancelled = true; };
  }, []);
  // ...
}
```

**Calm empty state (D8-04 — copy FixtureList L54-62 voice):**
```tsx
// src/routes/FixtureList.tsx L54-62 — the existing empty-state shape; rephrase per D8-04
{items.length === 0 && status === "ready" ? (
  <>
    <h2>Your library is empty</h2>  {/* D8-04 copy */}
    <p>Paste a URL or upload a file to begin.</p>
  </>
) : ( /* list */ )}
```

**List row structure (Pitfall 8-5 — keep `<ul><li><a href="#/article/<id>">` stable):**
```tsx
// src/routes/FixtureList.tsx L63-76 — the row markup v1.0 tests assert against
<ul className="fixture-list">  {/* keep className stable OR rename atomically across tests */}
  {items.map((a) => (
    <li key={a.id}>
      <article>
        <h2 id={`title-${a.id}`}>{a.provenance.title}</h2>
        {a.provenance.author && <p className="meta">{a.provenance.author}</p>}
        <a href={`#/article/${a.id}`} aria-labelledby={`title-${a.id}`}>Open article</a>
      </article>
    </li>
  ))}
</ul>
```
`LibraryRow.tsx` is the extracted row component — adds source badge, hairline, optional tag chips as SIBLINGS inside the `<li>` (not structural changes). See `tests/e2e/open-every-fixture.spec.ts` L65-69 for the exact row-count assertion.

**Status live region (copy FixtureList L45-53):**
```tsx
// src/routes/FixtureList.tsx L45-53 — the .status aria-live region pattern
<div className="status" role="status" aria-live="polite" aria-atomic="true">
  {status === "loading" && <p>Opening article…</p>}
  {status === "error" && (
    <>
      <h2>Couldn't open this article.</h2>
      <p>The article could not be loaded. ...</p>
    </>
  )}
</div>
```

---

### `src/ingestion/library/LibraryRow.tsx` (presentational component, render)

**Analog:** `FixtureList.tsx` `<li>` block (L63-76) + `ProgressHairline.tsx`

Per-row composition: title + author + source badge + optional progress hairline + optional tag chips (D8-01 — tags on row ONLY when present). RESEARCH.md §Pattern 4 L473-494 has the skeleton.

**ProgressHairline reuse (D8-11):**
```typescript
// src/reader/ProgressHairline.tsx L24-41 + L43-65 — takes `progress` in [0,1], renders via scaleX
interface ProgressHairlineProps {
  progress?: number;                                  // ratio in [0,1]
  page?: { current: number; total: number };          // paginated override (not used on row)
}
// LibraryRow computes ratio = Math.min(1, location.graphemeOffset / total) per RESEARCH L482
// and renders <ProgressHairline progress={ratio} /> when ratio > 0.
```
The hairline component is consumed UNCHANGED — do not fork it.

---

### `src/ingestion/library/ContinueReadingStrip.tsx` (presentational component, render)

**Analog:** `FixtureList.tsx` `<ul>` block (subset of the same row pattern)

RESEARCH §Pattern 4 L451-466 has the loader skeleton. Derives from `locationStore` — calls a NEW `loadAllLocations()` (see `locationStore.ts` edit below), filters by `progress < FINISHED_THRESHOLD` (recommend 0.98 — RESEARCH L498), sorts by `savedAt` descending, slices to cap (default 3 — D8-09). Renders the same row component (or a stripped variant) — keep it visually distinct from the main list per D8-09.

---

### `src/ingestion/library/TagFilter.tsx` (presentational component, render)

**Analog:** `IngestControl.tsx` form rendering pattern (button-style chips)

Auto-pruned tag chips. The tag list comes from `tagsStore.loadAllTags()` (RESEARCH §Pattern 2 L408-414 — `Array.from(new Set(articles.flatMap(a => a.tags ?? [])))` on every library render). Clicking a chip sets `activeTag`; clicking again clears. Single-tag, AND-style within a tag (D8-07). Render shape mirrors IngestControl's button-disabled state discipline.

---

### `src/ingestion/library/LibrarySearch.tsx` (form component, request-response)

**Analog:** `IngestControl.tsx` URL form (L143-159) — exact structural match

Controlled text input + onSubmit. Lifts `query` state to `LibraryView` (or local + `onChange` callback — planner). Filter logic lives in `libraryFilter.ts` (pure). Search includes title + author + sourceUrl-domain + tag names (D8-06).

**Form pattern to copy:**
```tsx
// src/ingestion/IngestControl.tsx L143-159 — controlled input + submit
<form onSubmit={handleSearchSubmit}>
  <label htmlFor="library-search">Search your library</label>
  <input
    id="library-search"
    name="query"
    type="search"
    autoComplete="off"
    value={query}
    onChange={(e) => setQuery(e.target.value)}
  />
</form>
```

---

### `src/ingestion/library/tagsStore.ts` (store, CRUD)

**Analog:** `src/persistence/locationStore.ts` (Zod-validated read pattern) + `DexieLibrarySource` write methods

Read pattern mirrors `locationStore.ts` L63-88 (safeParse on read; corrupt rows dropped) and `DexieLibrarySource.list()` L53-64 (STATE-04 — Zod-at-boundary on read). Write pattern mirrors `DexieLibrarySource.save()` L82-84 (`db.articles.put`).

**Read-all pattern (from `LibrarySource.ts` L53-64):**
```typescript
// src/ingestion/LibrarySource.ts L53-64 — the Zod-validated read pattern tagsStore mirrors
async list(): Promise<CanonicalArticle[]> {
  const rows = await db.articles.toArray();
  const valid: CanonicalArticle[] = [];
  for (const row of rows) {
    const parsed = ArticleSchema.safeParse(row);
    if (parsed.success) valid.push(parsed.data);
    // else: drop the corrupt row silently — STATE-04 says never coerce.
  }
  return valid;
}
```

**RESEARCH.md §Pattern 2 L408-421 skeleton** — `loadAllTags()` derives the set on read (no cleanup write); `setArticleTags(id, tags)` writes via `db.articles.update`. Auto-prune is implicit: a tag no longer present on any article falls out of the Set on next `loadAllTags()`.

---

### `src/ingestion/library/libraryFilter.ts` (utility, transform)

**No analog** — pure function. The contract is fully specified in RESEARCH.md §Code Examples Example 5 L798-836. Planner should copy that skeleton verbatim and add a `domainOf(url)` helper (URL → hostname; defensive try/catch).

---

### `src/reader/TagEntry.tsx` (form component, CRUD)

**Analog:** `src/ingestion/IngestControl.tsx` (form + state machine + write-through)

Small tag-edit surface mounted in `ArticleView` reader chrome (D8-05 — tags are edited WHILE reading, not while browsing). Mirrors IngestControl's controlled-input + write-through pattern; writes via `tagsStore.setArticleTags(articleId, tags)`.

**State machine + `.status` region** — copy IngestControl L34, L177-190 (the live region is the load-bearing a11y surface — A1Y-08). Tag errors (Dexie write failure) route to the same calm voice; never leak jargon.

---

### `src/ingestion/library/RemoveConfirm.tsx` (dialog component, request-response)

**Analog:** `src/reader/WipeConfirm.tsx` (EXACT — destructive `<dialog>` + `showModal` + focus management)

The closest structural match in the codebase. Copy WipeConfirm verbatim and swap the destructive action: instead of `db.delete()`, call `dexieLibrarySource.remove(id)` (the existing cascade — LibrarySource.ts L108-151). Pitfall 8 spirit: the ONLY path that calls `remove(id)` is the destructive button's `onClick`.

**showModal + focus-restore discipline (copy WipeConfirm L42-83):**
```typescript
// src/reader/WipeConfirm.tsx L42-83 — the dialog open/close + focus-restore pattern
const ref = useRef<HTMLDialogElement>(null);
const triggerRef = useRef<HTMLElement | null>(null);

useEffect(() => {
  const dlg = ref.current;
  if (!dlg) return;
  if (open && !dlg.open) {
    triggerRef.current = document.activeElement as HTMLElement | null;
    dlg.showModal(); // browser: focus→first focusable, trap, inert backdrop, Esc closes
    // Cross-engine: explicitly focus [data-initial-focus] (Pitfall 1 — WebKit quirk)
    const initial = dlg.querySelector<HTMLElement>("[data-initial-focus]") ?? dlg;
    initial.focus();
  } else if (!open && dlg.open) {
    dlg.close();
  }
}, [open]);

useEffect(() => {
  const dlg = ref.current;
  if (!dlg) return;
  const handleClose = () => { triggerRef.current?.focus(); };
  dlg.addEventListener("close", handleClose);
  return () => dlg.removeEventListener("close", handleClose);
}, []);
```

**Destructive onClick (Pitfall 8 — copy WipeConfirm L91-102):**
```typescript
// src/reader/WipeConfirm.tsx L91-102 — the LOAD-BEARING handler pattern
const onDestructiveClick = async () => {
  try {
    await dexieLibrarySource.remove(id);  // was: db.delete() — the existing cascade (LibrarySource L108-151)
  } catch { /* defensive — reset local state on failure */ }
  onConfirm();  // parent navigates to #/ + refreshes list
};
```

**Cancel button carries `[data-initial-focus]`** (WipeConfirm L139) — focus lands on the non-destructive button on open, NOT the destructive one. Safer default.

**Voice (D7-04 — calm DOC-06):** planner authors; should NOT leak jargon ("Dexie", "transaction", "cascade"). Recommended shape per RESEARCH §Pattern 3 L441: *"Remove this article? Your highlights and notes for it will also be removed."*

---

### `tests/unit/server/markdown-to-blocks.spec.ts` (unit test)

**Analog:** `tests/unit/server/extraction.spec.ts` (the htmlToBlocks test) + `tests/unit/server/mxss.spec.ts` (the mXSS gate)

Copy the structure of `extraction.spec.ts` header (L1-30): the `SCHEMA_KINDS` constant asserting every output block has a kind in the 9-kind tuple. Add the raw-HTML-escape test from Pitfall 8-2 (a `.md` with `<script>alert(1)</script>` produces zero `<script>` in the rendered DOM). Add the round-trip gate test from Pitfall 8-1 (a representative markdown corpus fixture passes `assertRoundTripAnchor` — RESEARCH §Validation L927).

---

### `tests/unit/ingestion-tags.test.ts` + `tests/unit/library-search.test.ts` (unit tests)

**Analog:** `tests/unit/ingestion-client.test.ts` (the fake-indexeddb + Dexie pattern)

Copy `tests/unit/ingestion-client.test.ts` L14-90 verbatim — the Dexie.dependencies install + wipeDatabase + lazy-import + sampleArticle builder. The tag tests add a `sampleArticle({ tags: [...] })` override (once the schema is widened — see schema.ts edit below). The search tests import `libraryFilter.filterLibrary` as a pure function (no Dexie needed).

---

### `tests/e2e/library/*.spec.ts` (e2e tests)

**Analog:** `tests/e2e/ingestion/happy-path.spec.ts` (paste path → real middleware → ArticleView) + `tests/e2e/ingestion/dexie-migration.spec.ts` (seed → assert)

Copy `happy-path.spec.ts` L37 BASE constant, L67-84 beforeEach (image stub + IndexedDB wipe), and L86-119 test structure (fill textarea → click → `waitForURL` → assert heading + paragraph counts). The markdown-upload variant substitutes a file input for the textarea. The remove-cascade variant seeds a highlight + note, removes the article, and asserts both are gone (mirroring `dexie-migration.spec.ts` L374-411 readRow/countRows helpers).

**Pitfall 8-5 (v1-regression):** `tests/e2e/library/v1-regression.spec.ts` should re-run every assertion from `tests/e2e/open-every-fixture.spec.ts` against the new LibraryView surface — keep the `<h1>Saved articles</h1>` heading stable (happy-path L93, L144 + dexie-migration L300, L356) OR update all assertions atomically in one commit.

---

## Modified-File Patterns (additive edits)

### `src/content/schema.ts` — widen enum + add `tags` field

**Pattern:** additive schema evolution (Pitfall 9 — `.optional()`/`.default()` migration mechanism, mirrored at L233-237 + L280).

```typescript
// src/content/schema.ts L207 — current shape; widen per RESEARCH §Code Examples Ex 2 L668-674
export const ArticleSourceSchema = z.enum([
  "fixture", "url", "paste",
  "markdown",     // NEW — Phase 8 ING-03
  "html-upload",  // NEW — Phase 8 D8-15
]);

// L217 — widen origin discriminator symmetrically
origin: z.enum(["url", "paste", "upload"]).optional(),  // "upload" covers markdown + html-upload

// L226-236 — add tags field (denormalized per RESEARCH §Pattern 2)
// ArticleSchema gains:
tags: z.array(z.string().min(1)).default([]).optional(),  // additive; v3 rows hydrate []
```
The schema comment at L205-207 explicitly anticipates this widening.

---

### `src/ingestion/IngestControl.tsx` — add file-upload form

**Pattern:** add a third form mirroring the existing two (L143-175). The handleSubmit dispatcher (L90-123) gains a `"file"` branch that reads the file via `file.text()`, dispatches by extension (`.md` → `ingestMarkdown`, else → `ingestHtml`), and reuses the existing D7-07 dedupe-refuse check (L102-107) + the calm-error catch (L113-122). RESEARCH §Code Examples Ex 4 L738-796 has the skeleton.

---

### `src/ingestion/IngestionClient.ts` — add `ingestMarkdown` / `ingestHtmlUpload`

**Pattern:** copy `ingestHtml()` L75-77 verbatim — one-liner delegating to the private `ingest()` L90-124. The body widens to `{ markdown: string } | { html: string }`; the private `ingest()` signature widens symmetrically. STATE-04 defense-in-depth (ArticleSchema.parse on the response — L122) applies unchanged.

```typescript
// src/ingestion/IngestionClient.ts L75-77 — the pattern to clone
export async function ingestHtml(html: string): Promise<IngestionSuccess> {
  return ingest({ html });
}
// Phase 8 ADD:
export async function ingestMarkdown(markdown: string): Promise<IngestionSuccess> {
  return ingest({ markdown });
}
```

---

### `src/ingestion/LibrarySource.ts` — add tag read/write surface

**Pattern:** add tag methods to `DexieLibrarySource` (or new `tagsStore.ts` — RESEARCH left this planner-discretion). The `list()` method (L53-64) already returns full article rows; tags ride on the row via the new `tags` field. Write mirrors `save()` L82-84.

---

### `src/ingestion/types.ts` — widen `IngestionRequestSchema`

**Pattern:** additive union widening (RESEARCH §Code Examples Ex 1 L645-660). Add `z.object({ markdown: z.string().min(1) })` to the existing union at L19-22. The `.html` upload reuses the existing `{html}` variant — server-side the origin tag distinguishes them.

---

### `src/reader/ArticleView.tsx` — mount `<TagEntry>`

**Pattern:** add a sibling element inside `<header>` (currently L1159-1174). Mount TagEntry as **inert until activated** (Pitfall 8-5 warning sign — focus must not shift to the tag input on mount or v1.0 e2e tests regress). Pass `articleId` + initial `tags` as props.

```tsx
// src/routes/ArticleView.tsx L1159-1174 — the <header> region where TagEntry mounts
<header>
  <h1>{article.provenance.title}</h1>
  {/* ...existing meta + source link... */}
  <TagEntry articleId={article.id} tags={article.tags ?? []} />  {/* NEW sibling */}
</header>
```

---

### `src/persistence/db.ts` — append `version(4)`

**Pattern:** Pitfall 9 APPEND-only (mirrors the v2 block at L112-116 + the v3 block at L131-137). NEVER edit v1/v2/v3 declarations.

```typescript
// src/persistence/db.ts L131-137 — the v3 append pattern to clone for v4
this.version(4).stores({
  articles: "id, revision, source, addedAt, *tags",  // *tags = multi-entry index (RESEARCH §Pattern 2 L393)
  settings: "key",
  location: "[articleId+revision]",
  highlights: "id, [articleId+revision]",
  notes: "id, highlightId",
});
// NO .upgrade() callback — additive index only; Dexie re-indexes on next open.
```
Also widen the `articles` Table type annotation at L68-78 to include `tags?: string[]`.

---

### `src/persistence/locationStore.ts` — add `loadAllLocations()`

**Pattern:** mirror the existing `loadLocation()` L63-88 read pattern (Zod safeParse on every row; STATE-04). RESEARCH §Pattern 4 L469 + Assumption A5 confirm this is implementable as `db.location.toArray()` + per-row validate.

```typescript
// Add (mirror locationStore.ts L63-88 discipline):
export async function loadAllLocations(): Promise<LocationRecord[]> {
  const rows = await db.location.toArray();
  const valid: LocationRecord[] = [];
  for (const row of rows) {
    const parsed = LocationRecordSchema.safeParse(row);
    if (parsed.success) valid.push(parsed.data);
  }
  return valid;
}
```

---

### `src/App.tsx` — one-line list-view swap

**Pattern:** RESEARCH §Pattern 5 L506-517. Swap the import at L22 + the JSX at L192. Everything else (parseHash, hashchange listener, Gap 3 fragment guard L145-149, View type L31) stays byte-unchanged.

```typescript
// src/App.tsx L22 — swap
- import { FixtureList } from "./routes/FixtureList";
+ import { LibraryView } from "./ingestion/library/LibraryView";

// src/App.tsx L191-192 — swap
{view.name === "list" ? (
  <LibraryView />  // was: <FixtureList />
) : ( /* ... */ )}
```

---

### `server/ingest.ts` — add markdown dispatch branch

**Pattern:** extend the input-source-agnostic dispatch at L127-152. RESEARCH §Code Examples Ex 3 L683-731 has the full skeleton. The `shortHash` helper at L91-93 is reused verbatim for `md-${shortHash(md)}` (D8-18).

```typescript
// server/ingest.ts L91-93 — shortHash is reused for the markdown id
function shortHash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 12);
}
// L177 — the id-derivation pattern to clone for markdown
const id = finalUrl ? slugifyUrl(finalUrl) : `paste-${shortHash(html)}`;
// Phase 8 markdown branch: id = `md-${shortHash(md)}`
```

The input-validation guard at L127-131 widens from `hasUrl === hasHtml` to a three-way check (exactly one of url/html/markdown). The catch at L250-260 (T-7-23 — every throw becomes a typed reason) applies unchanged to markdown failures.

---

### `tests/e2e/ingestion/dexie-migration.spec.ts` — extend with v4 assertion

**Pattern:** mirror the existing v3 assertion block at L336-421. Add a v4 seed + open + assert cycle: seed a v3 row WITHOUT `tags`, open the app (triggering the v4 upgrade), assert the row survives and hydrates `tags: undefined` / `[]` on read (Pitfall 9 — additive index; no `.upgrade()` callback).

---

## Shared Patterns

### 1. Zod-at-boundary validation (STATE-04)

**Source:** `src/ingestion/LibrarySource.ts` L57-64 (read), `server/ingest.ts` L214 (server parse), `src/ingestion/IngestionClient.ts` L122 (client re-parse)
**Apply to:** `markdownToBlocks.ts` output, `tagsStore.ts` reads, `loadAllLocations()` reads, `libraryFilter.ts` (consumes already-validated articles).

```typescript
// The universal read pattern — never silently coerce a corrupt row
const parsed = Schema.safeParse(row);
if (parsed.success) valid.push(parsed.data);
// else: drop silently (STATE-04)
```

### 2. Calm DOC-06/PAGE-09 voice (D7-04)

**Source:** `src/ingestion/IngestControl.tsx` `mapReasonToCopy` L44-66
**Apply to:** ALL new copy — `LibraryView` empty state, `RemoveConfirm` body, `TagEntry` errors, upload refusals, "finished" indicator. Zero new disclosure vocabulary; zero internal jargon.

```typescript
// IngestControl.tsx L44-66 — the reason → calm-phrase map. Upload/tag errors reuse this surface.
function mapReasonToCopy(reason: IngestionFailureReason): string {
  switch (reason) {
    case "response-too-large": return "This page is too large.";
    case "already-in-library": return "Already in your library.";
    // ...
  }
}
```

### 3. `.status` live region (A1Y-08)

**Source:** `FixtureList.tsx` L45-53 + `IngestControl.tsx` L182-190
**Apply to:** `LibraryView` (loading/ready/error), `LibrarySearch` (no-results), `TagEntry` (write errors), upload form (submitting/refusal). `aria-live="polite"` + `aria-atomic="true"`.

### 4. Exhaustive block-kind switch (Pattern F — no `default`)

**Source:** `server/htmlToBlocks.ts` `visit()` L272-366
**Apply to:** `markdownToBlocks.ts` mdast walker. Anything unmappable → `UnsupportedBlock` with `plainDescription` (DOC-06). The catch-all IS the unsupported branch — there is no `default:` clause.

### 5. Pitfall 9 — Dexie version discipline (APPEND-only)

**Source:** `src/persistence/db.ts` L112-137 (v2 + v3 appends)
**Apply to:** the `version(4)` append. NEVER edit v1/v2/v3 declaration blocks. Additive indexes only; no `.upgrade()` callback. Existing rows hydrate `undefined`/`[]` via `.optional()`/`.default()`.

### 6. Four-state ingest form machine

**Source:** `src/ingestion/IngestControl.tsx` L34 + L90-123
**Apply to:** the file-upload form extension, `TagEntry`. State machine: `idle | submitting | success | error`. Every failure → typed reason → `mapReasonToCopy` → `.status` region.

### 7. Destructive-action confirmation (Pitfall 8)

**Source:** `src/reader/WipeConfirm.tsx` (entire file)
**Apply to:** `RemoveConfirm.tsx`. `<dialog>` + `showModal` (native focus-trap + inert backdrop + Esc). `[data-initial-focus]` on the NON-destructive button (safer default). Destructive call (`dexieLibrarySource.remove(id)`) fires ONLY in the destructive button's `onClick`.

### 8. Server/client boundary discipline (Pitfall 8-6)

**Source:** Phase 7's `/server` ↔ `/src` boundary (CONTEXT.md D7-05)
**Apply to:** `markdownToBlocks.ts` — `unified` / `remark-parse` / `remark-frontmatter` / `yaml` are SERVER-ONLY. Use `import type` ONLY if a client module needs a type from a server module. Verify via `npm run build` that the client bundle doesn't grow materially.

---

## No Analog Found

| File | Role | Data Flow | Reason | Planner Fallback |
|------|------|-----------|--------|------------------|
| `src/ingestion/library/libraryFilter.ts` | utility | transform (filter + sort) | Pure function; no existing in-repo filter helper. | Copy RESEARCH.md §Code Examples Example 5 L798-836 verbatim — it IS the spec. |

Every other file has a concrete in-repo analog. Phase 8 is composition over shipped substrate (RESEARCH.md §Don't Hand-Roll L535-549): `markdownToBlocks` mirrors `htmlToBlocks`, `LibraryView` mirrors `FixtureList`, `RemoveConfirm` mirrors `WipeConfirm`, tag tests mirror `ingestion-client.test.ts`, e2e tests mirror `happy-path.spec.ts`.

---

## Metadata

**Analog search scope:**
- `server/` (8 files — full scan)
- `src/ingestion/` (4 files — full scan)
- `src/routes/` (2 files — full scan)
- `src/reader/` (key components: ProgressHairline, WipeConfirm, ArticleView)
- `src/persistence/` (db.ts, locationStore.ts)
- `src/content/` (schema.ts, repository.ts)
- `tests/unit/` (ingestion-client.test.ts, server/extraction.spec.ts, server/mxss.spec.ts)
- `tests/e2e/ingestion/` (happy-path.spec.ts, dexie-migration.spec.ts)
- `tests/e2e/open-every-fixture.spec.ts`
- `src/App.tsx`

**Files scanned:** 22 source files + 5 test files (all read in full; no large-file targeting needed — every file is < 600 lines).

**Pattern extraction date:** 2026-08-12

**Key insight for planner:** Phase 8 is the lowest-risk phase in v2.0 because the substrate is shipped. The two genuinely new pieces (`markdownToBlocks.ts` + library UI) have exact in-repo blueprints. The planner's job is mostly composition: copy `htmlToBlocks.ts` for the adapter, copy `FixtureList.tsx` for the view, copy `WipeConfirm.tsx` for the remove confirmation, widen three enums additively, and append one Dexie version block. Pitfall 8-1 (round-trip drift) is the single highest-risk concern — the markdown adapter MUST reuse the same `extractInline` / `tidyRuns` shape the HTML adapter uses.
