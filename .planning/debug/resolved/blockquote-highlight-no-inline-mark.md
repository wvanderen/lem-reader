---
status: resolved
resolved_by: "05-07"
trigger: "UAT Phase 5 Test 11 — blockquote highlight does not render inline <mark> (Thiel quote in aeon.co fixture). Capture resolves but no <mark> appears."
created: 2026-08-07T00:00:00Z
updated: 2026-08-07T20:30:00Z
---

## Current Focus

hypothesis: CONFIRMED — A kind-based filter `block.kind === "paragraph" || block.kind === "heading"` in BOTH render paths (BlockRenderer.ArticleBody + fragmentRenderer.PageFragmentView) gates `highlightSlices` computation to paragraph/heading ONLY. Blockquote is a CONTAINER kind whose text lives in `children`; the renderer never computes nor threads slices into a blockquote's children, so no `<mark>` renders. Capture + persistence + resolution all work (D5-07 eligible), which is exactly the reported symptom ("registers on load but doesn't appear highlighted").
test: Traced render pipeline for paragraph vs blockquote end-to-end.
expecting: Confirmed — blockquote path drops the highlight thread at the kind guard; the recursive BlockView for blockquote children also never forwards slices.
next_action: Return ROOT CAUSE FOUND (goal: find_root_cause_only — no fix applied).

## Symptoms

expected: A highlight captured on a blockquote passage renders an inline `<mark>` on the quoted text (blockquote is in the eligible highlightable set per D5-07).
actual: The Thiel blockquote passage CANNOT be saved as a VISIBLE highlight. It auto-registers on load (HighlightRecord exists and resolves) but DOESN'T appear highlighted — NO inline `<mark>` renders on the blockquote text.
errors: None reported.
reproduction: Test 11 in .planning/phases/05-durable-highlights-and-notes/05-UAT.md (aeon.co "The looting of science fiction" fixture).
started: Phase 5 annotations work.

## Eliminated

