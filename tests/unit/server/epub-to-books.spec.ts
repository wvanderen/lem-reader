// tests/unit/server/epub-to-books.spec.ts
// Plan 12-02 Task 1 — the epubToBooks adapter suite, describe 1: the archive
// layer (corrupt zip, missing container), the DRM allowlist gate, Zip Slip,
// the decompression-bomb cap, and the container→OPF manifest stage over the
// 12-01 synthetic fixture matrix. Task 2 (same file) adds describe 2: the
// TOC→spine-range chapter merge, admission, and the output contract.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  BOMB_ENTRY_DECLARED_SIZE,
  bombEntryBook,
  corruptNotEpub,
  deepNavBook,
  degenerateTocBook,
  drmAdeptBook,
  drmLcpBook,
  drmUnknownAlgBook,
  emptyBook,
  entityBombOpf,
  fontObfuscatedBook,
  frontMatterBook,
  imageChapterBook,
  mixedAdmissionBook,
  missingContainerBook,
  ncxOnlyBook,
  oebpsNestedBook,
  protoPollutionOpf,
  publisherSplitBook,
  validBookEpub3,
  zipSlipBook,
} from "./epub-fixtures";
import {
  createEpubXmlParser,
  epubToBooks,
  EPUB_THRESHOLDS,
  normalizeEpubHref,
  parseEpubArchive,
  type ChapterDraft,
} from "../../../server/epubToBooks";
import { IngestionError } from "../../../server/errors";
import { EPUB_MAX_ENTRY_BYTES } from "../../../server/limits";
import { BlockSchema } from "../../../src/content/schema";

/** Rejects with an IngestionError carrying exactly `reason`; returns the
 * error so per-test message assertions can chain. */
async function expectRefusal(
  build: () => Uint8Array,
  reason: string,
): Promise<IngestionError> {
  try {
    await epubToBooks(build());
  } catch (err) {
    expect(err).toBeInstanceOf(IngestionError);
    const e = err as IngestionError;
    expect(e.reason).toBe(reason);
    return e;
  }
  throw new Error("expected a typed refusal; the adapter resolved instead");
}

