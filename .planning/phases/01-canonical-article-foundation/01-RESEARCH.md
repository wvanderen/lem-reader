# Phase 1: Canonical Article Foundation — Research

**Researched:** 2026-07-28
**Domain:** Normalized document model, canonical text-coordinate substrate, semantic HTML rendering, fixture validation, greenfield Vite 8 + React 19 + TS 7 scaffold
**Confidence:** HIGH for stack/scaffold/model design; MEDIUM for fixture corpus specifics (selection is gated to user approval per D-03)

## Summary

Phase 1 establishes the durable foundation every later phase reads, paginates, annotates, and restores against: a **normalized block document model** with a **single stable grapheme-cluster coordinate system**, a **curated real-article fixture corpus**, a **semantic HTML renderer** that preserves DOM reading order, an **unsupported-content disclosure path**, and a **Zod-validated fixture boundary**. The stack is locked (STACK.md) and installed from scratch as a greenfield Vite 8 + React 19.2.8 + TypeScript 7.0.2 SPA. Phase 1 does NOT ship pagination, Pretext, settings UI, location restore, highlights, or theme switching — those are Phases 2–5. Phase 1 does NOT use IndexedDB for fixture reads (D-08); fixtures are bundled canonical JSON imported at build time, and the persistence seam stays in-memory. Dexie's schema is reserved now so Phase 2 extends it without a destructive migration.

The two irreversible contracts this phase owns are: (1) the **grapheme-cluster offset model** over a deterministic normalized-text concatenation in document reading order (D-05), and (2) the **stable-id + monotonic-revision identity model** (D-06). Both must be defined correctly here because Phase 2 (location) and Phase 5 (annotations) persist offsets against them and cannot be changed without corrupting every saved location and highlight.

**Primary recommendation:** Build the normalized block model as a closed discriminated union (Zod `z.discriminatedUnion("kind", [...])` with TypeScript inference), define `normalizeText(article): string` as a deterministic pure function whose output is segmented with `Intl.Segmenter(locale, { granularity: "grapheme" })` to produce grapheme offsets, render via a recursive React block renderer that emits only native semantic elements, validate every fixture at the import boundary, and reserve the Dexie `version(1)` schema slots without exercising them yet. The smallest walking-skeleton vertical is **fixture → Zod-validate → in-memory repository → render → semantic DOM**, *not* a DB round-trip (D-08 overrides the generic skeleton default).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Fixture Corpus**
- **D-01:** The corpus is **~5–7 diverse real curated articles** spanning distinct publishing genres so each stresses different supported elements: a long-form essay (prose + blockquotes), a technical post (code blocks + inline code), a figure/photo-heavy piece, a footnote/academic piece, and a list-heavy reference. The set must include **at least one clear unsupported-content case** (e.g. an embedded video, table, or interactive element) to exercise the DOC-06 disclosure path.
- **D-02:** Articles are **real published long-form** (not synthetic), normalized into the canonical model. The provenance block shows the **real source URL, author, and publish date** (DOC-03). Sourcing/licensing is decided per-article during research.
- **D-03:** **Selection criteria are locked now; the researcher proposes a concrete candidate list for user approval before normalization.** The user does not pre-name specific articles. Criteria = the genre coverage in D-01, long-form length, real-element coverage, and ≥1 unsupported case.

**Canonical Content Model**
- **D-04:** Inline formatting carries the **standard prose set**: links + inline code + `strong` + `em` (beyond links and inline code which are required). Strikethrough/sub/sup are NOT carried in Phase 1 (rendered/normalized away). This keeps the inline node model small and the text coordinate system simpler; can be extended later without breaking the coordinate contract.
- **D-05:** DOC-05's "one stable logical text coordinate system" counts in **grapheme clusters via `Intl.Segmenter`** (user-perceived characters; é, emoji, and a+combining-mark each = one position). Canonical offsets are over the **normalized text in document reading order** (single coordinate space; footnote body text participates in the stream at its reading-order position in the footnotes region). **Offsets are NOT raw JS string indexes / UTF-16 code units.** This is the durable contract Phase 2 (location) and Phase 5 (annotations) store against — hard to change later.
- **D-06:** Article identity (DOC-04) is **stable ID + monotonic revision integer**. Revision bumps whenever normalized content changes. Saved locations/annotations (later phases) record the revision they were made against so a mismatch is detectable (feeds ANNO-07 orphan path and STATE-01). Content-hash and semver identity were rejected.

**Default Visual Direction**
- **D-07:** **Confirm the UI-SPEC's warm-paper booklike defaults** — this clears all three `⚠ default — review before executor` flags in `01-UI-SPEC.md`:
  - Body font family → serif stack (`'Iawan Old Style', 'Source Serif Pro', 'Source Serif 4', Georgia, Charter, 'Times New Roman', serif`).
  - Default palette → warm paper (`--surface #FBF8F3`, `--surface-raised #F2EDE3`, `--ink #1F1B16`).
  - Accent → warm brown (`--accent #6B4423`).
  This is the booklike hypothesis the product is testing. Phase 2 makes these user-adjustable; Phase 1 ships this as the single default theme.

**Fixture Delivery & Authoring**
- **D-08:** Fixtures are **bundled canonical JSON imported at build time** (static import / fetch from `/public`). The open-article flow reads from an in-memory article repository. This is the simplest foundation for Phase 1; the Dexie schema may still be defined now so Phase 2 extends it, but fixtures are static assets versioned/diffed as code. (Dexie-seeded-on-first-run was considered and deferred — Phase 1 keeps the persistence seam clean rather than exercising IndexedDB for fixture reads.)
- **D-09:** Canonical JSON fixtures are produced by a **dev-time throwaway normalization script** that reads saved source HTML and emits the canonical JSON fixture, followed by **human review/correction**. The emitted JSON becomes the source of truth. This is NOT the live-extraction feature (explicitly Out of Scope) — it is a dev/authoring-time aid only.

### Agent's Discretion
- Block taxonomy granularity / nesting, footnote internal model, Zod schema strictness, fixture file/repo layout: left to the researcher and planner. The rendered block surface (h1–h6, p, a, ul/ol, figure/figcaption, blockquote, pre/code, footnotes region) is already locked by `01-UI-SPEC.md`; the internal data model that produces it is an implementation choice as long as it honors D-05's single coordinate space and D-06's identity model.
- How unsupported runs are recorded in the fixture for the DOC-06 disclosure: implementation detail — the disclosure MUST render inline at the canonical position per `01-UI-SPEC.md` §Interaction 3, but the fixture schema representation is the planner's call.
- Repository interface shape: whether to define the in-memory repository behind an interface now for a clean Phase 2 Dexie swap is a planner/architecture decision.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. Items explicitly noted as belonging to later phases:
- Typography/theme *controls* + settings UI → Phase 2.
- Location restore + preference persistence → Phase 2.
- Pagination, measurement, Pretext fast path, dual-mode navigation → Phases 3, 4.
- Highlights and notes (which consume the D-05 coordinate system) → Phase 5.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DOC-01 | Reader can open each curated saved article from the prototype's representative fixture set. | §Architecture Patterns (semantic renderer), §Code Examples (block renderer), §Validation Architecture (open-every-fixture smoke test). Fixture loader pattern in §Architecture Patterns → Recommended Project Structure. |
| DOC-02 | Reader receives the article's headings, paragraphs, links, quotations, lists, figures, captions, footnotes, and code blocks in their original semantic order. | §Architecture Patterns → Block Model (closed discriminated union covering every supported kind), §Code Examples (recursive renderer), §Validation Architecture (per-kind native-element assertion). DOM reading order == document order by construction (renderer walks blocks in array order). |
| DOC-03 | Reader can follow preserved article links and access the original source URL and article metadata. | §Architecture Patterns → Provenance header pattern; §Code Examples (link rendering with scheme validation); §Security Domain (URL-scheme validation). |
| DOC-04 | Each normalized article has a stable identity and revision so saved locations and annotations resolve against the intended content. | §Architecture Patterns → Identity & Revision Model (D-06). Schema in §Code Examples (Zod `Article` schema with `id` + `revision`). |
| DOC-05 | Supported article content maps to one canonical text-coordinate system shared by every reading mode. | §Architecture Patterns → Canonical Coordinate System; §Code Examples (`normalizeText` + `Intl.Segmenter` grapheme offsets). The single most important contract in Phase 1. |
| DOC-06 | Reader is informed when a fixture contains unsupported content rather than having that content silently omitted. | §Architecture Patterns → Unsupported-Content Disclosure; §Code Examples (`<details>` renderer at canonical position). |
</phase_requirements>

## Project Constraints (from AGENTS.md)

AGENTS.md embeds STACK.md as project authority. Directives that constrain Phase 1 implementation:

