// tests/component/ArticleView.test.tsx
// Component tests for the article-view route (DOC-03 provenance header +
// source-URL link reverse-tabnabbing defense; DOC-06 disclosure rendered by
// the body). The repository seam (openArticle) is mocked so the test asserts
// COMPONENT behavior in isolation.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createRef } from "react";
import { render, screen, waitFor, act } from "@testing-library/react";

// vi.mock is hoisted above imports — the factory must not reference outer
// variables. We mock the module, then drive it via vi.mocked(openArticle).
vi.mock("../../src/content/repository", () => ({
  listArticles: vi.fn(),
  openArticle: vi.fn(),
}));

// Plan 14-03 Task 3 — deterministic restore-fall-through control. The real
// loadLocation in this jsdom env classifies Dexie-unavailable into
// {ok:false} (a silent fall-through); the mock pins the SAME branch shape
// deterministically ({ok:true, location:null} — first open, nothing to
// restore) so the h1-default focus wiring is observable without timing.
// Everything else in the module (saveLocation for useScrollSave) stays real.
vi.mock("../../src/persistence/locationStore", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/persistence/locationStore")>();
  return { ...actual, loadLocation: vi.fn() };
});

import { ArticleView } from "../../src/routes/ArticleView";
import type { ArticleViewProps } from "../../src/routes/ArticleView";
import { openArticle } from "../../src/content/repository";
import { loadLocation } from "../../src/persistence/locationStore";
import type { CanonicalArticle } from "../../src/content/types";
import { SettingsProvider } from "../../src/settings/SettingsContext";
import { DEFAULT_SETTINGS } from "../../src/settings/defaults";
import { SETTINGS_MIRROR_KEY } from "../../src/settings/settingsMirror";

const openArticleMock = vi.mocked(openArticle);
const loadLocationMock = vi.mocked(loadLocation);

/**
 * ArticleView now mounts useMeasurement (Phase 3), which calls useSettings —
 * so component tests must render inside <SettingsProvider> or the hook
 * throws. DEFAULT_SETTINGS + an in-memory provider are sufficient: the
 * measurement engine runs but its commit lands in DEV-only debug state,
 * not in any element this test asserts on.
 *
 * Phase 4 Plan 04-04 cascade: ArticleView now requires a modeToggleHandlerRef
 * (the D4-10 bridge to the header ModeToggle). The test passes a fresh ref.
 */
function renderWithProvider(ui: React.ReactElement) {
  return render(<SettingsProvider>{ui}</SettingsProvider>);
}

/** Build the required ArticleView props, including the D4-10 bridge ref +
 * Phase 5 Plan 05-03 drawer/annotation-count props + the Plan 13-04 back-
 * affordance flag (false = the "#/" fallback branch; the unit surface
 * doesn't exercise navigation) + the Plan 13-10 tag-popover props (closed —
 * the popover surface stays display:none in jsdom) + the Plan 18-02 TOC
 * props (closed — same jsdom popover-display discipline). */
function withProps(articleId: string): { articleId: string; modeToggleHandlerRef: ArticleViewProps["modeToggleHandlerRef"]; drawerOpen: boolean; onCloseDrawer: () => void; tagsOpen: boolean; onCloseTags: () => void; tocOpen: boolean; onCloseToc: () => void; onAnnotationCountChange: (n: number) => void; hasAppHistory: boolean } {
  return {
    articleId,
    modeToggleHandlerRef: createRef(),
    drawerOpen: false,
    onCloseDrawer: () => {},
    tagsOpen: false,
    onCloseTags: () => {},
    tocOpen: false,
    onCloseToc: () => {},
    onAnnotationCountChange: () => {},
    hasAppHistory: false,
  };
}

const fullArticle = (): CanonicalArticle => ({
  id: "stub-article",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/posts/stub",
    title: "Stub Article",
    author: "Stub Author",
    publishedAt: "2026-01-15T00:00:00Z",
    retrievedAt: "2026-07-28T00:00:00Z",
    originalHtmlHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  blocks: [
    // The body starts at h2 — the article title h1 is rendered once by
    // ArticleView from provenance (one h1 per page, a11y best practice).
    { kind: "heading", level: 2, content: [{ text: "A section", marks: [] }] },
    { kind: "paragraph", content: [{ text: "A body paragraph.", marks: [] }] },
  ],
  footnotes: [],
});

