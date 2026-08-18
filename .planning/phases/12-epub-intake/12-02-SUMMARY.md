---
phase: 12-epub-intake
plan: 02
subsystem: ingestion
tags: [epub, fast-xml-parser, fflate, toc-merge, drm-allowlist, zip-slip, jsdom, dompurify]

# Dependency graph
requires:
  - phase: 12-epub-intake (Plan 01)
    provides: fast-xml-parser@5.10.1 exact pin (D12-15), EPUB caps (EPUB_MAX_CHAPTERS/EPUB_EXTRACTION_TIMEOUT_MS/EPUB_MAX_ENTRY_BYTES), the 20-builder self-verifying synthetic EPUB fixture generator
  - phase: 07-ingestion-substrate (Plan 04/05)
    provides: sanitizeExtractedHtml + htmlToBlocks — the shared ING-07 normalization path every chapter rides unchanged
  - phase: 09-versioned-export-import
    provides: the fflate bomb-filter + isSafeEntryName Zip Slip discipline reused verbatim
provides:
  - epubToBooks(bytes) — the SC#4 pure swappable EPUB adapter (unzip → slip → DRM → container → OPF → nav|NCX → TOC-merge → per-chapter sanitize+walk → figure downgrade → admission)
  - EPUB_THRESHOLDS — { minChapterBlocks: 3, tocMergeMinEntries: 2, maxNestedXmlTags: 40 } (the D12-12 calibration-pinned object)
  - EpubToBooksResult / ChapterDraft contracts — {bookMeta, chapters, skippedCount, originalFileHash, fallbackUsed} / {blocks, footnotes, lang, title, spineIndex, sourceHtmlHash} (feeds 12-04 stages 2+ unchanged)
  - normalizeEpubHref — the ONE shared href normalizer (Pitfall 1 mitigation, used by both TOC and manifest sides)
  - withEpubTimeout / assertChapterCap / createEpubXmlParser / parseEpubArchive — internal exported-for-test helpers
  - The DRM allowlist gate (license.lcpl + rights.xml presence + font-obfuscation-only encryption.xml) — detection-only, never decrypts, no marker bytes in messages
  - tests/unit/server/epub-to-books.spec.ts — the 29-test adapter unit matrix (two describes)
affects: [12-03 persistence, 12-04 orchestrator branch + client picker, 12-05 orchestrator e2e, 12-06 reader UX, 12-07 portability, 12-08 dist proof, 12 calibration harness]

# Tech tracking
tech-stack:
  added: []  # fast-xml-parser was added by 12-01; this plan is its first consumer
  patterns:
    - "DTD refusal as the strong entity-expansion guard (processEntities:false neutralizes expansion; refusing <!DOCTYPE outright makes the entity-bomb class a calm epub-unreadable)"
    - "bomb-filter rejection detection: the fflate filter RECORDS over-cap entry names instead of silently skipping — a book carrying any over-cap entry refuses honestly"
    - "unit-level admission: the D12-10 readerability algebra judges the ASSEMBLED chapter unit (merged ranges are one reading document), while structural skips (nav doc, dangling idrefs, non-content media) stay per-document"
    - "document-title extraction from the RAW xhtml (sanitize strips <title>, so the raw JSDOM parse supplies the title chain's second arm)"

key-files:
  created:
    - server/epubToBooks.ts
    - tests/unit/server/epub-to-books.spec.ts
  modified: []

