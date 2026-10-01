// src/routes/discover/DiscoverView.tsx
// Issues #121 + #123 + #124 — the Discover destination route view
// (#/discover): the accessible RSS/Atom subscription surface. The
// LibraryView/ReviewView twin: same page shape (<main id="main"> + one h1
// + .status live region), the h1 focus-on-in-app-navigation discipline,
// and the state-kind vocabulary (no-content state, refusal, error) through
// the ONE StatusRegion primitive.
//
// Locked shapes rendered here:
//   - The subscribe form is ALWAYS visible (empty state or not — the form
//     IS the surface's first action); the URL input is NEVER cleared by a
//     refusal (the D16-11 retry discipline).
//   - Refusals are a calm NO (input preserved), never an error: a refused
//     candidate saved nothing (subscribe.ts owns validate → fetch → dedupe
//     → save; this view renders copy only).
//   - Issue #123 — ONE unified newest-first timeline across every
//     subscription (buildTimeline: the deterministic order — dated entries
//     first, undated entries at a pure-function-of-the-cache position),
//     labeled with the feed name on every entry, narrowed by a single-feed
//     filter (a native select — one Tab stop, keyboard-native).
//   - Issue #123 — refresh happens ONLY at the reader's moments: once when
//     Discover opens (with subscriptions) and on the Refresh/Retry request.
//     No background polling, no per-item dismissal — the timeline is the
//     feed's window, not a queue to triage.
//   - Issue #123 — a failed/offline refresh persists nothing: the cached
//     previews and the last-successful-update stamp (lastFetchedAt, falling
//     back to subscribedAt) stay on screen behind a calm stale notice with
//     Retry; established subscriptions remain listed.
//   - Each feed also keeps its management row (the "Your feeds" list): the
//     feed's own name, its normalized feed link, the updated stamp, and
//     Remove. Item titles with links are EXTERNAL anchors: target="_blank"
//     + rel="noopener noreferrer" + the "(opens in a new tab)"
//     visually-hidden suffix (the AddDialog see-original discipline).
//   - Issue #124 — each linked preview carries ONE + affordance that saves
//     the LINKED PAGE through the guarded pipeline (saveFeedItem — never
//     the feed summary or cached feed text) without leaving Discover. A
//     saved preview swaps the + for the calm "In library" mark and an
//     "Open" in-app link (hash anchor, the AddDialog open-saved twin); the
//     article never AUTO-opens (a never-opened addition stays Unread), a
//     refusal announces calmly and leaves the + retryable, and a duplicate
//     press resolves to the EXISTING row (the already-in-library refusal's
//     canonical id — one library item across feeds and redirect aliases,
//     annotations never overwritten). Pre-existing saves render the same
//     "In library" + "Open" state from the ONE library snapshot
//     (savedArticleIdForLink, exact sourceUrl match) — no press needed.
//   - Removal is destructive-confirm: DiscoverRemoveConfirm owns the ONLY
//     deleteSubscription call site (the Pitfall 8 discipline). Removing a
//     subscription deletes its row — its previews/cache only; articles,
//     reading locations, and annotations are keyed by article identity and
//     are never touched (the store's no-cascade contract).
//
// Threat register:
//   - T-16-06 (stored XSS in feed text) → every feed string renders as a
//     React text child — never innerHTML, never dangerouslySetInnerHTML
//     (the repo-wide no-danger rule). Feed images render as plain <img>
//     with alt="" (decorative — the title carries the meaning) and
//     referrerPolicy="no-referrer".
import { useEffect, useMemo, useRef, useState } from "react";
// Plan 14-03 Task 1 (D14-03) — the destination's document.title via the ONE
// shared helper (never string-built here).
import { setDocumentTitle } from "../../ingestion/library/pageMeta";
// The ONE localized date voice (the D17-03 one-formatter discipline).
import { formatIsoDate } from "../../ingestion/library/formatDate";
// Issue #98 (decision #96) — the ONE polite status-region primitive; this
// page's empty state, refusal, error, and announcement region render
// through it.
import { StatusRegion } from "../../ui/StatusRegion";
import { BusyButton } from "../../ui/BusyButton";
import { PlusIcon } from "../../ui/icons";
// The ONE subscribe-and-persist policy (validate → fetch → dedupe → save).
import { subscribeToFeed } from "../../discover/subscribe";
import type { SubscribeOutcome } from "../../discover/subscribe";
// Issue #123 — the ONE refresh-and-persist policy (fetch → merge → save,
// calm failure otherwise) and the ONE deterministic timeline policy.
import { refreshSubscription } from "../../discover/refresh";
import { buildTimeline, filterTimeline, feedItemKey } from "../../discover/timeline";
// Issue #124 — the ONE save-one-feed-item policy (the + press ingests the
// LINKED PAGE through the guarded pipeline) and the pre-press "In
// library" derivation over the ONE library snapshot.
import { saveFeedItem, savedArticleIdForLink } from "../../discover/saveItem";
import type { SaveItemOutcome } from "../../discover/saveItem";
// The feed-aware copy voice (calm DOC-06, one catalog, per-surface wording)
// and the page-voice catalog for the + save's refusals (the saved thing is
// an ARTICLE page, not a feed).
import { mapFeedReasonToCopy, mapReasonToCopy } from "../../ingestion/ingestCopy";
import type { IngestionFailureReason } from "../../ingestion/types";
// The ONE library read model — the pre-existing "In library" state and the
// write-followup invalidation (the AddDialog onSaved discipline).
import { useLibrarySnapshot } from "../../ingestion/library/useLibrarySnapshot";
import { invalidateLibrarySnapshot } from "../../ingestion/library/librarySnapshotBus";
// The ONE list read + the ONE delete seam.
import { listSubscriptions } from "../../persistence/subscriptionsStore";
import type { SubscriptionRecord } from "../../content/schema";
import { DiscoverRemoveConfirm } from "./DiscoverRemoveConfirm";