beforeEach(() => {
  openArticleMock.mockReset();
  // Plan 14-03 Task 3: default the restore to the first-open fall-through
  // ({ok:true, location:null}) for EVERY test in this file — a mockReset
  // vi.fn() would return undefined and crash the restore effect's .then.
  // Both this and the real jsdom path ({ok:false}) take the same silent
  // no-banner fall-through branch.
  loadLocationMock.mockReset();
  loadLocationMock.mockResolvedValue({ ok: true, location: null });
  // Plan 13-09 (G4): under the paginated default, jsdom's layout-less
  // measurement never settles, so ArticleView stays in the paginatedPending
  // branch (measurement clone + placeholder viewport — by design, the
  // scrolling surface must NOT paint). The metadata spot carrying the
  // DOC-03 source link only mounts on a settled surface, so these
  // component tests pin SCROLLING mode via the app's own lazy-init mirror
  // (the POLISH-01 mechanism): Dexie is unavailable in this jsdom env, so
  // hydration fails quiet and the mirror value holds for the whole test.
  localStorage.setItem(
    SETTINGS_MIRROR_KEY,
    JSON.stringify({ ...DEFAULT_SETTINGS, readingMode: "scrolling" }),
  );
});

describe("ArticleView (DOC-03)", () => {
  it("renders the article title in an <h1>", async () => {
    openArticleMock.mockResolvedValue(fullArticle());
    renderWithProvider(<ArticleView {...withProps("stub-article")} />);
    expect(await screen.findByRole("heading", { level: 1, name: "Stub Article" })).not.toBeNull();
  });

  it("renders a safe source-URL link (target=_blank, rel=noopener noreferrer)", async () => {
    openArticleMock.mockResolvedValue(fullArticle());
    renderWithProvider(<ArticleView {...withProps("stub-article")} />);
    const link = await screen.findByRole("link", { name: /Originally published at/ });
    expect(link).not.toBeNull();
    expect(link.getAttribute("target")).toBe("_blank");
    const rel = link.getAttribute("rel") ?? "";
    expect(rel).toContain("noopener");
    expect(rel).toContain("noreferrer");
    expect(link.getAttribute("href")).toBe("https://example.com/posts/stub");
  });

  it("includes a visually-hidden 'opens in a new tab' announcement", async () => {
    openArticleMock.mockResolvedValue(fullArticle());
    renderWithProvider(<ArticleView {...withProps("stub-article")} />);
    expect(await screen.findByText(/opens in a new tab/i)).not.toBeNull();
  });

  it("does NOT render a Footnotes region when the article has no footnotes", async () => {
    openArticleMock.mockResolvedValue(fullArticle());
    renderWithProvider(<ArticleView {...withProps("stub-article")} />);
    await screen.findByRole("heading", { level: 1, name: "Stub Article" });
    expect(screen.queryByRole("region", { name: "Footnotes" })).toBeNull();
  });

  it("shows 'Opening article…' while loading", () => {
    openArticleMock.mockReturnValue(new Promise<CanonicalArticle | null>(() => {}));
    renderWithProvider(<ArticleView {...withProps("stub-article")} />);
    expect(screen.getByText("Opening article…")).not.toBeNull();
  });

  it("shows the error copy when openArticle rejects", async () => {
    openArticleMock.mockRejectedValue(new Error("boom"));
    renderWithProvider(<ArticleView {...withProps("stub-article")} />);
    await waitFor(() => {
      expect(screen.getByText("Couldn't open this article.")).not.toBeNull();
    });
    expect(screen.getByText(/The article could not be loaded/)).not.toBeNull();
    expect(screen.getByRole("status")).not.toBeNull();
  });

  it("shows the error copy when openArticle resolves null (article not found)", async () => {
    openArticleMock.mockResolvedValue(null);
    renderWithProvider(<ArticleView {...withProps("does-not-exist")} />);
    await waitFor(() => {
      expect(screen.getByText("Couldn't open this article.")).not.toBeNull();
    });
    expect(screen.getByText(/The article could not be loaded/)).not.toBeNull();
    expect(screen.getByRole("status")).not.toBeNull();
  });
});

