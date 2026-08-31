// src/content/assets/AssetProvider.tsx
// Phase 20 Plan 20-04 Task 2 — the per-article object-URL resolution
// context (20-RESEARCH Pattern 4; HighlightOverlay context anatomy).
//
// Contract (20-04-PLAN.md §must_haves truths):
//   1. Object URLs are PROVIDER-OWNED: created once per article open, all
//      revoked on articleId change/unmount (Pitfall 9 / T-20-16). Page
//      turns mount/unmount fragments constantly — they never create or
//      revoke (a per-article map means no per-turn churn and deterministic
//      geometry: no async gap where a figure renders before its URL exists
//      can change layout, because the reserved box is model-determined
//      BEFORE any byte decodes — D20-13).
//   2. Resolution order: fixtureAssetRegistry FIRST for fixture article
//      ids (fixtures never touch Dexie — the inMemoryRepository
//      discipline), db.assets via 20-03's bulkGetAssets second. Missing
//      rows + ok:false reads simply stay unresolved — the renderer's
//      placeholder owns that surface (broken state, STATE-05 calm).
//   3. useAssetUrl is an OPTIONAL-context hook: null/undefined outside the
//      provider, so BlockRenderer compiles + renders byte-unchanged for
//      any legacy caller (component tests without a provider — the
//      useOptionalHighlightOverlay pattern).
//
// Mounted in ArticleView where BOTH the visible body and the hidden
// measurement body render inside it (one map per open article = the two
// bodies share identical figure resolution; measurement sees the same
// reserved geometry the visible page will).
import { createContext, useContext, useEffect, useState } from "react";
import type { CanonicalArticle } from "../types";
import type { Block } from "../types";
import { fixtureAssetRegistry } from "../../fixtures/figure-assets";
import { bulkGetAssets } from "../../persistence/assetsStore";
import type { AssetRecordRow } from "../../persistence/db";

/** The stable empty map for articles with no figure assets (zero
 * allocations across renders — the EMPTY_HIGHLIGHTS discipline). */
const EMPTY_URLS: ReadonlyMap<string, string> = new Map();

const AssetUrlContext = createContext<ReadonlyMap<string, string> | null>(
  null,
);

/**
 * figureAssetIds — walk a block tree collecting the `asset:img-<12hex>`
 * reference BODIES (scheme-stripped assetIds) in document order, recursing
 * through containers (blockquote children + list item content — figures
 * nest per the assetStage rewrite recursion). Dedupes byte-identical twins
 * (same assetId from different figures resolves once — D7-07 self-identify
 * composed with the per-article map). The renderer-side twin of AddDialog's
 * book-arm attribution walk.
 */
export function figureAssetIds(article: CanonicalArticle): string[] {
  const ids: string[] = [];
  const visit = (blocks: readonly Block[]) => {
    for (const block of blocks) {
      if (block.kind === "figure") {
        if (block.src !== undefined && block.src.startsWith("asset:")) {
          const id = block.src.slice("asset:".length);
          if (!ids.includes(id)) ids.push(id);
        }
      } else if (block.kind === "blockquote") {
        visit(block.children);
      } else if (block.kind === "bulleted-list" || block.kind === "numbered-list") {
        for (const item of block.items) {
          visit(item.content);
        }
      }
    }
  };
  visit(article.blocks);
  return ids;
}

/**
 * AssetProvider — resolves every figure asset ref of `article` into a
 * blob object URL, exactly once per article open. Children (both reading
 * bodies) consume the map through useAssetUrl. The resolve loop guards
 * against the cleanup race with a revoked flag checked AFTER each
 * createObjectURL — a URL created after cleanup (the async Dexie path
 * resolving late) is revoked immediately, so nothing ever leaks (the
 * Pattern 4 sketch's cleanup contract, made StrictMode-twin-mount-safe).
 */
export function AssetProvider({
  article,
  children,
}: {
  article: CanonicalArticle;
  children: React.ReactNode;
}) {
  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(EMPTY_URLS);

  useEffect(() => {
    let revoked = false;
    const created: string[] = [];
    const resolve = async () => {
      const ids = figureAssetIds(article);
      if (ids.length === 0) return;
      let rows: readonly AssetRecordRow[];
      const fixtureRows = fixtureAssetRegistry.get(article.id);
      if (fixtureRows) {
        // Fixtures never touch Dexie (the inMemoryRepository discipline).
        rows = fixtureRows;
      } else {
        const result = await bulkGetAssets(article.id, ids);
        if (revoked) return; // article switched/unmounted mid-read
        if (!result.ok) return; // every ref stays unresolved (broken state)
        rows = result.assets;
      }
      const wanted = new Set(ids);
      const map = new Map<string, string>();
      for (const row of rows) {
        if (!wanted.has(row.assetId)) continue; // unreferenced rows are inert
        const url = URL.createObjectURL(row.data);
        if (revoked) {
          // Cleanup ran while this URL was being created — revoke now so
          // the create/revoke symmetry holds under every interleaving.
          URL.revokeObjectURL(url);
          return;
        }
        created.push(url);
        map.set(row.assetId, url);
      }
      if (revoked) return;
      setUrls(map);
    };
    void resolve();
    return () => {
      revoked = true;
      for (const url of created) {
        URL.revokeObjectURL(url);
      }
    };
  }, [article]);

  return (
    <AssetUrlContext.Provider value={urls}>
      {children}
    </AssetUrlContext.Provider>
  );
}

/**
 * useAssetUrl — resolve ONE figure src to its object URL. Returns
 * `undefined` for EVERY non-asset state: outside the provider (legacy
 * callers), for absent srcs (refused figures), for remote httpUrl srcs
 * (legacy rows — a remote URL NEVER reaches an img element, IMG-03 by
 * construction), and for unresolved refs (missing/corrupt/unreadable
 * rows — the broken state). The img render branch in BlockRenderer's
 * FigureMedia is gated on this value alone.
 */
export function useAssetUrl(src: string | undefined): string | undefined {
  const ctx = useContext(AssetUrlContext);
  if (ctx === null || src === undefined || !src.startsWith("asset:")) {
    return undefined;
  }
  return ctx.get(src.slice("asset:".length));
}
