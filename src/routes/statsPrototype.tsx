// src/routes/statsPrototype.tsx
// PROTOTYPE for wayfinder ticket #29 (map #17) — "Stats presentation:
// prototype the stats view and per-article enrichment". THROWAWAY: delete
// this file, the App.tsx seam, the LibraryView/LibraryRow seams, the
// app.css "PROTOTYPE (#29)" block, and the Header "stats" destination
// widening once the presentation decision is recorded on the ticket.
//
// Question: what should the reading-stats surface look like? Three
// structurally different variants over the REAL app shell + REAL library
// data, switchable at the throwaway hash route #/stats-prototype/<a|b|c>:
//
//   A — "On the shelf":  no new destination. A quiet one-line summary strip
//                        above the library list, plus a per-row "time read"
//                        enrichment line on real LibraryRows.
//   B — "A quiet ledger": dedicated page. A modest aggregate block (total
//                        time, visits, finished, ≈ words read) + a
//                        per-article list (last read / time / visits).
//   C — "Reading journal": dedicated page, session-first. One dense
//                        aggregate line, then visits grouped by day. No
//                        words-read, no finished count — tests whether the
//                        reader thinks in sessions or rollups.
//
// A floating dev-only bottom bar cycles variants (←/→) and toggles the
// simulated history between "seeded" and "empty" — the empty side demos the
// no-backfill early state decided in #24 (history accrues only from the
// recording schema onward).
//
// Data: synthetic session rows in the exact readingSessions shape decided
// for Dexie v7 ({ id, articleId, revision, startedAt, endedAt,
// activeSeconds, startOffset, endOffset }), generated deterministically
// against the real LibrarySnapshot article pool. No persistence, no
// mutations — read-only prototype (prototype skill rule 3/anti-patterns).
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { LibraryView } from "../ingestion/library/LibraryView";
import { useLibrarySnapshot } from "../ingestion/library/useLibrarySnapshot";
import { effectiveTitle } from "../ingestion/library/effectiveMetadata";
import { articleReadingState } from "../ingestion/library/readingState";
import { setDocumentTitle } from "../ingestion/library/pageMeta";
import type { LibrarySnapshot } from "../ingestion/library/librarySnapshot";
import type { CanonicalArticle } from "../content/types";

export type StatsPrototypeVariant = "a" | "b" | "c";

const VARIANTS: ReadonlyArray<{ key: StatsPrototypeVariant; name: string }> = [
  { key: "a", name: "On the shelf" },
  { key: "b", name: "A quiet ledger" },
  { key: "c", name: "Reading journal" },
];

// ── Simulated-history toggle (session-scoped, shared by bar + variants) ─────

const SEED_STORAGE_KEY = "stats-proto-seed";

const seedListeners = new Set<() => void>();

function readSeed(): boolean {
  return sessionStorage.getItem(SEED_STORAGE_KEY) !== "0";
}

function setSeedState(next: boolean): void {
  sessionStorage.setItem(SEED_STORAGE_KEY, next ? "1" : "0");
  for (const listener of seedListeners) listener();
}

function useSeed(): [boolean, (next: boolean) => void] {
  const seed = useSyncExternalStore((onStoreChange) => {
    seedListeners.add(onStoreChange);
    return () => {
      seedListeners.delete(onStoreChange);
    };
  }, readSeed);
  return [seed, setSeedState];
}

// ── Synthetic readingSessions (the #24 record shape) ────────────────────────

