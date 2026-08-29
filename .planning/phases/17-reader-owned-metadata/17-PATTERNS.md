# Phase 17: Reader-Owned Metadata - Pattern Map

**Mapped:** 2026-08-29
**Files analyzed:** 29 (2 new source + 13 modified source + 2 CSS/db support + 2 new tests + 10 extended tests)
**Analogs found:** 29 / 29 (26 exact/role-match, 3 partial — see No Analog Found)

Every file in this phase extends a shipped, test-proven contract. This is an
additive-extension phase: the two genuinely novel artifacts (`effectiveMetadata.ts`,
`EditMetadataDialog.tsx`) are structural clones of strong precedents, and every
modified file's insertion point is verified below with current line numbers.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/content/schema.ts` | model (Zod schema) | validation boundary | itself — `tags` field (L260-266) | exact (in-place extension) |
| `src/ingestion/library/effectiveMetadata.ts` **(NEW)** | utility (pure policy module) | transform | `src/ingestion/library/readingState.ts` | exact |
| `src/ingestion/library/EditMetadataDialog.tsx` **(NEW)** | component (native dialog) | CRUD (single Dexie put) | `src/ingestion/library/RemoveConfirm.tsx` + `src/ingestion/AddDialog.tsx` | exact (structural clone) |
| `src/ingestion/library/LibraryRow.tsx` | component (list row) | event-driven | itself — `onRemove` prop + TrashIcon (L124-171) | exact |
| `src/ingestion/library/LibraryView.tsx` | component (container) | event-driven (state + dialog) | itself — `removeTarget` wiring (L241-246, L694-705, L782-800) | exact |
| `src/ingestion/library/libraryFilter.ts` | utility (pure filter) | transform | itself — haystack (L86-97) | exact |
| `src/ingestion/library/ContinueReadingStrip.tsx` | component (strip) | request-response (read/render) | itself — article entry (L228-235) | exact |
| `src/routes/ArticleView.tsx` | component (route view) | request-response | itself — 4 consumer sites (L1283-1289, L1827, L1877-1883, L2050-2052) | exact |
| `src/routes/review/ReviewView.tsx` | component (route view) | request-response | itself — 3 sites (L341-343, L414-419, L461-467) | exact |
| `src/routes/review/reviewFilter.ts` | utility (pure sort) | transform | itself — article sort (L226-229) | exact |
| `src/portability/bundle.ts` | model (Zod envelope) | serialization | itself — `schemaVersion` union (L43) | exact |
| `src/portability/ExportImportService.ts` | service | file-I/O (zip) + transaction | itself — writer (L112-125) + peek (L238-244) | exact |
| `src/portability/conflicts.ts` | service (dry-run planner) | transform | itself — classification (L318-331) + plan (L529-556) | exact |
| `src/portability/markdown.ts` | utility (renderer) | transform | itself — citation/heading/sort (L139-146, L178, L204, L251-253) | exact |
| `src/reader/ImportPreviewDialog.tsx` | component (native dialog) | event-driven | itself — KIND_LABELS/select (L54-83, L210-237) | role-match (per-item UI is new shape) |
| `src/persistence/db.ts` | config (Dexie versions) | migration | itself — v2 no-op block (L123-127) / no-bump `ingestionMeta` precedent | exact |
| `src/app.css` | config (styles) | n/a | itself — `.library-row-remove` (L2093-2109) | exact |
| `tests/unit/library/effective-metadata.test.ts` **(NEW)** | test (unit) | pure assertion | `tests/unit/library/reading-state.test.ts` | exact |
| `tests/e2e/library/metadata-edit.spec.ts` **(NEW)** | test (e2e) | dialog flow | `tests/e2e/library/remove-cascade.spec.ts` + `tests/e2e/ingestion/dexie-migration.spec.ts` | exact |
| 8 extended unit tests + `dexie-migration.spec.ts`, `round-trip.spec.ts`, `import-preview.spec.ts` | test | extend in place | their own existing shapes | exact |

