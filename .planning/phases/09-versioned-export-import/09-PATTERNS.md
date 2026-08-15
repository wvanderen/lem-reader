# Phase 9: Versioned Export/Import - Pattern Map

**Mapped:** 2026-08-15
**Files analyzed:** 17 (8 new src modules, 1 new component, 4 modified src files, 13 new test files counted as 2 groups, 3 config files)
**Analogs found:** 15 / 17 (2 files have no codebase analog — planner uses 09-RESEARCH.md Patterns 5 & 7)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/portability/bundle.ts` (NEW) | model (Zod schema) | transform | `src/content/schema.ts` | exact |
| `src/portability/ExportImportService.ts` (NEW) | service | CRUD + file-I/O | `src/ingestion/LibrarySource.ts` | exact |
| `src/portability/zipSlip.ts` (NEW) | utility (pure string guard) | validation | `server/slugify.ts` + `server/safeFetch.ts` refusal discipline | role-match |
| `src/portability/manifest.ts` (NEW) | utility (hashing) | transform | `server/safeFetch.ts` L91-99 | exact (function-level) |
| `src/portability/conflicts.ts` (NEW) | service (pure) | read-compare | `src/ingestion/LibrarySource.ts` L173-190 (seen-Set PK merge) | role-match |
| `src/portability/markdown.ts` (NEW) | utility (pure render) | transform | — none (markdown *parsing* exists, rendering does not) | no analog |
| `src/portability/download.ts` (NEW) | utility | file-I/O | — none (no download path exists) | no analog |
| `src/reader/ImportPreviewDialog.tsx` (NEW) | component | event-driven | `src/ingestion/library/RemoveConfirm.tsx` | exact (structural clone is MANDATED by D9-11) |
| `src/persistence/highlightsStore.ts` (MODIFY: + `loadAllHighlights()`) | store | CRUD | `src/persistence/locationStore.ts` L136-147 | exact |
| `src/persistence/notesStore.ts` (MODIFY: + `loadAllNotes()`) | store | CRUD | `src/persistence/locationStore.ts` L136-147 | exact |
| `src/reader/SettingsPanel.tsx` (MODIFY: "Your data" cluster) | component | request-response | own `settings-footer` + `fieldset`/`legend` structure (L110, L266-273) | in-file |
| `src/routes/ArticleView.tsx` (MODIFY: per-article "Export highlights") | component | request-response | own TagEntry mount L1178-1182 + annotation `.status` region L1101-1114 | in-file |
| `tests/unit/portability/*.test.ts` (NEW, 8 files) | test | CRUD/transform | `tests/unit/ingestion-tags.test.ts` | exact |
| `tests/e2e/portability/*.spec.ts` (NEW, 5 files) | test | CRUD | `tests/e2e/library/remove-cascade.spec.ts` | exact |
| `package.json` (MODIFY: + `fflate@0.8.3`) | config | — | existing pinned-deps block (`"@chenglou/pretext": "0.0.8"` exact-pin style) | in-file |
| `vite.config.ts` (MODIFY: `__APP_VERSION__` define — discretionary A3) | config | — | existing `defineConfig` plugins block | in-file |
| `playwright.config.ts` (MODIFY: `acceptDownloads` — ONLY if Wave 0 spec fails, A1) | config | — | existing `use: { trace: ... }` block | in-file |

## Pattern Assignments

### `src/portability/bundle.ts` (model, transform)

**Analog:** `src/content/schema.ts` — the project's single Zod-schema module. `ExportBundleSchema` composes schemas that ALL live here already (D9-04).

**Imports + schema-composition pattern** (`src/content/schema.ts` L16, L239-256, L272-302, L308-315):
```typescript
import { z } from "zod";
// ...
export const ArticleSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/), // stable slug; never the source URL (D-06)
  revision: z.number().int().min(1), // monotonic (D-06)
  // ...
});
export type CanonicalArticle = z.infer<typeof ArticleSchema>;

export const ReaderSettingsSchema = z.object({
  // STATE-04 migration hook: ... The union accepts BOTH literals so that an
  // existing v1 row ... hydrates ... on read — Pitfall 9 ... v3 and above
  // forward-reject (V5 boundary discipline preserved).
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  // ...
});
export const LocationRecordSchema = z.object({
  schemaVersion: z.literal(1), // STATE-04 migration hook
  // ...
});
```
Conventions to copy verbatim: `z.literal(n)` schemaVersion hooks with a comment naming the migration mechanism; `export type X = z.infer<typeof XSchema>` immediately after each schema; header comment citing the locked decisions (D9-01..D9-04). Compose `ArticleSchema`, `LocationRecordSchema`, `HighlightRecordSchema`, `NoteRecordSchema`, `ReaderSettingsSchema` — do NOT re-declare any record shape (RESEARCH Pattern 1 has the full target shape, including `z.literal(1)` for the envelope and `z.string().datetime()` for `exportedAt` mirroring `Provenance.retrievedAt` at L187).

---

### `src/portability/ExportImportService.ts` (service, CRUD + file-I/O)

**Analog:** `src/ingestion/LibrarySource.ts` — `DexieLibrarySource` is BOTH the read surface the exporter needs AND the atomic-transaction precedent the importer mirrors.

**Read surface — Zod-at-boundary with corrupt-row drop** (`src/ingestion/LibrarySource.ts` L53-64):
```typescript
async list(): Promise<CanonicalArticle[]> {
  const rows = await db.articles.toArray();
  const valid: CanonicalArticle[] = [];
  for (const row of rows) {
    const parsed = ArticleSchema.safeParse(row);
    if (parsed.success) {
      valid.push(parsed.data);
    }
    // else: drop the corrupt row silently — STATE-04 says never coerce.
  }
  return valid;
}
```

**Atomic multi-store transaction — THE pattern `applyImport` copies, extended to 5 stores by adding `db.settings`** (`src/ingestion/LibrarySource.ts` L108-151):
```typescript
async remove(id: string): Promise<void> {
  await db.transaction(
    "rw",
    db.articles,
    db.highlights,
    db.notes,
    db.location,
    async () => {
      // Collect the to-be-deleted highlight ids BEFORE deleting them so
      // the notes cascade has the FK set. Within a Dexie transaction,
      // reads see the in-transaction state — querying AFTER the highlights
      // delete would return zero rows and the notes would orphan.
      const highlightIds = (
        await db.highlights
          .where("[articleId+revision]")
          .between([id, 0], [id, Number.MAX_SAFE_INTEGER])
          .primaryKeys()
      ).map((k) => (Array.isArray(k) ? k[0] : k));

      await db.articles.delete(id);
      await db.highlights
        .where("[articleId+revision]")
        .between([id, 0], [id, Number.MAX_SAFE_INTEGER])
        .delete();
      if (highlightIds.length > 0) {
        await db.notes.where("highlightId").anyOf(highlightIds).delete();
      }
      await db.location
        .where("[articleId+revision]")
        .between([id, 0], [id, Number.MAX_SAFE_INTEGER])
        .delete();
    },
  );
}
```
Rules the importer inherits: ONLY `db.<table>.put/delete` calls inside the closure — no `crypto.subtle`, no Zod, no `setTimeout` (Dexie silently aborts on foreign awaits, RESEARCH Pitfall 1). Keep-both FK rewrite: mint new highlight ids and rewrite incoming notes' `highlightId` BEFORE the transaction (mirrors the "collect ids before delete" ordering discipline at L116-125). Location writes use plain `put` of `LocationRecordRow`-shaped objects — Dexie derives the compound `[articleId+revision]` key from the row's fields (`src/persistence/locationStore.ts` L101-112).

**Store names + PK shapes** (`src/persistence/db.ts` L158-164): `articles: "id, revision, source, addedAt, *tags"`, `settings: "key"`, `location: "[articleId+revision]"`, `highlights: "id, [articleId+revision]"`, `notes: "id, highlightId"`. Preferences write = `db.settings.put({ key: "reader-prefs", value: prefs })` (`src/persistence/settingsStore.ts` L84-86). **NO version(5) block — Pitfall 9.**

**Eager tri-state re-resolution signature** (`src/annotations/resolution.ts` L242-250; re-exported from `src/content/normalizeText.ts`):
```typescript
export function resolveQuoteSelector(
  article: CanonicalArticle,
  selector: TextQuoteSelector,
  positionHint?: TextPositionSelector,
): TextPositionSelector | "ambiguous" | "orphan" {
  const text = normalizeText(article);
  const clusters = graphemeClusters(text, article.lang);
  return resolveQuoteSelectorInText(clusters, selector, article.lang, positionHint);
}
```
Import from `../content/normalizeText` (the contract re-export site) — REUSE-DO-NOT-FORK. Memoize the per-article cluster array (compute once per article id, not per highlight). The 3-source article lookup (imported ∪ local Dexie ∪ fixtures) uses `import { fixtures } from "../fixtures"` (`src/fixtures/index.ts` L21-28) plus `dexieLibrarySource.list()`.

**Import refusal union** — follow the discriminated-result convention from `src/persistence/settingsStore.ts` L41-43 / `locationStore.ts` L40-42 (`{ ok: true; ... } | { ok: false; refusal/reason: ... }`), with the refusal variants from RESEARCH Code Examples L635-641.

---

### `src/portability/zipSlip.ts` (utility, validation)

**Analog:** `server/slugify.ts` — the codebase's pure string-sanitization utility. Same module shape: header comment citing the research section + threat, module-level pure exported function, no I/O.

**Structure to copy** (`server/slugify.ts` L44-51, L98-106 — regex + length-cap + fallback discipline):
```typescript
/** The ArticleSchema.id regex — every slug MUST satisfy this (single source
 * of truth mirrors src/content/schema.ts L227). */
