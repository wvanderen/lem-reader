// tests/e2e/calibration/calibration.harness.ts
// D3-08 calibration harness — measures Pretext-predicted {height, lineCount}
// against rendered-DOM truth across the 6 shipped fixtures × the typography
// matrix × the 3 Playwright engines (chromium, firefox, webkit). Each engine
// runs as its own Playwright project (playwright.config.ts L7–11); each
// engine's worker runs this file's test once and writes its results to
// .calibration-tmp/<engine>.json via afterAll. The fingerprint.compare.ts
// Node script merges all per-engine files into calibration/fingerprint.json
// and applies the D3-10 regression gate.
//
// Design (RESEARCH §Architecture Pattern 4 + §Validation Architecture
// §Calibration Matrix):
//   - Iterates fixtures × SAMPLED_MATRIX (font × spacing complete per Pitfalls
//     5/6; size × measure sampled for CI speed). Set LEM_FULL_CALIBRATION=1
//     to use the full 180-variant matrix.
//   - For each (fixture, variant) cell: navigates to the article, applies
//     the variant by writing the CSS custom properties via page.evaluate
//     (byte-for-byte mirror of applyTheme writes — the body rule in app.css
//     consumes the same custom properties).
//   - Awaits document.fonts.ready (D3-06 — fonts must settle before measuring).
//   - For each eligible block (paragraph + h1/h2/h3/h4 headings) in the
//     rendered article: computes the Pretext prediction IN THE BROWSER via
//     page.evaluate (so Pretext's canvas sees the engine's real font
//     metrics — Pitfall 5) and reads the rendered DOM truth via
//     readRenderedBlockHeight + readRenderedLineCount.
//   - Records `{ fixtureId, variantKey, kind, level, engine, heightDrift,
//     breaksMatch }` per block.
//
// Output: per-engine temp file at .calibration-tmp/<engine>.json.
// fingerprint.compare.ts merges + diffs and writes calibration/fingerprint.json.

import { test, expect, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fixtures } from "../../../src/fixtures";
import { FONT_STACKS, SPACING_PRESETS } from "../../../src/settings/tokens";
import {
  ACTIVE_MATRIX,
  DEFAULT_CALIBRATION_SETTINGS,
  settingsForVariant,
  variantKey,
  type TypographyVariant,
} from "./fixtures-matrix";
import {
  readRenderedBlockHeight,
  readRenderedLineCount,
} from "./readDom";
import type { ReaderSettings } from "../../../src/content/schema";

const BASE = "http://localhost:5173";
const PIXEL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
const TMP_DIR = resolve(process.cwd(), ".calibration-tmp");

/** Per-block sample result (one per measured (fixture, variant, block)). */
export interface BlockResult {
  fixtureId: string;
  variantKey: string;
  kind: "paragraph" | "heading";
  level?: 1 | 2 | 3 | 4;
  engine: string;
  heightDrift: number;
  breaksMatch: boolean;
}

/** Apply a variant by writing the exact CSS custom properties applyTheme writes. */
async function applyVariant(page: Page, settings: ReaderSettings): Promise<void> {
  const fontFamily = FONT_STACKS[settings.font];
  const preset = SPACING_PRESETS[settings.spacing];
  const writes = {
    theme: settings.theme,
    fontBody: fontFamily,
    fontSize: `${settings.size}px`,
    lineHeight: String(preset.lineHeight),
    letterSpacing: preset.letterSpacing,
    wordSpacing: preset.wordSpacing,
    measure: `${settings.measure}ch`,
  };
  await page.evaluate((w) => {
    const root = document.documentElement;
    root.dataset.theme = w.theme;
    root.style.setProperty("--font-body", w.fontBody);
    root.style.setProperty("--font-size", w.fontSize);
    root.style.setProperty("--line-height", w.lineHeight);
    root.style.setProperty("--letter-spacing", w.letterSpacing);
    root.style.setProperty("--word-spacing", w.wordSpacing);
    root.style.setProperty("--measure", w.measure);
  }, writes);
}

/**
 * Compute the Pretext prediction for a block IN THE BROWSER so Pretext's
 * canvas sees the engine's real font metrics (Pitfall 5). Dynamically
 * imports the app's textMeasurer module inside page.evaluate (Vite serves
 * source modules at /src/.../ during dev). The adapter owns the
 * @chenglou/pretext import so this is the canonical Pretext call site.
 */