key-decisions:
  - "Admission (D12-10) judges the assembled chapter UNIT, not the individual spine document — frontMatterBook's title/copyright docs walk to 2 blocks each (below minChapterBlocks=3) yet the plan pins a 3-unit outcome with front matter staying; per-document reading contradicts the plan's own binding test contract, and 12-RESEARCH Pattern 5 ('the unit is the chapter document') reads the same way. skippedCount therefore discloses UNITS, matching Pitfall 10's admitted-only numbering"
  - "Entity-bomb refusal mechanism = DTD rejection: with processEntities:false, fast-xml-parser parses the entityBombOpf DOCTYPE harmlessly (entities stay literal), so the pinned epub-unreadable outcome required refusing <!DOCTYPE-bearing XML outright — applied to every XML document the adapter parses"
  - "bombEntryBook refuses via filter-rejection detection (the filter records over-cap entry names before returning false) — the plan's 'filtered entry → missing required document' theory cannot hold because bomb.xhtml is an extra entry referenced by nothing; direct detection satisfies the pinned refusal without loosening the filter-before-inflate discipline"
  - "Task 1 shipped a fully functional fallback partition (one chapter per readerable spine item) rather than a stub, so epubToBooks was honest at the Task-1 commit; Task 2 layered the nav/NCX TOC-merge onto the same walk/emit machinery"
  - "epubToBooks ships bytes-only (no hints param) — the must_haves truth 'bytes in, {…} out' is the contract; the artifacts line's hints? seam stays available for 12-04 to widen additively if ever needed"
  - "Chapter-title chain: TOC label → raw-document <title> → first heading → 'Chapter N' (admitted-order numbering only); the leading unit's label of last resort is the unnumbered 'Front matter'"

patterns-established:
  - "removeNSPrefix key convention pinned by test (dc:title → 'title', epub:type → '@_type' — assumption A7)"
  - "DRM copy constant DRM_REFUSAL_MESSAGE used verbatim for every refusal path so marker bytes can never leak"

requirements-completed: []  # ING-05 stays open — the adapter is the parsing surface only; the requirement closes at the end-to-end plans (12-05+), the 04-02/09-01/10-01/12-01 split precedent

# Metrics
duration: 13 min
completed: 2026-08-18
status: complete
---

# Phase 12 Plan 02: EPUB Adapter Summary

**The pure epubToBooks adapter: fflate unzip with bomb/slip gates, the DRM allowlist refusal, the namespaced container→OPF→nav|NCX parse chain via fast-xml-parser, and the D12-09 TOC→spine-range chapter merge — green across a 29-test hostile/structural matrix over the 12-01 synthetic corpus**

## Performance

- **Duration:** 13 min
- **Started:** 2026-08-18T14:56:42Z
- **Completed:** 2026-08-18T15:10:03Z
- **Tasks:** 2
- **Files modified:** 2 (2 created)

## Accomplishments

