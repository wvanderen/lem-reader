// tests/unit/server/epub-fixtures.ts
//
// Plan 12-01 Task 3 — deterministic synthetic EPUB fixture generator with a
// module-load self-check (the 11-01 generate-synthetic-pdfs.ts precedent,
// EPUB edition; the 10-04 seed-time self-verification precedent for the
// import-time throw).
//
// WHY SYNTHETIC: these fixtures exercise CODE PATHS (container/OPF/nav/NCX
// parsing, TOC-merge, DRM detection, Zip Slip, bomb caps, admission), NOT
// calibration thresholds. They are committable BY CONSTRUCTION — no .epub
// binaries are ever written to disk or committed; the generator IS the
// fixture source. The D12-12 real-EPUB calibration corpus is a DIFFERENT
// thing entirely — it stays local + gitignored.
//
// BUILD DISCIPLINE: every book is assembled in-process with fflate zipSync
// (import discipline mirrors src/portability/ExportImportService.ts — only
// zipSync/strToU8 cross the import). The mimetype entry is STORED (level 0)
// and FIRST in every valid book, per OCF §4.3.3. XML templates lift the
// spec-verified shapes from 12-RESEARCH.md §Code Examples L434-558 verbatim
// (container/OPF/nav/NCX namespaces are load-bearing — do not "simplify"
// them). Small META-INF marker files (rights.xml, encryption.xml,
// license.lcpl) and hostile-OPF variants are ALSO stored so their
// discriminator markers are byte-present in the built zip (deflated entries
// would hide them from the self-check).
//
// DETERMINISM: fflate stamps Date.now() into the zip DOS time fields when an
// entry carries no mtime (fflate zip: `f.mtime == null ? Date.now() :
// f.mtime`), which would make every rebuild byte-different. Every entry
// therefore carries the fixed ZIP_EPOCH below; the module-load self-check
// rebuilds every fixture twice and asserts byte-identity.
//
// Type-stripping-safe TypeScript (runs under plain `node` via the verify
// command AND under vitest): interfaces, type aliases, and assertions only —
// no enums, no namespaces, no parameter properties.
//
// Self-check (module load — throws on any violation):
//   1. every fixture rebuilds byte-identically (determinism),
//   2. every zip declaring a mimetype has it FIRST + STORED + exact,
//   3. the DRM / corrupt / entity / proto / slip / bomb discriminators are
//      present in the built bytes (and absent where absence IS the point),
//   4. the TOC counter proves builder divergence: validBookEpub3 has 4
//      top-level nav entries vs publisherSplitBook's 3 (catches rot that
//      would silently flatten the matrix),
//   5. every counted TOC matches its builder's declared chapter-unit count.

import { strToU8, zipSync } from "fflate";

// ── Constants ────────────────────────────────────────────────────────────────

const EPUB_MIMETYPE = "application/epub+zip";
const CORRUPT_MARKER = "this is not a zip";

/** The declared (LIED-about) originalSize carried by bombEntryBook's bomb
 * entry: EPUB_MAX_ENTRY_BYTES + 1 = 64MiB + 1 (server/limits.ts). This module
 * deliberately imports NOTHING from /server (dependency-light fixture source;
 * plain-`node` importability), so the value is restated here and EXPORTED —
 * the 12-02 adapter spec asserts `BOMB_ENTRY_DECLARED_SIZE >
 * EPUB_MAX_ENTRY_BYTES` against the real cap, which is the coupling point
 * that fails loudly if either constant drifts. */
export const BOMB_ENTRY_DECLARED_SIZE = 64 * 1024 * 1024 + 1;

/** Fixed zip timestamp (see header note). One constant epoch keeps every
 * fixture byte-reproducible across processes and re-runs. */
const ZIP_EPOCH = new Date("2026-01-01T00:00:00Z").getTime();

// Spec-verified namespaces (12-RESEARCH.md §Code Examples — lift verbatim).
const NS_CONTAINER = "urn:oasis:names:tc:opendocument:xmlns:container";
const NS_OPF = "http://www.idpf.org/2007/opf";
const NS_DC = "http://purl.org/dc/elements/1.1/";
const NS_NCX = "http://www.daisy.org/z3986/2005/ncx/";
const NS_XMLENC = "http://www.w3.org/2001/04/xmlenc#";

// DRM gate constants (OCF §4.4.5 + 12-RESEARCH Pattern 3).
const FONT_OBFUSCATION_ALGORITHM = "http://www.idpf.org/2008/embedding";
const VENDOR_ALGORITHM = "https://vendor.example/2026/custom-encryption";
const ADEPT_MARKER = "ns.adobe.com/adept";

// ── Zip entry helpers ────────────────────────────────────────────────────────

/** Minimal fflate options surface we use — level (0 = store) + fixed mtime. */
interface EntryOptions {
  level?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  mtime: number;
}
type EpubEntry = [Uint8Array, EntryOptions];
type EpubEntries = Record<string, EpubEntry>;

/** Stored (level 0) entry — used for the mimetype (OCF §4.3.3) and the
 * marker-bearing files whose content must be byte-visible to the self-check. */
function stored(content: string): EpubEntry {
  return [strToU8(content), { level: 0, mtime: ZIP_EPOCH }];
}

/** Deflated entry — the default for ordinary content documents. */
function deflated(content: string): EpubEntry {
  return [strToU8(content), { mtime: ZIP_EPOCH }];
}

/** The mimetype entry — MUST be the first property inserted so zipSync emits
 * it as the first local-file-header + central-directory entry. */
function mimetypeEntry(): EpubEntry {
  return [strToU8(EPUB_MIMETYPE), { level: 0, mtime: ZIP_EPOCH }];
}

// ── XML templates (spec-verified shapes — 12-RESEARCH §Code Examples) ───────

/** container.xml — W3C EPUB 3.3 §4.2.6.3.1.6 Example 6 shape. */
function containerXml(opfPath: string): string {
  return `<?xml version="1.0"?>
<container version="1.0" xmlns="${NS_CONTAINER}">
   <rootfiles>
      <rootfile
          full-path="${opfPath}"
          media-type="application/oebps-package+xml"/>
   </rootfiles>
</container>
`;
}

interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
  /** e.g. "nav" for the EPUB 3 navigation document. */
  properties?: string;
}

interface SpineItemRef {
  idref: string;
  /** "no" = purely supplemental (a skip HINT per spec — D12-10 decides). */
  linear?: "no" | "yes";
}

interface OpfOptions {
  version: "2.0" | "3.0";
  title: string;
  authors: string[];
  language: string;
  publisher?: string;
  publishedDate?: string;
  identifier: string;
  manifest: ManifestItem[];
  spine: SpineItemRef[];
  /** EPUB 2 NCX: the spine toc= IDREF (manifest id of the NCX item). */
  spineToc?: string;
  /** DOCTYPE block injected between the XML declaration and <package> —
   * the entityBombOpf hostile shape. */
  doctype?: string;
  /** Extra raw markup inside <metadata> — hostile-shape injection point. */
  metadataExtra?: string;
}

