#!/usr/bin/env node
// scripts/verify-reference-long-work.mjs — issue #241 release evidence.
//
// The deterministic, network-free long-work coverage lives in the Playwright
// suite (tests/e2e/pagination/ — giant prose, giant containers, footnotes,
// duplicate headings via publisherIndexWork, headingless works, zero-text
// figures, coverage/termination/failure invariants). THIS script performs the
// one thing a synthetic suite must not claim: ingesting the historical
// reference work through the LIVE guarded pipeline and proving complete
// traversal of everything that pipeline reliably extracted — in the real
// reader, in a real browser.
//
//   https://marxist.com/the-stalin-school-of-falsification/all-pages.htm
//
// It records EXTRACTION outcomes (block count, disclosed limits, flagged
// signals) separately from PAGINATION outcomes (coverage, navigation,
// orientation, completion), per the ticket's honesty requirement: an
// extraction limit is never allowed to masquerade as a pagination failure or
// vice versa. No historical failure cause is inferred — only observed.
//
// Local verification instrument: it needs the network and runs its own dev
// server on this worktree's isolated port. It is NOT wired into CI (no
// live-network dependency in CI, per docs/specs/long-work-implementation-plan.md).
//
// Usage:
//   mise exec -- node scripts/verify-reference-long-work.mjs [--out <path>]
//
// Exit 0 = every phase proved; nonzero = failure, with the evidence JSON
// written even on failure (the failure details are evidence).

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { assertPortAvailable, resolveE2eBase } from "../tests/e2e/_server-port.mjs";

const REFERENCE_URL =
  "https://marxist.com/the-stalin-school-of-falsification/all-pages.htm";

const TURN_BUDGET_MS = 20_000; // one manual turn incl. boundary handoff
const JUMP_BUDGET_MS = 60_000; // a bounded window build for a distant target
const MAX_TURNS = 5_000; // hard stop; the work is hundreds of pages, not thousands

const log = (...args) => console.log("[verify-long-work]", ...args);

function failPhase(phase, message) {
  throw new Error(`phase ${phase}: ${message}`);
}

async function waitForServer(base, child, timeoutMs = 40_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "no response";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`dev server exited early (code=${child.exitCode})`);
    }
    try {
      const res = await fetch(base);
      if (res.ok) return;
      last = `HTTP ${res.status}`;
    } catch {
      last = "not reachable yet";
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`dev server did not become ready on ${base} (${last})`);
}

// ── in-page readers (plain JS — these callbacks are serialized, not bundled) ─

const READ_DEV = () => {
  const dev = window.__lemPagination;
  if (!dev) return null;
  const { status, overflowSettled, currentPageIdx, pagesLength, publicationSeq, turnSeq, anchorOffset, scope, articleGraphemeLength, articleId } = dev;
  return { status, overflowSettled, currentPageIdx, pagesLength, publicationSeq, turnSeq, anchorOffset, scope, articleGraphemeLength, articleId };
};

const READ_FULL_DEV = () => {
  const dev = window.__lemPagination;
  if (!dev) return null;
  return {
    status: dev.status,
    overflowSettled: dev.overflowSettled,
    currentPageIdx: dev.currentPageIdx,
    pagesLength: dev.pagesLength,
    publicationSeq: dev.publicationSeq,
    turnSeq: dev.turnSeq,
    turnDirection: dev.turnDirection,
    anchorOffset: dev.anchorOffset,
    scope: dev.scope ?? null,
    articleId: dev.articleId,
    articleGraphemeLength: dev.articleGraphemeLength,
    blockGraphemeLengths: dev.blockGraphemeLengths,
    pages: (dev.pages ?? []).map((p) => ({
      pageIndex: p.pageIndex,
      blocks: p.blocks.map((b) => ({
        blockIndex: b.blockIndex,
        startGrapheme: b.startGrapheme,
        endGrapheme: b.endGrapheme,
      })),
    })),
  };
};

const READ_ROW = ({ store, key }) =>
  new Promise((resolve) => {
    const req = indexedDB.open("lem-reader");
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(store)) return resolve(null);
      const tx = db.transaction(store, "readonly");
      const get = tx.objectStore(store).get(key);
      get.onsuccess = () => resolve(get.result ?? null);
      get.onerror = () => resolve(null);
    };
    req.onerror = () => resolve(null);
  });

async function readDev(page) {
  return page.evaluate(READ_DEV);
}