- **Archive + DRM layer (Task 1)**: fflate `unzipSync` with the `originalSize <= EPUB_MAX_ENTRY_BYTES` filter (over-cap entries refused before inflation — and detected, not silently skipped), `isSafeEntryName` on every entry key (the Phase 9 gate imported, never re-derived), and the detection-only DRM allowlist: `license.lcpl`/`rights.xml` presence checks first, then `encryption.xml` parsed with EVERY `EncryptionMethod/@Algorithm` required to be the OCF font-obfuscation URI — the single pass condition, appearing exactly once in the file
- **Hardened XML chain (Task 1)**: ONE `createEpubXmlParser` factory (`processEntities:false`, `removeNSPrefix:true`, `maxNestedTags:40`, `isArray` for the ten repeatable elements) + a DTD refusal + the whole-parse try→`epub-unreadable` envelope; container.xml→OPF parse with metadata (role="aut"-preferred creator ordering, "Untitled book"/"en" tolerant fallbacks), manifest map, ordered spine, and the shared `normalizeEpubHref` both TOC and manifest sides normalize through (the OEBPS fixture pins the regression)
- **TOC-merge + output contract (Task 2)**: nav (EPUB 3, preferred per §5.9.5) and NCX (EPUB 2) flattening to `{label, href, depth}`; depth-1 chapter units with single-entry degenerate descent; `[pos(k), pos(k+1))` spine ranges so publisher-split documents merge; a leading front-matter unit; `< 2` resolved entries → the one-per-spine-item fallback with `fallbackUsed` exposed; figure downgrade to unsupported blocks (T-12-05 IP-leak closed); unit-level admission with `skippedCount` disclosure; both hashes (`originalFileHash`, per-chapter `sourceHtmlHash`) computed in-adapter so the orchestrator never re-reads bytes
- **Full unit matrix**: 29 tests across the two describes (hostile refusals, DRM messages free of marker bytes, parser key conventions, chapter-count matrix 4/3/3/3/3/4/3/2+1/empty, merge spine-order proof, deterministic output, Block-schema parse of every emitted block); full unit suite **1020 passed / 0 failed / 10 intentional skips** (12-01's 991 + 29 new); `npx tsc --noEmit` exit 0

## Task Commits

Each task was committed atomically:

1. **Task 1: Archive layer + DRM gate + container/OPF/nav/NCX parsing** — `96259b4` (feat)
2. **Task 2: TOC-merge (D12-09) + chapter assembly + admission + output contract** — `c4546fb` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `server/epubToBooks.ts` — the SC#4 swappable adapter (1051 lines): parse chain, DRM allowlist, TOC-merge, walk machinery, EPUB_THRESHOLDS, all exported-for-test helpers
- `tests/unit/server/epub-to-books.spec.ts` — the adapter unit matrix (329 lines, two describes) over the 12-01 fixture builders

## Decisions Made

- See key-decisions above; the admission-unit, DTD-refusal, and bomb-detection decisions carry to STATE.md.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Plan contradiction] Admission runs on the assembled chapter unit, not per spine document**
- **Found during:** Task 2 (chapter assembly)
- **Issue:** Plan step 5 words the D12-10 algebra "per spine document", but the fixture's front-matter documents (title page, copyright) walk to 2 blocks each — below `minChapterBlocks: 3` — while the plan's own binding test pins `frontMatterBook → 3 units with the leading unit first` and must_haves truth #5 requires "front matter with real text stays". The two cannot both hold under per-document admission
- **Fix:** The readerability gate judges each chapter UNIT's concatenated blocks (title page + copyright = 4 blocks → passes; a lone plate = 1 unsupported block → fails); structural skips (nav doc, dangling idrefs, non-content media types) remain per-document. `skippedCount` discloses units — consistent with D12-11's "N chapters could not be read" and Pitfall 10's admitted-only numbering
- **Files modified:** server/epubToBooks.ts
- **Verification:** frontMatterBook 3 units (leading titled from its first document), mixedAdmissionBook 2+1, emptyBook epub-empty — all green
- **Committed in:** c4546fb

**2. [Rule 3 - Blocking] entityBombOpf would NOT refuse under processEntities:false alone**
- **Found during:** Task 1 (XML parser verification)
- **Issue:** Verified against the installed fast-xml-parser 5.10.1: with `processEntities:false` the billion-laughs DOCTYPE parses harmlessly (entities stay literal, e.g. title "Entity Bomb &a3;"), so the plan's pinned `entityBombOpf → epub-unreadable` was unreachable via the options block alone
- **Fix:** Added a DTD refusal (`<!DOCTYPE` detected → calm `epub-unreadable`) applied to every XML document the adapter parses — the standard strong form of the entity-expansion guard, since OCF container/OPF/nav/NCX never legitimately carry a DOCTYPE
- **Files modified:** server/epubToBooks.ts
- **Verification:** entityBombOpf refuses epub-unreadable; protoPollutionOpf refuses via the parser's own dangerous-property throw wrapped in the same envelope
- **Committed in:** 96259b4

**3. [Rule 3 - Blocking] bombEntryBook's "missing required document" theory cannot hold**
- **Found during:** Task 1 (unzip layer)
- **Issue:** The plan expects `bombEntryBook → epub-unreadable (filtered entry → missing required document)`, but the fixture's over-cap `bomb.xhtml` is an EXTRA entry referenced by no manifest — filtering it leaves a fully valid book that would parse successfully
- **Fix:** The fflate filter callback RECORDS rejected entry names before returning false; any over-cap entry refuses `epub-unreadable` outright. The entry is still never inflated (metadata-only rejection), keeping the Phase 9 filter-before-inflate discipline intact
- **Files modified:** server/epubToBooks.ts
- **Verification:** bombEntryBook refuses epub-unreadable; the spec also asserts `BOMB_ENTRY_DECLARED_SIZE > EPUB_MAX_ENTRY_BYTES` against the real server cap (the exported coupling point)
- **Committed in:** 96259b4

