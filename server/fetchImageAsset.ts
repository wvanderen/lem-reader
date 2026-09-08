// server/fetchImageAsset.ts
// Plan 20-01 Task 3 — the image-profile fetch + authoritative byte-sniff seam
// (20-RESEARCH Pattern 1). This is the ONLY network egress for secondary image
// assets: every fetch goes through safeFetchCore with the image profile, so
// the full 9-measure SSRF pipeline (scheme → metadata-hostname → DNS → IP
// deny-list → pinning/timeout → per-hop redirects → byte cap → content-type
// gate) governs assets exactly as it governs documents (D20-12 substrate,
// T-20-01 — the pipeline is parameterized, never forked).
//
// Sniff contract (D20-08/D20-09/D20-10, T-20-02/T-20-03):
//   - the sniffed byte type is AUTHORITATIVE over any content-type header;
//     a sniffed type outside jpeg/png/webp/gif/avif — including SVG bytes
//     served under a lying image header — refuses with "type"
//   - animated GIF/WebP/APNG refuse with "animated"; static forms pass
//   - a JPEG with EXIF orientation >= 5 yields orientation-corrected
//     width/height so the reserved box matches the rendered aspect (Pitfall 2)
//   - every refusal is a RETURNED TYPED VALUE, never a throw (D20-05)
//
// Implementation notes verified against the libraries' sources:
//   - image-size reports the JPEG type string as "jpg" — normalized onto the
//     "jpeg" arm here (contentType stays the canonical "image/jpeg").
//   - is-animated@2.x requires a Node Buffer (it calls toString("ascii") and
//     readUInt32BE, which plain Uint8Array lacks — a plain Uint8Array would
//     silently report NOT-animated for GIF/PNG). Bytes are wrapped in a
//     ZERO-COPY Buffer view before the predicate; the spec locks this wiring.
//
// sniffImageAsset is deliberately network-free: the 20-06 EPUB container path
// reuses the SAME sniff sequence over already-local archive bytes (fetch is
// the network-only wrapper; sniff is the shared seam).
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { imageSize } from "image-size";
// @ts-expect-error — is-animated@2.0.2 ships no bundled type declarations
// (zero-dep CJS, stable since 2022; API verified against its source during
// 20-01 implementation research). Typed locally right below — the package
// stays behind this single-seam module (T-20-SC swappability). If a future
// version ships types, this directive becomes unused and tsc forces the
// cleanup.
import isAnimatedRaw from "is-animated";
import { safeFetchCore, type SafeFetchProfile } from "./safeFetch";
import {
  MAX_ASSET_BYTES,
  MAX_ASSET_PIXELS,
  ASSET_FETCH_TIMEOUT_MS,
} from "./limits";

/** The typed surface this module consumes from is-animated: one Buffer
 * predicate (GIF / APNG / animated-WebP detection — exactly the D20-09 list).
 * NOTE: the argument MUST be a Node Buffer — the library calls
 * Buffer.prototype.toString("ascii") and readUInt32BE, which a plain
 * Uint8Array lacks (a plain Uint8Array silently reports NOT-animated for
 * GIF/PNG; locked by the animated-GIF spec cell). */
const isAnimated = isAnimatedRaw as unknown as (buffer: Buffer) => boolean;

/** ImageAsset — the sniff result the 20-02 asset stage persists. `assetId` is
 * `img-<12hex>` (D7-07 shortHash locality precedent — identical bytes
 * self-identify); width/height are the orientation-corrected intrinsic pixels
 * (D20-13 — what the pagination reserved box consumes); contentType is the
 * SNIFFED canonical type, never the declared header. */
export interface ImageAsset {
  assetId: string;
  contentType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "image/avif";
  width: number;
  height: number;
  bytes: Uint8Array;
}

/** ImageAssetRefusal — the fetch-level typed refusals (D20-05: returned typed
 * values, NEVER throws). CLOSED at this level by design: the stage-level arms
 * "count"/"budget"/"deadline" are article-budget concepts that live ONLY on
 * 20-02's AssetResolution supertype, never on this union. */
export type ImageAssetRefusal = "fetch" | "type" | "bytes" | "pixels" | "animated";

/** The image profile over safeFetchCore — the ONLY fetch entry for assets (no
 * second SSRF egress path exists for images). The "image/" content-type gate
 * is genuinely ADVISORY (quick task 260908-ef5): with contentTypeGate
 * "admit-opaque", CDNs/S3/signed URLs serving real image bytes under an
 * application/octet-stream, binary/octet-stream, or empty declared header
 * flow through to sniffImageAsset below, which stays the SOLE admission
 * authority per D20-10 (headers lie; bytes do not) — the sniffed type still
 * decides, so an octet-stream-labeled HTML challenge page refuses on its
 * bytes. Clearly-non-image declarations (text/html, application/json,
 * text/plain, application/pdf) keep the early calm pre-read refusal in the
 * core. One pipeline, parameterized — never forked (D20-12). */
