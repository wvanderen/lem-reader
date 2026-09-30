// src/routes/discover/DiscoverView.tsx
// Issue #121 — the Discover destination route view (#/discover): the
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
//   - Each subscription renders its feed name (h2), its normalized feed
//     link, and its bounded recent previews — title, date when supplied,
//     excerpt, optional image — exactly the cache captured at subscribe
//     time. Item titles with links are EXTERNAL anchors: target="_blank" +
//     rel="noopener noreferrer" + the "(opens in a new tab)" visually-hidden
//     suffix (the AddDialog see-original discipline).
//   - Removal is destructive-confirm: DiscoverRemoveConfirm owns the ONLY
//     deleteSubscription call site (the Pitfall 8 discipline).
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
// The feed-aware copy voice (calm DOC-06, one catalog, per-surface wording).
import { mapFeedReasonToCopy } from "../../ingestion/ingestCopy";
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

/** Apply one subscribe outcome to the form state (the applyOutcome shape —
 * copy lives here; the policy lives in subscribe.ts). */
function applyOutcome(
  outcome: SubscribeOutcome,
  announce: (message: string) => void,
): void {
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

  const reload = async () => {
    const result = await listSubscriptions();
    if (result.ok) {
      setSubscriptions(
        [...result.subscriptions].sort((a, b) => b.subscribedAt.localeCompare(a.subscribedAt)),
      );
      setLoadStatus("ready");
    } else {
      setLoadStatus("error");
    }
  };

  useEffect(() => {
    void reload();
    // The mount-only load; `reload` closes over stable setters only, and a
    // re-run on every render would churn the list region (the LibraryView
    // mount-only load-effect shape).
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
  // and removals. Never unmounts (a live region must pre-exist).
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubscribe(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || urlValue.trim().length === 0) return;
    setSubmitting(true);
    setMessage("Fetching feed…");
    const outcome = await subscribeToFeed(urlValue);
    setSubmitting(false);
    applyOutcome(outcome, setMessage);
    if (outcome.outcome === "subscribed") {
      // Success clears the input (a fresh subscribe is ready — the D16-08
      // fresh-session discipline); a refusal NEVER does (D16-11).
      setUrlValue("");
      await reload();
    }
  }

  // ── Removal state ──────────────────────────────────────────────────────
  const [removeTarget, setRemoveTarget] = useState<SubscriptionRecord | null>(null);

  return (
    <main id="main">
      <header className="library-header discover-header">
        <h1 ref={h1Ref} tabIndex={-1}>
          Discover
        </h1>
      </header>
      {/* The ONE announcement region — submitting progress, refusal copy,
          saves, removals. Collapsed via CSS when idle (:empty). */}
      <StatusRegion>
        {message !== null && <p>{message}</p>}
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
        /* (c) The subscription list — newest first; each row carries the
               feed name, the normalized feed link, and the bounded recent
               previews (title, date when supplied, excerpt, optional
               image). */
        <section className="library-section discover-section" aria-label="Your subscriptions">
          <ul className="discover-list">
            {subscriptions.map((subscription) => (
              <li key={subscription.id} className="discover-row">
                <article aria-labelledby={`discover-feed-title-${subscription.id}`}>
                  <div className="discover-row-main">
                    <h2 id={`discover-feed-title-${subscription.id}`}>{subscription.title}</h2>
                    <p className="meta discover-feed-url">
                      <a href={subscription.feedUrl} target="_blank" rel="noopener noreferrer">
                        {hostOf(subscription.feedUrl)}
                        <span className="visually-hidden"> (opens in a new tab)</span>
                      </a>
                    </p>
                    {subscription.description && (
                      <p className="discover-feed-description">{subscription.description}</p>
                    )}
                    {subscription.items.length > 0 ? (
                      <ul className="discover-items">
                        {subscription.items.map((item, index) => (
                          <li key={index} className="discover-item">
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
                              <h3 className="discover-item-title">
                                {item.link ? (
                                  <a href={item.link} target="_blank" rel="noopener noreferrer">
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
                              {item.excerpt && (
                                <p className="discover-item-excerpt">{item.excerpt}</p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="meta">No recent items in this feed.</p>
                    )}
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
      ) : (
        /* (d) Loading — spare chrome: the form is up; the list region
               stays silent until the read settles (the StatusRegion loading
               copy would double-announce against the header). */
        null
      )}
      <DiscoverRemoveConfirm
        open={removeTarget !== null}
        subscriptionId={removeTarget?.id ?? ""}
        feedTitle={removeTarget?.title ?? ""}
        onConfirm={async () => {
          setRemoveTarget(null);
          setMessage("Subscription removed.");
          await reload();
        }}
        onCancel={() => setRemoveTarget(null)}
      />
    </main>
  );
}
