---
phase: 01-canonical-article-foundation
verified: 2026-07-29T10:15:00Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 1: Canonical Article Foundation — Verification Report

**Phase Goal (User Story):** As a reader, I want to open representative saved articles rendered with faithful semantic structure, provenance, and stable content identity, so that I can read normalized long-form content in canonical order with a coordinate system that supports later navigation and annotation.
**Mode:** mvp
**Verified:** 2026-07-29T10:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

The phase goal — its user story's `[outcome]` clause ("read normalized long-form content in canonical order with a coordinate system that supports later navigation and annotation") — is observably true in the codebase. Six curated real articles open with faithful semantic structure and real provenance; all nine block kinds render as native HTML in canonical order; unsupported content is disclosed inline rather than silently dropped; and the D-05 grapheme-coordinate substrate is frozen, deterministic, and unit-tested so Phase 2 (location) and Phase 5 (annotations) can persist offsets against it.

The MVP-mode user-flow walk-through (01-UAT.md) was performed by the user, diagnosed three gaps (tests 2, 9, 10), and gap-closure plans 01-04 and 01-05 closed all three with automated regression coverage.

### User Flow Coverage

User story: «As a reader, I want to open representative saved articles rendered with faithful semantic structure, provenance, and stable content identity, so that I can read normalized long-form content in canonical order with a coordinate system that supports later navigation and annotation.»