async function readFullDev(page) {
  return page.evaluate(READ_FULL_DEV);
}

async function waitForSettled(page, timeoutMs = 30_000) {
  await page.waitForFunction(
    () => {
      const dev = window.__lemPagination;
      return dev !== undefined && dev.status === "ok" && dev.overflowSettled === true;
    },
    { timeout: timeoutMs },
  );
}

/** Wait until a manual turn or window handoff commits something NEWER than
 * `before` and the overflow guard has settled it. Judged on the publication
 * sequence plus genuine canonical movement (anchor or window-source bounds),
 * never on the mutable page number alone. */
async function waitForAdvance(page, before, timeoutMs = TURN_BUDGET_MS) {
  const seq = before?.publicationSeq ?? 0;
  const anchor = before?.anchorOffset ?? -1;
  const startBlock = before?.scope?.startBlock ?? -1;
  await page.waitForFunction(
    ({ seq, anchor, startBlock }) => {
      const dev = window.__lemPagination;
      if (!dev || dev.status !== "ok" || dev.overflowSettled !== true) return false;
      if ((dev.publicationSeq ?? 0) <= seq) return false;
      const movedAnchor = (dev.anchorOffset ?? 0) !== anchor;
      const movedWindow = (dev.scope?.startBlock ?? -1) !== startBlock;
      return movedAnchor || movedWindow;
    },
    { seq, anchor, startBlock },
    { timeout: timeoutMs },
  );
}

async function readRow(page, store, key) {
  return page.evaluate(READ_ROW, { store, key });
}

// ── evidence container ──────────────────────────────────────────────────────

const evidence = {
  referenceUrl: REFERENCE_URL,
  ranAt: new Date().toISOString(),
  base: null,
  phases: {},
  verdict: null,
};

function record(phase, data) {
  evidence.phases[phase] = data;
}

async function writeEvidence(outPath) {
  const target = outPath ?? path.join(".verification-tmp", "241-live-reference.json");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(evidence, null, 2));
  log(`evidence written to ${target}`);
}

function argsOut() {
  const i = process.argv.indexOf("--out");
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// ── server lifecycle ────────────────────────────────────────────────────────

const base = resolveE2eBase();
evidence.base = base;
const url = new URL(base);
const port = Number(url.port);
const host = url.hostname === "localhost" ? "127.0.0.1" : url.hostname;

try {
  await assertPortAvailable(port, host);
} catch (err) {
  console.error(String(err?.message ?? err));
  process.exit(2);
}

log(`spawning the dev server on ${base} (isolated per-worktree port)`);
const child = spawn(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "dev", "--silent", "--", "--host", host, "--port", String(port), "--strictPort"],
  { stdio: "ignore", env: process.env },
);

