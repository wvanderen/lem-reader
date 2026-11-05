// src/reader/useWorkStructure.ts
// Issue #236 — the reader's ONE structure seam: resolve the work's stable
// chapter/reading-part destinations for an article, and keep the optional
// persisted snapshot fresh.
//
// Resolution order (the freeze contract):
//   1. A SAVED snapshot (article.structure) that validates against the
//      article's canonical content is used AS-IS — frozen. Typography
//      changes, reloads, and generator updates never renumber an
//      established work's destinations.
//   2. Otherwise the structure derives immediately from canonical content
//      (deterministic — same boundaries and ids a snapshot would carry), so
//      orientation exists in the FIRST commit and reading never blocks on
//      persistence.
//   3. Derived-only structures persist LAZILY — once per article revision,
//      through structureStore.saveWorkStructure (partial, revision-guarded).
//      Bundled fixtures have no Dexie row and never gain phantom ones.
//
// Failure is disclosed, never thrown and never blocking: the outcome state
// tells the truth (saved / stale / failed) and the derived structure stays
// fully usable either way.
import { useEffect, useMemo, useRef, useState } from "react";
import type { CanonicalArticle, WorkStructure } from "../content/schema";
import {
  deriveWorkStructure,
  resolveWorkPosition,
  formatOrientationLabel,
  validateWorkStructure,
  type WorkPosition,
} from "../content/structure";
import { bundledFixtures } from "../fixtures";
import { saveWorkStructure } from "../persistence/structureStore";

export type WorkStructureOrigin = "saved" | "derived" | null;
export type WorkStructureSaveOutcome =
  | "saved"
  | "missing-row"
  | "revision-changed"
  | "write-failed"
  | null;

export interface WorkStructureState {
  /** The validated structure (saved or derived), or null (no article / no
   * readable text — orientation stays silent rather than inventing one). */
  structure: WorkStructure | null;
  /** Where the structure came from this open. */
  origin: WorkStructureOrigin;
  /** The lazy persistence attempt's outcome (null = none attempted — saved
   * snapshots and fixtures don't attempt one). */
  saveOutcome: WorkStructureSaveOutcome;
}

/** Resolve a canonical offset to its orientation label ("" when silent). */
export function orientationLabelFor(
  article: CanonicalArticle,
  structure: WorkStructure | null,
  offset: number | undefined,
): string {
  if (structure === null || offset === undefined) return "";
  const position: WorkPosition | null = resolveWorkPosition(article, structure, offset);
  return formatOrientationLabel(position);
}

export function useWorkStructure(article: CanonicalArticle | null): WorkStructureState {
  const structure = useMemo(() => {
    if (article === null) return null;
    // 1. A valid saved snapshot is the established one — frozen.
    if (article.structure !== undefined) {
      const saved = validateWorkStructure(article, article.structure);
      if (saved !== null) return saved;
    }
    // 2. Derive (synchronously — orientation exists in the first commit).
    // The derivation self-check: resolveWorkPosition assumes a VALIDATED
    // structure, so a derived one must pass the same gate a saved snapshot
    // does — a future derivation bug degrades to honest silence (no
    // orientation) rather than a mis-resolved position.
    const derived = deriveWorkStructure(article);
    if (derived === undefined) return null;
    return validateWorkStructure(article, derived);
  }, [article]);

  const origin: WorkStructureOrigin =
    structure === null
      ? null
      : article !== null &&
          article.structure !== undefined &&
          validateWorkStructure(article, article.structure) !== null
        ? "saved"
        : "derived";

  const [saveOutcome, setSaveOutcome] = useState<WorkStructureSaveOutcome>(null);
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    setSaveOutcome(null);
    if (article === null || origin !== "derived" || structure === null) return;
    // One attempt per article+revision — never a retry storm.
    const attemptKey = `${article.id}@${article.revision}`;
    if (attempted.current === attemptKey) return;
    attempted.current = attemptKey;
    // Bundled fixtures are read-only samples: no Dexie row exists, and a
    // structure row for a fixture id would be a phantom.
    if (bundledFixtures.some((f) => f.id === article.id)) return;
    let cancelled = false;
    void saveWorkStructure(article.id, article.revision, structure).then((outcome) => {
      if (cancelled) return;
      setSaveOutcome(outcome.saved ? "saved" : outcome.reason);
      if (!outcome.saved) {
        // Honest disclosure without blocking: the reader keeps the derived
        // structure; the snapshot simply is not cached yet (the next open
        // tries again).
        console.warn(
          `[structure] lazy persistence did not save for ${article.id}@${article.revision}: ${outcome.reason}`,
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [article, origin, structure]);

  return { structure, origin, saveOutcome };
}
