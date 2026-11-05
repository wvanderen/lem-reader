// src/content/structure.ts
// Issue #236 — the pure work-structure module: derive, validate, and resolve
// stable chapter/reading-part destinations over the canonical article.
//
// Content, not layout (docs/specs/long-work-implementation-plan.md §Reading
// structure): destinations are revision-scoped source ranges — never page
// indices, never title-derived identity. Typography changes pages and
// measurement windows; established chapters and reading parts do not move.
//
// Honesty rules carried here:
//   - Chapters come from publisher outline evidence (matched strictly, in
//     source order) or from the work's own shallowest headings. A heading is
//     not automatically an author-written chapter, and generated reading
//     parts never claim to be one (`titleSource: "generated"`, "Part N").
//   - Destinations tile the canonical coordinate stream exactly — leading
//     text, zero-text visual blocks, separators (coordinate glue, assigned
//     to the earlier range), and footnote bodies stay covered.
//   - Duplicate headings are distinct destinations: identity is the range
//     (`pt-<block>.<g>`), not the title.
//   - Derivation is deterministic: the same canonical content always derives
//     the same destinations, so a legacy record's derived structure is as
//     stable as a persisted snapshot. A persisted snapshot, once validated,
//     is FROZEN — callers prefer it over re-derivation so a future generator
//     update cannot renumber an established work.
//
// Pure domain logic — no DOM, no React, no I/O. The same module serves the
// server composition (fresh ingests carry a snapshot) and the client
// (legacy records derive; structureStore persists lazily). Reuses the ONE
// canonical substrate: articleGraphemeIndex for offsets, blockSliceBoundary
// for intra-block cuts. No second normalization or slicing algorithm.

import {
  WORK_STRUCTURE_SCHEMA_VERSION,
  WorkStructureSchema,
  type CanonicalArticle,
  type StructureDestination,
  type WorkStructure,
} from "./schema";
import { articleGraphemeIndex, normalizeRunText } from "./normalizeText";
import { blockSliceBoundary, classifyBlock } from "../pagination/splitBlock";

/** Bumped only when the derivation algorithm itself changes. Existing
 * snapshots stay frozen at their established boundaries; only records
 * without a snapshot re-derive (and lazily persist) under the new version. */
export const STRUCTURE_GENERATOR_VERSION = 2;

/** The target canonical length of one generated reading part, in grapheme
 * clusters. Content-work sizing (like the pagination bounds), not layout:
 * a part spans several measurement windows, so window boundaries can change
 * with typography while the part does not. */
export const PART_TARGET_GRAPHEMES = 24_000;

/** The minimal input derivation reads off the canonical article. The server
 * composition calls this just before ArticleSchema.parse with exactly these
 * fields assembled; the client passes a parsed record. */
export type StructureSource = Pick<
  CanonicalArticle,
  "id" | "revision" | "lang" | "blocks" | "footnotes"
> & {
  /** The resolved work title (provenance.title). A body heading carrying it
   * is the article's own title artifact (Readability keeps the in-page h1,
   * promoted to h2) — it is the WORK's name, never one of its chapters. */
  provenanceTitle?: string;
};

/** Ordered publisher chapter titles captured at extraction (the source's own
 * table of contents). Ephemeral: consumed at derivation, never persisted. */
export type OutlineEvidence = readonly string[];

/** Collapse whitespace the way canonical heading runs do — the substrate's
 * OWN rule (normalizeRunText), so evidence text compares equal to canonical
 * heading text for the same source heading. Never a second collapse. */
function normalizeTitle(text: string): string {
  return normalizeRunText(text);
}

function headingText(
  block: Extract<CanonicalArticle["blocks"][number], { kind: "heading" }>,
): string {
  return normalizeTitle(block.content.map((r) => r.text).join(""));
}

/**
 * The chapter boundary blocks: publisher evidence matched strictly in source
 * order when it reconciles with the canonical headings, else the work's own
 * shallowest heading level (h2–h6 — the h1 is the provenance-rendered title
 * domain, matching the TOC's exclusion). Empty when the work has no usable
 * headings.
 */
