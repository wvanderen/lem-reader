# Phase 9: Versioned Export/Import - Research

**Researched:** 2026-08-14
**Domain:** Client-side archive (ZIP) serialization + atomic IndexedDB import + Markdown generation over the existing Dexie/Zod/selector substrate
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Carrying forward (locked by v1.0 + Phases 7/8 — do NOT re-litigate):**

- **Doc model is the security boundary** — the bundle is plain validated JSON; React renders Block JSON, never HTML. `dangerouslySetInnerHTML` exists nowhere. No new XSS surface from export (it's read-only serialization of validated records).
- **W3C selectors over the grapheme substrate** — highlights carry `TextPositionSelector` + `TextQuoteSelector` (D5-03). Persisting/transporting DOM Range / XPath / page-number / pixel anchors is FORBIDDEN.
- **Pitfall 9 (Dexie version discipline)** — import writes through the existing stores at their existing shapes; **no Dexie version bump is required for Phase 9** (the importer writes v1/v2/v3/v4-compatible rows; no new stores, no new indexes). If a schema bump is contemplated, it must be additive-only.
- **Calm DOC-06/PAGE-09 voice** for all disclosure (D7-04) — import conflicts, corruption, "exported by a newer version," orphan highlights. Zero new disclosure vocabulary.
- **React state/context, no Redux/Zustand** — export/import UI state flows through React local state; Dexie is the persistence seam.
- **Authored CSS + custom properties, no Tailwind** — the export/import chrome inherits existing tokens.
- **Playwright across Chromium/Firefox/WebKit for truth** — the round-trip integrity test (SC#4) + Zip Slip regression (SC#2) extend this discipline. DOM emulators are not authoritative.

**Bundle archive format (PORT-01):**

- **D9-01: ZIP archive is the bundle format.** The bundle is a **`lem-reader-bundle-v1.zip`** containing `bundle.json` (the versioned records envelope) + `manifest.json` (the SHA-256 integrity manifest). REJECTED: single `.json`; `.json.gz`.
- **D9-02: fflate is the zip library.** ~8KB min+gz, pure-JS, sync + async zip/unzip. Pitfall 11 #5 applies regardless of lib: **fflate exposes entry names unsanitized — the Zip Slip guard is app-level**, run on every entry on import. REJECTED: JSZip (~95KB, heavier).
- **D9-03: Ship a SHA-256 integrity manifest.** `manifest.json` carries a SHA-256 per record block (articles / highlights / notes / locations / preferences). The importer recomputes and reports any mismatch ("bundle may be corrupted — N records failed integrity") via the `.status` live region in the calm voice; a corrupted bundle is refused (the atomic transaction never starts). Computed via `crypto.subtle.digest` (no new dep). The manifest is a corruption/tampering **detection** surface, NOT a security boundary (no encryption/signing — deferred to v3).
- **D9-04: Bundle envelope shape follows ARCHITECTURE Pattern 7.** `schemaVersion: 1` literal, `exportedAt`, `appVersion` (diagnostic only), `articles`/`locations`/`highlights`/`notes` arrays, `preferences` always present (D9-12), `fixtureIds: string[]`. Higher `schemaVersion` → refuse with "This bundle was exported by a newer Lem Reader version. Please update." — **no silent partial import**.
- **D9-05: Export delivery is `Blob + <a download>`.** Cross-browser (all 3 acceptance engines). Streaming (File System Access API) is a documented deferred limit.

**Highlights-only Markdown export (PORT-03 / SC#3):**

- **D9-06: Ship BOTH library-wide and per-article highlights export**, same fixed template. Library-wide in Settings; per-article in ArticleView.
- **D9-07: Fixed built-in template (NOT reader-editable).** Locked variables: `{{title}}`, `{{author}}`, `{{source}}`, `{{highlights[]}}` (each `{exact, note?, articleTitle, author?, sourceUrl?, status?}`), `{{notes[]}}`.
- **D9-08: Highlight rendering = blockquote + citation + optional note line.** Exact punctuation is planner.
- **D9-09: Honest inclusion of ambiguous/orphan highlights.** Subtle markers (e.g. italic `_[approx]_` / `[orphan]` — exact glyph planner). Footer counts line. **Never silently dropped.**

**Export/Import UI placement & flow (PORT-01/02/03):**

- **D9-10: Whole-library controls live in the Settings panel** — a "Your data" cluster: Export library bundle / Import bundle / Export all highlights, grouped with `WipeConfirm`.
- **D9-11: Import flow = dry-run preview + bulk per-kind overrides, in a native `<dialog>`.** File pick (`accept=".zip"`) → unzip (Zip Slip guard on every entry) → full Zod validation → manifest recompute (refuse on corruption) → dry-run conflict pass → preview `<dialog>` (added counts, conflicts by kind, warnings, bulk toggles Skip-all [default] / Overwrite-all / Keep-both) → Proceed applies in a **single Dexie transaction** → result via `.status`. Dialog is a **structural clone** of `RemoveConfirm`/`WipeConfirm` (Pitfall 8 isolation).
- **D9-12: Preferences always exported; the apply choice is made at import** (default by fresh-device detection: apply on fresh/empty device, skip when a `reader-prefs` row exists).
- **D9-13: Eager tri-state re-resolution at import.** Every imported highlight runs `resolveQuoteSelector` against the imported article's `normalizeText` BEFORE the write; the preview honestly reports "N ambiguous / M orphan."
- **D9-14: Skip-by-default + bulk per-kind overrides; per-row merge UI deferred.** Conflict table: article id-collision different revision → keep higher revision; same id+revision different `originalHtmlHash` → content-divergence flag; highlight/note id-collision → keep both (new id); location collision → last-write-wins by `savedAt`. Default for every kind is **skip-and-report**. Never silently overwrite.

### the agent's Discretion

- **Exact ZIP entry layout + inner JSON formatting** — pretty vs minified `bundle.json`, human `README.txt` or not, exact entry names. Contract (zip containing `bundle.json` + `manifest.json`, `schemaVersion: 1` envelope) is locked.
- **`ExportBundleSchema` exact field set + Zod shape** — whether to omit the `books`/`articleTags` optional fields entirely vs include them as `.optional().default([])` for forward-compat.
- **Conflict detection implementation** — reuse `DexieLibrarySource` reads or query `db.*` directly.
- **Exact Markdown template punctuation + whitespace** — precise characters, heading level for articles in the combined file, citation punctuation.
- **Exact copy** for preview labels, override toggle names, corruption message, "newer version" refusal, ambiguous/orphan markers.
- **`.status` progress granularity** — "Exporting…" vs terminal-only summary. For prototype scale, terminal is likely enough.
- **Per-article export placement in ArticleView** — exact mount point in reader chrome.
- **`appVersion` source** — package.json version at build time vs constant. Diagnostic only.
- **Manifest SHA-256 granularity** — per-record-block is the locked floor; finer is over-engineering to avoid.

### Deferred Ideas (OUT OF SCOPE)

- **Annotation review panel (RECV-01) + per-tag highlights export** — Phase 10.
- **PDF intake / EPUB intake** — Phases 11 / 12 (ZIP format is forward-compatible with bundling image assets; Phase 9 ships NO image entries).
- **POLISH-01/02 + NVDA+Firefox + ACPT-05/06** — Phase 13.
- **Accounts, cloud sync, encrypted bundles, real-time merge semantics** — PROJECT.md Out of Scope (v3+).
- **Reader-editable Markdown template (Readwise Jinja2 model)** — fixed template ships; editability deferred until readers ask.
- **Per-row conflict merge UI** — report + skip-by-default + bulk overrides ships; heavy merge screen deferred.
- **Streaming / chunked export (File System Access API)** — `Blob + <a download>` ships; streaming for very large libraries deferred.
- **Bundle signing / encryption** — SHA-256 detection manifest only.
- **Preferences-only export / per-article whole-bundle export / merge semantics (library union)** — later phases.
- **OPF / EPUB-fragment export / direct note-app integrations** — anti-features.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PORT-01 | Reader can export their library + highlights + notes + reading positions + preferences as a versioned bundle | All five record sources exist as Zod-validated Dexie stores (`src/persistence/db.ts`); `ExportBundleSchema` composes the existing record schemas; fflate `zipSync` + `Blob + <a download>` delivery (verified APIs); SHA-256 manifest via `crypto.subtle.digest` (codebase precedent `server/safeFetch.ts` L94) |
| PORT-02 | Reader can import a compatible bundle with validation and conflict reporting | Full pre-write validation pipeline (unzip → Zip Slip guard → envelope parse → per-record Zod → manifest recompute → dry-run conflict pass → eager tri-state re-resolution); atomic apply in one Dexie transaction mirroring `DexieLibrarySource.remove`'s 4-store cascade extended to 5 stores; `<dialog>` preview UI cloning `RemoveConfirm` |
| PORT-03 | Reader can export just their highlights (e.g., as Markdown) for use outside the reader | Pure template-render function over (articles, highlights, notes) with locked variable contract (D9-07); tri-state honest inclusion (D9-09); `resolveQuoteSelector` for live status; `Blob + <a download>` delivery reusing the same download helper |
</phase_requirements>

## Summary

Phase 9 is a **serialization + validation + atomic-write phase over an already-shipped substrate**. Every record type the bundle carries already exists as a Zod-validated Dexie row (`ArticleSchema`, `HighlightRecordSchema`, `NoteRecordSchema`, `LocationRecordSchema`, `ReaderSettingsSchema` in `src/content/schema.ts`); every store the importer writes already exists at v4 with no version bump needed (`src/persistence/db.ts`); the re-anchoring machinery (`resolveQuoteSelector` tri-state over `normalizeText`) is pure and client-available (`src/annotations/resolution.ts`); and the atomic-write precedent (`DexieLibrarySource.remove`'s single-transaction cascade across 4 stores) is the exact shape the importer mirrors, extended to 5 stores by adding `db.settings`. The new surface is small and well-bounded: `src/portability/{bundle.ts, ExportImportService.ts, conflicts.ts, markdown.ts}` + a Settings-panel "Your data" cluster + an ArticleView per-article export affordance + `tests/e2e/portability/`.

The only new dependency is **fflate** (verified: 0.8.3 current, 67M weekly downloads, repo `github.com/101arrowz/fflate`, no postinstall, legitimacy verdict OK — used internally by Vite). Its API is verified from the official README: `zipSync(obj) → Uint8Array`, `unzipSync(bytes) → { [entryName]: Uint8Array }` with **flat, unsanitized entry-name keys** — confirming CONTEXT D9-02's warning that the Zip Slip guard must be app-level. One load-bearing research finding: **SC#2's `path.resolve + startsWith` language names a Node API that does not exist browser-side** — the guard must be implemented as a pure string-normalization function with identical semantics (resolve `.`/`..` segments virtually, reject escapes, backslashes, drive letters, NUL bytes, OS-reserved names, URL-encoded separators), and the mandatory regression corpus (`../../evil.sh`, `..%2F..%2Fevil.sh`) exercises it.

The critical design subtleties the planner must encode: (1) **manifest hash determinism** — per-block hashes must be computed over `JSON.stringify(zodParsed.<block>)` on BOTH export and import sides so key order and whitespace are byte-identical; (2) **nothing async-non-Dexie inside the import transaction** — `crypto.subtle.digest`, Zod parsing, and re-resolution all complete BEFORE `db.transaction("rw", ...)` opens; (3) **fixture-referencing highlights** — highlights keyed to bundled fixture articles resolve against the local fixture copy (or surface as orphan on fixture-version skew), so the eager re-resolution article lookup must span imported articles ∪ local Dexie articles ∪ bundled fixtures; (4) **`crypto.subtle` requires a secure context** (localhost:5173 dev + HTTPS hosting are both fine — a defensive check with calm error surface is still warranted). Two small additive reads are missing: `loadAllHighlights()` and `loadAllNotes()` bulk loaders (mirroring `loadAllLocations()`), which the export side needs.

**Primary recommendation:** Build `src/portability/` as four pure modules (bundle schema + service + conflicts + markdown) with the dialog UI as a structural `RemoveConfirm` clone; keep ALL validation, hashing, and re-resolution outside the single Dexie write transaction; implement the Zip Slip guard as a pure `isSafeEntryName()` function with the mandated evil-entry regression corpus; prove SC#4 round-trip in Playwright across all three engines using a two-browser-context "machine A / machine B" harness with Playwright's download capture.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Bundle serialization (read all stores → envelope → zip bytes) | Client (browser SPA) | — | Local-first; all data is already client-side in IndexedDB; no server involved |
| Bundle download delivery (`Blob + <a download>`) | Client (browser platform) | — | `URL.createObjectURL` is Baseline Widely Available (MDN, since 2015); no File System Access API dependency |
| Archive zip/unzip | Client (`fflate`) | — | Pure-JS, tree-shakable, ~5–7KB for zip paths; verified API |
| Bundle validation (Zod) | Client (`src/content/schema.ts` schemas) | — | Schemas are the trust boundary (STATE-04 discipline); validate entire bundle before any write |
| Integrity manifest (SHA-256) | Client (`crypto.subtle.digest`) | — | Web Crypto is the platform primitive; codebase precedent in `server/safeFetch.ts` L94 |
| Zip Slip guard + filename sanitization | Client (`src/portability/`) | — | fflate exposes entry names unsanitized; app-level validation before any entry use |
| Conflict detection (dry-run pass) | Client (pure reads + PK comparison) | — | Read-only comparison of bundle records vs local stores by primary key |
| Atomic import apply | Client (Dexie transaction) | — | One `db.transaction("rw", ...)` across all 5 stores; rollback on any failure (Pitfall 11 #3) |
| Tri-state re-resolution at import | Client (`resolveQuoteSelector`) | — | Pure function over imported article's `normalizeText`; eager, before the write (D9-13) |
| Highlights Markdown rendering | Client (`src/portability/markdown.ts`) | — | Pure `(articles, highlights, notes) => string`; no DOM |
| Import preview + confirm UI | Client (React `<dialog>`) | — | Native dialog showModal; structural clone of RemoveConfirm (Pitfall 8) |
| Progress/result disclosure | Client (`.status` live region) | — | `role="status"` + `aria-live="polite"` + `aria-atomic="true"` — the D2-13 pattern used in 15+ existing components |
| Preferences apply choice | Client (import preview) | — | Fresh-device detection reads `reader-prefs` row presence; write via `settingsStore` shape |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fflate | 0.8.3 (pin exact) | ZIP archive + unzip for the versioned bundle | ~8KB min+gz total core, tree-shakable ESM (ZIP paths ~5–7KB); pure JS, browser + Node; used by Vite internally; 67M weekly downloads [VERIFIED: npm registry + github.com/101arrowz/fflate README] |
| zod | 4.4.3 (installed) | `ExportBundleSchema` envelope + per-record validation | Already the trust boundary (STATE-04); `safeParse` returns `.issues` for error-list surfacing |
| dexie | 4.4.4 (installed) | Atomic multi-store import transaction | `db.transaction("rw", ...tables)` gives all-or-nothing; the codebase precedent (`DexieLibrarySource.remove`) proves the shape |
| Web Crypto (`crypto.subtle`) | Browser platform | SHA-256 manifest digests | No new dep; Baseline; exact codebase precedent at `server/safeFetch.ts` L94 (`globalThis.crypto.subtle.digest("SHA-256", data)`) |
| `URL.createObjectURL` / `Blob` / `<a download>` | Browser platform | Export file delivery | Baseline Widely Available since July 2015 (MDN); cross-engine (chromium/firefox/webkit) [CITED: developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static] |
| Native `<dialog>` + `showModal()` | Browser platform | Import preview + confirm | The established WipeConfirm/RemoveConfirm/SettingsPanel/NotePopover pattern — free focus trap, Esc, inert backdrop |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `fake-indexeddb` | 6.2.5 (installed, devDep) | Unit-test Dexie transactions without a browser | Atomic-rollback + round-trip unit tests; harness pattern proven in `tests/unit/ingestion-tags.test.ts` L16–50 |
| `@playwright/test` | 1.61.1 (installed, devDep) | Real-browser e2e truth | SC#2 Zip Slip regression, SC#4 round-trip, conflict-preview dialog flow; download capture via `page.waitForEvent("download")` |
| React Testing Library | 16.3.2 (installed, devDep) | Component tests for Settings cluster + preview dialog | Query by role/name; assert `data-initial-focus`, live-region text |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fflate | JSZip | ~95KB vs ~8KB; D9-02 explicitly rejected it |
| fflate sync API | fflate async Worker API | Async has ~50ms worker overhead and is slower under ~50kB payloads [VERIFIED: fflate README]; prototype-scale bundles are far under that — **use `zipSync`/`unzipSync`**; the async `zip`/`unzip` callbacks remain a documented upgrade path for large libraries |
| `Blob + <a download>` | File System Access API `showSaveFilePicker` | Not cross-browser (WebKit/Firefox); D9-05 explicitly deferred streaming |
| Per-block SHA-256 manifest | Whole-file single hash | Per-block localizes which records failed integrity (calmer, more honest reporting); whole-file is simpler but reports only "bundle corrupted" — per-block is the locked floor (D9-03) and costs ~nothing |

**Installation:**
```bash
npm install fflate@0.8.3
```

**Version verification (2026-08-14):** `npm view fflate version` → 0.8.3; published 2026-05-16; unpacked size ~797KB (full package incl. UMD builds — tree-shaken ESM import of `zipSync`/`unzipSync`/`strToU8`/`strFromU8` yields ~5–7KB min) [VERIFIED: npm registry].

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| fflate | npm | ~5 yrs (0.8.x line; actively maintained, published 2026-05-16) | 67,146,054/wk | github.com/101arrowz/fflate | OK | Approved |
| zod 4.4.3 | npm | installed | (existing dep) | (existing dep) | OK (pre-existing) | Approved |
| dexie 4.4.4 | npm | installed | (existing dep) | (existing dep) | OK (pre-existing) | Approved |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*`fflate` was cross-checked: `npm view` (exists, no postinstall script, not deprecated), `gsd-tools query package-legitimacy check` → verdict `OK`, and the official GitHub README was fetched and read this session. It is the compression library used internally by Vite — the project's own build tool.*

## Architecture Patterns

### System Architecture Diagram

```
                        EXPORT (PORT-01 / PORT-03)
┌──────────────────────────────────────────────────────────────────────┐
│ Settings panel ("Your data") / ArticleView (per-article)             │
│   [Export library bundle]  [Export all highlights]  [Export article  │
│      │                        │                      highlights]     │
│      ▼                        ▼                        ▼             │
│ ┌──────────────────────────────────────────┐  ┌────────────────────┐ │
│ │ ExportImportService.buildBundle()        │  │ markdown.ts        │ │
│ │  1. dexieLibrarySource.list()            │  │  renderHighlights( │ │
│ │     (Dexie articles only — NOT fixtures) │  │   articles,        │ │
│ │  2. loadAllHighlights()  ← NEW bulk read │  │   highlights,      │ │
│ │  3. loadAllNotes()       ← NEW bulk read │  │   notes) → string  │ │
│ │  4. loadAllLocations()   (exists)        │  │  (blockquote +     │ │
│ │  5. loadSettings()       (exists)        │  │   citation + note; │ │
│ │  6. fixtureIds ← ids referenced by       │  │   [approx]/[orphan]│ │
│ │     exported highlights/notes/locations  │  │   markers; footer  │ │
│ │     (fixtures themselves NEVER serialize)│  │   counts)          │ │
│ │  7. ExportBundleSchema.parse (self-check)│  └─────────┬──────────┘ │
│ │  8. SHA-256 per block (crypto.subtle)    │            │            │
│ │  9. zipSync({bundle.json, manifest.json})│            │            │
│ └──────────────┬───────────────────────────┘            │            │
│                ▼                                        ▼            │
│        Blob + <a download=…zip>              Blob + <a download=…md> │
│        (shared download helper; revokeObjectURL after tick)          │
│        result → .status live region (calm voice)                     │
└──────────────────────────────────────────────────────────────────────┘

                        IMPORT (PORT-02)
┌──────────────────────────────────────────────────────────────────────┐
│ Settings panel [Import bundle] → <input type="file" accept=".zip">   │
│   ▼                                                                   │
│ 1. file.arrayBuffer() → unzipSync(bytes) → { [name]: Uint8Array }    │
│ 2. Zip Slip guard on EVERY entry name (pure isSafeEntryName) ──────┐ │
│    any unsafe entry → REFUSE (calm .status; tx never starts)       │ │
│ 3. Required entries present? (bundle.json + manifest.json)  ◄──────┘ │
│ 4. JSON.parse → peek schemaVersion →                                 │
│    > 1 → REFUSE "exported by a newer Lem Reader version"             │
│ 5. ExportBundleSchema.safeParse → all issues as a LIST (Pitfall 11#2)│
│ 6. Recompute per-block SHA-256 vs manifest.json                      │
│    mismatch → REFUSE "bundle may be corrupted"                       │
│ 7. Dry-run conflict pass (pure reads, PK comparison, D9-14 table)    │
│ 8. Eager tri-state re-resolution per highlight (D9-13):              │
│    article lookup = imported ∪ local Dexie ∪ bundled fixtures        │
│    → confident | ambiguous | orphan counts                           │
│   ▼                                                                   │
│ Preview <dialog> (structural RemoveConfirm clone):                   │
│   added counts · conflicts by kind · warnings ·                       │
│   bulk toggles/kind: Skip-all (default) | Overwrite-all | Keep-both  │
│   "Apply imported reading preferences?" (fresh-device default)       │
│   [data-initial-focus] on non-destructive action (Pitfall 8)         │
│   ▼ Proceed                                                           │
│ db.transaction("rw", articles, highlights, notes, location, settings)│
│   → bulk puts only — NO crypto, NO parsing, NO setTimeout inside     │
│   any throw → ENTIRE import rolls back (atomic)                      │
│   ▼                                                                   │
│ result summary → .status live region                                 │
└──────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/portability/               # NEW — all pure, client-only, no DOM required for core
├── bundle.ts                  # ExportBundleSchema + ExportBundle type + APP_VERSION
├── ExportImportService.ts     # buildBundle / parseAndValidateBundle / applyImport (atomic tx)
├── zipSlip.ts                 # isSafeEntryName() pure guard + sanitzeFilename()
├── manifest.ts                # sha256Hex + computeManifest + verifyManifest
├── conflicts.ts               # dry-run pass + ImportPreview + per-kind override resolution
├── markdown.ts                # fixed highlights-only template renderer
└── download.ts                # shared Blob + <a download> helper
src/persistence/
├── highlightsStore.ts         # + loadAllHighlights() (NEW — mirrors loadAllLocations)
└── notesStore.ts              # + loadAllNotes() (NEW — mirrors loadAllLocations)
src/reader/
└── ImportPreviewDialog.tsx    # NEW — structural clone of RemoveConfirm (Pitfall 8)
src/reader/SettingsPanel.tsx   # "Your data" cluster joins WipeConfirm
src/routes/ArticleView.tsx     # per-article "Export highlights" affordance (mount point: planner)
tests/unit/portability/        # NEW — schema, zipSlip, manifest, conflicts, markdown, atomicity
tests/e2e/portability/         # NEW — round-trip, zip-slip regression, preview flow, refusals
```

### Pattern 1: Versioned Bundle Envelope (D9-04, ARCHITECTURE Pattern 7)

**What:** A single Zod schema composes the existing record schemas into the versioned envelope. `schemaVersion: z.literal(1)` is the versioning hook.

**When to use:** Both export (self-check before write) and import (gate before any write).

**Recommendation on the discretion items:**
- Omit `books` entirely (no Book record exists until Phase 12 — a `z.array(BookSchema)` would require inventing a schema now). Tags already travel inside each `ArticleSchema.tags` (denormalized D8-05), so `tags`/`articleTags` blocks are also omitted. Rationale: the `.optional().default([])` forward-compat form costs a second schema invention later anyway; absence is simpler and equally forward-compatible because the importer validates what IS there.
- `preferences: ReaderSettingsSchema` (always present, D9-12).
- Pretty-print `bundle.json` (2-space) — negligible size cost after DEFLATE, meaningful debuggability for a human inspecting their own data export; `manifest.json` minified is fine.
- `appVersion`: recommend the Vite `define` pattern (`vite.config.ts`: `define: { __APP_VERSION__: JSON.stringify(pkg.version) }` + `declare` in `src/vite-env.d.ts`) — no drift with package.json [ASSUMED — standard Vite pattern; verify at implementation].

```typescript
// src/portability/bundle.ts
import { z } from "zod";
import {
  ArticleSchema, HighlightRecordSchema, NoteRecordSchema,
  LocationRecordSchema, ReaderSettingsSchema,
} from "../content/schema";

export const ExportBundleSchema = z.object({
  schemaVersion: z.literal(1),              // PORT-01/02 versioning hook — forward-reject v2+
  exportedAt: z.string().datetime(),        // ISO-8601
  appVersion: z.string(),                   // diagnostic only (D9-04)
  articles: z.array(ArticleSchema),         // Dexie articles ONLY — fixtures never serialize
  locations: z.array(LocationRecordSchema),
  highlights: z.array(HighlightRecordSchema),
  notes: z.array(NoteRecordSchema),
  preferences: ReaderSettingsSchema,        // always present (D9-12)
  fixtureIds: z.array(z.string()),          // ids of bundled fixtures the reader's records reference
});
export type ExportBundle = z.infer<typeof ExportBundleSchema>;
```

### Pattern 2: The Zip Slip Guard (SC#2 hard gate — browser-context adaptation)

**What:** SC#2's language is `path.resolve + startsWith` — but Node's `path` module does not exist in browser code. The guard must be a **pure string function with identical semantics**: normalize the entry name by virtually resolving `.`/`..` segments, then reject if it escapes the root, plus every filename-sanitization rule from Pitfall 11 #5/#6.

**When to use:** On EVERY entry name returned by `unzipSync`, before any entry byte is read. Phase 9 extracts to memory only (no disk writes), but the gate protects the import contract and future asset-writing phases (11/12).

```typescript
// src/portability/zipSlip.ts — pure, unit-testable
const OS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

export function isSafeEntryName(rawName: string): boolean {
  // NUL bytes and control chars — refuse outright (Pitfall 11 #6)
  if (/[\0-\x1f]/.test(rawName)) return false;
  // Backslash = Windows separator smuggled into a POSIX-style name
  if (rawName.includes("\\")) return false;
  // Drive letters + absolute paths + home-relative
  if (/^[a-zA-Z]:/.test(rawName)) return false;
  if (rawName.startsWith("/") || rawName.startsWith("~")) return false;
  // URL-encoded separators (..%2F..%2Fevil.sh) — decode before judging
  let name: string;
  try { name = decodeURIComponent(rawName); } catch { return false; }
  if (name.includes("\\")) return false;
  // Virtual path.resolve: walk segments; ".." popping past root = traversal escape
  const stack: string[] = [];
  for (const seg of name.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (stack.length === 0) return false;      // escapes the virtual root — REJECT
      stack.pop();
    } else {
      if (OS_RESERVED.test(seg)) return false;   // Windows-reserved device names
      if (seg.includes(":")) return false;       // NTFS alternate data streams ("file.txt:$DATA")
      stack.push(seg);
    }
  }
  return stack.length > 0;                        // "" or "." alone is not a file entry
}

/** Sanitize a reader-facing download filename (per-article .md export derives
 *  it from article titles — strip separators, reserved names, control chars). */
export function sanitizeFilename(title: string, fallback: string): string {
  const cleaned = title
    .replace(/[\0-\x1f]/g, "")
    .replace(/[\/\\<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  if (!cleaned || OS_RESERVED.test(cleaned)) return fallback;
  return cleaned;
}
```

**The mandated regression corpus** (SC#2 phase-exit): `../../evil.sh`, `..%2F..%2Fevil.sh`, plus `/etc/passwd`, `C:\autoexec.bat`, `dir/../../evil.sh`, `con`, `..`, a NUL-containing name, and a valid `bundle.json` control. Unit-level (pure function) + one e2e that uploads a crafted malicious zip and asserts refusal.

### Pattern 3: Atomic Import — the 5-Store Transaction (SC#2, Pitfall 11 #3)

**What:** Every write applies in ONE Dexie transaction. The shape is `DexieLibrarySource.remove`'s cascade (`src/ingestion/LibrarySource.ts` L108–151) extended to include `db.settings` when preferences apply.

```typescript
// src/portability/ExportImportService.ts — the apply step ONLY.
// Everything async-non-Dexie (Zod, crypto.subtle, resolveQuoteSelector)
// completed BEFORE this function is called (see Pitfall 1 below).
export async function applyImport(
  plan: ResolvedImportPlan,   // output of conflicts.ts — every record pre-judged
): Promise<void> {
  const tables = plan.applyPreferences
    ? [db.articles, db.highlights, db.notes, db.location, db.settings]
    : [db.articles, db.highlights, db.notes, db.location];
  await db.transaction("rw", ...tables, async () => {
    for (const a of plan.articlesToWrite)   await db.articles.put(a);
    for (const h of plan.highlightsToWrite) await db.highlights.put(h);
    for (const n of plan.notesToWrite)      await db.notes.put(n);
    for (const l of plan.locationsToWrite)  await db.location.put(l);
    if (plan.applyPreferences) {
      await db.settings.put({ key: "reader-prefs", value: plan.preferences });
    }
  });
}
```

**Rules that make the transaction honest (Pitfall 11 #3):**
- NO `setTimeout`, NO `crypto.subtle`, NO network, NO Zod parsing inside the tx closure — only Dexie puts/deletes on the locked tables. Dexie rolls back on throw; stray microtasks can silently abort the tx.
- The **eager tri-state re-resolution** (D9-13) and conflict pass run pre-transaction; the plan object is fully computed data.
- Location writes use plain `put` rows shaped `LocationRecordRow` (compound PK derived from `articleId`+`revision` — the store derives it, no literal field).
- Keep-both for highlight/note id collisions: mint the new id (`crypto.randomUUID()`) in the plan (pre-tx), and rewrite the incoming note's `highlightId` FK when its highlight got a new id — notes follow their highlight.

### Pattern 4: Deterministic SHA-256 Manifest (D9-03)

**What:** `manifest.json` carries one SHA-256 hex digest per record block. The subtlety is **determinism**: both sides must hash byte-identical serializations.

```typescript
// src/portability/manifest.ts
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Web Crypto — codebase precedent: server/safeFetch.ts L94 uses the identical call.
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type Manifest = {
  algorithm: "sha256";
  blocks: Record<"articles" | "highlights" | "notes" | "locations" | "preferences", string>;
};

/** BOTH export and import call this over the SAME value: the Zod-parsed block.
 *  Contract: hashes cover JSON.stringify(zodParsed.<block>) — never raw file
 *  bytes, never the pre-parse object — so key order is Zod-deterministic on
 *  both sides. JSON round-trips preserve string-key insertion order, so a
 *  re-stringified parse is byte-identical. */
export async function computeManifest(bundle: ExportBundle): Promise<Manifest> {
  const entry = async (block: unknown) =>
    await sha256Hex(new TextEncoder().encode(JSON.stringify(block)));
  return {
    algorithm: "sha256",
    blocks: {
      articles: await entry(bundle.articles),
      highlights: await entry(bundle.highlights),
      notes: await entry(bundle.notes),
      locations: await entry(bundle.locations),
      preferences: await entry(bundle.preferences),
    },
  };
}
```

**Why hash the parsed block and not the raw entry bytes:** the importer must recompute from what it parsed; if export hashed exporter-object key order and import hashed parse-order, a benign reordering would false-positive as "corruption." Hashing `JSON.stringify(zodParsed.<block>)` on both sides makes the byte stream a function of the schema alone. (Integer-like top-level keys would reorder under ES numeric-key ordering — no bundle record has any, all keys are schema field names.)

### Pattern 5: Blob Download (D9-05)

```typescript
// src/portability/download.ts — shared by .zip and .md exports
export function downloadBlob(bytes: Uint8Array, filename: string, mime: string): void {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);           // Baseline since 2015 [CITED: MDN]
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;                            // e.g. "lem-reader-bundle-v1.zip"
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after a tick so the click dispatch completes in every engine
  // (immediate revoke can race in some WebKit versions) [ASSUMED — verify
  // in e2e across all three engines; degrade to setTimeout(0) if flaky].
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
```

### Pattern 6: Import Preview Dialog (D9-11, Pitfall 8 structural clone)

**What:** A native `<dialog role="alertdialog">` cloned structurally from `RemoveConfirm.tsx` — NOT a shared component. The discipline that must be preserved verbatim:
- `useEffect` syncs the `open` prop with `showModal()`/`close()`.
- Capture `document.activeElement` on open; restore focus in the `close` listener (Pitfall 1 — showModal does not auto-restore).
- Explicit `.focus()` on `[data-initial-focus]` after showModal (WebKit quirk — WipeConfirm L60–69 / RemoveConfirm L63–69 precedent).
- `[data-initial-focus]` on the NON-destructive action ("Cancel import"), never on Proceed.
- The destructive write (`applyImport`) fires ONLY in the Proceed button's `onClick` — never in a catch block, effect, or the file-pick handler.
- Body copy names the consequence in calm DOC-06 voice; conflicts/warnings render as grouped lists with counts.

**Bulk override toggles:** one three-state control per conflict kind (article-revision, article-content-divergence, highlight-id, note-id, location), default Skip-all. Per D9-14 the defaults are: article-revision → skip (report that higher-revision exists — auto-keep-higher is the resolution once the reader flips to Overwrite-all; the default report names which side wins), content-divergence → skip, highlight/note-id → skip (Keep-both mints new ids when flipped), location → skip (LWW-by-`savedAt` when flipped).

### Pattern 7: Fixed Highlights Markdown Template (D9-06/07/08/09)

**What:** Pure render over the locked variable contract. Shape (exact punctuation is planner):

```typescript
// src/portability/markdown.ts — pure, no DOM
export function renderArticleHighlights(
  article: CanonicalArticle,
  entries: Array<{ highlight: HighlightRecord; note?: NoteRecord;
                   status: "confident" | "ambiguous" | "orphan" }>,
): string {
  const lines: string[] = [];
  const marker = (s: string) =>
    s === "confident" ? "" : s === "ambiguous" ? "*[approx]* " : "*[orphan]* ";
  const citation = [
    article.provenance.author,
    `*${article.provenance.title}*`,
  ].filter(Boolean).join(", ");
  for (const e of entries) {
    // Orphan renders from stored quote.exact (article text may be absent);
    // confident/ambiguous render from quote.exact too — it IS the passage.
    lines.push(`> ${marker(e.status)}${e.highlight.quote.exact}`);
    if (article.provenance.sourceUrl) {
      lines.push(`> — ${citation} ([source](${article.provenance.sourceUrl}))`);
    } else {
      lines.push(`> — ${citation}`);
    }
    if (e.note) lines.push(`> Note: ${e.note.text}`);
    lines.push("");
  }
  return lines.join("\n");
}
```

**Recommendations within planner discretion:**
- Combined library-wide file: `# Highlights` h1, then `## <article title>` per article (ArticleView already renders page h1 from provenance — the exported file owns its own heading levels).
- Blockquote text: normalized-text `exact` is single-line by construction (whitespace collapsed at capture) — one `> ` line per highlight; no multi-line continuation handling needed.
- **Escaping:** escape only characters that would break blockquote structure or inject headings inside the quote — a conservative `escapeMarkdownLine()` that backslash-escapes leading `#`, `-`, `+`, `*`, `>`, and digit-run-`.` at line start is enough; do NOT over-escape mid-text punctuation (Obsidian/Notion tolerate it; over-escaping makes the quote ugly and harms the calm-reading ethos).
- Footer: `_N highlights · M ambiguous · K orphan_` per article section, plus a library-wide total in the combined file.
- Article ordering in the combined file: `savedAt` recency from locations where available, else `provenance.retrievedAt` (planner may simplify to a stable sort by title — the contract only requires honesty, not a specific order).

### Pattern 8: Eager Tri-State Re-Resolution Article Lookup (D9-13 + fixtures)

**What:** The re-resolution pass must find the article each highlight keys to across THREE sources, in precedence order:

1. **Imported articles** (from the bundle itself — the common case),
2. **Local Dexie articles** (when the incoming article was skipped as a conflict but its highlight is new),
3. **Bundled fixtures** (`src/fixtures/index.ts` — readers highlight fixture articles; those highlights ride in the bundle while their articles never do — this is exactly why `fixtureIds` exists).

```typescript
const lookup = new Map<string, CanonicalArticle>();
for (const a of bundle.articles) lookup.set(a.id, a);              // 1. imported
for (const a of localArticles) if (!lookup.has(a.id)) lookup.set(a.id, a); // 2. local
for (const a of fixtures) if (!lookup.has(a.id)) lookup.set(a.id, a);      // 3. fixture

for (const h of incomingHighlights) {
  const article = lookup.get(h.articleId);
  if (!article) { results.push({ id: h.id, status: "orphan" }); continue; }
  const resolved = resolveQuoteSelector(article, h.quote, h.position);
  results.push({ id: h.id,
    status: resolved === "ambiguous" || resolved === "orphan" ? resolved : "confident" });
}
```

A `fixtureId` absent from this build's fixtures (app-version skew) does NOT block import — highlights referencing it import and surface as orphan (Pitfall 11 #8 orphan-tolerant import). `resolveQuoteSelector` is O(n·m) worst case (n highlights, article length m) but re-uses `normalizeText`+`graphemeClusters` per article — **memoize the cluster array per article id** (compute once per article, not per highlight); prototype scale is instant either way.

### Anti-Patterns to Avoid

- **Writing a real extraction-to-disk path "for later."** Phase 9 reads entries into memory only; the Zip Slip guard validates names, it does not extract files. The future File System Access path re-litigates in Phases 11/12.
- **Validating with `.parse` and catching only the first error.** Use `safeParse` and surface `error.issues` as a list (Pitfall 11 #2 — "all errors, not just the first").
- **Trusting `schemaVersion` alone for ordering.** Peek the raw parsed `schemaVersion` BEFORE full schema parse so a v2 bundle gets the calm "newer version" refusal instead of a wall of Zod issues.
- **Hashing raw file bytes for the manifest** (determinism trap — see Pattern 4).
- **A shared generic ConfirmDialog** — Pitfall 8 isolation: structural clone, destructive call site isolated in its own handler.
- **Persisting any derived page/fragment data in the bundle** — SC#4: page numbers NEVER appear; offsets are grapheme positions into `normalizeText` (they already are, by construction — keep it that way).
- **Silently dropping ambiguous/orphan highlights from the Markdown export** (D9-09 — the note attached to an orphan highlight is exactly the reader's intellectual work).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ZIP archive create/parse | Custom zip byte writer, or JSON-in-gzip | `fflate` `zipSync`/`unzipSync` | ZIP central-directory format, UTF-8 name flags, DEFLATE streams are deceptively complex; fflate is 5–7KB tree-shaken and battle-tested (67M dl/wk) |
| SHA-256 | Custom JS hash | `crypto.subtle.digest("SHA-256", ...)` | Platform primitive; hand-rolled hashing is both slow and a correctness/security hazard (ASVS V6: never hand-roll crypto) |
| Focus-trapped modal | Roving-tabindex dialog | Native `<dialog>` + `showModal()` | Free focus trap, Esc, inert backdrop, `::backdrop` — the codebase has 4+ clones already proven cross-engine |
| File download | Custom protocol / server round-trip | `Blob` + `URL.createObjectURL` + `<a download>` | Baseline since 2015; zero dependencies |
| Re-anchoring highlights post-import | New offset-mapping logic | `resolveQuoteSelector` (`src/content/normalizeText.ts` re-export) | REUSE-DO-NOT-FORK (Pattern 5 discipline) — any divergence shifts every anchor |
| Normalized text / grapheme offsets | Parallel implementation for export | `normalizeText` + `graphemeClusters` | The D-05 substrate contract — the single most important invariant in the codebase |
| Path-traversal checking | Ad-hoc `name.includes("../")` | The pure `isSafeEntryName` virtual-resolve guard (Pattern 2) | Naive substring checks miss `..%2F`, backslashes, `dir/../../x`, NUL, NTFS streams, OS-reserved names |
| Filename generation for per-article .md | Raw article title | `sanitizeFilename()` (Pattern 2) | Titles are arbitrary web text — separators, reserved names, control chars |

**Key insight:** every hard problem in this phase (archive format, hashing, focus trapping, re-anchoring, path traversal) already has either a platform primitive, a verified library, or a shipped codebase precedent. The genuinely new logic is only the conflict table, the manifest contract, and the import state machine — all pure and unit-testable.

## Common Pitfalls

### Pitfall 1: Async-non-Dexie work inside the import transaction
**What goes wrong:** `db.transaction(...)` silently aborts (or never commits) when the closure awaits something that isn't a Dexie operation on the locked tables (a stray `crypto.subtle.digest`, a `setTimeout`, a Zod parse of a big block). Symptom: import "succeeds" but nothing persists, or the tx times out.
**Why it happens:** Dexie's transaction relies on the microtask queue staying local to Dexie ops; foreign awaits break the zone.
**How to avoid:** The apply function takes a fully-computed plan; the closure contains only `db.<table>.put/delete` calls (Pattern 3). Code-review gate: no `await` inside the tx that isn't a `db.*` call.
**Warning signs:** `TransactionInactiveError` in console; e2e import test flaky on commit.

### Pitfall 2: Manifest hash indeterminism (false "corruption")
**What goes wrong:** Exporter hashes exporter-side key order; importer recomputes over parse-order key order; a benign key-order difference flags a valid bundle as corrupted.
**Why it happens:** `JSON.stringify` emits insertion order; the in-memory export object and the parsed file object can differ in construction order.
**How to avoid:** Both sides hash `JSON.stringify(zodParsed.<block>)` — Zod constructs output keys in schema order on both sides (Pattern 4). Unit test: build bundle → manifest → `JSON.parse(JSON.stringify(...))` round-trip → recompute → equal.
**Warning signs:** Round-trip test fails with "corruption" on a freshly exported bundle.

### Pitfall 3: Node `path` API in browser code
**What goes wrong:** SC#2's wording (`path.resolve + startsWith`) reads like an instruction to import `node:path` — which doesn't exist in the browser bundle; the build fails or the guard silently imports a polyfill.
**Why it happens:** The mitigation text was written against a Node mental model of extraction-to-disk.
**How to avoid:** Implement the virtual-resolution pure function (Pattern 2) with identical semantics; unit tests prove the equivalence on the evil corpus.
**Warning signs:** `Module 'path' has been externalized` vite warning.

### Pitfall 4: Fixture highlights orphans
**What goes wrong:** The export contains highlights keyed to fixture article ids, but the import re-resolves only against `bundle.articles` — every fixture highlight reports orphan despite the fixture being present in the build.
**Why it happens:** Fixtures are deliberately NOT serialized (ARCHITECTURE L615); the lookup must span three sources (Pattern 8).
**How to avoid:** The lookup precedence map; `fixtureIds` exists precisely so the preview can say "3 highlights anchor to bundled sample articles."
**Warning signs:** Round-trip e2e shows fixture-article highlights as orphan on machine B.

### Pitfall 5: Missing bulk reads (`loadAllHighlights` / `loadAllNotes`)
**What goes wrong:** The export service calls `loadHighlights(articleId)` per article — N+1 reads, or worse, reaches into `db.highlights.toArray()` raw and skips the STATE-04 per-row Zod validation.
**Why it happens:** The stores were built per-article in Phase 5; whole-library reads didn't exist until `loadAllLocations` (Phase 8).
**How to avoid:** Add `loadAllHighlights()` to `highlightsStore.ts` and `loadAllNotes()` to `notesStore.ts`, mirroring `loadAllLocations()` exactly (`toArray()` + per-row `safeParse` + silent corrupt-row drop).
**Warning signs:** Export unit test mock surface missing `toArray`.

### Pitfall 6: `crypto.subtle` unavailable (insecure context)
**What goes wrong:** `crypto.subtle` is `undefined` when the app is opened over plain HTTP on a LAN or `file://` — export/import crash on `digest`.
**Why it happens:** Web Crypto is restricted to secure contexts (spec behavior).
**How to avoid:** Dev (`localhost:5173`) and production (HTTPS static host) are both secure. Add a defensive guard at the Settings-cluster entry: if `globalThis.crypto?.subtle` is missing, surface the calm `.status` message and disable export/import actions ( mirrors StorageBanner's graceful degradation posture).
**Warning signs:** `TypeError: Cannot read properties of undefined (reading 'digest')`.

### Pitfall 7: Keep-both without FK rewrite
**What goes wrong:** A highlight id collides (rare `crypto.randomUUID` collision or a re-imported bundle); "keep both" mints a new highlight id but the incoming note still points at the old id — the note orphans on write.
**Why it happens:** The note's `highlightId` FK is data, not an index join.
**How to avoid:** When a highlight gets a new id in the plan, rewrite every incoming note whose `highlightId` matches, BEFORE the transaction (Pattern 3 note).
**Warning signs:** Post-import note lookup by `highlightId` misses.

### Pitfall 8: The 24 pre-existing e2e failures (honest-suite gate)
**What goes wrong:** STATE.md records Phase 08 closed with **24 pre-existing e2e failures in unrelated specs** (18 pagination, 3 capture-highlight, 3 dexie-migration) logged to `08-.../deferred-items.md` — "A gap-closure plan is required to bring the full `npm run test` exit code to 0."
**Why it happens:** Phase 08 scope-boundary rule (fix only in-scope specs).
**How to avoid:** The planner must decide explicitly: either Phase 9 includes a gap-closure plan for those 24 (mirroring Phase 4's 04-07..04-11 precedent) or Phase 9's gate is scoped-green with the deficit logged forward — per PROJECT.md Key Decision #9 (honest full-suite execution discipline), this cannot be silently ignored.
**Warning signs:** Phase-exit `npm run test` exit ≠ 0 attributed to "unrelated" specs without a logged decision.

### Pitfall 9: Playwright download capture config
**What goes wrong:** The SC#4 e2e can't capture the export download (`page.waitForEvent("download")` never fires).
**Why it happens:** `acceptDownloads` must be enabled on the browser context. The project's `playwright.config.ts` does not set it — modern Playwright defaults it to `true`, but this is unverified in this repo [ASSUMED].
**How to avoid:** Wave 0 check: one throwaway spec asserting a download event fires; if not, add `use: { acceptDownloads: true }` to `playwright.config.ts`.
**Warning signs:** e2e timeout waiting for download.

## Code Examples

### Export bundle construction (end-to-end shape)

```typescript
// src/portability/ExportImportService.ts (export side)
import { zipSync, strToU8 } from "fflate";
import { fixtures } from "../fixtures";
import { dexieLibrarySource } from "../ingestion/LibrarySource";
import { loadAllHighlights, loadAllNotes, loadAllLocations } from "../persistence/...";

export async function buildBundleBytes(): Promise<Uint8Array> {
  const [articles, highlights, notes, locations, settings] = await Promise.all([
    dexieLibrarySource.list(),        // Dexie articles only (validated on read)
    loadAllHighlights(),              // NEW bulk read (Pattern: loadAllLocations)
    loadAllNotes(),                   // NEW bulk read
    loadAllLocations(),               // exists (Phase 8)
    loadSettings().then((r) => (r.ok ? r.settings : DEFAULT_SETTINGS)),
  ]);

  // fixtureIds: ids of bundled fixtures the reader's records actually reference
  const referenced = new Set<string>([
    ...highlights.map((h) => h.articleId),
    ...notes.flatMap((n) => highlights.filter((h) => h.id === n.highlightId).map((h) => h.articleId)),
    ...locations.map((l) => l.articleId),
  ]);
  const fixtureIds = fixtures.filter((f) => referenced.has(f.id)).map((f) => f.id);

  // Self-check before write: the exporter validates its own output (belt).
  const bundle = ExportBundleSchema.parse({
    schemaVersion: 1 as const,
    exportedAt: new Date().toISOString(),
    appVersion: __APP_VERSION__,
    articles, locations, highlights, notes,
    preferences: settings,            // always present (D9-12)
    fixtureIds,
  });

  const manifest = await computeManifest(bundle);
  return zipSync({
    "bundle.json": strToU8(JSON.stringify(bundle, null, 2)),
    "manifest.json": strToU8(JSON.stringify(manifest)),
  });
}
```

### Import validation pipeline (pre-transaction)

```typescript
// src/portability/ExportImportService.ts (validation side) — every refusal is a
// calm .status message; NONE of these paths open a transaction.
export type ImportRefusal =
  | { kind: "not-a-zip" }
  | { kind: "unsafe-entry"; name: string }
  | { kind: "missing-entry"; name: string }
  | { kind: "newer-schema-version"; bundleVersion: number }
  | { kind: "invalid"; issues: string[] }          // Zod issues as a LIST
  | { kind: "corrupted"; failedBlocks: string[] }; // manifest mismatches

export async function validateBundle(file: File): Promise<
  { ok: true; bundle: ExportBundle; manifest: Manifest }
  | { ok: false; refusal: ImportRefusal }
> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      // Cheap decompression-bomb guard: skip entries over 200 MiB
      filter: (f) => f.originalSize <= 200_000_000,   // f.originalSize verified in fflate README
    });
  } catch { return { ok: false, refusal: { kind: "not-a-zip" } }; }

  // SC#2 hard gate — EVERY entry, no exceptions
  for (const name of Object.keys(entries)) {
    if (!isSafeEntryName(name)) {
      return { ok: false, refusal: { kind: "unsafe-entry", name } };
    }
  }
  const bundleBytes = entries["bundle.json"];
  const manifestBytes = entries["manifest.json"];
  if (!bundleBytes || !manifestBytes) {
    return { ok: false, refusal: { kind: "missing-entry", name: !bundleBytes ? "bundle.json" : "manifest.json" } };
  }

  // Peek the version BEFORE full parse → calm "newer version" message
  const raw = JSON.parse(strFromU8(bundleBytes)) as { schemaVersion?: number };
  if (typeof raw.schemaVersion === "number" && raw.schemaVersion > 1) {
    return { ok: false, refusal: { kind: "newer-schema-version", bundleVersion: raw.schemaVersion } };
  }

  const parsed = ExportBundleSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, refusal: { kind: "invalid",
      issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) } };
  }

  const recomputed = await computeManifest(parsed.data);
  const claimed = JSON.parse(strFromU8(manifestBytes)) as Manifest;
  const failedBlocks = (Object.keys(recomputed.blocks) as Array<keyof Manifest["blocks"]>)
    .filter((b) => recomputed.blocks[b] !== claimed.blocks?.[b]);
  if (failedBlocks.length > 0) {
    return { ok: false, refusal: { kind: "corrupted", failedBlocks } };
  }
  return { ok: true, bundle: parsed.data, manifest: recomputed };
}
```

### SC#4 round-trip e2e harness (two contexts = two machines)

```typescript
// tests/e2e/portability/round-trip.spec.ts (shape)
import { test, expect } from "@playwright/test";

test("SC#4 — export on machine A re-imports on machine B with offsets intact", async ({ browser }) => {
  const machineA = await browser.newContext();       // separate IndexedDB = another machine
  const machineB = await browser.newContext();
  const pageA = await machineA.newPage();
  // ... seed on A: ingest paste article, create highlight + note, save location
  //     (mirrors remove-cascade.spec.ts seeding via page.evaluate)

  await pageA.getByRole("button", { name: /export library bundle/i }).click();
  const download = await pageA.waitForEvent("download");
  const bundlePath = await download.path();

  const pageB = await machineB.newPage();
  await pageB.goto("http://localhost:5173/#/");
  await pageB.setInputFiles('input[type="file"]', bundlePath!, { targetAttribute: "value" });
  // → ImportPreviewDialog appears; assert counts + defaults (Skip-all, data-initial-focus on cancel)
  await pageB.getByRole("button", { name: /import/i }).click();
  await expect(pageB.locator(".status")).toContainText(/imported/i);

  // Round-trip truth: every highlight re-resolves to confident (or honestly
  // ambiguous/orphan). Assert via Dexie rows + rendered marks (jsdom not authoritative).
  // ...
  await machineA.close(); await machineB.close();
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single `.json` library export (Wallabag-era) | ZIP bundle with versioned envelope + integrity manifest (Readwise/Calibre convention) | — | D9-01 locks ZIP: asset-forward-compatible, standard tooling opens it |
| JSZip (~95KB) as default browser zip | fflate (~8KB tree-shakable ESM) | fflate stable since ~2021; Vite adopted it internally | D9-02 locks fflate — smallest bundle impact |
| Trust-the-file imports | Validate-then-write with SHA-256 detection manifest | — | D9-03: corruption is DETECTED and refused, never partially imported |
| Per-article migration scripts on import | Schema-version negotiation (literal + forward-refusal) | — | D9-04: v1 importer + v2 bundle = calm refusal, no silent partial import |

**Deprecated/outdated:**
- `CompressionStream` as the archive engine — no ZIP support, no level control (per fflate README comparison) — irrelevant here since we need ZIP, not gzip.
- Custom zip parsers — never appropriate given fflate's size/perf.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `acceptDownloads` defaults to true in the installed Playwright 1.61.1, so download capture needs no config change | Code Examples / Pitfall 9 | Low — Wave 0 throwaway spec detects; one-line config fix |
| A2 | `URL.revokeObjectURL` immediately-after-click can race in WebKit; deferred revoke via `setTimeout(0)` is the safe form | Pattern 5 | Low — if wrong, the deferred form is still correct |
| A3 | Vite `define: { __APP_VERSION__: JSON.stringify(pkg.version) }` is the cleanest appVersion source | Pattern 1 / discretion | Low — fallback: a constant in `bundle.ts`; diagnostic-only field |
| A4 | `z.object().parse()` output key order is deterministic (schema-shape order) and `JSON.parse`→`JSON.stringify` preserves string-key insertion order, making the manifest byte-deterministic | Pattern 4 / Pitfall 2 | Medium — if wrong, round-trip unit test catches immediately; fallback: canonicalizing stringify or hashing raw entry bytes |
| A5 | Playwright `setInputFiles` accepts a filesystem path AND `{ name, mimeType, buffer }` payloads (needed for crafted malicious zips) | Code Examples | Low — documented Playwright API; verify at Wave 0 |
| A6 | The export `.status` terminal summary granularity is sufficient (no incremental progress) | Discretion | Low — prototype scale is instant; a "Exporting…" intermediate string is a trivial add |

## Open Questions (RESOLVED)

1. **Does Phase 9 own the 24 pre-existing e2e failures?**
   - What we know: STATE.md Phase 08 gate recorded 24 failures in unrelated specs (pagination/annotations/dexie-migration) with a required gap-closure plan pending; PROJECT.md Key Decision #9 mandates honest full-suite execution.
   - What's unclear: whether the gap-closure lands as a Phase 9 plan or a standalone effort.
   - Recommendation: planner surfaces this explicitly in PLAN.md wave structure (a gap-closure plan mirroring Phase 4's 04-07..04-11 precedent, or a logged forward-deferred decision with user sign-off).
   - **Resolution:** Plan 09-07 (Wave 6) is the gap-closure plan — it closes all 24 cells with root-cause fixes (strengthen-only spec discipline), runs the honest full-suite gate (`npm run test`, exit 0, recorded in 09-07-OUTPUT.md), and appends the closure note to Phase 08's deferred-items.md.
2. **Exact `.status` copy strings** (corruption, newer-version, unsafe-entry refusals, import result summary).
   - What we know: voice is locked (calm DOC-06); words are UI-SPEC/planner.
   - What's unclear: exact strings.
   - Recommendation: planner drafts; they ride the existing `.status` live-region pattern with zero new vocabulary.
   - **Resolution:** Locked verbatim in Plan 09-05 Task 2 — all six refusal strings (not-a-zip, unsafe-entry, missing-entry, newer-schema-version, invalid, corrupted), the export/import result summaries, and the insecure-context disable message are specified in the task action; they ride the existing `.status` live-region pattern with zero new vocabulary.
3. **Combined Markdown file's article ordering.**
   - What we know: contract requires honesty, not order.
   - Recommendation: `savedAt`-recency where locations exist, else title sort — planner decides.
   - **Resolution:** Plan 09-02 Task 1 — `orderSectionsByRecency`: sections whose article has a location row sort by `savedAt` descending first; articles without locations follow, sorted by `provenance.title` ascending.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (dev/CI runtime) | Vite 8, tests | ✓ | v22.22.3 (meets Vite 8's 20.19+/22.12+ floor) | — |
| fflate | bundle zip/unzip | ✗ (new dep) | 0.8.3 (registry-verified) | none needed — `npm install fflate@0.8.3` is a plan task |
| `crypto.subtle` (browser) | SHA-256 manifest | ✓ (localhost:5173 dev + HTTPS prod are secure contexts) | Browser platform | Defensive guard + calm disable (Pitfall 6) |
| Vite dev server :5173 | e2e webServer | ✓ | existing playwright.config.ts `webServer` | — |
| fake-indexeddb | unit Dexie tests | ✓ | 6.2.5 (devDep) | — |
| Playwright download capture | SC#4 e2e | ✓ (assumed default `acceptDownloads: true`) | 1.61.1 | Wave 0 verify; config one-liner (Pitfall 9) |
| jsdom (unit DOM substrate) | component tests | ✓ | 30.0.1 | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none blocking — fflate is a planned install task; `acceptDownloads` is a config one-liner if the default differs.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (unit, jsdom env, 2 projects) + Playwright Test 1.61.1 (e2e, chromium/firefox/webkit) |
| Config file | `vitest.config.ts` / `playwright.config.ts` |
| Quick run command | `npm run test:unit -- --run tests/unit/portability` |
| Full suite command | `npm run test` (unit + e2e, all engines — the honest gate) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PORT-01 | ExportBundleSchema accepts a valid 5-block bundle; rejects wrong schemaVersion literal | unit | `npx vitest run tests/unit/portability/bundle-schema.test.ts` | ❌ Wave 0 |
| PORT-01 | Export produces a zip with bundle.json + manifest.json; fixtures NOT serialized; fixtureIds present | unit (fake-indexeddb) | `npx vitest run tests/unit/portability/export-service.test.ts` | ❌ Wave 0 |
| PORT-02 | isSafeEntryName rejects `../../evil.sh`, `..%2F..%2Fevil.sh`, absolute, drive-letter, backslash, NUL, reserved names; accepts valid | unit | `npx vitest run tests/unit/portability/zip-slip.test.ts` | ❌ Wave 0 |
| PORT-02 | validateBundle refuses: not-a-zip, unsafe-entry, missing-entry, newer-schemaVersion, invalid (issues LIST), corrupted (manifest mismatch) | unit | `npx vitest run tests/unit/portability/validate-bundle.test.ts` | ❌ Wave 0 |
| PORT-02 | Conflict dry-run detects all 5 D9-14 kinds with correct defaults | unit (fake-indexeddb) | `npx vitest run tests/unit/portability/conflicts.test.ts` | ❌ Wave 0 |
| PORT-02 | Import applies atomically — injected mid-write failure rolls back ALL stores | unit (fake-indexeddb) | `npx vitest run tests/unit/portability/atomic-import.test.ts` | ❌ Wave 0 |
| PORT-03 | Markdown renderer: blockquote+citation+note; [approx]/[orphan] markers; footer counts; orphan renders stored exact; note never dropped | unit | `npx vitest run tests/unit/portability/markdown.test.ts` | ❌ Wave 0 |
| PORT-01/02 | Manifest determinism: export → stringify round-trip → recompute = identical | unit | `npx vitest run tests/unit/portability/manifest.test.ts` | ❌ Wave 0 |
| SC#4 | Round-trip: machine A export → machine B import → highlights confident/ honestly tri-state; page numbers absent from bundle.json | e2e | `npx playwright test tests/e2e/portability/round-trip.spec.ts` | ❌ Wave 0 |
| SC#2 | Malicious zip upload (crafted buffer) refused; no state change | e2e | `npx playwright test tests/e2e/portability/zip-slip-regression.spec.ts` | ❌ Wave 0 |
| PORT-02 | Preview dialog: counts, defaults, data-initial-focus on cancel, Esc restore, Proceed applies | e2e + component | `npx playwright test tests/e2e/portability/import-preview.spec.ts` | ❌ Wave 0 |
| PORT-03 | Per-article + library-wide .md export downloads render expected content | e2e | `npx playwright test tests/e2e/portability/highlights-export.spec.ts` | ❌ Wave 0 |
| A11Y | Preview dialog keyboard/axe checks across engines | e2e | `npx playwright test tests/e2e/portability/a11y.spec.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test:unit -- --run tests/unit/portability && npx playwright test tests/e2e/portability/ --project=chromium`
- **Per wave merge:** `npm run test` (full suite, all engines — honest gate; see Pitfall 8 for the 24 pre-existing failures decision)
- **Phase gate:** Full suite green (or scoped-green with logged deficit decision) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/portability/` — all 8 unit spec files above (bundle-schema, zip-slip, validate-bundle, manifest, conflicts, atomic-import, markdown, export-service)
- [ ] `tests/e2e/portability/` — 5 spec files above
- [ ] `src/persistence/highlightsStore.ts` — add `loadAllHighlights()`; `src/persistence/notesStore.ts` — add `loadAllNotes()` (mirror `loadAllLocations`)
- [ ] `npm install fflate@0.8.3` + import-lint: only `zipSync`/`unzipSync`/`strToU8`/`strFromU8` named imports (tree-shaking discipline per fflate README)
- [ ] Download-capture smoke spec (acceptDownloads verification — Pitfall 9 / A1)
- [ ] Decide the 24-pre-existing-failings gap-closure ownership (Pitfall 8) — surface to user at planning

## Security Domain

**security_enforcement: true (ASVS Level 1)**

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No accounts in this phase (local-first; PROJECT.md Out of Scope) |
| V3 Session Management | no | No sessions — client-only SPA |
| V4 Access Control | no | No server, no multi-tenant boundary |
| V5 Input Validation | **yes** | Zod entire-bundle validation before any write (error list, not first-error); `isSafeEntryName` on every zip entry; `sanitizeFilename` for reader-facing download names; decompression-size cap via fflate `filter` (bomb guard); JSON.parse is prototype-pollution-safe and `z.object` strips unknown keys |
| V6 Cryptography | **yes** | SHA-256 via `crypto.subtle.digest` ONLY (platform primitive — never hand-roll); the manifest is corruption DETECTION, not a signature (documented boundary, D9-03) |
| V8 Data Protection | **yes** | Reader data leaves the device only via explicit reader-initiated export; bundle contains intellectual work — no telemetry, no server |
| V12 Files & Resources | **yes** | Zip Slip guard (SC#2 hard gate) + filename sanitization + entry-count/size expectations; page numbers never in the bundle (data-minimization for ephemeral values) |
| V14 Config | no | No new build flags beyond `__APP_VERSION__` define |

### Known Threat Patterns for client-side archive import (React + Vite + Dexie + Zod)

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Zip Slip / path traversal (`../../evil.sh`, `..%2F..%2Fevil.sh`) | Tampering + Elevation of Privilege | `isSafeEntryName` on EVERY entry (virtual resolve, no escape); mandatory regression corpus; refusal before any entry use |
| Partial-import inconsistency (47 articles, 0 highlights) | Tampering + DoS | Single Dexie transaction across all 5 stores; any throw rolls back everything (Pitfall 11 #3) |
| Schema version skew (v2 bundle in v1 importer) | Tampering + Info Disclosure | `schemaVersion` literal(1) + pre-parse peek → calm refusal, no silent partial import |
| Corrupted/truncated bundle (USB transfer, file-share) | Tampering | SHA-256 per-block manifest recompute; mismatch → refuse, transaction never starts |
| Decompression bomb (zip bomb DoS) | DoS | fflate `filter` with `originalSize` cap (verified API); prototype-scale budgets |
| XSS via bundle content | Spoofing + Tampering | Doc model IS the security boundary: React renders Block JSON, never HTML; note text is `z.string()` (escaped by React); `lint:no-danger` grep gate stays green; URL fields already scheme-allow-listed at parse (`httpUrl` refinement) |
| Malicious record fields (extra/unknown keys) | Tampering | `z.object` strips unknown keys by default; literal enums reject unexpected values; `_js$` underscore keys are also stripped by default in Zod 4 |
| Repudiation (destructive import without consent) | Repudiation | Preview `<dialog>` alertdialog; `[data-initial-focus]` on non-destructive action; destructive write ONLY in Proceed onClick (Pitfall 8 discipline — the WipeConfirm/RemoveConfirm precedent) |

## Sources

### Primary (HIGH confidence)
- Codebase (read this session): `src/content/schema.ts`, `src/persistence/db.ts`, `src/ingestion/LibrarySource.ts`, `src/content/normalizeText.ts`, `src/annotations/resolution.ts`, `src/persistence/{settingsStore,locationStore,highlightsStore,notesStore}.ts`, `src/reader/{WipeConfirm,SettingsPanel}.tsx`, `src/ingestion/library/RemoveConfirm.tsx`, `src/routes/ArticleView.tsx`, `src/App.tsx`, `server/safeFetch.ts` (crypto.subtle precedent), `vitest.config.ts`, `playwright.config.ts`, `package.json`, `tests/setup.ts`, `tests/unit/ingestion-tags.test.ts`, `tests/e2e/library/remove-cascade.spec.ts`
- fflate official README (github.com/101arrowz/fflate, master, fetched 2026-08-14) — API signatures, flat unsanitized entry keys, `filter`/`originalSize`, bundle-size table, sync-vs-async guidance
- npm registry — fflate 0.8.3, publish date, downloads, no postinstall, verdict OK via `gsd-tools query package-legitimacy check`
- Project planning corpus: `.planning/research/ARCHITECTURE.md` Pattern 7 (L584-671), `.planning/research/PITFALLS.md` Pitfall 11 (L332-365), `.planning/research/FEATURES.md` Feature Area 4 (L204-264), `.planning/phases/09-versioned-export-import/09-CONTEXT.md` (all D9-xx decisions)

### Secondary (MEDIUM confidence)
- MDN `URL.createObjectURL()` (developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static, fetched 2026-08-14) — Baseline status, revokeObjectURL pairing

### Tertiary (LOW confidence)
- Playwright download-capture/`setInputFiles`-buffer specifics (A1/A5 — Wave 0 verification specs)
- Vite `define` appVersion pattern (A3)
- WebKit revokeObjectURL race detail (A2)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — fflate verified against registry + official README fetched this session; all other deps already installed with codebase precedent
- Architecture: HIGH — every pattern grounded in shipped code contracts read this session (schemas, stores, transaction precedent, dialog precedent, live-region precedent)
- Pitfalls: HIGH — derived from the project's own PITFALLS.md + verified API behavior + STATE.md history (incl. the 24-failure honest-gate context); the two LOW items are explicitly logged as assumptions with Wave 0 checks

**Research date:** 2026-08-14
**Valid until:** 2026-09-13 (stable domain — local-first serialization; revisit only if fflate or Zod major-version before planning completes)
