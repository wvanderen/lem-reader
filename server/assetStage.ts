// server/assetStage.ts
// Plan 20-02 Task 1 — RED placeholder stub. The real implementation lands in
// the GREEN commit; this stub exists so the spec fails on ASSERTIONS against
// the named exports rather than on module-resolution errors (the 20-01
// placeholder-stub precedent).
import type { Block } from "../src/content/schema";
import type { ImageAsset, ImageAssetRefusal } from "./fetchImageAsset";

/** Stage-level resolution supertype (see 20-02-PLAN artifacts): 20-01's
 * ImageAssetRefusal stays CLOSED at fetch-level arms; the three stage arms
 * ("count" | "budget" | "deadline") are article-budget concepts represented
 * ONLY here. */
export type AssetResolution = ImageAsset | ImageAssetRefusal | "count" | "budget" | "deadline";

export function rewriteFiguresWithAssets(
  _blocks: Block[],
  _resolution: Map<string, AssetResolution>,
): Block[] {
  throw new Error("not implemented (RED stub)");
}

export async function runAssetStage(
  _blocks: Block[],
  _options?: { signal?: AbortSignal; deadlineMs?: number },
): Promise<{ blocks: Block[]; assets: ImageAsset[]; refusedCount: number }> {
  throw new Error("not implemented (RED stub)");
}