function chapterBoundaries(
  blocks: CanonicalArticle["blocks"],
  evidence: OutlineEvidence | undefined,
  provenanceTitle?: string,
): { blockIndex: number; title: string; titleSource: "publisher" | "heading" }[] {
  const headings: { blockIndex: number; title: string; level: number }[] = [];
  for (const [blockIndex, block] of blocks.entries()) {
    if (block.kind === "heading") {
      const title = headingText(block);
      if (title) headings.push({ blockIndex, title, level: block.level });
    }
  }
  if (headings.length === 0) return [];

  if (evidence !== undefined && evidence.length >= 2) {
    // Strict in-order matching: every evidence entry must be consumed by a
    // DISTINCT canonical heading, and both lists must reconcile exactly.
    // Repeated labels are ambiguous once source ids are stripped: even an
    // earlier subsection can carry a chapter's title. Only uniquely named
    // canonical headings qualify; otherwise use honest heading structure.
    const normalized = evidence.map(normalizeTitle).filter((t) => t.length > 0);
    const headingCounts = new Map<string, number>();
    for (const heading of headings) {
      headingCounts.set(heading.title, (headingCounts.get(heading.title) ?? 0) + 1);
    }
    if (
      normalized.length === evidence.length &&
      normalized.every((title) => headingCounts.get(title) === 1)
    ) {
      const matched: { blockIndex: number; title: string }[] = [];
      let cursor = 0;
      for (const heading of headings) {
        if (cursor < normalized.length && heading.title === normalized[cursor]) {
          matched.push({ blockIndex: heading.blockIndex, title: heading.title });
          cursor += 1;
        }
      }
      if (cursor === normalized.length) {
        return matched.map((m) => ({ ...m, titleSource: "publisher" as const }));
      }
    }
  }

  // Heading-derived: the shallowest level present divides the work, over
  // h2–h6 only — a body h1 is the provenance-rendered title domain (the
  // TOC's h1 exclusion, ORNT-04), and a pasted title heading must not turn
  // "Chapter 1 of 1" noise into a fake chapter (an h3 subsection under an
  // h2 chapter stays inside its chapter).
  const bodyHeadings = headings.filter((h) => h.level >= 2);
  // The work's FIRST heading carrying the provenance title is the title
  // artifact — excluded from derived boundaries. The evidence pool above is
  // untouched: the publisher still decides what its own chapters are.
  const titleArtifact =
    provenanceTitle !== undefined &&
    headings.length > 0 &&
    headings[0]!.title === normalizeTitle(provenanceTitle)
      ? headings[0]!.blockIndex
      : -1;
  const derivedPool = bodyHeadings.filter((h) => h.blockIndex !== titleArtifact);
  if (derivedPool.length === 0) return [];
  const shallowest = Math.min(...derivedPool.map((h) => h.level));
  return derivedPool
    .filter((h) => h.level === shallowest)
    .map((h) => ({ blockIndex: h.blockIndex, title: h.title, titleSource: "heading" as const }));
}

/** Assemble one destination from its identity/title fields and its range
 * (a Segment carries exactly the destination's range shape — one copy of
 * the six-field literal, not four). */
function toDestination(
  kind: "chapter" | "part",
  title: string,
  titleSource: StructureDestination["titleSource"],
  range: Segment,
  parentChapterId?: string,
): StructureDestination {
  return {
    id: destinationId(kind, range.startBlock, range.startGrapheme),
    kind,
    title,
    titleSource,
    ...(parentChapterId !== undefined ? { parentChapterId } : {}),
    startBlock: range.startBlock,
    endBlock: range.endBlock,
    startGrapheme: range.startGrapheme,
    endGrapheme: range.endGrapheme,
    startOffset: range.startOffset,
    endOffset: range.endOffset,
  };
}

/**
 * The deterministic range-encoded destination id: `ch-<block>.<g|b>` /
 * `pt-<block>.<g|b>` ("b" = block start). Unique within a structure because
 * destinations tile the source; stable across devices and reloads because
 * the range is. Titles and ordinals are never identity.
 */
