// tests/unit/content/asset-provider.test.tsx
// Phase 20 Plan 20-04 Task 2 — the AssetProvider lifecycle + resolution
// contract (IMG-03/IMG-06 render-half, RESEARCH Pattern 4 + Pitfall 9):
//   - fixture-registry FIRST (fixtures never touch Dexie — the
//     inMemoryRepository discipline), db.assets bulkGet second
//   - object URLs are provider-owned: created once per article open,
//     ALL revoked on articleId change/unmount; page turns never churn
//   - missing rows + ok:false reads simply stay unresolved (the broken
//     placeholder state owns that surface — never a throw, STATE-05)
//   - useAssetUrl is an OPTIONAL-context hook (null/undefined outside the
//     provider — BlockRenderer compiles for any legacy caller)
//
// jsdom lacks URL.createObjectURL/revokeObjectURL — recording stubs are
// installed per test (the 20-03 Node-Blob harness discipline: production
// code unchanged, harness provides the platform piece). jsdom is NOT
// authoritative for layout; these cells assert RESOLUTION + LIFECYCLE, not
// geometry (geometry truth belongs to the 20-08 Playwright matrix).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { StrictMode } from "react";
import type { ReactNode } from "react";

// Mock ONLY the persistence seam — the provider must consult
// fixtureAssetRegistry BEFORE this, so the mock doubles as the spy that
// proves the ordering (Dexie never touched for fixture article ids).
vi.mock("../../../src/persistence/assetsStore", () => ({
  bulkGetAssets: vi.fn(),
}));

import { bulkGetAssets } from "../../../src/persistence/assetsStore";
import {
  AssetProvider,
  useAssetUrl,
  figureAssetIds,
} from "../../../src/content/assets/AssetProvider";
import { fixtureAssetRegistry } from "../../../src/fixtures/figure-assets";
import type { AssetRecordRow } from "../../../src/persistence/db";
import type { Block, CanonicalArticle } from "../../../src/content/types";

const bulkGetAssetsMock = vi.mocked(bulkGetAssets);

// ── URL lifecycle recording stubs ────────────────────────────────────────────

let urlSeq = 0;
const created: string[] = [];
const revoked: string[] = [];
const createObjectURL = vi.fn((blob: Blob) => {
  void blob;
  const url = `blob:mock-${(urlSeq += 1)}`;
  created.push(url);
  return url;
});
const revokeObjectURL = vi.fn((url: string) => {
  revoked.push(url);
});

beforeEach(() => {
  urlSeq = 0;
  created.length = 0;
  revoked.length = 0;
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  bulkGetAssetsMock.mockReset();
  Object.defineProperty(URL, "createObjectURL", {
    value: createObjectURL,
    configurable: true,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    value: revokeObjectURL,
    configurable: true,
  });
});

afterEach(() => {
  delete (URL as { createObjectURL?: unknown }).createObjectURL;
  delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
});

// ── Harness ──────────────────────────────────────────────────────────────────

const paragraph = (text: string): Block => ({
  kind: "paragraph",
  content: [{ text, marks: [] }],
});

const figure = (alt: string, src?: string): Block => ({
  kind: "figure",
  alt,
  ...(src !== undefined ? { src } : {}),
  caption: [],
});

const article = (id: string, blocks: Block[]): CanonicalArticle => ({
  id,
  revision: 1,
  lang: "en",
  provenance: {
    title: id,
    retrievedAt: "2026-08-31T00:00:00.000Z",
    originalHtmlHash: "0".repeat(64),
  },
  blocks,
  footnotes: [],
});

/** Renders the current useAssetUrl value for one (optional) figure src. */
function Probe({ src }: { src?: string }) {
  const url = useAssetUrl(src);
  return <span data-testid="probe">{url ?? "none"}</span>;
}

function prov(articleObj: CanonicalArticle, probeSrc: string | undefined, children?: ReactNode) {
  return (
    <AssetProvider article={articleObj}>
      <Probe src={probeSrc} />
      {children}
    </AssetProvider>
  );
}

const registryRows = fixtureAssetRegistry.get("figure-heavy")!;
const rotatedJpeg = registryRows.find((r) => r.assetId === "img-e191d5d4e581")!;
const pngAsset = registryRows.find((r) => r.assetId === "img-357de6805bda")!;

