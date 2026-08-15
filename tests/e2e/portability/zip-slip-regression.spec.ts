// tests/e2e/portability/zip-slip-regression.spec.ts
// Plan 09-06 Task 2a — the SC#2 phase-exit e2e gate: fully attacker-controlled
// ZIP archives driven through the REAL import UI (Settings → file input) are
// refused with the unsafe-entry status copy and ZERO IndexedDB state change
// across all five stores. The crafted buffers prove the app-level Zip Slip
// guard (T-9-01) fires on traversal entries in both raw and URL-encoded form,
// through the same validateBundle pipeline a reader's pick runs.
//
// Crafted Node-side with fflate zipSync (the buffer form of setInputFiles —
// the A5 payload variant, vs round-trip.spec.ts's path variant). The two
// required entries are valid-shaped minimal content so the ONLY refusal
// reason can be the traversal entry — proving the guard's ordering (entry
// names are judged before any entry byte is used).
import { test, expect } from "@playwright/test";
import { zipSync, strToU8 } from "fflate";
import { countRows, openSettings, prepareFreshPage, settingsStatus } from "./_portability";

/** The locked unsafe-entry refusal copy (verbatim from SettingsPanel). */
const UNSAFE_ENTRY_COPY =
  "This bundle contains an unsafe file entry and can't be imported. Nothing was imported.";

/** A minimal valid-shaped envelope + manifest so nothing BUT the traversal
 * entry can refuse this bundle. */
function validShapedEntries(): Record<string, Uint8Array> {
  return {
    "bundle.json": strToU8(
      JSON.stringify({
        schemaVersion: 1,
        exportedAt: "2026-08-15T00:00:00.000Z",
        appVersion: "0.1.0",
        articles: [],
        locations: [],
        highlights: [],
        notes: [],
        preferences: {
          schemaVersion: 2,
          font: "serif",
          size: 18,
          measure: 64,
          spacing: "comfortable",
          theme: "sepia",
          readingMode: "paginated",
        },
        fixtureIds: [],
      }),
    ),
    "manifest.json": strToU8(
      JSON.stringify({
        algorithm: "sha256",
        blocks: {},
      }),
    ),
  };
}

/** The two locked malicious variants (09-CONTEXT SC#2 + Pitfall 11 #5/#6):
 * a raw `../` traversal entry and its URL-encoded smuggle form. */
const EVIL_ENTRY_NAMES = [
  { label: "raw traversal", evilName: "../../evil.sh" },
  { label: "url-encoded traversal", evilName: "..%2F..%2Fevil.sh" },
];

for (const { label, evilName } of EVIL_ENTRY_NAMES) {
  test(`SC#2 — refuses ${label} entry ("${evilName}") with zero state change`, async ({ page }) => {
    await prepareFreshPage(page);

    const buffer = Buffer.from(
      zipSync({
        ...validShapedEntries(),
        [evilName]: strToU8("#!/bin/sh\necho pwned\n"),
      }),
    );

    // Pre-pick counts on a freshly cleared library (all zeros — recorded so
    // the assertion is a true pre/post comparison, not a hardcoded zero).
    const stores = ["articles", "settings", "location", "highlights", "notes"];
    const before = new Map<string, number>(
      await Promise.all(stores.map(async (s) => [s, await countRows(page, s)] as const)),
    );

    const panel = await openSettings(page);
    await panel.locator('input[type="file"][accept=".zip"]').setInputFiles({
      name: "evil.zip",
      mimeType: "application/zip",
      buffer,
    });

    // The refusal announces through the .status live region in calm voice.
    await expect(settingsStatus(page)).toContainText(UNSAFE_ENTRY_COPY, {
      timeout: 15_000,
    });

    // The preview dialog NEVER opens (no dry run, no writes). The element is
    // always mounted by SettingsPanel — assert it never becomes visible.
    await expect(page.locator("dialog.import-preview")).not.toBeVisible();

    // ZERO state change across all five stores (T-9-11's converse: the
    // refusal must leave nothing behind — no article, no highlight, nothing).
    for (const store of stores) {
      expect(await countRows(page, store), `${store} must be untouched`).toBe(before.get(store));
    }
  });
}