function destinationId(
  kind: "chapter" | "part",
  startBlock: number,
  startGrapheme?: number,
): string {
  return `${kind === "chapter" ? "ch" : "pt"}-${startBlock}.${startGrapheme === undefined ? "b" : startGrapheme}`;
}

/**
 * The canonical end of the BODY coordinate stream: the footnotes region
 * start when footnotes exist, the total otherwise (normalizeText's
 * [body, footnotes].filter(Boolean).join(SEP) semantics — no trailing
 * separator when nothing follows the body). The ONE shape for derivation
 * AND validation; a second formula here would fork the tiling contract.
 */
function bodyEndOf(
  blockStartOffsets: readonly number[],
  blockCount: number,
  totalGraphemes: number,
  hasFootnoteRows: boolean,
): number {
  return hasFootnoteRows ? (blockStartOffsets[blockCount] ?? 0) : totalGraphemes;
}

interface Segment {
  startBlock: number;
  endBlock: number; // exclusive
  startGrapheme?: number;
  endGrapheme?: number;
  startOffset: number;
  endOffset: number;
  title?: string;
  titleSource?: "publisher" | "heading";
}

/**
 * Cut a body range into destination-sized segments: block-aligned wherever
 * possible, intra-block only inside a single block that exceeds the part
 * target (the shared slicing primitive — the same legal boundaries windows
 * use). A cut never leaves a heading at the END of a part: when the natural
 * boundary falls right after a heading, the heading moves to the next part.
 */
