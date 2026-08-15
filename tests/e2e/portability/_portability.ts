// tests/e2e/portability/_portability.ts
// Plan 09-06 — shared helpers for the portability phase-exit e2e gates.
//
// Reuse discipline (REUSE-DO-NOT-FORK):
//   - readRow/countRows/clear-all-stores clone the remove-cascade.spec.ts
//     harness (itself cloned from dexie-migration.spec.ts) — the proven
//     raw-IndexedDB truth path across chromium/firefox/webkit.
//   - The Node-side bundle builder composes the SHIPPED schemas + manifest
//     (ExportBundleSchema.parse self-check + computeManifest + fflate
//     zipSync) so hand-built test bundles are byte-indistinguishable from
//     real exports at the validation boundary.
//   - confidentHighlightOn derives quote selectors through the SHIPPED
//     deriveQuoteSelector + resolveQuoteSelector machinery (never a forked
//     offset computation — any divergence would shift every anchor).
//
// This file is a helper (leading underscore), not a spec — Playwright's
// default testMatch ignores it.
import { readFileSync } from "node:fs";
import { expect, type Locator, type Page } from "@playwright/test";
import { zipSync, unzipSync, strToU8 } from "fflate";
import { ArticleSchema } from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/types";
import {
  deriveQuoteSelector,
  graphemeLength,
  resolveQuoteSelector,
} from "../../../src/content/normalizeText";
import type { TextPositionSelector, TextQuoteSelector } from "../../../src/content/normalizeText";
import { ExportBundleSchema } from "../../../src/portability/bundle";
import { computeManifest } from "../../../src/portability/manifest";

export const BASE = "http://localhost:5173";

/** Pure-string SVG stub (open-every-fixture.spec.ts rationale). */
export const PIXEL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';

/** Stub remote images so figure-heavy content never couples to the network. */
export async function stubImages(page: Page): Promise<void> {
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: PIXEL_SVG }),
  );
}

/**
 * Mount the SPA (so Dexie constructs the lem-reader schema) then CLEAR every
 * store's rows — the remove-cascade clear-rows-not-deleteDatabase discipline
 * (avoids the webkit deleteDatabase race). After this the page is at #/ with
 * deterministic first-run state.
 */
export async function prepareFreshPage(page: Page): Promise<void> {
  await stubImages(page);
  await page.goto(`${BASE}/`);
  await expect(page.getByRole("heading", { name: "Saved articles" })).toBeVisible({
    timeout: 10_000,
  });
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        const db = req.result;
        const stores = ["articles", "settings", "location", "highlights", "notes"];
        const existing = stores.filter((s) => db.objectStoreNames.contains(s));
        if (existing.length === 0) {
          resolve();
          return;
        }
        const tx = db.transaction(existing, "readwrite");
        for (const s of existing) {
          tx.objectStore(s).clear();
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
      req.onerror = () => resolve();
    });
  });
}

/**
 * Open the Settings panel via the header gear (aria-label "Reading settings")
 * and return the panel locator. The "Your data" cluster lives inside.
 */
export async function openSettings(page: Page): Promise<Locator> {
  const panel = page.locator("dialog.settings-panel");
  await page.getByRole("button", { name: "Reading settings" }).click();
  await expect(panel).toBeVisible();
  return panel;
}

/** The "Your data" cluster's role=status live region (D2-13 pattern). */
export function settingsStatus(page: Page): Locator {
  return page.locator("dialog.settings-panel .status");
}

/** The visually-hidden bundle file input inside the settings panel. */
export function bundleInput(page: Page): Locator {
  return page.locator('dialog.settings-panel input[type="file"][accept=".zip"]');
}

// ── Raw IndexedDB truth helpers (remove-cascade.spec.ts clones) ──────────────

type SerializableKey = string | number | (string | number)[];

