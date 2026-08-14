# Phase 9: Versioned Export/Import - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-13
**Phase:** 9-versioned-export-import
**Areas discussed:** Bundle archive format, Highlights-only Markdown export, Export/Import UI placement & flow

---

## Bundle archive format

| Option | Description | Selected |
|--------|-------------|----------|
| ZIP archive | `lem-reader-bundle-v1.zip` with `bundle.json` + manifest; standard portability format; SC#2's Zip Slip guard is meaningful (real entries); forward-compatible for EPUB/PDF image assets. Adds fflate. | ✓ |
| Single `.json` | Simplest, no new dep, no traversal surface; SC#2 guard becomes a defensive no-op. Large; no asset future. | |
| `.json.gz` | Gzipped single JSON; compression-only, no traversal surface, no heavy dep; single-stream, no multi-asset future. | |

**User's choice:** ZIP archive
**Notes:** SC#2 mandates a Zip Slip guard "on every archive entry" — that language requires real entries to guard, making ZIP the format that satisfies the success criterion literally.

| Option | Description | Selected |
|--------|-------------|----------|
| fflate | ~8KB min+gz, pure-JS, modern, sync+async zip/gzip/unzip. Smallest bundle impact. | ✓ |
| JSZip | ~95KB, long-standing default, more conveniences. Heavier. | |
| You decide | Delegate on bundle-size vs ergonomics. | |

