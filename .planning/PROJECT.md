# Lem Reader

## What This Is

Lem Reader is a calm, booklike reader for web articles and documents, designed for accessibility users — especially readers who benefit from reduced distraction, stable spatial orientation, and predictable navigation. It presents normalized long-form content in either responsive pages or a clean scrolling view.

**Shipped as v1.0:** a saved-article prototype proving that web content can be repaginated quickly and reliably without sacrificing semantic HTML, keyboard access, reduced-motion behavior, or reader choice — across Chromium, Firefox, and WebKit.

**Shipped as v2.0:** a bring-your-own personal library. Readers ingest URLs, pasted HTML, Markdown documents, PDFs, and EPUB books through one SSRF/XSS-guarded server pipeline into a local-first library; take their library and highlights across machines via versioned export/import; and review every annotation on a dedicated panel — with the v1.0 reading-engine guarantees holding unchanged for every ingested format.

## Core Value

Readers can move through long-form web content with calm, stable orientation and predictable navigation.

## Current State

**v2.0 Personal Library — SHIPPED 2026-08-23.** Seven phases (7–13), 53 plans, 124 tasks across 13 days. All 26 v2.0 requirements verified by the milestone audit (7/7 phases, 14/14 integration chains, 7/7 E2E flows).

- Five-format ingestion through one stateless 7-stage server pipeline (safeFetch → Readability/jsdom extract → DOMPurify sanitize → canonical Block tree → round-trip anchor gate → confidence stamp): URL, pasted HTML/uploaded HTML, Markdown (strict CommonMark), PDF (unpdf, corpus-calibrated honest refusal for scanned/multi-column), and EPUB (fast-xml-parser adapter, per-chapter articles under thin Book records).
- Personal library as the default route: browse/search/tag/remove with cascade, source badges, reading-progress hairlines, continue-reading strip, and expandable EPUB book groupings with book-level progress/resume.
- Versioned portability in lieu of accounts: whole-library zip bundles (schemaVersion 1|2 union, SHA-256 manifest, Zip Slip + bomb guards) with atomic 6-store import, dry-run conflict preview, skip-by-default per-kind overrides; highlights-only Markdown export (per-article and library-wide).
- Annotation review panel at `#/review`: cross-library listing, jump-to-location deep links, filter/sort, honest tri-state badges, in-place curation.
- Polish: first-paint settings mirror (no mode/theme/typography flash), offset-anchored progress, paginated first-paint placeholder, centered modals, slim header with tag popover, Back-to-library, organized library home.
- Acceptance: ACPT-06 core flow (ingest → read → highlight → export → re-import) green on Chromium/Firefox/WebKit; ACPT-05 NVDA+Firefox passed on ACCEPTANCE-PROTOCOL v1.2 (zero blocker/major) after the G6→G7→G8 fix-then-re-run loop.
- Production: minimal Vercel Node deployment of `/api/ingest` (workerd cannot run jsdom — the human-approved HYBRID CONTINGENCY from the 07-01 spike).

**Codebase:** ~26,080 LOC source (111 files) + ~48,656 LOC tests. Tech stack: React 19 + TypeScript 7 + Vite 8 SPA, Dexie (schema v5, append-only), Zod, Pretext (calibrated heading path), Vitest + Playwright + axe-core; server-side: Readability, DOMPurify, marked, unpdf 1.8.1, fast-xml-parser 5.10.1, fflate.

**Final suite:** `npm run test` = 2284 passed / 0 failed / 19 skipped / exit 0 (13-10-OUTPUT.md record).

**Known tech debt (non-blocking):** EPUB anchor-gate OOM on whole-novel chapters + unbounded per-chapter stage loop (backlog candidates); LibraryRow FINISHED_RATIO fork; dead LegacyFixtureList.tsx; 3 zipSlip.ts lint errors; stale debug-session ledgers (see v2.0-MILESTONE-AUDIT.md §5 and STATE.md Deferred Items).

<details>
<summary>Version history detail</summary>

