// server/fetchImageAsset.ts
// Plan 20-01 Task 3 — the image-profile fetch + authoritative byte-sniff seam
// (20-RESEARCH Pattern 1). RED stub: types + contracts are final; the function
// bodies return the "fetch" placeholder so the spec matrix fails on ASSERTIONS
// (not module resolution) until the GREEN implementation lands in this commit's
// successor.
import type { SafeFetchProfile } from "./safeFetch";

/** ImageAsset — the sniff result the 20-02 asset stage persists. `assetId` is
 * `img-<12hex>` (D7-07 shortHash locality precedent); width/height are the
 * orientation-corrected intrinsic pixels (D20-13); contentType is the SNIFFED
 * canonical type (never the declared header). */
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

/** The image profile over safeFetchCore — the ONLY fetch entry for assets
 * (no second SSRF egress path exists). */
export const IMAGE_FETCH_PROFILE: SafeFetchProfile = {
  allowedContentTypes: ["image/"], // advisory only — the sniff decides (D20-10)
  timeoutMs: 15_000,
  maxBytes: 16 * 1024 * 1024,
  bodyKind: "bytes",
};

// RED stubs (replaced by the GREEN implementation).
export async function fetchImageAsset(_url: string): Promise<ImageAsset | ImageAssetRefusal> {
  return "fetch";
}

export function sniffImageAsset(_bytes: Uint8Array): ImageAsset | ImageAssetRefusal {
  return "fetch";
}