/** Read a single row from the named store by (possibly compound array) key. */
export async function readRow(
  page: Page,
  storeName: string,
  key: IDBValidKey,
): Promise<Record<string, unknown> | null> {
  return page.evaluate<Record<string, unknown> | null, { storeName: string; key: SerializableKey }>(
    async ({ storeName, key }): Promise<Record<string, unknown> | null> => {
      return new Promise<Record<string, unknown> | null>((resolve) => {
        const req = indexedDB.open("lem-reader");
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(storeName)) {
            resolve(null);
            return;
          }
          const tx = db.transaction(storeName, "readonly");
          const getReq = tx.objectStore(storeName).get(key as IDBValidKey);
          getReq.onsuccess = () =>
            resolve((getReq.result ?? null) as Record<string, unknown> | null);
          getReq.onerror = () => resolve(null);
        };
        req.onerror = () => resolve(null);
      });
    },
    { storeName, key: key as SerializableKey },
  );
}

/** Count the rows in the named store. */
export async function countRows(page: Page, storeName: string): Promise<number> {
  return page.evaluate(async (storeName) => {
    return new Promise<number>((resolve) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(storeName)) {
          resolve(-1);
          return;
        }
        const tx = db.transaction(storeName, "readonly");
        const countReq = tx.objectStore(storeName).count();
        countReq.onsuccess = () => resolve(countReq.result);
        countReq.onerror = () => resolve(-1);
      };
      req.onerror = () => resolve(-1);
    });
  }, storeName);
}

/** Read every row of the named store (e.g. to find a keep-both minted id). */
export async function readAllRows(
  page: Page,
  storeName: string,
): Promise<Record<string, unknown>[]> {
  return page.evaluate(async (storeName) => {
    return new Promise<Record<string, unknown>[]>((resolve) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(storeName)) {
          resolve([]);
          return;
        }
        const tx = db.transaction(storeName, "readonly");
        const allReq = tx.objectStore(storeName).getAll();
        allReq.onsuccess = () => resolve((allReq.result ?? []) as Record<string, unknown>[]);
        allReq.onerror = () => resolve([]);
      };
      req.onerror = () => resolve([]);
    });
  }, storeName);
}

// ── Seeding (raw IndexedDB puts — remove-cascade seedCascadeRows style) ──────

/** Serializable row payloads for seedRows (raw shapes, schema-valid by
 * construction because callers build them through the shipped schemas). */
export interface SeedRows {
  articles?: Record<string, unknown>[];
  highlights?: Record<string, unknown>[];
  notes?: Record<string, unknown>[];
  locations?: Record<string, unknown>[];
  settings?: Record<string, unknown>[];
}