describe("epubToBooks — archive + DRM + manifests", () => {
  it("corruptNotEpub refuses epub-unreadable (not a zip at all)", async () => {
    await expectRefusal(corruptNotEpub, "epub-unreadable");
  });

  it("missingContainerBook refuses epub-unreadable (no META-INF/container.xml)", async () => {
    await expectRefusal(missingContainerBook, "epub-unreadable");
  });

  it("entityBombOpf refuses epub-unreadable (DTD/entity-expansion guard)", async () => {
    await expectRefusal(entityBombOpf, "epub-unreadable");
  });

  it("protoPollutionOpf refuses epub-unreadable (dangerous property-name guard)", async () => {
    await expectRefusal(protoPollutionOpf, "epub-unreadable");
  });

  it("drmAdeptBook refuses epub-protected without marker bytes in the message", async () => {
    const err = await expectRefusal(drmAdeptBook, "epub-protected");
    expect(err.message).toMatch(/protected|DRM/i);
    expect(err.message).not.toMatch(/[<>]|encryptedKey|adept|aes256|rights\.xml/i);
  });

  it("drmLcpBook refuses epub-protected (license.lcpl presence, cheapest check first)", async () => {
    const err = await expectRefusal(drmLcpBook, "epub-protected");
    expect(err.message).toMatch(/protected|DRM/i);
    expect(err.message).not.toMatch(/[<>]|license|readium|lcp/i);
  });

  it("drmUnknownAlgBook refuses epub-protected (vendor algorithm fails the allowlist)", async () => {
    const err = await expectRefusal(drmUnknownAlgBook, "epub-protected");
    expect(err.message).toMatch(/protected|DRM/i);
    expect(err.message).not.toMatch(/[<>]|vendor\.example|encryption|algorithm/i);
  });

  it("fontObfuscatedBook passes the DRM gate and reaches OPF metadata parsing", () => {
    const archive = parseEpubArchive(fontObfuscatedBook());
    expect(archive.bookMeta.title).toBe("The Synthetic Book");
  });

  it("zipSlipBook refuses epub-unreadable (every entry passes the Phase 9 gate)", async () => {
    await expectRefusal(zipSlipBook, "epub-unreadable");
  });

  it("bombEntryBook refuses epub-unreadable (over-cap entry filtered before inflation)", async () => {
    // The coupling point: the fixture's declared lie must exceed the REAL
    // server cap, or this test proves nothing.
    expect(BOMB_ENTRY_DECLARED_SIZE).toBeGreaterThan(EPUB_MAX_ENTRY_BYTES);
    await expectRefusal(bombEntryBook, "epub-unreadable");
  });

  it("oebpsNestedBook locates the OPF and resolves manifest hrefs through normalization", () => {
    const archive = parseEpubArchive(oebpsNestedBook());
    expect(archive.opfDir).toBe("OEBPS");
    const hrefs = archive.manifestItems.map((it) => it.href);
    expect(hrefs).toContain("OEBPS/nav.xhtml");
    expect(hrefs).toContain("OEBPS/text/ch1.xhtml");
    expect(hrefs).toContain("OEBPS/text/ch3.xhtml");
    // The nav manifest item is identified through its properties.
    expect(archive.navItem?.href).toBe("OEBPS/nav.xhtml");
  });

  it("validBookEpub3 extracts title/authors/language and spine order", () => {
    const archive = parseEpubArchive(validBookEpub3());
    expect(archive.bookMeta.title).toBe("The Synthetic Book");
    expect(archive.bookMeta.authors).toEqual(["Ada Author", "Bob Builder"]);
    expect(archive.bookMeta.language).toBe("en");
    expect(archive.bookMeta.publisher).toBe("Synthetic Press");
    expect(archive.bookMeta.publishedDate).toBe("2026-01-01");
    expect(archive.bookMeta.identifier).toBe("urn:uuid:synthetic-book-0001");
    expect(archive.spine.map((s) => s.idref)).toEqual(["nav", "c1", "c2", "c3", "c4"]);
    expect(archive.spine[0]?.linear).toBe("no");
  });

  it("removeNSPrefix key convention: dc:title arrives as key 'title' (assumption A7)", () => {
    const parser = createEpubXmlParser();
    const doc = parser.parse(
      `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Key Pin</dc:title></metadata></package>`,
    ) as { package: { metadata: Record<string, unknown> } };
    expect(Object.prototype.hasOwnProperty.call(doc.package.metadata, "title")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(doc.package.metadata, "dc:title")).toBe(false);
  });

  it("removeNSPrefix key convention: nav epub:type arrives as '@_type' (assumption A7)", () => {
    const parser = createEpubXmlParser();
    const doc = parser.parse(
      `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="c.xhtml">One</a></li></ol></nav></body></html>`,
    ) as { html: { body: { nav: Array<Record<string, unknown>> } } };
    const nav = doc.html.body.nav[0];
    expect(nav).toBeDefined();
    if (nav === undefined) return;
    expect(Object.prototype.hasOwnProperty.call(nav, "@_type")).toBe(true);
    expect(nav["@_type"]).toBe("toc");
  });

  it("normalizeEpubHref decodes %XX, resolves ../ and ./, strips fragments (Pitfall 1)", () => {
    expect(normalizeEpubHref("text/ch1.xhtml", "OEBPS")).toBe("OEBPS/text/ch1.xhtml");
    expect(normalizeEpubHref("../nav.xhtml", "OEBPS/text")).toBe("OEBPS/nav.xhtml");
    expect(normalizeEpubHref("./ch1.xhtml", "OEBPS")).toBe("OEBPS/ch1.xhtml");
    expect(normalizeEpubHref("My%20Chapter.xhtml", "")).toBe("My Chapter.xhtml");
    expect(normalizeEpubHref("ch2.xhtml#s1", "")).toBe("ch2.xhtml");
    // An undecodable %XX sequence stays literal (tolerant, never a refusal).
    expect(normalizeEpubHref("%E0%A4%A", "")).toBe("%E0%A4%A");
  });
});