let browser;
try {
  await waitForServer(base, child);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 900, height: 1200 }, // a booklike desktop-ish page
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  // ── Phase A: guarded live import through the app's own Add flow ──────────
  const phaseAStart = Date.now();
  await page.goto(`${base}/#/`);
  await page.getByRole("button", { name: "Add to Library" }).click();
  await page.locator("dialog.add-dialog").waitFor({ state: "visible" });
  // Source "Web address" is the default radio; fill the URL and submit.
  await page.locator("#ingest-url").fill(REFERENCE_URL);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  // openAfterAdd defaults to true: the dialog closes and lands in the article.
  await page.waitForURL(/#\/article\//, { timeout: 180_000 });
  const articleId = new URL(page.url()).hash.split("/article/")[1] ?? "";
  await page.getByRole("heading", { level: 1 }).waitFor({ state: "visible", timeout: 60_000 });
  const title = (await page.getByRole("heading", { level: 1 }).textContent()) ?? "";
  await waitForSettled(page, 120_000); // the first window of a huge work
  const firstDev = await readDev(page);
  record("import", {
    articleId,
    title,
    durationMs: Date.now() - phaseAStart,
    firstPublication: firstDev,
  });
  log(`imported "${title}" (${articleId}) in ${((Date.now() - phaseAStart) / 1000).toFixed(1)}s`);

  // ── Phase B: extraction record (SEPARATE from pagination outcomes) ──────
  const row = await readRow(page, "articles", articleId);
  if (!row) failPhase("extraction", "the imported article row is missing from the library");
  const structure = row.structure ?? null;
  const chapters = (structure?.destinations ?? []).filter((d) => d.kind === "chapter");
  const parts = (structure?.destinations ?? []).filter((d) => d.kind === "part");
  record("extraction", {
    blockCount: Array.isArray(row.blocks) ? row.blocks.length : null,
    provenance: {
      sourceUrl: row.provenance?.sourceUrl ?? null,
      originalHtmlHash: row.provenance?.originalHtmlHash ?? null,
      author: row.provenance?.author ?? null,
    },
    ingestionMeta: {
      source: row.ingestionMeta?.source ?? null,
      extractionConfidence: row.ingestionMeta?.extractionConfidence ?? null,
      extractionWarnings: row.ingestionMeta?.extractionWarnings ?? [],
      annotationsDegraded: row.ingestionMeta?.annotationsDegraded ?? null,
    },
    structure: structure
      ? {
          revision: structure.revision,
          chapterCount: chapters.length,
          generatedPartCount: parts.filter((p) => p.titleSource === "generated").length,
          chapterTitles: chapters.map((c) => c.title),
        }
      : null,
  });
  log("extraction:", extractionSummary(evidence.phases.extraction));

  // ── Phase C: complete traversal of everything extracted ─────────────────
  const next = page.getByRole("button", { name: "Next page", exact: true });
  const walk = {
    pagesVisited: 0,
    windowsVisited: [],
    orientations: [],
    pageTexts: [],
    slices: [],
    blockGraphemeLengths: null,
    articleGraphemeLength: null,
    articleIds: new Set(),
    statuses: new Set(),
    scopeLabels: new Set(),
  };
  let fallbackBannerCount = 0;
  let prev = null;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    await waitForSettled(page);
    const dev = await readFullDev(page);
    if (!dev || dev.status !== "ok") {
      failPhase("traversal", "the surface is not in a settled ok state");
    }
    walk.articleIds.add(dev.articleId);
    walk.statuses.add(dev.status);
    walk.blockGraphemeLengths ??= dev.blockGraphemeLengths;
    walk.articleGraphemeLength ??= dev.articleGraphemeLength;
    if (dev.blockGraphemeLengths?.length !== walk.blockGraphemeLengths.length) {
      failPhase("traversal", "the block corpus changed mid-walk");
    }
    // The current page's source ranges + reader-visible truth.
    const current = dev.pages?.[dev.currentPageIdx];
    if (!current) failPhase("traversal", `page ${dev.currentPageIdx} has no committed fragment`);
    walk.slices.push(
      ...current.blocks.map((b) => ({
        blockIndex: b.blockIndex,
        startGrapheme: b.startGrapheme,
        endGrapheme: b.endGrapheme,
      })),
    );
    walk.windowsVisited.push({
      startBlock: dev.scope?.startBlock ?? null,
      endBlock: dev.scope?.endBlock ?? null,
      startGrapheme: dev.scope?.startGrapheme ?? null,
      endGrapheme: dev.scope?.endGrapheme ?? null,
    });
    walk.orientations.push({
      at: walk.pagesVisited,
      orientation:
        (await page.locator(".reading-orientation").textContent().catch(() => null)) ?? null,
      startHeading:
        (await page.locator(".page-start-heading").textContent().catch(() => null)) ?? null,
    });
    walk.pageTexts.push(await page.locator(".page-fragment").innerText());
    const indicator = (await page.locator(".page-indicator").textContent().catch(() => "")) ?? "";
    if (indicator.includes("in this portion")) walk.scopeLabels.add("in this portion");
    walk.pagesVisited++;
    fallbackBannerCount += await page.locator(".pagination-fallback-banner").count();

    if ((await next.getAttribute("aria-disabled")) === "true") break;
    prev = dev;
    await next.click();
    await waitForAdvance(page, prev);
  }
  const finalDev = await readDev(page);
  const orientationSequence = [];
  for (const o of walk.orientations) {
    const label = (o.orientation ?? "").trim();
    if (label && orientationSequence.at(-1)?.label !== label) {
      orientationSequence.push({ label, firstSeenPage: o.at });
    }
  }
  record("traversal", {
    pagesVisited: walk.pagesVisited,
    windowCount: new Set(walk.windowsVisited.map((w) => `${w.startBlock}-${w.endBlock}`)).size,
    articleIdsSeen: [...walk.articleIds],
    statusesSeen: [...walk.statuses],
    fallbackBannerCount,
    scopeLabels: [...walk.scopeLabels],
    orientationSequence,
    finalState: {
      currentPageIdx: finalDev?.currentPageIdx,
      pagesLength: finalDev?.pagesLength,
      anchorOffset: finalDev?.anchorOffset,
      scope: finalDev?.scope ?? null,
    },
    completionAffordance: {
      markReadAndCloseVisible:
        (await page.getByRole("button", { name: "Mark read and close" }).count()) > 0,
      nextDisabled: (await next.getAttribute("aria-disabled")) === "true",
    },
    pageErrors,
  });

  // ── Coverage verdict: everything extracted, exactly once, in order ──────
  const coverage = coverageVerdict(walk);
  record("coverage", coverage);
  log(`traversal: ${walk.pagesVisited} pages, ${coverage.windowCount} windows — ${coverage.summary}`);

  // ── Phase D: direct late-work jump through the work's own TOC ────────────
  if (chapters.length < 3) {
    failPhase("lateJump", `expected a multi-chapter reference structure; got ${chapters.length}`);
  }
  const target = chapters[Math.floor(chapters.length / 2)]; // a genuinely late chapter
  await page.getByRole("button", { name: "Table of contents" }).click();
  const tocPanel = page.locator(".toc-panel");
  await tocPanel.waitFor({ state: "visible" });
  const tocLink = tocPanel.getByRole("link", { name: target.title }).first();
  if ((await tocLink.count()) === 0) {
    failPhase("lateJump", `chapter "${target.title}" has no TOC entry to jump through`);
  }
  const jumpBefore = await readDev(page);
  await tocLink.click();
  await waitForAdvance(page, jumpBefore, JUMP_BUDGET_MS);
  await waitForSettled(page, 60_000);
  const jumped = await readDev(page);
  const jumpedOrientation =
    (await page.locator(".reading-orientation").textContent().catch(() => null)) ?? null;
  const jumpedFragment = (await page.locator(".page-fragment").innerText().catch(() => "")) ?? "";
  record("lateJump", {
    chapterTitle: target.title,
    chapterStartBlock: target.startBlock,
    landedScope: jumped?.scope ?? null,
    pagesLength: jumped?.pagesLength ?? null,
    landedOrientation: jumpedOrientation,
    fragmentContainsChapterTitle: jumpedFragment.includes(target.title),
    boundedLoad: (jumped?.pagesLength ?? 0) > 0 && (jumped?.pagesLength ?? 0) <= 64,
  });
  await page.keyboard.press("Escape"); // close the TOC panel
  await tocPanel.waitFor({ state: "hidden" });
  // The position save rides the shared 1200ms debounce (useScrollSave); a
  // real reader's close lands seconds after the last turn, so let the
  // debounce fire before leaving — the SPA leave itself cancels a pending
  // debounce by design (unmount flush covers pagehide/visibilitychange).
  await page.waitForTimeout(1_600);
  log(
    `late jump: "${target.title}" → blocks ${jumped?.scope?.startBlock}..${jumped?.scope?.endBlock} (${jumped?.pagesLength} pages in this portion)`,
  );

  // ── Phase E: close/resume of that late position ──────────────────────────
  const savedAnchor = jumped?.anchorOffset ?? null;
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.locator(".library-row").first().waitFor({ state: "visible", timeout: 30_000 });
  // Evidence: what the PERSISTED location rows say at reopen time — this
  // distinguishes a save-side loss (the row never carried the late position)
  // from a restore-side loss (the row was right but the reader ignored it).
  const savedRowLoose = await page.evaluate(
    (id) =>
      new Promise((resolve) => {
        const req = indexedDB.open("lem-reader");
        req.onsuccess = () => {
          const tx = req.result.transaction("location", "readonly");
          const all = tx.objectStore("location").getAll();
          all.onsuccess = () => resolve(all.result ?? []);
          all.onerror = () => resolve([]);
        };
        req.onerror = () => resolve([]);
      }),
    articleId,
  );
  const card = page.locator(`a[href="#/article/${articleId}"]`).first();
  if ((await card.count()) === 0) failPhase("resume", "the library card for the work is missing");
  await card.click();
  await page.getByRole("heading", { level: 1 }).waitFor({ state: "visible" });
  // The restoration marker is a TRANSIENT cue (D18-07: ~4s, then unmounted)
  // that appears once the restore turn commits — look for it while it can
  // still be on screen, never after the settle wait may have outlived it.
  const markerSeen = await page
    .locator(".restoration-marker")
    .waitFor({ state: "visible", timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  await waitForSettled(page, 60_000);
  const restored = await readDev(page);
  const restoredScope = restored?.scope ?? null;
  const jumpedScope = jumped?.scope ?? null;
  record("resume", {
    savedAnchor,
    persistedLocationRowsAtReopen: savedRowLoose,
    restoredAnchor: restored?.anchorOffset ?? null,
    jumpedScope,
    restoredScope,
    sameWindowAsSaved:
      jumpedScope != null &&
      restoredScope != null &&
      restoredScope.startBlock <= jumpedScope.startBlock &&
      restoredScope.endBlock >= jumpedScope.endBlock,
    anchorRestoredExactly: savedAnchor !== null && restored?.anchorOffset === savedAnchor,
    restorationMarkerVisible: markerSeen,
  });
  log(
    `resume: saved anchor ${savedAnchor} → restored window blocks ${restoredScope?.startBlock}..${restoredScope?.endBlock}, anchor ${restored?.anchorOffset}`,
  );

  // ── Verdict ──────────────────────────────────────────────────────────────
  const problems = collectProblems(evidence);
  evidence.verdict = problems.length === 0 ? "pass" : "fail";
  evidence.problems = problems;
  await writeEvidence(argsOut());
  if (problems.length > 0) {
    console.error(`[verify-long-work] FAIL (${problems.length} problem(s)):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exitCode = 1;
  } else {
    log("VERDICT: pass — guarded import, complete traversal, exact coverage, late jump, and resume all proved.");
  }
} catch (err) {
  evidence.verdict = "fail";
  evidence.fatal = String(err instanceof Error && err.stack ? err.stack : err);
  await writeEvidence(argsOut()).catch(() => {});
  console.error(
    "[verify-long-work] FATAL:",
    String(err instanceof Error && err.message ? err.message : err),
  );
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  child.kill("SIGTERM");
}

// ── post-run analysis (pure, Node-side) ─────────────────────────────────────

function extractionSummary(extraction) {
  const meta = extraction.ingestionMeta;
  const structure = extraction.structure;
  return [
    `${extraction.blockCount} blocks`,
    `confidence=${meta.extractionConfidence}`,
    meta.extractionWarnings?.length
      ? `warnings=[${meta.extractionWarnings.join("; ")}]`
      : "no disclosed warnings",
    structure
      ? `${structure.chapterCount} chapters, ${structure.generatedPartCount} generated parts`
      : "no structure snapshot",
  ].join(", ");
}

/** Exactly-once coverage over the collected walk slices, plus window tiling. */
function coverageVerdict(walk) {
  const problems = [];
  const blockLens = walk.blockGraphemeLengths ?? [];
  if (!blockLens.length) problems.push("no block lengths published");

  // (1) The visited windows tile the work's BLOCK corpus in strictly
  // advancing steps — every window continues exactly where the previous
  // ended, the first starts at block 0, and the last ends at the block
  // count. (Grapheme-level exactness is proven per-block by the slice
  // check below; the DEV publication carries block bounds for ordinary
  // windows — grapheme scope bounds ride only footnote scopes, #235.)
  const distinct = [];
  for (const w of walk.windowsVisited) {
    const key = `${w.startBlock}-${w.endBlock}-${w.startGrapheme}-${w.endGrapheme}`;
    if (distinct.length === 0 || distinct[distinct.length - 1].key !== key) {
      distinct.push({ key, ...w });
    }
  }
  let cursor = 0;
  for (const w of distinct) {
    if (w.startBlock !== cursor) {
      problems.push(
        `window starting at block ${w.startBlock} does not continue the walk cursor ${cursor}`,
      );
      break;
    }
    if ((w.endBlock ?? 0) <= (w.startBlock ?? 0)) {
      problems.push(`window [${w.startBlock}, ${w.endBlock}) is empty`);
      break;
    }
    cursor = w.endBlock;
  }
  const last = distinct.at(-1);
  if (last && last.endBlock !== blockLens.length) {
    problems.push(`the final window's endBlock ${last.endBlock} is not the block count ${blockLens.length}`);
  }
  if (distinct[0] && distinct[0].startBlock !== 0) {
    problems.push(`the first window starts at block ${distinct[0].startBlock}, not 0`);
  }

  // (2) Per-block exactly-once slices across every visited page: sorted by
  // startGrapheme, each slice continues the previous one with no gap, no
  // duplication, and full block coverage.
  const slicesByBlock = new Map();
  for (const s of walk.slices) {
    const arr = slicesByBlock.get(s.blockIndex) ?? [];
    arr.push({ start: s.startGrapheme, end: s.endGrapheme });
    slicesByBlock.set(s.blockIndex, arr);
  }
  let slicesChecked = 0;
  for (let b = 0; b < blockLens.length; b++) {
    const slices = (slicesByBlock.get(b) ?? []).sort((x, y) => x.start - y.start);
    slicesChecked += slices.length;
    if (slices.length === 0) {
      problems.push(`block ${b} was never covered`);
      continue;
    }
    let pos = 0;
    for (const s of slices) {
      if (s.start !== pos) {
        problems.push(
          `block ${b}: slice [${s.start}, ${s.end}) does not continue coverage at ${pos}${s.start < pos ? " (duplication)" : " (gap)"}`,
        );
        break;
      }
      pos = s.end;
    }
    if (pos !== blockLens[b]) {
      problems.push(`block ${b}: coverage ends at ${pos}, expected ${blockLens[b]}`);
    }
  }

  // (3) Every visited page rendered some reader-visible text.
  const emptyPages = walk.pageTexts
    .map((t, i) => (t.trim().length === 0 ? i : -1))
    .filter((i) => i >= 0);
  if (emptyPages.length > 0) problems.push(`pages with no visible text: ${emptyPages.join(", ")}`);

  return {
    windowCount: distinct.length,
    slicesChecked,
    blocksChecked: blockLens.length,
    articleGraphemeLength: walk.articleGraphemeLength,
    emptyPages,
    problems,
    summary: problems.length
      ? `${problems.length} coverage problem(s)`
      : `${blockLens.length} blocks (${walk.articleGraphemeLength} graphemes) covered exactly once across ${distinct.length} windows and ${walk.pagesVisited} pages`,
  };
}

/** All phase-level honesty checks that turn observations into a verdict. */
function collectProblems(evidence) {
  const problems = [];
  const { import: imp, traversal, coverage, lateJump, resume } = evidence.phases;
  if (!imp?.articleId) problems.push("import: no article id recorded");
  if (!traversal) problems.push("traversal: phase did not complete");
  else {
    if (traversal.articleIdsSeen?.length !== 1) {
      problems.push(`traversal: article identity changed mid-walk (${traversal.articleIdsSeen})`);
    }
    if (traversal.statusesSeen?.some((s) => s !== "ok")) {
      problems.push(`traversal: non-ok publication states seen (${traversal.statusesSeen})`);
    }
    if (traversal.fallbackBannerCount > 0) {
      problems.push(`traversal: the fallback banner appeared ${traversal.fallbackBannerCount}x`);
    }
    if (!traversal.completionAffordance?.nextDisabled) {
      problems.push("traversal: the walk ended without the true work end disabling Next");
    }
    if (!traversal.completionAffordance?.markReadAndCloseVisible) {
      problems.push("traversal: the true work end does not offer Mark read and close");
    }
    if (traversal.pageErrors?.length > 0) {
      problems.push(`traversal: ${traversal.pageErrors.length} page error(s): ${traversal.pageErrors[0]}`);
    }
    if (!traversal.scopeLabels?.includes("in this portion")) {
      problems.push("traversal: the page indicator never described its local scope honestly");
    }
  }
  if (!coverage) problems.push("coverage: phase did not complete");
  else problems.push(...coverage.problems);
  if (!lateJump) problems.push("lateJump: phase did not complete");
  else {
    if (!lateJump.boundedLoad) problems.push("lateJump: the landing was not a bounded window load");
    if (!lateJump.fragmentContainsChapterTitle) {
      problems.push("lateJump: the landed page does not show the chapter's own heading");
    }
    if (!(lateJump.landedOrientation ?? "").length) {
      problems.push("lateJump: no orientation label at the landing");
    }
  }
  if (!resume) problems.push("resume: phase did not complete");
  else {
    if (!resume.sameWindowAsSaved) {
      problems.push(
        `resume: the restored window (${resume.restoredScope?.startBlock}..${resume.restoredScope?.endBlock}) does not contain the saved window (${resume.jumpedScope?.startBlock}..${resume.jumpedScope?.endBlock})`,
      );
    }
    if (!resume.anchorRestoredExactly) {
      problems.push(
        `resume: the anchor did not restore exactly (saved ${resume.savedAnchor}, restored ${resume.restoredAnchor})`,
      );
    }
    if (!resume.restorationMarkerVisible) {
      problems.push("resume: no restoration marker was shown at reopen");
    }
  }
  return problems;
}