function subdivide(
  article: CanonicalArticle,
  segment: Segment,
  index: ReturnType<typeof articleGraphemeIndex>,
): Segment[] {
  const { blockStartOffsets, perBlockLengths } = index;
  const blockCount = article.blocks.length;
  const bodyEnd = bodyEndOf(
    blockStartOffsets,
    blockCount,
    index.totalGraphemes,
    index.footnoteRows.length > 0,
  );
  // Only the BODY portion is subdivided: the footnotes region always rides
  // the segment's final piece (its canonical offsets follow the body, so its
  // coverage never breaks, and an endnote-only work stays one honest part
  // instead of nonsense zero-block cuts).
  const contentEnd = Math.min(segment.endOffset, bodyEnd);
  const length = contentEnd - segment.startOffset;
  if (length <= PART_TARGET_GRAPHEMES) return [segment];

  const partCount = Math.max(2, Math.round(length / PART_TARGET_GRAPHEMES));
  const ideal = length / partCount;

  /** Snap one raw cut offset to a legal destination boundary: a block start
   * (endGrapheme absent) or a safe intra-block cut inside a single block
   * that exceeds the part target (the shared slicing primitive). */
  const snap = (raw: number): { endBlock: number; endGrapheme?: number; endOffset: number } => {
    let blockIndex = segment.startBlock;
    for (let i = segment.startBlock; i < segment.endBlock; i++) {
      if (blockStartOffsets[i]! <= raw) blockIndex = i;
      else break;
    }
    const blockStart = blockStartOffsets[blockIndex]!;
    const blockLength = perBlockLengths[blockIndex]!;
    const within = raw - blockStart;
    if (
      within < blockLength &&
      blockLength > PART_TARGET_GRAPHEMES &&
      classifyBlock(article.blocks[blockIndex]!).kind === "split"
    ) {
      // One giant splittable block carries several parts — cut at a safe
      // intra-block boundary (the shared slicing primitive).
      const cut = blockSliceBoundary(article.blocks[blockIndex]!, within, article.lang);
      return { endBlock: blockIndex + 1, endGrapheme: cut, endOffset: blockStart + cut };
    }
    // Ordinary block (or separator region): end at a block start.
    const endBlock = within >= blockLength ? blockIndex + 1 : blockIndex;
    const endOffset = endBlock === blockCount ? bodyEnd : blockStartOffsets[endBlock]!;
    return { endBlock, endGrapheme: undefined, endOffset };
  };

  // Cut positions first, then pieces — so every boundary can be checked for
  // legality (strictly increasing offsets, body-range bounds) before any
  // piece exists. A boundary that cannot stay legal is dropped: the
  // neighboring parts absorb its range, and the structure stays valid.
  const cuts: { endBlock: number; endGrapheme?: number; endOffset: number }[] = [];
  let previousEnd = segment.startOffset;
  for (let j = 1; j < partCount; j++) {
    const raw = Math.floor(segment.startOffset + j * ideal);
    if (raw <= previousEnd || raw >= contentEnd) continue;
    const snapped = snap(raw);
    if (snapped.endOffset <= previousEnd || snapped.endOffset >= contentEnd) continue;
    // Never end a part on a heading with content still to come — move the
    // boundary above the heading so the heading opens the next part (only
    // when the retreat itself stays legal: the piece keeps positive range).
    if (
      snapped.endGrapheme === undefined &&
      article.blocks[snapped.endBlock - 1]?.kind === "heading"
    ) {
      const retreatEndBlock = snapped.endBlock - 1;
      const retreatOffset =
        retreatEndBlock === blockCount ? bodyEnd : blockStartOffsets[retreatEndBlock]!;
      if (retreatEndBlock >= segment.startBlock && retreatOffset > previousEnd) {
        cuts.push({ endBlock: retreatEndBlock, endOffset: retreatOffset });
        previousEnd = retreatOffset;
        continue;
      }
    }
    cuts.push(snapped);
    previousEnd = snapped.endOffset;
  }

  // Pieces from the legal cut list; the final piece inherits the segment's
  // true end (which may run past the body into the footnotes region — that
  // coverage is the point).
  const segments: Segment[] = [];
  let cursorBlock = segment.startBlock;
  let cursorGrapheme = segment.startGrapheme ?? 0;
  let cursorOffset = segment.startOffset;
  for (const cut of cuts) {
    segments.push({
      startBlock: cursorBlock,
      endBlock: cut.endBlock,
      startGrapheme: cursorGrapheme > 0 ? cursorGrapheme : undefined,
      endGrapheme: cut.endGrapheme,
      startOffset: cursorOffset,
      endOffset: cut.endOffset,
    });
    cursorBlock = cut.endGrapheme !== undefined ? cut.endBlock - 1 : cut.endBlock;
    cursorGrapheme = cut.endGrapheme ?? 0;
    cursorOffset = cut.endOffset;
  }
  segments.push({
    startBlock: cursorBlock,
    endBlock: segment.endBlock,
    startGrapheme: cursorGrapheme > 0 ? cursorGrapheme : undefined,
    endGrapheme: segment.endGrapheme,
    startOffset: cursorOffset,
    endOffset: segment.endOffset,
  });
  return segments;
}

/**
 * Derive the work structure from canonical content (with optional publisher
 * outline evidence). Returns undefined only for a work with no readable text
 * at all (every block zero-length and no footnote bodies) — there is nothing
 * to divide, and orientation stays silent rather than inventing structure.
 */
