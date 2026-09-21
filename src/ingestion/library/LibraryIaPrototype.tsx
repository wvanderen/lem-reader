// src/ingestion/library/LibraryIaPrototype.tsx
// ═══════════════════════════════════════════════════════════════════════════
// PROTOTYPE — WAYFINDER ISSUE #67 — THROWAWAY, DELETE AFTER THE DECISION.
//
// Question (issue #67): how should the library page be organized — Continue
// Reading placement, stats-strip fate, toolbar cohesion, row/card anatomy,
// action placement (icon vs text), rows vs grid?
//
// Three structurally different variants of the library home, switchable on
// the REAL route with REAL data via the `?lp=` search param (coexists with
// the hash router):
//
//   …/?lp=now#/   — the current page (baseline, for flipping)
//   …/?lp=a#/     — A — Rail + rows: stats merged into the header, ONE
//                   toolbar band, Continue Reading as a compact horizontal
//                   rail, single-column rows, icon action cluster right.
//   …/?lp=b#/     — B — Pinned rows: in-progress items pinned as the first
//                   cards of the main grid (no separate strip), stacked
//                   toolbar (current controls, tightened), card grid kept
//                   with normalized top-right icon actions.
//   …/?lp=c#/     — C — Compact + text actions: stats merged into the
//                   header line, one compact toolbar, Continue Reading as a
//                   collapsible <details> section, single-column rows with
//                   quiet TEXT actions.
//
// A floating pill at the bottom cycles variants (←/→ keys work; ignored
// while typing). The variant is shareable + reload-stable (replaceState on
// the `?lp=` param; the hash route is preserved).
//
// Discipline: real read model (the ONE LibrarySnapshot) + real read-state /
// dialog wiring so the layout can be judged with full function; NO new
// persistence, no tests, no polish. Gated to dev builds (import.meta.env.DEV).
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Book, CanonicalArticle, LocationRecord } from "../../content/schema";
import { ProgressHairline } from "../../reader/ProgressHairline";
import { SourceBadge } from "./SourceBadge";
import { LibrarySearch } from "./LibrarySearch";
import { TagFilter } from "./TagFilter";
import {
  articleReadingState,
  bookReadingState,
  countByState,
  type ReadingState,
} from "./readingState";
import { filterLibrary, filterBooks } from "./libraryFilter";
import {
  deriveBookProgress,
  resolveResumeChapterId,
  chapterOrdinal,
} from "./bookProgress";
import {
  effectiveTitle,
  effectiveAuthor,
  videoDuration,
} from "./effectiveMetadata";
import {
  deriveLibraryReadingStats,
  formatDuration,
} from "./readingStats";
import type { LibrarySnapshot } from "./librarySnapshot";
import { invalidateLibrarySnapshot } from "./librarySnapshot";
import { setArticleReadState } from "../../persistence/locationStore";
import { RemoveConfirm } from "./RemoveConfirm";
import { EditMetadataDialog } from "./EditMetadataDialog";
import { BookRemoveConfirm } from "./BookRemoveConfirm";
import { AddDialog } from "../AddDialog";
import type { LibraryViewName } from "../../App";

// ── Variant registry ────────────────────────────────────────────────────────

type PrototypeVariant = "now" | "a" | "b" | "c";

const VARIANTS: ReadonlyArray<{ key: PrototypeVariant; label: string }> = [
  { key: "now", label: "Current page" },
  { key: "a", label: "A — Rail + rows" },
  { key: "b", label: "B — Pinned rows" },
  { key: "c", label: "C — Compact + text actions" },
];

const LP_PARAM = "lp";

function readVariantFromUrl(): PrototypeVariant | null {
  if (!import.meta.env.DEV) return null;
  const v = new URLSearchParams(window.location.search).get(LP_PARAM);
  return VARIANTS.some((entry) => entry.key === v) ? (v as PrototypeVariant) : null;
}

function syncVariantUrl(variant: PrototypeVariant | null): void {
  const url = new URL(window.location.href);
  if (variant === null) url.searchParams.delete(LP_PARAM);
  else url.searchParams.set(LP_PARAM, variant);
  history.replaceState(null, "", url.pathname + url.search + url.hash);
}

/** Everything the variants render from — the ONE library read model plus
 * the view-routing + count context LibraryView already computed. */
export interface LibraryPrototypeData {
  snapshot: LibrarySnapshot;
  status: "loading" | "ready" | "error";
  view: LibraryViewName;
  onSwitchView: (next: LibraryViewName) => void;
  allCount: number;
  stateCounts: Record<ReadingState, number>;
}

// ── In-memory demo density (no persistence — render-level only) ─────────────
// A near-empty dev library cannot answer an IA question. When `demo=1` is
// present, the variants render from the REAL snapshot MERGED with synthetic
// rows (6 standalone articles across the three states + a 12-chapter book in
// progress + tags + a few reading sessions). Nothing is written anywhere;
// the whole layer deletes with this file.

function demoArticle(
  id: string,
  title: string,
  author: string,
  tags: string[],
  sourceUrl: string | undefined,
  metaOverride?: CanonicalArticle["ingestionMeta"],
): CanonicalArticle {
  return {
    id,
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl,
      title,
      author,
      retrievedAt: "2026-09-01T12:00:00.000Z",
      originalHtmlHash: "0".repeat(64),
    },
    blocks: [{ kind: "paragraph", content: [{ text: "Demo row.", marks: [] }] }],
    footnotes: [],
    ingestionMeta: metaOverride ?? {
      source: sourceUrl ? "url" : "markdown",
      origin: sourceUrl ? "url" : "upload",
      originalHtmlHash: "0".repeat(64),
      extractionConfidence: "high",
      extractionWarnings: [],
    },
    tags,
  };
}

