// src/fixtures/figure-assets.ts
// Phase 20 Plan 20-04 Task 1 — the bundled per-format fixture asset corpus.
// Tiny AUTHENTIC image bytes (real encoder output: ffmpeg for jpeg/png/gif,
// libwebp `cwebp` for webp, macOS `sips` for avif; the EXIF-orientation-6
// JPEG is the real 320x200 baseline JPEG with the 20-01 jpegExif APP1
// segment spliced in after SOI). The bytes DECODE in real browsers (the
// 20-08 decode-matrix + the happy-path e2e assert naturalWidth > 0), and
// they pass the shipped sniff libraries — verified at authoring time
// against image-size@2.0.2 + is-animated@2.0.2 (the exact versions the
// server sniffs with):
//
//   sample          bytes  image-size reports          animated
//   jpeg             612   320x200 jpg                  false
//   jpegExifRotated  648   320x200 jpg orientation 6    false  (stored dims swap → 200x320)
//   png              586   240x180 png                  false
//   webp              48   240x180 webp                 false
//   gif             2632   240x180 gif                  false
//   avif             418   240x180 avif                 false
//   animatedGif     5206   120x80 gif                   true   (2 frames + NETSCAPE2.0)
//
// `assetId` for every sample is img-<sha256(bytes).slice(0,12)> — the D7-07
// content-hash contract. The hash linkage is PROVEN, not asserted here: the
// happy-path e2e round-trips registry bytes through the client's
// validateEnvelopeAssets re-hash chain, and the 20-08 decode-matrix consumes
// the same rows in three engines. (Web Crypto's digest is async, so a
// module-load hash re-check is impossible in this browser-bundled module —
// the sync load guard below verifies the BYTE MAGIC instead, the 11-01
// generator precedent: a drifted sample throws at module load, failing the
// build loudly rather than shipping a silently-wrong fixture.)
//
// The registry maps the figure-heavy article id to AssetRecordRow-shaped
// entries. Rows NOT referenced by the article's blocks are inert (the
// provider resolves per-figure refs; the extras exist so the 20-08
// decode-matrix can seed every format without new fixtures — the
// orphan-entries-are-inert discipline Pattern 6 establishes for bundles).
// Fixtures NEVER touch Dexie: the provider consults this registry FIRST for
// fixture article ids (the inMemoryRepository discipline).
import { base64ToBytes } from "../ingestion/ingestCopy";
import type { AssetRecordRow } from "../persistence/db";

/**
 * One bundled sample: raw bytes (base64-embedded), its content-hash assetId,
 * and the D20-13 STORED dims (orientation-corrected — the EXIF sample's
 * header says 320x200 but orientation 6 renders 200x320, so 200x320 is what
 * the canonical model carries). `byteLength` mirrors the decoded length
 * (the envelope transport field).
 */
interface FixtureAssetSample {
  readonly key: string;
  readonly assetId: string;
  readonly contentType: AssetRecordRow["contentType"];
  readonly width: number;
  readonly height: number;
  readonly base64: string;
}

// Deterministic stamp for the fixture rows (AssetRecordSchema requires an
// ISO datetime; a fixed constant keeps the registry byte-stable across
// loads — the "keep it deterministic" contract).
const FIXTURE_CREATED_AT = "2026-08-31T00:00:00.000Z";