// A fixture article whose two figures reference the registry's two
// figure-heavy samples (the EXACT refs the regenerated canonical JSON
// carries — kept in sync by construction, not by import, so this spec
// pins the id linkage the e2e round-trips).
const fixtureFigureArticle = article("figure-heavy", [
  paragraph("intro"),
  figure("rotated", "asset:img-e191d5d4e581"),
  figure("png", "asset:img-357de6805bda"),
]);

/** A Dexie-shaped row for arbitrary ids (byte-honest Blob payload). */
function dexRow(articleId: string, assetId: string): AssetRecordRow {
  return {
    articleId,
    assetId,
    contentType: "image/png",
    byteLength: 4,
    data: new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" }),
    createdAt: "2026-08-31T00:00:00.000Z",
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("useAssetUrl — optional context (legacy callers byte-unchanged)", () => {
  it("returns undefined outside the provider", () => {
    render(<Probe src="asset:img-aaaaaaaaaaaa" />);
    expect(screen.getByTestId("probe")).toHaveTextContent("none");
  });

  it("returns undefined for a non-asset src even inside a populated provider", async () => {
    const art = article("a1", [figure("legacy", "https://upload.wikimedia.org/x.png")]);
    render(prov(art, "https://upload.wikimedia.org/x.png"));
    // No asset refs → no resolution work at all (bulkGet never consulted),
    // and the legacy remote src NEVER resolves (IMG-03 by construction).
    await act(async () => {
      await Promise.resolve();
    });
    expect(bulkGetAssetsMock).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(screen.getByTestId("probe")).toHaveTextContent("none");
  });
});

describe("AssetProvider — fixture registry consult FIRST (fixtures never touch Dexie)", () => {
  it("resolves fixture-article refs from the bundled registry without consulting bulkGetAssets", async () => {
    render(prov(fixtureFigureArticle, "asset:img-e191d5d4e581"));
    await waitFor(() =>
      expect(screen.getByTestId("probe")).not.toHaveTextContent("none"),
    );
    expect(bulkGetAssetsMock).not.toHaveBeenCalled();
  });

  it("creates exactly ONE object URL per REFERENCED asset (unreferenced registry rows are inert)", async () => {
    render(
      prov(fixtureFigureArticle, "asset:img-e191d5d4e581", (
        <Probe src="asset:img-357de6805bda" />
      )),
    );
    await waitFor(() =>
      expect(screen.getAllByTestId("probe")[1]).not.toHaveTextContent("none"),
    );
    // The registry carries 7 samples; the article references exactly 2.
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(created).toHaveLength(2);
  });
});

describe("AssetProvider — Dexie resolution (non-fixture articles)", () => {
  it("bulk-gets the referenced ids and resolves returned rows", async () => {
    bulkGetAssetsMock.mockResolvedValue({
      ok: true,
      assets: [dexRow("dex-article", "img-aaaaaaaaaaaa")],
    });
    const art = article("dex-article", [
      figure("present", "asset:img-aaaaaaaaaaaa"),
      figure("missing", "asset:img-bbbbbbbbbbbb"),
    ]);
    render(
      <AssetProvider article={art}>
        <Probe src="asset:img-aaaaaaaaaaaa" />
        <Probe src="asset:img-bbbbbbbbbbbb" />
      </AssetProvider>,
    );
    await waitFor(() =>
      expect(screen.getAllByTestId("probe")[0]).not.toHaveTextContent("none"),
    );
    expect(bulkGetAssetsMock).toHaveBeenCalledWith("dex-article", [
      "img-aaaaaaaaaaaa",
      "img-bbbbbbbbbbbb",
    ]);
    // The missing row simply stays unresolved (broken placeholder state).
    expect(screen.getAllByTestId("probe")[1]).toHaveTextContent("none");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("an ok:false read leaves every ref unresolved — calm, never a throw", async () => {
    bulkGetAssetsMock.mockResolvedValue({ ok: false, reason: "unavailable" });
    const art = article("dex-article", [figure("gone", "asset:img-aaaaaaaaaaaa")]);
    const view = render(prov(art, "asset:img-aaaaaaaaaaaa"));
    await waitFor(() => expect(bulkGetAssetsMock).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("probe")).toHaveTextContent("none");
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(view.container.querySelector("span")).not.toBeNull();
  });
});

describe("AssetProvider — object-URL lifecycle (Pitfall 9)", () => {
  it("revokes every created URL on unmount (create/revoke symmetry)", async () => {
    const view = render(prov(fixtureFigureArticle, "asset:img-e191d5d4e581"));
    await waitFor(() =>
      expect(screen.getByTestId("probe")).not.toHaveTextContent("none"),
    );
    expect(created).toHaveLength(2);
    expect(revoked).toHaveLength(0);
    view.unmount();
    expect(revoked).toEqual(created);
  });

  it("article switch revokes the old set and creates the new one", async () => {
    bulkGetAssetsMock.mockResolvedValue({
      ok: true,
      assets: [dexRow("article-b", "img-cccccccccccc")],
    });
    const view = render(prov(fixtureFigureArticle, "asset:img-e191d5d4e581"));
    await waitFor(() =>
      expect(screen.getByTestId("probe")).not.toHaveTextContent("none"),
    );
    const firstUrl = screen.getByTestId("probe").textContent;
    expect(firstUrl).not.toBe("none");

    const next = article("article-b", [figure("next", "asset:img-cccccccccccc")]);
    view.rerender(prov(next, "asset:img-cccccccccccc"));
    await waitFor(() =>
      expect(screen.getByTestId("probe")).not.toHaveTextContent("none"),
    );
    const secondUrl = screen.getByTestId("probe").textContent;
    expect(secondUrl).not.toBe(firstUrl);
    // The fixture article's URLs were all revoked on the switch.
    expect(revoked).toEqual(created.slice(0, 2));
    expect(created).toHaveLength(3);
  });

  it("StrictMode twin-mount runs are leak-free (every created URL revoked-or-active)", async () => {
    // Single-figure article so the probe's URL IS the complete active set.
    const single = article("figure-heavy", [
      figure("only", "asset:img-e191d5d4e581"),
    ]);
    render(<StrictMode>{prov(single, "asset:img-e191d5d4e581")}</StrictMode>);
    await waitFor(() =>
      expect(screen.getByTestId("probe")).not.toHaveTextContent("none"),
    );
    // Twin-mount may resolve twice; whatever was created is either still
    // active (the final run) or already revoked (the aborted first run).
    // The probe's live URL is the ONLY unrevoked one.
    const active = screen.getByTestId("probe").textContent;
    expect(active).not.toBe("none");
    expect(revoked).toEqual(created.filter((u) => u !== active));
    expect(created.filter((u) => u === active)).toHaveLength(1);
  });
});

describe("figureAssetIds — the block walk (renderer-side twin of the AddDialog attribution)", () => {
  it("collects asset ref bodies in document order, recursing containers", () => {
    const art = article("walk", [
      paragraph("p"),
      figure("top", "asset:img-aaaaaaaaaaaa"),
      {
        kind: "blockquote",
        children: [figure("in-quote", "asset:img-bbbbbbbbbbbb")],
      },
      {
        kind: "bulleted-list",
        items: [
          {
            content: [
              paragraph("li"),
              figure("in-list", "asset:img-cccccccccccc"),
              {
                kind: "numbered-list",
                start: 1,
                items: [{ content: [figure("nested", "asset:img-dddddddddddd")] }],
              },
            ],
          },
        ],
      },
      figure("legacy is skipped", "https://upload.wikimedia.org/x.png"),
      figure("refused has no src at all"),
    ]);
    expect(figureAssetIds(art)).toEqual([
      "img-aaaaaaaaaaaa",
      "img-bbbbbbbbbbbb",
      "img-cccccccccccc",
      "img-dddddddddddd",
    ]);
  });

  it("dedupes repeated refs (byte-identical twins resolve once)", () => {
    const art = article("dupe", [
      figure("a", "asset:img-aaaaaaaaaaaa"),
      figure("b", "asset:img-aaaaaaaaaaaa"),
    ]);
    expect(figureAssetIds(art)).toEqual(["img-aaaaaaaaaaaa"]);
  });
});

describe("registry rows are blob-backed for createObjectURL", () => {
  it("figure-heavy rows carry typed Blobs sized to their byteLength", async () => {
    for (const row of [rotatedJpeg, pngAsset]) {
      expect(row.data).toBeInstanceOf(Blob);
      expect((await row.data.arrayBuffer()).byteLength).toBe(row.byteLength);
    }
  });
});
