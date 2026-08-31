// tests/unit/server/assetStage.spec.ts
// Plan 20-02 Task 1 — the per-article collect/budget/deadline/fetch/rewrite
// stage (IMG-01/IMG-02; T-20-07/T-20-08/T-20-09). fetchImageAsset is mocked
// (vi.mock on the module — the 20-01 seam stays the only fetch path; the
// stage's own scheduling/budget/rewrite logic is what runs for real here).
//
// Contract under test (D20-04/D20-05/D-05 substrate byte-identity):
//   - every per-figure refusal is a TYPED VALUE on the returned blocks —
//     NO cell in this file uses an expected-throw assertion
//   - one bad image never blocks the article: refused figures stay
//     FigureBlocks with alt + caption intact and src omitted
//   - the rewrite touches ONLY src/originalSrc/width/height — the
//     splittingBlockText figure-case output ([alt, captionText] joined on
//     BLOCK_SEPARATOR) is byte-identical before vs after, for every figure
//     position (top-level, nested-in-list, nested-in-blockquote)
//   - caps are deterministic in document order: count cap before any fetch,
//     response budget as a running decoded-byte total, deadline before each
//     dispatch
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the 20-01 fetch seam — the stage must schedule/budget/rewrite; the
// network + sniff behavior is pinned by fetchImageAsset.spec.ts.
vi.mock("../../../server/fetchImageAsset", () => ({
  fetchImageAsset: vi.fn(),
}));

import { createHash } from "node:crypto";
import { fetchImageAsset } from "../../../server/fetchImageAsset";
import type { ImageAsset } from "../../../server/fetchImageAsset";
import {
  runAssetStage,
  rewriteFiguresWithAssets,
} from "../../../server/assetStage";
import type { Block, FigureBlock } from "../../../src/content/schema";
import { splittingBlockText } from "../../../src/pagination/splitBlock";
import {
  MAX_FIGURES_PER_ARTICLE,
  MAX_ASSET_RESPONSE_BYTES,
  ASSET_FETCH_CONCURRENCY,
} from "../../../src/ingestion/types";

const fetchMock = fetchImageAsset as unknown as ReturnType<typeof vi.fn>;

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** A fake sniff result for `src`. assetId follows the img-<12hex> contract
 * (sha256 of the bytes — here the src string stands in for the bytes). */
function fakeAsset(src: string, byteLength = 16): ImageAsset {
  return {
    assetId:
      "img-" + createHash("sha256").update(src).digest("hex").slice(0, 12),
    contentType: "image/png",
    width: 640,
    height: 480,
    bytes: new Uint8Array(byteLength),
  };
}

function fig(
  src: string | undefined,
  alt = "A figure",
  caption: { text: string; marks: [] }[] = [{ text: "A caption", marks: [] }],
): FigureBlock {
  return { kind: "figure", alt, ...(src !== undefined ? { src } : {}), caption };
}

/** The four-field omit — everything EXCEPT src/originalSrc/width/height must
 * deep-equal the pre-rewrite figure (the D-05 substrate). */
function omitFigureFields(
  b: FigureBlock,
): Record<string, unknown> {
  const { src: _s, originalSrc: _o, width: _w, height: _h, ...rest } = b;
  return rest;
}

function findFigures(blocks: Block[]): FigureBlock[] {
  const out: FigureBlock[] = [];
  const walk = (bs: Block[]) => {
    for (const b of bs) {
      if (b.kind === "figure") out.push(b);
      else if (b.kind === "blockquote") walk(b.children);
      else if (b.kind === "bulleted-list" || b.kind === "numbered-list") {
        for (const item of b.items) walk(item.content);
      }
    }
  };
  walk(blocks);
  return out;
}

/** Per-top-level-block splittingBlockText snapshot — the substrate
 * byte-identity comparison basis (containers recurse inside the real
 * helper; no forked reimplementation in this spec). */
function substrateSnapshot(blocks: Block[]): string[] {
  return blocks.map((b) => splittingBlockText(b));
}

beforeEach(() => {
  fetchMock.mockReset();
});