const SAMPLES: readonly FixtureAssetSample[] = [
  {
    key: "jpeg",
    assetId: "img-56ac63a15ecd",
    contentType: "image/jpeg",
    width: 320,
    height: 200,
    base64:
      "/9j/4AAQSkZJRgABAgAAAQABAAD//gAPTGF2YzYzLjEuMTAxAP/bAEMACAQEBAQEBQUFBQUFBgYGBgYGBgYGBgYGBgcHBwgICAcH" +
      "BwYGBwcICAgICQkJCAgICAkJCgoKDAwLCw4ODhERFP/EAEwAAQEAAAAAAAAAAAAAAAAAAAAFAQEBAAAAAAAAAAAAAAAAAAAABRAB" +
      "AAAAAAAAAAAAAAAAAAAAABEBAAAAAAAAAAAAAAAAAAAAAP/AABEIAMgBQAMBIgACEQADEQD/2gAMAwEAAhEDEQA/AJ4CCpAAAAAA" +
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
      "AAAAAAAAAAAAP//Z",
  },
    // The EXIF-orientation-6 sample: same real JPEG bytes with the 20-01
    // jpegExif(6, …) APP1 segment spliced after SOI. Header 320x200;
    // orientation ≥ 5 swaps the STORED dims (Pitfall 2 / D20-13) → 200x320.
  {
    key: "jpegExifRotated",
    assetId: "img-e191d5d4e581",
    contentType: "image/jpeg",
    width: 200,
    height: 320,
    base64:
      "/9j/4QAiRXhpZgAASUkqAAgAAAABABIBAwABAAAABgAAAAAAAAD/4AAQSkZJRgABAgAAAQABAAD//gAPTGF2YzYzLjEuMTAxAP/b" +
      "AEMACAQEBAQEBQUFBQUFBgYGBgYGBgYGBgYGBgcHBwgICAcHBwYGBwcICAgICQkJCAgICAkJCgoKDAwLCw4ODhERFP/EAEwAAQEA" +
      "AAAAAAAAAAAAAAAAAAAFAQEBAAAAAAAAAAAAAAAAAAAABRABAAAAAAAAAAAAAAAAAAAAABEBAAAAAAAAAAAAAAAAAAAAAP/AABEI" +
      "AMgBQAMBIgACEQADEQD/2gAMAwEAAhEDEQA/AJ4CCpAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP//Z",
  },
  {
    key: "png",
    assetId: "img-357de6805bda",
    contentType: "image/png",
    width: 240,
    height: 180,
    base64:
      "iVBORw0KGgoAAAANSUhEUgAAAPAAAAC0CAIAAAAl/ja/AAAACXBIWXMAAAABAAAAAQBPJcTWAAAB/ElEQVR4nO3SQQkAIQAAwROu" +
      "mF+D2D+CJQRhmUmwjx1rzw8q/tcBcJOhSTE0KYYmxdCkGJoUQ5NiaFIMTYqhSTE0KYYmxdCkGJoUQ5NiaFIMTYqhSTE0KYYmxdCk" +
      "GJoUQ5NiaFIMTYqhSTE0KYYmxdCkGJoUQ5NiaFIMTYqhSTE0KYYmxdCkGJoUQ5NiaFIMTYqhSTE0KYYmxdCkGJoUQ5NiaFIMTYqh" +
      "STE0KYYmxdCkGJoUQ5NiaFIMTYqhSTE0KYYmxdCkGJoUQ5NiaFIMTYqhSTE0KYYmxdCkGJoUQ5NiaFIMTYqhSTE0KYYmxdCkGJoU" +
      "Q5NiaFIMTYqhSTE0KYYmxdCkGJoUQ5NiaFIMTYqhSTE0KYYmxdCkGJoUQ5NiaFIMTYqhSTE0KYYmxdCkGJoUQ5NiaFIMTYqhSTE0" +
      "KYYmxdCkGJoUQ5NiaFIMTYqhSTE0KYYmxdCkGJoUQ5NiaFIMTYqhSTE0KYYmxdCkGJoUQ5NiaFIMTYqhSTE0KYYmxdCkGJoUQ5Ni" +
      "aFIMTYqhSTE0KYYmxdCkGJoUQ5NiaFIMTYqhSTE0KYYmxdCkGJoUQ5NiaFIMTYqhSTE0KYYmxdCkGJoUQ5NiaFIMTYqhSTE0KYYm" +
      "xdCkGJoUQ5NiaFIMTYqhSTE0KYYmxdCkGJoUQ5NiaFIMTYqhSTE0KQdqtQO/3y3mIAAAAABJRU5ErkJggg==",
  },
  {
    key: "webp",
    assetId: "img-869e9b853cd1",
    contentType: "image/webp",
    width: 240,
    height: 180,
    base64:
      "UklGRigAAABXRUJQVlA4TBsAAAAv78AsAAdQsyo1qP8BAkmb9c+//RH9T+6/FwEA",
  },
  {
    key: "gif",
    assetId: "img-47193b718582",
    contentType: "image/gif",
    width: 240,
    height: 180,
    base64:
      "R0lGODlh8AC0APcfMQAAACQAAEgAAGwAAJAAALQAANgAAPwAAAAkACQkAEgkAGwkAJAkALQkANgkAPwkAABIACRIAEhIAGxIAJBI" +
      "ALRIANhIAPxIAABsACRsAEhsAGxsAJBsALRsANhsAPxsAACQACSQAEiQAGyQAJCQALSQANiQAPyQAAC0ACS0AEi0AGy0AJC0ALS0" +
      "ANi0APy0AADYACTYAEjYAGzYAJDYALTYANjYAPzYAAD8ACT8AEj8AGz8AJD8ALT8ANj8APz8AAAAVSQAVUgAVWwAVZAAVbQAVdgA" +
      "VfwAVQAkVSQkVUgkVWwkVZAkVbQkVdgkVfwkVQBIVSRIVUhIVWxIVZBIVbRIVdhIVfxIVQBsVSRsVUhsVWxsVZBsVbRsVdhsVfxs" +
      "VQCQVSSQVUiQVWyQVZCQVbSQVdiQVfyQVQC0VSS0VUi0VWy0VZC0VbS0Vdi0Vfy0VQDYVSTYVUjYVWzYVZDYVbTYVdjYVfzYVQD8" +
      "VST8VUj8VWz8VZD8VbT8Vdj8Vfz8VQAAqiQAqkgAqmwAqpAAqrQAqtgAqvwAqgAkqiQkqkgkqmwkqpAkqrQkqtgkqvwkqgBIqiRI" +
      "qkhIqmxIqpBIqrRIqthIqvxIqgBsqiRsqkhsqmxsqpBsqrRsqthsqvxsqgCQqiSQqkiQqmyQqpCQqrSQqtiQqvyQqgC0qiS0qki0" +
      "qmy0qpC0qrS0qti0qvy0qgDYqiTYqkjYqmzYqpDYqrTYqtjYqvzYqgD8qiT8qkj8qmz8qpD8qrT8qtj8qvz8qgAA/yQA/0gA/2wA" +
      "/5AA/7QA/9gA//wA/wAk/yQk/0gk/2wk/5Ak/7Qk/9gk//wk/wBI/yRI/0hI/2xI/5BI/7RI/9hI//xI/wBs/yRs/0hs/2xs/5Bs" +
      "/7Rs/9hs//xs/wCQ/ySQ/0iQ/2yQ/5CQ/7SQ/9iQ//yQ/wC0/yS0/0i0/2y0/5C0/7S0/9i0//y0/wDY/yTY/0jY/2zY/5DY/7TY" +
      "/9jY//zY/wD8/yT8/0j8/2z8/5D8/7T8/9j8//z8/yH/C05FVFNDQVBFMi4wAwEAAAAh+QQEBAAfACwAAAAA8AC0AAAI/wAnTKEw" +
      "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" +
      "JjO5AgIAOw==",
  },
  {
    key: "avif",
    assetId: "img-dc2134d6c162",
    contentType: "image/avif",
    width: 240,
    height: 180,
    base64:
      "AAAAIGZ0eXBhdmlmAAAAAE1pUHJhdmlmbWlhZm1pZjEAAAEhbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAA" +
      "AAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAAAOcGl0bQAAAAAAAQAAACNpaW5mAAAAAAABAAAAFWluZmUC" +
      "AAAAAAEAAGF2MDEAAAAAgWlwcnAAAABgaXBjbwAAABNjb2xybmNseAACAAIABoAAAAAMY2xsaQDLAEAAAAAUaXNwZQAAAAAAAADw" +
      "AAAAtAAAAAlpcm90AAAAABBwaXhpAAAAAAMICAgAAAAMYXYxQ4EADAAAAAAZaXBtYQAAAAAAAAABAAEGgQIDBYaEAAAAHmlsb2MA" +
      "AAAARAAAAQABAAAAAQAAAVEAAABRAAAAAW1kYXQAAAAAAAAAYRIACg4AAAADv32Z//AgQEDQgDI9EAGEgAIIIIi0VVXKKQlXYU6p" +
      "GxSETjCV8+aHyvhAwiBtF1wUjhPDI3nYjL2/g3+v7lwgicxCdAsfIG9zwg==",
  },
    // 2 real frames + NETSCAPE2.0 loop extension — is-animated reports
    // true (verified), and both frames decode in real browsers.
  {
    key: "animatedGif",
    assetId: "img-8ebe8fb0b5e6",
    contentType: "image/gif",
    width: 120,
    height: 80,
    base64:
      "R0lGODlheABQAPcfMQAAACQAAEgAAGwAAJAAALQAANgAAPwAAAAkACQkAEgkAGwkAJAkALQkANgkAPwkAABIACRIAEhIAGxIAJBI" +
      "ALRIANhIAPxIAABsACRsAEhsAGxsAJBsALRsANhsAPxsAACQACSQAEiQAGyQAJCQALSQANiQAPyQAAC0ACS0AEi0AGy0AJC0ALS0" +
      "ANi0APy0AADYACTYAEjYAGzYAJDYALTYANjYAPzYAAD8ACT8AEj8AGz8AJD8ALT8ANj8APz8AAAAVSQAVUgAVWwAVZAAVbQAVdgA" +
      "VfwAVQAkVSQkVUgkVWwkVZAkVbQkVdgkVfwkVQBIVSRIVUhIVWxIVZBIVbRIVdhIVfxIVQBsVSRsVUhsVWxsVZBsVbRsVdhsVfxs" +
      "VQCQVSSQVUiQVWyQVZCQVbSQVdiQVfyQVQC0VSS0VUi0VWy0VZC0VbS0Vdi0Vfy0VQDYVSTYVUjYVWzYVZDYVbTYVdjYVfzYVQD8" +
      "VST8VUj8VWz8VZD8VbT8Vdj8Vfz8VQAAqiQAqkgAqmwAqpAAqrQAqtgAqvwAqgAkqiQkqkgkqmwkqpAkqrQkqtgkqvwkqgBIqiRI" +
      "qkhIqmxIqpBIqrRIqthIqvxIqgBsqiRsqkhsqmxsqpBsqrRsqthsqvxsqgCQqiSQqkiQqmyQqpCQqrSQqtiQqvyQqgC0qiS0qki0" +
      "qmy0qpC0qrS0qti0qvy0qgDYqiTYqkjYqmzYqpDYqrTYqtjYqvzYqgD8qiT8qkj8qmz8qpD8qrT8qtj8qvz8qgAA/yQA/0gA/2wA" +
      "/5AA/7QA/9gA//wA/wAk/yQk/0gk/2wk/5Ak/7Qk/9gk//wk/wBI/yRI/0hI/2xI/5BI/7RI/9hI//xI/wBs/yRs/0hs/2xs/5Bs" +
      "/7Rs/9hs//xs/wCQ/ySQ/0iQ/2yQ/5CQ/7SQ/9iQ//yQ/wC0/yS0/0i0/2y0/5C0/7S0/9i0//y0/wDY/yTY/0jY/2zY/5DY/7TY" +
      "/9jY//zY/wD8/yT8/0j8/2z8/5D8/7T8/9j8//z8/yH/C05FVFNDQVBFMi4wAwEAAAAh+QQEMgAfACwAAAAAeABQAAAI/wAnTFgg" +
      "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",
  },
];