type LoadStatus = "loading" | "ready" | "error";

/** Hostname of a validated feed URL for the quiet source line (the
 * ReviewView "Originally published at {domain}" vocabulary). */
function hostOf(feedUrl: string): string {
  try {
    return new URL(feedUrl).hostname;
  } catch {
    return feedUrl;
  }
}

/** The last-successful-update stamp a row can honestly show: the last
 * SUCCESSFUL fetch, falling back to the subscribe-time fetch (issue #123
 * — a failed refresh never advances the stamp). */
function lastGoodUpdateOf(subscription: SubscriptionRecord): string {
  return subscription.lastFetchedAt ?? subscription.subscribedAt;
}

/** Apply one subscribe outcome to the form state (the applyOutcome shape —
 * copy lives here; the policy lives in subscribe.ts). */
function applyOutcome(outcome: SubscribeOutcome, announce: (message: string) => void): void {
  switch (outcome.outcome) {
    case "subscribed":
      announce(`Subscribed to ${outcome.subscription.title}.`);
      break;
    case "already-subscribed":
      announce("Already subscribed.");
      break;
    case "invalid-url":
      announce("Enter a valid web address.");
      break;
    case "refused":
      announce(mapFeedReasonToCopy(outcome.reason));
      break;
  }
}

/** Apply one + press's save outcome to the shared announcement region
 * (issue #124 — copy lives here; the policy lives in saveItem.ts). A
 * saved page and a resolved duplicate BOTH leave the preview reading
 * "In library"; refusals use the PAGE voice (the saved thing is an
 * article, not a feed). */
function applySaveOutcome(outcome: SaveItemOutcome, announce: (message: string) => void): void {
  switch (outcome.outcome) {
    case "saved":
      announce("Saved to your library.");
      break;
    case "already-in-library":
      // The ONE catalog's phrase (no second home for the copy).
      announce(mapReasonToCopy("already-in-library"));
      break;
    case "refused":
      announce(mapReasonToCopy(outcome.reason));
      break;
  }
}