## Pattern Assignments

### `src/content/schema.ts` — add `readerTitle`/`readerAuthor` to ArticleSchema

**Analog:** the `tags` optional-field landing (L260-266) — the exact mechanism overrides replay.
Insert after `tags` (L266), before the closing `});` (L267):

```typescript
// CURRENT (L250-267) — the shape being extended:
export const ArticleSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),   // stable slug; never the source URL (D-06)
  revision: z.number().int().min(1),
  lang: z.string().min(2),
  provenance: Provenance,                  // title min(1) L185, author optional L186 — UNTOUCHED
  blocks: z.array(BlockSchema).min(1),
  footnotes: z.array(FootnoteBody).default([]),
  ingestionMeta: IngestionMetaSchema.optional(),   // L259 — optional hydration precedent #1
  tags: z.array(z.string().min(1)).default([]).optional(),  // L266 — precedent #2
});
```

New fields follow the `tags` comment discipline verbatim (phase-tagged comment
explaining the Pitfall 9 additive mechanism + D17-04 min(1) rationale):

```typescript
readerTitle: z.string().min(1).optional(),   // min(1): empty-string override unrepresentable (D17-04)
readerAuthor: z.string().min(1).optional(),
```

**CRITICAL — why NOT the `bookId` strip-mode precedent:** every Dexie read runs
`ArticleSchema.safeParse` and **Zod 4 strips unknown keys** (documented in-repo at
`ExportImportService.ts` L183-187). `db.ts` stores a top-level `bookId` (L82) that is
invisible to `CanonicalArticle` precisely because it is NOT in ArticleSchema. A
denormalized-only override column would never display or export. Schema declaration is
mandatory. Canonical `Provenance` (L177-191) stays byte-unchanged (META-01).

### `src/ingestion/library/effectiveMetadata.ts` (NEW) — the ONE derivation

**Analog:** `src/ingestion/library/readingState.ts` — D14-20 "ONE derivation owned by ONE
module", pure/zero-IO/zero-React. Copy its header-comment discipline (module banner
citing the decision + the policy edges + which consumers import it) and its
function-per-derivation shape:

```typescript
// readingState.ts L31-33 (the import discipline to mirror):
import type { Book, LocationRecord } from "../../content/schema";
// → effectiveMetadata imports ONLY: import type { CanonicalArticle } from "../../content/types";

// readingState.ts L52-59 (the derivation shape to mirror):
export function articleReadingState(
  location: LocationRecord | undefined,
  total: number,
): ReadingState {
  if (!location) return "unread";        // early-return edge discipline
  ...
}
```

Target module body (per RESEARCH Pattern 2, verified against readingState shape):

```typescript
export function effectiveTitle(article: CanonicalArticle): string {
  return article.readerTitle ?? article.provenance.title;
}
export function effectiveAuthor(article: CanonicalArticle): string | undefined {
  return article.readerAuthor ?? article.provenance.author;
}
```

Note the `?? undefined` semantics for absent author: every consumer's existing truthy
guard (`LibraryRow.tsx` L92, `ArticleView.tsx` L1877) already renders nothing when
undefined — META-03's absent-author restoration is free.

### `src/ingestion/library/EditMetadataDialog.tsx` (NEW) — structural clone dialog

**Primary analog:** `src/ingestion/library/RemoveConfirm.tsx` (the 4-shipped-dialog
grammar). **Secondary:** `src/ingestion/AddDialog.tsx` (labeled inputs, prevented-submit
forms, in-flight guard). Structural clone per Pitfall 8 — NO shared dialog abstraction.

**Dialog shell — clone RemoveConfirm L44-102 verbatim:**