- hypothesis: capture offset maps to a position that doesn't match the blockquote's normalized text, so resolution lands it elsewhere (context possibility #4).
  evidence: capture.ts:258 marks blockquote eligible; normalizeText.ts:47 `blockNormalizedText(blockquote)` includes children's text; the user reports the highlight "registers on load" (resolves). The data side works — the failure is purely in rendering.
  timestamp: 2026-08-07T10

- hypothesis: sliceRunsForHighlights produces no slices for the blockquote because its run/coordinate model differs (context possibility #3).
  evidence: sliceRunsForHighlights (highlightRanges.ts:78) is never even CALLED for a blockquote — the kind guard at BlockRenderer.tsx:292-294 short-circuits before it. The function itself works on flat InlineRun[] and is correct; it's the call-site gate that excludes blockquote.
  timestamp: 2026-08-07T11

## Evidence

- timestamp: 2026-08-07T01
  checked: src/content/render/BlockRenderer.tsx:292-310 (ArticleBody kind guard)
  found: `highlightSlices` is computed ONLY inside `if (effectiveHighlights.length > 0 && (block.kind === "paragraph" || block.kind === "heading"))`. For a top-level blockquote block the condition is FALSE → `highlightSlices` stays `undefined` → passed to BlockView as undefined.
  implication: The scrolling render path never produces slices for a blockquote block.

- timestamp: 2026-08-07T02
  checked: src/content/render/BlockRenderer.tsx:93-100 (BlockView blockquote case)
  found: The blockquote case recurses `{block.children.map((child, i) => <BlockView key={i} block={child} />)}` — it does NOT forward `highlightSlices` to the recursive child calls. So even if slices WERE computed at the top level, they would be dropped at the recursion.
  implication: Second compounding drop point — blockquote children (paragraphs) render via InlineList with no slices.

- timestamp: 2026-08-07T03
  checked: src/content/render/InlineRenderer.tsx:83-91 (InlineList early-return)
  found: `if (!highlightSlices || highlightSlices.length === 0) { return runs directly }`. When no slices are passed, InlineList renders plain runs — NO `<mark>`.
  implication: The blockquote's child paragraph reaches InlineList with no slices → no mark. This is the terminal failure.

- timestamp: 2026-08-07T04
  checked: src/pagination/fragmentRenderer.tsx:125-136 (PageFragmentView kind guard)
  found: The paginated path has the SAME exclusion: `if (resolved.kind === "paragraph" || resolved.kind === "heading") { ... sliceRunsForHighlights ... }`. For a blockquote fragment entry, no slices are computed.
  implication: Both render modes (scrolling + paginated) exclude blockquote from inline marks — the failure is mode-independent, consistent with "registers on load but doesn't appear."

- timestamp: 2026-08-07T05
  checked: src/annotations/capture.ts:254-268 (isEligibleBlock) + :333-399 (capture flow)
  found: `isEligibleBlock` includes `case "blockquote": return true`. `findBlockAncestor` resolves the BLOCKQUOTE's `data-block-index` (the nearest top-level ancestor carrying the attribute). Position computed against `blockNormalizedText(blockquote)`. The HighlightRecord persists.
  implication: Capture path WORKS for blockquote (D5-07 eligible) — confirms the data side of the symptom.

- timestamp: 2026-08-07T06
  checked: src/content/normalizeText.ts:41-63 (blockText for blockquote)
  found: `case "blockquote": return block.children.map(blockText).join(BLOCK_SEPARATOR)`. A blockquote's normalized text is the JOIN of its children's text with `\n` separators.
  implication: The highlight's resolved position lands within the blockquote's article-global range (covering the children's text) — so the data resolves correctly, but the renderer has no code path to translate that article-global range into per-child `InlineRun[]` slices.

- timestamp: 2026-08-07T07
  checked: src/annotations/highlightRanges.ts:78-169 (sliceRunsForHighlights signature)
  found: `sliceRunsForHighlights(runs: InlineRun[], blockGlobalStart, highlights, lang)`. It operates on a FLAT InlineRun[] — a single paragraph's run array. A blockquote's content is `children` (nested blocks), NOT a flat InlineRun[]. You cannot call this directly on a blockquote.
  implication: Threading marks into a blockquote requires a recursive per-child descent (compute each child paragraph's intra-blockquote offset + intersect), NOT a single sliceRunsForHighlights call on the blockquote.

- timestamp: 2026-08-07T08
  checked: src/fixtures/articles/essay-long-form.canonical.json:47-57 (Thiel blockquote)
  found: The blockquote is a TOP-LEVEL article block: `{ kind: "blockquote", children: [ { kind: "paragraph", content: [ { text: "I no longer believe that freedom and democracy are compatible ..." } ] } ] }`. Single child paragraph.
  implication: Confirms the data shape — blockquote carries data-block-index at top level; its child paragraph does NOT carry data-block-index (BlockRenderer.tsx:311-317 documents this). Capture resolves to the blockquote's index.

- timestamp: 2026-08-07T09
  checked: Documentation consistency — code comment vs phase SUMMARYs
  found: CODE comment at BlockRenderer.tsx:277-290 EXPLICITLY lists blockquote as a container kind excluded from inline overlays ("Container kinds (blockquote/list) ... do not carry inline highlight overlays in this MVP slice"). BUT Plan 05-05 SUMMARY "Known Stubs / Deferred" (lines 164-167) names ONLY code-block + figure-caption as deferred, and "Decisions Made" (line 87/122) scopes inline overlay to "paragraph + heading only" without naming blockquote/list. The UAT D5-07 truth expects blockquote inline marks.
  implication: The exclusion is INTENTIONAL in code (commented) but UNDER-DOCUMENTED in the phase SUMMARYs — the deferred list omitted blockquote, creating a contract gap that surfaced as a UAT failure.

## Resolution

root_cause: A kind-based gate in BOTH render paths limits inline `<mark>` overlay computation to paragraph + heading blocks. BlockRenderer.ArticleBody (src/content/render/BlockRenderer.tsx:292-294) computes `highlightSlices` only when `block.kind === "paragraph" || block.kind === "heading"`; the paginated PageFragmentView (src/pagination/fragmentRenderer.tsx:125) applies the identical gate (`resolved.kind === "paragraph" || resolved.kind === "heading"`). A blockquote is a CONTAINER whose readable text lives in `block.children` (nested paragraphs); neither render path computes per-child highlight slices, and the blockquote BlockView recursion (BlockRenderer.tsx:93-100) does not forward `highlightSlices` to children even if it had them. InlineList (InlineRenderer.tsx:83) therefore receives no slices for the blockquote's child paragraph and renders plain runs with no `<mark>`. Capture (capture.ts:258), persistence, and resolution all work for blockquote — D5-07 marks it eligible and `blockNormalizedText` (normalizeText.ts:47) includes the children's text — which is exactly the reported symptom: the highlight registers on load but no inline mark renders. This is an INTENTIONAL MVP-scope limitation (documented in code comment at BlockRenderer.tsx:277-290) that was UNDER-DOCUMENTED in the phase SUMMARYs (which named only code-block + figure-caption as deferred, not blockquote/list).

fix: (diagnose-only — not applied). To render a mark on a blockquote, the renderer needs a recursive per-child slice computation: for a blockquote block, walk `block.children` accumulating each child's intra-blockquote grapheme offset (accounting for BLOCK_SEPARATOR between children — mirrors fragmentRenderer.sliceChildBlocks), intersect each highlight's article-global range with each child's range, and forward per-child `highlightSlices` to the recursive `<BlockView>` call. The blockquote BlockView case (BlockRenderer.tsx:93-100) must accept and forward slices per child. The same treatment is needed in fragmentRenderer.PageFragmentView for the paginated path. `sliceRunsForHighlights` operates on a flat InlineRun[] and can be reused per child paragraph as-is.

verification: (none — diagnose-only mode)
files_changed: []