interface ProtoSession {
  id: string;
  articleId: string;
  revision: number;
  startedAt: number;
  endedAt: number;
  activeSeconds: number;
  startOffset: number;
  endOffset: number;
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function articlePool(snapshot: LibrarySnapshot): CanonicalArticle[] {
  const pool = [...snapshot.standaloneArticles];
  for (const chapters of snapshot.chaptersByBook.values()) pool.push(...chapters);
  return pool;
}

// Deterministic given the snapshot: every caller gets the SAME sessions, so
// the strip total in A agrees with the ledger totals in B and the journal in
// C. Indexes 0/1/2 are pinned (heavy reader / never opened / single glance)
// so the interesting shapes are always visible.
function generateSessions(snapshot: LibrarySnapshot): ProtoSession[] {
  const rng = mulberry32(20260915);
  const pool = articlePool(snapshot);
  const totals = snapshot.totalsByArticleId;
  const sessions: ProtoSession[] = [];
  pool.forEach((article, index) => {
    // The 0/1/2 pins (heavy reader / never opened / single glance) only
    // apply when the library is big enough to show all three shapes.
    const pin = pool.length > 3;
    let count: number;
    if (pin && index === 0) count = 5;
    else if (pin && index === 1) count = 0;
    else if (pin && index === 2) count = 1;
    else {
      const r = rng();
      count = r < 0.2 ? 0 : r < 0.55 ? 2 + Math.floor(rng() * 3) : 5 + Math.floor(rng() * 4);
    }
    const total = totals.get(article.id) ?? 12000;
    // Time stays coherent with length: a visit can't outlast the article
    // (cap ≈ a slow ~80 wpm pass), so "48 min vs ≈ 70 words" can't happen.
    const capSeconds = Math.max(45, Math.floor(total / 8));
    for (let i = 0; i < count; i++) {
      const desired =
        pin && index === 0 && i > 1
          ? 1500 + Math.floor(rng() * 1500)
          : 60 + Math.floor(rng() * rng() * 2700);
      const activeSeconds = Math.min(desired, capSeconds);
      const startedAt = Date.now() - rng() * 21 * 86400000 - rng() * 4 * 3600000;
      const endFrac = index === 0 ? 0.88 + rng() * 0.1 : 0.05 + rng() * 0.9;
      const startFrac = Math.max(0, endFrac - (0.01 + rng() * 0.25));
      sessions.push({
        id: `proto-${article.id}-${i}`,
        articleId: article.id,
        revision: 0,
        startedAt,
        endedAt: startedAt + activeSeconds * 1000,
        activeSeconds,
        startOffset: Math.floor(startFrac * total),
        endOffset: Math.floor(endFrac * total),
      });
    }
  });
  return sessions;
}

// ── Derivations (all stats derive from session rows + the snapshot, per #24) ──

interface ArticleRollup {
  article: CanonicalArticle;
  title: string;
  totalSeconds: number;
  visits: number;
  lastStartedAt: number;
}

interface StatsTotals {
  totalSeconds: number;
  visits: number;
  finishedCount: number;
  wordsRead: number;
  earliestStartedAt: number;
}

interface DerivedStats {
  pool: CanonicalArticle[];
  sessions: ProtoSession[];
  rollups: ArticleRollup[];
  totals: StatsTotals;
}

const EMPTY_STATS: DerivedStats = {
  pool: [],
  sessions: [],
  rollups: [],
  totals: {
    totalSeconds: 0,
    visits: 0,
    finishedCount: 0,
    wordsRead: 0,
    earliestStartedAt: Number.POSITIVE_INFINITY,
  },
};

function deriveStats(snapshot: LibrarySnapshot, sessions: ProtoSession[]): DerivedStats {
  const pool = articlePool(snapshot);
  const totals = snapshot.totalsByArticleId;
  const byArticle = new Map<string, ArticleRollup>();
  let totalSeconds = 0;
  let wordsGraphemes = 0;
  let earliestStartedAt = Number.POSITIVE_INFINITY;
  for (const session of sessions) {
    const article = pool.find((a) => a.id === session.articleId);
    if (!article) continue;
    totalSeconds += session.activeSeconds;
    wordsGraphemes += Math.max(0, session.endOffset - session.startOffset);
    earliestStartedAt = Math.min(earliestStartedAt, session.startedAt);
    const existing = byArticle.get(session.articleId);
    if (existing) {
      existing.totalSeconds += session.activeSeconds;
      existing.visits += 1;
      existing.lastStartedAt = Math.max(existing.lastStartedAt, session.startedAt);
    } else {
      byArticle.set(session.articleId, {
        article,
        title: effectiveTitle(article),
        totalSeconds: session.activeSeconds,
        visits: 1,
        lastStartedAt: session.startedAt,
      });
    }
  }
  const finishedCount = pool.filter(
    (a) =>
      articleReadingState(snapshot.latestLocationByArticleId.get(a.id), totals.get(a.id) ?? 0) ===
      "finished",
  ).length;
  const rollups = [...byArticle.values()].sort((a, b) => b.lastStartedAt - a.lastStartedAt);
  return {
    pool,
    sessions,
    rollups,
    totals: {
      totalSeconds,
      visits: sessions.length,
      finishedCount,
      wordsRead: Math.round(wordsGraphemes / 6),
      earliestStartedAt,
    },
  };
}

function useDerivedStats(): { ready: boolean; stats: DerivedStats } {
  const { status, snapshot } = useLibrarySnapshot();
  const [seed] = useSeed();
  return useMemo(() => {
    if (status !== "ready") return { ready: false, stats: EMPTY_STATS };
    // Empty history is a READY state (the no-backfill early state — the
    // pages must render their empty copy), not a loading state.
    if (!seed) {
      return { ready: true, stats: { ...EMPTY_STATS, pool: articlePool(snapshot) } };
    }
    return { ready: true, stats: deriveStats(snapshot, generateSessions(snapshot)) };
  }, [status, snapshot, seed]);
}

// ── Formatters ───────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (seconds < 60) return "under a minute";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

function numberFormat(): Intl.NumberFormat {
  return new Intl.NumberFormat(navigator.language);
}

function formatDate(epochMs: number, style: "short" | "full"): string {
  try {
    return new Intl.DateTimeFormat(navigator.language, { dateStyle: style }).format(
      new Date(epochMs),
    );
  } catch {
    return new Date(epochMs).toISOString().slice(0, 10);
  }
}

function formatMonthDay(epochMs: number): string {
  try {
    return new Intl.DateTimeFormat(navigator.language, { month: "long", day: "numeric" }).format(
      new Date(epochMs),
    );
  } catch {
    return new Date(epochMs).toISOString().slice(0, 10);
  }
}

function localDayKey(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function startOfDay(epochMs: number): number {
  return new Date(epochMs).setHours(0, 0, 0, 0);
}

// ── Variant A — "On the shelf" (stats live on the real library page) ────────

function StatsShelfStrip() {
  const { ready, stats } = useDerivedStats();
  if (!ready || stats.totals.visits === 0) return null;
  const nf = numberFormat();
  return (
    <p className="stats-proto-strip-line">
      You've read <strong>{formatDuration(stats.totals.totalSeconds)}</strong> across{" "}
      {nf.format(stats.totals.visits)} visits.
      {stats.totals.finishedCount > 0 && ` ${nf.format(stats.totals.finishedCount)} finished.`}
    </p>
  );
}

function StatsShelfVariant({
  onSwitchView,
  warmMount,
}: {
  onSwitchView: (next: "all" | "unread" | "in-progress" | "finished") => void;
  warmMount: boolean;
}) {
  const { ready, stats } = useDerivedStats();
  const timeRead = useMemo(() => {
    const map = new Map<string, string>();
    if (!ready) return map;
    for (const rollup of stats.rollups) {
      if (rollup.totalSeconds >= 60) {
        map.set(rollup.article.id, `${formatDuration(rollup.totalSeconds)} read here`);
      }
    }
    return map;
  }, [ready, stats]);
  return (
    <LibraryView
      view="all"
      onSwitchView={onSwitchView}
      warmMount={warmMount}
      prototypeStatsSlot={<StatsShelfStrip />}
      prototypeTimeRead={timeRead}
    />
  );
}

// ── Variant B — "A quiet ledger" (dedicated page, rollup-first) ─────────────

function StatsLedgerPage() {
  const { status } = useLibrarySnapshot();
  const { ready, stats } = useDerivedStats();
  useEffect(() => {
    setDocumentTitle("Your reading");
  }, []);
  const nf = numberFormat();
  const empty = ready && stats.totals.visits === 0;
  return (
    <main id="main">
      <header className="library-header">
        <h1>Your reading</h1>
      </header>
      {status === "loading" && (
        <div className="status" role="status" aria-live="polite" aria-atomic="true">
          <p>Opening article…</p>
        </div>
      )}
      {empty && (
        <div className="library-empty stats-proto-empty">
          <h2>Nothing recorded yet</h2>
          <p>
            Reading history starts now. Time read before this isn't backfilled — it collects as you
            read.
          </p>
        </div>
      )}
      {ready && stats.totals.visits > 0 && (
        <>
          <section className="library-section">
            <dl className="stats-proto-summary">
              <div>
                <dt>Total time</dt>
                <dd>{formatDuration(stats.totals.totalSeconds)}</dd>
              </div>
              <div>
                <dt>Visits</dt>
                <dd>{nf.format(stats.totals.visits)}</dd>
              </div>
              <div>
                <dt>Finished</dt>
                <dd>{nf.format(stats.totals.finishedCount)}</dd>
              </div>
              <div>
                <dt>Words read</dt>
                <dd>≈ {nf.format(stats.totals.wordsRead)}</dd>
              </div>
            </dl>
          </section>
          <section className="library-section">
            <h2 className="stats-proto-list-heading">By article</h2>
            <ul className="stats-proto-list">
              {stats.rollups.map((rollup) => (
                <li key={rollup.article.id} className="stats-proto-row">
                  <a className="stats-proto-row-title" href={`#/article/${rollup.article.id}`}>
                    {rollup.title}
                  </a>
                  <span className="stats-proto-row-cell">
                    Last read {formatDate(rollup.lastStartedAt, "short")}
                  </span>
                  <span className="stats-proto-row-cell">
                    {formatDuration(rollup.totalSeconds)}
                  </span>
                  <span className="stats-proto-row-cell">
                    {nf.format(rollup.visits)} {rollup.visits === 1 ? "visit" : "visits"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}

// ── Variant C — "Reading journal" (dedicated page, session-first) ────────────

function StatsJournalPage() {
  const { status } = useLibrarySnapshot();
  const { ready, stats } = useDerivedStats();
  useEffect(() => {
    setDocumentTitle("Your reading");
  }, []);
  const nf = numberFormat();
  const empty = ready && stats.totals.visits === 0;
  const dayGroups = useMemo(() => {
    const groups = new Map<string, { dayStart: number; sessions: ProtoSession[] }>();
    for (const session of stats.sessions) {
      const key = localDayKey(session.startedAt);
      const group = groups.get(key) ?? { dayStart: startOfDay(session.startedAt), sessions: [] };
      group.sessions.push(session);
      groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => b.dayStart - a.dayStart);
  }, [stats]);
  return (
    <main id="main">
      <header className="library-header">
        <h1>Your reading</h1>
      </header>
      {status === "loading" && (
        <div className="status" role="status" aria-live="polite" aria-atomic="true">
          <p>Opening article…</p>
        </div>
      )}
      {empty && (
        <div className="library-empty stats-proto-empty">
          <h2>Nothing recorded yet</h2>
          <p>
            Open an article and your visits will collect here, day by day. Nothing from before is
            backfilled.
          </p>
        </div>
      )}
      {ready && stats.totals.visits > 0 && (
        <>
          <p className="stats-proto-oneline">
            {formatDuration(stats.totals.totalSeconds)} read across {nf.format(stats.totals.visits)}{" "}
            visits since {formatMonthDay(stats.totals.earliestStartedAt)}.
          </p>
          {dayGroups.map((group) => (
            <section key={group.dayStart} className="stats-proto-day">
              <h2>{formatDate(group.dayStart, "full")}</h2>
              <ul className="stats-proto-day-list">
                {group.sessions
                  .slice()
                  .sort((a, b) => b.startedAt - a.startedAt)
                  .map((session) => {
                    const article = stats.pool.find((a) => a.id === session.articleId);
                    if (!article) return null;
                    return (
                      <li key={session.id}>
                        <span className="stats-proto-day-time">
                          {formatDuration(session.activeSeconds)}
                        </span>{" "}
                        <a href={`#/article/${article.id}`}>{effectiveTitle(article)}</a>
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))}
        </>
      )}
    </main>
  );
}

// ── Router-facing pieces ─────────────────────────────────────────────────────

export function StatsPrototypeView({
  variant,
  onSwitchView,
  warmMount,
}: {
  variant: StatsPrototypeVariant;
  onSwitchView: (next: "all" | "unread" | "in-progress" | "finished") => void;
  warmMount: boolean;
}) {
  if (variant === "a") {
    return <StatsShelfVariant onSwitchView={onSwitchView} warmMount={warmMount} />;
  }
  if (variant === "b") return <StatsLedgerPage />;
  return <StatsJournalPage />;
}

export function StatsPrototypeBar({
  variant,
  onVariant,
}: {
  variant: StatsPrototypeVariant;
  onVariant: (next: StatsPrototypeVariant) => void;
}) {
  const [seed, setSeed] = useSeed();
  const index = VARIANTS.findIndex((v) => v.key === variant);
  const current = VARIANTS[index] ?? VARIANTS[0] ?? { key: variant, name: variant.toUpperCase() };
  const cycleRef = useRef<(delta: number) => void>(() => {});
  cycleRef.current = (delta: number) => {
    const next = VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length];
    if (next) onVariant(next.key);
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }
      if (document.querySelector("dialog[open]")) return;
      event.preventDefault();
      cycleRef.current(event.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="stats-proto-bar" role="group" aria-label="Stats presentation prototype">
      <button
        type="button"
        className="stats-proto-bar-arrow"
        aria-label="Previous stats variant"
        onClick={() => cycleRef.current(-1)}
      >
        ←
      </button>
      <span className="stats-proto-bar-label">
        {current.key.toUpperCase()} · {current.name}
      </span>
      <button
        type="button"
        className="stats-proto-bar-arrow"
        aria-label="Next stats variant"
        onClick={() => cycleRef.current(1)}
      >
        →
      </button>
      <span className="stats-proto-bar-divider" aria-hidden="true" />
      <button
        type="button"
        className="stats-proto-bar-toggle"
        aria-pressed={seed}
        onClick={() => setSeed(!seed)}
      >
        History: {seed ? "seeded" : "empty"}
      </button>
    </div>
  );
}