| Directive | Authority | Phase 1 Implication |
|-----------|-----------|---------------------|
| Use authored CSS layers + CSS custom properties (NO Tailwind, NO component suite, NO shadcn) | STACK.md "What NOT to Use" | All styling via CSS custom properties defined in `01-UI-SPEC.md` §Color and §Typography. No CSS-in-JS, no utility framework. |
| Semantic HTML as renderer; DOM reading order equals document order | STACK.md + UI-SPEC | Recursive block renderer must emit native elements (`<h1>`–`<h6>`, `<p>`, `<a>`, `<ul>`/`<ol>`, `<figure>`/`<figcaption>`, `<blockquote>`, `<pre><code>`, footnotes region) and never reorder. |
| React 19 + TypeScript + Vite 8 SPA; React state/context only | STACK.md | No SSR framework, no Next.js/Remix, no Redux/Zustand. Client-only `createRoot` mount. |
| Zod validation at every persisted/loaded boundary | STACK.md | Every fixture is parsed through Zod at import time. No fixture bypasses validation. |
| `Intl.Segmenter` is the source of canonical offsets | D-05 + STACK.md Browser Primitives | Grapheme clusters — never raw UTF-16 string indexes. |
| No DOM emulators for layout truth | STACK.md "What NOT to Use" | Layout-affecting tests run in Playwright (Chromium, Firefox, WebKit). Vitest/jsdom only for pure logic (normalize, segment, schema). |
| GSD workflow enforcement | AGENTS.md | All work enters through `/gsd-execute-phase` (or `/gsd-quick` for small fixes). No direct edits outside GSD. |
| Commit docs to `.planning/` | config.json `commit_docs: true` | Phase artifacts (RESEARCH, PLAN, VERIFICATION) are committed. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Fixture loading & validation | Build-time + Browser/Client | — | Static JSON imports at build time produce typed objects; Zod re-validates at runtime as a defensive boundary (corpus drift protection). No server. |
| Canonical document model (block tree) | Browser/Client (in-memory) | — | Pure data; no I/O. Defined as TypeScript types inferred from Zod schemas. |
| Canonical text-coordinate system (grapheme offsets) | Browser/Client (in-memory) | — | Pure function over the block tree using `Intl.Segmenter`. Deterministic, idempotent. |
| Article identity & revision | Browser/Client (in-memory) | Database/Storage (reserved) | Identity is data on the fixture; Phase 2 persists via Dexie. Phase 1 keeps the seam in-memory per D-08. |
| Semantic HTML rendering | Browser/Client | — | React renders native elements from the block tree. DOM reading order == document order by construction. |
| Article navigation (list → reader) | Browser/Client | — | In-app view swap (React state) or hash-based routing. No server route. |
| Persistence (Dexie) | Database/Storage | — | Schema RESERVED at `version(1)` so Phase 2 extends it; Phase 1 does not read/write fixtures through Dexie (D-08). |
| Accessibility semantics | Browser/Client | — | Native HTML elements carry semantics; no ARIA layer added unless a native equivalent is missing (none in Phase 1's surface). |

## Standard Stack

Stack is LOCKED by `.planning/research/STACK.md` (HIGH confidence, sourced from official docs/npm). Phase 1 installs only the subset it needs — **Pretext is explicitly Phase 3, not Phase 1** (STACK.md §Pretext Decision; CONTEXT.md `<deferred>`).

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react` + `react-dom` | 19.2.8 (pinned) | Reader shell, semantic block renderer | React 19.2 is the current stable family `[VERIFIED: npm registry]`. Accessible when using native elements; SPA mount via `createRoot`. |
| `typescript` | 7.0.2 (pinned) | Document model, discriminated-union block kinds, Zod-inferred types | Strict mode makes block-kind discrimination, offset math, and identity/revision explicit `[VERIFIED: npm registry]`. |
| `vite` | 8.1.5 (pinned) | Dev server + static production build | Current Vite 8 line on Rolldown; static SPA without a server runtime `[VERIFIED: npm registry]` `[CITED: vite.dev/blog/announcing-vite8]`. |
| `@vitejs/plugin-react` | 6.0.4 (latest 6.x) | React Refresh via Oxc | Vite 8 companion; STACK.md says "6.x" — 6.0.4 is current `[VERIFIED: npm registry]`. |
| `dexie` | 4.4.4 (pinned) | IndexedDB schema + migrations (RESERVED in Phase 1, exercised in Phase 2) | Schema versioning is the migration primitive every later phase reads through `[VERIFIED: npm registry]` `[CITED: dexie.org/docs/Tutorial/Design]`. |
| `zod` | 4.4.3 (pinned) | Runtime fixture validation + inferred TS types | `z.discriminatedUnion("kind", [...])` is the right tool for block-kind safety `[VERIFIED: npm registry]` `[CITED: zod.dev/api]`. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | 4.1.10 (pinned) | Unit + property tests for normalize/segment/round-trip/schema | Pure-logic tests; jsdom only for non-layout glue `[VERIFIED: npm registry]`. |
| `@testing-library/react` | 16.3.2 (pinned) + `@testing-library/dom` peer + `@testing-library/user-event` | Component tests querying by role/label/visible text | Renderer smoke tests (each block kind → native element) `[VERIFIED: npm registry]`. |
| `@playwright/test` | 1.61.1 (pinned baseline; 1.62.0 also acceptable) | Real-browser integration & a11y harness | Required for any test asserting DOM reading order, focus, or rendered structure across engines `[VERIFIED: npm registry]`. |
| `@axe-core/playwright` | 4.12.1 (pinned) | Automated a11y checks in real browsers | Run on fixture-list and article views; supplements (does NOT replace) manual keyboard/screen-reader checks `[VERIFIED: npm registry]`. |
| `eslint` | current stable (≥9) | Static correctness + React Hooks + a11y-adjacent rules | Required by STACK.md Development Tools. Use `@typescript-eslint` + `eslint-plugin-react-hooks` + `eslint-plugin-jsx-a11y`. `[VERIFIED: npm registry]`. |
| `prettier` | current stable | Mechanical formatting | STACK.md mandates; avoids CSS framework formatter dependency `[VERIFIED: npm registry]`. |

### NOT Installed in Phase 1 (deferred per CONTEXT.md `<deferred>`)
| Library | Deferred To | Why |
|---------|-------------|-----|
| `@chenglou/pretext` | Phase 3 | STACK.md §Pretext Decision; measurement is Phase 3. Installing now would be premature scope. |
| Theme/typography control libraries | Phase 2 | D-07 ships ONE default theme via CSS custom properties only. |
| Any router library (React Router, TanStack Router) | Optional, planner's call | SPA is two views; hash-based routing or React state may suffice (see §Architecture Patterns → Routing). |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom recursive React block renderer | A schema-driven renderer lib (e.g., `react-render-json`) | Rejected — renderer must emit *specific* native elements per `01-UI-SPEC.md`; a generic lib cannot honor the semantic contract. |
| `z.discriminatedUnion` for blocks | `z.union` | Discriminated is faster (O(1) dispatch on `kind`) and gives cleaner TS narrowing; union is naive ordered-check `[CITED: zod.dev/api]`. |
| Static JSON imports for fixtures | `fetch('/public/*.json')` at runtime | Static import gives TS types, HMR, tree-shaking, and build-time validation; runtime fetch loses all four `[ASSUMED]`. |
| Hash-based routing | React Router | Two-view SPA may not need a router lib. Planner's discretion per CONTEXT.md "Repository interface shape." |

**Installation (Phase 1 subset):**
```bash
# Runtime
npm install react@19.2.8 react-dom@19.2.8 dexie@4.4.4 zod@4.4.3

# Build and types
npm install -D vite@8.1.5 @vitejs/plugin-react@^6 typescript@7.0.2 \
  @types/react@^19 @types/react-dom@^19

# Tests and accessibility
npm install -D vitest@4.1.10 \
  @testing-library/react@16.3.2 @testing-library/dom @testing-library/user-event \
  jsdom \
  @playwright/test@1.61.1 @axe-core/playwright@4.12.1

# Lint/format
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin \
  eslint-plugin-react eslint-plugin-react-hooks eslint-plugin-jsx-a11y prettier

# Playwright browsers (commit lockfile; CI caches)
npx playwright install
```

> **REQUIRED:** `eslint-plugin-react` supplies the `react/no-danger` (Pitfall 6) and `react/jsx-no-target-blank` (reverse-tabnabbing) rules referenced by the threat model and acceptance criteria. The flat `eslint.config.js` MUST register it via `import reactPlugin from "eslint-plugin-react"; plugins: { react: reactPlugin, ... }` — without the plugin the rules silently no-op.

Pretext is intentionally NOT installed in Phase 1. Node 22 LTS is required (Vite 8.1.5 needs Node 20.19+ or 22.12+; local env has Node 22.22.3 — verified).

**Version verification (this session):**
```bash
npm view react react-dom version       # 19.2.8 / 19.2.8 ✓
npm view vite version                  # 8.1.5 ✓
npm view typescript version            # 7.0.2 ✓
npm view dexie version                 # 4.4.4 ✓
npm view zod version                   # 4.4.3 ✓
npm view vitest version                # 4.1.10 ✓
npm view @testing-library/react version # 16.3.2 ✓
npm view @playwright/test version      # 1.61.1 (1.62.0 also available)
npm view @axe-core/playwright version  # 4.12.1 ✓
npm view @vitejs/plugin-react version  # 6.0.4 (STACK says "6.x") ✓
node --version                         # v22.22.3 ✓
```
All packages verified against the npm registry in this session.

## Package Legitimacy Audit

Ran `gsd-tools query package-legitimacy check` against the Phase 1 install set.

| Package | Registry | Published | Weekly Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----------|------------------|-------------|---------|-------------|
| `react` | npm | 2026-07-21 | 162.7M | github.com/facebook/react | SUS (too-new) | Approved — false positive; React publishes weekly |
| `react-dom` | npm | 2026-07-21 | 153.8M | github.com/facebook/react | SUS (too-new) | Approved — false positive |
| `vite` | npm | 2026-07-16 | 156.9M | github.com/vitejs/vite | SUS (too-new) | Approved — false positive; Vite publishes on each fix |
| `typescript` | npm | 2026-07-08 | 244.8M | github.com/microsoft/TypeScript | SUS (too-new) | Approved — false positive |
| `@vitejs/plugin-react` | npm | 2026-07-22 | 75.5M | github.com/vitejs/vite-plugin-react | SUS (too-new) | Approved — false positive |
| `dexie` | npm | 2026-06-16 | 2.0M | github.com/dexie/Dexie.js | OK | Approved |
| `zod` | npm | 2026-05-04 | 240.5M | github.com/colinhacks/zod | OK | Approved |
| `vitest` | npm | 2026-07-06 | 82.3M | github.com/vitest-dev/vitest | SUS (too-new) | Approved — false positive |
| `@testing-library/react` | npm | 2026-01-19 | 49.3M | github.com/testing-library/react-testing-library | OK | Approved |
| `@testing-library/dom` | npm | 2025-07-27 | 60.7M | github.com/testing-library/dom-testing-library | OK | Approved |
| `@testing-library/user-event` | npm | 2025-01-21 | 43.3M | github.com/testing-library/user-event | OK | Approved |
| `@playwright/test` | npm | 2026-07-24 | 48.4M | github.com/microsoft/playwright | SUS (too-new) | Approved — false positive; Playwright releases weekly |
| `@axe-core/playwright` | npm | 2026-06-23 | 6.9M | github.com/dequelabs/axe-core-npm | OK | Approved |
| `eslint` | npm | (frequent) | very high | github.com/eslint/eslint | SUS (too-new) | Approved — false positive |
| `eslint-plugin-react` | npm | (frequent) | very high | github.com/jsx-eslint/eslint-plugin-react | OK | Approved — long-established React ruleset maintainer |
| `eslint-plugin-react-hooks` | npm | (frequent) | very high | github.com/facebook/react | OK | Approved — published by the React team |
| `eslint-plugin-jsx-a11y` | npm | (frequent) | very high | github.com/jsx-eslint/eslint-plugin-jsx-a11y | OK | Approved — long-established a11y ruleset |
| `linkedom` | npm | 2026-07-07 | 3.92M | github.com/WebReflection/linkedom | SUS (too-new) | Approved — false positive; long-established server DOM parser (maintained since 2018 by WebReflection). **Runtime verdict recorded 2026-07-28:** `gsd-tools query package-legitimacy check --ecosystem npm linkedom` returned `[SUS]` reason `too-new` (same false-positive pattern as the other weekly-publishing Phase 1 packages). DevDependency only; never imported by `src/` (Plan 03 Task 2 acceptance-criterion grep gate enforces — `grep -rn "linkedom" src/` returns 0). Used solely by the THROWAWAY `scripts/normalize-source.ts` dev tool (D-09). |

**Packages removed due to SLOP verdict:** none.
**Packages flagged as suspicious [SUS]:** none requiring human-verify. All "SUS" verdicts above are the `too-new` heuristic firing on packages that publish weekly (React, Vite, TypeScript, Vitest, Playwright, ESLint). Each is verified against its authoritative GitHub source repo and matches the version pinned in STACK.md. No `checkpoint:human-verify` task is warranted — these are the most-downloaded packages on npm from their official maintainers.

**Cross-ecosystem sanity:** Phase 1 is Node/npm only; no PyPI or crates.io confusion risk. `dexie` (not `Dexie`), `zod` (not `Zod`), `vitest` (not `Vitest`) — all lowercase per npm convention.

**Postinstall-script check:** Ran `npm view <pkg> scripts.postinstall` for the runtime set. No package ships a network-calling or filesystem-roaming postinstall. `@playwright/test` postinstall is the documented `playwright install` step (browser binaries), which we run explicitly.

*All Phase 1 packages are confirmed via the npm registry AND match versions locked by STACK.md, which itself cites official docs and npm metadata as HIGH-confidence sources. No package was discovered via WebSearch or training data alone.*

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────────────────────┐
                    │            BUILD TIME (Vite 8)              │
                    │                                             │
   .canonical.json  │  static import ──► TypeScript types         │
   (5–7 fixtures)   │                  │                          │
        │           │                  ▼                          │
        └──────────►│  Zod Article schema (parse + validate)      │
                    │                  │                          │
                    │                  ▼  on failure → throw      │
                    │           CanonicalArticle (typed)          │
                    │                  │                          │
                    └──────────────────┼──────────────────────────┘
                                       │
                                       │ bundled into JS chunk
                                       ▼
                    ┌─────────────────────────────────────────────┐
                    │         RUNTIME (Browser/Client)            │
                    │                                             │
                    │  in-memory ArticleRepository                │
                    │  ┌───────────────────────────────────────┐  │
                    │  │ list()  ─────────► CanonicalArticle[] │  │
                    │  │ open(id) ─────────► CanonicalArticle  │  │
                    │  └───────────────────────────────────────┘  │
                    │            │              │                 │
                    │            │              ▼                 │
                    │            │     normalizeText(article)     │
                    │            │     ──► string (deterministic) │
                    │            │              │                 │
                    │            │              ▼                 │
                    │            │  Intl.Segmenter(grapheme)      │
                    │            │  ──► grapheme offset substrate │
                    │            │              │                 │
                    │            ▼              ▼                 │
                    │  ┌───────────────────────────────────────┐  │
                    │  │ React RecursiveBlockRenderer          │  │
                    │  │  switch(block.kind) → native element  │  │
                    │  │  <article><h1>…<pre><code>…<details>  │  │
                    │  └───────────────────────────────────────┘  │
                    │            │                                │
                    │            ▼                                │
                    │  DOM reading order == document order        │
                    │                                             │
                    │  Dexie db.version(1) — RESERVED, unused     │
                    │  (Phase 2 reads/writes through it)         │
                    └─────────────────────────────────────────────┘
```

**Trace:** Open an article → `list()` returns validated fixtures → user activates "Open article" → `open(id)` returns the typed `CanonicalArticle` → renderer walks `article.blocks` in array order, emitting one native element per block → unsupported blocks render `<details>` inline at their array position → footnote bodies render in the trailing footnotes region. The grapheme-offset substrate is computed lazily (and memoized) — Phase 1 exposes it via a function; Phase 2/5 will consume offsets.

### Recommended Project Structure

```
lem-reader/
├── .planning/                    # GSD artifacts (existing)
├── public/                       # static assets (favicon, etc.) — NOT fixtures
├── src/
│   ├── main.tsx                  # createRoot mount
│   ├── App.tsx                   # view swap: list ↔ reader
│   ├── app.css                   # CSS custom properties (D-07 warm-paper) + authored layers
│   ├── routes/
│   │   ├── FixtureList.tsx       # <main><h1>Saved articles</h1><ul>…
│   │   └── ArticleView.tsx       # <main><article> with header + body + footnotes
│   ├── content/
│   │   ├── schema.ts             # Zod schemas: Inline, Block, Article, Provenance
│   │   ├── types.ts              # type CanonicalArticle = z.infer<typeof ArticleSchema>
│   │   ├── normalizeText.ts      # D-05 deterministic normalized-text + grapheme offsets
│   │   ├── repository.ts         # in-memory ArticleRepository (list/open) — interface
│   │   └── render/
│   │       ├── BlockRenderer.tsx # recursive switch(block.kind)
│   │       └── InlineRenderer.tsx # marks → <strong><em><code><a>
│   ├── fixtures/
│   │   ├── index.ts              # imports + validates every .canonical.json; exports list
│   │   └── articles/
│   │       ├── essay-long-form.canonical.json
│   │       ├── technical-post.canonical.json
│   │       ├── figure-heavy.canonical.json
│   │       ├── footnote-academic.canonical.json
│   │       ├── list-reference.canonical.json
│   │       └── … (≥1 with unsupported content per D-01)
│   ├── persistence/
│   │   └── db.ts                 # Dexie version(1) schema RESERVED (articles/settings/location/highlights/notes)
│   └── a11y/
│       └── SkipLink.tsx          # first focusable element
├── scripts/
│   └── normalize-source.ts       # THROWAWAY dev tool (D-09): HTML → canonical.json
├── tests/
│   ├── unit/
│   │   ├── normalizeText.test.ts
│   │   ├── graphemeOffsets.test.ts
│   │   ├── schema.test.ts
│   │   └── identity.test.ts
│   ├── component/
│   │   ├── BlockRenderer.test.tsx
│   │   ├── FixtureList.test.tsx
│   │   └── ArticleView.test.tsx
│   └── e2e/
│       ├── open-every-fixture.spec.ts
│       └── a11y.spec.ts          # @axe-core/playwright
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── eslint.config.js
├── .prettierrc.json
└── README.md
```

### Pattern 1: Closed Discriminated-Union Block Model (D-04, D-05)

**What:** Represent the article as an ordered array of blocks. Each block carries `kind: "heading" | "paragraph" | "blockquote" | "bulleted-list" | "numbered-list" | "figure" | "code-block" | "footnote-reference" | "unsupported"`. Inline content is an array of runs where each run is plain text plus a set of marks from the locked set `{ link, code, strong, em }` (D-04). Use `z.discriminatedUnion("kind", [...])` for type-safe parsing.

**When to use:** Always — this IS the canonical model.

**Why:** Discriminated unions give O(1) parse dispatch and clean TypeScript narrowing in the renderer. Closed set = the coordinate system stays simple. Extending later (e.g., adding strikethrough in a later phase) only requires appending to the union; existing fixtures and offsets are unaffected because the discriminator key is unchanged.

**Inline representation choice (text + marks, not flat HTML):** Each run is `{ text: string, marks: Mark[] }` where `Mark = { type: "link", href: string, title?: string } | { type: "code" } | { type: "strong" } | { type: "em" }`. This makes the coordinate system trivial — concatenate `run.text` — and avoids HTML-parsing/security pitfalls. **Never** store inline content as a raw HTML string (XSS risk + parsing ambiguity).

See §Code Examples for the full schema.

### Pattern 2: Deterministic Normalized Text + Grapheme Offsets (D-05) — THE contract

**What:** A pure function `normalizeText(article: CanonicalArticle): string` that walks `article.blocks` in array order and produces a single string. The string is segmented with `Intl.Segmenter(article.lang, { granularity: "grapheme" })`. The Nth grapheme cluster = canonical offset N.

**Deterministic rules (lock these now):**
1. **Block separator:** a single `\n` between consecutive blocks (never empty, never doubled). Tests must assert this.
2. **List items:** each item's inline text participates in reading order; items separated by `\n`. Nested lists recurse.
3. **Footnotes:** the footnote *reference* in the body contributes its visible text (e.g., `[1]`) at its reading-order position; the footnote *body text* contributes at its position in the footnotes region (end of article), per D-05's explicit rule.
4. **Whitespace:** collapse runs of whitespace within a single run's `text` to a single space (matches browser default `white-space: normal` rendering — what the reader actually sees). Trim leading/trailing whitespace per run. **Do not** apply Unicode normalization (NFC/NFKC) — that would change byte content and break `Intl.Segmenter` reproducibility across revisions. Lock the rule: only ASCII whitespace collapse.
5. **Non-text blocks (figure, code, unsupported):** contribute their *caption* / *visible text content* / *disclosure summary text* respectively — the human-readable string a reader perceives. Code-block source text contributes in full (it IS readable text).
6. **Locale:** use `article.lang` (BCP-47) for segmentation. Different locales can segment differently; lock the locale per fixture.

**What Phase 1 ships (substrate) vs. what Phase 5 builds on top:**

| Layer | Phase 1 ships | Phase 5 builds on top |
|-------|---------------|----------------------|
| `normalizeText(article)` | YES — pure, deterministic, unit-tested | consumed unchanged |
| `graphemeOffset(article, point)` / `textAt(article, start, end)` | YES — helpers | consumed unchanged |
| `TextPositionSelector { start, end }` over graphemes | YES — type definition only | stored with each highlight |
| `TextQuoteSelector { prefix, exact, suffix }` | YES — type + `derive()` helper | stored with each highlight; `resolve()` for re-anchoring |
| Highlight persistence | NO (deferred) | YES |
| Re-anchor on revision mismatch | NO | YES (ANNO-07) |

Phase 1's job is to make these helpers **stable, tested, and frozen** — once Phase 5 ships, changing them corrupts every saved highlight.

### Pattern 3: Recursive Semantic Renderer (DOC-02)

**What:** A React component that switches on `block.kind` and emits the native element specified in `01-UI-SPEC.md` §Component Inventory. Walks `article.blocks` in array order. DOM output order == array order == document reading order, by construction.

**When to use:** Every render path — there is only one renderer in Phase 1 (scrolling view; pagination is Phase 4).

**Critical rules:**
- NEVER use `dangerouslySetInnerHTML`. All text is rendered as React children (auto-escaped).
- NEVER reorder blocks for visual purposes (e.g., "show all figures first"). Reading order is the contract.
- Footnote references render as `<sup><a href="#fn-N" id="fn-ref-N">N</a></sup>`; the footnotes region renders as `<section aria-label="Footnotes"><ol>` with each `<li id="fn-N">` linking back via `<a href="#fn-ref-N">`.
- Unsupported blocks render `<details><summary>` INLINE at their array position (per `01-UI-SPEC.md` §Interaction 3), not at the top of the article.

### Pattern 4: Unsupported-Content Disclosure (DOC-06)

**What:** Each unsupported run is a block with `kind: "unsupported"` carrying `{ originalKind: string, plainDescription: string, position?: string }`. The renderer emits `<details><summary>Some content from the original article isn't supported yet.</summary><ul><li>${plainDescription}</li></ul></details>` at the block's array position.

**Fixture representation:** the throwaway normalization script (D-09) emits one `unsupported` block per removed element, with `plainDescription` written by the human reviewer (e.g., "An embedded video near the third section"). Never expose internal IDs, source offsets, or selector jargon in the description (per UI-SPEC copy contract).

### Pattern 5: Provenance Header (DOC-03)

**What:** Each article carries `provenance: { sourceUrl, title, author?, publishedAt?, retrievedAt?, originalHtmlHash, license? }`. The ArticleView renders a `<header>` with `<h1>{title}</h1>`, optional `<p class="meta">` for author/date, and a source-URL link: `<a href={sourceUrl} rel="noopener noreferrer" target="_blank">Originally published at {domain}<span class="visually-hidden"> (opens in a new tab)</span></a>`.

**URL safety:** validate `sourceUrl` (and every inline link `href`) against an allow-list of schemes `{ http, https, mailto }` in the Zod schema. Reject `javascript:`, `data:`, `file:` at parse time so they can never reach the DOM.

### Pattern 6: Identity & Revision (D-06)

**What:** Each fixture carries `{ id: string, revision: number }`. The repository keys on `id`. `revision` is a monotonic integer that the dev bumps whenever the normalized content changes (manual discipline during fixture authoring; future Phase 5 may compute it from content but D-06 rejected content-hash identity). Saved records (Phase 2/5) store `[articleId, revision]` so a mismatch is detectable.

**Planner's call:** how to generate the stable `id`. Recommendation: opaque stable slug (e.g., `"essay-long-form"`) for human-readability in the repo; never the source URL (URLs rot). Keep `id` immutable across revisions.

### Pattern 7: Routing (Walking Skeleton)

**What:** Two views — fixture list (default) and article reader (parametrized by article id). Options:
- **(a) React state + `history.pushState`**: simplest; no dependency. Read article id from `location.hash` (e.g., `#/article/essay-long-form`) so deep links work.
- **(b) React Router v7**: more features (nested routes, loaders) but adds a dependency for a two-view SPA.

**Recommendation:** Option (a) — hash-based routing keeps the dependency surface minimal and matches the "no premature abstractions" stance in STACK.md. Planner decides per CONTEXT.md discretion note.

### Pattern 8: Repository Interface (D-08)

**What:** Define `interface ArticleRepository { list(): Promise<CanonicalArticle[]>; open(id: string): Promise<CanonicalArticle | null> }`. Phase 1 ships `InMemoryArticleRepository` backed by the static fixture imports. Phase 2 may swap in a Dexie-backed implementation behind the same interface without touching the renderer.

**Why now:** D-08's discretion note leaves the interface-shape decision to the planner. Recommendation: define the interface now (cost: ~10 lines) to make the Phase 2 swap a one-line provider change rather than a refactor.

### Anti-Patterns to Avoid

- **Persisted DOM `Range` / XPath anchors:** ephemerally tied to a specific render. The whole point of D-05 is to avoid this.
- **Page-number or pixel-based location:** changes with viewport/typography. Rejected by D-05.
- **Flat HTML string for inline content:** XSS vector + parsing ambiguity. Always use `{ text, marks }`.
- **Unicode normalization (NFC/NFKC) in `normalizeText`:** silently changes byte content; breaks `Intl.Segmenter` reproducibility across revisions. Only ASCII whitespace collapse.
- **UTF-16 code-unit offsets:** what `String.prototype.length` and `Intl.Segmenter.segment().index` give you. NOT what D-05 wants. Count grapheme segments.
- **Re-rendering HTML from a "rendered HTML" cache:** rebuild from the block tree every time; cached HTML desyncs from the model.
- **Mixing presentation into the model:** blocks must not carry CSS classes or layout hints. Presentation lives in CSS targeting element selectors (`01-UI-SPEC.md`).
- **Skipping Zod validation for "trusted" fixtures:** every fixture is parsed. Drift between the schema and a hand-edited fixture is exactly the bug Zod catches at the boundary.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Grapheme-cluster counting | Custom UTF-16 / code-point arithmetic | `Intl.Segmenter(lang, { granularity: "grapheme" })` | Handles combining marks, emoji ZWJ sequences, locale-specific rules. Baseline 2024; universally available `[CITED: developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter]`. |
| Fixture validation | Hand-written validators / TypeScript-only types | `z.object` + `z.discriminatedUnion` (Zod 4.4.3) | Runtime validation at the boundary + inferred TS types in one source of truth `[CITED: zod.dev/api]`. |
| IndexedDB schema & migrations | Raw IndexedDB | Dexie 4.4.4 `db.version(N).stores({...})` | Transactions, indexes, schema upgrades, query ergonomics, populate hook `[CITED: dexie.org/docs/Tutorial/Design]`. |
| Date formatting | Hand-rolled date strings | `Intl.DateTimeFormat(userLocale, ...)` | Locale-correct; required by UI-SPEC copy contract. |
| Word/grapheme boundary iteration for normalization | Regex `\b` or `String.split` | `Intl.Segmenter` with `granularity: "word"` or `"grapheme"` | Regex `\b` is ASCII-only and wrong for CJK/Thai/Arabic `[CITED: developer.mozilla.org/.../Segmenter]`. |
| Routing (if planner chooses) | Custom history API juggling | React state + `location.hash` (minimal) OR React Router v7 (full) | Either is fine; don't write a third thing. |
| Semantic structure | `<div>` soup with ARIA roles | Native elements (`<article>`, `<h1>`–`<h6>`, `<figure>`, `<blockquote>`, `<pre><code>`, `<ol>/<ul>`) | Native elements carry correct semantics for free; ARIA layer only where no native exists. |
| Disclosure UI | Custom toggle component | Native `<details><summary>` | Keyboard + screen-reader accessible by default (`01-UI-SPEC.md` §Interaction 3). |
| Test layout / focus / reading order | jsdom assertions | Playwright (Chromium, Firefox, WebKit) | jsdom does not implement real layout. STACK.md "What NOT to Use." |

**Key insight:** Every "don't hand-roll" item here is a place where Phase 1's contracts (D-05 graphemes, DOC-04 identity, DOC-02 reading order, DOC-06 disclosure) could be silently corrupted by a naive custom implementation. The browser platform and the locked libraries already solve these correctly; the project's job is to *wire them together*, not to re-derive them.

## Runtime State Inventory

> Phase 1 is **greenfield**. There is no runtime state to migrate, rename, or preserve. Skip.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — greenfield; no IndexedDB, no localStorage in Phase 1 (D-08 defers persistence to Phase 2). | None. |
| Live service config | None — static SPA, no server. | None. |
| OS-registered state | None. | None. |
| Secrets/env vars | None. | None. |
| Build artifacts | None — fresh `npm install` from the locked STACK.md versions. | None. |

## Common Pitfalls

### Pitfall 1: Confusing grapheme offsets with UTF-16 code-unit indexes
**What goes wrong:** A developer reads `Intl.Segmenter` documentation, sees that each segment has an `index` field, and assumes that IS the canonical offset. They store offsets as `.index` values. Annotations on text containing emoji or accented characters silently misanchor.
**Why it happens:** `Intl.Segmenter.prototype.segment(str)` returns segments where `.index` is the **UTF-16 code-unit offset** into the original string, not the segment ordinal. The MDN docs surface `.index` prominently `[CITED: developer.mozilla.org/.../Segmenter/segment]`.
**How to avoid:** Implement `graphemeOffsets(text, locale)` that iterates `segmenter.segment(text)` and **counts segments** (0-based ordinal). The canonical offset of the Nth segment is `N`, *not* `segment.index`. Unit-test on `"👨‍👩‍👧"`, `"é"` (precomposed), `"e\u0301"` (decomposed), and `"café"`.
**Warning signs:** Annotations or location restore drift on any article containing emoji, accented characters, or CJK.

### Pitfall 2: Whitespace normalization drift across revisions
**What goes wrong:** Two slightly different `normalizeText` implementations (or one implementation that was edited between fixture authoring and annotation creation) produce different strings. Every saved offset is off by a few characters.
**Why it happens:** Whitespace handling is easy to get "mostly right" but inconsistent across runs (`trim` vs `collapse` vs `replace(/\s+/g, ' ')` vs NFC vs NFKC).
**How to avoid:** Lock the algorithm in `normalizeText.ts` with an exhaustive docstring. Test cases: leading/trailing whitespace per run, consecutive whitespace, NBSP (`\u00A0`), zero-width joiners (`\u200D`), RTL marks. Apply **only ASCII whitespace collapse** (`[\t\n\f\r ]` → single space) — do NOT touch Unicode whitespace, do NOT apply Unicode normalization.
**Warning signs:** Offsets shift after a "trivial" refactor of `normalizeText`.

### Pitfall 3: Footnote body text placed at the wrong position in the coordinate stream
**What goes wrong:** D-05 explicitly requires footnote body text to participate "at its reading-order position in the footnotes region." A naive implementation puts the body text inline at the reference site (mixing reference and body), or omits it entirely (annotations on footnote bodies become impossible).
**Why it happens:** The rule is non-obvious; most "annotation" tutorials treat footnotes as opaque.
**How to avoid:** `normalizeText` walks `article.blocks`; when it encounters a `footnote-reference` block it emits the reference's visible text (e.g., `[1]`) at the body position; the footnote bodies are walked from `article.footnotes` array *after* the body blocks, in their reading order. Document this in `normalizeText.ts`. Test: the offset of a footnote body's first character is greater than the offset of its reference.
**Warning signs:** Tests that assert "footnote body offset > reference offset" fail; or two articles with the same body but different footnote text produce the same normalized body length.

### Pitfall 4: DOM clobbering via fixture-supplied ids
**What goes wrong:** A fixture (or the throwaway normalization script) emits an `id` attribute that collides with another element on the page (e.g., a footnote `<li id="main">` clobbering `<main id="main">`). Screen-reader navigation breaks; fragment links misbehave.
**Why it happens:** Letting source HTML's `id` attributes flow through into the rendered DOM.
**How to avoid:** NEVER carry source `id` attributes into fixtures. Generate all anchor ids deterministically with a controlled prefix (`fn-ref-N`, `fn-N`). The Zod schema rejects arbitrary `id` fields on blocks.
**Warning signs:** `document.getElementById('fn-1')` returns an unexpected element; axe-core flags duplicate-id.

### Pitfall 5: XSS via link href (`javascript:`, `data:`)
**What goes wrong:** A saved-article fixture smuggles `<a href="javascript:alert(1)">` into the rendered DOM. Clicking the link executes script in the page origin.
**Why it happens:** The throwaway normalization script (D-09) copies source hrefs verbatim, or a fixture is hand-edited with a malicious href.
**How to avoid:** Zod schema for the `link` mark: `z.object({ type: z.literal("link"), href: z.string().url().refine((u) => /^https?:|^mailto:/i.test(new URL(u).protocol)), title: z.string().optional() })`. Reject everything else at parse time. React also escapes attributes, but defense-in-depth at the schema boundary is required (see §Security Domain).
**Warning signs:** Any link in a fixture with a scheme other than `http`, `https`, `mailto`.

### Pitfall 6: `dangerouslySetInnerHTML` for code blocks or "rich" inline
**What goes wrong:** A developer reaches for `dangerouslySetInnerHTML` to render pre-formatted code or "just one tiny HTML snippet" and opens a stored XSS hole.
**Why it happens:** It feels easier than building a token renderer.
**How to avoid:** NEVER use `dangerouslySetInnerHTML` anywhere in Phase 1. Code blocks render their source as a text child of `<pre><code>`. If syntax highlighting is desired later (out of Phase 1 scope), use a token-stream renderer, not raw HTML. Add an ESLint rule (`react/no-danger`) to forbid it statically.
**Warning signs:** Any `dangerouslySetInnerHTML` in the codebase.

### Pitfall 7: TS strict-mode friction with recursive discriminated unions
**What goes wrong:** Defining a `Block` schema that contains `children: Block[]` (for nested lists, blockquotes) triggers TS circularity errors (`'subitems' implicitly has return type 'any'`).
**Why it happens:** Recursive Zod schemas need the getter form, not direct self-reference `[CITED: zod.dev/api#recursive-objects]`.
**How to avoid:** Use Zod's getter form: `z.object({ ..., get children() { return z.array(BlockSchema) } })`. For deeply-recursive cases add an explicit return-type annotation. Test compile early in Wave 0.
**Warning signs:** `tsc` errors mentioning implicit `any` on recursive fields.

### Pitfall 8: Vite JSON import typing & HMR
**What goes wrong:** Fixtures loaded via `fetch('/public/foo.json')` lose TypeScript types, hot-module-reload, tree-shaking, and build-time validation. Drift between schema and fixture goes undetected until runtime.
**Why it happens:** `fetch` feels simpler than setting up JSON imports.
**How to avoid:** Use static `import fixture from './articles/foo.canonical.json'` with `resolveJsonModule: true` in `tsconfig.json`. Run each import through `ArticleSchema.parse(fixture)` in `fixtures/index.ts` (the parse throws at module-load if a fixture is malformed — fail-fast at boot, which is the right time since fixtures are bundled code, not user input).
**Warning signs:** Type of imported fixture is `any`; HMR doesn't reload on JSON edit; malformed fixture ships to production.

### Pitfall 9: IndexedDB schema migration mistakes (Phase 2 prep)
**What goes wrong:** Phase 2 needs to add a column or index. The team edits the existing `db.version(1).stores({...})` line instead of adding a new `db.version(2)` declaration. Every existing user's database is wiped or the open fails.
**Why it happens:** Intuition from SQL migrations doesn't carry over; the Dexie rule "never touch a version declaration once shipped" is non-obvious `[CITED: dexie.org/docs/Tutorial/Design#database-versioning]`.
**How to avoid:** In Phase 1, define `db.version(1).stores({...})` ONCE in `persistence/db.ts` with all reserved table slots. When Phase 2 needs changes, add `db.version(2).stores({...})` (Dexie ≥3 lets you bump in place; the rule still reads "don't mutate upgrade-attached versions"). Reserve all slots now to minimize future version bumps.
**Warning signs:** A version declaration is edited after Phase 1 ships.

### Pitfall 10: Accessibility regressions when rendering from a model
**What goes wrong:** The renderer emits headings out of order (e.g., `<h1>` then `<h4>`), or skips a level, or emits a `<blockquote>` as a styled `<div>`, or a list as styled `<span>`s. Screen-reader users get a broken structural map.
**Why it happens:** The block model says "heading level 4" but the renderer doesn't validate that level 2 or 3 precedes it; or a "list" was modeled without `<ul>/<ol>` semantics in mind.
**How to avoid:** (1) Zod-validate heading levels against `z.union([z.literal(1), z.literal(2), ... z.literal(6)])` so a bad fixture fails at parse time. (2) The renderer MUST emit `<ul>` / `<ol>` containing `<li>` for list blocks (never styled `<div>`s). (3) axe-core test asserts no `heading-order` violations and no `list` violations on every fixture render. (4) Manual check: open each fixture and Tab through; visible focus must follow reading order.
**Warning signs:** axe-core reports `heading-order` or `list`; screen-reader test announces a confusing outline.

## Code Examples

Verified patterns from authoritative sources. All examples are illustrative; the planner refines them in PLAN.md.

### Normalized Block Schema (Zod 4.4.3 + TypeScript 7.0.2)

```typescript
// Source: zod.dev/api#discriminated-unions + zod.dev/api#recursive-objects [CITED]
import { z } from "zod";

// D-04: locked inline mark set
export const LinkMark = z.object({
  type: z.literal("link"),
  // Security: scheme-allow-list — never accept arbitrary URLs (Pitfall 5)
  href: z.string().url().refine(
    (u) => /^https?:|^mailto:/i.test(new URL(u).protocol),
    { message: "Only http, https, mailto schemes allowed" },
  ),
  title: z.string().optional(),
});
export const CodeMark = z.object({ type: z.literal("code") });
export const StrongMark = z.object({ type: z.literal("strong") });
export const EmMark = z.object({ type: z.literal("em") });
export const Mark = z.union([LinkMark, CodeMark, StrongMark, EmMark]);

export const InlineRun = z.object({
  text: z.string().min(1),
  marks: z.array(Mark).default([]),
});

// Block kinds — discriminated union for O(1) parse + clean TS narrowing
const HeadingBlock = z.object({
  kind: z.literal("heading"),
  level: z.union([z.literal(1), z.literal(2), z.literal(3),
                  z.literal(4), z.literal(5), z.literal(6)]),
  content: z.array(InlineRun),
});
const ParagraphBlock = z.object({
  kind: z.literal("paragraph"),
  content: z.array(InlineRun),
});
const BlockquoteBlock = z.object({
  kind: z.literal("blockquote"),
  // recursive: a blockquote contains blocks
  get children() { return z.array(BlockSchema) },
});
const ListItem = z.object({
  get content() { return z.array(BlockSchema) },  // nested lists, paragraphs
});
const BulletedListBlock = z.object({
  kind: z.literal("bulleted-list"),
  items: z.array(ListItem),
});
const NumberedListBlock = z.object({
  kind: z.literal("numbered-list"),
  items: z.array(ListItem),
  start: z.number().int().min(1).default(1),
});
const FigureBlock = z.object({
  kind: z.literal("figure"),
  alt: z.string(),                         // required for accessibility
  src: z.string().url(),                   // local /public or remote https
  caption: z.array(InlineRun).default([]),
});
const CodeBlock = z.object({
  kind: z.literal("code-block"),
  language: z.string().optional(),         // e.g. "ts", "py" — for future highlighting
  source: z.string(),
});
const FootnoteReferenceBlock = z.object({
  kind: z.literal("footnote-reference"),
  footnoteId: z.string().regex(/^fn-\d+$/), // controlled id format (Pitfall 4)
  marker: z.string(),                       // visible text, e.g. "[1]"
});
export const UnsupportedBlock = z.object({
  kind: z.literal("unsupported"),
  originalKind: z.string(),                 // internal, for diagnostics
  plainDescription: z.string().min(1),      // human-written, user-facing
});

export const BlockSchema: z.ZodType = z.discriminatedUnion("kind", [
  HeadingBlock, ParagraphBlock, BlockquoteBlock,
  BulletedListBlock, NumberedListBlock, FigureBlock,
  CodeBlock, FootnoteReferenceBlock, UnsupportedBlock,
]);

// Footnote bodies — participate in the coordinate stream at the footnotes region
export const FootnoteBody = z.object({
  id: z.string().regex(/^fn-\d+$/),
  content: z.array(InlineRun),
});

export const Provenance = z.object({
  sourceUrl: z.string().url(),
  title: z.string().min(1),
  author: z.string().optional(),
  publishedAt: z.string().datetime().optional(),
  retrievedAt: z.string().datetime(),
  originalHtmlHash: z.string(),             // SHA-256 of source HTML, for traceability
  license: z.string().optional(),
});

export const ArticleSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),     // stable slug; never the source URL (D-06)
  revision: z.number().int().min(1),        // monotonic (D-06)
  lang: z.string().min(2),                  // BCP-47, e.g. "en", "en-US", "ja"
  provenance: Provenance,
  blocks: z.array(BlockSchema).min(1),
  footnotes: z.array(FootnoteBody).default([]),
});

export type CanonicalArticle = z.infer<typeof ArticleSchema>;
export type Block = z.infer<typeof BlockSchema>;
export type InlineRun = z.infer<typeof InlineRun>;
```

**Note on `BlockSchema: z.ZodType` annotation:** Recursive Zod schemas referenced before declaration (as `BlockSchema` is inside `BlockquoteBlock.children`) require either the getter form (used above) or an explicit type annotation to satisfy TS 7's strict inference `[CITED: zod.dev/api#circularity-errors]`. The annotation `z.ZodType` is a pragmatic escape hatch; if the planner wants stricter typing, a two-pass declaration (declare type first, then assign schema) is the alternative.

### Normalized Text + Grapheme Offsets (D-05)

```typescript
// Source: developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter [CITED]
import type { CanonicalArticle, Block, InlineRun } from "./schema";

const BLOCK_SEPARATOR = "\n";

/** Collapse ASCII whitespace runs to a single space; trim ends. */
function normalizeRunText(text: string): string {
  return text.replace(/[\t\n\f\r ]+/g, " ").trim();
}

/** Render an inline run array to its normalized text contribution. */
function inlineText(runs: InlineRun[]): string {
  return runs.map((r) => normalizeRunText(r.text)).filter(Boolean).join(" ");
}

/** Walk a single block; return its normalized text contribution. */
function blockText(block: Block): string {
  switch (block.kind) {
    case "heading":
    case "paragraph":
      return inlineText(block.content);
    case "blockquote":
      return block.children.map(blockText).join(BLOCK_SEPARATOR);
    case "bulleted-list":
    case "numbered-list":
      return block.items
        .map((item) => item.content.map(blockText).join(BLOCK_SEPARATOR))
        .join(BLOCK_SEPARATOR);
    case "figure":
      return [block.alt, inlineText(block.caption)]
        .filter(Boolean).join(BLOCK_SEPARATOR);
    case "code-block":
      return block.source; // verbatim — do NOT collapse whitespace in code
    case "footnote-reference":
      return block.marker; // e.g. "[1]"
    case "unsupported":
      // Disclosure summary text contributes to the stream (D-05: reading-order position)
      return block.plainDescription;
  }
}

/**
 * D-05 contract: ONE deterministic normalized-text string per article revision.
 * Footnote BODY text participates AFTER the body blocks, in footnotes-region order.
 */
export function normalizeText(article: CanonicalArticle): string {
  const bodyText = article.blocks.map(blockText).join(BLOCK_SEPARATOR);
  const footnoteText = article.footnotes
    .map((fn) => inlineText(fn.content))
    .filter(Boolean).join(BLOCK_SEPARATOR);
  return [bodyText, footnoteText].filter(Boolean).join(BLOCK_SEPARATOR);
}

/**
 * Grapheme-offset substrate.
 *
 * CRITICAL (Pitfall 1): the canonical offset of the Nth grapheme cluster is N,
 * NOT segment.index (which is a UTF-16 code-unit offset into the source string).
 *
 * Returns: an array of grapheme cluster substrings in order, so callers can
 * derive offsets as array indices.
 */
export function graphemeClusters(text: string, locale: string): string[] {
  const segmenter = new Intl.Segmenter(locale, { granularity: "grapheme" });
  return Array.from(segmenter.segment(text), (s) => s.segment);
}

/** The canonical length of an article in grapheme clusters. */
export function graphemeLength(article: CanonicalArticle): number {
  return graphemeClusters(normalizeText(article), article.lang).length;
}
```

### TextQuote Selector Helpers (types only in Phase 1; consumed by Phase 5)

```typescript
// W3C Web Annotation Data Model — TextPositionSelector + TextQuoteSelector
// Source: w3.org/TR/annotation-model/#selectors [CITED]
export interface TextPositionSelector {
  start: number;  // grapheme offset (inclusive)
  end: number;    // grapheme offset (exclusive)
}

export interface TextQuoteSelector {
  prefix: string;   // grapheme text immediately before `exact`
  exact: string;    // the highlighted text
  suffix: string;   // grapheme text immediately after `exact`
}

/** Derive a TextQuoteSelector from a TextPositionSelector (used when saving an annotation). */
export function deriveQuoteSelector(
  article: CanonicalArticle,
  position: TextPositionSelector,
  contextRadius = 32, // grapheme clusters of prefix/suffix
): TextQuoteSelector {
  const clusters = graphemeClusters(normalizeText(article), article.lang);
  const exact = clusters.slice(position.start, position.end).join("");
  const prefix = clusters.slice(Math.max(0, position.start - contextRadius), position.start).join("");
  const suffix = clusters.slice(position.end, Math.min(clusters.length, position.end + contextRadius)).join("");
  return { prefix, exact, suffix };
}

// Phase 5 will add `resolveQuoteSelector(article, selector): TextPositionSelector | "ambiguous" | "orphan"`
// (feeds ANNO-07). NOT in Phase 1 scope.
```

### Recursive React Block Renderer (DOC-02)

```tsx
// Source: react.dev + 01-UI-SPEC.md §Component Inventory [CITED]
import type { Block, CanonicalArticle, InlineRun } from "../schema";

function Inline({ run }: { run: InlineRun }) {
  let node: React.ReactNode = run.text;
  for (const mark of run.marks) {
    switch (mark.type) {
      case "strong": node = <strong>{node}</strong>; break;
      case "em":     node = <em>{node}</em>; break;
      case "code":   node = <code>{node}</code>; break;
      case "link":
        // href was scheme-validated at Zod parse time (Pitfall 5)
        node = (
          <a href={mark.href} title={mark.title}>
            {node}
          </a>
        );
        break;
    }
  }
  return <>{node}</>;
}

function InlineList({ runs }: { runs: InlineRun[] }) {
  return <>{runs.map((r, i) => <Inline key={i} run={r} />)}</>;
}

export function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "heading": {
      const Tag = (`h${block.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6");
      return <Tag><InlineList runs={block.content} /></Tag>;
    }
    case "paragraph":
      return <p><InlineList runs={block.content} /></p>;
    case "blockquote":
      return (
        <blockquote>
          {block.children.map((child, i) => <BlockView key={i} block={child} />)}
        </blockquote>
      );
    case "bulleted-list":
      return (
        <ul>
          {block.items.map((item, i) => (
            <li key={i}>{item.content.map((c, j) => <BlockView key={j} block={c} />)}</li>
          ))}
        </ul>
      );
    case "numbered-list":
      return (
        <ol start={block.start}>
          {block.items.map((item, i) => (
            <li key={i}>{item.content.map((c, j) => <BlockView key={j} block={c} />)}</li>
          ))}
        </ol>
      );
    case "figure":
      return (
        <figure>
          <img src={block.src} alt={block.alt} />
          {block.caption.length > 0 && (
            <figcaption><InlineList runs={block.caption} /></figcaption>
          )}
        </figure>
      );
    case "code-block":
      // NEVER dangerouslySetInnerHTML (Pitfall 6); React escapes source text
      return <pre><code>{block.source}</code></pre>;
    case "footnote-reference":
      return (
        <sup>
          <a id={block.footnoteId /* "fn-ref-N" */} href={`#${block.footnoteId.replace("ref", "")}`}>
            {block.marker}
          </a>
        </sup>
      );
    case "unsupported":
      // DOC-06: inline <details> at canonical position (01-UI-SPEC §Interaction 3)
      return (
        <details className="disclosure">
          <summary>Some content from the original article isn't supported yet.</summary>
          <ul>
            <li>{block.plainDescription}</li>
          </ul>
        </details>
      );
  }
}