**v1.0 MVP — SHIPPED 2026-08-10.** Six phases, 35 plans, 79 tasks across 16 days. Curated six-article corpus in a 9-kind/4-mark Zod document model; dual-mode reading (project-owned pagination engine with line-box splitting, widow rules, overflow guard; calibrated Pretext fast path for headings); typography/theme/measure controls persisted in Dexie; grapheme-offset location restore; durable highlights + notes on W3C-inspired TextPosition/TextQuote selectors with tri-state resolution; full a11y validation (keyboard, VoiceOver+Safari manual protocol, high-zoom/reflow, forced-colors, reduced-motion, font-failure) and a user-approved perf CI gate. Final suite 1157 passed / 0 failed / exit 0. See `milestones/v1.0-ROADMAP.md`.

**v2.0 phase log:** Phase 7 Ingestion Substrate (2026-08-12) · Phase 8 Markdown + Library (2026-08-13) · Phase 9 Export/Import (2026-08-15) · Phase 10 Review Panel (2026-08-16) · Phase 11 PDF Intake (2026-08-17) · Phase 12 EPUB Intake (2026-08-18) · Phase 13 Polish + Acceptance (2026-08-19; gap-closure waves through 2026-08-23). See `milestones/v2.0-ROADMAP.md`.

</details>

## Current Milestone

None — v2.0 archived 2026-08-23. Start the next milestone with `/gsd-new-milestone` (questioning → research → requirements → roadmap). Future-requirement candidates already identified in REQUIREMENTS.md archives: orientation aids (ORNT-01/02), explicit anchor repair (RECV-02), presentation presets (PRES-01), full-text search, folders/collections, per-article export, accounts/cloud sync (deferred per export/import-first), browser-extension packaging — plus the v2.0 tech-debt backlog (EPUB OOM, per-chapter timeout bounds).

## Requirements

### Validated

- ✓ Load a representative set of saved, normalized long-form articles into a dedicated reader prototype. — v1.0
- ✓ Present every supported article in both responsive paginated and clean scrolling modes, with the reader always able to switch modes. — v1.0
- ✓ Preserve semantic structure for text, headings, links, quotations, lists, images, captions, footnotes, and code blocks. — v1.0
- ✓ Provide predictable keyboard, click/tap, and accessible navigation with reduced-motion support. — v1.0
- ✓ Keep pagination stable and responsive as viewport and typography settings change, while handling font loading safely. — v1.0
- ✓ Provide typography, spacing, theme, and reading-mode controls that support a calm, low-distraction experience. — v1.0
- ✓ Restore the reader's location when reopening the same article. — v1.0
- ✓ Fall back gracefully to the clean scrolling view whenever reliable pagination is not possible. — v1.0
- ✓ Store highlights and attached notes locally and keep their anchors stable across repagination. — v1.0
- ✓ URL + paste-HTML ingestion (ING-01/02/06/07/08) — SSRF-guarded fetch backend normalizes publicly fetchable pages into canonical articles with honest three-state confidence; mXSS regression suite green. — v2.0
- ✓ Markdown intake (ING-03) — strict CommonMark through the shared pipeline. — v2.0
- ✓ Personal library (LIB-01..06) — browse, open, search, tag, remove; source metadata; progress + continue-reading. — v2.0
- ✓ Versioned export/import (PORT-01/02) — whole-library bundles with validation, conflict preview, atomic transaction, Zip Slip guard; round-trip proven on a two-machine harness. — v2.0
- ✓ Highlights-only Markdown export (PORT-03) — per-article and library-wide with honest tri-state markers. — v2.0
- ✓ Annotation review panel (RECV-01) — #/review surface with jump-to-location, filter/sort, tri-state badges, in-place curation. — v2.0
- ✓ PDF intake (ING-04) — text-heavy PDFs normalized with outline-coerced headings; scanned/multi-column/corrupt/oversized refused calmly; thresholds corpus-calibrated (6 real PDFs) and CI-replay-pinned. — v2.0
- ✓ EPUB intake (ING-05) — DRM-free EPUBs as per-chapter articles under book groupings; books ride the export/import loop (bundle v2). — v2.0
- ✓ Polish (POLISH-01..06) — first-paint mirror, offset-anchored progress, slim header + tag popover, centered modals, Back-to-library, organized library home. — v2.0
- ✓ Acceptance (ACPT-05/06) — NVDA+Firefox protocol v1.2 passed zero-blocker; core flow green across the 3-engine matrix with full-suite exit 0. — v2.0