export function deriveWorkStructure(
  source: StructureSource,
  evidence?: OutlineEvidence,
): WorkStructure | undefined {
  const article = source as CanonicalArticle; // the index reads only the picked fields
  const index = articleGraphemeIndex(article);
  const { blockStartOffsets, totalGraphemes } = index;
  if (totalGraphemes === 0) return undefined;

  const boundaries = chapterBoundaries(article.blocks, evidence, source.provenanceTitle);
  const segments: Segment[] = [];
  if (boundaries.length === 0) {
    // No chapters: the whole work subdivides into standalone parts.
    segments.push({
      startBlock: 0,
      endBlock: article.blocks.length,
      startOffset: 0,
      endOffset: totalGraphemes,
    });
  } else {
    for (const [i, boundary] of boundaries.entries()) {
      const next = boundaries[i + 1];
      segments.push({
        startBlock: boundary.blockIndex,
        endBlock: next ? next.blockIndex : article.blocks.length,
        startOffset: blockStartOffsets[boundary.blockIndex]!,
        endOffset: next ? blockStartOffsets[next.blockIndex]! : totalGraphemes,
        title: boundary.title,
        titleSource: boundary.titleSource,
      });
    }
    // The first destination owns the work's leading text: it starts at
    // offset 0 even when the first chapter heading sits deeper in.
    segments[0]!.startBlock = 0;
    segments[0]!.startGrapheme = undefined;
    segments[0]!.startOffset = 0;
  }

  const destinations: StructureDestination[] = [];
  for (const segment of segments) {
    const pieces = subdivide(article, segment, index);
    if (segment.title === undefined) {
      // Chapterless: the work's parts stand alone (no invented parent).
      let partNumber = 0;
      for (const piece of pieces) {
        partNumber += 1;
        destinations.push(toDestination("part", `Part ${partNumber}`, "generated", piece));
      }
      continue;
    }
    const chapter = toDestination("chapter", segment.title, segment.titleSource!, segment);
    destinations.push(chapter);
    if (pieces.length > 1) {
      let partNumber = 0;
      for (const piece of pieces) {
        partNumber += 1;
        destinations.push(
          toDestination("part", `Part ${partNumber}`, "generated", piece, chapter.id),
        );
      }
    }
  }

  return WorkStructureSchema.parse({
    schemaVersion: WORK_STRUCTURE_SCHEMA_VERSION,
    generatorVersion: STRUCTURE_GENERATOR_VERSION,
    revision: source.revision,
    destinations,
  });
}

/**
 * Validate a candidate structure (a persisted snapshot, an imported one, or
 * a freshly derived one) against the article's canonical content. Returns
 * the parsed structure, or null when ANY of these fail:
 *   - schema shape / version;
 *   - revision mismatch with the row;
 *   - the destinations do not tile the canonical coordinate stream exactly
 *     (gap, overlap, out-of-order, out-of-bounds, wrong block mapping);
 *   - the last destination does not end at the work's totalGraphemes
 *     (footnote bodies and trailing text stay covered);
 *   - chapter/part relations are malformed (unknown parent, part outside its
 *     chapter, a generated part claiming a chapter title source, duplicate
 *     ids).
 *
 * A partial or invalid snapshot is never a valid replacement for local
 * structure — callers fall back to derivation.
 */
