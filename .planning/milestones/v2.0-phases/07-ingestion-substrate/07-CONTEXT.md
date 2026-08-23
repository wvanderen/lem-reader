# Phase 7: Ingestion Substrate - Context

**Gathered:** 2026-08-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 7 introduces the **stateless ingestion backend** — the one new runtime layer v2.0 adds to the shipped v1.0 client-only SPA. It safely turns **URL-fetched and pasted-HTML pages** into validated `CanonicalArticle` JSON (the *exact* 9-kind Block / 4-mark shape from Phase 1) with SSRF + XSS defense and honest three-state failure, **written to Dexie so the shipped reader, pagination, annotations, and location restore treat an ingested article identically to a fixture.**

It delivers ING-01 (URL ingestion), ING-02 (paste-HTML ingestion), ING-06 (honest three-state confidence + reader-visible refusal reason), ING-07 (sanitize-then-render through the doc model; never `dangerouslySetInnerHTML`), and ING-08 (SSRF refusal of private/internal/cloud-metadata endpoints).

**Phase 7 does NOT ship** (deferred to Phase 8 / later):
- The **personal library surface** — library cards, `source`/confidence badges, tags, search, recently-read shortcuts, reading-progress indicators (LIB-01..06). Phase 7 ingests *into* Dexie and merges into the existing list with no new chrome.
- **File-upload (.html via picker)** — Phase 8 with the library (D7-03).
- **Markdown / PDF / EPUB intake** — Phases 8 / 11 / 12.
- **Export/import** — Phase 9.

**Load-bearing invariant (from ROADMAP.md):** the reading engine, pagination, annotation selectors, location store, and a11y surface **cannot tell an ingested article from a fixture**. A round-trip anchor test (TextPositionSelector + TextQuoteSelector → `confident`) gates every successfully ingested article.

**Substrate already shipped by v1.0 (pre-answered — do NOT re-ask):**
- **D-04/D-05/D-06** — inline marks (link/code/strong/em); grapheme-offset coordinate via `Intl.Segmenter` over `normalizeText(article)`; stable id + monotonic revision. Ingestion MUST emit this exact shape.
- **`ArticleSchema`** (`src/content/schema.ts`) — 9 block kinds, `Provenance` (`sourceUrl`, `title`, `author`, `publishedAt`, `retrievedAt`, `originalHtmlHash`, `license`), `Article` (`id` regex `/^[a-z0-9-]+$/`, `revision`, `lang`, `provenance`, `blocks`, `footnotes`). URL scheme allow-lists (Pitfall 5), footnote-id regex (Pitfall 4) already enforced at parse time.
- **`TextPositionSelector` + `TextQuoteSelector` + `deriveQuoteSelector()` + `resolveQuoteSelector()` tri-state** (`src/content/normalizeText.ts`) — the anchor machinery the round-trip gate reuses.
- **`ArticleRepository` interface** (`src/content/repository.ts`) — `list()` / `open(id)`; currently in-memory over bundled fixtures. D-08 reserved the Dexie-backed swap as a one-line provider change.
- **Dexie v1/v2** (`src/persistence/db.ts`) — `articles` store reserved since Phase 1; v2 appended in Phase 2. Phase 7 appends v3 (Pitfall 9 — byte-unchanged prior blocks).
- **DOC-06 disclosure + PAGE-09 fallback banner + `.status` live region** (D2-13/D3-04) — the calm honesty vocabulary Phase 7 reuses.

</domain>

<decisions>
## Implementation Decisions

### Carrying forward (locked by v1.0 milestone research — do NOT re-litigate)

These were decided in `.planning/research/{ARCHITECTURE,PITFALLS,FEATURES,STACK}.md` during v2.0 milestone definition and are treated as locked inputs to Phase 7:

