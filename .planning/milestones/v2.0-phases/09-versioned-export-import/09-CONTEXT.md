# Phase 9: Versioned Export/Import - Context

**Gathered:** 2026-08-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 9 is the **cross-device story in lieu of accounts**. It lets a reader take their whole local-first library with them to another machine and take just their intellectual work (highlights) out to external tools — without ever introducing a server, an account, or cloud sync.

It delivers three things (PORT-01, PORT-02, PORT-03):

1. **Whole-library export** (PORT-01) — articles + highlights + notes + positions + preferences serialized as a single **versioned ZIP bundle** carrying a top-level `schemaVersion`, per-article source URLs, and a SHA-256 integrity manifest.
2. **Whole-library import** (PORT-02) — on another machine, the reader picks a bundle, sees a **dry-run conflict preview**, chooses **bulk per-kind overrides** (skip-by-default), and the import applies **atomically in a single Dexie transaction** (no partial state on failure). A **Zip Slip guard** (`path.resolve + startsWith` on every archive entry) plus filename sanitization refuses directory-traversal entries.
3. **Highlights-only Markdown export** (PORT-03) — a calm fixed built-in template renders the reader's highlights (blockquote + citation, with honest inclusion of ambiguous/orphan highlights) for use in external tools like Obsidian or Notion. Available both library-wide (one combined `.md`) and per-article.

**Phase 9 does NOT ship** (deferred to later phases):
- **Annotation review panel** (RECV-01) — **Phase 10**. The per-tag highlights-export variant pairs with it there.
- **PDF intake / EPUB intake** — **Phases 11 / 12**. (The ZIP bundle format is chosen partly to be forward-compatible with bundling EPUB/PDF cover image assets in those phases, but Phase 9 itself carries no image assets — article images stay as remote `httpUrl`.)
- **POLISH-01/02 + NVDA+Firefox acceptance** — **Phase 13** (ACPT-05/06). Note: ACPT-06 names the v2.0 core flow as `ingest → read → highlight → export → re-import`; Phase 9 makes that flow possible, Phase 13 closes the acceptance gate.
- **Accounts, cloud sync, encrypted bundles, real-time merge** — PROJECT.md Out of Scope. Versioned export/import IS the v2.0 cross-device story; a "real" sync protocol is deferred to v3 alongside accounts.
- **Reader-editable Markdown template (Readwise Jinja2 model)** — FEATURES L238 names it as "the model," but Phase 9 ships a **fixed built-in template** (D9-08). Editability deferred until readers actually ask.
- **Per-row conflict merge UI** — FEATURES L229 explicitly defers the heavy merge screen. Phase 9 ships the report + skip-by-default + **bulk per-kind overrides** (D9-11).
- **Streaming / chunked export (File System Access API `showSaveFilePicker`)** — Pitfall 11 #7. Phase 9 ships cross-browser `Blob + <a download>` (D9-05); streaming is a known limit for very large libraries, documented for later.
- **Per-tag highlights export** — pairs with the Phase 10 review panel.