export function validateWorkStructure(
  article: CanonicalArticle,
  candidate: unknown,
): WorkStructure | null {
  const parsed = WorkStructureSchema.safeParse(candidate);
  if (!parsed.success) return null;
  const structure = parsed.data;
  if (structure.revision !== article.revision) return null;

  const index = articleGraphemeIndex(article);
  const { blockStartOffsets, perBlockLengths, totalGraphemes } = index;
  const blockCount = article.blocks.length;
  // The canonical end of the BODY stream — the ONE shared shape (the same
  // formula derivation cuts against).
  const bodyEnd = bodyEndOf(
    blockStartOffsets,
    blockCount,
    totalGraphemes,
    index.footnoteRows.length > 0,
  );
  const destinations = structure.destinations;
  const seenIds = new Set<string>();
  const byId = new Map<string, StructureDestination>();

  const checkRange = (d: StructureDestination, expectedEnd?: number): boolean => {
    // Block-field bounds.
    if (d.startBlock >= blockCount || d.endBlock > blockCount || d.startBlock >= d.endBlock)
      return false;
    const startLength = perBlockLengths[d.startBlock]!;
    if (d.startGrapheme !== undefined && d.startGrapheme >= startLength) return false;
    if (d.endGrapheme !== undefined) {
      if (d.endBlock - 1 < d.startBlock) return false;
      if (d.endGrapheme > perBlockLengths[d.endBlock - 1]!) return false;
    }
    // Canonical-offset consistency with the block fields.
    const startExpected = blockStartOffsets[d.startBlock]! + (d.startGrapheme ?? 0);
    if (d.startOffset !== startExpected) return false;
    const endExpected =
      d.endGrapheme !== undefined
        ? blockStartOffsets[d.endBlock - 1]! + d.endGrapheme
        : d.endBlock === blockCount
          ? bodyEnd
          : blockStartOffsets[d.endBlock]!;
    if (expectedEnd !== undefined) {
      // Only the final chapter/leaf extends past the body into footnotes.
      // It must still cover the complete body, not merely claim the work's
      // total offset while its block fields omit trailing content.
      if (d.endBlock !== blockCount || d.endGrapheme !== undefined) return false;
      if (d.endOffset !== expectedEnd) return false;
    } else if (d.endOffset !== endExpected) {
      return false;
    }
    return d.endOffset > d.startOffset;
  };

  for (const d of destinations) {
    if (seenIds.has(d.id)) return null;
    seenIds.add(d.id);
    byId.set(d.id, d);

    // Chapter/part honesty rules.
    if (d.kind === "chapter") {
      if (d.titleSource === "generated" || d.parentChapterId !== undefined) return null;
    } else {
      if (d.titleSource !== "generated") return null;
      if (d.parentChapterId !== undefined) {
        const parent = byId.get(d.parentChapterId);
        if (parent === undefined || parent.kind !== "chapter") return null;
      } else if (destinations.some((x) => x.kind === "chapter")) {
        // A work-level part is legal only when the structure has NO chapters
        // at all (a headingless work's parts stand alone).
        return null;
      }
    }
  }

  // Tiling per level: chapters tile the work; each chapter's parts tile the
  // chapter's range; work-level parts tile the whole range. Leaves (parts,
  // or chapters without parts) must cover every canonical grapheme exactly
  // once — leading text, zero-text visual blocks, separators, and footnote
  // bodies stay covered, nothing overlaps.
  const leaves: StructureDestination[] = [];
  const chapters = destinations.filter((d) => d.kind === "chapter");
  if (chapters.length === 0) {
    const parts = siblingParts(structure, undefined);
    let cursor = 0;
    for (const part of parts) {
      if (!checkRange(part, part === parts.at(-1) ? totalGraphemes : undefined)) return null;
      if (part.startOffset !== cursor) return null;
      cursor = part.endOffset;
      leaves.push(part);
    }
    if (parts.length === 0) return null;
  } else {
    let cursor = 0;
    for (const [i, chapter] of chapters.entries()) {
      const chapterEnd = i === chapters.length - 1 ? totalGraphemes : undefined;
      if (!checkRange(chapter, chapterEnd)) return null;
      if (chapter.startOffset !== cursor) return null;
      cursor = chapter.endOffset;
      const parts = siblingParts(structure, chapter.id);
      // The work's FINAL leaf (the last part of the last chapter, or the
      // last chapter itself) runs to totalGraphemes — the footnotes region
      // rides it, so the block-formula end (the body end) must not be
      // demanded of it. Same rule as the chapterless branch below.
      const isLastChapter = i === chapters.length - 1;
      if (parts.length === 0) {
        leaves.push(chapter);
      } else {
        let partCursor = chapter.startOffset;
        for (const [j, part] of parts.entries()) {
          const isFinalLeaf = isLastChapter && j === parts.length - 1;
          if (!checkRange(part, isFinalLeaf ? totalGraphemes : undefined)) return null;
          if (part.startOffset !== partCursor) return null;
          if (part.endOffset > chapter.endOffset) return null;
          partCursor = part.endOffset;
          leaves.push(part);
        }
        // The parts must cover the chapter exactly (a chapter with parts is
        // not itself a leaf — its range is the union of its parts).
        if (partCursor !== chapter.endOffset) return null;
      }
    }
  }
  if (leaves.length === 0 || leaves[0]!.startOffset !== 0) return null;
  if (leaves.at(-1)!.endOffset !== totalGraphemes) return null;
  return structure;
}

/** One resolved chapter/part orientation for a canonical offset. */
export interface WorkPosition {
  /** The destination whose range contains the offset. */
  destination: StructureDestination;
  /** The containing chapter when the destination is (or sits under) one. */
  chapter?: StructureDestination;
  /** 1-based ordinals. Parts number within their chapter (or across the
   * work when chapterless); chapters number across the work. */
  chapterOrdinal?: number;
  chapterTotal?: number;
  partOrdinal?: number;
  partTotal?: number;
}