export function DiscoverView({ hasAppHistory }: { hasAppHistory: boolean }) {
  // ── Load state ─────────────────────────────────────────────────────────
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([]);

  /** Re-read the store and swap the list in; returns the loaded (sorted)
   * list so the mount effect can hand the SAME rows to the opening
   * refresh without a second read ("" on error). */
  const reload = async (): Promise<SubscriptionRecord[]> => {
    const result = await listSubscriptions();
    if (result.ok) {
      const loaded = [...result.subscriptions].sort((a, b) =>
        b.subscribedAt.localeCompare(a.subscribedAt),
      );
      setSubscriptions(loaded);
      setLoadStatus("ready");
      return loaded;
    }
    setLoadStatus("error");
    return [];
  };

  // The mount-only load + the refresh-on-OPENING moment (issue #123): the
  // initial read IS the opening — when it lands with subscriptions, they
  // refresh exactly once. A feed subscribed DURING this visit was fetched
  // seconds ago, so a mid-visit list change never triggers a refresh; and
  // no interval exists anywhere — opening and the reader's explicit
  // Refresh/Retry are the only fetch moments.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await reload();
      if (!cancelled && loaded.length > 0) {
        void runRefresh({ announce: false, targets: loaded });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Mount-only: `reload`/`runRefresh` close over stable setters + refs,
    // and the loaded list rides in explicitly (a re-run on every render
    // would churn the list region — the LibraryView load-effect shape).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Plan 14-03 Task 1 (the ReviewView twin): the h1 focus announces the
  // view switch — focus fires ONLY when this mount followed an in-app
  // navigation. No cleanup — focusing twice is idempotent and
  // StrictMode-safe (Pitfall 9). No live-region announcement (D14-09 — the
  // focused h1 IS the communication).
  const h1Ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    setDocumentTitle("Discover");
    if (hasAppHistory) h1Ref.current?.focus();
  }, [hasAppHistory]);

  // ── Subscribe form state ───────────────────────────────────────────────
  const [urlValue, setUrlValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // The shared announcement region: submitting progress, refusals, saves,
  // removals, and refresh outcomes. Never unmounts (a live region must
  // pre-exist).
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubscribe(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || urlValue.trim().length === 0) return;
    setSubmitting(true);
    setMessage("Fetching feed…");
    try {
      const outcome = await subscribeToFeed(urlValue);
      applyOutcome(outcome, setMessage);
      if (outcome.outcome === "subscribed") {
        // A refusal or save failure preserves the address for retry.
        setUrlValue("");
        await reload();
      }
    } catch {
      setMessage("Couldn't save this subscription. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Refresh state (issue #123) ─────────────────────────────────────────
  // Per-feed refresh failures — the STALE STATE. A feed absent from this
  // map refreshed cleanly; a feed present in it keeps its cached previews
  // and its last-successful-update stamp on screen with a Retry control.
  const [refreshErrors, setRefreshErrors] = useState<Record<string, IngestionFailureReason>>({});
  const [refreshing, setRefreshing] = useState(false);
  // The overlap guard: state alone races across renders (two clicks in one
  // tick), so the in-flight check is a ref — the BusyButton pattern's
  // companion for non-form actions.
  const refreshInFlightRef = useRef(false);

  /** What one refresh run should fetch: every feed (the Refresh button) or
   * an explicit list (the opening refresh and the per-feed Retry). */
  interface RefreshRequest {
    announce: boolean;
    targets?: SubscriptionRecord[];
  }

  const runRefresh = async ({ announce, targets: targetsOverride }: RefreshRequest) => {
    const targets = targetsOverride ?? subscriptions;
    if (refreshInFlightRef.current || targets.length === 0) return;
    refreshInFlightRef.current = true;
    setRefreshing(true);
    const firstTarget = targets[0];
    if (announce) {
      setMessage(
        targets.length === 1 && firstTarget
          ? `Refreshing ${firstTarget.title}…`
          : "Refreshing feeds…",
      );
    }
    try {
      const outcomes = await Promise.all(
        targets.map((subscription) => refreshSubscription(subscription)),
      );
      const refreshedById = new Map<string, SubscriptionRecord>();
      const failures = new Map<string, IngestionFailureReason>();
      outcomes.forEach((outcome, i) => {
        const target = targets[i];
        if (target === undefined) return;
        if (outcome.outcome === "refreshed") {
          refreshedById.set(target.id, outcome.subscription);
        } else if (outcome.outcome === "failed") {
          failures.set(target.id, outcome.reason);
        }
      });
      // Refreshed rows swap in from the outcomes (already persisted by the
      // policy); everything else — including rows this run didn't target —
      // stays exactly as it was (the failed-refresh contract).
      setSubscriptions((prev) => prev.map((s) => refreshedById.get(s.id) ?? s));
      // The stale state is PER-FEED and scoped to this run's targets: a
      // retried feed clears its notice on success and keeps it on failure;
      // feeds outside the run are untouched.
      setRefreshErrors((prev) => {
        const next = { ...prev };
        for (const target of targets) {
          const failure = failures.get(target.id);
          if (failure === undefined) delete next[target.id];
          else next[target.id] = failure;
        }
        return next;
      });
      const failureCount = failures.size;
      if (failureCount > 0) {
        if (failureCount === targets.length) {
          setMessage(
            targets.length === 1 && firstTarget
              ? `Couldn't refresh ${firstTarget.title}. Showing saved items.`
              : "Couldn't refresh your feeds. Showing saved items.",
          );
        } else {
          setMessage("Some feeds couldn't be refreshed. Showing saved items for those.");
        }
      } else if (announce) {
        // A silent (on-open) success stays silent — the updated timeline IS
        // the feedback; only a requested refresh announces. The copy names
        // the scope: one retried feed, or the whole timeline.
        setMessage(
          targets.length === subscriptions.length || !firstTarget
            ? "Feeds refreshed."
            : `Refreshed ${firstTarget.title}.`,
        );
      }
    } catch {
      if (announce) setMessage("Couldn't refresh your feeds. Try again.");
    } finally {
      refreshInFlightRef.current = false;
      setRefreshing(false);
    }
  };

  // ── Single-feed filter state (issue #123) ──────────────────────────────
  // "" selects every feed; otherwise the subscription id. Removing the
  // filtered feed resets to the unfiltered timeline.
  const [filterId, setFilterId] = useState("");

  // ── Removal state ──────────────────────────────────────────────────────
  const [removeTarget, setRemoveTarget] = useState<SubscriptionRecord | null>(null);

  // ── Inline save state (issue #124) ─────────────────────────────────────
  // The ONE library snapshot backs the pre-press "In library" state (an
  // article whose sourceUrl IS a preview's link renders In library + Open
  // with no press). Resolved aliases ride the same snapshot; session
  // outcomes bridge the asynchronous reload, including failed reads.
  const { snapshot, status: libraryStatus } = useLibrarySnapshot();
  const [resolvedIds, setResolvedIds] = useState<
    Record<string, { articleId: string; snapshot: typeof snapshot }>
  >({});
  const [savingLinks, setSavingLinks] = useState<ReadonlySet<string>>(new Set());
  // The overlap guard: state alone races across renders (two clicks in one
  // tick), so the in-flight check is a ref — the refresh pattern's twin,
  // per link (independent previews may save concurrently).
  const savingInFlightRef = useRef<Set<string>>(new Set());

  // The live row ids — a session resolution survives only while its row
  // still exists: a mid-session removal (LibraryView, ReviewView) re-opens
  // the + honestly instead of leaving a dead Open link behind.
  const savedIds = useMemo(
    () => new Set(snapshot.articles.map((article) => article.id)),
    [snapshot.articles],
  );

  const saveFocusRef = useRef<{
    link: string;
    button: HTMLButtonElement;
    row: Element | null;
  } | null>(null);

  /** Keep confirmed outcomes until a fresh successful snapshot can
   * establish whether the row still exists. */

  const savedIdFor = (link: string): string | undefined => {
    const resolved = resolvedIds[link];
    if (
      resolved !== undefined &&
      (savedIds.has(resolved.articleId) ||
        resolved.snapshot === snapshot ||
        libraryStatus === "error")
    )
      return resolved.articleId;
    return savedArticleIdForLink(snapshot.articles, link);
  };

  async function handleSaveItem(link: string, button: HTMLButtonElement) {
    if (document.activeElement === button) {
      saveFocusRef.current = { link, button, row: button.closest(".discover-item") };
    }
    if (savingInFlightRef.current.has(link)) return;
    savingInFlightRef.current.add(link);
    setSavingLinks(new Set(savingInFlightRef.current));
    setMessage("Saving to your library…");
    try {
      const outcome = await saveFeedItem(link);
      applySaveOutcome(outcome, setMessage);
      if (outcome.sourceAliasError) {
        setMessage(
          "The article is in your library, but couldn't remember this feed link. You may need to save this preview again on a future visit.",
        );
      }
      if (outcome.outcome === "refused") saveFocusRef.current = null;
      if (outcome.outcome === "saved") {
        setResolvedIds((prev) => ({ ...prev, [link]: { articleId: outcome.articleId, snapshot } }));
        // The ONE write-followup call (the AddDialog onSaved discipline):
        // the snapshot re-derives, so the saved state survives leaving
        // Discover and coming back even without a session resolution.
        invalidateLibrarySnapshot();
      } else if (outcome.outcome === "already-in-library" && outcome.articleId !== undefined) {
        const { articleId } = outcome;
        setResolvedIds((prev) => ({ ...prev, [link]: { articleId, snapshot } }));
        invalidateLibrarySnapshot();
      }
    } catch {
      saveFocusRef.current = null;
      setMessage("Couldn't save this page. Try again.");
    } finally {
      savingInFlightRef.current.delete(link);
      setSavingLinks(new Set(savingInFlightRef.current));
    }
  }

  const visibleEntries = filterTimeline(
    buildTimeline(subscriptions),
    filterId === "" ? null : filterId,
  );
  const failedEntries = subscriptions.flatMap((subscription) => {
    const reason = refreshErrors[subscription.id];
    return reason === undefined ? [] : [{ subscription, reason }];
  });

  return (
    <main id="main">
      <header className="library-header discover-header">
        <h1 ref={h1Ref} tabIndex={-1}>
          Discover
        </h1>
      </header>
      {/* The ONE announcement region — submitting progress, refusal copy,
          saves, removals, refresh outcomes. Collapsed via CSS when idle
          (:empty). */}
      <StatusRegion>
        {message !== null && <p>{message}</p>}
        {libraryStatus === "error" && (
          <>
            <p>Couldn't check your library. Try again.</p>
            <button className="btn btn-quiet" onClick={invalidateLibrarySnapshot}>
              Retry library check
            </button>
          </>
        )}
      </StatusRegion>
      {/* The subscribe form — always visible, the surface's first action.
          Native label + url input (the AddDialog URL arm's anatomy). */}
      <form className="discover-subscribe-form" onSubmit={handleSubscribe}>
        <label htmlFor="discover-feed-url">Subscribe to a feed</label>
        <div className="discover-subscribe-controls">
          <input
            id="discover-feed-url"
            name="feedUrl"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://example.com/feed.xml"
            value={urlValue}
            disabled={submitting}
            onChange={(e) => setUrlValue(e.target.value)}
          />
          <BusyButton
            type="submit"
            busy={submitting}
            className="btn btn-primary discover-subscribe-button"
            disabled={urlValue.trim().length === 0}
          >
            Subscribe
          </BusyButton>
        </div>
        <p className="meta">RSS or Atom feed address</p>
      </form>
      {/* (a) Error state — the load FAILED (named honestly, with a next
             step; never blamed on the reader). */}
      {loadStatus === "error" ? (
        <StatusRegion className="discover-empty">
          <h2>Couldn't open your subscriptions.</h2>
          <p>Reload the page to try again.</p>
        </StatusRegion>
      ) : loadStatus === "ready" && subscriptions.length === 0 ? (
        /* (b) No-content state — title at the surface's outline level + one
               sentence; invites the first action (the form above IS it). */
        <StatusRegion className="discover-empty">
          <h2>No subscriptions yet.</h2>
          <p>Subscribe to an RSS or Atom feed to see its latest articles here.</p>
        </StatusRegion>
      ) : loadStatus === "ready" ? (
        /* (c) The subscription surface — ONE newest-first timeline across
               every feed (issue #123), then the per-feed management rows. */
        <>
          <section
            className="library-section discover-section"
            aria-labelledby="discover-timeline-heading"
          >
            <div className="discover-timeline-head">
              <h2 id="discover-timeline-heading">Latest articles</h2>
              {/* The feed controls: the single-feed filter (a native
                  select — one Tab stop, keyboard-native) + the manual
                  refresh. No polling loop exists anywhere behind them. */}
              <div className="discover-toolbar">
                <div className="discover-filter">
                  <label htmlFor="discover-feed-filter">Filter by feed</label>
                  <select
                    id="discover-feed-filter"
                    value={filterId}
                    onChange={(e) => setFilterId(e.target.value)}
                  >
                    <option value="">All feeds</option>
                    {subscriptions.map((subscription) => (
                      <option key={subscription.id} value={subscription.id}>
                        {subscription.title}
                      </option>
                    ))}
                  </select>
                </div>
                <BusyButton
                  busy={refreshing}
                  className="btn discover-refresh-button"
                  disabled={subscriptions.length === 0}
                  onClick={() => void runRefresh({ announce: true })}
                >
                  Refresh
                </BusyButton>
              </div>
            </div>
            {/* The stale state (issue #123): one calm notice per feed whose
                last refresh failed — the reason copy from the ONE catalog,
                the honest last-successful-update time, and Retry (which
                re-fetches the failed feeds only). Cached previews stay
                visible in the timeline beneath. */}
            {failedEntries.map(({ subscription, reason }) => (
              <div
                key={subscription.id}
                className="discover-refresh-notice"
                data-feed-id={subscription.id}
              >
                <p>
                  {mapFeedReasonToCopy(reason)} Showing saved items from{" "}
                  {formatIsoDate(lastGoodUpdateOf(subscription))}.
                </p>
                <button
                  type="button"
                  className="btn btn-quiet"
                  aria-label={`Retry ${subscription.title}`}
                  disabled={refreshing}
                  onClick={() => void runRefresh({ announce: true, targets: [subscription] })}
                >
                  Retry
                </button>
              </div>
            ))}
            {visibleEntries.length > 0 ? (
              <ul className="discover-timeline">
                {visibleEntries.map((entry) => {
                  const { item } = entry;
                  const link = item.link;
                  const savedId = link ? savedIdFor(link) : undefined;
                  return (
                    <li
                      key={JSON.stringify([entry.subscription.id, feedItemKey(item)])}
                      className="discover-item"
                    >
                      {item.image && (
                        <img
                          className="discover-item-image"
                          src={item.image}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                        />
                      )}
                      <div className="discover-item-body">
                        <p className="meta discover-item-feed">{entry.subscription.title}</p>
                        <h3 className="discover-item-title">
                          {link ? (
                            <a href={link} target="_blank" rel="noopener noreferrer">
                              {item.title}
                              <span className="visually-hidden"> (opens in a new tab)</span>
                            </a>
                          ) : (
                            item.title
                          )}
                        </h3>
                        {item.datePublished && (
                          <p className="meta discover-item-date">
                            {formatIsoDate(item.datePublished)}
                          </p>
                        )}
                        {item.excerpt && <p className="discover-item-excerpt">{item.excerpt}</p>}
                        {/* Issue #124 — the inline add affordance. A linked
                            preview carries exactly one of: the + press
                            (ingests the LINKED PAGE through the guarded
                            pipeline; never the feed summary or cached feed
                            text), or the saved state — the calm "In
                            library" mark + the "Open" in-app link. Open
                            NEVER fires automatically: the hash anchor is a
                            plain link the reader chooses, so a never-
                            opened addition stays Unread. A refusal keeps
                            the + (retryable, D16-11); a duplicate resolves
                            to the EXISTING row's id — one library item,
                            annotations never overwritten. Linkless
                            previews offer neither: there is no page to
                            save, and the absence is the honest state. */}
                        {link && (
                          <div className="discover-item-actions">
                            {savedId ? (
                              <>
                                <span className="discover-item-saved">In library</span>
                                <a
                                  className="btn btn-quiet discover-item-open"
                                  ref={(node) => {
                                    const pending = saveFocusRef.current;
                                    if (!node || pending?.link !== link || node.closest(".discover-item") !== pending.row) return;
                                    if (
                                      document.activeElement === pending.button ||
                                      document.activeElement === document.body
                                    )
                                      node.focus();
                                    saveFocusRef.current = null;
                                  }}
                                  href={`#/article/${savedId}`}
                                  aria-label={`Open ${item.title}`}
                                >
                                  Open
                                </a>
                              </>
                            ) : (
                              <BusyButton
                                busy={savingLinks.has(link)}
                                className="btn btn-icon discover-item-save"
                                aria-label={`Save ${item.title}`}
                                onClick={(event) => void handleSaveItem(link, event.currentTarget)}
                              >
                                <PlusIcon />
                              </BusyButton>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="meta discover-timeline-empty">
                {filterId === ""
                  ? "No recent items in your feeds."
                  : "No recent items from this feed."}
              </p>
            )}
          </section>
          <section
            className="library-section discover-section"
            aria-labelledby="discover-feeds-heading"
          >
            <h2 id="discover-feeds-heading">Your feeds</h2>
            <ul className="discover-list">
              {subscriptions.map((subscription) => (
                <li key={subscription.id} className="discover-row">
                  <article aria-labelledby={`discover-feed-title-${subscription.id}`}>
                    <div className="discover-row-main">
                      <h3 id={`discover-feed-title-${subscription.id}`}>{subscription.title}</h3>
                      <p className="meta discover-feed-url">
                        <a href={subscription.feedUrl} target="_blank" rel="noopener noreferrer">
                          {hostOf(subscription.feedUrl)}
                          <span className="visually-hidden"> (opens in a new tab)</span>
                        </a>
                      </p>
                      {subscription.description && (
                        <p className="discover-feed-description">{subscription.description}</p>
                      )}
                      {/* The last-successful-update stamp (issue #123). */}
                      <p className="meta discover-feed-updated">
                        Updated {formatIsoDate(lastGoodUpdateOf(subscription))}
                      </p>
                    </div>
                    <div className="discover-row-actions">
                      <button
                        type="button"
                        className="btn btn-quiet discover-remove-button"
                        aria-label={`Remove ${subscription.title}`}
                        onClick={() => setRemoveTarget(subscription)}
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : /* (d) Loading — spare chrome: the form is up; the list region
               stays silent until the read settles (the StatusRegion loading
               copy would double-announce against the header). */
      null}
      <DiscoverRemoveConfirm
        open={removeTarget !== null}
        subscriptionId={removeTarget?.id ?? ""}
        feedTitle={removeTarget?.title ?? ""}
        onConfirm={async () => {
          const removedId = removeTarget?.id;
          setRemoveTarget(null);
          setMessage("Subscription removed.");
          if (removedId !== undefined && filterId === removedId) setFilterId("");
          // The failed feed's stale notice goes with its row.
          setRefreshErrors((prev) => {
            if (removedId === undefined) return prev;
            const next = { ...prev };
            delete next[removedId];
            return next;
          });
          await reload();
        }}
        onCancel={() => setRemoveTarget(null)}
      />
    </main>
  );
}