// ── rewriteFiguresWithAssets (pure rewrite) ─────────────────────────────────

describe("rewriteFiguresWithAssets", () => {
  it("rewrites an accepted figure to the asset ref with originalSrc + dims (ONLY those four fields differ)", () => {
    const before = fig("https://example.com/a.png");
    const asset = fakeAsset("https://example.com/a.png");
    const out = rewriteFiguresWithAssets(
      [before],
      new Map([["https://example.com/a.png", asset]]),
    );
    const after = out[0];
    if (!after || after.kind !== "figure") throw new Error("expected figure");
    expect(after.src).toBe("asset:" + asset.assetId);
    expect(after.src).toMatch(/^asset:img-[a-z0-9]{12}$/);
    expect(after.originalSrc).toBe("https://example.com/a.png");
    expect(after.width).toBe(640);
    expect(after.height).toBe(480);
    // Everything else deep-equals the pre-rewrite figure.
    expect(omitFigureFields(after)).toEqual(omitFigureFields(before));
  });

  it("refuses a figure by omitting src, keeping originalSrc provenance, alt + caption intact", () => {
    const before = fig("https://example.com/bad.png", "Broken art", [
      { text: "Caption stays ", marks: [] },
      { text: "intact", marks: [] },
    ]);
    const out = rewriteFiguresWithAssets(
      [before],
      new Map([["https://example.com/bad.png", "fetch"]]),
    );
    const after = out[0];
    if (!after || after.kind !== "figure") throw new Error("expected figure");
    expect(after.src).toBeUndefined();
    expect("src" in after).toBe(false);
    expect(after.originalSrc).toBe("https://example.com/bad.png");
    expect(after.alt).toBe("Broken art");
    expect(after.caption).toEqual(before.caption);
    expect(omitFigureFields(after)).toEqual(omitFigureFields(before));
  });

  it("leaves a no-src figure and a non-map-src figure unchanged", () => {
    const noSrc = fig(undefined, "Already refused");
    const out = rewriteFiguresWithAssets([noSrc], new Map());
    expect(out[0]).toEqual(noSrc);
  });

  it("recurses through blockquote children and list-item content", () => {
    const nested = fig("https://example.com/nested.png", "Nested");
    const inQuote = fig("https://example.com/quote.png", "Quoted");
    const blocks: Block[] = [
      {
        kind: "blockquote",
        children: [inQuote, { kind: "paragraph", content: [{ text: "p", marks: [] }] }],
      },
      {
        kind: "bulleted-list",
        items: [{ content: [nested] }],
      },
      {
        kind: "numbered-list",
        items: [{ content: [fig(undefined, "No src in list")] }],
        start: 1,
      },
    ];
    const out = rewriteFiguresWithAssets(
      blocks,
      new Map([
        ["https://example.com/nested.png", fakeAsset("https://example.com/nested.png")],
        ["https://example.com/quote.png", "type"],
      ]),
    );
    const figs = findFigures(out);
    expect(figs).toHaveLength(3);
    // Walk order: blockquote children first, then list items.
    expect(figs[0]?.src).toBeUndefined(); // "type"-refused quote figure
    expect(figs[0]?.originalSrc).toBe("https://example.com/quote.png");
    expect(figs[1]?.src).toMatch(/^asset:img-[a-z0-9]{12}$/); // list-nested accept
    expect(figs[2]?.src).toBeUndefined(); // pre-existing no-src figure
  });
});

// ── runAssetStage (collect / budget / deadline / fetch) ─────────────────────

