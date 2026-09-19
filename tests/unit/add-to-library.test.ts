// tests/unit/add-to-library.test.ts
// Issue #4 — addToLibrary(): the ingest → dedupe-refuse → atomic save
// policy service. The outcome union (saved-article / saved-book / refused)
// is the WHOLE test surface for the policy — these unit tests cover
// dedupe and both save paths WITHOUT mounting AddDialog (the dialog keeps
// only form chrome, size validation, and calm refusal copy).
//
// Contracts pinned here:
//   - D7-07 dedupe-refuse: has()/hasBook() BEFORE save/saveBook; a
//     duplicate refusal is `{outcome:"refused", reason:"already-in-library"}`
//     and NEVER writes (no overwrite, no orphaned annotations).
//   - D16-09 refusal-only: dedupe refuses, it never overwrites.
//   - D20-04/D20-15 atomic save: the article AND its validated envelope
//     assets ride ONE save call (LibrarySource.save / booksStore.saveBook).
//   - Book attribution (D20-15 article-owned rows): each chapter's blocks
//     attribute its asset rows; an envelope asset no chapter references is
//     dropped; an asset referenced by two chapters produces two rows.
//   - The service NEVER throws for policy reasons: an IngestionError maps
//     to `{outcome:"refused", reason}`; any other throw maps to the
//     server-error catch-all.
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the ingest client so the policy tests never hit the network.
vi.mock("../../src/ingestion/IngestionClient", () => ({
  ingestUrl: vi.fn(),
  ingestHtml: vi.fn(),
  ingestMarkdown: vi.fn(),
  ingestPdf: vi.fn(),
  ingestEpub: vi.fn(),
  browserPreferredLanguages: vi.fn(),
  IngestionError: class IngestionError extends Error {
    readonly reason: string;
    constructor(reason: string, message?: string) {
      super(message ?? reason);
      this.name = "IngestionError";
      this.reason = reason;
    }
  },
}));

// Mock the article persistence seam (dedupe + save).
vi.mock("../../src/ingestion/LibrarySource", () => ({
  dexieLibrarySource: {
    has: vi.fn(),
    save: vi.fn(),
  },
}));

// Mock the book persistence seam (book-level dedupe + save).
vi.mock("../../src/persistence/booksStore", () => ({
  hasBook: vi.fn(),
  saveBook: vi.fn(),
}));

import {
  browserPreferredLanguages,
  ingestUrl,
  ingestHtml,
  ingestMarkdown,
  ingestPdf,
  ingestEpub,
  IngestionError,
  type IngestionSuccess,
  type EpubIngestionSuccess,
  type ValidatedAsset,
} from "../../src/ingestion/IngestionClient";
import { dexieLibrarySource } from "../../src/ingestion/LibrarySource";
import { hasBook, saveBook } from "../../src/persistence/booksStore";
import {
  addToLibrary,
  bookAssetsForChapters,
} from "../../src/ingestion/addToLibrary";
import { bytesToBase64 } from "../../src/ingestion/ingestCopy";
import type { CanonicalArticle, Block } from "../../src/content/types";

const ingestUrlMock = vi.mocked(ingestUrl);
const ingestHtmlMock = vi.mocked(ingestHtml);
const ingestMarkdownMock = vi.mocked(ingestMarkdown);
const ingestPdfMock = vi.mocked(ingestPdf);
const ingestEpubMock = vi.mocked(ingestEpub);
const browserPreferredLanguagesMock = vi.mocked(browserPreferredLanguages);
const hasMock = vi.mocked(dexieLibrarySource.has);
const saveMock = vi.mocked(dexieLibrarySource.save);
const hasBookMock = vi.mocked(hasBook);
const saveBookMock = vi.mocked(saveBook);

beforeEach(() => {
  ingestUrlMock.mockReset();
  ingestHtmlMock.mockReset();
  ingestMarkdownMock.mockReset();
  ingestPdfMock.mockReset();
  ingestEpubMock.mockReset();
  browserPreferredLanguagesMock.mockReset();
  hasMock.mockReset();
  saveMock.mockReset();
  hasBookMock.mockReset();
  saveBookMock.mockReset();
  // Default: not in the library (article + book arms); saves resolve.
  hasMock.mockResolvedValue(false);
  saveMock.mockResolvedValue(undefined);
  hasBookMock.mockResolvedValue(false);
  saveBookMock.mockResolvedValue(undefined);
});

