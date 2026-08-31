// tests/unit/server/fetchImageAsset.spec.ts
// Plan 20-01 Task 3 — the sniff + typed-refusal matrix (IMG-02). Table-driven
// over authentic minimal image bytes (hand-crafted headers verified against
// image-size@2.0.2 + is-animated@2.0.2 during implementation research). DNS is
// controlled via vi.mock("node:dns"); fetch via vi.stubGlobal — the
// safe-fetch.spec.ts pattern.
//
// Contract under test (D20-05/D20-08/D20-09/D20-10):
//   - every refusal is a RETURNED TYPED VALUE — no cell uses expected-throw
//     assertions anywhere in this file
//   - the sniffed type is AUTHORITATIVE over any content-type header
//   - the sniff sequence order: bytes → type → pixels → animated → EXIF swap
//
// Byte-craft notes (verified against both libraries' sources):
//   - image-size reports the JPEG type string as "jpg" — the module normalizes
//     it onto the "jpeg" arm; the matrix asserts contentType "image/jpeg".
//   - is-animated@2.x requires a Node Buffer (it calls toString("ascii") and
//     readUInt32BE, which plain Uint8Array lacks — a plain Uint8Array silently
//     reports NOT-animated for GIF/PNG). The module wraps bytes in a zero-copy
//     Buffer view; an animated-GIF cell here locks that wiring in place.
//   - an animated GIF needs ≥2 image descriptors (the library counts
//     descriptors, NETSCAPE2.0 alone is inert); an animated WebP needs an
//     ANIM chunk; an APNG needs acTL + fcTL + IDAT + fcTL + fdAT.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock node:dns so each test controls resolve4/resolve6 return values.
vi.mock("node:dns", () => ({
  default: {
    promises: {
      resolve4: vi.fn(),
      resolve6: vi.fn(),
    },
  },
}));

import dns from "node:dns";
import {
  fetchImageAsset,
  sniffImageAsset,
  type ImageAsset,
} from "../../../server/fetchImageAsset";
import { MAX_ASSET_BYTES, MAX_ASSET_PIXELS } from "../../../src/ingestion/types";

const resolve4Mock = dns.promises.resolve4 as unknown as ReturnType<typeof vi.fn>;
const resolve6Mock = dns.promises.resolve6 as unknown as ReturnType<typeof vi.fn>;

// ── Authentic minimal image bytes ────────────────────────────────────────────

const u8 = (...bs: number[]) => new Uint8Array(bs);
const fromHex = (h: string) =>
  new Uint8Array(h.match(/../g)!.map((b) => parseInt(b, 16)));

const PNG_SIG = fromHex("89504e470d0a1a0a");

/** PNG chunk: BE length (payload only) + type + payload + CRC zeros. */
const pngChunk = (type: string, payload: Uint8Array) =>
  u8(
    0, 0, (payload.length >> 8) & 0xff, payload.length & 0xff,
    ...fromHex(Buffer.from(type, "ascii").toString("hex")),
    ...payload,
    0, 0, 0, 0,
  );

const pngIhdr = (w: number, h: number) =>
  u8(
    ...PNG_SIG,
    ...pngChunk("IHDR", u8(
      (w >>> 24) & 0xff, (w >>> 16) & 0xff, (w >>> 8) & 0xff, w & 0xff,
      (h >>> 24) & 0xff, (h >>> 16) & 0xff, (h >>> 8) & 0xff, h & 0xff,
      8, 2, 0, 0, 0, // bit depth, truecolor, comp, filter, interlace
    )),
  );

/** One GIF image descriptor + LZW data (the classic 1x1 clear+code block). */
const gifImageBlock = u8(
  0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // desc 1x1@0,0, no LCT
  0x02, // LZW min code size
  0x02, 0x44, 0x01, // data sub-block
  0x00, // terminator
);

const gifHeader = u8(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00);