// ── Module-load self-verification (the 11-01 generator precedent) ────────────
// Synchronous BYTE-MAGIC checks: a drifted sample (wrong bytes pasted under a
// stale assetId) throws at module load — the build fails loudly instead of
// shipping a fixture whose bytes no longer match the ids the canonical JSON
// references. The async hash linkage is proven downstream by the client's
// validateEnvelopeAssets re-hash chain (happy-path e2e) + the 20-08 matrix.

function startsWith(bytes: Uint8Array, prefix: number[] | string): boolean {
  if (typeof prefix === "string") {
    for (let i = 0; i < prefix.length; i += 1) {
      if (bytes[i] !== prefix.charCodeAt(i)) return false;
    }
    return true;
  }
  return prefix.every((b, i) => bytes[i] === b);
}

function containsAscii(bytes: Uint8Array, needle: string): boolean {
  outer: for (let i = 0; i + needle.length <= bytes.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (bytes[i + j] !== needle.charCodeAt(j)) continue outer;
    }
    return true;
  }
  return false;
}

/** Decode + byte-magic-verify ONE sample; returns its bytes. */
function verifiedBytes(sample: FixtureAssetSample): Uint8Array<ArrayBuffer> {
  const bytes = base64ToBytes(sample.base64);
  if (!/^img-[a-z0-9]{12}$/.test(sample.assetId)) {
    throw new Error(`fixture-assets: malformed assetId for sample "${sample.key}"`);
  }
  const magic: Record<string, (b: Uint8Array) => boolean> = {
    jpeg: (b) => startsWith(b, [0xff, 0xd8, 0xff]),
    jpegExifRotated: (b) =>
      startsWith(b, [0xff, 0xd8, 0xff, 0xe1]) &&
      startsWith(b.subarray(6), "Exif") &&
      // IFD0 entry 0x0112 (orientation) SHORT 1 = 6 — the swap trigger.
      startsWith(b.subarray(22), [0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06]),
    png: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    webp: (b) => startsWith(b, "RIFF") && startsWith(b.subarray(8), "WEBP"),
    gif: (b) => startsWith(b, "GIF8"),
    avif: (b) => startsWith(b.subarray(4), "ftyp") && startsWith(b.subarray(8), "avif"),
    animatedGif: (b) => startsWith(b, "GIF8") && containsAscii(b, "NETSCAPE2.0"),
  };
  const check = magic[sample.key];
  if (!check || !check(bytes)) {
    throw new Error(
      `fixture-assets: sample "${sample.key}" failed its byte-magic check — the embedded bytes drifted from the audited sample`,
    );
  }
  return bytes;
}

const VERIFIED = SAMPLES.map((sample) => ({
  sample,
  bytes: verifiedBytes(sample),
}));

/**
 * fixtureAssetRegistry — articleId → AssetRecordRow[] for bundled fixture
 * articles. Consulted FIRST by the AssetProvider (fixtures never touch
 * Dexie); rows not referenced by the article's blocks are inert.
 */
export const fixtureAssetRegistry: ReadonlyMap<string, AssetRecordRow[]> =
  new Map<string, AssetRecordRow[]>([
    [
      "figure-heavy",
      VERIFIED.map(({ sample, bytes }) => ({
        articleId: "figure-heavy",
        assetId: sample.assetId,
        contentType: sample.contentType,
        byteLength: bytes.byteLength,
        data: new Blob([bytes], { type: sample.contentType }),
        createdAt: FIXTURE_CREATED_AT,
      })),
    ],
  ]);
