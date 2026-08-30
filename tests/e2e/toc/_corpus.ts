// tests/e2e/toc/_corpus.ts
// Phase 18 Plan 18-04 Task 1 — the seeded TOC corpus (RESEARCH §Validation
// Architecture Wave 0: "NO fixture today contains h4/h5/h6, skips, or
// duplicates"). Four corpus shapes the shipped fixture set cannot prove:
//
//   (a) SKIP_ARTICLE     — an h2→h4 skip (skipped level 3; D18-10)
//   (b) DUPLICATE_ARTICLE— two IDENTICAL heading texts (D18-11)
//   (c) DEEP_ARTICLE     — h5 and h6 headings present (ORNT-04 level honesty)
//   (d) CHAPTER_ARTICLE  — one EPUB chapter row with the denormalized
//                          top-level bookId (D18-14 — chapters ARE articles)
//
// Seeding discipline (T-18-10 mitigation — the reading-views.spec.ts
// seedArticleRows shape, L506-535): every row is built through
// ArticleSchema.parse in Node (the SAME validation production reads run —
// malformed rows can never cross into browser storage), then written via a
// RAW IndexedDB put into the articles store. Chapter rows carry BOTH
// ingestionMeta.bookId AND the denormalized top-level bookId (the
// booksStore.saveBook write shape — the 12-03 v5 index contract).
//
// NEVER deleteDatabase — the corpus helper only PUTS rows (the caller's
// harness owns clearing; the prepareFreshPage clear-rows discipline).
//
// This file is a helper (leading underscore), not a spec — Playwright's
// default testMatch ignores it (the _edge-invariant.ts pattern).
import type { Page } from "@playwright/test";
import { ArticleSchema } from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/types";

// ── Block builders (the toc-navigation.spec.ts shapes, level-widened) ────────

const para = (text: string) => ({ kind: "paragraph", content: [{ text, marks: [] }] });

const heading = (level: 2 | 3 | 4 | 5 | 6, text: string) => ({
  kind: "heading",
  level,
  content: [{ text, marks: [] }],
});

/** Filler long enough that each corpus article demands real scrolling (the
 *  scrolling surface has scroll room past the first viewport) AND derives
 *  multiple pages in paginated mode — every jump assertion is a genuine
 *  location change in BOTH modes. Distinctive per-article prose keeps
 *  hasText filters unambiguous across the corpus. */
const filler = (articleTag: string, n: number) =>
  para(
    `${articleTag} filler paragraph ${n} carries enough distinctive prose to ` +
      `fill the reading surface comfortably in either mode, so every section ` +
      `destination sits well below the opening viewport and a TOC jump moves ` +
      `the reader's logical location for real — in scrolling mode through ` +
      `window scroll and in paginated mode through a page turn. The prose is ` +
      `unique to this corpus article so text-based locators never cross-match.`,
  );

const base = (id: string, title: string) => ({
  id,
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: `https://example.org/${id}`,
    title,
    author: "TOC Corpus",
    retrievedAt: "2026-08-30T00:00:00.000Z",
    originalHtmlHash: `sha256:${"0".repeat(64)}`,
  },
});

// ── (a) The h2→h4 skip corpus (D18-10 — skipped levels nest deeper with NO
//        invented intermediate entries; deriveToc gives the h4 depth 2) ──────

export const SKIP_ARTICLE: CanonicalArticle = ArticleSchema.parse({
  ...base("toc-skip-demo", "Skipped Levels Demo"),
  blocks: [
    heading(2, "Open waters"),
    filler("Skip", 1),
    filler("Skip", 2),
    filler("Skip", 3),
    // h2 → h4: level 3 is skipped. The TOC must nest this h4 TWO list levels
    // deep under the h2 with NO li between them (structure, not indent).
    heading(4, "Sunken cathedral"),
    filler("Skip", 4),
    filler("Skip", 5),
    filler("Skip", 6),
    heading(2, "Tidal flat"),
    filler("Skip", 7),
    filler("Skip", 8),
    filler("Skip", 9),
  ],
});

// ── (b) The duplicate-text corpus (D18-11 — identical headings render AS-IS;
//        list position disambiguates, never "(2 of 2)" suffixes) ─────────────

