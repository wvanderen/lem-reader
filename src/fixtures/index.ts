// src/fixtures/index.ts
// Static-import fixture loader (D-08). Each .canonical.json is validated
// through the Article schema at module load — a malformed fixture throws at
// boot (fail-fast boundary). Fixtures are bundled code, not user input; the
// build fails loudly when a fixture drifts from the schema (Pitfall 8 — never
// load fixtures via a runtime network call to /public, which loses types,
// HMR, tree-shaking, and build-time validation).
import { ArticleSchema } from "../content/schema";
import type { CanonicalArticle } from "../content/types";
import essayLongForm from "./articles/essay-long-form.canonical.json";
import technicalPost from "./articles/technical-post.canonical.json";
import figureHeavy from "./articles/figure-heavy.canonical.json";
import footnoteAcademic from "./articles/footnote-academic.canonical.json";
import listReference from "./articles/list-reference.canonical.json";
import unsupportedCase from "./articles/unsupported-case.canonical.json";

// Plan 03 curated corpus (D-01, D-02, D-03). Six real published articles
// spanning the D-01 genre matrix, each carrying real provenance. Collectively
// they exercise every supported block kind plus the DOC-06 unsupported
// disclosure (tables/embeds in unsupported-case, plus bonus elements elsewhere).
export const fixtures: readonly CanonicalArticle[] = [
  essayLongForm,
  technicalPost,
  figureHeavy,
  footnoteAcademic,
  listReference,
  unsupportedCase,
].map((raw) => ArticleSchema.parse(raw));