```typescript
// L50-73: open↔showModal sync + focus capture + WebKit explicit focus
useEffect(() => {
  const dlg = ref.current;
  if (!dlg) return;
  if (open && !dlg.open) {
    triggerRef.current = document.activeElement as HTMLElement | null;
    dlg.showModal();
    const initial =
      dlg.querySelector<HTMLElement>("[data-initial-focus]") ?? /* fallback chain */ dlg;
    initial.focus();
  } else if (!open && dlg.open) {
    dlg.close();
  }
}, [open]);

// L77-85: close listener restores focus
const handleClose = () => { triggerRef.current?.focus(); };
dlg.addEventListener("close", handleClose);
```

**Esc/close-path hardening — clone AddDialog L171-196** (the `cancel`-preventDefault +
in-flight gate; the 09-05 wedge lesson). The edit dialog's Save put is fast but the
submittingRef mirror guard (AddDialog L110-116: `const submittingRef = useRef(false);
submittingRef.current = submitting;` rewritten every render) prevents double-submit
races:

```typescript
// AddDialog L178-189 — the cancel routing to clone:
const handleDialogCancel = (e: Event) => {
  e.preventDefault();                 // React open-prop mirror owns every close path
  if (submittingRef.current) return;  // no dismissal while the put is in flight
  onCancel();
};
```

**Form controls — clone AddDialog L446-462** (prevented-submit `<form onSubmit>` +
`<label htmlFor>` + controlled input + disabled-while-invalid submit):

```typescript
// AddDialog L446-462 (verbatim shape):
<form onSubmit={handleUrlSubmit} className="add-url-form">
  <label htmlFor="ingest-url">Add by URL</label>
  <input
    id="ingest-url" name="url" type="url" autoComplete="off"
    placeholder="https://example.com/article"
    value={urlValue} disabled={submitting}
    onChange={(e) => setUrlValue(e.target.value)}
  />
  <button type="submit" disabled={submitting || urlValue.length === 0}>Add</button>
</form>
```

NEVER `method="dialog"` forms (the 02-01 Chromium focus-trap lesson, AddDialog L387-390
comment). Placeholders carry canonical values: `placeholder={article.provenance.title}`
/ `placeholder={article.provenance.author ?? "No author"}` (D17-03 — display-only,
never persisted).