// Plan 14-03 Task 2 (D14-02/D14-06/D14-07 — Pitfall 7 boundary: jsdom owns
// title STRINGS only; the deep-link/restore/browser timing proofs are Plan
// 14-04's e2e scope). The three cases pin the per-destination title forms
// exactly per the UI-SPEC Copywriting table, including the " — Lem Reader"
// suffix assembled by the shared pageMeta helper.
describe("ArticleView document.title (Plan 14-03 Task 2)", () => {
  // jsdom shares one document across tests in a file — reset to the static
  // index.html default so each case observes only its own write.
  beforeEach(() => {
    document.title = "Lem Reader";
  });

  it("sets \"<provenance.title> — Lem Reader\" when a standalone article resolves", async () => {
    openArticleMock.mockResolvedValue(fullArticle());
    renderWithProvider(<ArticleView {...withProps("stub-article")} />);
    await screen.findByRole("heading", { level: 1, name: "Stub Article" });
    await waitFor(() => {
      expect(document.title).toBe("Stub Article — Lem Reader");
    });
  });

  it("sets \"Couldn't open this article — Lem Reader\" when openArticle rejects (D14-06)", async () => {
    openArticleMock.mockRejectedValue(new Error("boom"));
    renderWithProvider(<ArticleView {...withProps("stub-article")} />);
    await screen.findByRole("heading", {
      level: 1,
      name: "Couldn't open this article.",
    });
    await waitFor(() => {
      // No trailing period before the suffix — the visible h1 keeps its
      // own period (UI-SPEC Copywriting).
      expect(document.title).toBe("Couldn't open this article — Lem Reader");
    });
  });

  it("writes NO title while the article is null and status is loading (transient state — T-14-06)", async () => {
    openArticleMock.mockReturnValue(new Promise<CanonicalArticle | null>(() => {}));
    document.title = "Unchanged sentinel";
    renderWithProvider(<ArticleView {...withProps("stub-article")} />);
    expect(screen.getByText("Opening article…")).not.toBeNull();
    // Flush microtasks — a transient-state write would surface here; the
    // previous/static title must stand until real truth arrives.
    await act(async () => {});
    expect(document.title).toBe("Unchanged sentinel");
  });
});

// Plan 14-03 Task 3 (D14-01/D14-03/D14-06) — the route-change h1 focus
// WIRING at jsdom level (Pitfall 7 boundary: focus timing/rAF machinery in
// real engines is Plan 14-04 Task 2's browser scope — the deep-link-wins
// (D14-05) and restore-wins (D14-10) orderings are proven there). These
// three cases pin the wiring: warm fresh-article arrival focuses the h1,
// cold arrival never does, and a warm error arrival focuses the error h1.
describe("ArticleView route-change h1 focus (Plan 14-03 Task 3)", () => {
  it("focuses the article h1 on a warm fresh-article arrival with nothing to restore (D14-01)", async () => {
    openArticleMock.mockResolvedValue(fullArticle());
    const props = { ...withProps("stub-article"), hasAppHistory: true };
    renderWithProvider(<ArticleView {...props} />);
    const h1 = await screen.findByRole("heading", {
      level: 1,
      name: "Stub Article",
    });
    // The restore effect's fall-through (loadLocation resolves null) is
    // microtask-timed — poll for the focus call.
    await waitFor(() => {
      expect(document.activeElement).toBe(h1);
    });
  });

  it("does NOT focus the article h1 on a cold load (D14-03 immunity)", async () => {
    openArticleMock.mockResolvedValue(fullArticle());
    // withProps defaults hasAppHistory to false — the cold-arrival shape.
    renderWithProvider(<ArticleView {...withProps("stub-article")} />);
    const h1 = await screen.findByRole("heading", {
      level: 1,
      name: "Stub Article",
    });
    // Wait for the restore fall-through to have actually RUN, then flush —
    // otherwise the negative assertion could pass vacuously before the
    // branch executes.
    await waitFor(() => {
      expect(loadLocationMock).toHaveBeenCalledWith("stub-article", 1);
    });
    await act(async () => {});
    expect(document.activeElement).not.toBe(h1);
  });

  it("focuses the error h1 on a warm error arrival (D14-06 parity)", async () => {
    openArticleMock.mockRejectedValue(new Error("boom"));
    const props = { ...withProps("stub-article"), hasAppHistory: true };
    renderWithProvider(<ArticleView {...props} />);
    const errorH1 = await screen.findByRole("heading", {
      level: 1,
      name: "Couldn't open this article.",
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(errorH1);
    });
  });
});
