// src/fixtures/index.ts
// Static-import fixture loader (D-08). Each .canonical.json is validated
// through the Article schema at module load — a malformed fixture throws at
// boot (fail-fast boundary). Fixtures are bundled code, not user input; the
// build fails loudly when a fixture drifts from the schema (Pitfall 8 — never
// load fixtures via a runtime network call to /public, which loses types,
// HMR, tree-shaking, and build-time validation).
import { ArticleSchema } from "../content/schema";
import type { CanonicalArticle } from "../content/types";
import skeletonSeed from "./articles/skeleton-seed.canonical.json";

// Plan 03 adds the curated corpus here. The seed is the only fixture in the
// Walking Skeleton vertical slice.
export const fixtures: readonly CanonicalArticle[] = [skeletonSeed].map((raw) =>
  ArticleSchema.parse(raw),
);