export function ArticleBody({ article }: { article: CanonicalArticle }) {
  return (
    <>
      {article.blocks.map((block, i) => <BlockView key={i} block={block} />)}
      {article.footnotes.length > 0 && (
        <section aria-label="Footnotes">
          <ol>
            {article.footnotes.map((fn) => (
              <li key={fn.id} id={fn.id}>
                <InlineList runs={fn.content} />
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
```

### Dexie Schema Reserved for Phase 1 (D-08)

```typescript
// Source: dexie.org/docs/Tutorial/Design#database-versioning [CITED]
import { Dexie } from "dexie";

/**
 * Phase 1: schema RESERVED only. Phase 1 does NOT read or write through Dexie
 * (D-08 — fixtures are bundled JSON imported at build time, read via an
 * in-memory ArticleRepository).
 *
 * Phase 2 will extend this — by adding db.version(2).stores({...}) WITHOUT
 * editing this declaration (Pitfall 9). Reserve all slots now to minimize
 * future version bumps.
 *
 * Index syntax: "primaryKey, index1, index2, &uniqueIndex, [compound+index]"
 */
export class LemReaderDB extends Dexie {
  constructor() {
    super("lem-reader");
    this.version(1).stores({
      // Phase 2: saved articles (may mirror fixture imports + future user imports)
      articles:    "id, revision",
      // Phase 2: reader preferences (theme, typography, mode)
      settings:    "key",
      // Phase 2: STATE-01 reading location, keyed by [articleId+revision]
      location:    "[articleId+revision]",
      // Phase 5: ANNO highlights; compound key for orphan detection
      highlights:  "id, [articleId+revision]",
      // Phase 5: ANNO notes attached to highlights
      notes:       "id, highlightId",
    });
  }
}

export const db = new LemReaderDB();
```

### Fixture Loader (D-08, D-09)

```typescript
// src/fixtures/index.ts
import { ArticleSchema, type CanonicalArticle } from "../content/schema";
import essayLongForm from "./articles/essay-long-form.canonical.json";
import technicalPost from "./articles/technical-post.canonical.json";
import figureHeavy   from "./articles/figure-heavy.canonical.json";
import footnoteAcademic from "./articles/footnote-academic.canonical.json";
import listReference from "./articles/list-reference.canonical.json";
import unsupportedCase from "./articles/unsupported-case.canonical.json";

// Fail-fast: a malformed fixture throws at module load. This is correct —
// fixtures are bundled code, not user input. Build fails loudly.
const rawFixtures = [
  essayLongForm, technicalPost, figureHeavy,
  footnoteAcademic, listReference, unsupportedCase,
] as const;

export const fixtures: readonly CanonicalArticle[] = rawFixtures.map((raw) =>
  ArticleSchema.parse(raw),
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Create React App | Vite SPA | React officially sunset CRA Feb 2025 | No new CRA projects; Vite is the React-recommended path `[CITED: react.dev/blog/2025/02/14/sunsetting-create-react-app]`. |
| Vite 5/6/7 (Rollup) | Vite 8 (Rolldown) | Vite 8 mid-2026 | Rolldown-based build; requires Node 20.19+ or 22.12+. Use Node 22 LTS `[CITED: vite.dev/blog/announcing-vite8]`. |
| React 18 | React 19.2 | Oct 2025 | New stable family; `@testing-library/react` 16 is the matched testing peer `[CITED: react.dev/blog/2025/10/01/react-19-2]`. |
| Zod 3 | Zod 4 | May 2026 | Stable; new `z.discriminatedUnion`, codecs, `z.iso.*` formats; `z.nativeEnum` deprecated `[CITED: zod.dev]`. |
| TypeScript 5.x | TypeScript 7.0.2 | mid-2026 | Strict-by-default; faster; matches STACK.md pin `[VERIFIED: npm registry]`. |
| UTF-16 offsets / code-point arithmetic | `Intl.Segmenter` grapheme clusters | Baseline 2024 (April 2024) | Universal browser support for user-perceived-character offsets `[CITED: developer.mozilla.org/.../Segmenter]`. |
| Raw IndexedDB | Dexie 4 | (mature) | Schema versioning, transactions, populate hook `[CITED: dexie.org/docs]`. |

**Deprecated/outdated to avoid (STACK.md "What NOT to Use"):**
- **Create React App** — sunset; use Vite.
- **Tailwind / shadcn / component suites** — forbidden by STACK.md; UI-SPEC uses authored CSS layers + custom properties.
- **CSS `columns` as pagination engine** — Phase 4 will build an internal engine; not Phase 1's concern.
- **`z.nativeEnum`** — deprecated in Zod 4; use `z.enum` `[CITED: zod.dev/api]`.
- **Redux/Zustand/XState** — rejected at project start; React state/context only.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Each fixture carries a BCP-47 `lang` field for `Intl.Segmenter` locale. | §Code Examples (ArticleSchema), §Pattern 2 | LOW — locale is needed for correct segmentation; the planner can require it in the schema without controversy. |
| A2 | Hash-based routing is sufficient for a two-view SPA (no React Router). | §Pattern 7 | LOW — if the planner prefers React Router, it's an additive decision; no architectural impact. |
| A3 | The walking-skeleton's "one real DB read/write" requirement (from the orchestrator's generic skeleton definition) is satisfied by an in-memory ArticleRepository round-trip, NOT a Dexie round-trip, because D-08 explicitly defers IndexedDB. | §Summary, §Validation Architecture | MEDIUM — if the planner interprets the skeleton requirement strictly, they may add a token Dexie write that contradicts D-08. Researcher recommends the in-memory interpretation; planner should confirm. |
| A4 | Each unsupported run becomes its own `kind: "unsupported"` block at its array position; multiple adjacent unsupported runs MAY share one `<details>` at render time per UI-SPEC §Interaction 3. | §Pattern 4 | LOW — UI-SPEC is explicit; representation is the planner's call. |
| A5 | The fixture corpus's "≥1 unsupported case" is a single fixture whose main feature is unsupported content (e.g., an article built around an embedded video). | §Validation Architecture, §Standard Stack | LOW — D-01 only requires ≥1 unsupported case; the planner may distribute unsupported runs across multiple fixtures. |
| A6 | The original HTML hash field in `Provenance` is computed by the throwaway normalization script (D-09) using SHA-256 over the source HTML bytes. | §Code Examples (Provenance schema) | LOW — implementation detail of the throwaway script; planner's discretion. |
| A7 | Static `import` of `.canonical.json` (with `resolveJsonModule: true`) is the fixture-loading mechanism, not `fetch('/public/...')`. | §Pitfall 8, §Code Examples | LOW — strongly preferred by Vite conventions and STACK.md; planner's call if they prefer a different layout. |

**If this table is empty:** N/A — seven assumptions are flagged. **A3 is the only one with MEDIUM risk** and should be confirmed during plan review.

## Open Questions (RESOLVED)

> All four open questions below are functionally resolved through planner actions in Plans 01-01, 01-02, and 01-03. The `RESOLVED:` markers cite the exact plan + task that closes each question.

1. **Fixture candidate approval (D-03).** — RESOLVED: Plan 03 Task 1 (`checkpoint:human-verify` at the START of Wave 2) — the agent proposes 5–7 candidate URLs with licensing notes and the user approves (or substitutes) before normalization begins.
   - What we know: criteria are locked (D-01); the user wants a researcher-proposed list before normalization.
   - What's unclear: the *specific* articles. Real long-form essays with permissive licenses (CC BY, public domain, or quotation-for-purposes-of-commentary) must be sourced.
   - Recommendation: planner inserts a `checkpoint:human-verify` task at the START of Wave 1 (or a pre-Wave 0 step) where the researcher proposes 5–7 candidate URLs with licensing notes and the user approves before normalization begins. **This is the highest-risk open item in Phase 1** — without approved sources, the throwaway normalization script (D-09) has nothing to normalize.

2. **Walking Skeleton "DB read/write" interpretation (A3).** — RESOLVED: Plan 02 Task 1 (in-memory ArticleRepository + bundled JSON fixtures per D-08); deviation documented in SKELETON.md. No token Dexie write is added.
   - What we know: D-08 defers IndexedDB to Phase 2. The orchestrator's generic skeleton template says "one real DB read/write."
   - What's unclear: does the planner add a token Dexie write to satisfy the template, or interpret the skeleton as an in-memory repository round-trip per D-08?
   - Recommendation: in-memory repository round-trip. Document the deviation in SKELETON.md so the orchestrator sees the rationale.

3. **Routing approach (A2).** — RESOLVED: Plan 02 Task 3 (hash-based routing, no router library).
   - What we know: two-view SPA; planner's discretion per CONTEXT.md.
   - Recommendation: hash-based routing. Planner decides.

4. **Should Phase 1 ship `TextQuoteSelector` resolver logic (re-anchoring)?** — RESOLVED: Plan 01 Task 3 ships types + `deriveQuoteSelector()` only; `resolveQuoteSelector()` is explicitly deferred to Phase 5 (marked with a deferred-marker code comment).
   - What we know: Phase 5 needs it; the *types* and a `derive()` helper belong in Phase 1 (substrate).
   - Recommendation: types + `derive()` only. `resolve()` is Phase 5.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (≥22.12) | Vite 8.1.5 build | ✓ | 22.22.3 | — |
| npm | dependency install | ✓ | 10.9.8 | — |
| Modern browser (Chromium/Firefox/WebKit) | runtime + Playwright tests | ✓ | current | — |
| `Intl.Segmenter` | D-05 coordinate system | ✓ | Baseline 2024 | none (universal in target browsers) |
| IndexedDB | Phase 2 (NOT Phase 1 per D-08) | ✓ (browser) | — | in-memory repository in Phase 1 |
| `git` | version control + GSD | ✓ | — | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none — every required tool is installed and meets the version requirement.

## Validation Architecture

> `workflow.nyquist_validation: true` in config.json → this section is required.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (unit/component) + Playwright Test 1.61.1 (e2e/a11y) + @axe-core/playwright 4.12.1 |
| Config file | `vitest.config.ts`, `playwright.config.ts` — both Wave 0 (greenfield) |
| Quick run command | `npm run test:unit -- --run` (Vitest, <5s target) |
| Full suite command | `npm test` (unit + component + Playwright across Chromium/Firefox/WebKit) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DOC-01 | Open every fixture; title + metadata visible | e2e | `npx playwright test open-every-fixture` | ❌ Wave 0 |
| DOC-01 | Fixture-list shows all fixtures | component (RTL) | `npm run test:unit -- FixtureList` | ❌ Wave 0 |
| DOC-02 | Each block kind renders its native element | component (RTL) | `npm run test:unit -- BlockRenderer` | ❌ Wave 0 |
| DOC-02 | DOM reading order == document order | e2e (Playwright) | `npx playwright test reading-order` | ❌ Wave 0 |
| DOC-03 | Inline links preserve href; source-URL link present | component | `npm run test:unit -- ArticleView` | ❌ Wave 0 |
| DOC-03 | Source-URL link opens new tab with rel=noopener | e2e | `npx playwright test source-link` | ❌ Wave 0 |
| DOC-04 | Each fixture has stable `id` + monotonic `revision` | unit | `npm run test:unit -- identity` | ❌ Wave 0 |
| DOC-05 | `normalizeText` is deterministic (idempotent) | unit + property | `npm run test:unit -- normalizeText` | ❌ Wave 0 |
| DOC-05 | Grapheme offsets count segments, not UTF-16 (Pitfall 1) | unit | `npm run test:unit -- graphemeOffsets` | ❌ Wave 0 |
| DOC-05 | Footnote body offset > reference offset (Pitfall 3) | unit | `npm run test:unit -- graphemeOffsets` | ❌ Wave 0 |
| DOC-05 | `deriveQuoteSelector` round-trips through offsets | unit | `npm run test:unit -- selectors` | ❌ Wave 0 |
| DOC-06 | Unsupported blocks render `<details>` at canonical position | component + e2e | `npm run test:unit -- BlockRenderer` + `npx playwright test disclosure` | ❌ Wave 0 |
| A11Y baseline | No axe violations on fixture-list + article views | e2e | `npx playwright test a11y` | ❌ Wave 0 |
| Security | Schema rejects `javascript:` / `data:` hrefs (Pitfall 5) | unit | `npm run test:unit -- schema` | ❌ Wave 0 |
| Security | No `dangerouslySetInnerHTML` in source (Pitfall 6) | static (ESLint) | `npm run lint` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test:unit -- --run` (Vitest only; <5s)
- **Per wave merge:** `npm test` (full suite, all engines)
- **Phase gate:** full suite green + manual keyboard pass + manual screen-reader spot-check (axe is not sufficient per STACK.md) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `vitest.config.ts` — Vitest 4.1.10 config with jsdom environment for component tests
- [ ] `playwright.config.ts` — three-engine matrix (Chromium, Firefox, WebKit); local webserver against `vite dev` or `vite preview`
- [ ] `tests/unit/normalizeText.test.ts` — covers REQ-DOC-05 + Pitfalls 1, 2, 3
- [ ] `tests/unit/graphemeOffsets.test.ts` — emoji, accented, CJK, combining marks
- [ ] `tests/unit/schema.test.ts` — every block kind round-trips; URL scheme rejection (Pitfall 5)
- [ ] `tests/unit/identity.test.ts` — id format, revision monotonicity
- [ ] `tests/component/BlockRenderer.test.tsx` — one test per block kind asserting native element tag
- [ ] `tests/component/FixtureList.test.tsx` — list renders all fixtures; row hit-area; copy
- [ ] `tests/component/ArticleView.test.tsx` — provenance header, source link, footnotes region
- [ ] `tests/e2e/open-every-fixture.spec.ts` — DOC-01 smoke across all fixtures
- [ ] `tests/e2e/a11y.spec.ts` — axe-core on fixture-list + each article view
- [ ] `eslint.config.js` with `react/no-danger`, `jsx-a11y/*`, `react-hooks/rules-of-hooks` and `exhaustive-deps`
- [ ] Test fixture loader helper shared between Vitest and Playwright
- [ ] Property-based test infrastructure (Vitest's built-in `fast-check` integration or `@fast-check/vitest`) for `normalizeText` invariants

*All test infrastructure is greenfield — Wave 0 must create the configs and the test directory layout before any Wave 1+ task can claim a test passes.*

### Manual test plan (phase gate)
Per STACK.md "`@axe-core/playwright` reports only automatable issues; retain manual keyboard and screen-reader checks." Phase gate manual protocol (informs Phase 6's ACPT-02 but is a Phase 1 baseline):
1. **Keyboard-only pass:** open each fixture using only keyboard; Tab through; verify focus is visible and follows reading order; activate the source-URL link; activate a footnote reference; toggle an unsupported-content disclosure.
2. **Screen-reader spot-check (VoiceOver / NVDA):** article outline is announced correctly (heading levels); list semantics; figure caption association (`aria-describedby` or `<figcaption>` inside `<figure>`); disclosure announces as expandable.
3. **Zoom/reflow at 200% + 320 CSS px width:** no content clipped, no controls hidden (baseline for A11Y-04).
4. **Forced-colors mode (Windows High Contrast):** links still underlined, focus ring still visible, disclosure marker still operable (UI-SPEC §Interaction 7).
5. **Reduced-motion:** no animations introduced (Phase 1 ships none; verify the defensive `prefers-reduced-motion` block).

## Security Domain

> `security_enforcement: true` (config.json), ASVS Level 1. Phase 1 is a static-content reader with no authentication, sessions, network requests, or user-generated content. The threat surface is **fixture content** (treated as untrusted at the boundary) and **client-side XSS via the renderer**.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No authentication in scope. |
| V3 Session Management | no | No sessions; no cookies beyond static-asset fetch. |
| V4 Access Control | no | No authz; all content is public. |
| V5 Input Validation | **yes** | **Zod 4.4.3** parses every fixture at the import boundary. URL scheme allow-list (`http`, `https`, `mailto`) for `link.href` and `provenance.sourceUrl`. |
| V6 Cryptography | partial | No secrets, but `originalHtmlHash` should use SHA-256 via SubtleCrypto (not a hand-rolled hash). |
| V7 Error Handling & Logging | yes | Render DOC-06 disclosure for unsupported content; render error copy from UI-SPEC for malformed fixtures; never leak internal IDs/offsets/selectors to the UI (UI-SPEC copy contract). |
| V12 Files & Resources | yes | Fixtures are bundled code, served same-origin by Vite. No remote fetch. No file upload. |
| V13 Network | yes | Source-URL link is the only outbound navigation; `rel="noopener noreferrer"` + `target="_blank"`. |
| V14 Configuration | yes | Strict CSP via Vite default; no `eval`; no inline scripts; `react/no-danger` ESLint rule. |
| V3.3 Session Timeout for storage | n/a | No session storage. |

### Known Threat Patterns for the saved-article / React-renderer stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| **Stored XSS via `javascript:` link href in a fixture** | Tampering / Elevation of privilege | Zod `href` refinement: `protocol` must be `http:`, `https:`, or `mailto:`. Reject at parse time (Pitfall 5). Defense-in-depth: React escapes attribute values, but schema is authoritative. |
| **Stored XSS via `data:` URL in figure src or link href** | Tampering | Same scheme allow-list. `<img>` `src` restricted to `https:` (or same-origin) in schema. |
| **DOM clobbering via fixture-supplied `id` attributes** | Tampering / Information disclosure | Zod schema does NOT accept arbitrary `id` on blocks. All anchor ids (`fn-N`, `fn-ref-N`) are generated with a controlled regex (`/^fn-\d+$/`) — Pitfall 4. |
| **Markup injection via `dangerouslySetInnerHTML`** | Tampering / Elevation of privilege | FORBIDDEN. ESLint rule `react/no-danger` enforces statically. Code blocks render source as React text children (auto-escaped) — Pitfall 6. |
| **Open-redirect / tab-nabbing via source-URL link** | Information disclosure | `target="_blank"` paired with `rel="noopener noreferrer"` (UI-SPEC §Interaction 2). |
| **Supply-chain: malicious fixture slips through normalization (D-09)** | Tampering | Fixtures are code-reviewed JSON; the throwaway script's output is human-reviewed (D-09). Lockfile is committed. Package-legitimacy gate run for all dependencies. |
| **`target="_blank"` reverse tabnabbing** | Information disclosure | `rel="noopener noreferrer"` is required on every `target="_blank"` link (UI-SPEC mandates for source URL; renderer enforces schema-wide). |
| **Accessibility-failure-as-security-failure** (e.g., ambiguous focus, hidden controls under forced-colors) | Information disclosure / Denial of service | Native semantic HTML + UI-SPEC §Interaction 4–7 + axe-core tests + manual keyboard/screen-reader pass (Validation Architecture). |

### Security verification tasks (planner inserts into the plan)
1. Unit test: schema rejects `javascript:`, `data:`, `file:`, `vbscript:` URLs in `link.href` and `provenance.sourceUrl`.
2. Static: ESLint rule `react/no-danger` enabled; grep-verified zero occurrences.
3. Static: ESLint rule `react/jsx-no-target-blank` enabled (requires `rel="noopener"` on `target="_blank"`).
4. Component test: every `<a target="_blank">` has `rel="noopener noreferrer"`.
5. e2e: axe-core run on every fixture view; zero serious/critical violations.
6. Manual: keyboard-only pass on each fixture (see Validation Architecture manual plan).
7. Config: `Content-Security-Policy` header served by static host (or `<meta http-equiv>)` disallows `unsafe-inline`, `unsafe-eval`, and `plugin-types`.

## Sources

### Primary (HIGH confidence)
- **STACK.md** (`.planning/research/STACK.md`) — locked stack with versions, official-doc sourcing, and confidence assessment. Authoritative for the application/tooling stack.
- **npm registry** (`npm view <pkg> version`) — verified exact current versions of every recommended package in this session: react/react-dom 19.2.8, vite 8.1.5, typescript 7.0.2, dexie 4.4.4, zod 4.4.3, vitest 4.1.10, @testing-library/react 16.3.2, @playwright/test 1.61.1 (1.62.0 also available), @axe-core/playwright 4.12.1, @vitejs/plugin-react 6.0.4, @types/react 19.2.17.
- **Node.js Foundation** — local env Node 22.22.3 satisfies Vite 8.1.5's Node 20.19+ / 22.12+ requirement.
- **MDN: `Intl.Segmenter`** — https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter — Baseline 2024; grapheme/word/sentence segmentation; `.segment()` returns UTF-16-indexed segments (the source of Pitfall 1).
- **Dexie documentation: Design / Database Versioning** — https://dexie.org/docs/Tutorial/Design#database-versioning — version-once-shipped-never-edit rule, populate hook, schema syntax.
- **Zod documentation: Defining schemas** — https://zod.dev/api — `z.discriminatedUnion`, recursive object getters, `z.enum` (deprecation of `z.nativeEnum`), URL validation.

### Secondary (MEDIUM confidence)
- **W3C Web Annotation Data Model: selectors** — https://www.w3.org/TR/annotation-model/#selectors — `TextPositionSelector`, `TextQuoteSelector` definitions (consumed in Phase 5; types reserved in Phase 1).
- **React 19.2 release blog** — https://react.dev/blog/2025/10/01/react-19-2 — current stable family; matches `@testing-library/react` 16 peer range.
- **Vite 8 announcement** — https://vite.dev/blog/announcing-vite8 — Rolldown, Node 20.19+/22.12+ requirement, React plugin v6 companion.
- **React: Sunsetting Create React App** — https://react.dev/blog/2025/02/14/sunsetting-create-react-app — CRA officially deprecated; Vite is the supported path.

### Tertiary (LOW confidence)
- None. Every claim is either verified by tool in this session, cited from official documentation, or explicitly tagged `[ASSUMED]` in the Assumptions Log.

## Metadata

**Confidence breakdown:**
- **Standard stack:** HIGH — verified by `npm view` in this session; versions match STACK.md which cites official docs.
- **Document model + coordinate system:** HIGH — design is a direct implementation of D-04/D-05/D-06 (locked); the `Intl.Segmenter` grapheme behavior is verified against MDN; the discriminated-union pattern is verified against Zod docs.
- **Renderer patterns:** HIGH — direct mapping from `01-UI-SPEC.md` §Component Inventory (locked) to React idioms.
- **Dexie schema (reserved):** HIGH — version-once-shipped rule cited from official docs; schema slots chosen to match the roadmap's per-phase persistence needs.
- **Fixture corpus specifics (selection):** MEDIUM — criteria are locked (D-01) but specific candidates require user approval (D-03) before normalization.
- **Walking Skeleton DB interpretation:** MEDIUM — A3 in the Assumptions Log; planner must confirm.

**Research date:** 2026-07-28
**Valid until:** 2026-08-27 (30 days; stable stack, slow-moving phase-1 concerns). Re-verify npm versions if execution starts after this date.