describe("epubToBooks — TOC-merge + chapters", () => {
  it("validBookEpub3 → 4 chapters; nested depth-2 entries are NOT split out", async () => {
    const result = await epubToBooks(validBookEpub3());
    expect(result.chapters.length).toBe(4);
    expect(result.fallbackUsed).toBe(false);
    expect(result.skippedCount).toBe(0);
    expect(result.chapters.map((c) => c.title)).toEqual([
      "Chapter 1. Loomings",
      "Chapter 2. The Carpet-Bag",
      "Chapter 3. The Sermon",
      "Chapter 4. The Cataract",
    ]);
  });

  it("publisherSplitBook → 3 chapters; the split documents MERGE in spine order (D12-09)", async () => {
    const result = await epubToBooks(publisherSplitBook());
    expect(result.chapters.length).toBe(3);
    const ch1 = result.chapters[0] as ChapterDraft;
    expect(ch1.title).toBe("Chapter 1. Loomings");
    expect(ch1.spineIndex).toBe(1); // ch1a — the first document of the range
    const text = JSON.stringify(ch1.blocks);
    // The 12-04 prose-uniqueness contract gives each document its own
    // "Prose N.K" tokens (the old "(chapter N of its book)" markers were
    // shared-run prose the per-chapter anchor gate cannot admit once
    // merged); the first paragraphs' tokens still prove the spine-order
    // merge: doc 1's opening prose precedes doc 2's.
    const partA = text.indexOf("Prose 1.1");
    const partB = text.indexOf("Prose 2.1");
    expect(partA).toBeGreaterThanOrEqual(0);
    expect(partB).toBeGreaterThanOrEqual(0);
    expect(partA).toBeLessThan(partB); // spine order preserved across the merge
  });

  it("ncxOnlyBook → 3 chapters via the EPUB 2 NCX navMap", async () => {
    const result = await epubToBooks(ncxOnlyBook());
    expect(result.chapters.length).toBe(3);
    expect(result.fallbackUsed).toBe(false);
    expect(result.chapters.map((c) => c.title)).toEqual([
      "Chapter 1. Loomings",
      "Chapter 2. The Carpet-Bag",
      "Chapter 3. The Sermon",
    ]);
  });

  it("oebpsNestedBook → chapters resolve through normalization with fallbackUsed false (Pitfall 1 regression pin)", async () => {
    const result = await epubToBooks(oebpsNestedBook());
    expect(result.fallbackUsed).toBe(false);
    expect(result.chapters.length).toBe(3);
    expect(result.chapters.map((c) => c.title)).toEqual([
      "Chapter 1. Loomings",
      "Chapter 2. The Carpet-Bag",
      "Chapter 3. The Sermon",
    ]);
  });

  it("deepNavBook → exactly 3 chapters (depth-2/3 sections never become units — Pitfall 4)", async () => {
    const result = await epubToBooks(deepNavBook());
    expect(result.chapters.length).toBe(3);
    expect(result.chapters.map((c) => c.title)).toEqual([
      "Part One",
      "Part Two",
      "Part Three",
    ]);
  });

  it("degenerateTocBook → 4 chapters (single-entry descent)", async () => {
    const result = await epubToBooks(degenerateTocBook());
    expect(result.chapters.length).toBe(4);
    expect(result.fallbackUsed).toBe(false); // descent is still TOC-driven
    expect(result.chapters.map((c) => c.title)).toEqual([
      "Chapter 1. Loomings",
      "Chapter 2. The Carpet-Bag",
      "Chapter 3. The Sermon",
      "Chapter 4. The Cataract",
    ]);
  });

  it("frontMatterBook → 3 units with the leading unit first, titled from its first document", async () => {
    const result = await epubToBooks(frontMatterBook());
    expect(result.chapters.length).toBe(3);
    const [leading, ch1, ch2] = result.chapters as [ChapterDraft, ChapterDraft, ChapterDraft];
    expect(leading.title).toBe("The Synthetic Book"); // titlepage <title> — the document-title fallback
    expect(leading.spineIndex).toBe(1); // after the (structurally skipped) nav document
    expect(ch1.title).toBe("Chapter 1. Loomings");
    expect(ch2.title).toBe("Chapter 2. The Carpet-Bag");
  });

  it("imageChapterBook → zero figure-kind blocks survive; remote URL absent from all payloads (T-12-05)", async () => {
    const result = await epubToBooks(imageChapterBook());
    expect(result.chapters.length).toBe(1);
    const blocks = (result.chapters[0] as ChapterDraft).blocks;
    // The acceptance scan: NO block of kind figure survives anywhere.
    expect(blocks.every((b) => b.kind !== "figure")).toBe(true);
    const downgraded = blocks.filter(
      (b) => b.kind === "unsupported" && b.originalKind === "figure",
    );
    expect(downgraded.length).toBeGreaterThanOrEqual(1);
    for (const b of downgraded) {
      expect(b.kind === "unsupported" && b.plainDescription.length > 0).toBe(true);
    }
    // The tracking URL must not leak into any block payload.
    expect(JSON.stringify(blocks)).not.toContain("attacker.example");
  });

  it("emptyBook → epub-empty (zero readerable documents — whole-book refusal, D12-11)", async () => {
    await expectRefusal(emptyBook, "epub-empty");
  });

  it("mixedAdmissionBook → 2 admitted chapters + skippedCount 1 (the plate is disclosed)", async () => {
    const result = await epubToBooks(mixedAdmissionBook());
    expect(result.chapters.length).toBe(2);
    expect(result.skippedCount).toBe(1);
    expect(result.chapters.map((c) => c.title)).toEqual([
      "Chapter 1. Loomings",
      "Chapter 2. The Carpet-Bag",
    ]);
  });

  it("chapter titles chain: TOC label primary, document title fallback (Pitfall 10 numbering over admitted only)", async () => {
    const result = await epubToBooks(validBookEpub3());
    for (const c of result.chapters) {
      expect(c.title.startsWith("Chapter")).toBe(true); // TOC labels won
    }
    // The leading-unit case above already proves the document-title arm;
    // here the admitted-order spineIndex sequence pins the numbering order.
    const spineIndexes = result.chapters.map((c) => c.spineIndex);
    expect(spineIndexes).toEqual([1, 2, 3, 4]);
    for (let i = 1; i < spineIndexes.length; i++) {
      expect(spineIndexes[i]).toBeGreaterThan(spineIndexes[i - 1] as number);
    }
  });

  it("every chapter's blocks parse against the Block schema; footnotes default to []", async () => {
    const result = await epubToBooks(validBookEpub3());
    expect(result.chapters.length).toBeGreaterThan(0);
    for (const c of result.chapters) {
      expect(Array.isArray(c.footnotes)).toBe(true);
      expect(c.lang).toBe("en");
      for (const b of c.blocks) {
        expect(() => BlockSchema.parse(b)).not.toThrow();
      }
    }
  });

  it("the output contract carries every field stages 2+ consume (incl. both hashes)", async () => {
    const bytes = validBookEpub3();
    const result = await epubToBooks(bytes);
    for (const key of ["bookMeta", "chapters", "skippedCount", "originalFileHash", "fallbackUsed"] as const) {
      expect(Object.prototype.hasOwnProperty.call(result, key)).toBe(true);
    }
    const chapter = result.chapters[0] as ChapterDraft;
    for (const key of ["blocks", "footnotes", "lang", "title", "spineIndex", "sourceHtmlHash"] as const) {
      expect(Object.prototype.hasOwnProperty.call(chapter, key)).toBe(true);
    }
    expect(result.originalFileHash).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
    expect(chapter.sourceHtmlHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.bookMeta.title).toBe("The Synthetic Book");
    expect(EPUB_THRESHOLDS.minChapterBlocks).toBe(3);
  });

  it("identical bytes produce identical output (deterministic adapter)", async () => {
    const a = await epubToBooks(validBookEpub3());
    const b = await epubToBooks(validBookEpub3());
    expect(a).toEqual(b);
  });
});
