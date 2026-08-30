---
phase: 17-reader-owned-metadata
verified: 2026-08-30T03:22:55Z
status: passed
score: 15/15 must-haves verified
behavior_unverified: 0
overrides_applied: 0
deferred:
  - truth: "Screen-reader pass on the EditMetadataDialog (NVDA/VoiceOver announcement of the blank-title explanation, Reset labels, and save feedback)"
    addressed_in: "Phase 21"
    evidence: "REQUIREMENTS.md ACPT-08: 'Library, Highlights, Add, and Reader flows pass the documented keyboard, NVDA+Firefox, VoiceOver+Safari… acceptance matrix' — traceability maps ACPT-08 to Phase 21. The automatable portion (keyboard Esc/focus-restore walkthrough, labeled controls, aria-labels naming the effective title) is DONE in Phase 17 (metadata-edit.spec.ts Esc/focus cell, green in my own chromium run); only the human SR reading is Phase 21 scope."
---

# Phase 17: Reader-Owned Metadata — Verification Report

**Phase Goal:** Readers personalize saved titles and authors while canonical identity, anchors, and portability remain intact.
**Verified:** 2026-08-30T03:22:55Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Truths are the 4 ROADMAP success criteria (the contract) with the plan-level must-have truths verified beneath them. **Verification stance:** no SUMMARY claim was trusted; every row below was re-established against the codebase, and every behavior-dependent truth was exercised first-hand (unit + chromium e2e runs executed by the verifier in this session) or covered by the recorded 3-engine honest gate per the Phase 16 convention.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| **SC-1** | Reader can edit display title and author without changing identity, provenance, revision, position, or annotations (META-01) | ✓ VERIFIED | See truths 1.1–1.3 |
| 1.1 | Schema substrate: override fields are additive-optional with min(1); blank override unrepresentable; existing rows hydrate to undefined | ✓ VERIFIED | `src/content/schema.ts:275-276` (`z.string().min(1).optional()` after `tags`, phase-tagged comment); `git diff 98adadd HEAD -- src/content/schema.ts` shows ONLY the two fields + comment (Provenance block byte-unchanged — META-01); `git diff` on db.ts shows only the Table-type widening + no-bump rationale, v1..v5 blocks untouched, no `upgrade(` added; **my run:** effective-metadata + ingestion-schema suites 71/71 passed (round-trip guard, provenance deep-equal, empty-string rejection both fields, v5 hydration) |
| 1.2 | The edit dialog owns the ONE override write site, with cleared keys omitted (deleted, never blanked) | ✓ VERIFIED | `EditMetadataDialog.tsx:164-174`: destructure-out row build (`const { readerTitle: _previousTitle, readerAuthor: _previousAuthor, ...base } = article`) + conditional spreads + the single `db.articles.put(row)`; repo-wide grep for `db.articles.put` finds only this NEW site plus pre-existing ones (LibrarySource.save, booksStore stamp, ExportImportService applyImport) — no second override writer anywhere (Pitfall 8) |
| 1.3 | Edit + save leaves identity/position/annotations untouched end-to-end | ✓ VERIFIED (behavioral) | **My run:** metadata-edit.spec.ts save cell (row-truth: `readRow` asserts stored `provenance`/`id`/`revision` unchanged after override save) — 10/10 chromium PASSED. Highlights/locations live in separate Dexie stores the articles-row put cannot touch (structural; cascade test proves store separation) |
| **SC-2** | Edited metadata appears consistently in Library, Reader, Highlights, search, and exports (META-02) | ✓ VERIFIED | See truths 2.1–2.5 |
| 2.1 | ONE derivation point, zero forks | ✓ VERIFIED | `effectiveMetadata.ts` exports `effectiveTitle`/`effectiveAuthor` (nullish coalescing over `readerTitle ?? provenance.title` and the author twin, 56-line pure module); fork-audit grep `provenance.title`/`provenance.author` across src/ returns only the deliberate canonical surfaces: dialog placeholders (D17-03/D17-08), chapter-title map + chapter-nav neighbors (D17-06 carve-out), schema comment, reviewFilter historical comments — **no forked derivation** |
| 2.2 | Library surfaces show/match the effective name: row heading/byline, remove capture, strip; search is override-only both ways (D17-07) | ✓ VERIFIED (behavioral) | `LibraryRow.tsx:102/106-107/142/157` (heading, meta, Edit/Remove aria-labels); `LibraryView.tsx:716` (removeTarget capture); `ContinueReadingStrip.tsx:234-237`; `libraryFilter.ts:93-94` article haystack slots 1-2 (book haystack canonical, D17-05/D17-06); **my runs:** library-search unit D17-07 cells (found-by-new, NOT-by-old, author, regression) + strip/search/fixture-gate e2e cells green |
| 2.3 | Reader surfaces: standalone + chapter-combo document.title (article half only), byline, h1, export filename on effective values; chapter neighbors canonical | ✓ VERIFIED | `ArticleView.tsx:1297` (combo — `chapterContext.book.title` byte-identical book half), `:1303` standalone, `:1844` filename, `:1898-1901` byline triple-swap, `:2073` h1; neighbor region `:1249` still reads `neighbor?.provenance.title` (canonical by D17-06); **my run:** cross-surface e2e asserts `document.title = "{effective} — Lem Reader"`, h1, byline |
| 2.4 | Highlights review + markdown export on effective values (OQ5: filename + all sort keys effective) | ✓ VERIFIED | `ReviewView.tsx:347/422/468` (options sort, select labels, section h2); `reviewFilter.ts:229` (sort key both operands); `markdown.ts:148-151/186/212/262` (citation, per-article h1, library section heading, unlocated sort); **my run:** markdown unit override case asserts canonical title AND author ABSENT from exported markdown; cross-surface e2e asserts export filename + content |
| 2.5 | Cross-surface one-name proof after one library edit | ✓ VERIFIED (behavioral) | **My run:** metadata-edit.spec.ts:689 cross-surface cell — edits via the real dialog then asserts strip (canonical `toHaveCount(0)`), reader h1/document.title/byline, review select option + section h2 (canonical absent), export filename + markdown (canonical absent) — PASSED chromium; 3-engine green in the recorded honest gate |
| **SC-3** | Clearing an override restores the canonical value, including an absent author (META-03) | ✓ VERIFIED (behavioral) | Dialog per-field Reset (`Reset title`/`Reset author` buttons, `titleReset` flag; blank-and-not-refused Save disabled with the pinned explanation copy `Type a title, or choose Reset to keep the original.`); **my run:** Reset-title e2e cell asserts `hasOwnProperty(row, "readerTitle") === false` on the RAW Dexie row (key DELETED, not blanked) + canonical restored; absent-author cell asserts no author line rendered + `readerAuthor` key gone — both PASSED chromium first-hand; unit absent-author derivation (`undefined ?? undefined === undefined`) in the 71/71 run |
| **SC-4** | Overrides migrate and export/import with explicit conflicts, and cascade when their article is removed (META-04) | ✓ VERIFIED | See truths 4.1–4.8 |
| 4.1 | Migration: pre-Phase-17 v5 rows hydrate overrides without a write-back | ✓ VERIFIED (behavioral) | `db.ts:85-92` widening + no-bump rationale (non-indexed fields, Option A); **my run:** dexie-migration.spec.ts Phase 17 describe 4/4 chromium — pre-17 row opens intact rendering canonical values with NO override key ever appearing on the raw stored row; forward-shape cell renders effective values |
| 4.2 | Bundle v3: 1\|2\|3 union read, writers emit 3, v4+ calm-refuses, v1/v2 import unchanged | ✓ VERIFIED | `bundle.ts:53` `z.union([z.literal(1), z.literal(2), z.literal(3)])`; `ExportImportService.ts:117` `3 as const` + peek `> 3` at `:242` (v4+ → newer-schema-version); manifest.ts zero diff since 98adadd (Pitfall 7); **my run:** bundle-schema/validate-bundle/export-service suites green incl. the flipped v4-refusal and writer-emit `toBe(3)` assertions; core-flow-spine v3-emit cell PASSED chromium |
| 4.3 | Round-trip: override edited on A exports in a v3 bundle and imports on B byte-equal at the row level | ✓ VERIFIED (behavioral) | **My run:** round-trip.spec.ts:632 "SC#4 overrides — an edited title/author travels machines byte-equal inside a v3 bundle" PASSED chromium (two-context A/B surrogate, raw-row equality, effective name in B's library, no-override regression companion) |
| 4.4 | Explicit conflicts: same-id differing overrides (incl. one-side-only) surface `article-metadata-override`; identical duplicate requires override state to match | ✓ VERIFIED | `conflicts.ts:365-398` else-if chain revision → divergence → metadata → no-op; `metadataDiffers` strict inequality on both fields (exported, `:194`); `MetadataConflictDetail` carries local/incoming override values + `localName`/`incomingName` via the ONE derivation; **my runs:** conflicts.test.ts (50 cases) green + import-preview e2e conflict row + one-side-only cell PASSED chromium |
| 4.5 | Keep-LOCAL default; per-item take-incoming; honest bulk overwrite; choice flows dialog → SettingsPanel → resolveImportPlan | ✓ VERIFIED (behavioral) | `conflicts.ts:656-659` `takeIncomingMetadata = per-kind overwrite OR per-item set`; metadata-only branch default skips (`:695-699`); `ImportPreviewDialog.tsx` per-item disclosure with `Keep mine`/`Use imported` selects + `metadataTakeIncoming` Set reset on every open + `onProceed` third arg (`:227` single invocation); `SettingsPanel.tsx:324` threads `{ metadataTakeIncoming }` as itemChoices; **my runs:** dialog unit 13/13 + e2e keep-local-default and Use-imported (incl. override REMOVAL when incoming lacks the key) cells PASSED chromium |
| 4.6 | Merge-on-win: an incoming revision/divergence win keeps LOCAL overrides (a refresh never renames the library — D17-10) | ✓ VERIFIED (behavioral) | `conflicts.ts:509-519` `mergeOnWin` spreads local `readerTitle`/`readerAuthor` onto the incoming row unless take-incoming; called at `:674` (revision-win) and `:686` (divergence-win); LOCAL-wins path untouched; **my runs:** unit D17-10 cases (revision+1 and divergence, both keep-local and take-incoming) green + e2e merge-on-win cell PASSED chromium |
| 4.7 | Cascade: removing an overridden article removes its override — no residue (D17-13) | ✓ VERIFIED (behavioral) | Overrides are article-row fields, so the existing atomic remove transaction deletes them by construction; **my run:** import-preview.spec.ts:467 cascade cell PASSED chromium (raw articles row gone after the library Remove flow) |
| 4.8 | Honest full-suite phase gate: `npm run test` exit 0 in one invocation with exact counts recorded | ✓ VERIFIED | Record exists in 17-05-SUMMARY.md (Verification Results table): first run honestly recorded RED (e2e 1323 passed / 3 failed / 10 skipped — core-flow-spine v2-emit × 3 engines), fixed forward (c84c7e1), final **exit 0 — unit 1344/0/13 (92 files + 2 skipped) + e2e 1326/0/10 across chromium/firefox/webkit (11.5m, fresh server)**; verifier independently confirmed the fixed assertion (core-flow-spine chromium PASSED in my own run) |

**Score:** 15/15 truths verified (0 present-but-behavior-unverified — every behavior-dependent invariant was exercised first-hand by the verifier's own unit + chromium e2e runs this session, with firefox/webkit coverage standing on the recorded 3-engine honest gate per the Phase 16 verification convention)

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Screen-reader pass on the EditMetadataDialog (NVDA/VoiceOver announcements of blank-title explanation, Reset labels, save feedback) | Phase 21 | REQUIREMENTS.md ACPT-08 traceability row maps the keyboard/NVDA/VoiceOver acceptance matrix to Phase 21; the automatable portion (keyboard walkthrough, Esc/focus restore, labeled controls, aria-labels naming the effective title) is e2e-proven in Phase 17 |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/content/schema.ts` | readerTitle/readerAuthor optional min(1) fields after tags | ✓ VERIFIED | L275-276 with phase-tagged comment; diff since phase start is additive-only |
| `src/persistence/db.ts` | Row-type widening + no-bump rationale | ✓ VERIFIED | L85-92; version blocks byte-unchanged, no upgrade callback |
| `src/ingestion/library/effectiveMetadata.ts` | The ONE derivation (effectiveTitle/effectiveAuthor) | ✓ VERIFIED | 56-line pure module, D14-20 banner, provenance read exactly twice |
| `src/ingestion/library/EditMetadataDialog.tsx` | Native edit dialog, single write, ≥120 lines | ✓ VERIFIED | 292 lines; five-part dialog grammar; single `db.articles.put` (L174) |
| `src/ingestion/library/LibraryRow.tsx` | onEdit prop + EditIcon + effective display | ✓ VERIFIED | L59/73/102/106/138-143; `library-row-edit` class + aria-label template |
| `src/ingestion/library/LibraryView.tsx` | editTarget + dialog mount + ingestionMeta gate | ✓ VERIFIED | L254 state, L725 `a.ingestionMeta !== undefined` gate (top-level articles only), L831 mount |
| `src/ingestion/library/libraryFilter.ts` | Override-only article haystack | ✓ VERIFIED | L93-94 + D17-07 comment; book haystack canonical |
| `src/ingestion/library/ContinueReadingStrip.tsx` | Effective values on article entries | ✓ VERIFIED | L234-237 inside truthy guard; book entries canonical |
| `src/routes/ArticleView.tsx` | 5 reader sites on effective values | ✓ VERIFIED | L1297/1303/1844/1898-1901/2073; neighbors canonical (L1249) |
| `src/routes/review/ReviewView.tsx` | 3 review sites | ✓ VERIFIED | L347/422/468 |
| `src/routes/review/reviewFilter.ts` | Sort key on effective title | ✓ VERIFIED | L229 both operands |
| `src/portability/markdown.ts` | Citations/headings/sort on effective values | ✓ VERIFIED | L148-151/186/212/262 |
| `src/portability/bundle.ts` | schemaVersion 1\|2\|3 union | ✓ VERIFIED | L53 `z.literal(3)` alongside 1 and 2 |
| `src/portability/conflicts.ts` | Seventh kind + metadataDiffers + merge-on-win + itemChoices | ✓ VERIFIED | L59 kind, L194 predicate, L509 mergeOnWin, L601 optional param |
| `src/reader/ImportPreviewDialog.tsx` | Per-item choice UI + extended onProceed | ✓ VERIFIED | L163 Set state, L227 single onProceed, L274+ disclosure, L321+ labels |
| `src/reader/SettingsPanel.tsx` | itemChoices threading | ✓ VERIFIED | L319-324 |
| `tests/unit/library/effective-metadata.test.ts` | ≥40 lines, ≥7 cases | ✓ VERIFIED | 117 lines, 8 cases, 71/71 green (with ingestion-schema) in my run |
| `tests/e2e/library/metadata-edit.spec.ts` | ≥9 lifecycle cells + cross-surface | ✓ VERIFIED | 10 tests; 10/10 chromium green in my run |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| effectiveMetadata.ts | schema.ts override fields | `readerTitle ?? article.provenance.title` | ✓ WIRED | L40/L55; consumers import the module (LibraryRow:35, LibraryView:63, libraryFilter:34, Strip:59, ArticleView:99, ReviewView:69, reviewFilter:39, markdown:30, conflicts.ts) |
| db.ts articles Table | schema.ts | `readerTitle?: string` row columns, no bump | ✓ WIRED | db.ts L91-92; whole-row put round-trips through ArticleSchema.safeParse reads (e2e row-truth proven) |
| EditMetadataDialog Save | db.articles (Dexie) | the ONLY override put call site | ✓ WIRED | L174; repo grep: no second writer added |
| LibraryView | EditMetadataDialog | onEdit gated on `ingestionMeta !== undefined`; onSaved bumps refreshKey | ✓ WIRED | L725 gate; L831-836 mount with refresh on save |
| libraryFilter.ts | effectiveMetadata.ts | haystack slots 1-2 effective | ✓ WIRED | L93-94; D17-07 cells green |
| conflicts.ts resolveImportPlan | ExportImportService applyImport | merge shaping in articlesToWrite before the puts-only tx | ✓ WIRED | mergeOnWin L509; applyImport + manifest.ts byte-unchanged since 98adadd (git diff empty) |
| ImportPreviewDialog onProceed | SettingsPanel resolveImportPlan | take-incoming id set as itemChoices | ✓ WIRED | Dialog L58/L227 → SettingsPanel L313/L324 |
| round-trip.spec.ts | ExportImportService | two-context A/B; schemaVersion 3 + row equality | ✓ WIRED | L170/L368/L681/L689; 4/4 chromium green in my run |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| LibraryRow | heading/byline text | Dexie articles row → ArticleSchema.parse → effectiveTitle/Author | Yes — real ingested rows (e2e drives real /api/ingest middleware) | ✓ FLOWING |
| EditMetadataDialog | titleValue/authorValue | captured CanonicalArticle override keys; write to db.articles | Yes — readRow asserts raw IndexedDB state after save | ✓ FLOWING |
| ImportPreviewDialog | metadataTakeIncoming | preview.metadataConflicts detail array from detectImportPreview | Yes — e2e drives real export→import across two contexts | ✓ FLOWING |
| markdown.ts export | citation/heading text | effectiveTitle/Author over saved rows | Yes — cross-surface cell asserts file content (canonical absent) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Derivation truth table + schema substrate | `npx vitest run tests/unit/library/effective-metadata.test.ts tests/unit/ingestion-schema.test.ts` | 71/71 passed (958ms) | ✓ PASS |
| Portability invariants (v3 union, conflicts, merge-on-win, take-incoming, dialog choice, markdown override, D17-07 search) | `npx vitest run tests/unit/portability/{conflicts,bundle-schema,validate-bundle,export-service,import-preview-dialog}.test.ts(x) tests/unit/portability/markdown.test.ts tests/unit/library-search.test.ts` | 143/143 passed (1.32s) | ✓ PASS |
| Edit lifecycle + cross-surface one-name (SC1/SC2/SC3) | `npx playwright test tests/e2e/library/metadata-edit.spec.ts --project=chromium` | 10/10 passed (6.9s) | ✓ PASS |
| Conflict flow, keep-local, take-incoming, merge-on-win, cascade (SC4) | `npx playwright test tests/e2e/portability/import-preview.spec.ts --project=chromium` | 6/6 passed (3.2s) | ✓ PASS |
| v3-bundle A/B round-trip byte equality (SC4) | `npx playwright test tests/e2e/portability/round-trip.spec.ts --project=chromium` | 4/4 passed (4.0s) | ✓ PASS |
| Migration no-write-back + forward shape (SC4) | `npx playwright test tests/e2e/ingestion/dexie-migration.spec.ts --project=chromium` | 4/4 passed (3.5s) | ✓ PASS |
| Writer-bump regression sweep (core-flow-spine) + fixture-text byte-stability after haystack swap (search-tag-filter) | `npx playwright test tests/e2e/portability/core-flow-spine.spec.ts tests/e2e/library/search-tag-filter.spec.ts --project=chromium` | 10/10 passed (10.0s) | ✓ PASS |

Total first-hand: 214 unit tests + 34 e2e cells (chromium), all green. Firefox/webkit stand on the recorded honest gate (17-05-SUMMARY: e2e 1326/0/10 across engines, exit 0). The full-suite re-run was not repeated by the verifier (12-minute cost); the gate record exists, its fixed assertion was independently re-verified green, and every Phase 17 spec was re-run first-hand above.

### Probe Execution

Not applicable — no probe convention (`scripts/*/tests/probe-*.sh`) exists in this project; phase plans declare no probes.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| META-01 | 17-01, 17-02 | Edit title/author without changing identity, provenance, revision, position, annotations | ✓ SATISFIED | Additive schema (diff-proven), single write site, e2e row-truth assertions (my run 10/10) |
| META-02 | 17-02, 17-03, 17-05 | Consistent appearance in Library, Reader, Highlights, search, exports | ✓ SATISFIED | One derivation, zero forks (grep audit), all surface swaps verified in code, cross-surface e2e green first-hand |
| META-03 | 17-01, 17-02 | Clear override restores canonical incl. absent author | ✓ SATISFIED | Reset deletes the key (raw-row hasOwnProperty=false e2e), absent-author restore green first-hand |
| META-04 | 17-04, 17-05 | Migrate safely, cascade on removal, round-trip with explicit conflicts | ✓ SATISFIED | Migration no-write-back, v3 round-trip byte-equal, conflict kind + both resolutions, merge-on-win, cascade — all green first-hand on chromium + 3-engine gate |

No orphaned requirements: REQUIREMENTS.md maps exactly META-01..04 to Phase 17; all four are claimed by plan frontmatter (`requirements:` union across 17-01..05 = {META-01..04}) and all are marked Complete in the traceability table — consistent with the evidence.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/portability/zipSlip.ts | 34/76/77 | 3 eslint errors (`no-control-regex` ×2, `no-useless-escape`) | ℹ️ Info | PRE-EXISTING Phase 09 debt, verified failing at plan-start HEAD 98adadd — NOT caused by Phase 17; already tracked in `deferred-items.md`; all Phase 17 files lint clean |
| EditMetadataDialog.tsx | 175-179 | Catch block swallows put failure and still fires onSaved | ℹ️ Info | Documented intentional design (RemoveConfirm calm-retry discipline: parent refresh re-derives the unchanged row; reader can retry). No direct test coverage of the put-failure path — acceptable for a local IndexedDB write, noted for completeness |

Zero `TBD`/`FIXME`/`XXX` markers across all 17 production files modified this phase. Zero TODO/HACK/PLACEHOLDER in the three new modules.

### Human Verification Required

None required beyond the deferred Phase 21 acceptance item. All functional truths carry first-hand automated behavioral evidence (see spot-check table); visual/UX polish and screen-reader readings follow the milestone's ACPT-08 acceptance pass in Phase 21.

### Gaps Summary

No gaps. The phase goal — readers personalize saved titles and authors while canonical identity, anchors, and portability remain intact — is fully achieved and verified at every level:

- **Canonical integrity (SC1):** schema diff is additive-only; Provenance/id/revision byte-stable; the single override write site omits cleared keys; e2e row-truth assertions green first-hand.
- **One name everywhere (SC2):** a single derivation module feeds all nine consuming surfaces; the fork audit found only the deliberate chapter/book canonical carve-outs; the cross-surface e2e proves the effective name (and the canonical name's ABSENCE) on every surface.
- **Clean restore (SC3):** Reset deletes override keys at the raw-row level (never blanks — min(1) makes blank unrepresentable), including the absent-author case.
- **Portability (SC4):** bumpless migration with no write-back, v3 bundle round-trip with byte-equal rows, honest explicit conflicts with keep-local default + per-item/bulk take-incoming, merge-on-win refresh protection, and removal cascade — all exercised first-hand plus the recorded 3-engine honest full-suite gate (unit 1344/0/13, e2e 1326/0/10, exit 0, with the first RED honestly documented and fixed forward in c84c7e1).

All 21 task commits verified present in git log. The 17-05 honest-gate record exists exactly as required (first-RED + final exit-0 with exact printed counts).

---

_Verified: 2026-08-30T03:22:55Z_
_Verifier: the agent (gsd-verifier)_
