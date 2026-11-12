import { z } from "zod";
import {
  ArticleSchema,
  type CanonicalArticle,
  type CollectionEntryTarget,
} from "../content/schema";
import { deriveWorkStructure } from "../content/structure";
import { db } from "./db";

const StoredArticle = ArticleSchema.passthrough();
const Backup = z.object({ article: StoredArticle, appliedArticle: z.string() });

export type RepairConsequence =
  | { kind: "completion"; id: string; label: string }
  | { kind: "collection-entry"; collectionId: string; entryId: string; label: string };

export interface PdfRepairPreview {
  articleId: string;
  /** Snapshot identity: never apply a preview against a newer work. */
  original: string;
  proposed: CanonicalArticle;
  changes: { blockIndex: number; before: string; after: string }[];
  consequences: RepairConsequence[];
}

/** No writes. The candidate comes from explicitly processing the original PDF
 * with the current ingestion adapter, never from length-based demotion. The
 * repair changes classification only: raw runs, order, language, footnotes,
 * and all D-05 coordinates remain identical. Revision stays unchanged because
 * this operation changes structure, not the content coordinate substrate. */
export async function previewPdfRepair(
  articleId: string,
  candidate: CanonicalArticle,
): Promise<PdfRepairPreview> {
  const row = await db.articles.get(articleId);
  const article = ArticleSchema.parse(row);
  const corrected = ArticleSchema.parse(candidate);
  if (article.provenance.originalHtmlHash !== corrected.provenance.originalHtmlHash) {
    throw new Error(
      "Choose the original PDF. Its source fingerprint does not match this saved work.",
    );
  }
  if (
    article.lang !== corrected.lang ||
    JSON.stringify(article.footnotes) !== JSON.stringify(corrected.footnotes) ||
    article.blocks.length !== corrected.blocks.length
  ) {
    throw new Error(
      "The extracted text boundaries have changed. This repair cannot map them reliably; nothing was changed.",
    );
  }
  const changes: PdfRepairPreview["changes"] = [];
  const blocks = article.blocks.map((block, blockIndex) => {
    const next = corrected.blocks[blockIndex]!;
    if (
      (block.kind === "heading" || block.kind === "paragraph") &&
      (next.kind === "heading" || next.kind === "paragraph") &&
      JSON.stringify(block.content) === JSON.stringify(next.content)
    ) {
      if (
        block.kind !== next.kind ||
        (block.kind === "heading" && next.kind === "heading" && block.level !== next.level)
      ) {
        changes.push({ blockIndex, before: block.kind, after: next.kind });
      }
      return next.kind === "heading"
        ? { ...block, kind: "heading" as const, level: next.level }
        : { kind: "paragraph" as const, content: block.content };
    }
    if (JSON.stringify(block) !== JSON.stringify(next)) {
      throw new Error(
        "The extracted text has changed. Annotation correspondence cannot be guaranteed; nothing was changed.",
      );
    }
    return block;
  });
  const proposed = ArticleSchema.parse({ ...article, blocks, structure: undefined });
  proposed.structure = deriveWorkStructure({
    ...proposed,
    provenanceTitle: proposed.provenance.title,
  });
  const oldStructure =
    article.structure ??
    deriveWorkStructure({ ...article, provenanceTitle: article.provenance.title });
  const reliableChapter = (target: CollectionEntryTarget): boolean => {
    if (target.kind !== "work-chapter" || target.articleId !== articleId) return true;
    const before = oldStructure?.destinations.find(
      (d) => d.id === target.destinationId && d.kind === "chapter",
    );
    const after = proposed.structure?.destinations.find(
      (d) => d.id === target.destinationId && d.kind === "chapter",
    );
    return (
      before !== undefined &&
      after !== undefined &&
      JSON.stringify(before) === JSON.stringify(after)
    );
  };
  const consequences: RepairConsequence[] = [];
  for (const completion of await db.completions.toArray()) {
    if (!reliableChapter(completion.target))
      consequences.push({
        kind: "completion",
        id: completion.targetKey,
        label: `Remove ${completion.finished ? "finished" : "unfinished"} status for chapter ${completion.target.kind === "work-chapter" ? completion.target.destinationId : ""}.`,
      });
  }
  for (const collection of await db.collections.toArray()) {
    for (const entry of collection.entries) {
      if (!reliableChapter(entry.target))
        consequences.push({
          kind: "collection-entry",
          collectionId: collection.id,
          entryId: entry.id,
          label: `Remove chapter entry ${entry.id} from “${collection.name}”; it cannot be redirected to a different chapter.`,
        });
    }
  }
  return { articleId, original: JSON.stringify(row), proposed, changes, consequences };
}

/** Apply and snapshot are a single IndexedDB transaction. A pending recovery
 * version must be recovered before another repair can replace it. */
export async function applyPdfRepair(preview: PdfRepairPreview): Promise<void> {
  await db.transaction(
    "rw",
    [db.articles, db.pdfRepairs, db.completions, db.collections],
    async () => {
      const row = await db.articles.get(preview.articleId);
      if (JSON.stringify(row) !== preview.original)
        throw new Error("This work changed after the preview. Preview it again before applying.");
      if (await db.pdfRepairs.get(preview.articleId))
        throw new Error(
          "A recovery version already exists. Recover it before applying another repair.",
        );
      const fresh = await previewPdfRepair(preview.articleId, preview.proposed);
      if (JSON.stringify(fresh.proposed) !== JSON.stringify(preview.proposed))
        throw new Error("The repair preview is no longer valid.");
      if (fresh.consequences.length > 0)
        throw new Error(
          "Explicit acceptance is required for the disclosed chapter consequences; nothing was changed.",
        );
      if (fresh.changes.length === 0)
        throw new Error("No heading changes were found; nothing was changed.");
      const repaired = {
        ...row!,
        blocks: fresh.proposed.blocks,
        structure: fresh.proposed.structure,
      };
      await db.pdfRepairs.put({
        articleId: preview.articleId,
        value: { article: row, appliedArticle: JSON.stringify(repaired) },
      });
      await db.articles.put(repaired);
    },
  );
}

export async function hasPdfRepairRecovery(articleId: string): Promise<boolean> {
  return (await db.pdfRepairs.get(articleId)) !== undefined;
}

/** Recovery refuses to overwrite later content or metadata edits. Positions,
 * highlights and notes are never rewritten by classification-only repair. */
export async function recoverPdfRepair(articleId: string): Promise<void> {
  await db.transaction("rw", [db.articles, db.pdfRepairs], async () => {
    const record = await db.pdfRepairs.get(articleId);
    if (!record) throw new Error("No recovery version is available for this work.");
    const backup = Backup.parse(record.value);
    if (JSON.stringify(await db.articles.get(articleId)) !== backup.appliedArticle)
      throw new Error(
        "This work was edited after repair. Recovery cannot safely overwrite those edits.",
      );
    await db.articles.put(backup.article);
    await db.pdfRepairs.delete(articleId);
  });
}
