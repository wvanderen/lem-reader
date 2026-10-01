// src/routes/discover/DiscoverView.tsx
// Issues #121 + #123 — the Discover destination route view (#/discover): the
// accessible RSS/Atom subscription surface. The LibraryView/ReviewView twin:
// same page shape (<main id="main"> + one h1 + .status live region), the
// h1 focus-on-in-app-navigation discipline, and the state-kind vocabulary
// (no-content state, refusal, error) through the ONE StatusRegion primitive.
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
import { useEffect, useRef, useState } from "react";
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
// The ONE subscribe-and-persist policy (validate → fetch → dedupe → save).
import { subscribeToFeed } from "../../discover/subscribe";
import type { SubscribeOutcome } from "../../discover/subscribe";
// Issue #123 — the ONE refresh-and-persist policy (fetch → merge → save,
// calm failure otherwise) and the ONE deterministic timeline policy.
import { refreshSubscription } from "../../discover/refresh";
import { buildTimeline, filterTimeline } from "../../discover/timeline";
// The feed-aware copy voice (calm DOC-06, one catalog, per-surface wording).
import { mapFeedReasonToCopy } from "../../ingestion/ingestCopy";
import type { IngestionFailureReason } from "../../ingestion/types";
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
        } else {
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
      <StatusRegion>{message !== null && <p>{message}</p>}</StatusRegion>
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
          <section className="library-section discover-section" aria-labelledby="discover-timeline-heading">
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
                  {mapFeedReasonToCopy(reason)} Showing saved items
                  from {formatIsoDate(lastGoodUpdateOf(subscription))}.
                </p>
                <button
                  type="button"
                  className="btn btn-quiet"
                  aria-label={`Retry ${subscription.title}`}
                  disabled={refreshing}
                  onClick={() =>
                    void runRefresh({ announce: true, targets: [subscription] })
                  }
                >
                  Retry
                </button>
              </div>
            ))}
            {visibleEntries.length > 0 ? (
              <ul className="discover-timeline">
                {visibleEntries.map((entry) => (
                  <li
                    key={`${entry.subscription.id}:${entry.index}`}
                    className="discover-item"
                  >
                    {entry.item.image && (
                      <img
                        className="discover-item-image"
                        src={entry.item.image}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    <div className="discover-item-body">
                      <p className="meta discover-item-feed">{entry.subscription.title}</p>
                      <h3 className="discover-item-title">
                        {entry.item.link ? (
                          <a
                            href={entry.item.link}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {entry.item.title}
                            <span className="visually-hidden"> (opens in a new tab)</span>
                          </a>
                        ) : (
                          entry.item.title
                        )}
                      </h3>
                      {entry.item.datePublished && (
                        <p className="meta discover-item-date">
                          {formatIsoDate(entry.item.datePublished)}
                        </p>
                      )}
                      {entry.item.excerpt && (
                        <p className="discover-item-excerpt">{entry.item.excerpt}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="meta discover-timeline-empty">
                {filterId === ""
                  ? "No recent items in your feeds."
                  : "No recent items from this feed."}
              </p>
            )}
          </section>
          <section className="library-section discover-section" aria-labelledby="discover-feeds-heading">
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
