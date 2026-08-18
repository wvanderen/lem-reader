// tests/unit/server/epub-to-books.spec.ts
// Plan 12-02 Task 1 — the epubToBooks adapter suite, describe 1: the archive
// layer (corrupt zip, missing container), the DRM allowlist gate, Zip Slip,
// the decompression-bomb cap, and the container→OPF manifest stage over the
// 12-01 synthetic fixture matrix. Task 2 (same file) adds describe 2: the
// TOC→spine-range chapter merge, admission, and the output contract.
import { describe, expect, it } from "vitest";
import {
  BOMB_ENTRY_DECLARED_SIZE,
  bombEntryBook,
  corruptNotEpub,
  drmAdeptBook,
  drmLcpBook,
  drmUnknownAlgBook,
  entityBombOpf,
  fontObfuscatedBook,
  missingContainerBook,
  oebpsNestedBook,
  protoPollutionOpf,
  validBookEpub3,
  zipSlipBook,
} from "./epub-fixtures";
import {
  createEpubXmlParser,
  epubToBooks,
  normalizeEpubHref,
  parseEpubArchive,
} from "../../../server/epubToBooks";
import { IngestionError } from "../../../server/errors";
import { EPUB_MAX_ENTRY_BYTES } from "../../../server/limits";

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
