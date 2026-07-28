// src/content/types.ts
// Re-exports the inferred types from schema.ts. Schemas are the single source
// of truth (Zod-at-boundary). This module exists so consumers can import types
// without pulling the Zod runtime into their type-only import graph.
export type { CanonicalArticle, Block, InlineRun } from "./schema";
