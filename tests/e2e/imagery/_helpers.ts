// tests/e2e/imagery/_helpers.ts
// Phase 20 Plan 20-08 Task 1 — shared helpers for the four imagery specs
// (offline-reopen / geometry / decode-matrix / refusal-matrix).
//
// REUSE — DO NOT FORK (the phase-PATTERNS mandate):
//   - wipeDatabase/openArticle/switchMode/totalPages/turnToPage come from
//     tests/e2e/annotations/_fixtures.ts (the canonical corpus harness).
//   - prepareFreshPage/seedRows come from tests/e2e/portability/_portability.ts
//     (the dexie-migration seeding precedent: clear-rows-not-deleteDatabase so
//     raw indexedDB.open puts land in the declared v6 schema — the 10-03
//     harness fix, avoiding the webkit deleteDatabase race).
//   - Asset bytes come from the 20-04 fixtureAssetRegistry (real
//     encoder-produced per-format samples; NEVER re-encoded here).
//
// WEBKIT ENGINE BOUNDARY (deferred-items.md, probe-verified 20-05/20-06):
// Playwright's WebKit cannot put ANY Blob value into IndexedDB. Specs that
// need PERSISTED asset rows (offline-reopen's Dexie-reopen cell) carry a
// documented test.skip; everything else in this directory is engine-complete
// because it resolves assets through the fixture REGISTRY (in-memory Blobs
// built at module load — createObjectURL never touches IndexedDB). The plan's
// own action text sanctions this: decode cells run "via the API-mock envelope
// ... OR fixture-registry seeding".
import { expect, type Locator, type Page } from "@playwright/test";
import { ArticleSchema } from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/types";
import { fixtureAssetRegistry } from "../../../src/fixtures";
import { prepareFreshPage, seedRows } from "../portability/_portability";
import { BASE, openArticle, switchMode, totalPages, turnToPage } from "../annotations/_fixtures";

// Re-export the canonical harness pieces so the four specs have ONE import
// surface for imagery-shared tooling (the _fixtures.ts discipline).
export { BASE, openArticle, switchMode, totalPages, turnToPage };

/** One 20-04 registry sample: its stable content-hash assetId (img-<12hex>,
 * keyed here by the documented sample identity from figure-assets.ts — the
 * ROW itself carries no dims) plus the orientation-corrected stored dims the
 * canonical model would carry (the module header's audited table). */
export interface RegistrySample {
  assetId: string;
  contentType: string;
  width: number;
  height: number;
}

// The audited sample table from src/fixtures/figure-assets.ts (assetId =
// img-<sha256(bytes).slice(0,12)> — content-hash stable by construction).
const SAMPLES: Record<string, RegistrySample> = {
  jpeg: {
    assetId: "img-56ac63a15ecd",
    contentType: "image/jpeg",
    width: 320,
    height: 200,
  },
  jpegExifRotated: {
    assetId: "img-e191d5d4e581",
    contentType: "image/jpeg",
    width: 200,
    height: 320,
  },
  png: {
    assetId: "img-357de6805bda",
    contentType: "image/png",
    width: 240,
    height: 180,
  },
  webp: {
    assetId: "img-869e9b853cd1",
    contentType: "image/webp",
    width: 240,
    height: 180,
  },
  gif: {
    assetId: "img-47193b718582",
    contentType: "image/gif",
    width: 240,
    height: 180,
  },
  avif: {
    assetId: "img-dc2134d6c162",
    contentType: "image/avif",
    width: 240,
    height: 180,
  },
};

/** Look up one sample AND verify its registry row exists with the matching
 * content type (a drifted registry fails fast instead of seeding a dangling
 * ref that would silently render placeholders). */
export function registrySample(key: keyof typeof SAMPLES | string): RegistrySample {
  const sample = SAMPLES[key];
  if (!sample) throw new Error(`unknown registry sample key "${key}"`);
  const row = fixtureAssetRegistry.get("figure-heavy")?.find((r) => r.assetId === sample.assetId);
  if (!row || row.contentType !== sample.contentType) {
    throw new Error(`fixtureAssetRegistry row missing/mismatched for ${sample.assetId}`);
  }
  return sample;
}

/** The decode-matrix formats (plan-locked: jpeg/png/webp/gif/avif). */
export const DECODE_FORMATS = [
  "jpeg",
  "png",
  "webp",
  "gif",
  "avif",
] as const;

/** The registry sample's raw bytes as a plain number array — the JSON-only
 * Playwright argument channel shape seedRows' assets arm consumes (the 20-05
 * browser-side-Blob construction discipline). */
export async function sampleBytes(sample: RegistrySample): Promise<number[]> {
  const rows = fixtureAssetRegistry.get("figure-heavy")!;
  const row = rows.find((r) => r.assetId === sample.assetId);
  if (!row) throw new Error(`registry row missing for ${sample.assetId}`);
  return Array.from(new Uint8Array(await row.data.arrayBuffer()));
}