/** OPF package — EPUB 3.3 §5 + OPF 2.0.1 §2 merged reference shape. */
function opfXml(o: OpfOptions): string {
  const creators = o.authors
    .map((a, i) => `      <dc:creator id="creator-${i + 1}">${a}</dc:creator>`)
    .join("\n");
  const optionalMeta =
    (o.publisher !== undefined
      ? `\n      <dc:publisher>${o.publisher}</dc:publisher>`
      : "") +
    (o.publishedDate !== undefined
      ? `\n      <dc:date>${o.publishedDate}</dc:date>`
      : "");
  const modifiedMeta =
    o.version === "3.0"
      ? `\n      <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>`
      : "";
  const items = o.manifest
    .map(
      (it) =>
        `      <item id="${it.id}" href="${it.href}" media-type="${it.mediaType}"${
          it.properties !== undefined ? ` properties="${it.properties}"` : ""
        }/>`,
    )
    .join("\n");
  const itemrefs = o.spine
    .map(
      (r) =>
        `      <itemref idref="${r.idref}"${
          r.linear !== undefined ? ` linear="${r.linear}"` : ""
        }/>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
${o.doctype !== undefined ? `${o.doctype}\n` : ""}<package version="${o.version}" xmlns="${NS_OPF}" unique-identifier="BookId" xml:lang="${o.language}">
  <metadata xmlns:dc="${NS_DC}">
      <dc:identifier id="BookId">${o.identifier}</dc:identifier>
      <dc:title>${o.title}</dc:title>
      <dc:language>${o.language}</dc:language>
${creators}${optionalMeta}${modifiedMeta}${o.metadataExtra !== undefined ? `\n      ${o.metadataExtra}` : ""}
  </metadata>
  <manifest>
${items}
  </manifest>
  <spine${o.spineToc !== undefined ? ` toc="${o.spineToc}"` : ""}>
${itemrefs}
  </spine>
</package>
`;
}

interface TocEntry {
  label: string;
  href: string;
  children?: TocEntry[];
}

/** One nav <li> — top-level entries land at exactly 8 leading spaces (the
 * self-check TOC counter's `^ {8}<li>` contract); each nesting depth adds 2. */
function navLi(e: TocEntry, depth: number): string {
  const pad = " ".repeat(6 + 2 * depth);
  const kids = e.children ?? [];
  if (kids.length === 0) {
    return `${pad}<li><a href="${e.href}">${e.label}</a></li>`;
  }
  const nested = kids.map((k) => navLi(k, depth + 1)).join("\n");
  return `${pad}<li><a href="${e.href}">${e.label}</a>
${pad}  <ol>
${nested}
${pad}  </ol>
${pad}</li>`;
}

/** EPUB 3 nav document — §7.4.2 shape (exactly one toc nav, ol>li>a). */
function navDocXml(docTitle: string, toc: TocEntry[]): string {
  const lis = toc.map((e) => navLi(e, 1)).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
  <head>
    <title>${docTitle}</title>
  </head>
  <body>
    <nav epub:type="toc">
      <h1>Contents</h1>
      <ol>
${lis}
      </ol>
    </nav>
  </body>
</html>
`;
}

/** EPUB 2 NCX — OPF 2.0.1 §2.4.1 shape. Top-level navPoints land at exactly
 * 4 leading spaces (the counter's `^ {4}<navPoint id=` contract). */
function ncxXml(docTitle: string, toc: TocEntry[]): string {
  let n = 0;
  const point = (e: TocEntry, depth: number): string => {
    const pad = " ".repeat(2 + 2 * depth);
    const id = `navpoint-${(n += 1)}`;
    const kids = e.children ?? [];
    const nested = kids.map((k) => point(k, depth + 1)).join("\n");
    return `${pad}<navPoint id="${id}">
${pad}  <navLabel><text>${e.label}</text></navLabel>
${pad}  <content src="${e.href}"/>${kids.length > 0 ? `\n${nested}` : ""}
${pad}</navPoint>`;
  };
  const points = toc.map((e) => point(e, 1)).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="${NS_NCX}" version="2005-1" xml:lang="en-US">
  <head>
    <meta name="dtb:uid" content="urn:uuid:synthetic-book"/>
  </head>
  <docTitle>
    <text>${docTitle}</text>
  </docTitle>
  <navMap>
${points}
  </navMap>
</ncx>
`;
}

// ── Chapter documents ────────────────────────────────────────────────────────

/** Deterministic chapter prose — 3+ paragraph-bearing chapters clear the
 * D12-10 readerability admission; identical inputs → identical bytes.
 * UNIQUENESS CONTRACT (12-04): the per-chapter round-trip anchor gate
 * samples the ASSEMBLED chapter text, and a publisher-split chapter
 * (publisherSplitBook) merges two documents into one article — two
 * occurrences of the same 20-grapheme window with identical 32-grapheme
 * prefix/suffix context resolve "ambiguous" (correct gate behavior; SC#4).
 * Every sentence therefore carries a "Prose N.K" document token so no two
 * documents share a prose run anywhere near the 84-grapheme danger length
 * (prefix 32 + window 20 + suffix 32) — the max inter-token gap here is
 * ~64 graphemes. */
function chapterParagraphs(chapterLabel: string, index: number): string[] {
  const n = index + 1;
  return [
    `${chapterLabel} opens in calm prose (document ${n}). Prose ${n}.1 is fixture-written so identical inputs give identical bytes. Prose ${n}.2 keeps block counts stable.`,
    `The second paragraph of document ${n} carries the argument forward. Prose ${n}.3 must clear the readerability admission algebra. Prose ${n}.4 adds honest block mass.`,
    `The third paragraph of document ${n} closes the chapter. Prose ${n}.5 turns the heading and paragraphs into canonical blocks. Prose ${n}.6 lets nothing else survive the walk.`,
  ];
}

/** A readerable chapter: h2 heading + 3 paragraphs. */
function chapterXhtml(title: string, index: number): string {
  const ps = chapterParagraphs(title, index)
    .map((p) => `    <p>${p}</p>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
  <head>
    <title>${title}</title>
  </head>
  <body>
    <section>
      <h2>${title}</h2>
${ps}
    </section>
  </body>
</html>
`;
}

/** A pure-image plate — no readerable text (the D12-10 skip class). */
function imagePlateXhtml(title: string, imageHref: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
  <head>
    <title>${title}</title>
  </head>
  <body>
    <div><img src="${imageHref}" alt="${title} — a synthetic full-page illustration plate."/></div>
  </body>
</html>
`;
}

/** The leading front-matter shapes (frontMatterBook). */
function titlePageXhtml(title: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
  <head>
    <title>${title}</title>
  </head>
  <body>
    <div>
      <h2>${title}</h2>
      <p>A synthetic volume assembled by the fixture generator for the Phase 12 intake pipeline.</p>
    </div>
  </body>
</html>
`;
}

function copyrightPageXhtml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
  <head>
    <title>Copyright</title>
  </head>
  <body>
    <div>
      <h2>Copyright</h2>
      <p>Copyright 2026 the fixture generator. This synthetic page exists to give the leading spine range real paragraphs before the first table-of-contents entry.</p>
    </div>
  </body>
</html>
`;
}

// ── DRM marker documents (12-RESEARCH Pattern 3 verified signatures) ────────

function adeptRightsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rights xmlns="http://${ADEPT_MARKER}">
  <encryptedKey>synthetic-adept-encrypted-key-material</encryptedKey>
</rights>
`;
}

function encryptionXml(algorithm: string, cipherUri: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<encryption xmlns="${NS_CONTAINER}">
  <EncryptedData xmlns="${NS_XMLENC}">
    <EncryptionMethod Algorithm="${algorithm}"/>
    <CipherData>
      <CipherReference URI="${cipherUri}"/>
    </CipherData>
  </EncryptedData>
</encryption>
`;
}

function lcpLicenseJson(): string {
  return `{
  "provider": "https://provider.example",
  "id": "urn:uuid:synthetic-lcp-license",
  "encryption": {
    "profile": "http://readium.org/lcp/basic-profile",
    "contentKey": {
      "algorithm": "http://www.w3.org/2001/04/xmlenc#aes256-cbc"
    }
  }
}
`;
}

// ── Fixture specs ────────────────────────────────────────────────────────────

interface FixtureSpec {
  entries: EpubEntries;
  /** nav (EPUB 3) or ncx (EPUB 2) document text — the TOC counter input. */
  tocXml: string | null;
  tocKind: "nav" | "ncx" | "none";
  /** The intended top-level chapter-unit count (the D12-09 partition input). */
  topLevelCount: number | null;
}

/** Compose the canonical EPUB 3 chapter set shared by most builders. */
function epub3Core(options: {
  identifier: string;
  title?: string;
  chapters: string[];
  toc: TocEntry[];
  extraSpineFront?: SpineItemRef[];
  manifestExtras?: ManifestItem[];
}): { entries: EpubEntries; nav: string } {
  const title = options.title ?? "The Synthetic Book";
  const chapterFiles = options.chapters.map((_, i) => `ch${i + 1}.xhtml`);
  const manifest: ManifestItem[] = [
    { id: "nav", href: "nav.xhtml", mediaType: "application/xhtml+xml", properties: "nav" },
    ...options.chapters.map((_, i) => ({
      id: `c${i + 1}`,
      href: `ch${i + 1}.xhtml`,
      mediaType: "application/xhtml+xml",
    })),
    ...(options.manifestExtras ?? []),
  ];
  const spine: SpineItemRef[] = [
    { idref: "nav", linear: "no" },
    ...(options.extraSpineFront ?? []),
    ...options.chapters.map((_, i) => ({ idref: `c${i + 1}` })),
  ];
  const nav = navDocXml("Contents", options.toc);
  const opf = opfXml({
    version: "3.0",
    title,
    authors: ["Ada Author", "Bob Builder"],
    language: "en",
    publisher: "Synthetic Press",
    publishedDate: "2026-01-01",
    identifier: options.identifier,
    manifest,
    spine,
  });
  const entries: EpubEntries = {
    mimetype: mimetypeEntry(),
    "META-INF/container.xml": deflated(containerXml("content.opf")),
    "content.opf": deflated(opf),
    "nav.xhtml": deflated(nav),
  };
  options.chapters.forEach((doc, i) => {
    entries[chapterFiles[i] as string] = deflated(doc);
  });
  return { entries, nav };
}

/** 1. validBookEpub3 — four top-level nav entries (one nested depth-2 ol) +
 * 4 readerable chapters; spine [nav linear=no, c1..c4]. */
function validBookEpub3Spec(): FixtureSpec {
  const { entries, nav } = epub3Core({
    identifier: "urn:uuid:synthetic-book-0001",
    chapters: [
      chapterXhtml("Chapter 1. Loomings", 0),
      chapterXhtml("Chapter 2. The Carpet-Bag", 1),
      chapterXhtml("Chapter 3. The Sermon", 2),
      chapterXhtml("Chapter 4. The Cataract", 3),
    ],
    toc: [
      { label: "Chapter 1. Loomings", href: "ch1.xhtml" },
      {
        label: "Chapter 2. The Carpet-Bag",
        href: "ch2.xhtml",
        children: [{ label: "Section One", href: "ch2.xhtml#s1" }],
      },
      { label: "Chapter 3. The Sermon", href: "ch3.xhtml" },
      { label: "Chapter 4. The Cataract", href: "ch4.xhtml" },
    ],
  });
  return { entries, tocXml: nav, tocKind: "nav", topLevelCount: 4 };
}

/** 2. publisherSplitBook — 3 top-level TOC entries; the spine carries ch1a +
 * ch1b, BOTH resolving into TOC entry 1's spine range (the D12-09 merge
 * proof: publisher chapter-splitting must merge into one article). */
function publisherSplitBookSpec(): FixtureSpec {
  const toc: TocEntry[] = [
    { label: "Chapter 1. Loomings", href: "ch1a.xhtml" },
    { label: "Chapter 2. The Carpet-Bag", href: "ch2.xhtml" },
    { label: "Chapter 3. The Sermon", href: "ch3.xhtml" },
  ];
  const nav = navDocXml("Contents", toc);
  const opf = opfXml({
    version: "3.0",
    title: "The Synthetic Book",
    authors: ["Ada Author", "Bob Builder"],
    language: "en",
    publisher: "Synthetic Press",
    publishedDate: "2026-01-01",
    identifier: "urn:uuid:synthetic-book-split",
    manifest: [
      { id: "nav", href: "nav.xhtml", mediaType: "application/xhtml+xml", properties: "nav" },
      { id: "c1a", href: "ch1a.xhtml", mediaType: "application/xhtml+xml" },
      { id: "c1b", href: "ch1b.xhtml", mediaType: "application/xhtml+xml" },
      { id: "c2", href: "ch2.xhtml", mediaType: "application/xhtml+xml" },
      { id: "c3", href: "ch3.xhtml", mediaType: "application/xhtml+xml" },
    ],
    spine: [
      { idref: "nav", linear: "no" },
      { idref: "c1a" },
      { idref: "c1b" },
      { idref: "c2" },
      { idref: "c3" },
    ],
  });
  const entries: EpubEntries = {
    mimetype: mimetypeEntry(),
    "META-INF/container.xml": deflated(containerXml("content.opf")),
    "content.opf": deflated(opf),
    "nav.xhtml": deflated(nav),
    "ch1a.xhtml": deflated(chapterXhtml("Chapter 1. Loomings", 0)),
    "ch1b.xhtml": deflated(chapterXhtml("Chapter 1. Loomings (continued)", 1)),
    "ch2.xhtml": deflated(chapterXhtml("Chapter 2. The Carpet-Bag", 2)),
    "ch3.xhtml": deflated(chapterXhtml("Chapter 3. The Sermon", 3)),
  };
  return { entries, tocXml: nav, tocKind: "nav", topLevelCount: 3 };
}

/** 3. ncxOnlyBook — EPUB 2 shape: no nav item; spine toc="ncx" +
 * application/x-dtbncx+xml NCX with 3 navPoints (one nested for depth). */
function ncxOnlyBookSpec(): FixtureSpec {
  const toc: TocEntry[] = [
    {
      label: "Chapter 1. Loomings",
      href: "ch1.xhtml",
      children: [{ label: "Section One", href: "ch1.xhtml#s1" }],
    },
    { label: "Chapter 2. The Carpet-Bag", href: "ch2.xhtml" },
    { label: "Chapter 3. The Sermon", href: "ch3.xhtml" },
  ];
  const ncx = ncxXml("The Synthetic Book", toc);
  const opf = opfXml({
    version: "2.0",
    title: "The Synthetic Book",
    authors: ["Ada Author", "Bob Builder"],
    language: "en",
    publisher: "Synthetic Press",
    publishedDate: "2026-01-01",
    identifier: "urn:uuid:synthetic-book-ncx",
    manifest: [
      { id: "ncx", href: "toc.ncx", mediaType: "application/x-dtbncx+xml" },
      { id: "c1", href: "ch1.xhtml", mediaType: "application/xhtml+xml" },
      { id: "c2", href: "ch2.xhtml", mediaType: "application/xhtml+xml" },
      { id: "c3", href: "ch3.xhtml", mediaType: "application/xhtml+xml" },
    ],
    spine: [{ idref: "c1" }, { idref: "c2" }, { idref: "c3" }],
    spineToc: "ncx",
  });
  const entries: EpubEntries = {
    mimetype: mimetypeEntry(),
    "META-INF/container.xml": deflated(containerXml("content.opf")),
    "content.opf": deflated(opf),
    "toc.ncx": deflated(ncx),
    "ch1.xhtml": deflated(chapterXhtml("Chapter 1. Loomings", 0)),
    "ch2.xhtml": deflated(chapterXhtml("Chapter 2. The Carpet-Bag", 1)),
    "ch3.xhtml": deflated(chapterXhtml("Chapter 3. The Sermon", 2)),
  };
  return { entries, tocXml: ncx, tocKind: "ncx", topLevelCount: 3 };
}

/** 4. oebpsNestedBook — OPF at OEBPS/content.opf, chapters at
 * OEBPS/text/chN.xhtml, nav hrefs relative to OEBPS/ — the Pitfall 1
 * href-normalization proof. */
function oebpsNestedBookSpec(): FixtureSpec {
  const toc: TocEntry[] = [
    { label: "Chapter 1. Loomings", href: "text/ch1.xhtml" },
    { label: "Chapter 2. The Carpet-Bag", href: "text/ch2.xhtml" },
    { label: "Chapter 3. The Sermon", href: "text/ch3.xhtml" },
  ];
  const nav = navDocXml("Contents", toc);
  const opf = opfXml({
    version: "3.0",
    title: "The Synthetic Book",
    authors: ["Ada Author", "Bob Builder"],
    language: "en",
    publisher: "Synthetic Press",
    publishedDate: "2026-01-01",
    identifier: "urn:uuid:synthetic-book-oebps",
    manifest: [
      { id: "nav", href: "nav.xhtml", mediaType: "application/xhtml+xml", properties: "nav" },
      { id: "c1", href: "text/ch1.xhtml", mediaType: "application/xhtml+xml" },
      { id: "c2", href: "text/ch2.xhtml", mediaType: "application/xhtml+xml" },
      { id: "c3", href: "text/ch3.xhtml", mediaType: "application/xhtml+xml" },
    ],
    spine: [
      { idref: "nav", linear: "no" },
      { idref: "c1" },
      { idref: "c2" },
      { idref: "c3" },
    ],
  });
  const entries: EpubEntries = {
    mimetype: mimetypeEntry(),
    "META-INF/container.xml": deflated(containerXml("OEBPS/content.opf")),
    "OEBPS/content.opf": deflated(opf),
    "OEBPS/nav.xhtml": deflated(nav),
    "OEBPS/text/ch1.xhtml": deflated(chapterXhtml("Chapter 1. Loomings", 0)),
    "OEBPS/text/ch2.xhtml": deflated(chapterXhtml("Chapter 2. The Carpet-Bag", 1)),
    "OEBPS/text/ch3.xhtml": deflated(chapterXhtml("Chapter 3. The Sermon", 2)),
  };
  return { entries, tocXml: nav, tocKind: "nav", topLevelCount: 3 };
}

/** 5. deepNavBook — 3 depth-1 entries each with 2-3 nested depth-2/3
 * children (only 3 chapters) — the Pitfall 4 flattening proof. */
function deepNavBookSpec(): FixtureSpec {
  const { entries, nav } = epub3Core({
    identifier: "urn:uuid:synthetic-book-deep",
    chapters: [
      chapterXhtml("Part One", 0),
      chapterXhtml("Part Two", 1),
      chapterXhtml("Part Three", 2),
    ],
    toc: [
      {
        label: "Part One",
        href: "ch1.xhtml",
        children: [
          {
            label: "Section A",
            href: "ch1.xhtml#a",
            children: [{ label: "Subsection A1", href: "ch1.xhtml#a1" }],
          },
          { label: "Section B", href: "ch1.xhtml#b" },
        ],
      },
      {
        label: "Part Two",
        href: "ch2.xhtml",
        children: [
          { label: "Section C", href: "ch2.xhtml#c" },
          { label: "Section D", href: "ch2.xhtml#d" },
          { label: "Section E", href: "ch2.xhtml#e" },
        ],
      },
      {
        label: "Part Three",
        href: "ch3.xhtml",
        children: [{ label: "Section F", href: "ch3.xhtml#f" }],
      },
    ],
  });
  return { entries, tocXml: nav, tocKind: "nav", topLevelCount: 3 };
}

/** 6. degenerateTocBook — a single depth-1 entry ("Contents") wrapping 4
 * depth-2 children — the degenerate descent case (D12-09 step 1). */
function degenerateTocBookSpec(): FixtureSpec {
  const { entries, nav } = epub3Core({
    identifier: "urn:uuid:synthetic-book-degenerate",
    chapters: [
      chapterXhtml("Chapter 1. Loomings", 0),
      chapterXhtml("Chapter 2. The Carpet-Bag", 1),
      chapterXhtml("Chapter 3. The Sermon", 2),
      chapterXhtml("Chapter 4. The Cataract", 3),
    ],
    toc: [
      {
        label: "Contents",
        href: "nav.xhtml",
        children: [
          { label: "Chapter 1. Loomings", href: "ch1.xhtml" },
          { label: "Chapter 2. The Carpet-Bag", href: "ch2.xhtml" },
          { label: "Chapter 3. The Sermon", href: "ch3.xhtml" },
          { label: "Chapter 4. The Cataract", href: "ch4.xhtml" },
        ],
      },
    ],
  });
  return { entries, tocXml: nav, tocKind: "nav", topLevelCount: 1 };
}

/** 7. frontMatterBook — spine starts with a title page + copyright page
 * (real paragraphs, before the first TOC entry) then 2 TOC chapters — the
 * leading-unit case (12-RESEARCH Pattern 4 step 4). */
function frontMatterBookSpec(): FixtureSpec {
  const manifest: ManifestItem[] = [
    { id: "nav", href: "nav.xhtml", mediaType: "application/xhtml+xml", properties: "nav" },
    { id: "titlepage", href: "titlepage.xhtml", mediaType: "application/xhtml+xml" },
    { id: "copyright", href: "copyright.xhtml", mediaType: "application/xhtml+xml" },
    { id: "c1", href: "ch1.xhtml", mediaType: "application/xhtml+xml" },
    { id: "c2", href: "ch2.xhtml", mediaType: "application/xhtml+xml" },
  ];
  const toc: TocEntry[] = [
    { label: "Chapter 1. Loomings", href: "ch1.xhtml" },
    { label: "Chapter 2. The Carpet-Bag", href: "ch2.xhtml" },
  ];
  const nav = navDocXml("Contents", toc);
  const opf = opfXml({
    version: "3.0",
    title: "The Synthetic Book",
    authors: ["Ada Author", "Bob Builder"],
    language: "en",
    publisher: "Synthetic Press",
    publishedDate: "2026-01-01",
    identifier: "urn:uuid:synthetic-book-frontmatter",
    manifest,
    spine: [
      { idref: "nav", linear: "no" },
      { idref: "titlepage" },
      { idref: "copyright" },
      { idref: "c1" },
      { idref: "c2" },
    ],
  });
  const entries: EpubEntries = {
    mimetype: mimetypeEntry(),
    "META-INF/container.xml": deflated(containerXml("content.opf")),
    "content.opf": deflated(opf),
    "nav.xhtml": deflated(nav),
    "titlepage.xhtml": deflated(titlePageXhtml("The Synthetic Book")),
    "copyright.xhtml": deflated(copyrightPageXhtml()),
    "ch1.xhtml": deflated(chapterXhtml("Chapter 1. Loomings", 0)),
    "ch2.xhtml": deflated(chapterXhtml("Chapter 2. The Carpet-Bag", 1)),
  };
  return { entries, tocXml: nav, tocKind: "nav", topLevelCount: 2 };
}

/** The minimal one-chapter shell shared by the DRM/hostile-marker builders. */
function markerShellSpec(options: {
  identifier: string;
  extraEntries?: Record<string, EpubEntry>;
}): FixtureSpec {
  const toc: TocEntry[] = [{ label: "Chapter 1. Loomings", href: "ch1.xhtml" }];
  const { entries, nav } = epub3Core({
    identifier: options.identifier,
    chapters: [chapterXhtml("Chapter 1. Loomings", 0)],
    toc,
  });
  if (options.extraEntries) {
    for (const [name, entry] of Object.entries(options.extraEntries)) {
      entries[name] = entry;
    }
  }
  return { entries, tocXml: nav, tocKind: "nav", topLevelCount: 1 };
}

/** 8. drmAdeptBook — valid shell + META-INF/rights.xml + META-INF/encryption.xml
 * carrying an ADEPT-namespace encryptedKey entry. */
function drmAdeptBookSpec(): FixtureSpec {
  return markerShellSpec({
    identifier: "urn:uuid:synthetic-book-adept",
    extraEntries: {
      "META-INF/rights.xml": stored(adeptRightsXml()),
      "META-INF/encryption.xml": stored(
        encryptionXml("http://www.w3.org/2001/04/xmlenc#aes256-cbc", "ch1.xhtml"),
      ),
    },
  });
}

/** 9. drmLcpBook — valid shell + META-INF/license.lcpl entry (Readium LCP
 * presence detection — LCP spec §7.1). */
function drmLcpBookSpec(): FixtureSpec {
  return markerShellSpec({
    identifier: "urn:uuid:synthetic-book-lcp",
    extraEntries: {
      "META-INF/license.lcpl": stored(lcpLicenseJson()),
    },
  });
}

/** 10. drmUnknownAlgBook — encryption.xml whose EncryptionMethod Algorithm is
 * a vendor URI that is NOT the font-obfuscation URI → refuses by the
 * allowlist rule (covers FairPlay + unknown vendors). */
function drmUnknownAlgBookSpec(): FixtureSpec {
  return markerShellSpec({
    identifier: "urn:uuid:synthetic-book-unknown-alg",
    extraEntries: {
      "META-INF/encryption.xml": stored(encryptionXml(VENDOR_ALGORITHM, "ch1.xhtml")),
    },
  });
}

/** 11. fontObfuscatedBook — encryption.xml whose ONLY EncryptedData uses the
 * IDPF font-obfuscation Algorithm + one readerable chapter — PASSES the DRM
 * gate (OCF §4.4.5: the one legitimate non-DRM use of encryption.xml). */
function fontObfuscatedBookSpec(): FixtureSpec {
  return markerShellSpec({
    identifier: "urn:uuid:synthetic-book-font-obf",
    extraEntries: {
      "META-INF/encryption.xml": stored(
        encryptionXml(FONT_OBFUSCATION_ALGORITHM, "fonts/body.otf"),
      ),
    },
  });
}

/** 13. missingContainerBook — a valid zip with chapters but NO
 * META-INF/container.xml (the epub-unreadable container-missing class). */
function missingContainerBookSpec(): FixtureSpec {
  const spec = markerShellSpec({ identifier: "urn:uuid:synthetic-book-nocontainer" });
  const entries: EpubEntries = { mimetype: mimetypeEntry() };
  for (const [name, entry] of Object.entries(spec.entries)) {
    if (name !== "META-INF/container.xml") entries[name] = entry;
  }
  return { ...spec, entries };
}

/** 14. entityBombOpf — OPF embedding ENTITY declarations shaped like nested
 * entity expansions (the classic amplification pattern) in metadata. The OPF
 * is STORED so <!ENTITY is byte-present. */
function entityBombOpfSpec(): FixtureSpec {
  const doctype = `<!DOCTYPE package [
  <!ENTITY a0 "synthetic-entity-payload-0123456789abcdef0123456789abcdef">
  <!ENTITY a1 "&a0;&a0;&a0;&a0;&a0;&a0;&a0;&a0;&a0;&a0;">
  <!ENTITY a2 "&a1;&a1;&a1;&a1;&a1;&a1;&a1;&a1;&a1;&a1;">
  <!ENTITY a3 "&a2;&a2;&a2;&a2;&a2;&a2;&a2;&a2;&a2;&a2;">
]>`;
  const toc: TocEntry[] = [{ label: "Chapter 1. Loomings", href: "ch1.xhtml" }];
  const nav = navDocXml("Contents", toc);
  const opfText = opfXml({
    version: "3.0",
    title: "Entity Bomb &a3;",
    authors: ["Ada Author"],
    language: "en",
    identifier: "urn:uuid:synthetic-book-entity",
    doctype,
    manifest: [
      { id: "nav", href: "nav.xhtml", mediaType: "application/xhtml+xml", properties: "nav" },
      { id: "c1", href: "ch1.xhtml", mediaType: "application/xhtml+xml" },
    ],
    spine: [{ idref: "nav", linear: "no" }, { idref: "c1" }],
  });
  const entries: EpubEntries = {
    mimetype: mimetypeEntry(),
    "META-INF/container.xml": deflated(containerXml("content.opf")),
    "content.opf": stored(opfText),
    "nav.xhtml": deflated(nav),
    "ch1.xhtml": deflated(chapterXhtml("Chapter 1. Loomings", 0)),
  };
  return { entries, tocXml: nav, tocKind: "nav", topLevelCount: 1 };
}

/** 15. protoPollutionOpf — OPF containing a literal __proto__ element name in
 * metadata (the fast-xml-parser onDangerousProperty case). Stored for
 * byte-presence. */
function protoPollutionOpfSpec(): FixtureSpec {
  const metadataExtra = "<__proto__>hostile-property-name</__proto__>";
  const opfText = opfXml({
    version: "3.0",
    title: "Proto Pollution OPF",
    authors: ["Ada Author"],
    language: "en",
    identifier: "urn:uuid:synthetic-book-proto",
    metadataExtra,
    manifest: [
      { id: "nav", href: "nav.xhtml", mediaType: "application/xhtml+xml", properties: "nav" },
      { id: "c1", href: "ch1.xhtml", mediaType: "application/xhtml+xml" },
    ],
    spine: [{ idref: "nav", linear: "no" }, { idref: "c1" }],
  });
  const toc: TocEntry[] = [{ label: "Chapter 1. Loomings", href: "ch1.xhtml" }];
  const nav = navDocXml("Contents", toc);
  const entries: EpubEntries = {
    mimetype: mimetypeEntry(),
    "META-INF/container.xml": deflated(containerXml("content.opf")),
    "content.opf": stored(opfText),
    "nav.xhtml": deflated(nav),
    "ch1.xhtml": deflated(chapterXhtml("Chapter 1. Loomings", 0)),
  };
  return { entries, tocXml: nav, tocKind: "nav", topLevelCount: 1 };
}

/** 16. zipSlipBook — valid book plus an extra entry named ../../evil.xhtml
 * (the Phase 9 isSafeEntryName hard-gate class). */
function zipSlipBookSpec(): FixtureSpec {
  const spec = markerShellSpec({ identifier: "urn:uuid:synthetic-book-slip" });
  spec.entries["../../evil.xhtml"] = stored(
    chapterXhtml("Evil Traversal Entry", 0),
  );
  return spec;
}

/** 18. imageChapterBook — one chapter embedding a remote-src image (absolute
 * https URL — the T-12-05 tracking-beacon class) and a relative-src image,
 * plus readerable text. */
function imageChapterBookSpec(): FixtureSpec {
  const ps = chapterParagraphs("Chapter 1. Illustrated", 0)
    .map((p) => `    <p>${p}</p>`)
    .join("\n");
  const doc = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
  <head>
    <title>Chapter 1. Illustrated</title>
  </head>
  <body>
    <section>
      <h2>Chapter 1. Illustrated</h2>
${ps}
      <div><img src="https://attacker.example/track.png" alt="A remote tracking image embedded by a hostile chapter."/></div>
      <div><img src="images/figure-1.png" alt="A relative in-book figure."/></div>
    </section>
  </body>
</html>
`;
  const toc: TocEntry[] = [{ label: "Chapter 1. Illustrated", href: "ch1.xhtml" }];
  const manifest: ManifestItem[] = [
    { id: "nav", href: "nav.xhtml", mediaType: "application/xhtml+xml", properties: "nav" },
    { id: "c1", href: "ch1.xhtml", mediaType: "application/xhtml+xml" },
  ];
  const nav = navDocXml("Contents", toc);
  const opf = opfXml({
    version: "3.0",
    title: "The Synthetic Book",
    authors: ["Ada Author"],
    language: "en",
    identifier: "urn:uuid:synthetic-book-images",
    manifest,
    spine: [{ idref: "nav", linear: "no" }, { idref: "c1" }],
  });
  const entries: EpubEntries = {
    mimetype: mimetypeEntry(),
    "META-INF/container.xml": deflated(containerXml("content.opf")),
    "content.opf": deflated(opf),
    "nav.xhtml": deflated(nav),
    // STORED: this document IS the fixture's marker carrier (the remote +
    // relative image srcs must be byte-visible to the self-check).
    "ch1.xhtml": stored(doc),
  };
  return { entries, tocXml: nav, tocKind: "nav", topLevelCount: 1 };
}

/** 19. emptyBook — valid container/OPF/spine but EVERY spine document is a
 * pure-image plate (no readerable text) → zero chapters admit → epub-empty. */
function emptyBookSpec(): FixtureSpec {
  const toc: TocEntry[] = [
    { label: "Plate 1", href: "plate1.xhtml" },
    { label: "Plate 2", href: "plate2.xhtml" },
  ];
  const nav = navDocXml("Contents", toc);
  const opf = opfXml({
    version: "3.0",
    title: "The Synthetic Book",
    authors: ["Ada Author"],
    language: "en",
    identifier: "urn:uuid:synthetic-book-empty",
    manifest: [
      { id: "nav", href: "nav.xhtml", mediaType: "application/xhtml+xml", properties: "nav" },
      { id: "p1", href: "plate1.xhtml", mediaType: "application/xhtml+xml" },
      { id: "p2", href: "plate2.xhtml", mediaType: "application/xhtml+xml" },
    ],
    spine: [{ idref: "nav", linear: "no" }, { idref: "p1" }, { idref: "p2" }],
  });
  const entries: EpubEntries = {
    mimetype: mimetypeEntry(),
    "META-INF/container.xml": deflated(containerXml("content.opf")),
    "content.opf": deflated(opf),
    "nav.xhtml": deflated(nav),
    "plate1.xhtml": deflated(imagePlateXhtml("Plate 1", "images/plate-1.png")),
    "plate2.xhtml": deflated(imagePlateXhtml("Plate 2", "images/plate-2.png")),
  };
  return { entries, tocXml: nav, tocKind: "nav", topLevelCount: 2 };
}

/** 20. mixedAdmissionBook — 2 readerable chapters + 1 pure-image plate
 * chapter → skippedCount 1 (the D12-11 disclosure fixture). */
function mixedAdmissionBookSpec(): FixtureSpec {
  const toc: TocEntry[] = [
    { label: "Chapter 1. Loomings", href: "ch1.xhtml" },
    { label: "Chapter 2. The Carpet-Bag", href: "ch2.xhtml" },
    { label: "Plate", href: "plate.xhtml" },
  ];
  const nav = navDocXml("Contents", toc);
  const opf = opfXml({
    version: "3.0",
    title: "The Synthetic Book",
    authors: ["Ada Author"],
    language: "en",
    identifier: "urn:uuid:synthetic-book-mixed",
    manifest: [
      { id: "nav", href: "nav.xhtml", mediaType: "application/xhtml+xml", properties: "nav" },
      { id: "c1", href: "ch1.xhtml", mediaType: "application/xhtml+xml" },
      { id: "c2", href: "ch2.xhtml", mediaType: "application/xhtml+xml" },
      { id: "p1", href: "plate.xhtml", mediaType: "application/xhtml+xml" },
    ],
    spine: [
      { idref: "nav", linear: "no" },
      { idref: "c1" },
      { idref: "c2" },
      { idref: "p1" },
    ],
  });
  const entries: EpubEntries = {
    mimetype: mimetypeEntry(),
    "META-INF/container.xml": deflated(containerXml("content.opf")),
    "content.opf": deflated(opf),
    "nav.xhtml": deflated(nav),
    "ch1.xhtml": deflated(chapterXhtml("Chapter 1. Loomings", 0)),
    "ch2.xhtml": deflated(chapterXhtml("Chapter 2. The Carpet-Bag", 1)),
    "plate.xhtml": deflated(imagePlateXhtml("Plate", "images/plate-1.png")),
  };
  return { entries, tocXml: nav, tocKind: "nav", topLevelCount: 3 };
}

/** A paragraph of whitespace-collapse-hostile repeated separator runs. The
 * normalized text is PERIODIC: every 20-grapheme sample window drawn from it
 * occurs at N>1 offsets with IDENTICAL periodic prefix/suffix context, so the
 * SHIPPED TextQuoteSelector machinery cannot disambiguate and returns
 * "ambiguous" — exactly what the per-chapter round-trip anchor gate (SC#4,
 * stage level) refuses on. The D12-10 admission still passes (real block
 * mass: h2 + 3 non-empty paragraphs), so the chapter reaches the gate. */
function separatorRunParagraph(): string {
  return "* ".repeat(120).trim();
}

/** The anchor-hostile chapter document (readerable-looking, periodic text). */
function anchorHostileXhtml(title: string): string {
  const ps = [separatorRunParagraph(), separatorRunParagraph(), separatorRunParagraph()]
    .map((p) => `    <p>${p}</p>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
  <head>
    <title>${title}</title>
  </head>
  <body>
    <section>
      <h2>${title}</h2>
${ps}
    </section>
  </body>
</html>
`;
}

/** 21. anchorGateFailBook — one good chapter + one anchor-hostile chapter:
 * the adapter ADMITS both (D12-10 judges block mass, not anchorability), but
 * the hostile chapter's normalized text round-trips ambiguously, so the
 * PER-CHAPTER anchor gate (12-04's stage-level skip path, D12-11) skips and
 * discloses it end-to-end. */
function anchorGateFailBookSpec(): FixtureSpec {
  const toc: TocEntry[] = [
    { label: "Chapter 1. Loomings", href: "ch1.xhtml" },
    { label: "Chapter 2. The Gauntlet", href: "ch2.xhtml" },
  ];
  const nav = navDocXml("Contents", toc);
  const opf = opfXml({
    version: "3.0",
    title: "The Synthetic Book",
    authors: ["Ada Author"],
    language: "en",
    identifier: "urn:uuid:synthetic-book-anchor-gate",
    manifest: [
      { id: "nav", href: "nav.xhtml", mediaType: "application/xhtml+xml", properties: "nav" },
      { id: "c1", href: "ch1.xhtml", mediaType: "application/xhtml+xml" },
      { id: "c2", href: "ch2.xhtml", mediaType: "application/xhtml+xml" },
    ],
    spine: [{ idref: "nav", linear: "no" }, { idref: "c1" }, { idref: "c2" }],
  });
  const entries: EpubEntries = {
    mimetype: mimetypeEntry(),
    "META-INF/container.xml": deflated(containerXml("content.opf")),
    "content.opf": deflated(opf),
    "nav.xhtml": deflated(nav),
    "ch1.xhtml": deflated(chapterXhtml("Chapter 1. Loomings", 0)),
    // STORED: this document IS the fixture's marker carrier (the periodic
    // separator runs must be byte-visible to the self-check).
    "ch2.xhtml": stored(anchorHostileXhtml("Chapter 2. The Gauntlet")),
  };
  return { entries, tocXml: nav, tocKind: "nav", topLevelCount: 2 };
}

// ── Declared-size patch (the 09-04 technique — never materialize bytes) ─────

/** Patch the zip CENTRAL DIRECTORY's declared uncompressed size for one
 * entry — exactly the "declares an originalSize over the cap" semantics.
 * fflate's unzip filter reads this metadata value and skips the entry
 * without ever inflating it. Adapted from tests/unit/portability/
 * validate-bundle.test.ts patchDeclaredUncompressedSize (Plan 09-04). */
function patchDeclaredUncompressedSize(
  zip: Uint8Array,
  entryName: string,
  newSize: number,
): Uint8Array {
  const out = new Uint8Array(zip); // own copy
  const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
  // Locate the End Of Central Directory record (signature 0x06054B50).
  let e = out.length - 22;
  for (; e >= 0; --e) {
    if (dv.getUint32(e, true) === 0x06054b50) break;
  }
  if (e < 0) throw new Error("EOCD not found");
  const count = dv.getUint16(e + 8, true);
  let o = dv.getUint32(e + 16, true); // central directory offset
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(o, true) !== 0x02014b50) throw new Error("bad CD entry");
    const nameLen = dv.getUint16(o + 28, true);
    const extraLen = dv.getUint16(o + 30, true);
    const commentLen = dv.getUint16(o + 32, true);
    const name = dec.decode(out.subarray(o + 46, o + 46 + nameLen));
    if (name === entryName) {
      dv.setUint32(o + 24, newSize, true); // uncompressed-size field
      return out;
    }
    o += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`entry ${entryName} not found in central directory`);
}