const SLUG_REGEX = /^[a-z0-9-]+$/;

/**
 * slugifyUrl — canonical-URL → stable ASCII slug. ... Pure function;
 * no I/O except the deterministic node:crypto SHA-256 fallback.
 */
export function slugifyUrl(canonicalUrl: string): string {
```
Copy: the named-regex-constant-with-comment style (`OS_RESERVED`, traversal rules), the "pure function; no I/O" doc contract, and the sanitize-then-fallback shape for `sanitizeFilename(title, fallback)`. The refusal-before-any-use discipline (guard EVERY entry, refuse the whole bundle on one bad name) copies `server/safeFetch.ts`'s measure pipeline posture (L110-123: validate → throw typed error BEFORE the body is ever read). Target implementation is fully specified in 09-RESEARCH.md Pattern 2 (L286-328) — implement that verbatim, browser-side (NO `node:path`).

---

### `src/portability/manifest.ts` (utility, transform)

**Analog:** `server/safeFetch.ts` L91-99 — the exact `crypto.subtle` SHA-256 precedent.

**Hash pattern** (`server/safeFetch.ts` L91-99):
```typescript
/** SHA-256 hex digest of `text`, prefixed with the algorithm (V6 — Web Crypto). */
async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `sha256:${hex}`;
}
```
Copy the `globalThis.crypto.subtle.digest` call + hex encoding exactly. Note: the manifest block hash does NOT need the `sha256:` prefix (that prefix is Provenance/`originalHtmlHash` convention) — but hashing MUST be over `JSON.stringify(zodParsed.<block>)` on BOTH sides for determinism (RESEARCH Pattern 4 + Pitfall 2). Add the insecure-context guard (`globalThis.crypto?.subtle` missing → calm disable) at the Settings-cluster entry, per RESEARCH Pitfall 6.

---

### `src/portability/conflicts.ts` (service pure, read-compare)

**Analog:** `src/ingestion/LibrarySource.ts` L173-190 — `compositeLibraryRepository.list()`'s PK-comparison merge is the closest existing id-collision logic.

**PK comparison with a `seen` Set, first-seen-wins precedence** (`src/ingestion/LibrarySource.ts` L179-189):
```typescript
const seen = new Set<string>();
const merged: CanonicalArticle[] = [];
// Ingested first — wins on id collision (D7-07: reader's local library
// takes precedence over bundled fixtures).
for (const a of [...ingestedList, ...fixtureList]) {
  if (!seen.has(a.id)) {
    seen.add(a.id);
    merged.push(a);
  }
}
```
The dry-run pass copies this shape: build a `Map`/`Set` of local PKs (`db.articles.toArray()` etc. or `dexieLibrarySource.list()` + the new bulk loaders), then classify each incoming record against the D9-14 conflict table (revision compare for articles, `originalHtmlHash` compare at same id+revision, id collision for highlights/notes, `[articleId, revision]` + `savedAt` LWW for locations). Output is a fully-computed `ResolvedImportPlan` / `ImportPreview` — pure data, no writes. Discriminated-union result typing per the settingsStore convention above.

---

### `src/reader/ImportPreviewDialog.tsx` (component, event-driven)

**Analog:** `src/ingestion/library/RemoveConfirm.tsx` — D9-11 MANDATES a structural clone (Pitfall 8 isolation, not a shared dialog).

**Dialog open/focus discipline — copy verbatim** (`src/ingestion/library/RemoveConfirm.tsx` L44-85):
```typescript
const ref = useRef<HTMLDialogElement>(null);
// Capture the previously-focused element on open so the close handler can
// restore focus (Pitfall 1 — same discipline as WipeConfirm + SettingsPanel).
const triggerRef = useRef<HTMLElement | null>(null);