const DUPLICATE_TEXT = "Shared horizon";

export const DUPLICATE_ARTICLE: CanonicalArticle = ArticleSchema.parse({
  ...base("toc-dup-demo", "Duplicate Headings Demo"),
  blocks: [
    heading(2, DUPLICATE_TEXT),
    filler("Dup", 1),
    filler("Dup", 2),
    filler("Dup", 3),
    heading(2, DUPLICATE_TEXT), // identical text, distinct block + offset
    filler("Dup", 4),
    filler("Dup", 5),
    filler("Dup", 6),
  ],
});

export { DUPLICATE_TEXT };

// ── (c) The h5/h6 deep-level corpus (ORNT-04 — levels preserved verbatim;
//        a well-formed chain h2→h3→h5→h6 exercises depth 3 + the h6 floor) ──

export const DEEP_ARTICLE: CanonicalArticle = ArticleSchema.parse({
  ...base("toc-deep-demo", "Deep Levels Demo"),
  blocks: [
    heading(2, "Surface layer"),
    filler("Deep", 1),
    filler("Deep", 2),
    heading(3, "Middle layer"),
    filler("Deep", 3),
    filler("Deep", 4),
    heading(5, "Quiet depths"), // h3 → h5 skips level 4
    filler("Deep", 5),
    filler("Deep", 6),
    heading(6, "Floor"), // a direct h5→h6 child reaches the deepest floor
    filler("Deep", 7),
    filler("Deep", 8),
  ],
});

// ── (d) The EPUB chapter row (D18-14 — chapters are articles; the trigger +
//        panel machinery must be identical from a chapter's own hierarchy).
//        ingestionMeta.source "epub-chapter" + bookId/chapterIndex are the
//        ingester's write shape; the DENORMALIZED top-level bookId is added
//        at put time by corpusRows (the booksStore.saveBook write shape —
//        ArticleSchema.parse strips it, so it must be merged after parse,
//        exactly like reading-views.spec.ts seedArticleRows does). ──────────

export const CHAPTER_BOOK_ID = "epub-toccorpus01";

export const CHAPTER_ARTICLE: CanonicalArticle = ArticleSchema.parse({
  ...base("epub-tocdemo01", "Chapter One: The Harbor"),
  ingestionMeta: {
    source: "epub-chapter",
    origin: "upload",
    originalHtmlHash: `sha256:${"1".repeat(64)}`,
    extractionConfidence: "high",
    bookId: CHAPTER_BOOK_ID,
    chapterIndex: 0,
  },
  blocks: [
    heading(2, "Moorings"),
    filler("Chapter", 1),
    filler("Chapter", 2),
    filler("Chapter", 3),
    heading(3, "The ferry at dawn"),
    filler("Chapter", 4),
    filler("Chapter", 5),
    filler("Chapter", 6),
  ],
});

// ── Seeding (the seedArticleRows discipline — raw puts, schema-valid rows) ──

/** The raw article rows: parsed articles + the denormalized top-level bookId
 *  on chapter rows (the 12-03 v5 index write shape). ArticleSchema.parse in
 *  Node is the T-18-10 boundary — no row reaches storage unvalidated. */
export function corpusRows(): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [
    SKIP_ARTICLE,
    DUPLICATE_ARTICLE,
    DEEP_ARTICLE,
    CHAPTER_ARTICLE,
  ].map((a) => ({ ...a }));
  for (let i = 0; i < rows.length; i++) {
    const meta = rows[i]!["ingestionMeta"] as { bookId?: string } | undefined;
    if (meta?.bookId) rows[i]!["bookId"] = meta.bookId;
  }
  return rows;
}

/** Write the whole corpus into the articles store via ONE raw IndexedDB
 *  transaction (reading-views.spec.ts seedArticleRows body — puts only,
 *  NEVER deleteDatabase; the caller's harness owns store clearing). */
export async function seedTocCorpus(page: Page): Promise<void> {
  const rows = corpusRows();
  await page.evaluate(async (rows) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("articles")) {
          resolve();
          return;
        }
        const tx = db.transaction("articles", "readwrite");
        for (const row of rows) tx.objectStore("articles").put(row);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, rows);
}