### Active

None — the next milestone defines fresh requirements via `/gsd-new-milestone`.

### Out of Scope

- **Authenticated, paywalled, or login-gated content** — URL ingestion targets publicly fetchable pages; login/paywall content raises CORS, permissions, and ToS issues (carried from v2.0).
- **Accounts, cloud sync, and encrypted cross-device persistence** — deferred; the export/import loop is the proven cross-device story (re-evaluate now that the library + portability loop has shipped).
- **Browser-extension packaging** — deferred until the ingestion + library loop proves out further in the web app.
- **Orientation aids (ORNT-01/02), explicit anchor repair (RECV-02), and presentation presets (PRES-01)** — future-requirement candidates, not committed.
- **Tables, interactive embeds, math, and irregular application layouts** — the reader targets rich long-form articles rather than the full web (carried from v1.0).
- **A required page-turn animation** — cannot compromise speed, interruption, or reduced-motion preferences (carried from v1.0).
- **AI summaries, chat, recommendations, read-aloud, RSS/newsletter ingestion** — outside the bring-your-own-library hypothesis (carried from v2.0).
- **Formal proof of improved preference/comprehension/completion** — comparative user-value validation follows after the product loop is trustworthy (carried from v1.0).

## Context

The product promise is to turn "read this webpage" into "open this as a book" without requiring publishers to change their sites. v1.0 isolated the reading engine from extraction variability; v2.0 built the ingestion + library + portability loop on top without the reading engine being able to tell an ingested article from a fixture — the load-bearing invariant held through every format.

The audience focus is cognitive accessibility: reducing distraction, maintaining a sense of place, and making navigation predictable. Pagination is the distinctive default experience, but never mandatory; readers retain explicit control and the system falls back when content cannot be laid out reliably. Honesty is a product principle: extraction and annotation both surface three-state outcomes (confident/low/unsupported; confident/ambiguous/orphan) rather than silent garbage or silent re-attachment.

Pretext.js remains a calibrated fast path for heading blocks only (2592-sample cross-engine calibration); DOM measurement is authoritative for everything else. Annotations attach to stable normalized-text positions plus quoted context — page numbers never persist. Cross-device travel uses versioned export bundles, not accounts.

Accessibility validation now spans the full matrix: keyboard, VoiceOver+Safari (v1.0) and NVDA+Firefox (v2.0, protocol v1.2), high-zoom/reflow, forced-colors, reduced-motion, font-failure, and touch targets across Chromium, Firefox, and WebKit.

## Constraints

