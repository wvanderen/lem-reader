// src/ingestion/library/ContinueReadingStrip.tsx
// Plan 08-03 Task 2 — ContinueReadingStrip (D8-09, D8-10, D8-12). Spare
// section above the main library list showing the 1–3 most-recently-OPENED
// UNFINISHED articles. Mounted only when the unfinished set is non-empty
// (returns null otherwise — spare chrome per UI-SPEC §ContinueReadingStrip).
//
// The strip is distinct from the main list:
//   - Single column (never widens — `.continue-reading { grid-template-
//     columns: 1fr }`); the strip does not compete with the main grid.
//   - NO source badge, NO remove affordance, NO tag chips — just the resume
//     gesture (title link + author + per-row progress hairline).
//
// Substrate (D-05 grapheme offset):
//   - `loadAllLocations()` (Plan 02) returns ALL persisted LocationRecords
//     (Zod-validated per row — STATE-04 corrupt-row drop).
//   - For each article, the latest matching location is found by articleId
//     (max savedAt per articleId — D8-10 "recently-read = opened").
//   - `progress = location.graphemeOffset / total` where `total =
//     graphemeClusters(normalizeText(article), article.lang).length`.
//   - Filter: `lastOpened !== null && progress < FINISHED_THRESHOLD`.
//   - Sort: `savedAt` descending (most-recently-opened first — D8-10).
//   - Slice: cap 3 (D8-09 calm lower end).
//
// `FINISHED_THRESHOLD = 0.98` (RESEARCH §Pattern 4 L498) is EXPORTED so unit
// + e2e tests can reference the same constant (not a magic number).
import { useEffect, useState } from "react";
import type { CanonicalArticle } from "../../content/types";
import type { LocationRecord } from "../../content/schema";
import { normalizeText, graphemeClusters } from "../../content/normalizeText";
import { listArticles } from "../../content/repository";
import { loadAllLocations } from "../../persistence/locationStore";
import { ProgressHairline } from "../../reader/ProgressHairline";

/**
 * FINISHED_THRESHOLD — D8-12 + RESEARCH §Pattern 4 L498 recommendation. At or
 * above this ratio the article is "Finished": it leaves the continue-reading
 * strip and shows the filled-hairline + "Finished" mark in the main list.
 * Exported so tests + LibraryRow (the Finished mark) can reference the same
 * value without forking the constant.
 *
 * (`LibraryRow` uses a local `FINISHED_RATIO = 0.98` literal — when Plan 04
 * lands RemoveConfirm + the row wiring is finalized, the literal can be
 * unified. For Plan 03 they are intentionally separate to keep the strip
 * + the row decoupled.)
 */
export const FINISHED_THRESHOLD = 0.98;

/** The cap on continue-reading cards (D8-09 — calm lower end). */
const CONTINUE_READING_CAP = 3;

interface AnnotatedArticle {
  article: CanonicalArticle;
  location: LocationRecord | null;
  progress: number;
}

/**
 * ContinueReadingStrip — derives the most-recently-opened unfinished set from
 * `listArticles()` + `loadAllLocations()` on mount. Returns null while
 * loading OR when the unfinished set is empty (spare chrome).
 */
export function ContinueReadingStrip() {
  const [annotated, setAnnotated] = useState<AnnotatedArticle[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listArticles(), loadAllLocations()])
      .then(([articles, locations]) => {
        if (cancelled) return;
        // Index the latest location per articleId (max savedAt per articleId —
        // D8-10 "recently-read = opened"; savedAt is updated on every open).
        const latestByArticle = new Map<string, LocationRecord>();
        for (const loc of locations) {
          const prev = latestByArticle.get(loc.articleId);
          if (!prev || loc.savedAt > prev.savedAt) {
            latestByArticle.set(loc.articleId, loc);
          }
        }
        const withProgress: AnnotatedArticle[] = articles.map((article) => {
          const location = latestByArticle.get(article.id) ?? null;
          const total = graphemeClusters(
            normalizeText(article),
            article.lang,
          ).length;
          const progress = location
            ? Math.min(1, location.graphemeOffset / total)
            : 0;
          return { article, location, progress };
        });
        const unfinished = withProgress
          .filter(
            (x) => x.location !== null && x.progress < FINISHED_THRESHOLD,
          )
          .sort((a, b) => {
            // savedAt descending (most-recently-opened first — D8-10). Both
            // locations are non-null after the filter above.
            const aAt = a.location!.savedAt;
            const bAt = b.location!.savedAt;
            return aAt < bAt ? 1 : aAt > bAt ? -1 : 0;
          })
          .slice(0, CONTINUE_READING_CAP);
        setAnnotated(unfinished);
      })
      .catch(() => {
        if (cancelled) return;
        // Fail quiet — the strip is spare chrome; a load failure just hides
        // it (mirrors FixtureList's "ready + empty" non-error discipline).
        setAnnotated([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // null = still loading; [] = loaded but empty → render nothing in both cases.
  if (!annotated || annotated.length === 0) return null;

  return (
    <section className="continue-reading-strip" aria-labelledby="cr-heading">
      <h2 id="cr-heading">Continue reading</h2>
      <ul className="continue-reading">
        {annotated.map(({ article, progress }) => (
          <li key={article.id} className="continue-reading-row">
            <a href={`#/article/${article.id}`}>{article.provenance.title}</a>
            {article.provenance.author && (
              <p className="meta">{article.provenance.author}</p>
            )}
            <ProgressHairline progress={progress} />
          </li>
        ))}
      </ul>
    </section>
  );
}
