# Phase 20: Safe Local Image Fidelity - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-31
**Phase:** 20-safe-local-image-fidelity
**Areas discussed:** Source scope, Fetch + refusal timing, Format + animation policy, Local src + geometry stability

---

## Source scope

| Option | Description | Selected |
|--------|-------------|----------|
| All except PDF (Recommended) | URL/paste HTML + Markdown via new SSRF-safe asset fetch; EPUB extracts from the local container (un-downgrades D12-16); every FigureBlock local-asset-backed; PDF stays text-only | ✓ |
| Web + Markdown only | URL/paste HTML + Markdown localize; EPUB keeps its D12-16 figure downgrade | |
| Web only | Only URL/paste HTML localizes; Markdown + EPUB downgrade | |

**User's choice:** All except PDF
**Notes:** Gray-area selection initially picked "Source scope" alone; user then requested all four areas be discussed.

| Option | Description | Selected |
|--------|-------------|----------|
| Keep refusing (Recommended) | data: URIs stay refused per Pitfall 5 — one no-exceptions media boundary | ✓ |
| Accept inline images | Decode inline data: images subject to the same caps, store as local assets | |

**User's choice:** Keep refusing
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Chapter figures only (Recommended) | EPUB scope = figures inside chapter content; no cover extraction or thumbnails; covers are backlog | ✓ |
| Covers too | Also extract + display book covers in library rows — grows phase into library UI | |

**User's choice:** Chapter figures only
**Notes:** —

---

## Fetch + refusal timing

| Option | Description | Selected |
|--------|-------------|----------|
| Inline at ingest (Recommended) | Per-asset timeout + overall budget inside ingest; saved article always complete; no background fetching | ✓ |
| Deferred background | Article saves immediately; images fill in afterward — reopen gaps, restabilization, post-save third-party contact | |
| Hybrid budget | Inline within a bounded time budget; unresolved figures refuse calmly | |

**User's choice:** Inline at ingest
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Per-figure (Recommended) | One bad image never blocks the article; each refused figure becomes a calm fallback | ✓ |
| Article-level | Any hard-limit crossing refuses the whole article | |

**User's choice:** Per-figure
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| FigureBlock + placeholder (Recommended) | Stays a FigureBlock; alt + caption render as-is; calm placeholder image surface; captions stay highlightable | ✓ |
| Downgrade to unsupported | Refused figures become UnsupportedBlock; loses caption text + caption highlighting | |

**User's choice:** FigureBlock + placeholder
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Re-ingest only (Recommended) | No in-reader retry UI; re-ingesting the source refreshes assets | ✓ |
| Manual retry button | Per-figure "try again" affordance re-running the fetch — new network surface + UI | |

**User's choice:** Re-ingest only
**Notes:** —

---

## Format + animation policy

| Option | Description | Selected |
|--------|-------------|----------|
| Modern raster set (Recommended) | jpeg, png, webp, gif, avif — all three CI engines decode; everything else refuses per-figure | ✓ |
| Core set only | jpeg, png, webp only; gif/avif refuse | |

**User's choice:** Modern raster set
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Refuse animated (Recommended) | Animated GIF/WebP/APNG refuse calmly; static forms accept; no re-encode pipeline | ✓ |
| Accept as-is | Animations store and play — looping motion in a calm reader | |
| Freeze first frame | Canvas re-encode to static frame — new lossy transform surface | |

**User's choice:** Refuse animated
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Refuse SVG (Recommended) | Raster-only boundary; SVG mXSS surface avoided; sanitized static SVG is backlog | ✓ |
| Sanitized static SVG | Accept after stripping scripts/events/foreignObject — new sanitizer surface to prove | |

**User's choice:** Refuse SVG
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Generous, bomb-stopping (Recommended) | Caps stop bombs/abuse, not reading; exact numbers corpus-determined; photo essays save whole | ✓ |
| Strict minimal footprint | Tight caps favoring small footprint and fast saves | |

**User's choice:** Generous, bomb-stopping
**Notes:** —

---

## Local src + geometry stability

| Option | Description | Selected |
|--------|-------------|----------|
| Rewrite src at ingest (Recommended) | FigureBlock.src becomes a local asset reference; original URL → provenance; self-contained model; IMG-03 by construction | ✓ |
| Keep URL, resolve at render | Blocks keep httpUrl; renderer maps URL → blob; needs never-fall-back-to-remote engineering | |

**User's choice:** Rewrite src at ingest
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Stored intrinsic dims (Recommended) | Decode at ingest, store width/height; pagination reserves exact aspect box; decode is fill-in; refused/unknown get default box | ✓ |
| Fixed uniform frames | All figures in fixed-height letterboxed frames — distorts visual intent | |
| Reflow on decode | No reservation; repaginate as images land — the destabilization IMG-06 forbids | |

**User's choice:** Stored intrinsic dims
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Framed box + glyph + alt (Recommended) | Quiet framed box at reserved aspect + image glyph + alt text; caption beneath; one surface for ingest-refused and read-time-broken | ✓ |
| Plain alt text | Alt as prose — indistinguishable from paragraphs | |
| One-line notice | "[Image not available]" — drops alt text | |

**User's choice:** Framed box + glyph + alt
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Article-owned blobs (Recommended) | New additive Dexie store keyed article id + asset id; deletion cascades atomically in one transaction; duplicates rare and capped | ✓ |
| Shared content-hash store | Deduped assets across articles; needs refcount/GC — new lifecycle machinery | |

**User's choice:** Article-owned blobs
**Notes:** —

---

## the agent's Discretion

- Asset-fetch pipeline mechanics (safeFetch extension, stage placement, timeouts/budgets)
- Exact cap numbers (corpus-determined per IMG-02)
- Animation detection mechanics
- Schema evolution shape (field names, dims placement, fixture regeneration)
- Dexie v6 store shape; asset id format
- EPUB extraction mechanics (container-relative resolution)
- Object-URL lifecycle; placeholder glyph anatomy + exact copy
- Export/import bundle v4 asset entries, conflicts, validation
- Pagination integration of reserved geometry; D-05 substrate byte-identity
- Markdown relative-src confirmation; test matrix shape

## Deferred Ideas

- Book cover images / library cover thumbnails (backlog)
- Sanitized static SVG (backlog)
- First-frame freeze for animated images (rejected alternative)
- In-reader per-figure retry (rejected alternative)
- PDF embedded-image extraction (out of scope)
