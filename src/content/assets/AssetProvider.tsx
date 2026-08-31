// src/content/assets/AssetProvider.tsx
// Phase 20 Plan 20-04 Task 2 — per-article object-URL resolution context
// (RESEARCH Pattern 4). RED PLACEHOLDER: this stub exists so the RED commit
// typechecks (the 20-02 scaffolding-cast precedent); the GREEN commit
// replaces it with the resolving provider + lifecycle.
import { createContext, useContext } from "react";
import type { CanonicalArticle } from "../types";

const AssetUrlContext = createContext<ReadonlyMap<string, string> | null>(
  null,
);

/** RED placeholder — GREEN implements the block walk. */
export function figureAssetIds(_article: CanonicalArticle): string[] {
  return [];
}

/** RED placeholder — GREEN implements fixture-registry/Dexie resolution. */
export function AssetProvider({
  children,
}: {
  article: CanonicalArticle;
  children: React.ReactNode;
}) {
  return (
    <AssetUrlContext.Provider value={null}>
      {children}
    </AssetUrlContext.Provider>
  );
}

/** RED placeholder — GREEN resolves `asset:` refs through the context map. */
export function useAssetUrl(_src: string | undefined): string | undefined {
  void useContext(AssetUrlContext);
  return undefined;
}
