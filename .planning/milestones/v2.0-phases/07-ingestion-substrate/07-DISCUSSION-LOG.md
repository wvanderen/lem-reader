# Phase 7: Ingestion Substrate - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-10
**Phase:** 7-ingestion-substrate
**Areas discussed:** Surface scope, Deployment platform, Identity & duplicates, Extraction stack

---

## Surface scope

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal proof form | Small "Add by URL / paste HTML" control → Dexie → existing article route. No library chrome. Proves pipeline; P8 wraps library around it. | ✓ |
| Backend + dev harness only | Stateless backend + Dexie write, no shipped UI; proven via Playwright/dev harness. Form lands in P8. | |
| Full ingest form, no library | Real IngestArticleForm.tsx as first-class surface; defer only library list/cards/tags/search to P8. | |

**User's choice:** Minimal proof form
**Notes:** Phase 7 has NO `UI hint: yes` in ROADMAP.md (Phase 8 does) — intentionally backend-focused. SC#1 still satisfied because the reader submits a URL and the article opens in the existing reader.

| Option | Description | Selected |
|--------|-------------|----------|
| Merge into existing list | Fixture-list route reads Dexie-backed source merging fixtures + ingested (no badges/tags/search). ArticleRepository swaps in-memory→Dexie (D-08 hook lands in P7). | ✓ |
| Open-only, re-open via hash | Ingested articles open on submit; not in the list; re-open via kept URL. | |
| Saved but hidden until P8 | Written to Dexie but surfaced only via harness/tests. | |

**User's choice:** Merge into existing list
**Notes:** The D-08 forward-compat ArticleRepository swap lands in Phase 7 (not Phase 8). List is transitional — Phase 8 replaces it with the library.

| Option | Description | Selected |
|--------|-------------|----------|
| URL + paste HTML | URL input + paste-HTML textarea, same /api/ingest pipeline. File-upload (.html) → P8. | ✓ |
| URL + paste + file upload | URL + paste + .html file picker. Covers SC#2 "pastes OR uploads" fully in P7. | |
| URL only | URL input only; paste/upload → P8. Risk: under-delivers SC#2 (paste/upload HTML). | |

**User's choice:** URL + paste HTML
**Notes:** Server pipeline is input-source-agnostic; file-upload is a UI-only addition in P8. Covers SC#1 (URL) + SC#2 (paste) literally; "uploads" via picker lands in P8.

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse existing patterns | Refusals inline via `.status` (D2-13/D3-04) in DOC-06 voice; low-confidence → PAGE-09 banner on first open. Zero new chrome. | ✓ |
| Inline-only, defer banner | Only hard refusals inline; low-confidence banner → P8. Under-delivers ING-06 three-state. | |
| Dedicated disclosure card | New disclosure card on refusal + low-confidence. More surface than minimal-form implied. | |

**User's choice:** Reuse existing patterns
**Notes:** ING-06's three-state honesty is delivered through existing disclosure vocabulary; no new calm-aesthetic surface in a no-UI-hint phase.

---

## Deployment platform

| Option | Description | Selected |
|--------|-------------|----------|
| Cloudflare Pages | /functions + onRequest(context); wrangler pages dev via vite proxy; Workers native fetch; best free tier; <5ms cold start. jsdom needs nodejs_compat_v2 (spike). | ✓ |
| Vercel (Node fn) | Vercel Node function at /api/ingest. jsdom + isomorphic-dompurify native (no compat flags). Smaller free tier. | |
| Node service now, port later | /server as plain Node module for P7; defer platform pick to later. Maximizes optionality. | |

**User's choice:** Cloudflare Pages
**Notes:** Research recommendation. Accept the jsdom-on-Workers spike; linkedom fallback (D7-10) if too heavy. `/server` adapter keeps it portable.