/** The inverse read — the self-check verifies the bomb entry's DECLARED size. */
function readDeclaredUncompressedSize(zip: Uint8Array, entryName: string): number {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let e = zip.length - 22;
  for (; e >= 0; --e) {
    if (dv.getUint32(e, true) === 0x06054b50) break;
  }
  if (e < 0) throw new Error("EOCD not found");
  const count = dv.getUint16(e + 8, true);
  let o = dv.getUint32(e + 16, true);
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    const nameLen = dv.getUint16(o + 28, true);
    const extraLen = dv.getUint16(o + 30, true);
    const commentLen = dv.getUint16(o + 32, true);
    const name = dec.decode(zip.subarray(o + 46, o + 46 + nameLen));
    if (name === entryName) return dv.getUint32(o + 24, true);
    o += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`entry ${entryName} not found in central directory`);
}

/** 17. bombEntryBook — valid book plus one entry whose DECLARED originalSize
 * is over EPUB_MAX_ENTRY_BYTES (64MiB + 1), crafted by patching the zip size
 * fields post-zipSync. The inflated bytes are NEVER materialized — the tiny
 * real content stays tiny; only the central-directory LIE is huge. */
function bombEntryBookSpec(): FixtureSpec {
  const spec = markerShellSpec({ identifier: "urn:uuid:synthetic-book-bomb" });
  spec.entries["bomb.xhtml"] = deflated(chapterXhtml("Bomb Entry", 0));
  return spec;
}

