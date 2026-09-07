// src/fixtures/index.ts
// Static-import fixture loader (D-08). Each .canonical.json is validated
// through the Article schema at module load — a malformed fixture throws at
// boot (fail-fast boundary). Fixtures are bundled code, not user input; the
// build fails loudly when a fixture drifts from the schema (Pitfall 8 — never
// load fixtures via a runtime network call to /public, which loses types,
// HMR, tree-shaking, and build-time validation).
import { ArticleSchema } from "../content/schema";
import type { CanonicalArticle } from "../content/types";
import gettingStarted from "./articles/getting-started.canonical.json" with { type: "json" };
import essayLongForm from "./articles/essay-long-form.canonical.json" with { type: "json" };
import technicalPost from "./articles/technical-post.canonical.json" with { type: "json" };
import figureHeavy from "./articles/figure-heavy.canonical.json" with { type: "json" };
import footnoteAcademic from "./articles/footnote-academic.canonical.json" with { type: "json" };
import listReference from "./articles/list-reference.canonical.json" with { type: "json" };
import unsupportedCase from "./articles/unsupported-case.canonical.json" with { type: "json" };
import nestedListPaths from "./articles/nested-list-paths.canonical.json" with { type: "json" };

// Plan 03 curated corpus (D-01, D-02, D-03). Six real published articles
// spanning the D-01 genre matrix, each carrying real provenance. Collectively
// they exercise every supported block kind plus the DOC-06 unsupported
// disclosure (tables/embeds in unsupported-case, plus bonus elements elsewhere).
// Phase 19 (D19-15) adds the 7th member — nested-list-paths — carrying the
// 3-level list recursion + a link run mid-item (Pitfall 4 multi-run
// alignment); strengthen-only for every corpus consumer.
export const regressionFixtures: readonly CanonicalArticle[] = [
  essayLongForm,
  technicalPost,
  figureHeavy,
  footnoteAcademic,
  listReference,
  unsupportedCase,
  nestedListPaths,
].map((raw) => ArticleSchema.parse(raw));

// The portfolio-facing starter library is deliberately separate from the
// regression corpus above. Fresh readers see a useful onboarding article;
// browser and pagination tests retain their stable, representative cases.
export const libraryFixtures: readonly CanonicalArticle[] = [gettingStarted].map((raw) =>
  ArticleSchema.parse(raw),
);

/** Public bundled articles shown in a fresh library. */
export const fixtures = libraryFixtures;

/** Every bundled article that remains directly addressable by id. */
export const bundledFixtures: readonly CanonicalArticle[] = [
  ...libraryFixtures,
  ...regressionFixtures,
];

// Phase 20 (20-04 Task 1): the bundled per-format fixture ASSET corpus for
// figure-heavy (local asset: refs + stored dims in the canonical JSON
// above). Re-exported here so `src/fixtures` stays the one import surface —
// the AssetProvider consults it FIRST for fixture article ids (fixtures
// never touch Dexie), and e2e specs build asset envelopes from its rows.
export { fixtureAssetRegistry } from "./figure-assets";