function sampleArticle(id = "ingested-id"): CanonicalArticle {
  return {
    id,
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/article",
      title: "Article",
      retrievedAt: "2026-09-13T00:00:00.000Z",
      originalHtmlHash: "sha256:0",
    },
    blocks: [{ kind: "paragraph", content: [{ text: "Body.", marks: [] }] }],
    footnotes: [],
  } as unknown as CanonicalArticle;
}

function articleSuccess(id = "ingested-id", assets: ValidatedAsset[] = []): IngestionSuccess {
  return {
    article: sampleArticle(id),
    confidence: { state: "confident" },
    assets,
  };
}

function sampleAsset(assetId: string): ValidatedAsset {
  return {
    assetId,
    contentType: "image/png",
    byteLength: 3,
    bytes: new Uint8Array([1, 2, 3]),
  };
}

function paragraph(text: string): Block {
  return { kind: "paragraph", content: [{ text, marks: [] }] } as unknown as Block;
}

function figure(assetId: string): Block {
  return { kind: "figure", src: `asset:${assetId}`, alt: "" } as unknown as Block;
}

function chapter(id: string, blocks: Block[]): CanonicalArticle {
  return {
    ...sampleArticle(id),
    ingestionMeta: { bookId: "book-id", chapterIndex: 0 },
    blocks,
  } as unknown as CanonicalArticle;
}

function bookSuccess(overrides?: Partial<EpubIngestionSuccess>): EpubIngestionSuccess {
  return {
    book: {
      id: "book-id",
      title: "Sample Book",
      chapterArticleIds: ["epub-c01"],
    } as unknown as EpubIngestionSuccess["book"],
    articles: [chapter("epub-c01", [paragraph("Chapter one.")])],
    skippedCount: 0,
    assets: [],
    ...overrides,
  };
}