// ── Exported builders (each returns a fresh deterministic Uint8Array) ───────

function zipBook(spec: FixtureSpec): Uint8Array {
  return zipSync(spec.entries);
}

/** 1. EPUB 3 canonical: 4 top-level TOC entries, 4 readerable chapters. */
export function validBookEpub3(): Uint8Array {
  return zipBook(validBookEpub3Spec());
}

/** 2. Publisher chapter-split: ch1a + ch1b merge into TOC entry 1 (D12-09). */
export function publisherSplitBook(): Uint8Array {
  return zipBook(publisherSplitBookSpec());
}

/** 3. EPUB 2 NCX-only navigation (spine toc="ncx"). */
export function ncxOnlyBook(): Uint8Array {
  return zipBook(ncxOnlyBookSpec());
}

/** 4. OEBPS-nested OPF + text/ chapters (Pitfall 1 href normalization). */
export function oebpsNestedBook(): Uint8Array {
  return zipBook(oebpsNestedBookSpec());
}

/** 5. Deeply nested nav (3 chapters under depth-2/3 sections — Pitfall 4). */
export function deepNavBook(): Uint8Array {
  return zipBook(deepNavBookSpec());
}

/** 6. Degenerate single-entry TOC wrapping 4 children (descent case). */
export function degenerateTocBook(): Uint8Array {
  return zipBook(degenerateTocBookSpec());
}