| Option | Description | Selected |
|--------|-------------|----------|
| Split: integration + unit | mXSS/extraction/normalization as pure Node/Playwright unit tests vs /server; SSRF matrix as integration tests vs real wrangler pages dev. | ✓ |
| All via wrangler dev | Both suites hit running wrangler pages dev over HTTP. Most realistic but slower/flakier. | |
| All as pure unit tests | Both suites call /server with mocked fetch/DNS. Risks "green but not safe" (Key Decision #9). | |

**User's choice:** Split: integration + unit
**Notes:** Mirrors v1.0 "real-browser for layout truth" discipline applied to the backend. The SSRF matrix must exercise real DNS/redirect behavior to be honest.

---

## Identity & duplicates

| Option | Description | Selected |
|--------|-------------|----------|
| URL-slug + dedupe-refuse | id = slugify(final canonical URL). Re-ingest refused: "already in your library" + open/remove-first. | ✓ |
| Content-hash id + allow dups | id = hash of content/randomUUID. Same URL twice = second entry (unless identical). Clutters. | |
| URL-slug + auto-refresh | id = slugify(URL); re-ingest bumps revision. REJECTED — silently invalidates highlights. | |

**User's choice:** URL-slug + dedupe-refuse
**Notes:** Cleanest library; immutability preserved by existence check; matches save-once-read-forever. Two different URLs with identical content = two entries (acceptable).

| Option | Description | Selected |
|--------|-------------|----------|
| Optional sourceUrl + origin tag | Provenance.sourceUrl → .optional() (additive). `origin` discriminator on IngestionMeta ("url"|"paste") hides "open original". | ✓ |
| Require URL with paste | Paste form requires a source URL. Keeps sourceUrl mandatory but undermines paste path. | |
| Synthetic placeholder URL | Placeholder https://local/pasted/<hash>. Violates honesty contract. | |

**User's choice:** Optional sourceUrl + origin tag
**Notes:** Additive schema change (fixtures always supply sourceUrl → backward-compatible). originalHtmlHash preserves traceability. Honesty-preserving — no fake URL.

---

## Extraction stack

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm Readability | @mozilla/readability 0.6.0. Firefox Reader View engine; battle-tested; Mozilla-recommended DOMPurify pairing. | ✓ |
| Spike Defuddle first | Research spike comparing Defuddle vs Readability on corpus before locking. Higher ceiling, less battle-tested, adds spike time. | |
| Readability now, Defuddle later | Lock Readability for P7; keep adapter clean so Defuddle can swap in later if quality issues appear. | |

**User's choice:** Confirm Readability
**Notes:** Safe default; well-understood output. htmlToBlocks adapter boundary stays clean (research mandate) so Defuddle remains a future option.

| Option | Description | Selected |
|--------|-------------|----------|
| jsdom primary, linkedom fallback | jsdom via nodejs_compat_v2 primary; linkedom fallback for Readability DOM + DOMPurify(window). mXSS suite gates linkedom promotion. Single-platform. | ✓ |
| jsdom primary, hybrid fallback | If jsdom fails on Workers, move extraction+sanitize to a Node function; Workers only for SSRF fetch. Cleaner DOMPurify, second runtime. | |
| jsdom-only, no fallback | Bet fully on jsdom via nodejs_compat_v2. Highest risk of mid-phase disruption. | |

**User's choice:** jsdom primary, linkedom fallback
**Notes:** Single-platform on Workers. The mXSS regression suite (D7-06) is the safety gate — if attack payloads don't pass on linkedom, linkedom is rejected and hybrid (Node function for extraction) is the contingency.

---

## the agent's Discretion

- Confidence-formula thresholds (blockCount/textLength/unsupported-ratio) — empirical; researcher tunes against real-publisher corpus.
- Slug algorithm details (IDN/punycode, trailing-slash/query normalization, collision resolution).
- Local-dev mechanism (wrangler pages dev via vite proxy vs vite-plugin-cloudflare) — first-plan spike.
- SSRF guard implementation (DNS pinning strategy, library vs hand-rolled, exact blocklist sources).
- `IngestionMeta`/`ArticleSource` field names + Dexie v3 store/index shape (additive, Pitfall 9).
- Refusal/low-confidence copy (calm DOC-06/PAGE-09 voice locked; words are UI-SPEC/planner).
- Timeout/size-cap exact numbers (~30s / content-length guard suggested).

## Deferred Ideas

- Library surface (cards, badges, tags, search, recently-read, reading-progress) → Phase 8 (LIB-01..06).
- File-upload (.html via picker) → Phase 8 (D7-03).
- Markdown intake → Phase 8 (ING-03). PDF → Phase 11 (ING-04). EPUB → Phase 12 (ING-05).
- Export/import → Phase 9. Annotation review panel → Phase 10 (RECV-01).
- Image proxying/rehosting (broken-image calm + privacy) — not in P7; re-evaluate if broken-image churn appears on real content.
- Re-extraction / content-freshness affordance beyond delete-and-re-add — locked out by save-once-read-forever; possible later-phase enhancement.
- Defuddle evaluation — not in P7 (D7-09); adapter keeps it open for a later swap.
