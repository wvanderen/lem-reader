---
phase: 20-safe-local-image-fidelity
plan: 01
subsystem: ingestion
tags: [ssrf, image-sniffing, zod, safe-fetch, image-size, is-animated, typed-refusals]

# Dependency graph
requires:
  - phase: 07-url-html-intake
    provides: safeFetch 9-measure SSRF pipeline, IngestionError typed reasons, limits.ts constants pattern
  - phase: 12-epub-intake
    provides: MAX_IMAGE_PIXELS pdf.js bomb-cap precedent re-used as MAX_ASSET_PIXELS
provides:
  - fetchImageAsset / sniffImageAsset seam with typed refusals ("fetch" | "type" | "bytes" | "pixels" | "animated")
  - safeFetchCore(url, profile) parameterized two-profile SSRF core (document profile byte-stable)
  - FigureBlock three-state model (asset:img-<12hex> ref / refused no-src / legacy remote) + originalSrc/width/height
  - Eight shared image cap constants in src/ingestion/types.ts re-exported from server/limits.ts
affects: [20-02 asset stage, 20-03 persistence, 20-04 renderer, 20-06 epub extraction, 20-07 corpus caps]

# Tech tracking
tech-stack:
  added: [image-size@2.0.2 (exact-pinned, server-only), is-animated@2.0.2 (exact-pinned, server-only)]
  patterns:
    - "One SSRF pipeline, two profiles — safeFetchCore(rawUrl, {allowedContentTypes, timeoutMs, maxBytes, bodyKind}); wrappers never fork the 9 measures"
    - "Typed refusal unions returned, never thrown (D20-05) — closed at fetch level; stage arms live on 20-02's AssetResolution only"
    - "Sniff over declaration — magic bytes authoritative, content-type headers advisory (D20-10)"
    - "Post-read bytes.byteLength re-check for lying/chunked/absent content-length (12-04 discipline)"
    - "is-animated requires a Node Buffer — zero-copy Buffer view over the Uint8Array (plain Uint8Array silently reports not-animated)"

key-files:
  created:
    - server/fetchImageAsset.ts
    - tests/unit/server/fetchImageAsset.spec.ts
  modified:
    - server/safeFetch.ts
    - server/limits.ts
    - src/content/schema.ts
    - src/ingestion/types.ts
    - tests/unit/schema.test.ts
    - tests/unit/ingestion-schema.test.ts
    - tests/unit/server/safe-fetch.spec.ts
    - package.json
    - package-lock.json

key-decisions:
  - "image-size reports JPEG as \"jpg\" — normalized onto the jpeg arm; contentType stays canonical image/jpeg"
  - "is-animated gets a zero-copy Buffer view (library calls toString('ascii')/readUInt32BE; Uint8Array input would silently disable D20-09)"
  - "Missing raster dims (recognized type, unusable header) refuse \"type\" — never persist undefined geometry"
  - "Fetch-layer failures (SSRF refusal, timeout, network error, core caps) all map to the typed \"fetch\" refusal"

patterns-established:
  - "Two-profile safeFetchCore seam: profile = {allowedContentTypes, timeoutMs, maxBytes, bodyKind: 'text' | 'bytes'}"
  - "Authentic-minimal-byte test crafting verified against both sniff libraries' sources (animated GIF = 2 image descriptors + NETSCAPE2.0; APNG = acTL+fcTL+IDAT+fcTL+fdAT; animated WebP = VP8X+ANIM)"

requirements-completed: []  # IMG-02 machinery exists but the requirement closes with the end-to-end asset-stage plans (20-02+); mirrors the 04-02 PAGE-01 / 10-01 RECV-01 split precedent

# Metrics
duration: 14min
completed: 2026-08-31
status: complete
---

# Phase 20 Plan 01: Safe Asset-Fetch Substrate Summary

**Parameterized two-profile SSRF core (safeFetchCore) + authoritative byte-sniff module (fetchImageAsset/sniffImageAsset) with typed refusals, evolved three-state FigureBlock, and eight shared image caps — proven byte-stable by the untouched 19-vector SSRF matrix**

## Performance