const STATIC_GIF = u8(...gifHeader, ...gifImageBlock, 0x3b);

const NETSCAPE_EXT = u8(
  0x21, 0xff, 0x0b,
  0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30, // NETSCAPE2.0
  0x03, 0x01, 0x00, 0x00, // loop sub-block
  0x00,
);

const ANIMATED_GIF = u8(
  ...gifHeader, ...NETSCAPE_EXT, ...gifImageBlock, ...gifImageBlock, 0x3b,
);

const STATIC_PNG = pngIhdr(1, 1);

const PIXEL_BOMB_PNG = pngIhdr(65000, 65000); // 4.2B declared pixels

const APNG = u8(
  ...pngIhdr(1, 1),
  ...pngChunk("acTL", u8(0, 0, 0, 2, 0, 0, 0, 0)), // 2 frames
  ...pngChunk("fcTL", new Uint8Array(26)),
  ...pngChunk("IDAT", u8(0x78, 0x01)),
  ...pngChunk("fcTL", new Uint8Array(26)),
  ...pngChunk("fdAT", u8(0, 0, 0, 1)),
);

const STATIC_WEBP = u8(
  ...fromHex("52494646"), // RIFF
  0x11, 0x00, 0x00, 0x00, // size 17
  ...fromHex("57454250"), // WEBP
  ...fromHex("5650384c"), // VP8L (lossless — no VP8X/ANIM)
  0x05, 0x00, 0x00, 0x00, // chunk size 5
  0x2f, 0x00, 0x00, 0x00, 0x00, // sig + w-1/h-1/alpha/version → 1x1
);

const ANIMATED_WEBP = u8(
  ...fromHex("52494646"), // RIFF
  0x24, 0x00, 0x00, 0x00, // size 36
  ...fromHex("57454250"), // WEBP
  ...fromHex("56503858"), // VP8X (extended)
  0x0a, 0x00, 0x00, 0x00, // chunk size 10
  0x02, // flags: ANIMATION
  0x00, 0x00, 0x00, // reserved
  0x00, 0x00, 0x00, // canvas w-1
  0x00, 0x00, 0x00, // canvas h-1
  ...fromHex("414e494d"), // ANIM (what is-animated scans for)
  0x06, 0x00, 0x00, 0x00, // chunk size 6
  0x00, 0x00, 0x00, 0x00, // bg color
  0x00, 0x00, // loop count
);

/** ISO-BMFF box: BE size (header incl.) + type + payload. */
const bmffBox = (type: string, payload: Uint8Array) => {
  const body = u8(...fromHex(Buffer.from(type, "ascii").toString("hex")), ...payload);
  const size = body.length + 4;
  return u8((size >>> 24) & 0xff, (size >>> 16) & 0xff, (size >>> 8) & 0xff, size & 0xff, ...body);
};

const AVIF = u8(
  ...bmffBox("ftyp", u8(
    ...fromHex("61766966"), // major brand "avif"
    0, 0, 0, 0, // minor version
    ...fromHex("617669666d6966316d616631"), // compatible brands avif/mif1/maf1
  )),
  ...bmffBox("meta", u8(
    0, 0, 0, 0, // full-box version/flags
    ...bmffBox("iprp", u8(
      ...bmffBox("ipco", u8(
        ...bmffBox("ispe", u8(0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1)), // v/flags + 1x1 BE
      )),
    )),
  )),
);

/** JPEG with a complete SOF0 (w, h) + JFIF APP0 — parses in image-size. */
const jpegSof = (w: number, h: number) =>
  u8(
    ...fromHex("ffd8"), // SOI
    ...fromHex("ffe000104a46494600"), 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, // APP0 JFIF
    ...fromHex("ffc0000b08"), // SOF0 len 11 precision 8
    (h >> 8) & 0xff, h & 0xff, (w >> 8) & 0xff, w & 0xff,
    0x01, 0x01, 0x11, 0x00, // 1 component
    ...fromHex("ffd9"), // EOI
  );