// Sync the `open` prop with the underlying <dialog> state.
useEffect(() => {
  const dlg = ref.current;
  if (!dlg) return;
  if (open && !dlg.open) {
    triggerRef.current = document.activeElement as HTMLElement | null;
    dlg.showModal(); // browser: focus→first focusable, trap, inert backdrop, Esc closes
    // Cross-engine focus management (Pitfall 1 + WebKit quirk, same as
    // WipeConfirm): explicitly focus the [data-initial-focus] element ...
    const initial =
      dlg.querySelector<HTMLElement>("[data-initial-focus]") ??
      dlg.querySelector<HTMLElement>(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
      ) ??
      dlg;
    initial.focus();
  } else if (!open && dlg.open) {
    dlg.close();
  }
}, [open]);

useEffect(() => {
  const dlg = ref.current;
  if (!dlg) return;
  const handleClose = () => {
    triggerRef.current?.focus();
  };
  dlg.addEventListener("close", handleClose);
  return () => dlg.removeEventListener("close", handleClose);
}, []);
```

**Load-bearing destructive handler — `applyImport` fires ONLY here** (`RemoveConfirm.tsx` L87-102):
```typescript
// ── PITFALL 8 LOAD-BEARING HANDLER ──────────────────────────────────────
// The ONLY call site for `dexieLibrarySource.remove` in the new code. It
// lives in the destructive button's onClick — never in a catch block or
// effect. The reader must click "Remove article" to fire this; nothing else
// triggers it.
const onDestructiveClick = async () => {
  try {
    await dexieLibrarySource.remove(articleId); // cascade: article + highlights + notes + location
  } catch {
    // Even the destructive path defends itself: ...
  }
  onConfirm();
};
```
For the import dialog the DESTRUCTIVE action is Proceed (the bulk write); `[data-initial-focus]` goes on the NON-destructive "Cancel import" button (RemoveConfirm L139-146 shows the marker on cancel).

**Dialog markup pattern** (`RemoveConfirm.tsx` L110-149): `<dialog className="..." role="alertdialog" aria-modal="true" aria-labelledby="..." aria-describedby="...">` with a `-inner` wrapper, an `h2` title, body copy naming the consequence in calm DOC-06 voice, and an `-actions` div. Use a new `import-preview` class family (e2e asserts `dialog.library-remove-confirm` today — see tests below). Mount pattern: parent holds `removeTarget !== null`-style state and renders the dialog with `open={...}` + `onConfirm`/`onCancel` (`src/ingestion/library/LibraryView.tsx` L163-181) — but the Phase 9 trigger lives in the Settings panel, not LibraryView (D9-10).

**File-pick handler analog** (`src/ingestion/IngestControl.tsx` L155-200, L247-262) — the existing `<input type="file">` flow the Import picker clones with `accept=".zip"`:
```typescript
async function handleFileSubmit(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();
  if (status === "submitting") return;
  const file = fileInputRef.current?.files?.[0];
  if (!file) return;
  // Client-side size cap (UI-SPEC §EXTENDED IngestControl + T-8-14). ...
  if (file.size > 5 * 1024 * 1024) {
    setStatus("error");
    setMessage(mapReasonToCopy("response-too-large"));
    return;
  }
  setStatus("submitting");
  setMessage("Reading file…");
  try {
    const text = await file.text();
    // ...
```
```tsx
<input
  id="ingest-file"
  ref={fileInputRef}
  name="file"
  type="file"
  accept=".md,.html"
  disabled={submitting}
  onChange={(e) => setHasFile(e.target.files !== null && e.target.files.length > 0)}
/>
```
Copy: the `fileInputRef` + disabled-during-submit + size-cap-guard + `file.arrayBuffer()` (instead of `.text()`) shape, and the status/message state machine that routes every refusal to the `.status` region.

---

### `src/persistence/highlightsStore.ts` + `src/persistence/notesStore.ts` (MODIFY — add `loadAllHighlights()` / `loadAllNotes()`)

**Analog:** `src/persistence/locationStore.ts` L114-147 — `loadAllLocations` is the exact bulk-read pattern to mirror ("mirroring `loadAllLocations()` exactly" per RESEARCH Pitfall 5).

**Bulk-read pattern** (`src/persistence/locationStore.ts` L136-147):
```typescript
export async function loadAllLocations(): Promise<LocationRecord[]> {
  const rows = await db.location.toArray();
  const valid: LocationRecord[] = [];
  for (const row of rows) {
    const parsed = LocationRecordSchema.safeParse(row);
    if (parsed.success) {
      valid.push(parsed.data);
    }
    // else: drop the corrupt row silently — STATE-04 says never coerce.
  }
  return valid;
}
```
`loadAllHighlights()` = same over `db.highlights.toArray()` + `HighlightRecordSchema.safeParse`; `loadAllNotes()` = same over `db.notes.toArray()` + `NoteRecordSchema.safeParse`. Return plain arrays (NOT the per-article `HighlightsLoadResult` union — the whole-library read mirrors loadAllLocations' plain-array contract). Append below the existing functions, with a header-doc comment in the store's established style citing Plan/decision IDs (see highlightsStore L1-30 header conventions; note `import type` for types — verbatimModuleSyntax).

---

### `src/reader/SettingsPanel.tsx` (MODIFY — "Your data" cluster)

**Analog:** in-file structure. ⚠️ **Correction to CONTEXT.md's shorthand:** `WipeConfirm` does NOT live inside SettingsPanel — it mounts in `App.tsx` L91-100, routed by `storageState` from SettingsContext (a recovery dialog, not a settings cluster member). The "Your data" cluster is NEW surface inside the SettingsPanel `<dialog>`.

**Cluster structure to extend** (`src/reader/SettingsPanel.tsx` L110-112 and L266-273):
```tsx
<fieldset className="settings-section">
  <legend>Typeface</legend>
  {/* rows of labeled controls */}
</fieldset>
{/* ... */}
<div className="settings-footer">
  <button type="button" className="settings-reset" onClick={onReset}>
    Reset to defaults
  </button>
</div>
```
Add a `settings-section` fieldset (legend "Your data") or a footer-adjacent block housing Export library bundle / Import bundle / Export all highlights — every button `type="button"` (the panel deliberately avoids form-submission behavior, L90-94 comment). Export buttons call the service then announce via `.status`; Import opens the file picker then `ImportPreviewDialog`. Keep the panel's dialog focus discipline untouched (L43-79).

---

### `src/routes/ArticleView.tsx` (MODIFY — per-article "Export highlights" affordance)

**Analog:** in-file — the TagEntry mount is the established pattern for adding a reader-chrome affordance to the article header.

**Header mount point** (`src/routes/ArticleView.tsx` L1163-1182):
```tsx
<header>
  <h1>{article.provenance.title}</h1>
  {(article.provenance.author || article.provenance.publishedAt) && (
    <p className="meta">
      {article.provenance.author}
      {article.provenance.author && article.provenance.publishedAt && " · "}
      {article.provenance.publishedAt && formatDate(article.provenance.publishedAt)}
    </p>
  )}
  {sourceUrl !== undefined && domain !== undefined && (
    <a href={sourceUrl} rel="noopener noreferrer" target="_blank">
      Originally published at {domain}
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  )}
  {/* Plan 08-04 (D8-05) — tags edited WHILE reading (not in the
      library list). TagEntry is INERT at mount (Pitfall 8-5 — no
      autoFocus, no useEffect-driven .focus()). */}
  <TagEntry articleId={article.id} tags={article.tags ?? []} />
</header>
```
Exact mount point is planner discretion (D9-06/RESEARCH) — but copy the TagEntry rules: INERT at mount (no autoFocus, no effect-driven focus), `type="button"`, and result announcement through a live region.

**Result-announcement region** (`src/routes/ArticleView.tsx` L1101-1114) — the visually-hidden annotation live region the export result can reuse or mirror:
```tsx
{/* Phase 5 Plan 05-02 (D5-12, A11Y-08): polite live region for
    annotation announces. ... */}
<div
  className="visually-hidden"
  role="status"
  aria-live="polite"
  aria-atomic="true"
>
  {annotationAnnouncement}
</div>
```

---

### `tests/unit/portability/*.test.ts` (test — 8 files: bundle-schema, zip-slip, validate-bundle, manifest, conflicts, atomic-import, markdown, export-service)

**Analog:** `tests/unit/ingestion-tags.test.ts` — the fake-indexeddb Dexie harness (proven pattern per RESEARCH L126).

**Harness — copy verbatim for every Dexie-touching spec** (`tests/unit/ingestion-tags.test.ts` L16-50):
```typescript
import { beforeEach, describe, expect, it } from "vitest";
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";

// Dexie 4 captures `indexedDB` + `IDBKeyRange` on `Dexie.dependencies` at
// dexie-module-load time. Install BOTH onto `Dexie.dependencies` (the
// Dexie-internal read path) AND `globalThis` (the direct-read path Dexie
// uses for deleteDatabase) at this module's top-level ...
Dexie.dependencies.indexedDB = fakeIndexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;
(globalThis as { indexedDB?: typeof fakeIndexedDB }).indexedDB = fakeIndexedDB;
(globalThis as { IDBKeyRange?: typeof IDBKeyRange }).IDBKeyRange = IDBKeyRange;

async function wipeDatabase(): Promise<void> { /* L32-41 */ }

// Lazy imports — the modules under test are imported AFTER the fake-indexeddb
// install so their module-body top-level sees a populated Dexie.dependencies.
async function loadTagsStore() {
  return await import("../../src/ingestion/library/tagsStore");
}
```
**Sample-record builder** (L54-89): `sampleArticle()` builds an `ArticleSchema.parse({...})`-valid article with `...overrides` spread — clone this for seeding articles/highlights/notes in export/import/round-trip specs. **Corrupt-row test style** (L177-201): put a deliberately-invalid row via `db.articles.put({...})` then assert the loader drops it. Pure specs (zip-slip, markdown, bundle-schema, manifest) need no harness — plain `describe/it/expect` per `tests/unit/normalizeText.test.ts` conventions. NOTE: Node's `crypto.subtle` exists (Node ≥ 20 global) so manifest hashing works in unit tests without polyfill.

---

### `tests/e2e/portability/*.spec.ts` (test — 5 files: round-trip, zip-slip-regression, import-preview, highlights-export, a11y)

**Analog:** `tests/e2e/library/remove-cascade.spec.ts` — the dialog-flow + Dexie-assertion e2e precedent.

**beforeEach — clear-rows, NOT deleteDatabase** (L221-264):
```typescript
test.beforeEach(async ({ page }) => {
  // Stub remote images so figure-heavy fixtures don't couple to network.
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg/>" }),
  );
  // Mount the SPA so Dexie constructs the lem-reader DB schema, then CLEAR
  // every store's rows for deterministic first-run state (mirrors
  // dexie-migration.spec.ts beforeEach L290-330 — clear-rows, NOT
  // deleteDatabase, to avoid the webkit deleteDatabase race).
  await page.goto(`${BASE}/`);
  await expect(
    page.getByRole("heading", { name: "Saved articles" }),
  ).toBeVisible({ timeout: 10_000 });
  await page.evaluate(async () => { /* clear all 5 stores */ });
});
```

**Dexie-state assertion helpers — clone verbatim** (L71-130): `readRow(page, storeName, key)` and `countRows(page, storeName)` via raw `indexedDB.open("lem-reader")` inside `page.evaluate` — "the cascade proof uses readRow/countRows against the live IndexedDB to assert the rows are physically gone, not just absent from the rendered list" (T-8-19). The SC#4 round-trip spec uses these on machine B; note location keys are arrays: `readRow(page, "location", [articleId, 1])` (L296).

**Seeding via page.evaluate** (L139-191): `seedCascadeRows` writes highlight/note/location rows with raw IndexedDB `put` in one `readwrite` tx — the shape for seeding machine A before export. Highlight seed shape: `{ schemaVersion: 1, id, articleId, revision, position: {start,end}, quote: {prefix,exact,suffix}, createdAt }` (L145-157).

**Dialog assertion pattern** (L328-348):
```typescript
const dialog = page.locator("dialog.library-remove-confirm");
await expect(dialog).toBeVisible();
await expect(dialog).toContainText("Remove this article? ...");
const cancelBtn = dialog.locator(".library-remove-cancel");
await expect(cancelBtn).toHaveAttribute("data-initial-focus", "true");
await dialog.locator(".library-remove-destructive").click();
```
Import-preview spec asserts `dialog.import-preview` (or whatever class the planner locks) the same way: body copy, `data-initial-focus` on cancel, Proceed applies, cancel leaves `countRows` unchanged. The two-browser-context "machine A / machine B" harness + `page.waitForEvent("download")` are new — shaped in 09-RESEARCH.md Code Examples L693-718 (with the A1 `acceptDownloads` Wave 0 check). BASE URL is `http://localhost:5173` (L38); the auto-retrying `toHaveCount` discipline for async loads is documented at L300-315.