/** 7. Leading front matter (title + copyright pages) before TOC chapters. */
export function frontMatterBook(): Uint8Array {
  return zipBook(frontMatterBookSpec());
}

/** 8. Adobe ADEPT DRM: rights.xml + encryption.xml with ADEPT encryptedKey. */
export function drmAdeptBook(): Uint8Array {
  return zipBook(drmAdeptBookSpec());
}

/** 9. Readium LCP DRM: META-INF/license.lcpl present. */
export function drmLcpBook(): Uint8Array {
  return zipBook(drmLcpBookSpec());
}

/** 10. Unknown-vendor encryption algorithm (allowlist refusal). */
export function drmUnknownAlgBook(): Uint8Array {
  return zipBook(drmUnknownAlgBookSpec());
}

/** 11. Font-obfuscation-only encryption — PASSES the DRM gate (OCF §4.4.5). */
export function fontObfuscatedBook(): Uint8Array {
  return zipBook(fontObfuscatedBookSpec());
}

/** 12. Not a zip at all — literal ASCII bytes (the epub-unreadable class). */
export function corruptNotEpub(): Uint8Array {
  return strToU8(CORRUPT_MARKER);
}

/** 13. Valid zip with chapters but no META-INF/container.xml. */
export function missingContainerBook(): Uint8Array {
  return zipBook(missingContainerBookSpec());
}

