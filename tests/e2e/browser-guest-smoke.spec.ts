// tests/e2e/browser-guest-smoke.spec.ts
// Issue #278 — the environment-proof smoke test for the browser-ready CI
// guest (docs/specs/lemcentre-browser-guest.md): a deliberately SMALL
// application/browser check that must pass in Chromium, Firefox and WebKit
// wherever the reader itself is expected to run — locally, on the reference
// Mac gate, and inside the disposable Linux guest on lemcentre, where the
// app server and the browsers share the guest's own loopback and there is
// no network egress at all (the standard webServer + BASE wiring already
// satisfies that: everything rides localhost).
//
// Scope discipline: this spec proves the environment can launch each engine
// and render the reader's core surface — fresh library, article open, body
// content visible. It is NOT a functional-coverage spec (the PR/nightly
// suites own those) and must stay dependency-free: no seeding helpers, no
// image stubbing (the smoke article carries none), no engine conditionals —
// the guest's Linux baseline must run the exact same spec byte-for-byte.
import { test, expect } from "@playwright/test";
import { fixtures } from "../../src/fixtures";
import { BASE } from "./_base";

const sample = fixtures[0]!;

test("fresh library renders the bundled sample", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await expect(page.getByRole("heading", { name: "Saved articles" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByRole("link", { name: sample.provenance.title })).toBeVisible();
});

test("sample article opens and its body renders", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

  await page.goto(`${BASE}/#/article/${sample.id}`);
  await expect(page.getByRole("heading", { name: sample.provenance.title })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByRole("article")).toBeVisible();
  // The visible reader content: pagination keeps hidden source blocks and
  // renders the live copy inside the page region once pages are prepared;
  // scrolling mode shows the source block directly. innerText resolves
  // rendered text only, so in either mode the article's opening text must
  // actually reach the screen — polled because page preparation is async.
  await expect
    .poll(async () => page.getByRole("article").innerText(), { timeout: 10_000 })
    .toContain("Welcome");
  expect(errors).toEqual([]);
});