| Step | Expected | Evidence | Status |
|------|----------|----------|--------|
| Cold start & browse list | App boots, "Saved articles" list shows 6 article rows with title/metadata and "Open article" link; heading has comfortable inset | `src/routes/FixtureList.tsx:34-67` (main#main + h1 + rows + aria-labelledby); `src/app.css:125` (`main#main { padding-inline: var(--space-md) }` — Gap 1 closure); e2e "fixture list exposes one row per curated fixture" passes ×3 engines | ✓ |
| Open an article | Hash route `#/article/<id>` swaps to ArticleView; title is the single `<h1>` from provenance; author/date/source link beneath | `src/App.tsx:14-15` (`parseHash` maps `#/article/<id>`); `src/routes/ArticleView.tsx:72-85` (h1 from `provenance.title`, meta, source link); e2e "renders title, source link, body" passes for all 6 fixtures ×3 engines | ✓ |
| Read in canonical order | Headings, prose, links, blockquotes, lists, figures+captions, code, footnote refs render as native HTML in array order | `src/content/render/BlockRenderer.tsx:21-113` (exhaustive 9-kind switch, DOM order == array order); corpus exercises all 9 kinds (16 heading, 31 paragraph, 3 blockquote, 2 bulleted-list, 3 numbered-list, 2 figure, 4 code-block, 3 footnote-reference, 2 unsupported) | ✓ |
| Follow preserved links / provenance | Source-URL link opens original publisher in new tab with reverse-tabnabbing guard + visually-hidden new-tab announcement | `src/routes/ArticleView.tsx:81-84` (`target="_blank" rel="noopener noreferrer"` + `.visually-hidden` span); `src/fixtures/articles/essay-long-form.canonical.json` carries real `aeon.co` sourceUrl/author/publishedAt/originalHtmlHash | ✓ |
| Unsupported content disclosed inline | Where fixture has content Lem Reader can't render, a `<details>` disclosure appears at canonical position, not silently dropped | `src/content/render/BlockRenderer.tsx:100-111` (`<details class="disclosure">` at canonical position); `src/fixtures/articles/unsupported-case.canonical.json` has 2 unsupported blocks (table + iframe) with plainDescription | ✓ |
| Footnote round-trip | Footnote reference marker jumps to footnote body; body links back; in-page scroll, NOT a route change | `src/content/render/BlockRenderer.tsx:87-99` (forward ref `#fn-N`) + `132-138` (back-link `#fn-ref-N`); `src/App.tsx:32` (router guard ignores non-`#/` fragments — Gap 3 closure); e2e "footnote round-trip stays in-article (figure-heavy)" passes ×3 engines | ✓ |
| Outcome | "Read normalized long-form content in canonical order with a coordinate system that supports later navigation and annotation" | User-flow steps above prove reading in canonical order; D-05 coordinate substrate (`src/content/normalizeText.ts`) is frozen, deterministic, unit-tested — see SC-4 below | ✓ |

### Observable Truths (ROADMAP Success Criteria)

| # | Truth (Success Criterion) | Status | Evidence |
|---|---------------------------|--------|----------|
| 1 | Reader can open every article in the curated fixture set and identify its title, metadata, and original source. | ✓ VERIFIED | 6 fixtures in `src/fixtures/articles/`; loader `src/fixtures/index.ts:21-28` parses each through `ArticleSchema.parse`; e2e `open-every-fixture.spec.ts` opens all 6 ×3 engines asserting h1 + source link + body + no console errors (all pass). ArticleView renders title (h1), author/date (`.meta`), and "Originally published at {domain}" link (`ArticleView.tsx:72-85`). |
| 2 | Reader encounters headings, prose, links, quotations, lists, figures, captions, footnotes, and code in canonical semantic order. | ✓ VERIFIED | `BlockRenderer.tsx` exhaustive switch over all 9 kinds emits native `h1-h6`/`p`/`blockquote`/`ul`/`ol`/`figure+figcaption`/`pre>code`/`sup>a`; `InlineRenderer.tsx` handles the 4 locked marks. Corpus grep confirms all 9 kinds exercised across the 6 fixtures. axe-core e2e asserts zero heading-order/list violations ×3 engines. |
| 3 | Reader can follow preserved links, while unsupported fixture content is disclosed instead of silently disappearing. | ✓ VERIFIED | Inline `<a>` links render via `InlineRenderer.tsx:24-31` (same-tab); source-URL provenance link in `ArticleView.tsx:81-84` (new-tab + noopener). DOC-06 unsupported disclosure at `BlockRenderer.tsx:100-111` (`<details>` inline at canonical position with verbatim UI-SPEC microcopy); 2 unsupported blocks in `unsupported-case.canonical.json`. Component tests assert the disclosure renders. |
| 4 | The same article revision exposes one stable logical text coordinate system for all later reading locations and annotations. | ✓ VERIFIED | `src/content/normalizeText.ts` implements the frozen D-05 substrate: `normalizeText` is pure/deterministic; `graphemeClusters` counts `Intl.Segmenter` ordinals (not UTF-16 — Pitfall 1); footnote bodies participate after body blocks (Pitfall 3); ASCII-only whitespace collapse (Pitfall 2); `deriveQuoteSelector` round-trips. `schema.ts` locks D-06 identity (slug id `/^[a-z0-9-]+$/`) + monotonic `revision: int().min(1)`. 73 unit tests cover schema/identity/normalizeText/graphemeOffsets/selectors (all pass). `resolveQuoteSelector` correctly deferred to Phase 5. |

**Score:** 4/4 truths verified (0 present, behavior-unverified)

*Note on behavior-dependence:* Truths 1-3 are runtime-rendering behaviors exercised by the e2e suite (open-every-fixture + axe-core across Chromium/Firefox/WebKit, all green). Truth 4's determinism invariant is exercised by the normalizeText/graphemeOffsets unit suites. The footnote round-trip (a state-transition invariant: click must scroll without unmounting) is exercised by the single named e2e test "footnote round-trip stays in-article (figure-heavy, Gap 3)" — VERIFIED, not merely present.

### UAT Gap Closure (01-UAT.md tests 2, 9, 10)

| Gap | UAT Test | Severity | Closure Evidence | Status |
|-----|----------|----------|------------------|--------|
| 1. Fixture-list flush-edge heading | test 2 | cosmetic | `src/app.css:125-128` (`main#main { padding-inline: var(--space-md); padding-block: var(--space-3xl) }`) — unified inset on `main#main` so all routes inherit it. Component tests + 42 e2e pass. | ✓ CLOSED |
| 2. Error state bare/unstyled | test 9 | minor | `src/app.css:214-228` (`.status` card: surface-raised + hairline + spacing-scale padding); `src/routes/ArticleView.tsx:58-59` + `FixtureList.tsx:40-41` render the full two-line UI-SPEC copy ("Couldn't open this article." + guidance body). Component tests assert guidance body + `getByRole("status")`. | ✓ CLOSED |
| 3. Footnote marker exits to fixture list | test 10 | major | `src/App.tsx:30-34` (hashchange handler guards non-`#/` fragment-only hashes — keeps scroll target mounted); `src/content/render/BlockRenderer.tsx:132-138` (footnote-body → reference back-link `#fn-ref-N` with ↩ + aria-label). jsdom `App.test.tsx` + 3-engine e2e footnote round-trip all pass. | ✓ CLOSED |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/content/schema.ts` | Frozen Zod model: 9-kind discriminated union, 4-mark union, D-06 identity/revision, Pitfall 4/5 guards | ✓ VERIFIED | `z.discriminatedUnion("kind", [...])` over 9 kinds; `Mark = z.union([LinkMark, CodeMark, StrongMark, EmMark])` (exactly 4); scheme allow-list refinements on `linkableUrl`/`httpUrl`; `/^fn-\d+$/` on footnote ids; `ArticleSchema.id` slug regex + `revision: int().min(1)`. |
| `src/content/normalizeText.ts` | D-05 grapheme substrate: deterministic normalizeText + Intl.Segmenter ordinals + selector derive | ✓ VERIFIED | All exports present; `BLOCK_SEPARATOR="\n"`; footnote bodies appended after body blocks; `resolveQuoteSelector` correctly NOT implemented (Phase 5 deferred marker). |
| `src/content/render/BlockRenderer.tsx` | Recursive semantic renderer, exhaustive 9-kind switch, DOC-06 disclosure, footnote round-trip | ✓ VERIFIED | Exhaustive switch (no default fallthrough); `<details>` inline disclosure; forward `#fn-N` ref + back `#fn-ref-N` link. |
| `src/persistence/db.ts` | Reserved Dexie `version(1)` schema, 5 store slots, shipped once | ✓ VERIFIED | Single `this.version(1).stores({...})` declaration with articles/settings/location/highlights/notes; no `version(2)`. Phase 1 does not read/write through it. |
| `src/fixtures/articles/*.canonical.json` | Curated 5-7 real-article corpus covering all 9 block kinds + DOC-06 | ✓ VERIFIED | 6 fixtures (essay-long-form, technical-post, figure-heavy, footnote-academic, list-reference, unsupported-case); collectively exercise all 9 block kinds; real provenance with SHA-256 `originalHtmlHash`. |
| `tests/e2e/{open-every-fixture,a11y}.spec.ts` | DOC-01 smoke + axe-core WCAG 2.2 AA across Chromium/Firefox/WebKit | ✓ VERIFIED | Both specs iterate the canonical `fixtures` array; image-stubbed for determinism; 45 e2e tests all pass across 3 engines. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/routes/FixtureList.tsx` | `src/content/repository.ts` | `listArticles()` import + `useEffect` await | ✓ WIRED | `FixtureList.tsx:9,18` |
| `src/routes/ArticleView.tsx` | `src/content/repository.ts` | `openArticle(articleId)` import + `useEffect` await | ✓ WIRED | `ArticleView.tsx:12,35` |
| `src/content/repository.ts` | `src/fixtures/index.ts` | `import { fixtures }` + `inMemoryRepository` list/open | ✓ WIRED | `repository.ts:7,14-21` |
| `src/fixtures/index.ts` | `src/content/schema.ts` | `ArticleSchema.parse(raw)` at module load (fail-fast boundary) | ✓ WIRED | `index.ts:8,28` |
| `src/content/normalizeText.ts` | `src/content/types.ts` | `import type { Block, CanonicalArticle, InlineRun }` | ✓ WIRED | `normalizeText.ts:10` |
| `src/routes/ArticleView.tsx` | `BlockRenderer.tsx` | `<ArticleBody article={article} />` | ✓ WIRED | `ArticleView.tsx:14,86` |
| `src/App.tsx` | routes + SkipLink | hashchange listener → setView; `<SkipLink/>` first in DOM | ✓ WIRED | `App.tsx:30-42` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `FixtureList.tsx` | `items` (article rows) | `listArticles()` → `inMemoryRepository.list()` → `[...fixtures]` | Yes — 6 real fixtures | ✓ FLOWING |
| `ArticleView.tsx` | `article` | `openArticle(id)` → `fixtures.find(...)` → parsed JSON | Yes — real article with provenance + blocks | ✓ FLOWING |
| `ArticleBody` | `article.blocks` | parsed fixture JSON (no static fallback) | Yes — varies per fixture (16-31 blocks each) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Project builds (tsc strict + vite) | `npm run build` | exit 0; 109 modules transformed | ✓ PASS |
| Lint clean (incl. react/no-danger) | `npm run lint` | exit 0, no violations | ✓ PASS |
| Unit/component suite green | `npm run test:unit -- --run` | 107 tests, 9 files pass | ✓ PASS |
| E2e DOC-01 + a11y across 3 engines | `npm run test:e2e` | 45 tests pass (Chromium/Firefox/WebKit) | ✓ PASS |
| Pitfall 1 regression (grapheme != UTF-16) | `tests/unit/graphemeOffsets.test.ts` | included in 107 passing | ✓ PASS |
| Footnote round-trip stays in-article | e2e "footnote round-trip stays in-article (figure-heavy)" | passes ×3 engines | ✓ PASS |

### Probe Execution

No phase-declared probes (`scripts/*/tests/probe-*.sh`) — this phase's verification surface is the npm scripts (`build`/`lint`/`test:unit`/`test:e2e`), all executed above with exit 0.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DOC-01 | 01-02, 01-03, 01-04 | Open each curated saved article from the fixture set | ✓ SATISFIED | 6 fixtures loadable; e2e opens all 6 ×3 engines; fixture-list row count = fixtures.length |
| DOC-02 | 01-02, 01-05 | Receive headings, paragraphs, links, quotations, lists, figures, captions, footnotes, code in original semantic order | ✓ SATISFIED | `BlockRenderer.tsx` exhaustive 9-kind switch; corpus covers all kinds; axe-core asserts reading order |
| DOC-03 | 01-02, 01-03 | Follow preserved article links and access original source URL + metadata | ✓ SATISFIED | Inline links + provenance source link (`ArticleView.tsx:81-84`); real sourceUrl/author/date in every fixture |
| DOC-04 | 01-01 | Each normalized article has a stable identity and revision | ✓ SATISFIED | `ArticleSchema.id` slug regex + `revision: int().min(1)`; identity.test.ts (19 cases) enforces |
| DOC-05 | 01-01 | Supported content maps to one canonical text-coordinate system shared by every reading mode | ✓ SATISFIED | `normalizeText.ts` D-05 substrate; grapheme-offset unit tests; deterministic + frozen |
| DOC-06 | 01-02, 01-03 | Reader informed when a fixture contains unsupported content | ✓ SATISFIED | `unsupported` block kind + `<details>` disclosure renderer; `unsupported-case` fixture exercises it |

No orphaned requirements: REQUIREMENTS.md maps DOC-01..DOC-06 to Phase 1; all six are claimed by plans 01-01..01-05 and satisfied.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | No TBD/FIXME/XXX/PLACEHOLDER/TODO/HACK markers in `src/`. No `dangerouslySetInnerHTML` anywhere (Pitfall 6 satisfied). No empty/stub implementations. No hardcoded empty data flowing to render. |

### Human Verification Required

None outstanding. The MVP-mode user-flow walk-through (`01-UAT.md`) was already performed by the user (status: `diagnosed`, 12 tests, 10 passed + 2 issues). The three diagnosed gaps (tests 2, 9, 10 — cosmetic/minor/major) were all closed by plans 01-04 and 01-05 with automated regression coverage (component tests + 3-engine e2e). The visual/cosmetic inset and calm reading feel were human-validated during that walk-through; the closing fixes are the kind verifiable by code (inset rule present, error copy present, footnote round-trip e2e green).

### Gaps Summary

No gaps. All four ROADMAP success criteria are verified, all six DOC requirements are satisfied, all three diagnosed UAT gaps are closed with test evidence, the two frozen contracts (Zod document model; D-05 grapheme substrate) are intact and unit-tested, the curated corpus exercises all nine block kinds, and the full build/lint/unit/e2e suite is green across Chromium/Firefox/WebKit.

**Informational (not a phase gap):** `deferred-items.md` records 7 high-severity `npm audit` advisories in transitive `brace-expansion`/`minimatch` pulled in by ESLint dev-toolchain. These are development-time-only (the production bundle is React+Dexie+Zod), DoS-class not RCE, and unfixable without breaking the locked `eslint-plugin-react` security rules. Out of Phase 1 scope; revisitable when `@typescript-eslint` ships TS-7 support.

---

_Verified: 2026-07-29T10:15:00Z_
_Verifier: the agent (gsd-verifier)_