/** 14. OPF embedding nested ENTITY declarations (billion-laughs shape). */
export function entityBombOpf(): Uint8Array {
  return zipBook(entityBombOpfSpec());
}

/** 15. OPF with a literal __proto__ element name in metadata. */
export function protoPollutionOpf(): Uint8Array {
  return zipBook(protoPollutionOpfSpec());
}

/** 16. Valid book plus an extra ../../evil.xhtml traversal entry. */
export function zipSlipBook(): Uint8Array {
  return zipBook(zipSlipBookSpec());
}

/** 17. Valid book plus one entry DECLARING over-cap originalSize (64MiB+1)
 * — patched metadata only; the inflated bytes never exist. */
export function bombEntryBook(): Uint8Array {
  return patchDeclaredUncompressedSize(
    zipBook(bombEntryBookSpec()),
    "bomb.xhtml",
    BOMB_ENTRY_DECLARED_SIZE,
  );
}

/** 18. Chapter embedding remote https + relative image srcs with text. */
export function imageChapterBook(): Uint8Array {
  return zipBook(imageChapterBookSpec());
}

/** 19. Valid structure, every spine document a pure-image plate → epub-empty. */
export function emptyBook(): Uint8Array {
  return zipBook(emptyBookSpec());
}

/** 20. Two readerable chapters + one pure-image plate → skippedCount 1. */
export function mixedAdmissionBook(): Uint8Array {
  return zipBook(mixedAdmissionBookSpec());
}