**The single write site (Pitfall 8) — mirror RemoveConfirm's onDestructiveClick
discipline (L87-102: the write fires ONLY in Save's onClick, never in a catch/effect):**

```typescript
const onSaveClick = async () => {
  const row = {
    ...article,  // provenance/id/revision/blocks UNTOUCHED (META-01)
    ...(titleValue.trim() ? { readerTitle: titleValue.trim() } : {}),   // absent key = cleared (META-03)
    ...(authorValue.trim() ? { readerAuthor: authorValue.trim() } : {}),
  };
  await db.articles.put(row);  // whole-row put: absent keys are DELETED from the row
  onSaved();
};
```

⚠️ The spread-omission idiom is load-bearing: `db.articles.put` replaces the whole
row, so omitting a key deletes it. NEVER write `readerAuthor: ""` — it fails `min(1)`
at the next `safeParse` and the ENTIRE row is silently dropped from the library
(`LibrarySource.list()` L56-62 drops corrupt rows — Pitfall 2 in RESEARCH).

**Dialog markup — clone RemoveConfirm L110-149** (`<dialog className role="alertdialog"
aria-labelledby aria-describedby>` + `.library-remove-confirm-inner/actions` structure +
`data-initial-focus` on Cancel).

### `src/ingestion/library/LibraryRow.tsx` — onEdit prop + EditIcon

**Analog:** the shipped `onRemove` optional prop (L50) + conditional button (L124-133) +
TrashIcon glyph (L146-171). The edit affordance is a third conditional sibling:

```typescript
// L50 (the optional-prop precedent):
onRemove?: () => void;
// → add: onEdit?: () => void;

// L124-133 (the conditional-button precedent — clone for edit):
{onRemove && (
  <button
    type="button"
    className="library-row-remove"
    aria-label={`Remove ${article.provenance.title} from library`}  // ← swap to effectiveTitle
    onClick={onRemove}
  >
    <TrashIcon aria-hidden="true" />
  </button>
)}
```

**EditIcon glyph — clone TrashIcon anatomy exactly (L146-171):** inline `<svg>` 20×20,
`viewBox="0 0 24 24"`, `fill="none" stroke="currentColor" strokeWidth="1.75"
strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false"`, pencil
paths. `aria-label` template names the action + **effective** title.

**Display swap (D17-09):** L90 `{article.provenance.title}` → `effectiveTitle(article)`;
L92-93 truthy-guarded author → `effectiveAuthor(article)` (keep the guard — absent
author still renders nothing).

### `src/ingestion/library/LibraryView.tsx` — editTarget state + dialog mount

**Analog:** the `removeTarget` wiring — state declaration (L241-246), row callback
(L699-704), dialog mount + confirm handler (L782-800):

```typescript
// L241-246 (state precedent):
const [removeTarget, setRemoveTarget] = useState<
  { id: string; title: string } | null  // → editTarget mirrors this shape
>(null);

// L699-704 (row callback precedent — add onEdit beside onRemove):
onRemove={() => setRemoveTarget({ id: a.id, title: a.provenance.title })}

// L786-799 (confirm handler precedent — clone for onSaved):
onConfirm={() => {
  const removedId = removeTarget?.id;
  setRemoveTarget(null);
  setRefreshKey((k) => k + 1);   // ← the refresh mechanism the edit dialog joins
  ...
}}
```

Mount `<EditMetadataDialog>` beside `<RemoveConfirm>` (L782) / `<AddDialog>` (L834):
`open={editTarget !== null}`, `onSaved={() => { setEditTarget(null); setRefreshKey((k) => k + 1); }}`
(the AddDialog `onBookAdded` precedent, L837). Gate `onEdit` to Dexie-persisted rows
only — predicate `article.ingestionMeta !== undefined` (the SourceBadge L57
`article.ingestionMeta?.source ?? "fixture"` inference; fixtures never carry it).
Book rows (L710-725) and chapter sub-rows get NO edit affordance (D17-05/D17-06).

### `src/ingestion/library/libraryFilter.ts` — haystack swap (D17-07)

**Analog:** itself — the D8-06 haystack at L87-97:

```typescript
// CURRENT (L87-97):
const haystack = [
  a.provenance.title,                        // ← effectiveTitle(a)
  a.provenance.author ?? "",                 // ← effectiveAuthor(a) ?? ""
  domainOf(a.provenance.sourceUrl),          // unchanged
  ...(a.tags ?? []),                         // unchanged
].join(" ").toLowerCase();
```

Swap the first two slots ONLY. `filterBooks` (L119-143) stays canonical (books keep
`book.title`/`book.authors` — D17-05).

### `src/routes/ArticleView.tsx` — 4 consumer sites

All verified this session; swap to `effectiveTitle(article)` / `effectiveAuthor(article)`:

| Site | Current code (verbatim) | Change |
|------|------------------------|--------|
| document.title standalone (L1289) | `setDocumentTitle(article.provenance.title);` | → `effectiveTitle(article)` |
| document.title chapter combo (L1283-1285) | `` `${article.provenance.title} — ${chapterContext.book.title}` `` | article half → effective; **book half stays canonical** (D14-07) |
| byline (L1877-1883) | `{(article.provenance.author \|\| article.provenance.publishedAt) && ... {article.provenance.author}` | author → `effectiveAuthor(article)`; keep the truthy guard + publishedAt logic |
| h1 (L2050-2052) | `<h1 ref={articleH1Ref} tabIndex={-1}>{article.provenance.title}</h1>` | → effectiveTitle; ref/tabIndex byte-stable |
| export filename (L1827) | `` `highlights-${sanitizeFilename(article.provenance.title, article.id)}.md` `` | → effectiveTitle (planner pins per OQ5; recommended effective) |

**Stay canonical:** chapter-nav neighbor titles (L1233-1243 `neighbor?.provenance.title`)
— neighbors may be chapters; never overridable this phase.

### `src/routes/review/ReviewView.tsx` + `src/routes/review/reviewFilter.ts`

**Analog:** themselves — three + one sites:

```typescript
// ReviewView L341-343 (options sort):
const articlesByTitle = [...articles].sort((a, b) =>
  a.provenance.title.localeCompare(b.provenance.title),  // → effectiveTitle
);
// ReviewView L415-419 (select options):
{articlesByTitle.map((a) => (
  <option key={a.id} value={a.id}>{a.provenance.title}</option>  // → effectiveTitle(a)
))}
// ReviewView L462-463 (section h2):
<h2>{section.article.provenance.title}...</h2>   // → effectiveTitle
// reviewFilter L227-229 (article sort key):
sections.sort((a, b) =>
  a.article.provenance.title.localeCompare(b.article.provenance.title),  // → effectiveTitle
);
```

### `src/ingestion/library/ContinueReadingStrip.tsx` — strip entry

**Analog:** itself — the article entry at L228-235:

```typescript
// CURRENT:
<a href={`#/article/${entry.article.id}`}>
  {entry.article.provenance.title}          // ← effectiveTitle
</a>
{entry.article.provenance.author && (       // ← effectiveAuthor (keep truthy guard)
  <p className="meta">{entry.article.provenance.author}</p>
)}
```

Book entries (L238-248, `entry.book.title`) stay canonical (D17-05).

### `src/portability/bundle.ts` — schemaVersion 1|2|3 union

**Analog:** itself — the 12-07 union at L43 (which itself replayed the
ReaderSettingsSchema precedent):

```typescript
// CURRENT (L40-55):
export const ExportBundleSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]),  // → add z.literal(3)
  ...
  articles: z.array(ArticleSchema),  // ← overrides ride AUTOMATICALLY once schema-declared (D17-12)
  books: z.array(BookSchema).optional(),
});
```

`BUNDLE_FILENAME` (L59) unchanged — the filename is not the version contract.
`manifest.ts` UNTOUCHED (it hashes the Zod-parsed block; new fields hash identically
on both sides).

### `src/portability/ExportImportService.ts` — writer emits 3 + peek > 3

**Analog:** itself — the 12-07 v2 bump replayed:

```typescript
// Writer, L112-115 CURRENT:
const bundle = ExportBundleSchema.parse({
  schemaVersion: 2 as const,   // → 3 as const (comment cites Phase 17)
  ...
});
// Peek, L238-244 CURRENT:
const peeked = (raw as { schemaVersion?: unknown }).schemaVersion;
if (typeof peeked === "number" && peeked > 2) {   // → > 3 (v4+ still calm-refuses)
  return { ok: false, refusal: { kind: "newer-schema-version", bundleVersion: peeked } };
}
```

`applyImport` article puts (L336-348) stay UNTOUCHED — merge happens in
resolveImportPlan before the transaction (the puts-only-closure rule, L305-313).

### `src/portability/conflicts.ts` — new conflict kind + merge-on-win

**Analog:** itself — classification (detectImportPreview) and plan (resolveImportPlan):

```typescript
// 1. ConflictKind (L51-57) — add the seventh kind:
| "article-metadata-override"   // same id, readerTitle/readerAuthor differ (incl. one-side-only)