describe("addToLibrary — article path (url/paste/file)", () => {
  it("url arm: ingestUrl → has → save, then saved-article with the id", async () => {
    ingestUrlMock.mockResolvedValue(articleSuccess());
    const outcome = await addToLibrary({ kind: "url", url: "https://example.com/a" });

    expect(ingestUrlMock).toHaveBeenCalledWith("https://example.com/a");
    // D7-07 ordering: has BEFORE save.
    expect(hasMock.mock.invocationCallOrder[0]!).toBeLessThan(
      saveMock.mock.invocationCallOrder[0]!,
    );
    expect(hasMock).toHaveBeenCalledWith("ingested-id");
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledWith(sampleArticle(), []);
    expect(outcome).toEqual({ outcome: "saved-article", articleId: "ingested-id" });
  });

  it("url arm carries the validated envelope assets into the atomic save (D20-04)", async () => {
    const asset = sampleAsset("img-abc123456789");
    ingestUrlMock.mockResolvedValue(articleSuccess("with-figures", [asset]));
    const outcome = await addToLibrary({ kind: "url", url: "https://example.com/figs" });

    expect(saveMock).toHaveBeenCalledWith(sampleArticle("with-figures"), [asset]);
    expect(outcome).toEqual({ outcome: "saved-article", articleId: "with-figures" });
  });

  // Issue #59 (decisions #56/#57) — the browser language list rides ONLY the
  // YouTube-URL branch; ordinary article URLs keep the byte-identical one-arg
  // call (the body the client constructs stays {url}).
  it("YouTube URL: forwards browserPreferredLanguages() as ingestUrl's second arg", async () => {
    browserPreferredLanguagesMock.mockReturnValue(["en-US", "en"]);
    ingestUrlMock.mockResolvedValue(articleSuccess("yt-id"));
    await addToLibrary({ kind: "url", url: "https://youtu.be/dQw4w9WgXcQ" });

    expect(ingestUrlMock).toHaveBeenCalledWith("https://youtu.be/dQw4w9WgXcQ", ["en-US", "en"]);
  });

  it("non-YouTube URL: ingestUrl keeps its single-argument call (no language list)", async () => {
    ingestUrlMock.mockResolvedValue(articleSuccess());
    await addToLibrary({ kind: "url", url: "https://example.com/article" });

    expect(ingestUrlMock).toHaveBeenCalledTimes(1);
    expect(ingestUrlMock.mock.calls[0]).toEqual(["https://example.com/article"]);
    expect(browserPreferredLanguagesMock).not.toHaveBeenCalled();
  });

  it("YouTube URL with no browser languages: the preference degrades to undefined (absent field)", async () => {
    browserPreferredLanguagesMock.mockReturnValue(undefined);
    ingestUrlMock.mockResolvedValue(articleSuccess("yt-id"));
    await addToLibrary({ kind: "url", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });

    expect(ingestUrlMock).toHaveBeenCalledWith(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      undefined,
    );
  });

  it("paste arm routes ingestHtml", async () => {
    ingestHtmlMock.mockResolvedValue(articleSuccess("pasted-id"));
    const outcome = await addToLibrary({ kind: "paste", html: "<article>hi</article>" });

    expect(ingestHtmlMock).toHaveBeenCalledWith("<article>hi</article>");
    expect(outcome).toEqual({ outcome: "saved-article", articleId: "pasted-id" });
  });

  it(".md file: reads text and routes ingestMarkdown(text, filename)", async () => {
    ingestMarkdownMock.mockResolvedValue(articleSuccess("md-id"));
    const file = new File(["# Hello"], "notes.md");
    const outcome = await addToLibrary({ kind: "file", file });

    expect(ingestMarkdownMock).toHaveBeenCalledWith("# Hello", "notes.md");
    expect(outcome).toEqual({ outcome: "saved-article", articleId: "md-id" });
  });

  it(".pdf file: reads bytes, chunked-base64-encodes, routes ingestPdf(b64, filename)", async () => {
    ingestPdfMock.mockResolvedValue(articleSuccess("pdf-id"));
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const file = new File([bytes], "doc.pdf");
    const outcome = await addToLibrary({ kind: "file", file });

    expect(ingestPdfMock).toHaveBeenCalledWith(bytesToBase64(bytes), "doc.pdf");
    expect(outcome).toEqual({ outcome: "saved-article", articleId: "pdf-id" });
  });

  it(".html file: reads text and routes ingestHtml (no filename — the paste pipeline)", async () => {
    ingestHtmlMock.mockResolvedValue(articleSuccess("html-id"));
    const file = new File(["<article>x</article>"], "page.html");
    const outcome = await addToLibrary({ kind: "file", file });

    expect(ingestHtmlMock).toHaveBeenCalledWith("<article>x</article>");
    expect(outcome).toEqual({ outcome: "saved-article", articleId: "html-id" });
  });

  it("article dedupe-refuse: has=true → refused already-in-library, save NEVER called (D7-07/D16-09)", async () => {
    hasMock.mockResolvedValue(true);
    ingestUrlMock.mockResolvedValue(articleSuccess());
    const outcome = await addToLibrary({ kind: "url", url: "https://example.com/a" });

    expect(outcome).toEqual({ outcome: "refused", reason: "already-in-library" });
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("file-arm article dedupe-refuse behaves identically to the url arm (ONE policy)", async () => {
    hasMock.mockResolvedValue(true);
    ingestMarkdownMock.mockResolvedValue(articleSuccess("md-id"));
    const outcome = await addToLibrary({
      kind: "file",
      file: new File(["# Hello"], "notes.md"),
    });

    expect(hasMock).toHaveBeenCalledWith("md-id");
    expect(outcome).toEqual({ outcome: "refused", reason: "already-in-library" });
    expect(saveMock).not.toHaveBeenCalled();
  });
});

describe("addToLibrary — book path (epub)", () => {
  it("ingestEpub(base64, filename) → hasBook BEFORE saveBook → saved-book with skippedCount", async () => {
    const bytes = new Uint8Array([80, 75]);
    const result = bookSuccess({ skippedCount: 2 });
    ingestEpubMock.mockResolvedValue(result);
    const outcome = await addToLibrary({
      kind: "file",
      file: new File([bytes], "book.epub"),
    });

    expect(ingestEpubMock).toHaveBeenCalledWith(bytesToBase64(bytes), "book.epub");
    expect(hasBookMock).toHaveBeenCalledWith("book-id");
    expect(hasBookMock.mock.invocationCallOrder[0]!).toBeLessThan(
      saveBookMock.mock.invocationCallOrder[0]!,
    );
    expect(saveBookMock).toHaveBeenCalledTimes(1);
    expect(saveBookMock).toHaveBeenCalledWith(result.book, result.articles, []);
    expect(outcome).toEqual({
      outcome: "saved-book",
      bookId: "book-id",
      skippedChapterCount: 2,
    });
  });

  it("book dedupe-refuse: hasBook=true → refused already-in-library, saveBook NEVER called", async () => {
    hasBookMock.mockResolvedValue(true);
    ingestEpubMock.mockResolvedValue(bookSuccess());
    const outcome = await addToLibrary({
      kind: "file",
      file: new File(["PK"], "book.epub"),
    });

    expect(outcome).toEqual({ outcome: "refused", reason: "already-in-library" });
    expect(saveBookMock).not.toHaveBeenCalled();
  });

  it("book save attributes envelope assets per owning chapter (D20-15 article-owned rows)", async () => {
    const shared = sampleAsset("img-aaaaaaaaaaaa");
    const onlyC2 = sampleAsset("img-bbbbbbbbbbbb");
    const unreferenced = sampleAsset("img-cccccccccccc");
    ingestEpubMock.mockResolvedValue(
      bookSuccess({
        articles: [
          chapter("epub-c01", [paragraph("one."), figure("img-aaaaaaaaaaaa")]),
          chapter("epub-c02", [
            // Recursion: a figure inside a blockquote is still c02's row.
            {
              kind: "blockquote",
              children: [figure("img-aaaaaaaaaaaa")],
            } as unknown as Block,
            figure("img-bbbbbbbbbbbb"),
          ]),
        ],
        assets: [shared, onlyC2, unreferenced],
      }),
    );
    await addToLibrary({ kind: "file", file: new File(["PK"], "book.epub") });

    expect(saveBookMock).toHaveBeenCalledTimes(1);
    const assetsArg = saveBookMock.mock.calls[0]![2];
    // The shared asset produces TWO rows (one per referencing chapter); the
    // unreferenced envelope asset is dropped (model-driven attribution).
    expect(assetsArg).toEqual([
      { articleId: "epub-c01", ...shared },
      { articleId: "epub-c02", ...shared },
      { articleId: "epub-c02", ...onlyC2 },
    ]);
  });
});

describe("addToLibrary — refusal mapping (never throws for policy)", () => {
  it("an IngestionError passes its typed reason through", async () => {
    ingestUrlMock.mockRejectedValue(new IngestionError("ssrf-blocked-metadata"));
    const outcome = await addToLibrary({ kind: "url", url: "http://169.254.169.254/" });

    expect(outcome).toEqual({ outcome: "refused", reason: "ssrf-blocked-metadata" });
  });

  it("an epub refusal passes its typed reason through", async () => {
    ingestEpubMock.mockRejectedValue(new IngestionError("epub-unreadable"));
    const outcome = await addToLibrary({
      kind: "file",
      file: new File(["junk"], "book.epub"),
    });

    expect(outcome).toEqual({ outcome: "refused", reason: "epub-unreadable" });
  });

  it("a non-IngestionError throw surfaces as the server-error catch-all", async () => {
    ingestMarkdownMock.mockRejectedValue(new Error("boom"));
    const outcome = await addToLibrary({
      kind: "file",
      file: new File(["# x"], "notes.md"),
    });

    expect(outcome).toEqual({ outcome: "refused", reason: "server-error" });
  });
});

describe("bookAssetsForChapters (pure attribution)", () => {
  it("drops unreferenced assets, dedupes refs within a chapter, and recurses containers", () => {
    const a = sampleAsset("img-aaaaaaaaaaaa");
    const b = sampleAsset("img-bbbbbbbbbbbb");
    const out = bookAssetsForChapters(
      [
        {
          id: "c1",
          blocks: [
            figure("img-aaaaaaaaaaaa"),
            // Same ref twice in one chapter → ONE row (the Set dedupe).
            figure("img-aaaaaaaaaaaa"),
            {
              kind: "bulleted-list",
              items: [{ content: [figure("img-bbbbbbbbbbbb")] }],
            } as unknown as Block,
          ],
        },
        { id: "c2", blocks: [paragraph("no figures here")] },
      ],
      [a, b, sampleAsset("img-cccccccccccc")],
    );
    expect(out).toEqual([
      { articleId: "c1", ...a },
      { articleId: "c1", ...b },
    ]);
  });
});