/** 21. Good chapter + anchor-hostile periodic chapter → the per-chapter
 * round-trip anchor gate (stage level, 12-04) skips and discloses it. */
export function anchorGateFailBook(): Uint8Array {
  return zipBook(anchorGateFailBookSpec());
}

// ── Self-check helpers ───────────────────────────────────────────────────────

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** ASCII/UTF-8 substring presence over raw bytes (markers are ASCII; stored
 * entries keep them visible in the built zip). */
function bytesInclude(zip: Uint8Array, needle: string): boolean {
  const n = strToU8(needle);
  outer: for (let i = 0; i + n.length <= zip.length; i++) {
    for (let j = 0; j < n.length; j++) {
      if (zip[i + j] !== n[j]) continue outer;
    }
    return true;
  }
  return false;
}

/** Assert the first zip entry is the STORED EPUB mimetype (OCF §4.3.3):
 * local header at offset 0, filename "mimetype", content the exact media
 * string immediately after the (variable-length) header. */
function checkMimetypeFirst(zip: Uint8Array, name: string, problems: string[]): void {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  if (dv.getUint32(0, true) !== 0x04034b50) {
    problems.push(`${name}: first entry is not a zip local file header`);
    return;
  }
  const nameLen = dv.getUint16(26, true);
  const extraLen = dv.getUint16(28, true);
  const firstName = new TextDecoder().decode(zip.subarray(30, 30 + nameLen));
  if (firstName !== "mimetype") {
    problems.push(`${name}: first entry is "${firstName}", not "mimetype"`);
    return;
  }
  const contentStart = 30 + nameLen + extraLen;
  const media = new TextDecoder().decode(
    zip.subarray(contentStart, contentStart + EPUB_MIMETYPE.length),
  );
  if (media !== EPUB_MIMETYPE) {
    problems.push(`${name}: mimetype content is ${JSON.stringify(media)}`);
  }
}

