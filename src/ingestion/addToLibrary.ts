// src/ingestion/addToLibrary.ts
// Issue #4 — the addToLibrary() policy service: ingest → dedupe-refuse →
// atomic save (article or book path) → navigation-ready outcome. The add
// dialog previously inlined this policy three times (url/paste, epub, and
// file submission arms) with the asset/book attribution logic beside it;
// this module is now the ONE home. The dialog keeps form chrome, size
// validation, and calm refusal copy, and calls the service once per
// submission arm.
//
// Contracts (carried verbatim from the dialog this was extracted from):
//   - D7-07 dedupe-refuse: has()/hasBook() BEFORE save/saveBook. Ids are
//     content-derived (slug or content hash), so identical input re-adds
//     refuse instead of overwriting (no orphaned highlights/notes).
//   - D16-09 refusal-only: a duplicate is refused as
//     `{outcome: "refused", reason: "already-in-library"}` — never
//     overwritten, never silently re-saved.
//   - D20-04/D20-15 atomic save: the article AND its validated envelope
//     assets ride ONE save call (LibrarySource.save's atomic upsert /
//     booksStore.saveBook's one transaction) — a saved item is always
//     complete.
//   - The outcome union (saved-article / saved-book / refused) is the
//     whole policy surface: the service NEVER throws for policy reasons.
//     An IngestionError passes its typed reason through; any other throw
//     (file read, JSON parse, ZodError, unexpected client bug) surfaces
//     as the server-error catch-all, exactly like the dialog's old
//     catch blocks.
//
// Threat register:
//   - T-16-04 (dedupe-refuse regression) → the single saveArticle/
//     saveBook sequence keeps has()/hasBook() strictly before save.
//   - Transport re-validation is NOT relaxed by this move: ingest* (the
//     IngestionClient pipeline) still re-validates the response at the
//     network boundary before any result reaches this module.
import {
  browserPreferredLanguages,
  ingestUrl,
  ingestHtml,
  ingestMarkdown,
  ingestPdf,
  ingestEpub,
  ingestPastedTranscript,
  IngestionError,
  type IngestionSuccess,
  type ValidatedAsset,
} from "./IngestionClient";
import { extractYouTubeVideoId } from "./youtube";
import { dexieLibrarySource } from "./LibrarySource";
import { hasBook, saveBook } from "../persistence/booksStore";
import type { BookAsset } from "../persistence/booksStore";
import { bytesToBase64 } from "./ingestCopy";
import type { IngestionFailureReason } from "./types";
import type { Block } from "../content/types";

/**
 * AddToLibraryInput — one submission arm of the add dialog. The file arm
 * carries the picked File whole: the service owns the extension dispatch
 * and the read/base64 encoding (the DIALOG still owns the size-cap
 * refusal BEFORE any read — T-16-05 earliest-enforcement stays upstream
 * of this module).
 */
export type AddToLibraryInput =
  | { kind: "url"; url: string }
  | { kind: "paste"; html: string }
  | { kind: "file"; file: File }
  // The youtube-bot-check fallback — the reader pasted the transcript text
  // from YouTube's transcript panel; `title` is the reader-provided name
  // (required — the dialog refuses an empty one, so ingest never fabricates
  // a neutral title) and `url` is the refused video's URL (provenance +
  // the yt-<hash> identity, never re-fetched).
  | { kind: "transcript-paste"; text: string; title: string; url?: string };

/**
 * AddToLibraryOutcome — the navigation-ready result of one submission.
 * - `saved-article` → the caller closes and navigates to the reader
 *   (`articleId` is the hash anchor).
 * - `saved-book` → the caller closes, refreshes the library, and can
 *   surface the D12-11 skip disclosure from `skippedChapterCount`.
 * - `refused` → the caller stays open and renders the calm DOC-06 phrase
 *   via mapReasonToCopy(reason); `already-in-library` is the D7-07
 *   dedupe-refuse (D16-09 refusal-only — no save ever happened).
 */
export type AddToLibraryOutcome =
  | { outcome: "saved-article"; articleId: string }
  | { outcome: "saved-book"; bookId: string; skippedChapterCount: number }
  | { outcome: "refused"; reason: IngestionFailureReason };

/**
 * assetRefBodiesInBlocks — collect the `asset:img-<12hex>` reference BODIES
 * (the scheme-stripped assetIds) from every figure in a block tree,
 * recursing through containers (blockquote children + list item content —
 * figures nest per the assetStage rewrite recursion). Phase 20 (20-04
 * Task 1): the book arm attributes envelope assets to their OWNING chapter
 * articles by walking each chapter's blocks — the envelope itself carries
 * no articleId, so the model's refs are the only attribution source
 * (D20-15 article-owned rows).
 */
export function assetRefBodiesInBlocks(blocks: readonly Block[]): string[] {
  const ids: string[] = [];
  const visit = (nodes: readonly Block[]) => {
    for (const block of nodes) {
      if (block.kind === "figure") {
        if (block.src !== undefined && block.src.startsWith("asset:")) {
          ids.push(block.src.slice("asset:".length));
        }
      } else if (block.kind === "blockquote") {
        visit(block.children);
      } else if (block.kind === "bulleted-list" || block.kind === "numbered-list") {
        for (const item of block.items) {
          visit(item.content);
        }
      }
    }
  };
  visit(blocks);
  return ids;
}

/**
 * bookAssetsForChapters — attribute validated envelope assets to chapter
 * articles, producing the flat BookAsset list saveBook persists (the
 * 20-03 contract). An asset referenced by TWO chapters produces TWO rows
 * (the [articleId+assetId] compound key makes rows article-owned — D20-15);
 * an envelope asset no chapter references is dropped (the attribution is
 * model-driven, never envelope-driven).
 */