// 2. Classification (L318-331 CURRENT — the branch to extend):
for (const a of bundle.articles) {
  const local = localArticleById.get(a.id);
  if (!local) { added.articles++; }
  else if (a.revision !== local.revision) { revisionConflicts.push(a.id); }
  else if (a.provenance.originalHtmlHash !== local.provenance.originalHtmlHash) {
    divergenceConflicts.push(a.id);
  }
  // NEW else-if: metadataDiffers(a, local) → metadataConflicts.push(a.id)
  // else: identical duplicate INCLUDING override state — calm no-op (unchanged)
}
// metadataDiffers = a.readerTitle !== local.readerTitle || a.readerAuthor !== local.readerAuthor

// 3. resolveImportPlan articles loop (L529-556) — merge-on-win:
// when the incoming article wins (revision L537-541 / divergence L548-549) under
// overwrite AND the metadata choice is keep-local, write:
//   { ...a, readerTitle: local.readerTitle, readerAuthor: local.readerAuthor }
// (take-incoming → write `a` whole; D17-10 — a refresh never renames the library back)
```

**Zero writes in this module** (the L20-24 module contract) — merge is data shaping
inside `articlesToWrite.push(...)`, before applyImport's transaction.

### `src/reader/ImportPreviewDialog.tsx` — conflict row + per-item choice

**Analog:** itself — the kind registry + per-kind select:

```typescript
// L54-61 DEFAULT_OVERRIDES — add: "article-metadata-override": "skip"  (keep-LOCAL default, D17-11)
// L65-78 KIND_LABELS — add: { one: "article with a different title or author",
//                             other: "articles with a different title or author" }
// L83 KEEP_BOTH_KINDS — the new kind is NOT added (keep-both meaningless — narrowing precedent)
// L210-237 — the conflict <li> + <select> shape the new kind's row joins
```

The **per-item choice** (D17-11 verbatim: "a per-item choice to take the incoming
one") is a NEW UI shape inside this dialog — see No Analog Found. `sampleIds` cap (5,
conflicts.ts L70-77) suggests the disclosure-list recommendation (RESEARCH OQ2).

### `src/persistence/db.ts` — additive migration (Option A: no bump)

**Analog:** the `ingestionMeta` no-bump precedent (schema field landed with no version
block — v3 was for indexes only) + the v2 no-op anchor block if Option B is chosen:

```typescript
// v2 no-op anchor (L123-127 CURRENT — the Option B template):
this.version(2).stores({
  articles: "id, revision",
  settings: "key",
  location: "[articleId+revision]",
});
```

Non-indexed row fields need no version-block declaration (Dexie docs; the project's
own `ingestionMeta`/`tags` precedents). Whatever the planner chooses: v1..v5 blocks
(L102-196) stay **byte-unchanged**, NO `.upgrade()` callback. The table-property type
at L69-83 may widen additively (`readerTitle?: string; readerAuthor?: string;`) — the
definite-assignment/typing precedent documented at L84-90 (runtime-unaffected).

### `src/app.css` — `.library-row-edit`

**Analog:** `.library-row-remove` (L2093-2109) — clone with `--accent` instead of
`--destructive` (edit is not destructive):

```css
/* CURRENT (L2093-2109) — the token pattern to mirror: */
.library-row-remove {
  display: inline-flex; align-items: center; justify-content: center;
  min-height: var(--touch); min-width: var(--touch);
  padding: 0; background: transparent; border: 1px solid transparent;
  border-radius: 4px; color: var(--ink-soft); cursor: pointer;
}
.library-row-remove:hover {
  color: var(--destructive); border-color: var(--destructive);
}
```

44px `var(--touch)` box, transparent rest, zero motion properties — POLISH-07 token
discipline. Dialog styles clone `.library-remove-confirm*` / `.add-dialog*` geometry.

### `tests/unit/library/effective-metadata.test.ts` (NEW)

**Analog:** `tests/unit/library/reading-state.test.ts` — pure coverage, schema-parse
builders, boundary-named cases:

```typescript
// reading-state.test.ts L15-22 (imports) + L24-38 (schema-parse builder) to mirror:
import { describe, expect, it } from "vitest";
import { BookSchema, LocationRecordSchema } from "../../../src/content/schema";
// → build articles via ArticleSchema.parse({...}) — NEVER hand-write rows

