// src/content/repository.ts
// In-memory ArticleRepository (D-08). Phase 1 reads from the bundled JSON
// fixture loader; Phase 2 swaps in a Dexie-backed implementation behind this
// same interface (Pitfall 9 forward-compat — a one-line provider change, no
// caller refactors).
//
// ── Phase 7 (D7-02): the module-level wrappers now delegate to
// `compositeLibraryRepository` (UNION of in-memory fixtures + Dexie-persisted
// ingested articles). This is the D-08 forward-compat hook landing: callers
// (FixtureList L9, ArticleView L23) are byte-unchanged, but listArticles now
// returns fixtures + ingested rows automatically. The in-memory
// `inMemoryRepository` is preserved — it's still the fixture-only reader the
// composite merges with the Dexie source.
import type { CanonicalArticle } from "./types";
import { fixtures } from "../fixtures";
import { compositeLibraryRepository } from "../ingestion/LibrarySource";

export interface ArticleRepository {
  list(): Promise<CanonicalArticle[]>;
  open(id: string): Promise<CanonicalArticle | null>;
}

export const inMemoryRepository: ArticleRepository = {
  async list() {
    return [...fixtures];
  },
  async open(id) {
    return fixtures.find((a) => a.id === id) ?? null;
  },
};

// Re-export the composite so importers of repository.ts can reach the
// underlying object (used by tests and by future Phase 8 library views).
export { compositeLibraryRepository } from "../ingestion/LibrarySource";

// Module-level convenience wrappers — single-import surface for routes.
// D7-02 swap: listArticles/openArticle now delegate to compositeLibraryRepository
// (fixtures ∪ ingested). Callers are byte-unchanged. The .bind() preserves
// the `this`-independent call semantics the composite's methods rely on
// (they reference the singleton's internal `dexieLibrarySource`).
export const listArticles = compositeLibraryRepository.list.bind(
  compositeLibraryRepository,
);
export const openArticle = compositeLibraryRepository.open.bind(
  compositeLibraryRepository,
);