/** JPEG with an APP1 Exif IFD0 orientation entry + SOF0 (w, h). */
const jpegExif = (orientation: number, w: number, h: number) =>
  u8(
    ...fromHex("ffd8"),
    ...fromHex("ffe1"), 0x00, 0x22, // APP1 len 34
    ...fromHex("457869660000"), // "Exif\0\0"
    ...fromHex("49492a00"), 0x08, 0x00, 0x00, 0x00, // TIFF LE, IFD0 @8
    0x01, 0x00, // 1 entry
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00, // 0x0112 SHORT
    0x00, 0x00, 0x00, 0x00, // next IFD
    ...fromHex("ffc0000b08"), (h >> 8) & 0xff, h & 0xff, (w >> 8) & 0xff, w & 0xff,
    0x01, 0x01, 0x11, 0x00,
    ...fromHex("ffd9"),
  );

const STATIC_JPEG = jpegSof(2, 1);
const ROTATED_JPEG = jpegExif(6, 2, 1); // orientation 6, stored header 2x1
const UPRIGHT_JPEG = jpegExif(1, 2, 1); // orientation 1, stored header 2x1

const SVG_BYTES = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
);

// ── Fetch harness ────────────────────────────────────────────────────────────

let arrayBufferCallCount = 0;
let fetchMock: ReturnType<typeof vi.fn>;

function fakeImageResponse(opts: {
  headers?: Record<string, string>;
  byteBody: Uint8Array;
}): Response {
  const headers = new Headers(opts.headers ?? {});
  return {
    status: 200,
    ok: true,
    url: "https://cdn.example.com/pic",
    headers,
    arrayBuffer: async () => {
      arrayBufferCallCount++;
      return opts.byteBody.slice().buffer;
    },
    text: async () => {
      throw new Error("image profile must never read text()");
    },
  } as Response;
}