- **Duration:** 14 min
- **Started:** 2026-08-31T14:38:54Z
- **Completed:** 2026-08-31T14:53:27Z
- **Tasks:** 3 (Tasks 1 & 3 TDD: RED→GREEN)
- **Files modified:** 11 (2 created, 9 modified — exactly the plan's files_modified list)

## Accomplishments

- **IMG-02 fetch/limit machinery exists**: every secondary image fetch passes the same 9-measure SSRF pipeline as document fetches (scheme, metadata-hostname, DNS, IP deny-list, per-hop redirects, pinning, timeout, byte cap, content-type gate) — parameterized via `safeFetchCore(url, profile)`, never forked
- **Media boundary enforced at the earliest testable seam**: sniffed type outside jpeg/png/webp/gif/avif (SVG bytes under a lying image/png header included) refuses with typed reason `"type"`; animated GIF/WebP/APNG refuse `"animated"`; pixel bombs refuse `"pixels"`; every refusal is a returned typed value, never a throw
- **D20-13 geometry correctness**: JPEG EXIF orientation ≥ 5 yields orientation-corrected width/height so the reserved box matches the rendered aspect
- **FigureBlock models all three figure states at parse time** (accepted asset-ref / refused no-src / legacy remote) with `data:` URIs structurally unrepresentable (D20-02)
- **Document profile proven byte-stable**: ssrf-matrix.spec.ts byte-unchanged and green on chromium (19 passed / 2 documented residuals); full unit suite 1476 passed / 0 failed / 13 documented skips

## Task Commits

Each task was committed atomically (TDD tasks: RED test commit → GREEN feat commit):

1. **Task 1: Sniff packages, shared cap constants, FigureBlock additive evolution** — `e391719` (test) + `60351ab` (feat)
2. **Task 2: safeFetch two-profile refactor (isolated commit, document profile byte-stable)** — `fd37e4a` (refactor)
3. **Task 3: fetchImageAsset sniff module + typed-refusal matrix** — `263f4f3` (test) + `844591d` (feat)

## TDD Gate Compliance

- Task 1: RED `e391719` (11 failing cells: union arm, optional src, new fields, constants) → GREEN `60351ab` (124/124) ✓
- Task 3: RED `263f4f3` (26 failing cells on assertions against the placeholder stub) → GREEN `844591d` (30/30) ✓
- Task 2 is a refactor task (not TDD-flagged): isolated commit `fd37e4a` before any Task-3 feature work (Pitfall 4 honored)

## Files Created/Modified

- `server/fetchImageAsset.ts` — NEW: `fetchImageAsset(url)` (image-profile safeFetchCore wrapper, the ONLY asset egress), `sniffImageAsset(bytes)` (network-free seam for 20-06 EPUB reuse), `ImageAsset`/`ImageAssetRefusal` types, `IMAGE_FETCH_PROFILE`
- `tests/unit/server/fetchImageAsset.spec.ts` — NEW: 30-cell matrix over authentic minimal image bytes (5 valid formats, animated GIF/WebP/APNG, svg-under-lying-header, pixel bomb, byte-cap boundary, EXIF swap, fetch-failure mapping, body-never-read guards, redirect sniff, assetId determinism); zero expected-throw assertions
- `server/safeFetch.ts` — extracted exported `safeFetchCore(rawUrl, profile, hopDepth)`; `safeFetch` remains the document wrapper passing today's exact constants; image branch reads arrayBuffer() + post-read byteLength re-check
- `server/limits.ts` — import + re-export of the eight image caps (PDF_MAX_BYTES precedent)
- `src/content/schema.ts` — exported `assetRef` regex `/^asset:img-[a-z0-9]{12}$/`; FigureBlock `src: z.union([httpUrl, assetRef]).optional()`, `originalSrc`/`width`/`height` optional ints; alt+caption untouched (D-05 byte-identity)
- `src/ingestion/types.ts` — MAX_ASSET_BYTES 16MB, MAX_ASSET_PIXELS 16,777_216 (= MAX_IMAGE_PIXELS), ASSET_FETCH_TIMEOUT_MS 15s, ASSET_STAGE_DEADLINE_MS 60s, ASSET_FETCH_CONCURRENCY 4, MAX_FIGURES_PER_ARTICLE 120, MAX_ARTICLE_ASSET_BYTES 150MB, MAX_ASSET_RESPONSE_BYTES 3MB (D20-11 corpus-tunable for 20-07)
- `tests/unit/schema.test.ts` — FigureBlock evolution describe (three states, banned schemes, malformed refs, dim guards)
- `tests/unit/ingestion-schema.test.ts` — constants pinning + server/limits re-export proof
- `tests/unit/server/safe-fetch.spec.ts` — strengthen-only: 6 new safeFetchCore image-profile cells + additive arrayBuffer fake; zero deletions
- `package.json` / `package-lock.json` — image-size@2.0.2 + is-animated@2.0.2 exact-pinned (no caret/tilde), server-only imports

## Decisions Made

- image-size@2.0.2 reports the JPEG type string as `"jpg"` — the sniff gate normalizes it onto the `jpeg` arm so `contentType` stays the canonical `"image/jpeg"` (empirically verified during implementation)
- is-animated@2.0.2 is given a **zero-copy Buffer view**: the library calls `Buffer.prototype.toString("ascii")` / `readUInt32BE`, which a plain Uint8Array lacks — with plain bytes the GIF/PNG animation detection silently never fires (D20-09 would be vacuous). The animated-GIF spec cell locks this wiring
- A recognized raster type with unusable/absent dims refuses `"type"` (defensive — never persist undefined geometry into the D20-13 reserved box)
- Every fetch-layer failure (IngestionError from any SSRF measure/cap/content-type gate, or a network-level rejection) maps to the single typed `"fetch"` refusal — the never-throw surface stays flat for the 20-02 stage

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] is-animated silently no-ops on plain Uint8Array input**
- **Found during:** Task 3 (byte-recipe verification, before writing the spec)
- **Issue:** is-animated@2.0.2 requires a Node Buffer (`toString("ascii")`, `readUInt32BE`); a plain Uint8Array fails its GIF/PNG type dispatch and returns `false` for everything — animated-image refusal (D20-09) would never fire
- **Fix:** `sniffImageAsset` wraps bytes in a zero-copy `Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)` view; spec cells for animated GIF/WebP/APNG lock the wiring
- **Files modified:** server/fetchImageAsset.ts, tests/unit/server/fetchImageAsset.spec.ts
- **Verification:** animated GIF (2 image descriptors + NETSCAPE2.0), animated WebP (VP8X+ANIM), and APNG (acTL+fcTL+IDAT+fcTL+fdAT) cells all refuse `"animated"`; static twins admit
- **Committed in:** 844591d