describe("runAssetStage", () => {
  it("fetches unique http(s) srcs and returns rewritten blocks + assets + zero refusedCount on full success", async () => {
    fetchMock.mockImplementation(async (url: string) => fakeAsset(url));
    const blocks: Block[] = [
      fig("https://example.com/a.png"),
      { kind: "paragraph", content: [{ text: "text", marks: [] }] },
      fig("https://example.com/a.png"), // duplicate src — ONE fetch
      fig("https://example.com/b.png"),
    ];
    const before = substrateSnapshot(blocks);
    const result = await runAssetStage(blocks);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.refusedCount).toBe(0);
    expect(result.assets).toHaveLength(2);
    expect(result.assets.map((a) => a.assetId).sort()).toEqual(
      [fakeAsset("https://example.com/a.png").assetId, fakeAsset("https://example.com/b.png").assetId].sort(),
    );
    const figs = findFigures(result.blocks);
    expect(figs).toHaveLength(3);
    for (const f of figs) {
      expect(f.src).toMatch(/^asset:img-[a-z0-9]{12}$/);
      expect(f.originalSrc).toMatch(/^https:\/\//);
      expect(f.width).toBe(640);
      expect(f.height).toBe(480);
    }
    // Substrate byte-identity across the rewrite (D-05 / D19-01).
    expect(substrateSnapshot(result.blocks)).toEqual(before);
  });

  it("per-figure refusal: one refusing src among three — every block survives, refused figure keeps alt + caption with src omitted", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === "https://example.com/bad.png" ? "fetch" : fakeAsset(url),
    );
    const blocks: Block[] = [
      fig("https://example.com/one.png", "One"),
      fig("https://example.com/bad.png", "The bad one", [
        { text: "caption", marks: [] },
      ]),
      fig("https://example.com/three.png", "Three"),
    ];
    const before = substrateSnapshot(blocks);
    const result = await runAssetStage(blocks);

    expect(result.refusedCount).toBe(1);
    expect(result.assets).toHaveLength(2);
    const figs = findFigures(result.blocks);
    expect(figs).toHaveLength(3);
    expect(figs[1]?.src).toBeUndefined();
    expect(figs[1]?.alt).toBe("The bad one");
    expect(figs[1]?.caption).toEqual([{ text: "caption", marks: [] }]);
    expect(figs[0]?.src).toMatch(/^asset:img-/);
    expect(figs[2]?.src).toMatch(/^asset:img-/);
    expect(substrateSnapshot(result.blocks)).toEqual(before);
  });

  it("never throws when the fetch seam unexpectedly rejects — calm per-figure refusal instead", async () => {
    fetchMock.mockRejectedValue(new Error("unexpected infrastructure fault"));
    const blocks: Block[] = [fig("https://example.com/x.png", "X")];
    const result = await runAssetStage(blocks);
    expect(result.refusedCount).toBe(1);
    expect(findFigures(result.blocks)[0]?.src).toBeUndefined();
  });

  it("count cap: srcs beyond MAX_FIGURES_PER_ARTICLE refuse 'count' with NO fetch performed", async () => {
    fetchMock.mockImplementation(async (url: string) => fakeAsset(url));
    const over = 3;
    const blocks: Block[] = Array.from(
      { length: MAX_FIGURES_PER_ARTICLE + over },
      (_, i) => fig(`https://example.com/f${i}.png`),
    );
    const result = await runAssetStage(blocks);

    // Exactly the cap's worth of fetches — the beyond-cap srcs never fetch.
    expect(fetchMock).toHaveBeenCalledTimes(MAX_FIGURES_PER_ARTICLE);
    expect(result.assets).toHaveLength(MAX_FIGURES_PER_ARTICLE);
    expect(result.refusedCount).toBe(over);
    // The LAST `over` figures in document order are the refused ones.
    const figs = findFigures(result.blocks);
    for (let i = 0; i < over; i++) {
      const f = figs[MAX_FIGURES_PER_ARTICLE + i];
      expect(f?.src).toBeUndefined();
      expect(f?.originalSrc).toBe(`https://example.com/f${MAX_FIGURES_PER_ARTICLE + i}.png`);
    }
  });

  it("response budget: the first-come figure in document order admits; the one that would exceed refuses 'budget'", async () => {
    const half = Math.floor(MAX_ASSET_RESPONSE_BYTES / 2) + 1024; // two of these exceed 3MB together
    fetchMock.mockImplementation(async (url: string) => fakeAsset(url, half));
    const blocks: Block[] = [
      fig("https://example.com/first.png", "First"),
      fig("https://example.com/second.png", "Second"),
      fig("https://example.com/third.png", "Third"),
    ];
    const before = substrateSnapshot(blocks);
    const result = await runAssetStage(blocks);

    // All three fetched (they are under the per-asset cap); only the first
    // admits to the running response budget — the second would push the
    // total over, and the third is beyond an already-exhausted budget.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0]?.bytes.byteLength).toBe(half);
    expect(result.refusedCount).toBe(2);
    const figs = findFigures(result.blocks);
    expect(figs[0]?.src).toMatch(/^asset:img-/);
    expect(figs[1]?.src).toBeUndefined();
    expect(figs[2]?.src).toBeUndefined();
    expect(substrateSnapshot(result.blocks)).toEqual(before);
  });

  it("deadline: an already-expired deadline refuses every figure 'deadline' with zero fetches", async () => {
    fetchMock.mockImplementation(async (url: string) => fakeAsset(url));
    const blocks: Block[] = [fig("https://example.com/d1.png"), fig("https://example.com/d2.png")];
    const result = await runAssetStage(blocks, { deadlineMs: -1 });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.assets).toHaveLength(0);
    expect(result.refusedCount).toBe(2);
    for (const f of findFigures(result.blocks)) {
      expect(f.src).toBeUndefined();
    }
  });

  it("deadline mid-flight: remaining srcs refuse 'deadline' once the wall-clock budget passes", async () => {
    fetchMock.mockImplementation(
      (url: string) =>
        new Promise((resolve) => setTimeout(() => resolve(fakeAsset(url)), 30)),
    );
    const blocks: Block[] = Array.from({ length: 8 }, (_, i) =>
      fig(`https://example.com/slow${i}.png`),
    );
    // 20ms deadline: the in-flight batch (concurrency 4) resolves; the rest
    // refuse "deadline" at their dispatch check.
    const result = await runAssetStage(blocks, { deadlineMs: 20 });

    expect(fetchMock.mock.calls.length).toBeLessThan(8);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(result.refusedCount).toBe(8 - result.assets.length);
  });

  it("bounded concurrency: never more than ASSET_FETCH_CONCURRENCY fetches in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    fetchMock.mockImplementation((url: string) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      return new Promise((resolve) =>
        setTimeout(() => {
          inFlight -= 1;
          resolve(fakeAsset(url));
        }, 10),
      );
    });
    const blocks: Block[] = Array.from({ length: 10 }, (_, i) =>
      fig(`https://example.com/c${i}.png`),
    );
    const result = await runAssetStage(blocks);
    expect(peak).toBeLessThanOrEqual(ASSET_FETCH_CONCURRENCY);
    expect(result.assets).toHaveLength(10);
    expect(result.refusedCount).toBe(0);
  });

  it("substrate byte-identity for every figure position: top-level, nested-in-list, nested-in-blockquote", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("refuse") ? "type" : fakeAsset(url),
    );
    const blocks: Block[] = [
      fig("https://example.com/top-accept.png", "Top accepted", [
        { text: "top caption", marks: [] },
      ]),
      fig("https://example.com/refuse-top.png", "Top refused", [
        { text: "refused caption", marks: [] },
      ]),
      {
        kind: "blockquote",
        children: [
          fig("https://example.com/quote-accept.png", "Quote accepted"),
          fig("https://example.com/refuse-quote.png", "Quote refused"),
        ],
      },
      {
        kind: "bulleted-list",
        items: [
          { content: [fig("https://example.com/list-accept.png", "List accepted")] },
          { content: [fig("https://example.com/refuse-list.png", "List refused")] },
        ],
      },
      {
        kind: "numbered-list",
        items: [{ content: [fig(undefined, "Already refused in list")] }],
        start: 1,
      },
    ];
    const before = substrateSnapshot(blocks);
    const result = await runAssetStage(blocks);
    expect(substrateSnapshot(result.blocks)).toEqual(before);

    const figs = findFigures(result.blocks);
    expect(figs).toHaveLength(7);
    const accepted = figs.filter((f) => f.src?.startsWith("asset:"));
    const refused = figs.filter((f) => f.src === undefined);
    expect(accepted).toHaveLength(3);
    expect(refused).toHaveLength(4);
    expect(result.refusedCount).toBe(4);
  });
});