/** Write the given rows across the five stores in ONE IndexedDB transaction. */
export async function seedRows(page: Page, rows: SeedRows): Promise<void> {
  await page.evaluate(
    async (rows) => {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("lem-reader");
        req.onsuccess = () => {
          const db = req.result;
          const wanted = ["articles", "highlights", "notes", "location", "settings"].filter((s) =>
            db.objectStoreNames.contains(s),
          );
          if (wanted.length === 0) {
            resolve();
            return;
          }
          const tx = db.transaction(wanted, "readwrite");
          for (const a of rows.articles ?? []) tx.objectStore("articles").put(a);
          for (const h of rows.highlights ?? []) tx.objectStore("highlights").put(h);
          for (const n of rows.notes ?? []) tx.objectStore("notes").put(n);
          for (const l of rows.locations ?? []) tx.objectStore("location").put(l);
          for (const s of rows.settings ?? []) tx.objectStore("settings").put(s);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    },
    rows as {
      articles?: Record<string, unknown>[];
      highlights?: Record<string, unknown>[];
      notes?: Record<string, unknown>[];
      locations?: Record<string, unknown>[];
      settings?: Record<string, unknown>[];
    },
  );
}

// ── Node-side article + highlight construction (shipped schemas only) ────────

/** Build an ArticleSchema-valid article from plain paragraphs (the spec-side
 * seed shape — validated through the shipped schema so Dexie reads never
 * drop it). */
export function makeArticle(opts: {
  id: string;
  title: string;
  paragraphs: string[];
  sourceUrl?: string;
  author?: string;
}): CanonicalArticle {
  return ArticleSchema.parse({
    id: opts.id,
    revision: 1,
    lang: "en",
    provenance: {
      ...(opts.sourceUrl !== undefined ? { sourceUrl: opts.sourceUrl } : {}),
      title: opts.title,
      ...(opts.author !== undefined ? { author: opts.author } : {}),
      retrievedAt: "2026-08-15T00:00:00.000Z",
      originalHtmlHash: `sha256:${"0".repeat(64)}`,
    },
    blocks: opts.paragraphs.map((text) => ({
      kind: "paragraph",
      content: [{ text, marks: [] }],
    })),
  });
}

/** A derived-and-verified confident highlight anchor: the position/quote pair
 * a seed uses so re-resolution returns a TextPositionSelector (confident), on
 * THIS Node's resolver — the same shipped machinery the importer runs. For
 * simple ASCII passages, grapheme segmentation is engine-identical. */
export function confidentHighlightOn(
  article: CanonicalArticle,
  opts: { start?: number; length?: number } = {},
): { position: TextPositionSelector; quote: TextQuoteSelector } {
  const total = graphemeLength(article);
  const len = opts.length ?? 28;
  for (let start = opts.start ?? 8; start + len < total; start += 13) {
    const position = { start, end: start + len };
    const quote = deriveQuoteSelector(article, position);
    const resolved = resolveQuoteSelector(article, quote, position);
    if (typeof resolved === "object") {
      return { position, quote };
    }
  }
  throw new Error(`no confident passage found for article ${article.id} (len ${total})`);
}

/** A minimal schema-valid HighlightRecord row payload for seeding. */
export function highlightRow(
  articleId: string,
  anchor: { position: TextPositionSelector; quote: TextQuoteSelector },
  id: string,
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id,
    articleId,
    revision: 1,
    position: anchor.position,
    quote: anchor.quote,
    createdAt: "2026-08-15T00:00:00.000Z",
  };
}

// ── Node-side bundle construction (for import-flow specs) ─────────────────────

/**
 * Build a real, valid bundle .zip in Node from an ExportBundle-shaped object:
 * the same ExportBundleSchema.parse self-check + computeManifest +
 * bundle.json (pretty) / manifest.json (minified) layout buildBundleBytes
 * produces. The input is `unknown` on purpose — the parse IS the self-check,
 * so callers construct plain objects and invalid shapes throw here, in Node.
 * Returns a Buffer for setInputFiles' { name, mimeType, buffer }
 * payload, or callers may write it to disk for the path payload.
 */
export async function buildBundleZip(bundle: unknown): Promise<Buffer> {
  const parsed = ExportBundleSchema.parse(bundle);
  const manifest = await computeManifest(parsed);
  return Buffer.from(
    zipSync({
      "bundle.json": strToU8(JSON.stringify(parsed, null, 2)),
      "manifest.json": strToU8(JSON.stringify(manifest)),
    }),
  );
}

/** Convenience: read + unzip + parse a downloaded bundle's bundle.json. */
export function readBundleJson(bundlePath: string): {
  bundle: Record<string, unknown>;
  entries: Record<string, Uint8Array>;
} {
  const entries = unzipSync(new Uint8Array(readFileSync(bundlePath)));
  const bundleJson = entries["bundle.json"];
  if (bundleJson === undefined) {
    throw new Error("bundle.json missing from exported bundle");
  }
  return {
    bundle: JSON.parse(new TextDecoder().decode(bundleJson)) as Record<string, unknown>,
    entries,
  };
}

/**
 * SC#4 data-minimization walk: collect every key (anywhere in the parsed
 * object, at any depth) whose name contains "page" — page numbers and
 * page-derived data must never appear in a bundle.
 */
export function collectPageKeys(value: unknown, path = "$", found: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((v, i) => collectPageKeys(v, `${path}[${i}]`, found));
    return found;
  }
  if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k.toLowerCase().includes("page")) {
        found.push(`${path}.${k}`);
      }
      collectPageKeys(v, `${path}.${k}`, found);
    }
  }
  return found;
}