**2. [Rule 1 - Bug] image-size JPEG type string is "jpg", not "jpeg"**
- **Found during:** Task 3 (scratch verification against the installed library)
- **Issue:** the plan's sniffed-type set names `jpeg`; the library reports `"jpg"`, so a literal set membership would refuse every valid JPEG
- **Fix:** normalize `"jpg"` → `"jpeg"` before the gate; contentType derives from the normalized arm
- **Files modified:** server/fetchImageAsset.ts
- **Verification:** valid-JPEG spec cell admits with contentType `"image/jpeg"`; EXIF cells parse orientation
- **Committed in:** 844591d

**3. [Rule 2 - Missing critical] is-animated ships no type declarations**
- **Found during:** Task 3 GREEN (tsc --noEmit caught TS7016; vitest alone does not typecheck)
- **Issue:** `npm run build` would fail on the implicit-any import
- **Fix:** `@ts-expect-error` on the import + local `(buffer: Buffer) => boolean` typing inside the single-seam module (self-documenting; becomes an unused-directive error once the package ships types)
- **Files modified:** server/fetchImageAsset.ts
- **Verification:** `npx tsc --noEmit` clean; eslint clean
- **Committed in:** 844591d

**4. [Rule 1 - Test-craft] spec byte-recipe fixes (APNG chunk length/case, JPEG APP0 length)**
- **Found during:** Task 3 (RED→GREEN iteration)
- **Issue:** hand-crafted APNG chunks used type+payload as the length field and lowercase-'l' hex in acTL/fcTL; the static JPEG's APP0 carried one byte too many — all three made authentic cells fail for byte-crafting reasons rather than contract reasons
- **Fix:** corrected recipes (verified against both libraries' parsers before landing)
- **Files modified:** tests/unit/server/fetchImageAsset.spec.ts
- **Verification:** 30/30 cells green
- **Committed in:** 844591d

---

**Total deviations:** 4 auto-fixed (2 bugs, 1 missing critical, 1 test-craft)
**Impact on plan:** All fixes were correctness requirements discovered by empirical verification against the real libraries — exactly what the single-seam-module design anticipated (T-20-SC swappability). No scope creep; no plan-level behavior changes.

## Issues Encountered

None beyond the deviations above. The Task-2 content-type test cell initially tripped the tiny profile's size cap before the content-type gate (pipeline order is size → type) — fixed in-cell with an under-cap content-length before commit.

## User Setup Required

None — no external service configuration. The two npm packages are installed, exact-pinned, and legitimacy-audited OK in 20-RESEARCH (both verdict Approved, zero deps, no install scripts).

## Next Phase Readiness

- Everything 20-02 (asset stage), 20-06 (EPUB container extraction — reuses `sniffImageAsset` network-free), and 20-04 (renderer — consumes FigureBlock states + dims) need is in place: `ImageAsset`/`assetRef`/caps/`safeFetchCore`
- `ImageAssetRefusal` is intentionally CLOSED at fetch-level arms; stage arms ("count"/"budget"/"deadline") belong only to 20-02's `AssetResolution` supertype
- Documented residual for 20-07 awareness: animated AVIF passes `is-animated` (library covers GIF/APNG/WebP only — 20-RESEARCH Pitfall 8, accepted residual)
- The full-suite honest gate for the phase closes in the phase's final plans; this plan ran the complete unit suite (1476/0) + the SSRF matrix pin on chromium

## Self-Check: PASSED

- Created files exist: server/fetchImageAsset.ts ✓, tests/unit/server/fetchImageAsset.spec.ts ✓
- All five task commits present in git log: e391719, 60351ab, fd37e4a, 263f4f3, 844591d ✓
- Verification commands re-run: `npx vitest run tests/unit/schema.test.ts tests/unit/ingestion-schema.test.ts tests/unit/server/safe-fetch.spec.ts tests/unit/server/fetchImageAsset.spec.ts` → 187/187 ✓; `npx playwright test tests/e2e/ingestion/ssrf-matrix.spec.ts --project=chromium` → 19 passed / 2 documented skips ✓; full unit suite 1476/0/13 ✓; `rg -l "image-size|is-animated" src/` → empty ✓; package.json exact pins ✓

---
*Phase: 20-safe-local-image-fidelity*
*Completed: 2026-08-31*