const DEMO_TOTAL = 12000;

function demoSnapshot(real: LibrarySnapshot): LibrarySnapshot {
  const articles: CanonicalArticle[] = [
    demoArticle("lp-demo-1", "The Quiet Craft of Long-Form Reading", "Marta Ilves", ["essay", "longform"], "https://example.org/quiet-craft"),
    demoArticle("lp-demo-2", "Attention Is a Room You Furnish", "Jonas Beck", ["essay"], "https://example.org/attention-room"),
    demoArticle("lp-demo-3", "Why Books Resist Screens", "Priya Natarajan", ["longform"], undefined),
    demoArticle("lp-demo-4", "A Field Guide to Slower Mornings", "Hana Osei", ["guide"], "https://example.org/slower-mornings"),
    demoArticle("lp-demo-5", "The Archive That Reads You Back", "Tomas Eklund", [], "https://example.org/archive"),
    demoArticle("lp-demo-6", "Margin Notes Considered Harmful", "L. Ferrante", ["essay", "opinion"], "https://example.org/margin-notes"),
  ];
  // state: 1,2 unread; 3,4 in-progress (35%, 70%); 5,6 finished.
  const offsets: Record<string, number> = {
    "lp-demo-1": 0,
    "lp-demo-2": 0,
    "lp-demo-3": 4200,
    "lp-demo-4": 8400,
    "lp-demo-5": DEMO_TOTAL,
    "lp-demo-6": DEMO_TOTAL,
  };
  const chapterCount = 12;
  const chapterIds = Array.from({ length: chapterCount }, (_, i) => `lp-demo-book-c${i + 1}`);
  const book: Book = {
    id: "lp-demo-book",
    title: "The Calm Technology Reader",
    authors: ["Amber Case", "N. Abernathy"],
    language: "en",
    chapterArticleIds: chapterIds,
    skippedChapterCount: 0,
    source: "epub-upload",
    originalFileHash: "0".repeat(64),
    tags: ["collection"],
    addedAt: "2026-09-10T09:00:00.000Z",
  };
  const chapters: CanonicalArticle[] = chapterIds.map((id, i) =>
    demoArticle(id, `Chapter ${i + 1}: On Calm`, book.authors[0]!, [], undefined, {
      source: "epub-chapter",
      origin: "upload",
      originalHtmlHash: "0".repeat(64),
      extractionConfidence: "high",
      extractionWarnings: [],
      bookId: book.id,
      chapterIndex: i,
    }),
  );
  const chapterOffsets = new Map<string, number>(
    chapterIds.slice(0, 5).map((id) => [id, DEMO_TOTAL]), // chapters 1-4 read, 5 partial
  );
  chapterOffsets.set("lp-demo-book-c5", 3000);

  const locations: LocationRecord[] = [];
  const savedAtFor = (n: number) => new Date(Date.UTC(2026, 8, 15 + n, 10, 0, 0)).toISOString();
  let n = 0;
  for (const a of articles) {
    if (offsets[a.id]! > 0) {
      locations.push({ schemaVersion: 1, articleId: a.id, revision: 1, graphemeOffset: offsets[a.id]!, savedAt: savedAtFor(n) });
      n += 1;
    }
  }
  for (const [chapterId, offset] of chapterOffsets) {
    locations.push({ schemaVersion: 1, articleId: chapterId, revision: 1, graphemeOffset: offset, savedAt: savedAtFor(n) });
    n += 1;
  }

  const sessions = [0, 1, 2, 3, 4].map((i) => ({
    schemaVersion: 1 as const,
    id: `lp-demo-session-${i}`,
    articleId: ["lp-demo-3", "lp-demo-4", "lp-demo-book-c4", "lp-demo-book-c5", "lp-demo-5"][i]!,
    startedAt: savedAtFor(i),
    endedAt: savedAtFor(i),
    startOffset: 0,
    endOffset: 100,
    activeSeconds: [1500, 900, 2400, 1800, 1200][i]!,
  }));

  const latest = new Map<string, LocationRecord>();
  for (const loc of [...real.locations, ...locations]) {
    const prev = latest.get(loc.articleId);
    if (!prev || prev.savedAt < loc.savedAt) latest.set(loc.articleId, loc);
  }
  const totals = new Map(real.totalsByArticleId);
  for (const a of [...articles, ...chapters]) totals.set(a.id, DEMO_TOTAL);

  return {
    ...real,
    articles: [...real.articles, ...articles, ...chapters],
    standaloneArticles: [...real.standaloneArticles, ...articles],
    chaptersByBook: new Map([...real.chaptersByBook, [book.id, chapters]]),
    books: [...real.books, book],
    locations: [...real.locations, ...locations],
    latestLocationByArticleId: latest,
    totalsByArticleId: totals,
    tags: [...new Set([...real.tags, "essay", "longform", "guide", "opinion", "collection"])].sort((a, b) => a.localeCompare(b)),
    readingSessions: [...real.readingSessions, ...sessions],
  };
}

// ── The gate: switcher + variant swap ───────────────────────────────────────