- **Backend shape — stateless edge function, same-origin `POST /api/ingest`.** REJECTED: client-side fetch (CORS-impossible + XSS into persistence + huge bundle); Vite-SSR-as-production (STACK.md forbids). Client never sees raw fetched HTML.
- **Pipeline — SSRF-safe fetch → `@mozilla/readability` extract → DOMPurify sanitize → DOM walk → 9-kind Block tree → `ArticleSchema.parse()`.** Server-side normalization at ingest (Pattern 2).
- **One normalizer, one path** (Pitfall 2). Reuse v1.0's exact normalization module for both fixture authoring and ingestion — no extraction-specific whitespace/Unicode handling. A **round-trip anchor test** gates every ingested article before it enters the library.
- **Dexie v3** (additive; v1/v2 byte-unchanged per Pitfall 9) + `ArticleSource` enum + `IngestionMeta` sub-schema. Existing `ArticleSchema` shape unchanged for v1.0 fixtures (backward-compatible via defaults).
- **Immutability — save-once, read-forever.** Refresh = delete + re-save (warns highlights will be lost). Re-extract never silently overwrites.
- **Images stay as remote `httpUrl`** — CSP `img-src 'self' https: data:` preserved (already true for v1.0 fixtures). No proxying/rehosting in Phase 7.
- **Confidence model — derived multi-signal.** `extractionConfidence = blockCount >= 3 && textLength >= 500 ? "high" : "low"`, gated by `isProbablyReaderable()` pre-check + unsupported-block ratio. Three states (confident / low-confidence / unsupported) map from this. (Exact thresholds are researcher-discretion.)
- **SSRF guard matrix** (Pitfall 3 — 9 measures: scheme allowlist http(s)-only; private/loopback/link-local/CGNAT 100.64/10/cloud-metadata 169.254.169.254 blocklist; redirect re-validation per hop; DNS-rebinding/DNS-pinning) is a **phase-exit regression suite**.
- **mXSS regression suite** (DOMPurify Attack Classes payloads; no `<script>`/inline `on*`/`javascript:`/SVG/MathML survives; zero `dangerouslySetInnerHTML` in the codebase) is a **phase-exit gate**.
- **DOMPurify config** — strict allowlist; FORBID SVG + MathML (the renderer never needs them); sanitize-then-re-introduce risk owned by the doc-model-as-security-boundary (React renders Block JSON, never HTML).
- **Resource caps** — fetch timeout ~30s, content-type allow-list (`text/html`, `application/xhtml+xml`), max-content-length guard, AbortSignal.
- **`/server` adapter boundary** — all server code lives in `/server` so it can be ported to Vercel/Netlify/Node by changing only `/functions` (Pattern 1).

### Surface scope
- **D7-01: Minimal proof form.** Phase 7 ships a small "Add by URL / paste HTML" control that saves to Dexie and opens the result in the EXISTING article route. No library cards, tags, search, or confidence-badge UI (Phase 8). Proves the pipeline end-to-end; Phase 8 wraps the library surface around the already-working ingest+write. (Phase 7 has NO `UI hint: yes` in ROADMAP.md — intentionally backend-focused.)
- **D7-02: Merge into existing list (ArticleRepository swap lands here).** The existing fixture-list route reads from a new Dexie-backed source that MERGES fixtures + ingested articles (no badges/tags/search — Phase 8 chrome). `ArticleRepository` swaps from `inMemoryRepository` to the Dexie-backed source behind the SAME `list()`/`open(id)` interface — the D-08 forward-compat hook lands in Phase 7, not Phase 8.
- **D7-03: URL + paste-HTML inputs.** A URL input AND a paste-HTML textarea, both feeding the same `/api/ingest` pipeline (input-source-agnostic). File-upload (.html via picker) defers to Phase 8 with the library. Covers SC#1 (URL) + SC#2 (paste) literally; "uploads" via file picker lands in P8.
- **D7-04: Reuse existing failure-surfacing patterns.** Hard refusals (SSRF-blocked, fetch-failed, unsupported, extraction-too-low-confidence) show inline in the form via the existing `.status` live region (D2-13/D3-04) in the calm DOC-06 voice. Low-confidence extractions still succeed but surface a quiet "this extraction may be incomplete" banner on first open — reusing the PAGE-09 fallback-banner component, NOT new chrome. Zero new disclosure vocabulary.