export function bookAssetsForChapters(
  chapters: readonly { id: string; blocks: readonly Block[] }[],
  assets: readonly ValidatedAsset[],
): BookAsset[] {
  const byId = new Map(assets.map((asset) => [asset.assetId, asset]));
  const out: BookAsset[] = [];
  for (const chapter of chapters) {
    for (const assetId of new Set(assetRefBodiesInBlocks(chapter.blocks))) {
      const asset = byId.get(assetId);
      if (asset) {
        out.push({ articleId: chapter.id, ...asset });
      }
    }
  }
  return out;
}

/**
 * cleanTagsForSave — the one input-sanitizing seam for the optional tags
 * riding an addToLibrary call (issue #75, decision #71): trim, drop
 * empties (mirrors the `z.string().min(1)` schema constraint — a stray
 * empty string would produce an invalid row the next read drops, the
 * setArticleTags discipline), and dedupe exact matches. The TagPicker
 * already routes case-insensitive duplicates to the stored casing; this
 * seam only keeps a hand-rolled caller honest.
 */
function cleanTagsForSave(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const tag of tags) {
    const trimmed = tag.trim();
    if (trimmed.length > 0) seen.add(trimmed);
  }
  return [...seen];
}

/**
 * withTags — returns the record carrying the cleaned tags when any exist,
 * else the record untouched (an empty tag list must not introduce a field
 * the ingest result didn't have — the additive `.default([])` hydration
 * makes both shapes valid, but the untouched pass-through is the honest
 * no-op).
 */
function withTags<T extends { tags?: string[] }>(
  record: T,
  tags: readonly string[],
): T {
  const cleaned = cleanTagsForSave(tags);
  return cleaned.length > 0 ? { ...record, tags: cleaned } : record;
}

/**
 * addToLibrary — the ONE ingest-and-persist policy. One call per dialog
 * submission arm; never throws for policy reasons (see AddToLibraryOutcome).
 *
 * Issue #75 (decision #71) — the optional `tags` apply to the SAVED record
 * (article or book) in the same atomic save; empty/absent saves exactly as
 * before. Tags never influence dedupe-refusal (D7-07 stays identity-only).
 */
export async function addToLibrary(
  input: AddToLibraryInput,
  tags: readonly string[] = [],
): Promise<AddToLibraryOutcome> {
  try {
    if (input.kind === "file" && /\.epub$/i.test(input.file.name)) {
      return await addEpubBook(input.file, tags);
    }
    return await saveArticle(await ingestArticleInput(input), tags);
  } catch (e) {
    return {
      outcome: "refused",
      reason: e instanceof IngestionError ? e.reason : "server-error",
    };
  }
}

/**
 * ingestArticleInput — the single-article ingest dispatch: url / paste /
 * picked file (`.md` → ingestMarkdown, filename forwarded ONLY as the
 * D8-17 title hint; `.pdf` → chunked base64 → ingestPdf; else →
 * ingestHtml, title derived from content metadata).
 */
async function ingestArticleInput(input: AddToLibraryInput): Promise<IngestionSuccess> {
  if (input.kind === "url") {
    // Issue #59 (decisions #56/#57) — the reader's ordered browser languages
    // ride ONLY the YouTube-URL branch (the server's caption track
    // selection); an ordinary article URL keeps the byte-identical {url}
    // body (extractYouTubeVideoId is the same dispatcher the server runs —
    // no fork, and the branch is request-free).
    return extractYouTubeVideoId(input.url) !== null
      ? ingestUrl(input.url, browserPreferredLanguages())
      : ingestUrl(input.url);
  }
  if (input.kind === "paste") return ingestHtml(input.html);
  if (input.kind === "transcript-paste") {
    return ingestPastedTranscript(input.text, input.title, input.url);
  }
  const { file } = input;
  if (/\.md$/i.test(file.name)) {
    return ingestMarkdown(await file.text(), file.name);
  }
  if (/\.pdf$/i.test(file.name)) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return ingestPdf(bytesToBase64(bytes), file.name);
  }
  return ingestHtml(await file.text());
}

/**
 * saveArticle — the D7-07 dedupe-refuse + D20-04 atomic article save, the
 * ONE home of the policy the three article arms used to repeat. The
 * optional tags ride the SAME atomic save (issue #75, decision #71) — a
 * saved article is always complete, tags included.
 */
async function saveArticle(
  result: IngestionSuccess,
  tags: readonly string[],
): Promise<AddToLibraryOutcome> {
  if (await dexieLibrarySource.has(result.article.id)) {
    return { outcome: "refused", reason: "already-in-library" };
  }
  await dexieLibrarySource.save(
    withTags(result.article, tags),
    result.assets,
  );
  return { outcome: "saved-article", articleId: result.article.id };
}

/**
 * addEpubBook — the book path: binary read → chunked base64 → ingestEpub;
 * book-level dedupe-refuse (hasBook BEFORE saveBook — re-uploading
 * identical bytes produces the same content-hash book id); ONE
 * saveBook transaction with the per-chapter asset attribution. The
 * optional tags ride the same transaction on the BOOK record (D12-04 —
 * book tags, never per-chapter; issue #75, decision #71).
 */
async function addEpubBook(
  file: File,
  tags: readonly string[],
): Promise<AddToLibraryOutcome> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await ingestEpub(bytesToBase64(bytes), file.name);

  if (await hasBook(result.book.id)) {
    return { outcome: "refused", reason: "already-in-library" };
  }

  await saveBook(
    withTags(result.book, tags),
    result.articles,
    bookAssetsForChapters(result.articles, result.assets),
  );
  return {
    outcome: "saved-book",
    bookId: result.book.id,
    skippedChapterCount: result.skippedCount,
  };
}