**User's choice:** fflate
**Notes:** Both expose entry names unsanitized (Pitfall 11 #5); the Zip Slip guard is app-level regardless. fflate chosen for minimal bundle impact.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, ship the manifest | `manifest.json` with SHA-256 per record block; importer recomputes + reports mismatch; refuses corrupted bundle. Includes `fixtureIds[]` for presence-check. | ✓ |
| No, core records only | `bundle.json` with the 5 record arrays only; Zod validation is the only gate. | |

**User's choice:** Yes, ship the manifest
**Notes:** Cheap (`crypto.subtle.digest`, no new dep); detects USB-stick/file-share corruption + accidental truncation. Not a signing/security boundary (deferred to v3) — a detection surface.

| Option | Description | Selected |
|--------|-------------|----------|
| Blob + `<a download>` | Build zip as Blob, trigger `<a download>`. Cross-browser (all 3 engines). | ✓ |
| showSaveFilePicker + fallback | File System Access API streaming on Chromium; Blob fallback elsewhere. Progressive enhancement. | |
| You decide | Delegate; Blob-first is the safe default. | |

**User's choice:** Blob + `<a download>`
**Notes:** Cross-browser for the acceptance matrix. Pitfall 11 #7 streaming is a known limit for very large libraries, documented as deferred.

---

## Highlights-only Markdown export

| Option | Description | Selected |
|--------|-------------|----------|
| Whole-library single `.md` | One file, all articles' highlights sectioned by article. | |
| Both: library + per-article | Library-wide "Export all highlights" + per-article "Export highlights" in ArticleView. Shared template. | ✓ |
| Per-article only | Narrowest; no library-wide export. | |

**User's choice:** Both: library + per-article
**Notes:** Per-article is a named differentiator (FEATURES L225, SMALL); the shared template makes the marginal cost one extra affordance. Per-tag variant defers to Phase 10.

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed built-in template | One calm template authored by us using locked variables. Satisfies SC#3 literally. No edit UI/store/recovery. | ✓ |
| Reader-editable template | Settings textarea with `{{variable}}` placeholders; Readwise Jinja2 model. Adds template store + edit UI + render-validation. | |
| You decide | Fixed is the SC#3-safe default. | |

**User's choice:** Fixed built-in template
**Notes:** SC#3 "with template variables" satisfied (variables exist + are named; structure is ours). Editability deferred until readers actually customize; the variable contract is the stable foundation.

| Option | Description | Selected |
|--------|-------------|----------|
| Blockquote + citation | Blockquote per highlight, citation on its own line, note as subsequent line. Readwise/Obsidian convention. | ✓ |
| Bullet list | Each highlight a `- ` bullet; note nested. Compact. | |
| You decide | Delegate exact shape; contract is the variable set per highlight. | |

**User's choice:** Blockquote + citation
**Notes:** Sets the variable contract the researcher locks (each highlight carries `{exact, note?, articleTitle, author?, sourceUrl?, status?}`); exact punctuation/whitespace is planner.

| Option | Description | Selected |
|--------|-------------|----------|
| Honest inclusion | Confident unmarked; ambiguous prefixed with subtle marker; orphan rendered from stored exact text with marker. Footer counts. Never silently dropped. | ✓ |
| Confident only + count note | Export only confident; header note "N highlights omitted." Cleanest output. | |

**User's choice:** Honest inclusion
**Notes:** Preserves the reader's intellectual work + project's never-silent ethos (ANNO-07 extended to the export surface).

---

## Export/Import UI placement & flow

| Option | Description | Selected |
|--------|-------------|----------|
| Settings panel | "Your data" cluster alongside WipeConfirm. Groups infrequent data actions; library header stays spare. | ✓ |
| Library header | Small "Export / Import" affordance near IngestControl. More discoverable; adds chrome. | |
| You decide | Settings groups data actions per WipeConfirm precedent. | |

**User's choice:** Settings panel
**Notes:** Mirrors the WipeConfirm precedent (data ops live in settings, not on the shelf). Library header keeps IngestControl only.

| Option | Description | Selected |
|--------|-------------|----------|
| Preview + bulk overrides | Native `<dialog>`: dry-run preview (ImportPreview) + bulk override toggles per conflict kind (Skip-all/Overwrite-all/Keep-both); atomic write; result summary. | ✓ |
| Preview + skip-only | Single preview + "Import (skip conflicts)" button. No overrides in Phase 9. | |
| You decide | Contract: dry-run → confirm → atomic write → summary; bulk per-kind override is the SC#2 floor. | |

**User's choice:** Preview + bulk overrides
**Notes:** Satisfies SC#2 "per-entity reader overrides" at the entity-KIND level without a per-row merge screen (FEATURES L229 defers the heavy merge UI). Structural clone of RemoveConfirm/WipeConfirm (Pitfall 8 isolation).

| Option | Description | Selected |
|--------|-------------|----------|
| Always export; choose at import | Bundle always carries preferences; import preview offers "Apply imported preferences?" (default by device state). One-click export. | ✓ |
| Export-side checkbox | "Include my reading preferences" checkbox (default checked) in export affordance. | |
| Exclude by default | Device-specific; separate preferences-only export later. | |

**User's choice:** Always export; choose at import
**Notes:** Device-specificity matters more on import; moves the choice to where it's meaningful and keeps export one-click.

| Option | Description | Selected |
|--------|-------------|----------|
| Eager at import | Per imported highlight, run `resolveQuoteSelector` against imported `normalizeText` before write; preview honestly reports ambiguous/orphan counts. | ✓ |
| Trust + lazy on open | Persist as-is; re-resolve on first open. Faster import; tri-state surfaces lazily. | |

**User's choice:** Eager at import
**Notes:** SC#4 satisfied at import time (not deferred past the preview). O(highlights) cost — prototype-scale is instant.

---

## Conflict resolution depth (area deferred by user — pre-answered)

**User declined to discuss this area** — treated as locked by FEATURES L229 + SC#2: skip-by-default + bulk per-kind overrides (D9-11/D9-14); per-row merge UI deferred. Conflict policy follows Pattern 7's table (article-revision / article-content-divergence / highlight-id / note-id / location last-write-wins by `savedAt`).

## the agent's Discretion

- ZIP entry layout + inner JSON formatting (contract locked: zip with `bundle.json` + `manifest.json`).
- `ExportBundleSchema` exact field set (whether to include forward-compat `books`/`articleTags` optionals).
- Conflict-detection implementation (reuse `DexieLibrarySource` reads vs direct `db.*` queries).
- Exact Markdown template punctuation/whitespace + section heading level + citation punctuation.
- Exact copy for preview labels, override toggle names, corruption message, "newer version" refusal, ambiguous/orphan markers.
- `.status` progress granularity (terminal vs counted).
- Per-article export mount point in ArticleView chrome.
- `appVersion` source (diagnostic only).

## Deferred Ideas

None raised that were out of scope. Confirmed later-phase items: Annotation review panel + per-tag highlights export (Phase 10); PDF/EPUB intake (Phases 11/12); POLISH + NVDA + ACPT-06 core-flow acceptance (Phase 13); accounts/cloud sync/encryption/real-time merge (v3+, PROJECT.md Out of Scope); reader-editable Markdown template; per-row conflict merge UI; streaming/chunked export; bundle signing/encryption; preferences-only / per-article whole-bundle export; OPF/EPUB-fragment / note-app integrations.