/** The tiny in-module TOC counter (the D12-09 partition input): counts
 * top-level nav <li> entries by their exact 8-space indentation contract. */
function countNavTopLevelEntries(navXhtml: string): number {
  const m = navXhtml.match(/^ {8}<li>/gm);
  return m === null ? 0 : m.length;
}

/** NCX flavor: counts top-level navPoints by their 4-space contract. */
function countNcxTopLevelNavPoints(ncxXmlText: string): number {
  const m = ncxXmlText.match(/^ {4}<navPoint id=/gm);
  return m === null ? 0 : m.length;
}

// ── Module-load self-check (throws on any violation) ────────────────────────

interface NamedFixture {
  name: string;
  build: () => Uint8Array;
  spec: () => FixtureSpec | null;
}

const FIXTURES: NamedFixture[] = [
  { name: "validBookEpub3", build: validBookEpub3, spec: validBookEpub3Spec },
  { name: "publisherSplitBook", build: publisherSplitBook, spec: publisherSplitBookSpec },
  { name: "ncxOnlyBook", build: ncxOnlyBook, spec: ncxOnlyBookSpec },
  { name: "oebpsNestedBook", build: oebpsNestedBook, spec: oebpsNestedBookSpec },
  { name: "deepNavBook", build: deepNavBook, spec: deepNavBookSpec },
  { name: "degenerateTocBook", build: degenerateTocBook, spec: degenerateTocBookSpec },
  { name: "frontMatterBook", build: frontMatterBook, spec: frontMatterBookSpec },
  { name: "drmAdeptBook", build: drmAdeptBook, spec: drmAdeptBookSpec },
  { name: "drmLcpBook", build: drmLcpBook, spec: drmLcpBookSpec },
  { name: "drmUnknownAlgBook", build: drmUnknownAlgBook, spec: drmUnknownAlgBookSpec },
  { name: "fontObfuscatedBook", build: fontObfuscatedBook, spec: fontObfuscatedBookSpec },
  { name: "corruptNotEpub", build: corruptNotEpub, spec: () => null },
  { name: "missingContainerBook", build: missingContainerBook, spec: missingContainerBookSpec },
  { name: "entityBombOpf", build: entityBombOpf, spec: entityBombOpfSpec },
  { name: "protoPollutionOpf", build: protoPollutionOpf, spec: protoPollutionOpfSpec },
  { name: "zipSlipBook", build: zipSlipBook, spec: zipSlipBookSpec },
  { name: "bombEntryBook", build: bombEntryBook, spec: bombEntryBookSpec },
  { name: "imageChapterBook", build: imageChapterBook, spec: imageChapterBookSpec },
  { name: "emptyBook", build: emptyBook, spec: emptyBookSpec },
  { name: "mixedAdmissionBook", build: mixedAdmissionBook, spec: mixedAdmissionBookSpec },
  { name: "anchorGateFailBook", build: anchorGateFailBook, spec: anchorGateFailBookSpec },
];

function selfCheck(): void {
  const problems: string[] = [];
  const built = new Map<string, Uint8Array>();

  // 1. Determinism — every fixture rebuilds byte-identically.
  for (const f of FIXTURES) {
    built.set(f.name, f.build());
  }
  for (const f of FIXTURES) {
    const first = built.get(f.name) as Uint8Array;
    if (!bytesEqual(first, f.build())) {
      problems.push(`${f.name}: non-deterministic rebuild (first != second)`);
    }
  }

  // 2. mimetype-first on every zip that declares one (all specs except
  //    corruptNotEpub, which is not a zip at all).
  for (const f of FIXTURES) {
    if (f.name === "corruptNotEpub") continue;
    checkMimetypeFirst(built.get(f.name) as Uint8Array, f.name, problems);
  }

  // 3. Discriminator presence (+ absence where absence IS the point).
  const disc = (name: string, needle: string, mustBePresent: boolean): void => {
    const zip = built.get(name) as Uint8Array;
    const present = bytesInclude(zip, needle);
    if (present !== mustBePresent) {
      problems.push(
        `${name}: discriminator ${JSON.stringify(needle)} is ${
          present ? "present" : "absent"
        } (expected ${mustBePresent ? "present" : "absent"})`,
      );
    }
  };
  disc("drmAdeptBook", ADEPT_MARKER, true);
  disc("drmAdeptBook", "encryptedKey", true);
  disc("drmAdeptBook", "META-INF/rights.xml", true);
  disc("drmLcpBook", "META-INF/license.lcpl", true);
  disc("drmLcpBook", "readium.org/lcp", true);
  disc("drmUnknownAlgBook", VENDOR_ALGORITHM, true);
  disc("drmUnknownAlgBook", FONT_OBFUSCATION_ALGORITHM, false);
  disc("fontObfuscatedBook", FONT_OBFUSCATION_ALGORITHM, true);
  disc("corruptNotEpub", CORRUPT_MARKER, true);
  disc("missingContainerBook", "META-INF/container.xml", false);
  disc("entityBombOpf", "<!ENTITY", true);
  disc("entityBombOpf", "&a2;&a2;&a2;", true);
  disc("protoPollutionOpf", "<__proto__>", true);
  disc("zipSlipBook", "../../evil.xhtml", true);
  disc("imageChapterBook", "https://attacker.example/track.png", true);
  disc("imageChapterBook", "images/figure-1.png", true);
  disc("anchorGateFailBook", "* * * * * * * * * * * * * * * * * *", true);

  // bombEntryBook: the DECLARED central-directory size must equal the
  // exported lie (the 12-02 spec asserts it exceeds the REAL
  // EPUB_MAX_ENTRY_BYTES from server/limits — that coupling lives there).
  const bombDeclared = readDeclaredUncompressedSize(
    built.get("bombEntryBook") as Uint8Array,
    "bomb.xhtml",
  );
  if (bombDeclared !== BOMB_ENTRY_DECLARED_SIZE) {
    problems.push(
      `bombEntryBook: declared originalSize ${bombDeclared} does not equal the exported BOMB_ENTRY_DECLARED_SIZE (${BOMB_ENTRY_DECLARED_SIZE})`,
    );
  }

  // 4 + 5. TOC counting — every counted spec matches its declared chapter
  // unit count, and the named pair genuinely diverges (4 vs 3).
  const counted = new Map<string, number>();
  for (const f of FIXTURES) {
    const spec = f.spec();
    if (spec === null || spec.tocXml === null || spec.topLevelCount === null) continue;
    const n =
      spec.tocKind === "nav"
        ? countNavTopLevelEntries(spec.tocXml)
        : countNcxTopLevelNavPoints(spec.tocXml);
    counted.set(f.name, n);
    if (n !== spec.topLevelCount) {
      problems.push(
        `${f.name}: counted ${n} top-level ${spec.tocKind} entries, expected ${spec.topLevelCount}`,
      );
    }
  }
  const validCount = counted.get("validBookEpub3");
  const splitCount = counted.get("publisherSplitBook");
  if (validCount === undefined || splitCount === undefined || validCount === splitCount) {
    problems.push(
      `divergence failure: validBookEpub3 (${validCount}) must differ from publisherSplitBook (${splitCount}) — the matrix has silently flattened`,
    );
  }
  if (counted.get("ncxOnlyBook") !== 3) {
    problems.push("ncxOnlyBook: expected exactly 3 top-level navPoints");
  }

  if (problems.length > 0) {
    throw new Error(
      `epub-fixtures self-check FAILED (${problems.length} violation(s)):\n  - ${problems.join(
        "\n  - ",
      )}`,
    );
  }
}

// The 10-04 seed-time self-verification precedent: run on import so any
// consumer (12-02/12-04/12-05 specs, the verify command, vitest collection)
// fails fast when the matrix loses discriminating power.
selfCheck();