/** Figure block seed shape for makeFigureArticle. */
export interface FigureSeed {
  alt: string;
  /** `asset:img-…` ref, a legacy remote http(s) URL, or undefined (refused). */
  src?: string;
  width?: number;
  height?: number;
  caption?: string;
}

/** Build an ArticleSchema-valid article whose blocks are introductory
 * paragraphs plus the given figure blocks (validated through the SHIPPED
 * schema in Node so Dexie reads never drop the row — the makeArticle
 * discipline from portability/_portability.ts, extended to figures). */
export function makeFigureArticle(opts: {
  id: string;
  title: string;
  paragraphs: string[];
  figures: FigureSeed[];
}): CanonicalArticle {
  return ArticleSchema.parse({
    id: opts.id,
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/imagery",
      title: opts.title,
      retrievedAt: "2026-08-31T00:00:00.000Z",
      originalHtmlHash: `sha256:${"0".repeat(64)}`,
    },
    blocks: [
      ...opts.paragraphs.map((text) => ({
        kind: "paragraph",
        content: [{ text, marks: [] }],
      })),
      ...opts.figures.map((fig) => ({
        kind: "figure",
        alt: fig.alt,
        ...(fig.src !== undefined ? { src: fig.src } : {}),
        ...(fig.width !== undefined ? { width: fig.width } : {}),
        ...(fig.height !== undefined ? { height: fig.height } : {}),
        ...(fig.caption !== undefined
          ? { caption: [{ text: fig.caption, marks: [] }] }
          : {}),
      })),
    ],
  });
}

/**
 * Deterministic first-run state + seed article rows (and optionally asset
 * rows) in ONE step: prepareFreshPage (clear-rows, schema-declared) then
 * seedRows. Callers then navigate with openArticle. The `assets` arm builds
 * Blobs BROWSER-SIDE inside the page — callers on webkit must not pass any
 * (the documented engine boundary).
 */
export async function seedImageryArticle(
  page: Page,
  article: CanonicalArticle,
  assets?: Array<{
    assetId: string;
    contentType: string;
    byteLength: number;
    dataBytes: number[];
  }>,
): Promise<void> {
  await prepareFreshPage(page);
  await seedRows(page, {
    articles: [article as unknown as Record<string, unknown>],
    ...(assets !== undefined && assets.length > 0
      ? {
          assets: assets.map((a) => ({
            articleId: article.id,
            assetId: a.assetId,
            contentType: a.contentType,
            byteLength: a.byteLength,
            dataBytes: a.dataBytes,
            createdAt: "2026-08-31T00:00:00.000Z",
          })),
        }
      : {}),
  });
}

/**
 * The VISIBLE figure imgs — never the always-mounted hidden
 * .article-body-measurement clone (Plan 04-08), which renders the same
 * figures for measurement inside the provider. Matches the live
 * .page-fragment in paginated mode and the live .article-body in scrolling
 * mode (the ordered-union discipline from _fixtures.ts).
 */
export function visibleFigureImgs(page: Page): Locator {
  return page.locator(
    ".page-fragment figure img, .article-body:not(.article-body-measurement) figure img",
  );
}

/** The visible placeholders (same surface-scoping discipline). */
export function visiblePlaceholders(page: Page): Locator {
  return page.locator(
    ".page-fragment figure .figure-placeholder, .article-body:not(.article-body-measurement) figure .figure-placeholder",
  );
}

/**
 * Wait for one visible figure img to fully DECODE (naturalWidth > 0 —
 * decode, not layout; IMG-03's reader-visible half). Scrolls it into view
 * first because accepted figures render loading="lazy" (UI-SPEC
 * Interaction 8): an off-viewport img never spends decode work.
 */
export async function waitForDecoded(img: Locator): Promise<void> {
  await img.scrollIntoViewIfNeeded();
  await expect
    .poll(async () => await img.evaluate((el) => (el as HTMLImageElement).naturalWidth), {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);
}

/**
 * Find the 0-based page carrying the first visible element matching
 * `selector` inside a page fragment (the D13-09 walk-pages discipline —
 * figures legitimately live on later pages under the Option A page-1
 * budget). Returns -1 when no page carries a match. Leaves the reader ON
 * the matching page.
 */
export async function findPageWith(
  page: Page,
  selector: string,
): Promise<number> {
  const total = await totalPages(page);
  for (let target = 0; target < total; target += 1) {
    await turnToPage(page, target);
    const found = await page.evaluate(
      (sel) => {
        const el = document.querySelector(`.page-fragment ${sel}`);
        return el !== null;
      },
      selector,
    );
    if (found) return target;
  }
  return -1;
}