### Deployment platform
- **D7-05: Cloudflare Pages Functions is the PRIMARY Phase 7 target** (dev + acceptance tests). `/functions/api/ingest.ts` with `onRequest(context)`; `vite.config.ts` `server.proxy` → `wrangler pages dev` for local; Workers native `fetch`; most generous free tier; <5ms cold start. **Accept the jsdom-on-Workers compat spike** (`nodejs_compat_v2` flag); `linkedom` fallback if jsdom proves too heavy (see D7-10). All server code stays in `/server` behind the adapter so it can be ported to Vercel/Netlify by changing only `/functions`. REJECTED: Vite-SSR/middleware-as-production.
- **D7-06: Split CI for the two security matrices.** The mXSS regression (DOMPurify output) + extraction + normalization run as PURE Node/Playwright unit tests against `/server` functions directly (fast, deterministic, no platform runtime). The SSRF matrix (DNS-rebinding, redirect-into-internal, cloud-metadata 169.254.169.254, CGNAT 100.64/10, private/loopback/link-local) runs as INTEGRATION tests against a real `wrangler pages dev` instance in CI — the only way to exercise real fetch+DNS+redirect behavior honestly. Mirrors the v1.0 "real-browser for layout truth" discipline (PROJECT.md Key Decision #9) applied to the backend.

### Identity & duplicates
- **D7-07: URL-slug + dedupe-refuse.** `id = slugify(final canonical URL after redirects)`. Re-ingest of the same URL is detected and REFUSED with a calm "already in your library" message (`.status` pattern) + an offer to open it or remove-it-first to re-extract. Cleanest library; immutability preserved by the existence check; matches save-once-read-forever. Two different URLs that extract identical content = two entries (acceptable). REJECTED: content-hash + allow-duplicates (clutters the list); URL-slug + auto-refresh-as-new-revision (silently invalidates every highlight/note — breaks save-once + ANNO-05).
- **D7-08: Optional `sourceUrl` + `origin` tag for paste-HTML.** Make `Provenance.sourceUrl` `.optional()` (additive schema change; fixtures always supply it so backward-compatible via the existing value). Add an `origin` discriminator on `IngestionMeta` (`"url" | "paste"`) so the UI hides the "open original" link for paste-sourced articles. `originalHtmlHash` still provides traceability. Honesty-preserving — no fake/synthetic URL. The merge-into-list view shows paste articles without an open-original affordance. (REJECTED: requiring a URL with every paste; synthetic placeholder URL — both violate the paste path's purpose or the honesty contract.)

### Extraction stack
- **D7-09: Confirm `@mozilla/readability` 0.6.0.** The Firefox Reader View engine — battle-tested, Mozilla-recommended DOMPurify pairing, `isProbablyReaderable()` gives the cheap pre-check for the confidence model. Output characteristics well-understood. Defuddle NOT evaluated — Readability is the safe default. The `htmlToBlocks` adapter boundary stays clean (research mandate) so Defuddle could replace it behind the same interface in a later phase if real-content extraction-quality issues appear.
- **D7-10: jsdom primary via `nodejs_compat_v2`, linkedom fallback (single-platform).** Ship jsdom (`isomorphic-dompurify`'s native pair) as primary. If the D7-05 spike shows jsdom too heavy/broken on Workers, fall back to `linkedom` (lighter, already a devDep, used by the v1.0 throwaway normalization script) for Readability's DOM + `DOMPurify(window)` with a foreign DOM. **The mXSS regression suite (D7-06) GATES whether linkedom-DOMPurify is safe to promote** — if attack payloads don't all pass on linkedom, linkedom is rejected and the hybrid contingency (extraction+sanitize on a Node-runtime function, Workers only for SSRF-safe fetch) is the fallback. REJECTED: jsdom-only with no validated fallback.

### the agent's Discretion
- **Confidence thresholds** — the `blockCount >= 3 && textLength >= 500` formula ships from research; researcher validates/tunes against a real-publisher corpus and may add signals (link density, semantic-block ratio). The three-state *contract* is locked; the thresholds are empirical.
- **Slug algorithm details** — IDN/punycode handling, trailing-slash/query-string normalization, collision-resolution when two distinct URLs slugify identically. The `id = slugify(canonical URL)` *contract* (D7-07) is locked; the normalization rules are the researcher's.
- **Local-dev mechanism** — `wrangler pages dev` via `vite.config.ts` `server.proxy` vs `vite-plugin-cloudflare`. Operational; researcher/spike resolves (research flags this as a first-plan spike).
- **SSRF guard implementation** — DNS pinning vs per-hop re-resolution, library vs hand-rolled, exact allowlist/blocklist sources (OWASP Cheat Sheet is the authority). The 9-measure *matrix* (Pitfall 3) is locked; the implementation is the researcher's.
- **`IngestionMeta`/`ArticleSource` schema field names + Dexie v3 store/index shape** — research proposes the shape; the planner confirms exact names following the Pitfall 9 (additive, byte-unchanged v1/v2) precedent.
- **Exact copy for refusal/low-confidence messages** — the calm DOC-06/PAGE-09 *voice* is locked (D7-04); the words are UI-SPEC / planner.
- **Timeout/size-cap exact numbers** — research suggests ~30s / content-length guard; researcher locks the specifics.

### Folded Todos
*None — `todo.match-phase` returned no matches for Phase 7.*

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project intent & requirements
- `.planning/PROJECT.md` — product vision, Core Value, Current Milestone (v2.0), Architecture shift ("a stateless ingestion backend enters a stack that deliberately had none"), Out of Scope (paywalled/auth content; accounts/cloud sync; browser-extension packaging), Key Decisions (#9 honest full-suite execution discipline governs the SSRF/mXSS CI matrices).
- `.planning/REQUIREMENTS.md` — **ING-01, ING-02, ING-06, ING-07, ING-08 are this phase's requirements** (§Ingestion). §Traceability maps each to Phase 7. v1.0 validated requirements are the locked substrate that must not regress.
- `.planning/ROADMAP.md` — Phase 7 goal, 5 success criteria (incl. the round-trip anchor gate, the SSRF regression matrix, the mXSS regression suite, the v1→v3 Dexie migration snapshot), dependency on Phases 1-6. **Phase 7 has NO `UI hint: yes`** (Phase 8 does) — intentionally backend-focused.

### v2.0 milestone research (THE architecture authority for this phase — READ ALL FOUR)
- `.planning/research/ARCHITECTURE.md` — **Pattern 1** (stateless edge function alongside the Vite SPA; Cloudflare Pages Functions recommendation; `/functions` + `/server` layout; local dev via `server.proxy`), **Pattern 2** (extraction → canonical doc model pipeline; the FETCH→EXTRACT→SANITIZE→normalize→`ArticleSchema.parse` flow; confidence surfacing), **Pattern 8** (SSRF/XSS defense-in-depth boundary; DOMPurify strict allowlist + FORBID SVG/MathML; CSP tightening). Dep table (HTML: `@mozilla/readability` + `isomorphic-dompurify` + jsdom). File-tree (`/functions/api/ingest.ts`, `/server/{ingest,htmlToBlocks,safeFetch}.ts`, `src/ingestion/{IngestionClient,LibrarySource,types}.ts`).
- `.planning/research/PITFALLS.md` — **Pitfall 1** (ingested block shapes the pagination engine can't handle — define block-kind histogram + predict-fallback policy), **Pitfall 2** (normalization drift — ONE normalizer, round-trip test every extracted article, re-extract determinism), **Pitfall 3** (SSRF — the 9-measure guard matrix + phase-exit regression suite), **Pitfall 4** (XSS via sanitizer misconfiguration — DOMPurify default-too-wide, sanitize-then-re-introduce, `javascript:`/`data:` URIs). Also the "save raw HTML to Dexie + dangerouslySetInnerHTML" anti-pattern (Pattern: rejected — doc model is the security boundary).
- `.planning/research/FEATURES.md` — Feature Area 1 (web article extraction / "read it later"): server-side fetch+extract+normalize, honest null-result, capture core metadata, preserve source URL + "open original" (DOC-03), **immutability / save-once-read-forever**, sanitization defense-in-depth, SSRF-safe fetching, fetch timeout + size cap + content-type allow-list, partial-extraction flag, public-web-only honesty. The extraction-lib (Readability-vs-Defuddle) + table-stakes mapping.
- `.planning/research/STACK.md` — locked stack (React 19.2.8 / TS 7.0.2 / Vite 8.1.5 / Dexie 4.4.4 / Zod 4.4.3). Browser primitives (`document.fonts`, `Intl.Segmenter`, Selection/Range, IndexedDB). **What NOT to use:** CRA, Tailwind/component suites, page-number anchors, Redux/Zustand, DOM emulators for layout truth.

### Prior-phase contracts this phase extends
- `.planning/milestones/v1.0-phases/01-canonical-article-foundation/01-CONTEXT.md` — **D-04** (inline marks), **D-05** (grapheme-offset coordinate — the round-trip substrate), **D-06** (stable id + monotonic revision — ingestion must honor), **D-08** (the ArticleRepository Dexie-swap hook that D7-02 invokes), **D-09** (the throwaway linkedom normalization script that becomes the production `/server/htmlToBlocks` ancestor).
- `.planning/milestones/v1.0-phases/05-durable-highlights-and-notes/05-CONTEXT.md` — **D5-01..D5-04** (TextPositionSelector + TextQuoteSelector + resolveQuoteSelector tri-state — the round-trip anchor gate machinery), the "never silently re-attach" honesty that ING-06's three-state extends.

### Source code contracts (READ before implementing)
- `src/content/schema.ts` — **the trust boundary.** `ArticleSchema`, `Provenance` (D7-08 makes `sourceUrl` `.optional()` additively), `BlockSchema` (9 kinds), `Mark` (4). URL scheme allow-lists (Pitfall 5), footnote-id regex (Pitfall 4). New `ArticleSource` enum + `IngestionMeta` sub-schema are added here. Every ingested article is `ArticleSchema.parse()`-validated.
- `src/content/types.ts` — re-exports `CanonicalArticle`, `Block`, `InlineRun`.
- `src/content/repository.ts` — **`ArticleRepository` interface** (`list()` / `open(id)`) that D7-02 swaps to a Dexie-backed implementation. `inMemoryRepository` (over `fixtures`) is the current impl.
- `src/content/normalizeText.ts` — **THE shared normalizer** (Pitfall 2). `normalizeText`, `graphemeClusters`, `TextPositionSelector`, `TextQuoteSelector`, `deriveQuoteSelector(contextRadius=32)`, `resolveQuoteSelector(): position | "ambiguous" | "orphan"`. Ingestion MUST reuse this exact module — no extraction-specific normalization fork. The round-trip anchor gate calls these.
- `src/persistence/db.ts` — **Dexie v1/v2 reserved schema** (Pitfall 9 — byte-unchanged). `articles: "id, revision"` store reserved since Phase 1. Phase 7 appends `this.version(3).stores({...})` adding `source`, `addedAt` indexes (research-proposed; planner confirms exact shape). `articles`, `settings`, `location`, `highlights`, `notes` all present.
- `src/fixtures/index.ts` — bundled-JSON fixture loader (D-08); the Dexie-backed source (D7-02) merges these with ingested articles.
- `src/routes/ArticleView.tsx` — the existing reader route that ingested articles open into unchanged.
- `src/routes/FixtureList.tsx` — the existing list route that D7-02's merge affects (transitional; Phase 8 replaces it with the library).
- `src/pagination/` + `src/annotations/` — UNCHANGED per the load-bearing invariant; ingested articles paginate/annotate identically because they ARE `CanonicalArticle`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/content/normalizeText.ts`** — the shared normalizer + selector machinery is already built. Ingestion's `htmlToBlocks` output feeds `normalizeText`; the round-trip gate calls `deriveQuoteSelector`/`resolveQuoteSelector`. No normalization to invent (Pitfall 2 — forking it silently orphans every anchor).
- **`src/content/repository.ts` `ArticleRepository` interface** — the one-line swap point (D7-02). A `DexieLibrarySource` (or similar) implementing `list()`/`open(id)` replaces `inMemoryRepository`; callers (routes) are unchanged.
- **`src/content/schema.ts`** — single source of truth for the doc model + boundary validation. `ArticleSchema.parse()` is the ingestion gate; the scheme allow-lists already enforce the URL-safety boundary that DOMPurify complements.
- **`src/persistence/db.ts`** — Dexie stores + the v1/v2 declaration blocks. The v3 append is additive (Pitfall 9); the `articles` store already exists.
- **v1.0 throwaway `linkedom` normalization script** (D-09 ancestor) — the starting point for `/server/htmlToBlocks`. linkedom is already a devDep, de-risking the D7-10 fallback.
- **`.status` live region + PAGE-09 fallback banner** (D2-13/D3-04) — the honesty surfaces D7-04 reuses for refusal + low-confidence, with zero new chrome.

### Established Patterns
- **Zod-at-boundary validation** — every ingested article is `ArticleSchema.parse()`-validated on the server AND on Dexie read (STATE-04).
- **W3C Web Annotation selectors over the grapheme substrate** — the round-trip anchor gate; persisting DOM Range/XPath/page-number/pixel anchors is FORBIDDEN.
- **Pitfall 9 (Dexie version discipline)** — append `version(N+1)` blocks; never edit shipped v1/v2 blocks. Phase 7's v3 is additive.
- **React state/context, no Redux/Zustand** — ingestion client state flows through React context/local state; Dexie is the persistence seam.
- **Authored CSS + custom properties, no Tailwind** — the minimal form + any disclosure inherit existing tokens.
- **`.status` live region for consequential events** — refusal/low-confidence announce here (A11Y-08).
- **Exhaustive block-kind switch, no default** (Pattern F) — `htmlToBlocks` DOM walker maps onto the 9 kinds via the same exhaustive discipline; anything unmappable → `UnsupportedBlock` with a `plainDescription` (DOC-06).
- **Playwright across Chromium/Firefox/WebKit for truth** — the SSRF integration matrix extends this discipline to the backend (`wrangler pages dev` as the "real browser" equivalent).

### Integration Points
- **`POST /api/ingest`** (`/functions/api/ingest.ts`, NEW) — the stateless edge-function endpoint; orchestrates safeFetch → Readability → DOMPurify → htmlToBlocks → ArticleSchema.parse. Same-origin; CSP `connect-src 'self'`-only.
- **`/server/{ingest,htmlToBlocks,safeFetch}.ts`** (NEW) — platform-agnostic server code behind the adapter; `safeFetch` owns the SSRF guard; `htmlToBlocks` owns Readability+DOMPurify+DOM-walk; `ingest` orchestrates.
- **`src/ingestion/IngestionClient.ts`** (NEW) — thin `fetch('/api/ingest')` wrapper; maps honest-failure reasons (SSRF-blocked, fetch-failed, unsupported-format, extraction-too-low-confidence) to the `.status`/banner surfaces.
- **`src/ingestion/LibrarySource.ts`** (Dexie-backed, NEW) — implements `ArticleRepository` (D7-02); writes/removes ingested articles; merges with fixtures on `list()`.
- **`src/content/repository.ts`** — the swap point: `inMemoryRepository` → Dexie-backed source.
- **`src/content/schema.ts`** — `Provenance.sourceUrl` → `.optional()` (D7-08); new `ArticleSource` + `IngestionMeta` schemas.
- **`src/persistence/db.ts`** — `version(3)` append (additive indexes on `articles`).
- **`src/routes/FixtureList.tsx`** — transitional merge surface (D7-02); Phase 8 replaces it.
- **The minimal ingest control** (NEW, mount point per planner — likely on/near `FixtureList`) — URL input + paste textarea; calls `IngestionClient`; announces via `.status`.

</code_context>

<specifics>
## Specific Ideas

- **"Calm, booklike" extends to ingestion.** The minimal form is a quiet control, not a loud modal wizard. Refusals and low-confidence are surfaced in the same calm DOC-06/PAGE-09 voice as everything else — no red error toasts, no new disclosure vocabulary (D7-04). Ingestion is the first *new* reader-facing action in v2.0; it should feel like checking out a book, not filing a ticket.
- **"Save-once, read-forever" is the Readwise/hypothes.is mental model** (D-07/D7-07): a saved article is a snapshot, not a live subscription. Re-ingest is refused, not auto-refreshed — protecting every highlight the reader may later make on it.
- **The doc model IS the security boundary** (ING-07): by the time ingested content reaches React it is plain Block JSON, never HTML. DOMPurify runs once at ingest; `dangerouslySetInnerHTML` exists nowhere. This is the structural (not procedural) XSS defense.
- **The round-trip anchor test is the integration truth** (SC#1): an ingested article that can't round-trip `TextPositionSelector`+`TextQuoteSelector` → `confident` is refused entry to the library — it's not "mostly there," it's not admitted.
- **The v1.0 fixture experience is the regression target:** a reader should be unable to tell, by reading/paginating/annotating, whether an article was bundled at build time or ingested at runtime.

</specifics>

<deferred>
## Deferred Ideas

None raised that were out of scope. Items explicitly belonging to later phases (confirmed, not new):
- **Library surface** (cards, `source`/confidence badges, tags, search, recently-read, reading-progress) — **Phase 8** (LIB-01..06).
- **File-upload (.html via picker)** — **Phase 8** (D7-03; the server pipeline is input-source-agnostic so this is a UI-only addition).
- **Markdown intake** — **Phase 8** (ING-03).
- **PDF intake** — **Phase 11** (ING-04).
- **EPUB intake** (book grouping) — **Phase 12** (ING-05).
- **Export/import** — **Phase 9** (PORT-01..03).
- **Annotation review panel** — **Phase 10** (RECV-01).
- **Image proxying/rehosting** (for broken-image calm + publisher-privacy) — not in Phase 7; images stay as remote `httpUrl`. Re-evaluate if broken-image churn shows up on real ingested content.
- **Re-extraction / content-freshness affordance** beyond delete-and-re-add — locked OUT by save-once-read-forever; a "check for updates" detector could be a later-phase enhancement without breaking immutability.
- **Defuddle evaluation** — not in Phase 7 (D7-09); the adapter boundary keeps it open for a later swap if extraction quality on real content disappoints.

</deferred>

---

*Phase: 7-ingestion-substrate*
*Context gathered: 2026-08-10*