---

## Shared Patterns

### Atomic multi-store Dexie transaction
**Source:** `src/ingestion/LibrarySource.ts` L108-151 (see full excerpt above)
**Apply to:** `ExportImportService.applyImport` — the single `db.transaction("rw", ...5 tables)` write; ONLY Dexie puts inside the closure; any throw rolls back everything. Regression-proven by `tests/e2e/library/remove-cascade.spec.ts` steps 8-10.

### Zod-at-boundary safeParse + silent corrupt-row drop
**Source:** `src/persistence/locationStore.ts` L136-147; `src/ingestion/LibrarySource.ts` L53-64; `src/persistence/highlightsStore.ts` L70-80
**Apply to:** `loadAllHighlights`/`loadAllNotes` bulk reads; the import validation pipeline uses `safeParse` on the ENVELOPE and surfaces `error.issues` as a LIST (Pitfall 11 #2 — not first-error-only; this differs from the silent per-row drop, which is for LOCAL reads only — bundle records refuse loudly, local corrupt rows drop quietly).

### Native `<dialog>` discipline (Pitfall 1 + Pitfall 8)
**Source:** `src/ingestion/library/RemoveConfirm.tsx` L44-102 (full excerpt above); `src/reader/WipeConfirm.tsx` L47-102 (identical shape, destructive = `db.delete()`)
**Apply to:** `ImportPreviewDialog.tsx`. Non-negotiables: `showModal()` sync via `useEffect` on `open`; capture `document.activeElement` on open + restore in `close` listener; explicit `.focus()` on `[data-initial-focus]` after showModal (WebKit); marker on the NON-destructive button; the destructive write (`applyImport`) ONLY in the Proceed button's onClick.

### `.status` live region (D2-13 / A11Y-08)
**Source:** `src/ingestion/library/LibraryView.tsx` L112-123; `src/ingestion/IngestControl.tsx` L269-277; `src/routes/ArticleView.tsx` L1107-1114
```tsx
<div className="status" role="status" aria-live="polite" aria-atomic="true">
  {status === "submitting" && message !== null && <p>{message}</p>}
  {status === "error" && message !== null && <p>{message}</p>}
</div>
```
**Apply to:** every export/import progress + result + refusal surface (corruption, newer-version, unsafe-entry). Calm DOC-06 voice; zero new disclosure vocabulary. Three existing mount precedents: LibraryView (visible), IngestControl (visible), ArticleView (visually-hidden `annotationAnnouncement`).

### Discriminated result unions — never throw to the reader
**Source:** `src/persistence/settingsStore.ts` L41-43 (`SettingsLoadResult`), `src/persistence/locationStore.ts` L40-42, `src/persistence/highlightsStore.ts` L48-50
**Apply to:** `validateBundle`'s `ImportRefusal` union (RESEARCH L635-641) and `buildBundle`/`applyImport` result types. `{ ok: true; ... } | { ok: false; refusal: ... }` shape throughout.

### SHA-256 via `crypto.subtle` — never hand-roll
**Source:** `server/safeFetch.ts` L91-99 (full excerpt above)
**Apply to:** `manifest.ts` `sha256Hex`. Determinism contract: hash `JSON.stringify(zodParsed.<block>)` on both sides (RESEARCH Pitfall 2).

### Module conventions
**Source:** every file in `src/persistence/` + `src/ingestion/LibrarySource.ts`
**Apply to:** all `src/portability/` modules — header comment citing locked decisions/plan IDs; `import type` for type-only imports (verbatimModuleSyntax); module-level exported functions as the single-import surface; no default exports anywhere in src; typed error classification left to callers. React state only, no Redux/Zustand (D9 locked); authored CSS classes in the existing token vocabulary (see `app.css` class patterns like `library-remove-confirm`, `settings-section`).

## No Analog Found

Files with no close match in the codebase (planner should use 09-RESEARCH.md patterns instead):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/portability/markdown.ts` | utility (pure render) | transform | The codebase only PARSES markdown (`server/markdownToBlocks.ts`, Phase 8 — input direction). No markdown/string RENDERER exists. Use RESEARCH Pattern 7 (L441-468) verbatim — pure `(article, entries) => string`, blockquote+citation+note, `[approx]`/`[orphan]` markers, footer counts. |
| `src/portability/download.ts` | utility | file-I/O | No file-download path exists anywhere in src (all ingestion is upload-in). Use RESEARCH Pattern 5 (L407-422) — `Blob` + `URL.createObjectURL` + synthesized `<a download>` + deferred `revokeObjectURL` (A2: `setTimeout(0)` for the WebKit race). |

## Metadata

**Analog search scope:** `src/**` (content, persistence, ingestion, reader, annotations, routes, fixtures), `server/`, `tests/unit/`, `tests/e2e/`, config files at repo root
**Files scanned:** ~140 source/test files listed; 13 analog files read in full or targeted (`locationStore.ts`, `LibrarySource.ts`, `db.ts`, `highlightsStore.ts`, `notesStore.ts`, `settingsStore.ts`, `schema.ts`, `SettingsPanel.tsx`, `WipeConfirm.tsx`, `RemoveConfirm.tsx`, `LibraryView.tsx`, `IngestControl.tsx`, `ArticleView.tsx` L1030-1209, `resolution.ts`, `safeFetch.ts`, `slugify.ts`, `fixtures/index.ts`, `ingestion-tags.test.ts`, `remove-cascade.spec.ts`)
**Pattern extraction date:** 2026-08-15
**Key corrections for the planner:** (1) WipeConfirm mounts in `App.tsx`, NOT SettingsPanel — the "Your data" cluster is new SettingsPanel surface (D9-10's "grouped with WipeConfirm" is conceptual grouping, not co-location); (2) `loadAllHighlights`/`loadAllNotes` return plain arrays mirroring `loadAllLocations`, NOT the per-article `LoadResult` unions; (3) `resolveQuoteSelector` imports from `src/content/normalizeText.ts` (the contract re-export site of `src/annotations/resolution.ts`); (4) bulk loaders live in `src/persistence/` (per RESEARCH structure), keeping the store-seam convention — the service composes them, never queries `db.*` outside the transaction precedent.