/**
 * The parts carved out of `parentChapterId` (undefined = work-level parts —
 * legal only in a chapterless structure). The ONE parent-lookup shape:
 * validation's tiling checks, the leaf enumeration, and offset resolution
 * all read it, so no second filter can drift.
 */
function siblingParts(
  structure: WorkStructure,
  parentChapterId: string | undefined,
): StructureDestination[] {
  return structure.destinations.filter(
    (d) => d.kind === "part" && d.parentChapterId === parentChapterId,
  );
}

/**
 * The LEAF destinations — the ranges a reader actually moves through: a
 * chapter's generated parts when it has them, the chapter itself otherwise;
 * work-level parts when the structure has no chapters. Leaves tile the
 * canonical coordinate stream exactly once (guaranteed by validation).
 */
export function structureLeaves(structure: WorkStructure): StructureDestination[] {
  const chapters = structure.destinations.filter((d) => d.kind === "chapter");
  if (chapters.length === 0) return siblingParts(structure, undefined);
  const leaves: StructureDestination[] = [];
  for (const chapter of chapters) {
    const parts = siblingParts(structure, chapter.id);
    if (parts.length === 0) leaves.push(chapter);
    else leaves.push(...parts);
  }
  return leaves;
}

/**
 * Resolve a canonical D-05 offset to its chapter/reading part. Assumes a
 * VALIDATED structure (validateWorkStructure) — tiling makes the lookup a
 * binary search over the leaves' startOffsets. Offsets clamp into
 * [0, totalGraphemes), so footnote-region and end-pin offsets resolve to
 * the final leaf.
 */
export function resolveWorkPosition(
  article: CanonicalArticle,
  structure: WorkStructure,
  offset: number,
): WorkPosition | null {
  const total = articleGraphemeIndex(article).totalGraphemes;
  const leaves = structureLeaves(structure);
  if (leaves.length === 0) return null;
  const clamped = Math.max(0, Math.min(offset, Math.max(0, total - 1)));
  let low = 0;
  let high = leaves.length - 1;
  let found = leaves[0]!;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const d = leaves[mid]!;
    if (clamped < d.startOffset) high = mid - 1;
    else if (clamped >= d.endOffset) low = mid + 1;
    else {
      found = d;
      break;
    }
  }

  const chapters = structure.destinations.filter((d) => d.kind === "chapter");
  if (found.kind === "chapter") {
    return {
      destination: found,
      chapter: found,
      chapterOrdinal: chapters.indexOf(found) + 1,
      chapterTotal: chapters.length,
    };
  }
  const siblings = siblingParts(structure, found.parentChapterId);
  const chapter = found.parentChapterId
    ? structure.destinations.find((d) => d.id === found.parentChapterId)
    : undefined;
  return {
    destination: found,
    chapter,
    chapterOrdinal: chapter ? chapters.indexOf(chapter) + 1 : undefined,
    chapterTotal: chapters.length > 0 ? chapters.length : undefined,
    partOrdinal: siblings.indexOf(found) + 1,
    partTotal: siblings.length,
  };
}

/**
 * The visible orientation label for a resolved position — "Chapter 4 of 12 ·
 * Part 2 of 3". Empty for a single-destination structure: spare-chrome
 * silence (a one-part work with no chapters has nothing to orient).
 */
export function formatOrientationLabel(position: WorkPosition | null): string {
  if (position === null) return "";
  // A single-chapter work: the chapter carries no information beyond the
  // title the reader already sees — ordinal "Chapter 1 of 1" stays silent.
  const pieces: string[] = [];
  if (position.chapterOrdinal !== undefined && (position.chapterTotal ?? 1) > 1) {
    pieces.push(`Chapter ${position.chapterOrdinal} of ${position.chapterTotal}`);
  }
  if (position.partOrdinal !== undefined && (position.partTotal ?? 1) > 1) {
    pieces.push(`Part ${position.partOrdinal} of ${position.partTotal}`);
  }
  return pieces.join(" · ");
}