beforeEach(() => {
  resolve4Mock.mockReset();
  resolve6Mock.mockReset();
  arrayBufferCallCount = 0;
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** DNS + fetch wired for a successful public fetch of `bytes`. */
function serveBytes(bytes: Uint8Array, headers: Record<string, string> = {}) {
  resolve4Mock.mockResolvedValue(["93.184.216.34"]);
  resolve6Mock.mockResolvedValue([]);
  fetchMock.mockResolvedValueOnce(
    fakeImageResponse({ headers, byteBody: bytes }),
  );
}

// ── sniffImageAsset — the network-free seam (20-06 EPUB reuse) ───────────────

describe("sniffImageAsset valid formats (D20-08 raster set)", () => {
  const cases: Array<[string, Uint8Array, ImageAsset["contentType"], number, number]> = [
    ["jpeg", STATIC_JPEG, "image/jpeg", 2, 1],
    ["png", STATIC_PNG, "image/png", 1, 1],
    ["webp", STATIC_WEBP, "image/webp", 1, 1],
    ["gif", STATIC_GIF, "image/gif", 1, 1],
    ["avif", AVIF, "image/avif", 1, 1],
  ];

  it.each(cases)("admits a valid %s and returns the ImageAsset shape", (_fmt, bytes, contentType, w, h) => {
    const result = sniffImageAsset(bytes);
    if (typeof result === "string") throw new Error(`expected ImageAsset, got refusal ${result}`);
    expect(result.contentType).toBe(contentType);
    expect(result.width).toBe(w);
    expect(result.height).toBe(h);
    expect(result.bytes).toBe(bytes); // zero-copy: the same buffer, never a clone
  });

  it("assetId is img-<12 lowercase hex> derived from the byte content (D7-07)", () => {
    const result = sniffImageAsset(STATIC_PNG);
    if (typeof result === "string") throw new Error("expected ImageAsset");
    expect(result.assetId).toMatch(/^img-[a-z0-9]{12}$/);
  });

  it("identical bytes self-identify: same assetId across calls (content-hash determinism)", () => {
    const a = sniffImageAsset(STATIC_PNG);
    const b = sniffImageAsset(STATIC_PNG.slice()); // equal content, distinct buffer
    if (typeof a === "string" || typeof b === "string") throw new Error("expected ImageAssets");
    expect(a.assetId).toBe(b.assetId);
  });

  it("different bytes produce different assetIds", () => {
    const a = sniffImageAsset(STATIC_PNG);
    const b = sniffImageAsset(STATIC_GIF);
    if (typeof a === "string" || typeof b === "string") throw new Error("expected ImageAssets");
    expect(a.assetId).not.toBe(b.assetId);
  });
});

describe("sniffImageAsset typed refusals (never throws — D20-05)", () => {
  it("refuses SVG bytes with \"type\" (D20-10 — raster-only media boundary)", () => {
    expect(sniffImageAsset(SVG_BYTES)).toBe("type");
  });

  it("refuses undetectable garbage bytes with \"type\" (imageSize throw → typed refusal)", () => {
    expect(sniffImageAsset(new Uint8Array(32).fill(0x41))).toBe("type");
  });

  it("refuses a declared pixel bomb with \"pixels\" (65,000×65,000 PNG — T-20-03)", () => {
    expect(sniffImageAsset(PIXEL_BOMB_PNG)).toBe("pixels");
  });

  it("admits a legitimate large-but-under-cap canvas (cap is a bomb-stopper, not a reader limiter — D20-11)", () => {
    // 4000×4000 = 16,000,000 pixels — under the 16,777,216 cap.
    expect(sniffImageAsset(pngIhdr(4000, 4000))).toMatchObject({ width: 4000, height: 4000 });
  });

  it("refuses bytes over MAX_ASSET_BYTES with \"bytes\" (decoded-byte cap)", () => {
    expect(sniffImageAsset(new Uint8Array(MAX_ASSET_BYTES + 1))).toBe("bytes");
  });

  it("admits bytes at exactly MAX_ASSET_BYTES (boundary is inclusive)", () => {
    // At-cap zeros fail the type sniff (not bytes) — proving the byte gate
    // itself passed at exactly the cap.
    expect(sniffImageAsset(new Uint8Array(MAX_ASSET_BYTES))).toBe("type");
  });

  it.each([
    ["animated GIF (2 image descriptors + NETSCAPE2.0)", ANIMATED_GIF],
    ["animated WebP (VP8X + ANIM)", ANIMATED_WEBP],
    ["APNG (acTL + fcTL + IDAT + fcTL + fdAT)", APNG],
  ])("refuses an %s with \"animated\" (D20-09)", (_label, bytes) => {
    expect(sniffImageAsset(bytes)).toBe("animated");
  });

  it.each([
    ["static GIF", STATIC_GIF],
    ["static PNG", STATIC_PNG],
    ["static WebP", STATIC_WEBP],
  ])("admits the %s form of an animation-capable type (D20-09 — static passes)", (_label, bytes) => {
    expect(typeof sniffImageAsset(bytes)).toBe("object");
  });
});

describe("sniffImageAsset EXIF orientation (Pitfall 2 — reserved-geometry correctness)", () => {
  it("orientation >= 5 swaps stored width/height so the reserved box matches the rendered aspect", () => {
    // Stored header 2x1 (landscape); EXIF orientation 6 renders portrait 1x2.
    const result = sniffImageAsset(ROTATED_JPEG);
    if (typeof result === "string") throw new Error("expected ImageAsset");
    expect(result.width).toBe(1);
    expect(result.height).toBe(2);
    expect(result.contentType).toBe("image/jpeg");
  });

  it("orientation < 5 leaves stored width/height untouched (upright metadata is inert)", () => {
    const result = sniffImageAsset(UPRIGHT_JPEG);
    if (typeof result === "string") throw new Error("expected ImageAsset");
    expect(result.width).toBe(2);
    expect(result.height).toBe(1);
  });

  it("absent EXIF (plain JFIF JPEG) leaves stored width/height untouched", () => {
    const result = sniffImageAsset(STATIC_JPEG);
    if (typeof result === "string") throw new Error("expected ImageAsset");
    expect(result.width).toBe(2);
    expect(result.height).toBe(1);
  });
});

// ── fetchImageAsset — the network wrapper over safeFetchCore ─────────────────

describe("fetchImageAsset (network path — the ONLY asset egress)", () => {
  it("fetches + sniffs a valid PNG served under an honest image/png header", async () => {
    serveBytes(STATIC_PNG, { "content-type": "image/png" });
    const result = await fetchImageAsset("https://cdn.example.com/pic");
    if (typeof result === "string") throw new Error(`expected ImageAsset, got ${result}`);
    expect(result.contentType).toBe("image/png");
    expect(result.width).toBe(1);
    expect(result.assetId).toMatch(/^img-[a-z0-9]{12}$/);
    expect(arrayBufferCallCount).toBe(1);
  });

  it("SVG bytes under a LYING image/png header refuse \"type\" — the sniff overrules the header (T-20-02, D20-10)", async () => {
    serveBytes(SVG_BYTES, { "content-type": "image/png" });
    const result = await fetchImageAsset("https://cdn.example.com/evil.png");
    expect(result).toBe("type");
  });

  it("a private-IP host refuses \"fetch\" BEFORE any network call (the 9 measures are the same pipeline — T-20-01)", async () => {
    resolve4Mock.mockResolvedValue(["10.0.0.1"]);
    resolve6Mock.mockResolvedValue([]);
    const result = await fetchImageAsset("http://10.0.0.1/pic.png");
    expect(result).toBe("fetch");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a non-image content-type header refuses \"fetch\" with the body NEVER read (calm early refusal, Measure 7)", async () => {
    serveBytes(STATIC_PNG, { "content-type": "text/html; charset=utf-8" });
    const result = await fetchImageAsset("https://cdn.example.com/not-an-image");
    expect(result).toBe("fetch");
    expect(arrayBufferCallCount).toBe(0);
  });

  it("an over-cap content-length header refuses \"fetch\" with the body NEVER read", async () => {
    serveBytes(STATIC_PNG, {
      "content-type": "image/png",
      "content-length": String(MAX_ASSET_BYTES + 1),
    });
    const result = await fetchImageAsset("https://cdn.example.com/huge.png");
    expect(result).toBe("fetch");
    expect(arrayBufferCallCount).toBe(0);
  });

  it("a network-level fetch failure refuses \"fetch\" (never a thrown TypeError — D20-05 composure)", async () => {
    resolve4Mock.mockResolvedValue(["93.184.216.34"]);
    resolve6Mock.mockResolvedValue([]);
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const result = await fetchImageAsset("https://cdn.example.com/down.png");
    expect(result).toBe("fetch");
  });

  it("a redirect is followed under the SAME profile and the final bytes are sniffed (per-hop re-validation)", async () => {
    resolve4Mock.mockResolvedValue(["93.184.216.34"]);
    resolve6Mock.mockResolvedValue([]);
    fetchMock
      .mockResolvedValueOnce({
        status: 302,
        ok: false,
        url: "https://cdn.example.com/old.png",
        headers: new Headers({ location: "https://cdn.example.com/new.png" }),
      } as Response)
      .mockResolvedValueOnce(
        fakeImageResponse({
          headers: { "content-type": "image/gif" },
          byteBody: STATIC_GIF,
        }),
      );
    const result = await fetchImageAsset("https://cdn.example.com/old.png");
    if (typeof result === "string") throw new Error(`expected ImageAsset, got ${result}`);
    expect(result.contentType).toBe("image/gif");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