export const IMAGE_FETCH_PROFILE: SafeFetchProfile = {
  allowedContentTypes: ["image/"],
  timeoutMs: ASSET_FETCH_TIMEOUT_MS,
  maxBytes: MAX_ASSET_BYTES,
  bodyKind: "bytes",
  contentTypeGate: "admit-opaque",
};

/** image-size sniffed type → canonical content type. The JPEG type string
 * "jpg" is normalized onto the jpeg arm. */
const SNIFFED_TO_CONTENT_TYPE: Record<string, ImageAsset["contentType"]> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

/** Zero-copy Node Buffer view over `bytes` (is-animated requires Buffer). */
function bufferView(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/**
 * fetchImageAsset — fetch an image URL through the shared SSRF-safe core,
 * then run the authoritative sniff on the returned bytes. Every fetch-layer
 * failure (SSRF refusal, timeout, redirect loop, cap, network error) maps to
 * the typed "fetch" refusal; the sniff's refusals are "bytes" | "type" |
 * "pixels" | "animated". Never throws (D20-05 composure — the stage applies
 * the calm per-figure fallback without try/catch noise).
 */
export async function fetchImageAsset(url: string): Promise<ImageAsset | ImageAssetRefusal> {
  let bytes: Uint8Array;
  try {
    const result = await safeFetchCore(url, IMAGE_FETCH_PROFILE);
    // bytes-profile invariant: the core returns a Uint8Array body.
    bytes = result.body as Uint8Array;
  } catch {
    // Every fetch-layer refusal — IngestionError (SSRF measures, caps,
    // content-type gate) or a network-level rejection — is the typed "fetch"
    // refusal. Calm, per-figure, never a throw.
    return "fetch";
  }
  return sniffImageAsset(bytes);
}

/**
 * sniffImageAsset — the network-free sniff sequence (the shared seam the
 * 20-06 EPUB container path reuses over already-local archive bytes). Order:
 *   1. bytes.byteLength re-check vs MAX_ASSET_BYTES → "bytes" (the core
 *      already re-checks post-read on the fetch path; this guards the
 *      container path and keeps the seam self-contained)
 *   2. sniffed type outside the D20-08 raster set (svg included — D20-10,
 *      imageSize throw included) → "type"
 *   3. sniffed width×height > MAX_ASSET_PIXELS → "pixels" (decode-bomb stop)
 *   4. isAnimated(bytes) → "animated" (GIF/WebP/APNG — D20-09)
 *   5. EXIF orientation >= 5 swaps stored width/height (Pitfall 2)
 *   6. assetId = "img-" + sha256(bytes).slice(0, 12) (D7-07)
 */
export function sniffImageAsset(bytes: Uint8Array): ImageAsset | ImageAssetRefusal {
  if (bytes.byteLength > MAX_ASSET_BYTES) {
    return "bytes";
  }

  // Authoritative magic-byte sniff. A throw (unrecognizable/corrupt headers)
  // is a calm "type" refusal — same arm as a recognized non-raster type.
  let dim: ReturnType<typeof imageSize>;
  try {
    dim = imageSize(bytes);
  } catch {
    return "type";
  }

  const sniffed = dim.type === "jpg" ? "jpeg" : dim.type; // normalize the JPEG string
  if (!sniffed) {
    return "type"; // no usable type string (defensive — same arm as non-raster)
  }
  const contentType = SNIFFED_TO_CONTENT_TYPE[sniffed];
  if (!contentType) {
    return "type"; // svg + every other sniffed kind lands here (D20-08/D20-10)
  }

  const storedWidth = dim.width;
  const storedHeight = dim.height;
  if (
    !Number.isInteger(storedWidth) ||
    !Number.isInteger(storedHeight) ||
    (storedWidth as number) < 1 ||
    (storedHeight as number) < 1
  ) {
    // Recognized raster kind but no usable intrinsic dims (malformed header
    // trivia) — refuse calmly rather than persisting undefined geometry.
    return "type";
  }

  if ((storedWidth as number) * (storedHeight as number) > MAX_ASSET_PIXELS) {
    return "pixels";
  }

  if (isAnimated(bufferView(bytes))) {
    return "animated"; // D20-09 — nothing in the calm reader moves on its own
  }

  const swap = (dim.orientation ?? 1) >= 5; // EXIF 5-8: transposed/rotated
  return {
    assetId: `img-${createHash("sha256").update(bytes).digest("hex").slice(0, 12)}`,
    contentType,
    width: swap ? (storedHeight as number) : (storedWidth as number),
    height: swap ? (storedWidth as number) : (storedHeight as number),
    bytes,
  };
}