- **Content scope**: Text, headings, links, quotations, lists, images, captions, footnotes, and code blocks — rich long-form publishing, not full-web compatibility (tables/math/embeds excluded).
- **Reading modes**: Paginated and scrolling modes must both remain available — accessibility and reader preference take precedence over enforcing pagination.
- **Accessibility**: Semantic HTML, keyboard navigation, screen-reader compatibility, zoom, visible focus, and reduced motion are foundational.
- **Persistence**: Reading position, highlights, notes, library, and preferences are local-first — no accounts or sync infrastructure; cross-device via versioned export/import.
- **Security**: The canonical document model is the security boundary — sanitize once at ingest, never `dangerouslySetInnerHTML`; ingestion refuses private/internal/cloud-metadata endpoints (SSRF) and caps sizes/redirects.
- **Honesty**: No silent garbage — unsupported content and unreliable extraction refuse calmly with reader-visible reasons; annotations never silently re-attach.
- **Performance**: Repagination stays responsive and stable after fonts settle — enforced by a user-approved CI budget.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Lead with booklike reading rather than annotation-anywhere | Stable pagination and spatial orientation are the distinctive hypothesis to prove first | ✓ Validated — v1.0 |
| Build a saved-article prototype before an extension | Isolates layout, accessibility, and annotation behavior from extraction and browser packaging risks | ✓ Validated — v1.0 |
| Design first for cognitive accessibility | Calm presentation, stable location, and predictable navigation define the primary reader need | ✓ Validated — v1.0 |
| Always offer paginated and scrolling modes | Reader control and robust access matter more than enforcing a single presentation | ✓ Validated — v1.0 |
| Grapheme-offset canonical coordinate system (Intl.Segmenter) | Single stable coordinate shared by reading location, pagination source ranges, and annotation anchors | ✓ Good — anchors survived every repagination/mode/reopen test |
| Project-owned pagination engine (no off-the-shelf lib) | Required combination of semantic DOM, responsive repagination, annotation-safe offsets, and scrolling twin that no reviewed library supplied | ✓ Good — corpus paginates green × 3 engines; ingested formats ride it unchanged |
| W3C-inspired TextPositionSelector + TextQuoteSelector for annotations | Page numbers, pixels, DOM paths, and serialized ranges are all ephemeral; offsets + quoted context survive relayout | ✓ Good — tri-state resolution never silently re-attaches; round-trip gate reuses it at ingest |
| Honest full-suite execution discipline (run `npm run test` end-to-end, record fail counts) | A "269 passed / 0 failed" misreport hid 76 real e2e failures; only re-running the suite overturned it | ✓ Good — durable phase gate through v2.0 |
| HYBRID CONTINGENCY runtime: SSRF-safe fetch can run on Workers, but extraction+sanitize need Node (jsdom) | workerd lacks MessagePort and linkedom-DOMPurify is a no-op sanitizer (07-01 spike) | ✓ Good — Vite Node dev middleware + Vercel Node production deploy; adapter boundary kept logic portable |
| One 7-stage ingestion pipeline for all five formats, with an inline round-trip anchor gate refusing non-confident articles | The reader must not be able to tell an ingested article from a fixture; an article that can't round-trip its own anchors is refused | ✓ Good — held across URL/HTML/MD/PDF/EPUB; per-chapter EPUB gates reuse it unchanged |
| Strict CommonMark as the security boundary for Markdown intake | CommonMark's default raw-HTML escaping eliminates the mXSS surface without DOMPurify on that path | ✓ Good — v2.0 |
| PDF/EPUB honesty over best-effort: corpus-calibrated refusal thresholds, CI-replay-pinned | Silent garbage (OCR-less scans, reordered columns) violates the calm-reading promise more than a refusal does; replay pins prevent silent loosening | ✓ Good — 6-PDF + 7-EPUB real corpora; 11-07 relaxed admission algebra without touching thresholds |
| EPUB-as-Book Option A: one article per chapter + thin Book record | Preserves every v1.0 substrate contract at chapter granularity; no second rendering model | ✓ Good — chapters paginate/annotate/restore identically; books ride export/import (bundle v2) |
| Portability = versioned zip bundles with skip-by-default conflict resolution, not accounts | Cross-device highlights without auth/sync infrastructure; never silently overwrite reader data | ✓ Good — two-context round-trip e2e proves byte-equal offsets |
| SR platform boundaries resolved in protocol, not production hacks (G7-D1/G8-D1) | NVDA browse-mode/native-selection behaviors are unobservable by construction; production focus moves would harm Gecko/WebKit users | ✓ Good — protocol v1.2 passed zero-blocker with zero production changes |
| Reduced-gate acceptance honesty | When part of the matrix can't be run, record it as a coverage boundary rather than claiming full coverage | ✓ Good — v1.0 A4 boundary closed by the v2.0 NVDA run |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-23 after v2.0 milestone*