**Load-bearing invariants (from ROADMAP.md + prior phases — do NOT re-ask):**
- **Round-trip integrity** (SC#4): canonical-text offsets survive export and import; **page numbers never appear in the bundle**. A bundle exported on one machine re-imports on another with every highlight re-resolving to `confident` or surfacing honestly as `ambiguous`/`orphan` (ANNO-07 tri-state — never silent re-attach).
- **Atomic import** (SC#2 + Pitfall 11 #3): the import applies in a **single Dexie transaction**. If anything fails, the entire import rolls back — no 47-articles-and-0-highlights orphaned state, no STATE-04 violation.
- **Zip Slip guard is a hard phase-exit gate** (SC#2 + Pitfall 11 #5): `path.resolve + startsWith` on EVERY archive entry, no exceptions; filename sanitization refuses `../`, NUL bytes, OS-reserved names. A regression test with `../../evil.sh` and `..%2F..%2Fevil.sh` entries is mandatory.
- **Zod validates the entire bundle before any write** (Pitfall 11 #2): every record is validated by its existing schema (`ArticleSchema`, `HighlightRecordSchema`, etc.); surface all errors as a list, not just the first.
- **Fixtures are NOT serialized in the bundle** (ARCHITECTURE L615): they're bundled JSON present in every build; including them bloats the bundle 5–10×. The bundle carries **fixture ids only** (`fixtureIds: string[]`) so the importer can verify fixture presence and skip them.
- **Local-first / client-only**: no server is needed. Dexie reads, Zod schemas, `normalizeText`/`resolveQuoteSelector`, and `crypto.subtle` are all client-available. (ARCHITECTURE's `server/portability/` sketch is shared pure code for a *future* cloud path; v2.0 runs the whole flow client-side.)

**Substrate already shipped (pre-answered — do NOT re-ask):**
- **Dexie v4** (`src/persistence/db.ts`) declares 5 stores — `articles`, `settings`, `location`, `highlights`, `notes` — all Zod-validated on read (STATE-04). These ARE the bundle's record sources/sinks; no schema invention needed.
- **`ArticleSchema`, `HighlightRecordSchema`, `NoteRecordSchema`, `LocationRecordSchema`, `ReaderSettingsSchema`** (`src/content/schema.ts`) — the validation surface for every bundle record. `TextPositionSelectorSchema` + `TextQuoteSelectorSchema` ride on `HighlightRecordSchema`.
- **`compositeLibraryRepository` + `DexieLibrarySource`** (`src/ingestion/LibrarySource.ts`) — already implements `list/open` + write-side `save/has/remove`. `remove(id)` already cascades across articles + highlights + notes + location **in one Dexie transaction** (T-7-29) — the atomic-write precedent the importer mirrors.
- **`resolveQuoteSelector` tri-state** (`src/content/normalizeText.ts`) — the re-anchoring machinery for SC#4. Pure function over the imported article's `normalizeText`; no DOM, no server.
- **`WipeConfirm`** (`src/persistence/...` / settings) + **`RemoveConfirm`** (`src/ingestion/library/RemoveConfirm.tsx`) — the native `<dialog>` destructive-confirmation precedents. Import's preview+confirm dialog mirrors these (structural clone, not a shared dialog — Pitfall 8 isolation).
- **`.status` live region** (D2-13) — the calm honesty surface where export/import progress + result announce (A11Y-08).
- **Settings panel** — where whole-library data actions live (WipeConfirm is here); Phase 9's export/import controls join this surface (D9-09).
- **Hash-based router** (`src/App.tsx`) — `#/` library, `#/article/<id>` reader. Export/import controls mount inside Settings/ArticleView, not as routes.

</domain>

<decisions>
## Implementation Decisions

### Carrying forward (locked by v1.0 + Phases 7/8 — do NOT re-litigate)

- **Doc model is the security boundary** — the bundle is plain validated JSON; React renders Block JSON, never HTML. `dangerouslySetInnerHTML` exists nowhere. No new XSS surface from export (it's read-only serialization of validated records).
- **W3C selectors over the grapheme substrate** — highlights carry `TextPositionSelector` + `TextQuoteSelector` (D5-03). Persisting/transporting DOM Range / XPath / page-number / pixel anchors is FORBIDDEN.
- **Pitfall 9 (Dexie version discipline)** — import writes through the existing stores at their existing shapes; **no Dexie version bump is required for Phase 9** (the importer writes v1/v2/v3/v4-compatible rows; no new stores, no new indexes). If a schema bump is contemplated, it must be additive-only.
- **Calm DOC-06/PAGE-09 voice** for all disclosure (D7-04) — import conflicts, corruption, "exported by a newer version," orphan highlights. Zero new disclosure vocabulary.
- **React state/context, no Redux/Zustand** — export/import UI state flows through React local state; Dexie is the persistence seam.
- **Authored CSS + custom properties, no Tailwind** — the export/import chrome inherits existing tokens.
- **Playwright across Chromium/Firefox/WebKit for truth** — the round-trip integrity test (SC#4) + Zip Slip regression (SC#2) extend this discipline. DOM emulators are not authoritative.

### Bundle archive format (PORT-01)

- **D9-01: ZIP archive is the bundle format.** The bundle is a **`lem-reader-bundle-v1.zip`** containing `bundle.json` (the versioned records envelope) + `manifest.json` (the SHA-256 integrity manifest). Chosen because (a) SC#2 mandates a Zip Slip guard "on every archive entry" — that language requires real entries to guard, making the guard meaningful rather than a defensive no-op; (b) ZIP is the standard portability format (Calibre/Wallabag/Obsidian); (c) forward-compatible with bundling EPUB/PDF cover image assets in Phases 11/12 (article images today stay as remote `httpUrl`, so Phase 9 itself ships NO image entries — but the format is ready). REJECTED: single `.json` (no traversal surface but no asset future + the SC#2 guard becomes a vacuous check); `.json.gz` (compression-only, single-stream, same no-asset-future).
- **D9-02: fflate is the zip library.** ~8KB min+gz, pure-JS, sync + async zip/unzip in one tiny package. Smallest bundle impact (a stated PROJECT.md concern); used by Vite internally. Pitfall 11 #5 applies regardless of lib: **fflate exposes entry names unsanitized — the Zip Slip guard is app-level**, run on every entry on import. REJECTED: JSZip (~95KB, heavier).
- **D9-03: Ship a SHA-256 integrity manifest.** `manifest.json` carries a SHA-256 per record block (articles / highlights / notes / locations / preferences). The importer recomputes and reports any mismatch ("bundle may be corrupted — N records failed integrity") via the `.status` live region in the calm voice; a corrupted bundle is refused (the atomic transaction never starts). Computed via `crypto.subtle.digest` (no new dep). Detects USB-stick / file-share corruption + accidental truncation (FEATURES L228 SMALL differentiator; ARCHITECTURE L662 "optional" → made concrete). The manifest itself is NOT a security boundary (no encryption / signing against a malicious actor — that's deferred to v3 alongside accounts); it's a corruption/tampering **detection** surface.
- **D9-04: Bundle envelope shape follows ARCHITECTURE Pattern 7.** `ExportBundleSchema = z.object({ schemaVersion: z.literal(1), exportedAt, appVersion, articles: ArticleSchema[], locations: LocationRecordSchema[], highlights: HighlightRecordSchema[], notes: NoteRecordSchema[], preferences: ReaderSettingsSchema (always present — D9-12), fixtureIds: z.array(z.string()) })`. `schemaVersion: 1` is the PORT-01/02 versioning hook: an importer that sees a higher `schemaVersion` than it understands refuses with "This bundle was exported by a newer Lem Reader version. Please update." — **no silent partial import** (forward-compat gate, Pitfall 11 #1). `appVersion` is diagnostic only. (The `books` / `tags` / `articleTags` optional fields in Pattern 7 are for Phases 8/12; Phase 9 emits an empty/absent set — tags are document-tags denormalized on `articles`, so they travel inside each `ArticleSchema.tags` already.)
- **D9-05: Export delivery is `Blob + <a download>`.** The zip is built as a `Blob` (fflate `zipSync` / `zip` async) and downloaded via a synthesized `<a download="lem-reader-bundle-v1.zip">`. Cross-browser (all 3 acceptance engines). Pitfall 11 #7 streaming (`showSaveFilePicker` + `createWritable`) is a **known limit for very large libraries** — documented as deferred; prototype-scale libraries build and download near-instantly. No File System Access API dependency.

### Highlights-only Markdown export (PORT-03 / SC#3)

- **D9-06: Ship BOTH library-wide and per-article highlights export.** Library-wide: a Settings-panel "Export all highlights" action produces one combined `.md` sectioned by article (`## Article title` per article with highlights). Per-article: an ArticleView "Export highlights" action produces a single-article `.md`. Both use the SAME fixed template scoped to one article or the whole set. (Per-tag variant defers to Phase 10's review panel.) FEATURES L225 names per-article export as a differentiator (SMALL); the shared template makes the marginal cost one extra affordance.
- **D9-07: Fixed built-in template (NOT reader-editable).** One calm template authored by us using locked variables — `{{title}}`, `{{author}}`, `{{source}}`, `{{highlights[]}}` (each carrying `{exact, note?, articleTitle, author?, sourceUrl?, status?}`), `{{notes[]}}`. SC#3's "with template variables" is satisfied literally: the variables exist and are named; the template structure is ours. No template-edit UI, no template store, no malformed-template recovery. REJECTED for Phase 9: reader-editable Jinja2-style template (FEATURES L238 "model") — adds a template store + edit UI + render-validation surface; justifies its weight only if readers actually customize, which is unproven. (If a later phase enables editability, the variable contract here is the stable foundation.)
- **D9-08: Highlight rendering = blockquote + citation.** Each highlight renders as a Markdown blockquote with the citation on its own line and the note (when present) as a subsequent line. Visually distinct from body text; matches Readwise/Obsidian convention. The exact Markdown punctuation + whitespace is **planner**; the variable contract (blockquote-per-highlight + citation + optional note) is locked here. Example shape:
  ```
  > The highlighted passage.
  > — Author, *Title*
  > Note: the reader's note.
  ```
- **D9-09: Honest inclusion of ambiguous/orphan highlights.** Confident highlights render unmarked. Ambiguous highlights render with a subtle marker (e.g. an italic `_[approx]_` prefix — **exact glyph is planner**) so the reader knows the anchor was imprecise. Orphan highlights (article missing) render from their stored `TextQuoteSelector.exact` text with an `[orphan]` marker. A footer line notes the counts ("3 highlights · 1 ambiguous · 1 orphan"). **Never silently dropped** — preserves the reader's intellectual work and honors the project's never-silent ethos (ANNO-07 extended to the export surface). REJECTED: "confident only + count note" (silently loses the reader's notes on ambiguous/orphan highlights).

### Export/Import UI placement & flow (PORT-01/02/03)

- **D9-10: Whole-library controls live in the Settings panel.** A "Your data" cluster in the existing Settings panel houses **Export library bundle**, **Import bundle**, and **Export all highlights** — grouped with the existing `WipeConfirm`. Keeps the library header spare (`IngestControl` only — the shelf stays calm); groups all infrequent data actions in one place; mirrors the precedent that data ops (wipe) live in settings, not on the shelf. REJECTED: a library-header "Export / Import" affordance (adds chrome; import is not the everyday "add an article" gesture that `IngestControl` serves).
- **D9-11: Import flow = dry-run preview + bulk per-kind overrides, in a native `<dialog>`.** Step 1: reader picks a file (`<input type="file" accept=".zip">`); the importer unzips (Zip Slip guard on every entry), validates the whole bundle with `ExportBundleSchema` + per-record schemas, recomputes the manifest (refuse on corruption), and runs the **dry-run conflict-detection pass** against existing local state (by primary key — see Pattern 7's conflict table: article-revision, article-content-divergence, highlight-id, note-id, location). Step 2: the preview `<dialog>` shows the `ImportPreview` (added counts, skipped, conflicts grouped by kind, warnings) + **a small set of bulk override toggles per conflict kind** (Skip-all [default] / Overwrite-all / Keep-both). Step 3: on Proceed, all writes apply in a **single Dexie transaction** (atomic); a result summary announces via `.status`. Satisfies SC#2's "per-entity reader overrides" at the **entity-KIND level** without a per-row merge screen (FEATURES L229 defers the heavy merge UI). The dialog is a **structural clone** of `RemoveConfirm`/`WipeConfirm` (Pitfall 8 isolation — the destructive write call site stays in its own handler), not a shared dialog.
- **D9-12: Preferences always exported; the apply choice is made at import.** The bundle always carries `preferences` (~5 fields, negligible size — no export-side opt-in modal, no export-side step). The **import preview** offers an "Apply imported reading preferences?" choice, defaulting sensibly by device state (apply on a fresh/empty device; skip on a device that already has local prefs — detected by whether a `reader-prefs` row exists). Moves the device-specificity decision to where it's meaningful (the importing device) and keeps export one-click. REJECTED: export-side "include preferences?" checkbox (research said "reader chooses at export time" — but device-specificity is an import-side concern); exclude-by-default (splits the cross-device story).
- **D9-13: Eager tri-state re-resolution at import.** For each imported highlight, the importer runs `resolveQuoteSelector` against the imported article's `normalizeText` to recompute the confident/ambiguous/orphan tri-state **before** the write. The dry-run preview can then honestly report "N highlights will import as ambiguous / M as orphan." SC#4 is satisfied at import time (not deferred to first open). Cost is O(highlights) resolution — prototype-scale libraries are instant; the known scale limit is the same one that bounds export (D9-05, Pitfall 11 #7). REJECTED: "trust the bundle's persisted state + re-resolve lazily on first open" (defers the honesty signal past the preview).

### Conflict resolution depth (pre-answered — user deferred this area)

- **D9-14: Skip-by-default + bulk per-kind overrides; per-row merge UI deferred.** Locked by FEATURES L229 ("Defer the heavy merge UI; v2.0 ships the report + skip-by-default") + SC#2's "per-entity reader overrides" reconciled at the entity-KIND level (D9-11). The conflict policy follows Pattern 7's table: article id-collision w/ different revision → keep higher revision (D-06 monotonic); same id+revision, different `originalHtmlHash` → flag as content-divergence (reader picks local/imported/both); highlight/note id-collision (rare, `crypto.randomUUID`) → keep both (new id on incoming); location `[articleId+revision]` collision → last-write-wins by `savedAt` (matches v1.0 location semantics). Default for every kind is **skip-and-report**; the bulk override toggles let the reader flip a whole kind to overwrite or keep-both. Never silently overwrite (Pitfall 11 #4).

### the agent's Discretion

- **Exact ZIP entry layout + inner JSON formatting** — whether `bundle.json` is pretty-printed or minified, whether the zip also carries a human `README.txt`, exact entry names. The contract (zip containing `bundle.json` + `manifest.json`, `schemaVersion: 1` envelope) is locked (D9-01/D9-03/D9-04); the layout details are researcher/planner.
- **`ExportBundleSchema` exact field set + Zod shape** — researcher confirms whether to omit the `books`/`articleTags` optional fields entirely vs include them as `.optional().default([])` for forward-compat; the envelope contract (D9-04) is locked.
- **Conflict detection implementation** — the dry-run pass is pure reads + primary-key comparisons; researcher/planner confirms whether it reuses `DexieLibrarySource` reads or queries `db.*` directly. The conflict table (D9-14) is locked; the implementation is open.
- **Exact Markdown template punctuation + whitespace** — the blockquote+citation+note shape (D9-08) and the variable contract are locked; the precise characters, section heading level for articles in the combined file, and citation punctuation are UI-SPEC/planner.
- **Exact copy** for the import preview labels, override toggle names, corruption message, "newer version" refusal, ambiguous/orphan markers — voice is locked (calm DOC-06); words are UI-SPEC/planner.
- **`.status` progress granularity** — "Exporting…" vs "Exporting N articles…" vs a bare terminal "Exported N articles to …". For prototype scale, terminal is likely enough; researcher/planner confirms.
- **Per-article export placement in ArticleView** — exactly where the "Export highlights" affordance mounts in the reader chrome (near TagEntry, in a menu, etc.). The contract (per-article highlights export exists, D9-06) is locked; the mount point is planner.
- **`appVersion` source** — read from `package.json` version at build time vs a constant; diagnostic only (D9-04), so the source is researcher discretion.
- **Manifest SHA-256 granularity** — per-record-block (articles/highlights/notes/locations/preferences) is the locked floor (D9-03); finer (per-record) is over-engineering the researcher should avoid unless free.

### Folded Todos
*None — `todo.match-phase 9` returned no matches.*

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project intent & requirements
- `.planning/PROJECT.md` — product vision; **Current Milestone: v2.0 Personal Library** ("v2.0 delivers cross-device highlights via versioned export/import instead" of accounts). Out of Scope (accounts/cloud sync/encrypted persistence; browser-extension packaging). Key Decisions (#9 honest full-suite execution discipline governs the round-trip + Zip Slip regression suites). The "calm, booklike" positioning governs every chrome decision here.
- `.planning/REQUIREMENTS.md` — **PORT-01, PORT-02, PORT-03 are this phase's requirements** (§Portability). PORT-01 = versioned bundle export; PORT-02 = import with validation + conflict reporting; PORT-03 = highlights-only Markdown export. The Phase 7/8-validated requirements (ING/LIB) are the locked substrate that must not regress. ACPT-06 (Phase 13) names the core flow `ingest → read → highlight → export → re-import` — Phase 9 makes the export→re-import leg possible.
- `.planning/ROADMAP.md` — Phase 9 goal + 4 success criteria (versioned whole-library bundle with `schemaVersion` + per-article source URLs; atomic import with Zod validation + dry-run preview + skip-by-default overrides + Zip Slip guard + filename sanitization; highlights-only Markdown with template variables; round-trip integrity with offsets surviving and page numbers absent). `**UI hint**: yes`. Depends on Phase 8.

### v2.0 milestone research (THE architecture authority for this phase — READ ALL THREE)
- `.planning/research/ARCHITECTURE.md` — **Pattern 7 — Versioned Export/Import Bundle** (L584-671: `ExportBundleSchema` shape, what serializes table, conflict-detection table, `ImportPreview` interface, schema-version negotiation, bundle integrity, trade-offs). File-tree (L119-164: `src/portability/{ExportImportService.ts, bundle.ts, conflicts.ts}` NEW; `tests/e2e/portability/`). Data-flow diagram (L63-64: `ExportImportService` — bundle serialize/parse/validate/conflict-detect). The `server/portability/` sketch (L185) is shared pure code for a future cloud path — v2.0 runs client-side.
- `.planning/research/FEATURES.md` — **Feature Area 4 — Versioned Export/Import** (L204-264: table stakes — whole-library export, versioned schema, validation, conflict reporting, round-trip integrity, per-article source URL; differentiators — per-article export, highlights-only Markdown, preferences-only export, bundle signing, conflict-resolution UI, merge semantics; anti-features — cloud sync, OPF/EPUB-fragment export, specific note-app formats, encrypted bundles). Bundle-format recommendation L241-256. Feature dependencies L258-264 (requires STATE-04 versioned records, ANNO-06 canonical-text selectors NOT page numbers, DOC-04 stable identity).
- `.planning/research/PITFALLS.md` — **Pitfall 11 — Export/Import: Version Skew, Partial Imports, and Zip Slip** (L332-365: 8 mitigations — versioned envelope, validate-before-write, atomic Dexie transaction, explicit per-entity conflict policy, Zip Slip prevention, filename sanitization, streaming/chunked export, orphan-tolerant import; warning signs; phase attribution). Pitfall 8 (Dexie migration discipline — shared atomic-transaction discipline; Phase 9 writes through existing stores, no version bump expected).

### Prior-phase contracts this phase extends
- `.planning/phases/07-ingestion-substrate/07-CONTEXT.md` — D7-04 (calm DOC-06 voice — locked for all import disclosure), D7-07 (dedupe-refuse — the import conflict table mirrors this "never silently overwrite" posture), the load-bearing invariant (ingested = fixture to the reading engine — an imported article/highlight must round-trip identically).
- `.planning/phases/08-markdown-pipeline-and-personal-library/08-CONTEXT.md` — D8-13/D8-14 (cascade-remove atomicity + RemoveConfirm confirmation precedent — the import-write + import-preview dialog mirror these), the Settings-panel-as-data-home precedent (where WipeConfirm lives, D9-10 extends), the `compositeLibraryRepository`/`DexieLibrarySource` write-side surface the importer reuses.
- `.planning/milestones/v1.0-phases/05-durable-highlights-and-notes/05-CONTEXT.md` — D5-01..D5-04 (TextPositionSelector + TextQuoteSelector + resolveQuoteSelector tri-state — the SC#4 re-anchoring machinery; the "never silently re-attach" honesty that D9-09 + D9-13 extend to the export/import surface).

### Source code contracts (READ before implementing)
- `src/content/schema.ts` — **the validation surface.** `ArticleSchema`, `Provenance` (sourceUrl `.optional()`), `HighlightRecordSchema` (carries `TextPositionSelectorSchema` + `TextQuoteSelectorSchema`), `NoteRecordSchema`, `LocationRecordSchema`, `ReaderSettingsSchema` (schemaVersion union [1,2]). Every bundle record is validated by these on import. The NEW `ExportBundleSchema` (D9-04) is added here (or in `src/portability/bundle.ts` — researcher's call) composing these existing schemas.
- `src/persistence/db.ts` — **the 5 stores the bundle reads/writes** (articles, settings, location, highlights, notes). Phase 9 writes through these at existing shapes; **no Dexie version bump expected** (Pitfall 9 — the importer writes v1/v2/v3/v4-compatible rows). The atomic-write precedent is `DexieLibrarySource.remove`'s single-transaction cascade.
- `src/content/normalizeText.ts` — **`resolveQuoteSelector` tri-state** (the SC#4 re-anchoring machinery — D9-13 calls this eagerly per imported highlight). `normalizeText` produces the text the selector resolves against. Pure functions, client-available, no DOM, no server.
- `src/ingestion/LibrarySource.ts` — **`DexieLibrarySource`** (`list/open` + `save/has/remove`) + **`compositeLibraryRepository`**. The importer's write path reuses this surface (or queries `db.*` directly inside one transaction — researcher confirms). `remove(id)` is the atomic-transaction precedent.
- `src/ingestion/library/RemoveConfirm.tsx` — **the native `<dialog>` destructive-confirmation precedent** the import preview dialog clones (Pitfall 8 structural-clone, not shared dialog). `WipeConfirm` (settings) is the data-management-dialog precedent.
- `src/ingestion/library/LibraryView.tsx` — the `#/` route. **Unchanged structurally** — export/import controls mount inside Settings, not on the library view. (Per-article highlights export mounts in ArticleView.)
- `src/persistence/settingsStore.ts` — the `reader-prefs` record (single composite under key `"reader-prefs"`). D9-12: the importer's "apply imported preferences?" choice writes through this store; the "fresh device" detection reads its presence.
- `src/persistence/locationStore.ts` — `loadAllLocations` (the export-side read of all positions) + the write path the importer uses. Location collision = last-write-wins by `savedAt` (D9-14, matches v1.0 semantics).
- `src/persistence/highlightsStore.ts` + `src/persistence/notesStore.ts` — the export-side reads (all highlights/notes) + the import-side writes (inside the atomic transaction).
- `src/App.tsx` + `src/routes/ArticleView.tsx` — the per-article "Export highlights" affordance (D9-06) mounts in ArticleView's chrome (exact point is planner).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`compositeLibraryRepository` + `DexieLibrarySource`** (`src/ingestion/LibrarySource.ts`) — the export-side read surface (`list()` for articles; the stores for highlights/notes/locations/preferences) AND the import-side write surface. `remove(id)`'s single-transaction cascade is the atomic-write precedent the importer mirrors (one `db.transaction(...)` across all 5 stores).
- **Per-record Zod schemas** (`src/content/schema.ts`) — the bundle's validation surface. `ExportBundleSchema` composes `ArticleSchema` + `HighlightRecordSchema` + `NoteRecordSchema` + `LocationRecordSchema` + `ReaderSettingsSchema`; no new record shapes to invent.
- **`resolveQuoteSelector` + `normalizeText`** (`src/content/normalizeText.ts`) — the SC#4 re-anchoring machinery. D9-13 calls this eagerly per imported highlight inside the dry-run pass. Pure, client-only.
- **`WipeConfirm` + `RemoveConfirm`** — the native `<dialog>` destructive-confirmation precedents. The import preview+confirm dialog is a structural clone (Pitfall 8 isolation); the export action reuses the `.status` live region for its result.
- **`.status` live region** (D2-13, mounted in `LibraryView`) — the calm surface where export/import progress + result + corruption + "newer version" refusal announce (A11Y-08).
- **`shortHash` / SHA-256 precedent** — `crypto.subtle.digest` is the manifest-hash primitive (D9-03); no new hashing dep (Phase 7/8 used `shortHash` over content for ids — the manifest uses full SHA-256).
- **`cascade-remove` Dexie transaction pattern** (`DexieLibrarySource.remove`) — the exact `db.transaction('rw', db.articles, db.highlights, db.notes, db.location, ..., async () => {...})` shape the atomic import copies (writes to all stores in one tx).

### Established Patterns
- **Zod-at-boundary validation** — every bundle record is validated by its existing schema on import; `ExportBundleSchema.parse()` gates the whole envelope before any write (Pitfall 11 #2).
- **Atomic Dexie transaction for multi-store writes** — import mirrors the cascade-remove precedent; `setTimeout`/async side-effects inside the tx are FORBIDDEN (Pitfall 11 #3).
- **W3C selectors over the grapheme substrate** — page numbers / DOM Range / XPath never appear in the bundle (SC#4); `TextPositionSelector` + `TextQuoteSelector` are the only anchor shape.
- **Pitfall 9 (Dexie version discipline)** — Phase 9 writes through existing stores at existing shapes; no version bump expected.
- **Calm DOC-06/PAGE-09 voice** for all disclosure — zero new vocabulary.
- **React state/context, no Redux/Zustand** — export/import UI state is local; Dexie is the persistence seam.
- **Authored CSS + custom properties, no Tailwind** — the export/import chrome inherits existing tokens.
- **Structural clone over shared dialog** (Pitfall 8) — the import dialog is its own component, not a generic "confirm" dialog; the destructive write call site stays isolated in its own handler.
- **Playwright across Chromium/Firefox/WebKit for truth** — the round-trip integrity test (SC#4) + Zip Slip regression (SC#2) are real-browser e2e gates, not unit-only.

### Integration Points
- **`src/portability/ExportImportService.ts`** (NEW) — bundle serialize / parse / validate / conflict-detect / atomic-apply. Pure functions over the existing schemas + `DexieLibrarySource`. Called by the Settings-panel controls.
- **`src/portability/bundle.ts`** (NEW) — `ExportBundleSchema` (Zod) + `ExportBundle` type. Composes the existing record schemas (D9-04).
- **`src/portability/conflicts.ts`** (NEW) — the dry-run conflict-detection pass + `ImportPreview` result (Pattern 7's interface) + bulk per-kind override resolution (D9-11, D9-14).
- **`src/portability/markdown.ts`** (NEW) — the fixed highlights-only Markdown template renderer (D9-06/D9-07/D9-08/D9-09). Pure `(highlights, article) => string`.
- **Settings panel** (`src/persistence/...` SettingsContext) — "Your data" cluster: Export library bundle / Import bundle / Export all highlights (D9-10). Joins `WipeConfirm`.
- **ArticleView** (`src/routes/ArticleView.tsx`) — per-article "Export highlights" affordance (D9-06).
- **`fflate`** (NEW dep, `package.json` dependencies) — zip/unzip (D9-02). ~8KB.
- **`tests/e2e/portability/`** (NEW) — round-trip integrity (SC#4), Zip Slip regression (SC#2), atomic-rollback-on-failure, conflict-preview, manifest-corruption-refusal, newer-schemaVersion-refusal.

</code_context>

<specifics>
## Specific Ideas

- **"Cross-device without accounts" is the load-bearing promise.** The bundle IS the v2.0 sync story. Every decision favors a self-contained, honest, corruption-detecting, atomic file over a cleverer protocol: ZIP (standard, asset-ready) over `.json.gz` (compression-only); SHA-256 manifest (detect corruption) over trust; atomic single-transaction import over incremental writes; skip-by-default + bulk overrides over a per-row merge UI. If a future phase proposes real-time sync or encryption, that decision should re-litigate the "in lieu of accounts" framing in PROJECT.md, not silently accrete.
- **The reader's intellectual work is the point of the highlights export.** Honest inclusion (D9-09) means an ambiguous or orphan highlight is NEVER silently dropped from the Markdown — its note would be lost. The subtle `[approx]` / `[orphan]` markers carry the honesty that the reading engine already enforces (ANNO-07) out to the external-tool surface. Calm voice, not alarm.
- **The Zip Slip guard is a hard gate, not a defensive no-op.** SC#2's language ("on every archive entry") is why the bundle is a ZIP rather than plain JSON (D9-01). The regression test with `../../evil.sh` + `..%2F..%2Fevil.sh` entries is a phase-exit criterion — a Lem Reader bundle must refuse directory-traversal entries even though Phase 9 itself emits no such entries (the guard protects against a maliciously-crafted or corrupted archive).
- **Round-trip integrity is the integration truth (SC#4).** Export on machine A → import on machine B → every highlight re-resolves to confident (or surfaces honestly as ambiguous/orphan via D9-13 eager re-resolution). Page numbers never appear in the bundle (they're ephemeral; the grapheme substrate is durable). This is the ANNO-05/07 anchor-stability invariant extended across machines.
- **The Settings panel is the "Your data" room; the library shelf stays calm.** Grouping export/import/wipe in Settings (D9-10) keeps the library header as the "what am I reading" surface and isolates infrequent data actions — mirroring the WipeConfirm precedent. A reader exporting their library to move devices is doing data-management, not browsing.
- **The fixed template is the SC#3-safe default; editability is a deferred power-user affordance.** The variable contract (`title`/`author`/`source`/`highlights[]`/`notes[]`) is the stable foundation a future editable template would build on — locking it now (D9-07) means a later Phase can add editability without re-designing the export shape.

</specifics>

<deferred>
## Deferred Ideas

None raised that were out of scope. Items explicitly belonging to later phases (confirmed, not new):
- **Annotation review panel** (RECV-01) + **per-tag highlights export** — **Phase 10**. The per-tag export variant pairs with the cross-article review surface there.
- **PDF intake / EPUB intake** — **Phases 11 / 12** (ING-04 / ING-05). The ZIP bundle format (D9-01) is chosen partly to be forward-compatible with bundling cover/figure image assets in those phases; Phase 9 ships no image entries.
- **POLISH-01/02 + NVDA+Firefox + v2.0 core-flow acceptance (ACPT-05/06)** — **Phase 13**. ACPT-06's `ingest → read → highlight → export → re-import` flow becomes acceptance-closeable there once Phase 9 makes the export→re-import leg real.
- **Accounts, cloud sync, encrypted bundles, real-time merge semantics** — PROJECT.md Out of Scope (deferred to v3+). Versioned export/import IS the v2.0 cross-device story.
- **Reader-editable Markdown template (Readwise Jinja2 model)** — Phase 9 ships the fixed built-in template (D9-07); editability deferred until readers ask. The variable contract here is the foundation.
- **Per-row conflict merge UI** — Phase 9 ships report + skip-by-default + bulk per-kind overrides (D9-11/D9-14); the heavy per-row review screen is deferred per FEATURES L229.
- **Streaming / chunked export (File System Access API `showSaveFilePicker`)** — Phase 9 ships cross-browser `Blob + <a download>` (D9-05); streaming for very large libraries is a known limit deferred per Pitfall 11 #7.
- **Bundle signing / encryption** — Phase 9 ships a SHA-256 **detection** manifest (D9-03), not a cryptographic **signing** surface; encryption/signing against a malicious actor defers to v3 alongside accounts.
- **Preferences-only export / per-article whole-bundle export** — FEATURES L225/L227 differentiators; Phase 9 ships whole-library bundle + whole-and-per-article highlights only. Per-article whole-bundle export (single article + its highlights/notes/location) is a straightforward subset reuse for a later phase.
- **Merge semantics (library union rather than overwrite across devices)** — FEATURES L230 LARGE; a sync surrogate, deferred to v3.
- **OPF / EPUB-fragment export / direct note-app integrations (Anki/Roam/Logseq)** — FEATURES anti-features L237/L238; the general Markdown template (D9-07) is the alternative.

</deferred>

---

*Phase: 9-versioned-export-import*
*Context gathered: 2026-08-13*