// reading-state.test.ts L61-76 (the decision-named describe/it shape to mirror):
describe("articleReadingState (D14-18 — ...)", () => {
  it("no location → unread (D14-18)", () => { ... });
});
```

Truth table: override present → wins; absent → canonical; absent author override +
absent canonical author → undefined; `readerTitle: ""` REJECTED by schema parse
(Pitfall 2 guard); row WITH readerTitle round-trips `ArticleSchema.parse` intact
(strip-mode trap guard).

### `tests/e2e/library/metadata-edit.spec.ts` (NEW)

**Analog:** `tests/e2e/library/remove-cascade.spec.ts` — same harness + seeding:

- `readRow`/`countRows` helpers cloned verbatim (L74-130, themselves clones of
  dexie-migration.spec.ts L226-288) — assert Dexie row state directly, not just UI.
- Seed by **ingesting paste-HTML through the real middleware** (L14-25 seeding
  strategy + the `PASTE_HTML` corpus pattern L47-68) so the edited row is a real
  Dexie row with `ingestionMeta` — never seed overrides on fixtures (Pitfall 8 in
  RESEARCH: fixture-pinned specs stay byte-stable).
- Dialog-flow assertions mirror the remove-cascade dialog cells: body copy,
  `data-initial-focus` on Cancel, Esc path leaves state clean.
- Add the fixture-gate cell: edit button absent on Sample rows.

### Extended tests (10) — extend in place, strengthen-only for untouched anchors

| Spec | Extension pattern from its own file |
|------|-------------------------------------|
| `tests/e2e/ingestion/dexie-migration.spec.ts` | The v3→v4 tags-hydration describe (L424-571) is the exact template: seed a v5-shaped row WITHOUT override keys → reload → assert row parses/renders + on-disk row byte-unchanged (`articleRow?.tags` toBeUndefined at L535 → same assertion for `readerTitle`) |
| `tests/unit/portability/bundle-schema.test.ts` / `validate-bundle.test.ts` | v1/v2 parse rows already exist (the 12-07 matrix); add v3 rows + peek > 3 refusal |
| `tests/unit/portability/conflicts.test.ts` | The `fake-indexeddb` + Dexie harness (L53-54) + describe-per-behavior shape (L257, L723); add metadata-conflict classification + merge-on-win matrix |
| `tests/unit/portability/import-preview-dialog.test.tsx` | DEFAULT_OVERRIDES/KIND_LABELS widening + per-item choice rendering |
| `tests/unit/library-search.test.ts` | haystack cells: renamed article NOT found by old name (D17-07), found by new |
| `tests/unit/ingestion-schema.test.ts` | optional fields parse; `""` rejected |
| `tests/e2e/portability/round-trip.spec.ts` / `import-preview.spec.ts` | override round-trip + conflict preview row (v3 bundle fixtures) |

## Shared Patterns

### 1. Native `<dialog>` grammar (apply to EditMetadataDialog only)

**Source:** `RemoveConfirm.tsx` L44-102 + `AddDialog.tsx` L132-196 +
`ImportPreviewDialog.tsx` L122-194. The five-part discipline every shipped dialog
carries — clone ALL parts, not just showModal:
1. `useEffect` open↔showModal/close sync with idempotent guards
2. `triggerRef` captures `document.activeElement` on open; `close` listener restores
3. Explicit `.focus()` on `[data-initial-focus]` after showModal (WebKit quirk)
4. Esc routed through the parent's onCancel (`cancel` preventDefault + openRef/
   submittingRef mirror — never a stale-closure wedge)
5. `data-initial-focus` on the NON-destructive control (Cancel, not Save)

### 2. Zod-at-boundary strip mode (why schema declaration is mandatory)

**Source:** `src/ingestion/LibrarySource.ts` L53-64:

```typescript
async list(): Promise<CanonicalArticle[]> {
  const rows = await db.articles.toArray();
  const valid: CanonicalArticle[] = [];
  for (const row of rows) {
    const parsed = ArticleSchema.safeParse(row);
    if (parsed.success) { valid.push(parsed.data); }
    // else: drop the corrupt row silently — STATE-04 says never coerce.
  }
  return valid;
}
```

Every surface reads through this seam → undeclared fields are stripped invisible;
a field failing validation drops the WHOLE row. Apply to: schema.ts decision (declare
overrides) + the `|| undefined` write idiom (never persist `""`).

### 3. Pitfall 8 — single write site per component

**Source:** `RemoveConfirm.tsx` L87-102 (`onDestructiveClick` — "the ONLY call site
for `dexieLibrarySource.remove`... lives in the destructive button's onClick — never
in a catch block, never in an effect"). The edit dialog's `db.articles.put` lives ONLY
in Save's onClick. No shared "metadata write" service; no denormalized write paths.

### 4. refreshKey re-derivation loop

**Source:** `LibraryView.tsx` L254 (`const [refreshKey, setRefreshKey] = useState(0)`)
→ L459 load effect keyed on it → `onConfirm`/`onBookAdded` handlers bump it (L789,
L837). The edit dialog's onSaved joins this exact loop.

### 5. Calm-refusal / result-shape conventions

**Source:** `ExportImportService.ts` L139-153 (`ImportRefusal` discriminated union —
`newer-schema-version` is the kind the peek reuses); `booksStore.listBooks()`
`{ok: true...} | {ok: false...}` convention. No new refusal kinds needed this phase —
v4+ bundles reuse `newer-schema-version`.

### 6. Byte-stable anchors + strengthen-only tests

Existing spec anchors that MUST NOT change: LibraryRow `title-{id}` heading id +
`.meta` author markup shape (L90-93 — only the text VALUE source changes), Open-article
link (L116-118), remove aria-label TEMPLATE (L128 — the interpolated value changes to
effective, the template string stays). Fixture-pinned expectations stay byte-stable by
construction (fixtures never gain overrides — Pattern 7 gate).

### 7. Fixture-row inference predicate

**Source:** `SourceBadge.tsx` L57: `const source = article.ingestionMeta?.source ?? "fixture";`
The same `ingestionMeta === undefined` inference gates the edit affordance (fixtures
have nowhere to persist an override — RESEARCH Pattern 7).

## No Analog Found

| File | Role | What's novel | Nearest analog + guidance |
|------|------|--------------|---------------------------|
| `ImportPreviewDialog` per-item conflict choice | component (dialog sub-shape) | Shipped dialog is bulk-per-kind (one `<select>` per kind, L218-233); D17-11 requires a per-article keep-mine/use-imported choice | The per-kind `<li>` + `<select>` row (L213-234) + `sampleIds` cap-5 disclosure (conflicts.ts L70-77). RESEARCH OQ2 recommends: keep the per-kind summary row carrying the keep-local default + an expandable per-article list with toggles. Planner owns exact shape/copy. |
| Per-field Reset control (inside EditMetadataDialog) | component (form control) | No shipped dialog has per-field reset-to-baseline | `.library-clear-filters` quiet-button tokens (app.css L2275 + LibraryView L743-752 usage) for the visual grammar; behavior = restore input to canonical + omit key on save |
| Merge-on-win spread (conflicts.ts) | service logic | No shipped merge combines incoming-canonical + local-reader fields | The `bookId` denormalization spread in `applyImport` L344-347 (`{ ...article, bookId }`) is the nearest whole-row-spread precedent; the classification branch shape at L318-331 |

## Metadata

**Analog search scope:** `src/content`, `src/persistence`, `src/ingestion` (+`library/`),
`src/portability`, `src/reader`, `src/routes` (+`review/`), `src/app.css`,
`tests/unit/{library,portability}` + root unit tests, `tests/e2e/{library,portability,ingestion}`
**Files scanned:** ~30 source files + 10 test files read or grepped this session
**Line numbers verified:** all excerpts read this session (2026-08-29) against current HEAD
**Pattern extraction date:** 2026-08-29