---

**Total deviations:** 3 auto-fixed (1 plan-contradiction resolution, 2 blocking)
**Impact on plan:** All three reconcile the plan's pinned test outcomes with its literal mechanism descriptions — outcomes were never loosened, mechanisms were chosen to satisfy them. No scope creep.

## Issues Encountered

- **`htmlToBlocks` cannot supply the document title for the chapter title chain**: `sanitizeExtractedHtml` strips `<title>` (not in SANITIZE_CONFIG's ALLOWED_TAGS), so the walked provenance is always empty for chapters. The chain's document-title arm extracts `<title>` from the RAW xhtml via a pre-sanitize JSDOM parse (one extra parse per document, correctness-first). Pinned by the frontMatterBook leading-unit test.

## Verification Evidence (plan-level)

- `npx vitest run tests/unit/server/epub-to-books.spec.ts` — **29/29 green** (both describes)
- `npx tsc --noEmit` — exit 0 (the adapter typechecks transitively through the spec import; tsconfig includes `tests/`)
- Grep gates: zero `Readability`/`isProbablyReaderable` references in `server/epubToBooks.ts`; src/ imports are exactly the type-only `Block`/`InlineRun` + the `zipSlip` helper; the font-obfuscation URI appears exactly once (the pass condition); license.lcpl/rights.xml checks precede encryption.xml parsing (source order L352/L355 < L360)
- Full unit suite: **1020 passed / 0 failed / 10 intentional skips** (`npm run test:unit -- --run`) — 12-01's 991 + this plan's 29, no collateral

## Threat Mitigation Proof (plan threat_model)

- T-12-01 (zip bomb): filter-before-inflate + honest refusal — bombEntryBook test
- T-12-02 (Zip Slip): isSafeEntryName on every key — zipSlipBook test
- T-12-03 (mXSS): chapters ride sanitizeExtractedHtml (the 07-04-suite surface) before the walk — Block-schema parse of every emitted block
- T-12-04 (entity expansion): DTD refusal + processEntities:false — entityBombOpf test
- T-12-06 (prototype pollution): parser dangerous-property guard inside the try envelope — protoPollutionOpf test
- T-12-05 (remote-src beacon): figure downgrade with zero survivors + URL absent from all payloads — imageChapterBook test
- T-12-07 (DRM posture): detection-only allowlist; refusal message constant carries no marker bytes — all three DRM tests
- T-12-08 (hostile manifests): maxNestedTags 40 + EPUB_MAX_CHAPTERS cap + timeout race + (12-03/12-04 enforce EPUB_MAX_BYTES)

## User Setup Required

None - no external service configuration required.

## Authentication Gates

None.

## Next Phase Readiness

- 12-03 (persistence), 12-04 (orchestrator fifth Stage-1 branch + client picker), 12-05 (e2e) consume `EpubToBooksResult`/`ChapterDraft` unchanged — the five per-article fields ride the existing stages-2+ path; `sourceHtmlHash`/`originalFileHash` mean the orchestrator never re-reads bytes for `IngestionMeta.originalHtmlHash`
- The DRM/unreadable/empty/too-large refusal reasons all exist in the widened 12-01 enum; calm `mapReasonToCopy` strings land in 12-04 (the calm default copy covers them until then)
- `fallbackUsed` is exposed for the D12-12 calibration harness (Pitfall 1's warning sign) and the corpus replay

## Self-Check: PASSED

- Key files exist on disk (`[ -f ]`: server/epubToBooks.ts, tests/unit/server/epub-to-books.spec.ts)
- Commits `96259b4` + `c4546fb` present in `git log`; zero file deletions across both
- All task acceptance criteria re-verified (grep gates, refusal matrix, chapter-count matrix, contract fields, vitest/tsc exits)

---
*Phase: 12-epub-intake*
*Completed: 2026-08-18*
