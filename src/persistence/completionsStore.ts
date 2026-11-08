// src/persistence/completionsStore.ts
// Issue #246 — the persistence seam for shared work/chapter completion.
// Mirrors the collectionsStore seam conventions: header citing the locked
// decisions, Zod-at-boundary on every read, classifyStorageError routing
// (loadAllCompletions never throws — the fail-quiet fold), typed writes
// that throw so the caller's honest save-error state can surface them.
//
// Contracts (issue #246 acceptance criteria):
//   1. ONE record per READING TARGET (ADR 0011 — collections reference
//      rather than own, so completion lives on the target, never on a
//      membership): the primary key is the COMPUTED completionTargetKey
//      (content/completion.ts — the same normalization that makes a
//      book-chapter target and its chapter article ONE reading), so a
//      correction through any surface is one truth everywhere and it
//      propagates to every collection referencing the target without a
//      membership walk.
//   2. Upsert, never history (issue #246 AC — "do not introduce …
//      completion history"): recordCompletion REPLACES the target's row —
//      the newest reading signal or reader correction IS the state. The
//      canonical location store is unreachable from this seam (ADR 0001 —
//      a correction never erases or moves the saved passage position).
//   3. Zod-at-boundary on read (STATE-04): every row passes
//      CompletionRecordSchema.safeParse AND its carried targetKey must
//      equal its computed identity (a tampered key is exactly the
//      masquerade the boundary exists for). Corrupt rows are dropped
//      calmly on the list read and surfaced as null on the single get.
//   4. Deleted-work cleanup mirrors the #245 reference strip:
//      removeCompletionsForDeletedWork deletes exactly the deleted work's
//      rows INSIDE the caller's deletion transaction, so content deletion
//      and completion cleanup commit or roll back together — no orphaned
//      completion rows outliving their readings.
//
// Threat register:
//   - T-246a (Tampering, corrupt persisted completion rows) → safeParse +
//      identity verification per row on every read; corrupt rows are
//      dropped, never coerced, never written onto (recordCompletion's
//      upsert simply overwrites the row the next time that target is
//      recorded — cleanup through the honest write path).
import { db } from "./db";
import { CompletionRecordSchema } from "../content/schema";
import type { CollectionEntryTarget, CompletionRecord } from "../content/schema";
import { completionTargetKey } from "../content/completion";
import type { DeletedWork } from "./collectionReferenceCleanup";

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * loadAllCompletions — load every completion row, validated at the boundary
 * (contract 3), for the snapshot's fold. Never throws: a Dexie-level
 * failure returns [] (the fail-quiet fold discipline — completion drives
 * display, and a read failure must not blank the surfaces that also render
 * without it). Corrupt rows are dropped silently, never coerced.
 */
export async function loadAllCompletions(): Promise<CompletionRecord[]> {
  try {
    const rows = await db.completions.toArray();
    const valid: CompletionRecord[] = [];
    for (const row of rows) {
      const parsed = CompletionRecordSchema.safeParse(row);
      if (!parsed.success) continue; // STATE-04: never coerce
      if (parsed.data.targetKey !== completionTargetKey(parsed.data.target)) continue; // T-246a
      valid.push(parsed.data);
    }
    return valid;
  } catch {
    return [];
  }
}

/**
 * getCompletion — one target's completion record, or null when absent OR
 * corrupt (the safeParse-on-read + identity-verification discipline — a
 * tampered row must never masquerade as completion truth). Propagates
 * Dexie-level failures (the single-get contract: callers that pre-fold use
 * loadAllCompletions; a direct get failing is a storage failure).
 */
export async function getCompletion(
  target: CollectionEntryTarget,
): Promise<CompletionRecord | null> {
  const key = completionTargetKey(target);
  const row = await db.completions.get(key);
  if (!row) return null;
  const parsed = CompletionRecordSchema.safeParse(row);
  if (!parsed.success) return null;
  if (parsed.data.targetKey !== completionTargetKey(parsed.data.target)) return null; // T-246a
  return parsed.data;
}

/**
 * recordCompletion — persist ONE target's completion state (contract 2).
 * The upsert is keyed by the computed identity, so a book-chapter-shaped
 * target and its article-shaped twin write the SAME row. Storage failures
 * propagate to the caller's honest save-error state (the collection
 * control's visible retry; the reader's calm announcement).
 */
export async function recordCompletion(
  target: CollectionEntryTarget,
  finished: boolean,
  source: "reading" | "reader",
): Promise<CompletionRecord> {
  const record: CompletionRecord = {
    schemaVersion: 1,
    targetKey: completionTargetKey(target),
    target,
    finished,
    source,
    updatedAt: nowIso(),
  };
  await db.completions.put(record);
  return record;
}

/**
 * removeCompletionsForDeletedWork — strip every completion row belonging to
 * a deleted library work (contract 4). MUST be called inside the content
 * deletion's own rw transaction with db.completions listed (the
 * removeReferencesToDeletedWork discipline — the cleanup commits or rolls
 * back WITH the content deletion). An ARTICLE deletion removes the article
 * key and its work-chapter keys; a BOOK deletion removes the book key and
 * every declared chapter's article key. Rows are addressed by key — no
 * read-validate-write of rows this deletion does not own.
 */
export async function removeCompletionsForDeletedWork(deleted: DeletedWork): Promise<void> {
  if (deleted.kind === "article") {
    await db.completions.delete(
      completionTargetKey({ kind: "article", articleId: deleted.articleId }),
    );
    // Work-chapter rows carry the articleId inside the computed key —
    // scan the (small) table for the deleted work's chapter targets.
    const rows = await db.completions.toArray();
    for (const row of rows) {
      if (row.target.kind === "work-chapter" && row.target.articleId === deleted.articleId) {
        await db.completions.delete(row.targetKey);
      }
    }
    return;
  }
  const keys = [
    completionTargetKey({ kind: "book", bookId: deleted.bookId }),
    ...deleted.chapterArticleIds.map((articleId) =>
      completionTargetKey({ kind: "article", articleId }),
    ),
  ];
  await db.completions.bulkDelete(keys);
}