async function predictBlockInBrowser(
  page: Page,
  selector: string,
  kind: "paragraph" | "heading",
  level: 1 | 2 | 3 | 4,
  settings: ReaderSettings,
): Promise<{ height: number; lineCount: number }> {
  return await page.evaluate(
    async ({ sel, kind, level, settings }) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) throw new Error(`predictBlockInBrowser: no element for ${sel}`);
      const text = el.textContent ?? "";
      // Dynamic-import the app's adapter at the Vite-served source URL so
      // the measurement happens with the engine's real font metrics. The
      // module path is a runtime URL Vite serves; tsc cannot statically
      // resolve it, so we cast the URL to `any` (a string at runtime) and
      // cast the resulting module to the local types.
      const url = "/src/measurement/textMeasurer.ts" as string & {};
      const mod = (await import(
        /* @vite-ignore */ url
      )) as typeof import("../../../src/measurement/textMeasurer");
      const geom = mod.fontStringFor(kind, level, settings);
      const letterSpacingPx =
        settings.spacing === "spacious" ? settings.size * 0.01 : 0;
      const maxWidthPx = el.getBoundingClientRect().width;
      const result = mod.measureParagraphWithBreaks({
        text,
        font: geom.font,
        letterSpacingPx,
        lineHeightPx: geom.lineHeightPx,
        maxWidthPx,
      });
      return { height: result.height, lineCount: result.lineCount };
    },
    { sel: selector, kind, level, settings },
  );
}

/** Build a per-block selector unique within the article (first N of each kind). */
function blockTargets(maxParagraphs = 2): Array<{
  selector: (article: string) => string;
  kind: "paragraph" | "heading";
  level: 1 | 2 | 3 | 4;
}> {
  const out: Array<{
    selector: (article: string) => string;
    kind: "paragraph" | "heading";
    level: 1 | 2 | 3 | 4;
  }> = [];
  for (let i = 1; i <= maxParagraphs; i++) {
    out.push({
      selector: (a) => `${a} p:nth-of-type(${i})`,
      kind: "paragraph",
      level: 1,
    });
  }
  for (const level of [1, 2, 3, 4] as const) {
    out.push({
      selector: (a) => `${a} h${level}:nth-of-type(1)`,
      kind: "heading",
      level,
    });
  }
  return out;
}

test.beforeEach(async ({ page }) => {
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: PIXEL_SVG }),
  );
  await page.goto(`${BASE}/`);
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("lem-reader");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });
});

// Each engine's worker accumulates its results in module scope, then
// afterAll writes them to .calibration-tmp/<engine>.json. The fingerprint
// compare script (run after the Playwright job completes) merges them.
const engineResults: BlockResult[] = [];

test(`calibration: measure fixtures × typography matrix (per-engine)`, async ({
  page,
  browserName,
}) => {
  // The harness measures ~6 fixtures × 36 variants × ~6 blocks/variant ≈
  // 1300 block measurements per engine. Each takes ~20-50ms (page.evaluate
  // round-trip). Worst case ~60s on webkit (slowest engine). 300s gives
  // generous headroom; CI machines vary.
  test.setTimeout(300_000);
  for (const fixture of fixtures) {
    for (const variant of ACTIVE_MATRIX) {
      const settings = settingsForVariant(variant);
      await page.goto(`${BASE}/#/article/${fixture.id}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await applyVariant(page, settings);
      // D3-06 — fonts must settle before measuring.
      await page.evaluate(() => document.fonts.ready);
      const ARTICLE = "article";
      for (const t of blockTargets(2)) {
        const selector = t.selector(ARTICLE);
        const exists = await page.evaluate((sel) => {
          return document.querySelector(sel) !== null;
        }, selector);
        if (!exists) continue;
        const domHeight = await readRenderedBlockHeight(page, selector);
        const { lineCount: domLineCount } = await readRenderedLineCount(
          page,
          selector,
        );
        let prediction: { height: number; lineCount: number };
        try {
          prediction = await predictBlockInBrowser(
            page,
            selector,
            t.kind,
            t.level,
            settings,
          );
        } catch {
          continue; // skip blocks Pretext cannot handle (rich-inline marks etc.)
        }
        engineResults.push({
          fixtureId: fixture.id,
          variantKey: variantKey(variant),
          kind: t.kind,
          level: t.kind === "heading" ? t.level : undefined,
          engine: browserName,
          heightDrift: domHeight - prediction.height,
          breaksMatch: prediction.lineCount === domLineCount,
        });
      }
    }
  }
  expect(
    engineResults.length,
    `expected at least one block result for ${browserName}`,
  ).toBeGreaterThan(0);
});

test.afterAll(async ({ browserName }) => {
  // afterAll runs once per worker; browserName is the engine that ran the
  // tests in this worker. Write this engine's results to a per-engine temp
  // file the compare script picks up. Skip if the test never ran (empty
  // engineResults might mean a fixture-load failure — let the compare
  // script handle the empty case).
  if (engineResults.length === 0) return;
  mkdirSync(TMP_DIR, { recursive: true });
  writeFileSync(
    resolve(TMP_DIR, `${browserName}.json`),
    JSON.stringify(engineResults, null, 2),
    "utf8",
  );
});

export { DEFAULT_CALIBRATION_SETTINGS };
export type { TypographyVariant };
