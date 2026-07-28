// src/content/repository.ts
// In-memory ArticleRepository (D-08). Phase 1 reads from the bundled JSON
// fixture loader; Phase 2 swaps in a Dexie-backed implementation behind this
// same interface (Pitfall 9 forward-compat — a one-line provider change, no
// caller refactors).
import type { CanonicalArticle } from "./types";
import { fixtures } from "../fixtures";

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

// Module-level convenience wrappers — single-import surface for routes.
export const listArticles = inMemoryRepository.list;
export const openArticle = inMemoryRepository.open;