export function LibraryIaPrototypeGate({
  data: baseData,
  children,
}: {
  data: LibraryPrototypeData;
  children: ReactNode;
}) {
  const [variant, setVariant] = useState<PrototypeVariant | null>(readVariantFromUrl);
  // Demo density: `&demo=1` renders the variants over the real snapshot
  // MERGED with synthetic rows (pure render-level — nothing persists).
  const [demoEnabled] = useState(
    () => import.meta.env.DEV && new URLSearchParams(window.location.search).get("demo") === "1",
  );
  const data = useMemo<LibraryPrototypeData>(() => {
    if (!demoEnabled) return baseData;
    const snapshot = demoSnapshot(baseData.snapshot);
    const totals = snapshot.totalsByArticleId;
    const stateCounts = countByState(
      snapshot.standaloneArticles.map((a) => ({
        id: a.id,
        location: snapshot.latestLocationByArticleId.get(a.id),
        total: totals.get(a.id) ?? 0,
      })),
      snapshot.books,
      snapshot.latestLocationByArticleId,
      (id) => totals.get(id),
    );
    return {
      ...baseData,
      snapshot,
      stateCounts,
      allCount: snapshot.standaloneArticles.length + snapshot.books.length,
    };
  }, [baseData, demoEnabled]);
  // The prototype's own dialog wiring (variant modes replace the real page's
  // subtree, whose dialogs live inside it — so the gate mounts its OWN set;
  // the real page's set is untouched when no ?lp= is present).
  const [addOpen, setAddOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<CanonicalArticle | null>(null);
  const [editTarget, setEditTarget] = useState<CanonicalArticle | null>(null);
  const [bookRemoveTarget, setBookRemoveTarget] = useState<Book | null>(null);
  // Filters are gate-owned so they persist across variant flips (comparing
  // like-for-like). The real page's session capture never sees them.
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const dev = import.meta.env.DEV;

  useEffect(() => {
    if (!dev || variant === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      )
        return;
      const idx = VARIANTS.findIndex((v) => v.key === variant);
      const dir = e.key === "ArrowRight" ? 1 : -1;
      const next = VARIANTS[(idx + dir + VARIANTS.length) % VARIANTS.length]!;
      e.preventDefault();
      setVariant(next.key);
      syncVariantUrl(next.key);
      window.scrollTo(0, 0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dev, variant]);

  if (!dev || variant === null) return <>{children}</>;

  const cycle = (dir: 1 | -1) => {
    const idx = VARIANTS.findIndex((v) => v.key === variant);
    const next = VARIANTS[(idx + dir + VARIANTS.length) % VARIANTS.length]!;
    setVariant(next.key);
    syncVariantUrl(next.key);
    window.scrollTo(0, 0);
  };

  const shared = {
    data,
    query,
    setQuery,
    activeTag,
    setActiveTag,
    onAdd: () => setAddOpen(true),
    onRemoveArticle: (a: CanonicalArticle) => setRemoveTarget(a),
    onEditArticle: (a: CanonicalArticle) => setEditTarget(a),
    onRemoveBook: (b: Book) => setBookRemoveTarget(b),
  };

  return (
    <>
      {variant === "a" ? (
        <VariantA {...shared} />
      ) : variant === "b" ? (
        <VariantB {...shared} />
      ) : variant === "c" ? (
        <VariantC {...shared} />
      ) : (
        children
      )}
      <div
        className="lp-switcher"
        role="group"
        aria-label="Library layout prototype — cycle variants"
      >
        <button
          type="button"
          className="lp-switcher-arrow"
          aria-label="Previous variant"
          onClick={() => cycle(-1)}
        >
          ←
        </button>
        <span className="lp-switcher-label">
          {VARIANTS.find((v) => v.key === variant)?.label}
        </span>
        <button
          type="button"
          className="lp-switcher-arrow"
          aria-label="Next variant"
          onClick={() => cycle(1)}
        >
          →
        </button>
      </div>
      {/* The prototype's own dialog set (variant modes only). */}
      <RemoveConfirm
        open={removeTarget !== null}
        articleId={removeTarget?.id ?? ""}
        articleTitle={removeTarget ? effectiveTitle(removeTarget) : ""}
        onConfirm={() => {
          const removedId = removeTarget?.id;
          setRemoveTarget(null);
          invalidateLibrarySnapshot();
          if (removedId !== undefined && window.location.hash === `#/article/${removedId}`) {
            window.location.hash = "#/";
          }
        }}
        onCancel={() => setRemoveTarget(null)}
      />
      <EditMetadataDialog
        open={editTarget !== null}
        article={editTarget}
        onSaved={() => {
          setEditTarget(null);
          invalidateLibrarySnapshot();
        }}
        onCancel={() => setEditTarget(null)}
      />
      <BookRemoveConfirm
        open={bookRemoveTarget !== null}
        bookId={bookRemoveTarget?.id ?? ""}
        bookTitle={bookRemoveTarget?.title ?? ""}
        chapterCount={bookRemoveTarget?.chapterArticleIds.length ?? 0}
        onConfirm={() => {
          const removedChapterIds = bookRemoveTarget?.chapterArticleIds ?? [];
          setBookRemoveTarget(null);
          invalidateLibrarySnapshot();
          if (removedChapterIds.some((id) => window.location.hash === `#/article/${id}`)) {
            window.location.hash = "#/";
          }
        }}
        onCancel={() => setBookRemoveTarget(null)}
      />
      <AddDialog
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onBookAdded={() => invalidateLibrarySnapshot()}
      />
    </>
  );
}

// ── Shared derivations (local, cheap, throwaway) ────────────────────────────

interface ArticleModel {
  article: CanonicalArticle;
  title: string;
  author?: string;
  duration?: string;
  timeRead?: string;
  tags: string[];
  ratio: number;
  state: ReadingState;
}

function articleModel(
  article: CanonicalArticle,
  snapshot: LibrarySnapshot,
  timeReadByArticleId: Map<string, string>,
): ArticleModel {
  const location = snapshot.latestLocationByArticleId.get(article.id);
  const total = snapshot.totalsByArticleId.get(article.id) ?? 0;
  const ratio = location ? Math.min(1, location.graphemeOffset / total) : 0;
  return {
    article,
    title: effectiveTitle(article),
    author: effectiveAuthor(article) ?? undefined,
    duration: videoDuration(article) ?? undefined,
    timeRead: timeReadByArticleId.get(article.id),
    tags: article.tags ?? [],
    ratio,
    state: articleReadingState(location, total),
  };
}

interface BookModel {
  book: Book;
  chapters: CanonicalArticle[];
  progress: number;
  resumeChapterId: string | null;
  ordinal: number;
  chapterCount: number;
  state: ReadingState;
}

function bookModel(book: Book, snapshot: LibrarySnapshot): BookModel {
  const textLengthOf = (id: string) => snapshot.totalsByArticleId.get(id);
  const progress = deriveBookProgress(book, snapshot.latestLocationByArticleId, textLengthOf);
  const resumeChapterId = resolveResumeChapterId(book, snapshot.latestLocationByArticleId);
  return {
    book,
    chapters: snapshot.chaptersByBook.get(book.id) ?? [],
    progress,
    resumeChapterId,
    ordinal: resumeChapterId !== null ? chapterOrdinal(book, resumeChapterId) : 0,
    chapterCount: book.chapterArticleIds.length,
    state: bookReadingState(book, snapshot.latestLocationByArticleId, textLengthOf),
  };
}

async function changeReadState(article: CanonicalArticle, read: boolean): Promise<void> {
  await setArticleReadState(article, read);
  invalidateLibrarySnapshot();
}

type CrEntry =
  | { kind: "article"; model: ArticleModel }
  | { kind: "book"; model: BookModel };

/** The continue-reading fold (most-recently-opened in-progress, cap 3) —
 * mirrors ContinueReadingStrip's membership + sort, locallly. */
function continueEntries(snapshot: LibrarySnapshot, timeRead: Map<string, string>): CrEntry[] {
  const dated: Array<{ entry: CrEntry; at: string }> = [];
  for (const article of snapshot.standaloneArticles) {
    const model = articleModel(article, snapshot, timeRead);
    if (model.state !== "in-progress") continue;
    const at = snapshot.latestLocationByArticleId.get(article.id)?.savedAt ?? "";
    dated.push({ entry: { kind: "article", model }, at });
  }
  for (const book of snapshot.books) {
    const model = bookModel(book, snapshot);
    if (model.state !== "in-progress" || model.resumeChapterId === null) continue;
    const at = snapshot.latestLocationByArticleId.get(model.resumeChapterId)?.savedAt ?? "";
    dated.push({ entry: { kind: "book", model }, at });
  }
  return dated
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, 3)
    .map((d) => d.entry);
}

/** Per-view membership + query/tag filtering + book sort — the LibraryView
 * composition, mirrored locally so variants can regroup it freely. */
function useLibraryLists(data: LibraryPrototypeData, query: string, activeTag: string | null) {
  return useMemo(() => {
    const { snapshot, view } = data;
    const timeRead = timeReadMap(snapshot);
    const totals = snapshot.totalsByArticleId;
    const locations = snapshot.latestLocationByArticleId;
    const viewArticles =
      view === "all"
        ? snapshot.standaloneArticles
        : snapshot.standaloneArticles.filter(
            (a) => articleReadingState(locations.get(a.id), totals.get(a.id) ?? 0) === view,
          );
    const viewBooks =
      view === "all"
        ? snapshot.books
        : snapshot.books.filter(
            (b) => bookReadingState(b, locations, (id) => totals.get(id)) === view,
          );
    const sortedBooks = [...viewBooks].sort((a, b) =>
      a.addedAt < b.addedAt ? 1 : a.addedAt > b.addedAt ? -1 : 0,
    );
    const chapterTitlesByBook = new Map<string, string[]>();
    for (const [bookId, chapters] of snapshot.chaptersByBook) {
      chapterTitlesByBook.set(bookId, chapters.map((c) => c.provenance.title));
    }
    const visibleArticles = filterLibrary(viewArticles, { query, activeTag });
    const visibleBooks = filterBooks(sortedBooks, { query, activeTag }, chapterTitlesByBook);
    return {
      timeRead,
      articles: visibleArticles.map((a) => articleModel(a, snapshot, timeRead)),
      books: visibleBooks.map((b) => bookModel(b, snapshot)),
      membershipEmpty: viewArticles.length === 0 && viewBooks.length === 0,
    };
  }, [data, query, activeTag]);
}

function timeReadMap(snapshot: LibrarySnapshot): Map<string, string> {
  const labels = new Map<string, string>();
  for (const [id, seconds] of deriveLibraryReadingStats(snapshot).secondsByArticleId) {
    if (seconds >= 60) labels.set(id, `${formatDuration(seconds)} read here`);
  }
  return labels;
}

function statsLine(snapshot: LibrarySnapshot, finishedCount: number): string | null {
  const stats = deriveLibraryReadingStats(snapshot);
  if (stats.visits === 0) return null;
  const fmt = new Intl.NumberFormat(navigator.language);
  const base = `You've read ${formatDuration(stats.totalSeconds)} across ${fmt.format(stats.visits)} ${stats.visits === 1 ? "visit" : "visits"}.`;
  return finishedCount > 0 ? `${base} ${fmt.format(finishedCount)} finished.` : base;
}

const VIEW_LABELS: Record<LibraryViewName, string> = {
  all: "All",
  unread: "Unread",
  "in-progress": "In progress",
  finished: "Finished",
};

const EMPTY_COPY: Record<LibraryViewName, { heading: string; body: string }> = {
  all: {
    heading: "Your library is empty",
    body: "Nothing saved yet. Use the Add to Library button to begin.",
  },
  unread: { heading: "Nothing unread", body: "Everything in your library has been started." },
  "in-progress": {
    heading: "Nothing in progress",
    body: "Open something unread — it will show up here.",
  },
  finished: {
    heading: "Nothing finished yet",
    body: "Read to the end and finished items will collect here.",
  },
};

// ── Shared atoms ────────────────────────────────────────────────────────────

function LpViewSwitcher({
  data,
  className,
}: {
  data: LibraryPrototypeData;
  className: string;
}) {
  const { view, onSwitchView, status, stateCounts, allCount } = data;
  return (
    <nav className={className} aria-label="Library views">
      {(Object.keys(VIEW_LABELS) as LibraryViewName[]).map((v) => (
        <a
          key={v}
          href={v === "all" ? "#/" : `#/${v}`}
          aria-current={view === v ? "page" : undefined}
          onClick={(e) => {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
              return;
            e.preventDefault();
            onSwitchView(v);
          }}
        >
          {status === "ready"
            ? `${VIEW_LABELS[v]} (${v === "all" ? allCount : stateCounts[v]})`
            : VIEW_LABELS[v]}
        </a>
      ))}
    </nav>
  );
}

function LpHeader({ onAdd }: { onAdd: () => void }) {
  return (
    <header className="library-header lp-header">
      <h1>Saved articles</h1>
      <button type="button" className="library-add-button" onClick={onAdd} aria-haspopup="dialog">
        Add to Library
      </button>
    </header>
  );
}

function LpEmpty({ view }: { view: LibraryViewName }) {
  return (
    <div className="library-empty">
      <h2>{EMPTY_COPY[view].heading}</h2>
      <p>{EMPTY_COPY[view].body}</p>
    </div>
  );
}

function LpMeta({ m }: { m: ArticleModel }) {
  return (
    <>
      {m.author && <span>{m.author}</span>}
      <SourceBadge article={m.article} />
      {m.duration && <span>{m.duration}</span>}
      {m.timeRead && <span>{m.timeRead}</span>}
    </>
  );
}

function LpStateIcon({ m }: { m: ArticleModel }) {
  const finished = m.state === "finished";
  return (
    <button
      type="button"
      className="lp-iconbtn"
      aria-label={`${finished ? "Mark as unread" : "Mark as read"}: ${m.title}`}
      title={finished ? "Mark as unread" : "Mark as read"}
      onClick={() => void changeReadState(m.article, !finished)}
    >
      <CheckIcon aria-hidden="true" />
    </button>
  );
}

function LpTrash({ label }: { label: string }) {
  return (
    <button type="button" className="lp-iconbtn lp-iconbtn-danger" aria-label={`Remove ${label} from library`}>
      <TrashIcon aria-hidden="true" />
    </button>
  );
}

function LpEdit({ label }: { label: string }) {
  return (
    <button type="button" className="lp-iconbtn" aria-label={`Edit metadata for ${label}`}>
      <EditIcon aria-hidden="true" />
    </button>
  );
}

function ProgressLine({ ratio, state }: { ratio: number; state: ReadingState }) {
  if (state === "finished") return <span className="lp-chip">Finished</span>;
  if (state === "unread" || ratio <= 0) return null;
  return (
    <div className="lp-progress">
      <span className="meta">{Math.min(97, Math.floor(ratio * 100))}% read</span>
      <ProgressHairline progress={ratio} />
    </div>
  );
}

// ── Variant A — Rail + rows ─────────────────────────────────────────────────
// Stats merged into the header block; ONE toolbar band (switcher + search +
// tags); Continue Reading as a compact horizontal rail of slim cards;
// single-column full-width rows; icon action cluster right-aligned.

function VariantA(props: {
  data: LibraryPrototypeData;
  query: string;
  setQuery: (q: string) => void;
  activeTag: string | null;
  setActiveTag: (t: string | null) => void;
  onAdd: () => void;
  onRemoveArticle: (a: CanonicalArticle) => void;
  onEditArticle: (a: CanonicalArticle) => void;
  onRemoveBook: (b: Book) => void;
}) {
  const { data, query, setQuery, activeTag, setActiveTag, onAdd } = props;
  const { snapshot, status, view } = data;
  const lists = useLibraryLists(data, query, activeTag);
  const cr = useMemo(
    () => (status === "ready" ? continueEntries(snapshot, lists.timeRead) : []),
    [snapshot, status, lists.timeRead],
  );
  const stats = status === "ready" ? statsLine(snapshot, data.stateCounts.finished) : null;
  const tags = snapshot.tags;

  return (
    <main id="main" className="lp-main">
      <LpHeader onAdd={onAdd} />
      {stats && (
        <p className="lp-stats-line lp-stats-line-header">{stats}</p>
      )}
      <div className="lpa-toolbar">
        <LpViewSwitcher data={data} className="lpa-toolbar-nav" />
        <LibrarySearch query={query} onQueryChange={setQuery} />
        <TagFilter tags={tags} activeTag={activeTag} onSelect={setActiveTag} />
      </div>
      {cr.length > 0 && (
        <section className="lpa-cr" aria-labelledby="lpa-cr-h">
          <h2 id="lpa-cr-h" className="lp-section-h">
            Continue reading
          </h2>
          <ul className="lpa-rail">
            {cr.map((entry) =>
              entry.kind === "article" ? (
                <li key={entry.model.article.id} className="lpa-rail-card">
                  <a className="lp-title-link" href={`#/article/${entry.model.article.id}`}>
                    {entry.model.title}
                  </a>
                  <div className="lp-progress">
                    <span className="meta">{Math.floor(entry.model.ratio * 100)}% read</span>
                    <ProgressHairline progress={entry.model.ratio} />
                  </div>
                </li>
              ) : (
                <li key={entry.model.book.id} className="lpa-rail-card">
                  <a className="lp-title-link" href={`#/article/${entry.model.resumeChapterId}`}>
                    {entry.model.book.title}
                  </a>
                  <p className="meta">
                    Chapter {entry.model.ordinal} of {entry.model.chapterCount}
                  </p>
                  <div className="lp-progress">
                    <span className="meta">{Math.floor(entry.model.progress * 100)}% read</span>
                    <ProgressHairline progress={entry.model.progress} />
                  </div>
                </li>
              ),
            )}
          </ul>
        </section>
      )}
      <section className="lpa-list" aria-label="Library items">
        {status !== "ready" ? (
          <p className="meta">Opening article…</p>
        ) : lists.membershipEmpty ? (
          <LpEmpty view={view} />
        ) : lists.articles.length === 0 && lists.books.length === 0 ? (
          <p className="library-no-matches">
            Nothing in this view matches your filters.{" "}
            <button
              type="button"
              className="library-clear-filters"
              onClick={() => {
                setQuery("");
                setActiveTag(null);
              }}
            >
              Clear search and filters
            </button>
          </p>
        ) : (
          <ul className="lpa-rows">
            {lists.articles.map((m) => (
              <li key={m.article.id} className="lpa-row">
                <div className="lpa-row-main">
                  <h2>
                    <a className="lp-title-link" href={`#/article/${m.article.id}`}>
                      {m.title}
                    </a>
                  </h2>
                  <p className="meta lp-meta-line">
                    <LpMeta m={m} />
                  </p>
                  {m.tags.length > 0 && (
                    <ul className="library-row-tags" aria-label="Tags">
                      {m.tags.map((t) => (
                        <li key={t}>
                          <span className="tag-chip tag-chip-readonly">{t}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="lpa-row-progress">
                    <ProgressLine ratio={m.ratio} state={m.state} />
                  </div>
                </div>
                <div className="lpa-row-actions">
                  <LpStateIcon m={m} />
                  {m.article.ingestionMeta !== undefined && <LpEdit label={m.title} />}
                  <LpTrash label={m.title} />
                </div>
              </li>
            ))}
            {lists.books.map((bm) => (
              <li key={bm.book.id} className="lpa-row lpa-row-book">
                <div className="lpa-row-main">
                  <h2>
                    <a
                      className="lp-title-link"
                      href={`#/article/${bm.resumeChapterId ?? bm.chapters[0]?.id ?? ""}`}
                    >
                      {bm.book.title}
                    </a>
                  </h2>
                  <p className="meta lp-meta-line">
                    <span>Book · {bm.chapterCount} chapters</span>
                    {bm.book.authors.length > 0 && <span>{bm.book.authors.join(", ")}</span>}
                    {bm.state === "in-progress" && bm.ordinal > 0 && (
                      <span>Chapter {bm.ordinal} of {bm.chapterCount}</span>
                    )}
                  </p>
                  {bm.book.tags && bm.book.tags.length > 0 && (
                    <ul className="library-row-tags" aria-label="Tags">
                      {bm.book.tags.map((t) => (
                        <li key={t}>
                          <span className="tag-chip tag-chip-readonly">{t}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="lpa-row-progress">
                    <ProgressLine ratio={bm.progress} state={bm.state} />
                  </div>
                  <details className="lp-chapters">
                    <summary>Chapters</summary>
                    <ul>
                      {bm.chapters.map((c) => (
                        <li key={c.id}>
                          <a href={`#/article/${c.id}`}>{effectiveTitle(c)}</a>
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
                <div className="lpa-row-actions">
                  <LpTrash label={bm.book.title} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

// ── Variant B — Pinned rows ─────────────────────────────────────────────────
// No separate Continue Reading strip: in-progress items are PINNED as the
// first group of the main grid. Toolbar keeps the current stacked controls
// (real LibrarySearch/TagFilter components). Card grid stays, with normalized
// anatomy: title top-left, icon actions top-right, meta → tags → progress.

function VariantB(props: {
  data: LibraryPrototypeData;
  query: string;
  setQuery: (q: string) => void;
  activeTag: string | null;
  setActiveTag: (t: string | null) => void;
  onAdd: () => void;
  onRemoveArticle: (a: CanonicalArticle) => void;
  onEditArticle: (a: CanonicalArticle) => void;
  onRemoveBook: (b: Book) => void;
}) {
  const { data, query, setQuery, activeTag, setActiveTag, onAdd } = props;
  const { snapshot, status, view } = data;
  const lists = useLibraryLists(data, query, activeTag);
  const stats = status === "ready" ? statsLine(snapshot, data.stateCounts.finished) : null;

  const pinnedArticles = lists.articles.filter((m) => m.state === "in-progress");
  const restArticles = lists.articles.filter((m) => m.state !== "in-progress");
  const pinnedBooks = view === "all" ? lists.books.filter((bm) => bm.state === "in-progress") : [];
  const restBooks = view === "all" ? lists.books.filter((bm) => bm.state !== "in-progress") : lists.books;
  const showGroups = view === "all" && pinnedArticles.length + pinnedBooks.length > 0;

  const card = (m: ArticleModel, pinned: boolean) => (
    <li key={m.article.id} className={`lpb-card${pinned ? " lpb-card-pin" : ""}`}>
      <div className="lpb-card-top">
        <h2>
          <a className="lp-title-link" href={`#/article/${m.article.id}`}>
            {m.title}
          </a>
        </h2>
        <div className="lpa-row-actions">
          <LpStateIcon m={m} />
          {m.article.ingestionMeta !== undefined && <LpEdit label={m.title} />}
          <LpTrash label={m.title} />
        </div>
      </div>
      <p className="meta lp-meta-line">
        <LpMeta m={m} />
      </p>
      {m.tags.length > 0 && (
        <ul className="library-row-tags" aria-label="Tags">
          {m.tags.map((t) => (
            <li key={t}>
              <span className="tag-chip tag-chip-readonly">{t}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="lpb-card-progress">
        <ProgressLine ratio={m.ratio} state={m.state} />
      </div>
    </li>
  );

  const bookCard = (bm: BookModel, pinned: boolean) => (
    <li key={bm.book.id} className={`lpb-card lpb-card-book${pinned ? " lpb-card-pin" : ""}`}>
      <div className="lpb-card-top">
        <h2>
          <a
            className="lp-title-link"
            href={`#/article/${bm.resumeChapterId ?? bm.chapters[0]?.id ?? ""}`}
          >
            {bm.book.title}
          </a>
        </h2>
        <div className="lpa-row-actions">
          <LpTrash label={bm.book.title} />
        </div>
      </div>
      <p className="meta lp-meta-line">
        <span>Book · {bm.chapterCount} chapters</span>
        {bm.book.authors.length > 0 && <span>{bm.book.authors.join(", ")}</span>}
        {bm.state === "in-progress" && bm.ordinal > 0 && (
          <span>Chapter {bm.ordinal} of {bm.chapterCount}</span>
        )}
      </p>
      {bm.book.tags && bm.book.tags.length > 0 && (
        <ul className="library-row-tags" aria-label="Tags">
          {bm.book.tags.map((t) => (
            <li key={t}>
              <span className="tag-chip tag-chip-readonly">{t}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="lpb-card-progress">
        <ProgressLine ratio={bm.progress} state={bm.state} />
      </div>
      <details className="lp-chapters">
        <summary>Chapters</summary>
        <ul>
          {bm.chapters.map((c) => (
            <li key={c.id}>
              <a href={`#/article/${c.id}`}>{effectiveTitle(c)}</a>
            </li>
          ))}
        </ul>
      </details>
    </li>
  );

  return (
    <main id="main" className="lp-main">
      <LpHeader onAdd={onAdd} />
      {stats && <p className="lp-stats-line">{stats}</p>}
      <LpViewSwitcher data={data} className="view-switcher" />
      <LibrarySearch query={query} onQueryChange={setQuery} />
      <TagFilter tags={snapshot.tags} activeTag={activeTag} onSelect={setActiveTag} />
      <section className="lpb-list" aria-label="Library items">
        {status !== "ready" ? (
          <p className="meta">Opening article…</p>
        ) : lists.membershipEmpty ? (
          <LpEmpty view={view} />
        ) : lists.articles.length === 0 && lists.books.length === 0 ? (
          <p className="library-no-matches">
            Nothing in this view matches your filters.{" "}
            <button
              type="button"
              className="library-clear-filters"
              onClick={() => {
                setQuery("");
                setActiveTag(null);
              }}
            >
              Clear search and filters
            </button>
          </p>
        ) : showGroups ? (
          <>
            <h2 className="lp-group-h">Continue reading</h2>
            <ul className="lpb-grid">
              {pinnedArticles.map((m) => card(m, true))}
              {pinnedBooks.map((bm) => bookCard(bm, true))}
            </ul>
            <h2 className="lp-group-h">Everything else</h2>
            <ul className="lpb-grid">
              {restArticles.map((m) => card(m, false))}
              {restBooks.map((bm) => bookCard(bm, false))}
            </ul>
          </>
        ) : (
          <ul className="lpb-grid">
            {lists.articles.map((m) => card(m, false))}
            {restBooks.map((bm) => bookCard(bm, false))}
          </ul>
        )}
      </section>
    </main>
  );
}

// ── Variant C — Compact + text actions ──────────────────────────────────────
// Stats merged into the header line; one compact toolbar row; Continue
// Reading as a collapsible <details> (default open); single-column rows with
// quiet TEXT actions ("Mark as read · Edit · Remove") right-aligned.

function VariantC(props: {
  data: LibraryPrototypeData;
  query: string;
  setQuery: (q: string) => void;
  activeTag: string | null;
  setActiveTag: (t: string | null) => void;
  onAdd: () => void;
  onRemoveArticle: (a: CanonicalArticle) => void;
  onEditArticle: (a: CanonicalArticle) => void;
  onRemoveBook: (b: Book) => void;
}) {
  const { data, query, setQuery, activeTag, setActiveTag, onAdd, onRemoveArticle, onEditArticle, onRemoveBook } = props;
  const { snapshot, status, view } = data;
  const lists = useLibraryLists(data, query, activeTag);
  const cr = useMemo(
    () => (status === "ready" ? continueEntries(snapshot, lists.timeRead) : []),
    [snapshot, status, lists.timeRead],
  );
  const stats = status === "ready" ? statsLine(snapshot, data.stateCounts.finished) : null;

  return (
    <main id="main" className="lp-main">
      <LpHeader onAdd={onAdd} />
      {stats && <p className="lp-stats-line lp-stats-line-header">{stats}</p>}
      <div className="lpc-toolbar">
        <LpViewSwitcher data={data} className="lpc-toolbar-nav" />
        <LibrarySearch query={query} onQueryChange={setQuery} />
        <TagFilter tags={snapshot.tags} activeTag={activeTag} onSelect={setActiveTag} />
      </div>
      {cr.length > 0 && (
        <details className="lpc-cr" open>
          <summary>Continue reading ({cr.length})</summary>
          <ul className="lpc-cr-list">
            {cr.map((entry) =>
              entry.kind === "article" ? (
                <li key={entry.model.article.id} className="lpc-cr-row">
                  <a className="lp-title-link" href={`#/article/${entry.model.article.id}`}>
                    {entry.model.title}
                  </a>
                  <span className="lpc-cr-right">
                    <span className="meta">{Math.floor(entry.model.ratio * 100)}%</span>
                    <button
                      type="button"
                      className="lpc-textbtn"
                      onClick={() => void changeReadState(entry.model.article, true)}
                    >
                      Mark as read
                    </button>
                  </span>
                </li>
              ) : (
                <li key={entry.model.book.id} className="lpc-cr-row">
                  <a className="lp-title-link" href={`#/article/${entry.model.resumeChapterId}`}>
                    {entry.model.book.title} — Chapter {entry.model.ordinal} of{" "}
                    {entry.model.chapterCount}
                  </a>
                  <span className="lpc-cr-right">
                    <span className="meta">{Math.floor(entry.model.progress * 100)}%</span>
                  </span>
                </li>
              ),
            )}
          </ul>
        </details>
      )}
      <section className="lpc-list" aria-label="Library items">
        {status !== "ready" ? (
          <p className="meta">Opening article…</p>
        ) : lists.membershipEmpty ? (
          <LpEmpty view={view} />
        ) : lists.articles.length === 0 && lists.books.length === 0 ? (
          <p className="library-no-matches">
            Nothing in this view matches your filters.{" "}
            <button
              type="button"
              className="library-clear-filters"
              onClick={() => {
                setQuery("");
                setActiveTag(null);
              }}
            >
              Clear search and filters
            </button>
          </p>
        ) : (
          <ul className="lpc-rows">
            {lists.articles.map((m) => (
              <li key={m.article.id} className="lpc-row">
                <div className="lpc-row-main">
                  <h2>
                    <a className="lp-title-link" href={`#/article/${m.article.id}`}>
                      {m.title}
                    </a>
                  </h2>
                  <p className="meta lp-meta-line">
                    <LpMeta m={m} />
                    {m.state === "in-progress" && (
                      <span>{Math.min(97, Math.floor(m.ratio * 100))}% read</span>
                    )}
                  </p>
                  {m.tags.length > 0 && (
                    <ul className="library-row-tags" aria-label="Tags">
                      {m.tags.map((t) => (
                        <li key={t}>
                          <span className="tag-chip tag-chip-readonly">{t}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {m.state === "in-progress" && <ProgressHairline progress={m.ratio} />}
                  {m.state === "finished" && <span className="lp-chip">Finished</span>}
                </div>
                <div className="lpc-row-actions">
                  <button
                    type="button"
                    className="lpc-textbtn"
                    onClick={() => void changeReadState(m.article, m.state !== "finished")}
                  >
                    {m.state === "finished" ? "Mark as unread" : "Mark as read"}
                  </button>
                  {m.article.ingestionMeta !== undefined && (
                    <button type="button" className="lpc-textbtn" onClick={() => onEditArticle(m.article)}>
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    className="lpc-textbtn lpc-textbtn-danger"
                    onClick={() => onRemoveArticle(m.article)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
            {lists.books.map((bm) => (
              <li key={bm.book.id} className="lpc-row lpc-row-book">
                <div className="lpc-row-main">
                  <h2>
                    <a
                      className="lp-title-link"
                      href={`#/article/${bm.resumeChapterId ?? bm.chapters[0]?.id ?? ""}`}
                    >
                      {bm.book.title}
                    </a>
                  </h2>
                  <p className="meta lp-meta-line">
                    <span>Book · {bm.chapterCount} chapters</span>
                    {bm.book.authors.length > 0 && <span>{bm.book.authors.join(", ")}</span>}
                    {bm.state === "in-progress" && bm.ordinal > 0 && (
                      <span>
                        Resume chapter {bm.ordinal} of {bm.chapterCount} ·{" "}
                        {Math.floor(bm.progress * 100)}% read
                      </span>
                    )}
                  </p>
                  {bm.book.tags && bm.book.tags.length > 0 && (
                    <ul className="library-row-tags" aria-label="Tags">
                      {bm.book.tags.map((t) => (
                        <li key={t}>
                          <span className="tag-chip tag-chip-readonly">{t}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {bm.state === "in-progress" && <ProgressHairline progress={bm.progress} />}
                  {bm.state === "finished" && <span className="lp-chip">Finished</span>}
                  <details className="lp-chapters">
                    <summary>Chapters</summary>
                    <ul>
                      {bm.chapters.map((c) => (
                        <li key={c.id}>
                          <a href={`#/article/${c.id}`}>{effectiveTitle(c)}</a>
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
                <div className="lpc-row-actions">
                  <button
                    type="button"
                    className="lpc-textbtn lpc-textbtn-danger"
                    onClick={() => onRemoveBook(bm.book)}
                  >
                    Remove book
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

// ── Icons (throwaway duplicates of the LibraryRow anatomy) ──────────────────

function CheckIcon({ ariaHidden }: { ariaHidden?: "true" }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
      focusable="false"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="M22 4 12 14.01l-3-3" />
    </svg>
  );
}

function TrashIcon({ ariaHidden }: { ariaHidden?: "true" }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
      focusable="false"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function EditIcon({ ariaHidden }: { ariaHidden?: "true" }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
      focusable="false"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}
