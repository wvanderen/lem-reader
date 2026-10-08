// tests/e2e/library/book-envelope.ts
// Issue #113 — the shared BOOK-envelope mock for the ingestion e2e specs
// (book-add-result.spec.ts + the a11y saved-result scans). NON-SPEC
// FILENAME convention (add-dialog.ts / markdown-payload.ts): this filename
// is not matched by Playwright's testMatch, and a spec must NEVER import
// another .spec.ts — the envelope builders live here so the two consumers
// cannot drift.
//
// The payloads are schema-valid at the network boundary: the client
// re-validates the widened IngestionResponse ok-variant (BookSchema + every
// article through ArticleSchema.parse), so `extractionConfidence` +
// `originalHtmlHash` on the chapter meta and the Book literal
// `source: "epub-upload"` are LOAD-BEARING — a shape miss surfaces as the
// calm server-error catch-all, not a mock failure. The picked File's bytes
// are irrelevant (the route mock fulfills before the server), so tests
// attach a minimal buffer.
import type { Page } from "@playwright/test";
import type { CanonicalArticle } from "../../../src/content/types";

/** The route-mock payload: a schema-valid BOOK envelope (the ok variant).
 * The dup-refusal cases never need a served refusal — the client's
 * hasBook() dedupe-refuses before any second save. */
export type EpubIngestPayload = {
  ok: true;
  book: {
    id: string;
    title: string;
    authors: string[];
    language: string;
    chapterArticleIds: string[];
    skippedChapterCount: number;
    source: "epub-upload";
    originalFileHash: string;
    addedAt: string;
  };
  articles: CanonicalArticle[];
  skippedCount: number;
  assets: unknown[];
};

/** A schema-valid chapter article (ArticleSchema.parse-clean) — chapters
 * ARE articles, carrying the epub-chapter meta (+ the REQUIRED
 * extractionConfidence / originalHtmlHash fields). */
export function chapterPayload(
  id: string,
  title: string,
  bookId: string,
  chapterIndex: number,
): CanonicalArticle {
  return {
    id,
    revision: 1,
    lang: "en",
    provenance: {
      title,
      retrievedAt: "2026-09-29T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "0".repeat(64),
    },
    blocks: [{ kind: "paragraph", content: [{ text: "Chapter body.", marks: [] }] }],
    footnotes: [],
    ingestionMeta: {
      source: "epub-chapter",
      origin: "upload",
      originalHtmlHash: "sha256:" + "0".repeat(64),
      extractionConfidence: "high",
      extractionWarnings: [],
      bookId,
      chapterIndex,
    },
  } as unknown as CanonicalArticle;
}

/** A schema-valid two-chapter book envelope (BookSchema + articles min(1)).
 * Chapter ids follow the epub-<hash>-cNN shape the real pipeline emits;
 * `skippedCount` is the D12-11 disclosure count the quiet confirmation
 * announces and the BookRow renders (issue #163). */
export function bookEnvelope(
  bookId: string,
  title: string,
  skippedCount: number,
): EpubIngestPayload {
  const chapterIds = [`${bookId}-c00`, `${bookId}-c01`];
  return {
    ok: true,
    book: {
      id: bookId,
      title,
      authors: ["Mock Author"],
      language: "en",
      chapterArticleIds: chapterIds,
      skippedChapterCount: skippedCount,
      source: "epub-upload",
      originalFileHash: "sha256:" + "0".repeat(64),
      addedAt: "2026-09-29T00:00:00.000Z",
    },
    articles: chapterIds.map((id, index) =>
      chapterPayload(id, `Chapter ${index + 1}. Mock`, bookId, index),
    ),
    skippedCount,
    assets: [],
  };
}

/** Route /api/ingest (the epub call carries ?format=epub — the trailing *
 * matches the query) with the given payload (a mutable holder so a test can
 * swap the NEXT response mid-test for the add-another arm). */
export async function mockEpubIngest(
  page: Page,
  payload: { current: EpubIngestPayload },
): Promise<void> {
  await page.route("**/api/ingest*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload.current),
    }),
  );
}
