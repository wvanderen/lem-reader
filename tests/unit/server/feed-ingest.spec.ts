// tests/unit/server/feed-ingest.spec.ts
// Issue #121 — the feed-candidate pipeline regression suite. Table-driven
// over the refusal catalog and the bounded-parse contract, through the REAL
// `ingest({feedUrl})` orchestrator (the ingest-transcript-paste offline
// pattern plus the safe-fetch.spec mock discipline: node:dns is controlled
// via vi.mock; fetch via vi.stubGlobal).
//
// Pinned here:
//   - The SSRF refusals fire through the feed branch (scheme/private-IP/
//     metadata/DNS) — the same 9-measure guard, never a fork.
//   - The pre-read content-type gate (XML subtypes only) and the pre-read
//     content-length cap (Measure 7 — the body is NEVER read on refusal).
//   - Malformed XML, entity-declaring DTDs, and non-feed XML (including an
//     HTML page under a text/xml header) refuse `feed-unreadable`.
//   - RSS 2.0 + Atom happy paths: title/link/date/excerpt/image extraction,
//     the hostname fallback for an untitled channel, and the bounded
//     output (items sliced to MAX_FEED_ITEMS, text truncated to
//     MAX_FEED_TEXT_CHARS).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ingest } from "../../../server/ingest";
import { MAX_FEED_ITEMS, MAX_FEED_TEXT_CHARS } from "../../../src/content/schema";

// Mock node:dns so each test controls resolve4/resolve6 return values.
vi.mock("node:dns", () => ({
  default: {
    promises: {
      resolve4: vi.fn(),
      resolve6: vi.fn(),
    },
  },
}));

import dns from "node:dns";

const resolve4Mock = dns.promises.resolve4 as unknown as ReturnType<typeof vi.fn>;
const resolve6Mock = dns.promises.resolve6 as unknown as ReturnType<typeof vi.fn>;

let textCallCount = 0;
let fetchMock: ReturnType<typeof vi.fn>;

function fakeResponse(opts: {
  status?: number;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
}): Response {
  const status = opts.status ?? 200;
  return {
    status,
    ok: status >= 200 && status < 300,
    url: opts.url ?? "https://feeds.example.com/feed.xml",
    headers: new Headers(opts.headers ?? {}),
    text: async () => {
      textCallCount++;
      return opts.body ?? "";
    },
    arrayBuffer: async () => {
      throw new Error("feed profile must never read bytes");
    },
  } as unknown as Response;
}

beforeEach(() => {
  resolve4Mock.mockReset();
  resolve6Mock.mockReset();
  textCallCount = 0;
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  // Default: the feed host resolves public.
  resolve4Mock.mockResolvedValue(["93.184.216.34"]);
  resolve6Mock.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>The Calm Reader Journal</title>
    <description>Essays on &amp; quiet interfaces</description>
    <item>
      <title>On stable reading positions</title>
      <link>https://journal.example.com/stable-positions</link>
      <pubDate>Wed, 02 Oct 2024 15:00:00 +0000</pubDate>
      <description><![CDATA[<p>Why the page should not move under the reader&rsquo;s eye.</p>]]></description>
    </item>
    <item>
      <title>Second entry, no extras</title>
      <link>https://journal.example.com/second</link>
    </item>
  </channel>
</rss>`;

const ATOM_FIXTURE = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Journal</title>
  <subtitle>Quiet entries</subtitle>
  <entry>
    <title>Atom entry one</title>
    <link rel="alternate" href="https://atom.example.com/one"/>
    <link rel="enclosure" type="image/png" href="https://atom.example.com/one.png"/>
    <published>2024-10-03T10:00:00Z</published>
    <summary>Plain summary text</summary>
  </entry>
  <entry>
    <title>Atom entry two</title>
    <link href="https://atom.example.com/two"/>
    <updated>2024-10-04T09:00:00Z</updated>
    <content type="html">&lt;p&gt;Content body &amp;amp; more&lt;/p&gt;</content>
    <media:thumbnail xmlns:media="http://search.yahoo.com/mrss/" url="https://atom.example.com/two-thumb.png"/>
  </entry>
</feed>`;

describe("feed candidate — SSRF refusals through ingest({feedUrl}) (issue #121)", () => {
  it.each(["file:///etc/feeds.xml", "ftp://feeds.example.com/feed.xml", "data:text/xml,<rss/>"])(
    "refuses non-http(s) scheme %s → ssrf-blocked-scheme",
    async (url) => {
      const response = await ingest({ feedUrl: url });
      expect(response).toEqual({ ok: false, reason: "ssrf-blocked-scheme" });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["http://169.254.169.254/latest/meta-data/", "ssrf-blocked-metadata"],
    ["http://metadata.google.internal/feed", "ssrf-blocked-metadata"],
  ])("refuses cloud-metadata hostname %s → ssrf-blocked-metadata", async (url, reason) => {
    const response = await ingest({ feedUrl: url });
    expect(response).toEqual({ ok: false, reason });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["http://127.0.0.1/feed.xml", ["127.0.0.1"]],
    ["http://10.0.0.5/feed.xml", ["10.0.0.5"]],
    ["http://192.168.1.10/feed.xml", ["192.168.1.10"]],
  ])("refuses loopback/private IP %s → ssrf-blocked-private-ip", async (url, resolved) => {
    // A numeric-IP hostname resolves to itself (the safe-fetch.spec
    // hostname-aware DNS discipline).
    resolve4Mock.mockResolvedValue(resolved);
    resolve6Mock.mockResolvedValue([]);
    const response = await ingest({ feedUrl: url });
    expect(response).toEqual({ ok: false, reason: "ssrf-blocked-private-ip" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a public hostname that resolves to a private IP (DNS deny-list)", async () => {
    resolve4Mock.mockResolvedValue(["10.0.0.99"]);
    const response = await ingest({ feedUrl: "https://rebind.example.com/feed.xml" });
    expect(response).toEqual({ ok: false, reason: "ssrf-blocked-private-ip" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an unresolvable hostname → fetch-failed", async () => {
    resolve4Mock.mockResolvedValue([]);
    resolve6Mock.mockResolvedValue([]);
    const response = await ingest({ feedUrl: "https://nonexistent.invalid/feed.xml" });
    expect(response).toEqual({ ok: false, reason: "fetch-failed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("re-validates redirect hops: a 302 into a private IP refuses ssrf-blocked-private-ip", async () => {
    resolve4Mock.mockImplementation((hostname: string) =>
      Promise.resolve(hostname === "10.0.0.1" ? ["10.0.0.1"] : ["93.184.216.34"]),
    );
    fetchMock.mockResolvedValueOnce(
      fakeResponse({
        status: 302,
        url: "https://feeds.example.com/old.xml",
        headers: { location: "http://10.0.0.1/feed.xml" },
      }),
    );
    const response = await ingest({ feedUrl: "https://feeds.example.com/old.xml" });
    expect(response).toEqual({ ok: false, reason: "ssrf-blocked-private-ip" });
    expect(textCallCount).toBe(0);
  });
});

describe("feed candidate — transport gates (issue #121)", () => {
  it("refuses a non-XML content-type BEFORE reading the body → unsupported-content-type", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse({
        url: "https://feeds.example.com/page",
        headers: { "content-type": "text/html; charset=utf-8", "content-length": "1000" },
        body: "should-not-be-read",
      }),
    );
    const response = await ingest({ feedUrl: "https://feeds.example.com/page" });
    expect(response).toEqual({ ok: false, reason: "unsupported-content-type" });
    expect(textCallCount).toBe(0);
  });

  it("accepts application/rss+xml, application/atom+xml, application/xml, and text/xml", async () => {
    const cases: Array<[string, string]> = [
      ["application/rss+xml", RSS_FIXTURE],
      ["application/atom+xml", ATOM_FIXTURE],
      ["application/xml", RSS_FIXTURE],
      ["text/xml", RSS_FIXTURE],
    ];
    let i = 0;
    for (const [contentType, body] of cases) {
      fetchMock.mockResolvedValueOnce(
        fakeResponse({
          url: `https://feeds.example.com/case-${i}`,
          headers: { "content-type": contentType, "content-length": String(body.length) },
          body,
        }),
      );
      const response = await ingest({ feedUrl: `https://feeds.example.com/case-${i}` });
      expect(response.ok, `content-type ${contentType} must be admitted`).toBe(true);
      i += 1;
    }
  });

  it("refuses an over-cap content-length BEFORE reading the body → response-too-large", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse({
        url: "https://feeds.example.com/huge.xml",
        headers: {
          "content-type": "application/rss+xml",
          "content-length": String(6 * 1024 * 1024),
        },
        body: "should-not-be-read",
      }),
    );
    const response = await ingest({ feedUrl: "https://feeds.example.com/huge.xml" });
    expect(response).toEqual({ ok: false, reason: "response-too-large" });
    expect(textCallCount).toBe(0);
  });
});

describe("feed candidate — bounded parsing (issue #121)", () => {
  it("parses an RSS 2.0 feed: title, description, per-item title/link/date/excerpt", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse({
        url: "https://feeds.example.com/journal.xml",
        headers: {
          "content-type": "application/rss+xml",
          "content-length": String(RSS_FIXTURE.length),
        },
        body: RSS_FIXTURE,
      }),
    );
    const response = await ingest({ feedUrl: "https://feeds.example.com/journal.xml" });
    expect(response.ok).toBe(true);
    if (!response.ok || !("feed" in response)) return;
    const feed = response.feed;
    expect(feed.url).toBe("https://feeds.example.com/journal.xml");
    expect(feed.title).toBe("The Calm Reader Journal");
    expect(feed.description).toBe("Essays on & quiet interfaces");
    expect(feed.items).toHaveLength(2);
    const first = feed.items[0]!;
    expect(first.title).toBe("On stable reading positions");
    expect(first.link).toBe("https://journal.example.com/stable-positions");
    // RFC-822 pubDate normalized to ISO-8601 — "date when supplied".
    expect(first.datePublished).toBe("2024-10-02T15:00:00.000Z");
    // HTML stripped, entities decoded, CDATA honored — a plain-text excerpt.
    expect(first.excerpt).toBe("Why the page should not move under the reader’s eye.");
    expect(first.image).toBeUndefined();
    const second = feed.items[1]!;
    expect(second.title).toBe("Second entry, no extras");
    expect(second.datePublished).toBeUndefined();
    expect(second.excerpt).toBeUndefined();
  });

  it("parses an Atom feed: alternate-link preference, published/updated dates, excerpt, thumbnail image", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse({
        url: "https://feeds.example.com/atom.xml",
        headers: {
          "content-type": "application/atom+xml",
          "content-length": String(ATOM_FIXTURE.length),
        },
        body: ATOM_FIXTURE,
      }),
    );
    const response = await ingest({ feedUrl: "https://feeds.example.com/atom.xml" });
    expect(response.ok).toBe(true);
    if (!response.ok || !("feed" in response)) return;
    const feed = response.feed;
    expect(feed.title).toBe("Atom Journal");
    expect(feed.description).toBe("Quiet entries");
    expect(feed.items).toHaveLength(2);
    const one = feed.items[0]!;
    // rel="alternate" preferred over the enclosure link; the enclosure's
    // non-alternate href never becomes the item link.
    expect(one.link).toBe("https://atom.example.com/one");
    expect(one.datePublished).toBe("2024-10-03T10:00:00.000Z");
    expect(one.excerpt).toBe("Plain summary text");
    const two = feed.items[1]!;
    expect(two.link).toBe("https://atom.example.com/two");
    expect(two.datePublished).toBe("2024-10-04T09:00:00.000Z");
    expect(two.excerpt).toBe("Content body & more");
    // media:thumbnail supplies the optional image.
    expect(two.image).toBe("https://atom.example.com/two-thumb.png");
  });

  it("slices items to MAX_FEED_ITEMS and truncates long text to MAX_FEED_TEXT_CHARS", async () => {
    const manyItems = Array.from({ length: MAX_FEED_ITEMS + 15 }, (_, i) => {
      const longTitle = `Item ${i} — ${"长".repeat(MAX_FEED_TEXT_CHARS)}`;
      return `<item><title>${longTitle}</title><link>https://flood.example.com/${i}</link></item>`;
    }).join("\n");
    const flood = `<?xml version="1.0"?><rss version="2.0"><channel><title>Flood Feed</title>${manyItems}</channel></rss>`;
    fetchMock.mockResolvedValueOnce(
      fakeResponse({
        url: "https://feeds.example.com/flood.xml",
        headers: { "content-type": "application/rss+xml", "content-length": String(flood.length) },
        body: flood,
      }),
    );
    const response = await ingest({ feedUrl: "https://feeds.example.com/flood.xml" });
    expect(response.ok).toBe(true);
    if (!response.ok || !("feed" in response)) return;
    // Bounded item count (the +15 surplus never arrives).
    expect(response.feed.items).toHaveLength(MAX_FEED_ITEMS);
    // Bounded text (the Zod schema re-refines at every read; the server
    // truncates so the response validates).
    for (const item of response.feed.items) {
      expect(item.title.length).toBeLessThanOrEqual(MAX_FEED_TEXT_CHARS);
    }
  });

  it("falls back to the hostname for an untitled channel", async () => {
    const untitled = `<?xml version="1.0"?><rss version="2.0"><channel><item><title>Only an item</title></item></channel></rss>`;
    fetchMock.mockResolvedValueOnce(
      fakeResponse({
        url: "https://feeds.example.com/untitled.xml",
        headers: {
          "content-type": "application/rss+xml",
          "content-length": String(untitled.length),
        },
        body: untitled,
      }),
    );
    const response = await ingest({ feedUrl: "https://feeds.example.com/untitled.xml" });
    expect(response.ok).toBe(true);
    if (!response.ok || !("feed" in response)) return;
    expect(response.feed.title).toBe("feeds.example.com");
  });

  it("normalizes the feed URL (the import merge key): default port + fragment drop", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse({
        url: "https://feeds.example.com:443/journal.xml#frag",
        headers: {
          "content-type": "application/rss+xml",
          "content-length": String(RSS_FIXTURE.length),
        },
        body: RSS_FIXTURE,
      }),
    );
    const response = await ingest({ feedUrl: "https://feeds.example.com/journal.xml" });
    expect(response.ok).toBe(true);
    if (!response.ok || !("feed" in response)) return;
    expect(response.feed.url).toBe("https://feeds.example.com/journal.xml");
  });
});

describe("feed candidate — hostile payloads refuse (issue #121)", () => {
  it.each([
    ["malformed XML", '<?xml version="1.0"?><rss><channel><title'],
    [
      "missing closing tags",
      "<rss><channel><title>Broken</title><item><title>Article</title></item>",
    ],
    ["mismatched closing tags", "<rss><channel><title>Broken</title></feed></rss>"],
    ["PI tag not closed", "<?xml this is not xml <<<"],
    [
      "entity-declaring DTD",
      `<?xml version="1.0"?><!DOCTYPE rss [<!ENTITY a "b">]><rss version="2.0"><channel><title>&a;</title></channel></rss>`,
    ],
    ["HTML under a text/xml header", "<!DOCTYPE html><html><body><p>Not a feed</p></body></html>"],
    [
      "non-feed XML",
      '<?xml version="1.0"?><catalog><book><title>Not a feed</title></book></catalog>',
    ],
    ["empty body", ""],
  ])("refuses %s → feed-unreadable", async (_label, body) => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse({
        url: "https://feeds.example.com/hostile.xml",
        headers: { "content-type": "application/rss+xml", "content-length": String(body.length) },
        body,
      }),
    );
    const response = await ingest({ feedUrl: "https://feeds.example.com/hostile.xml" });
    expect(response).toEqual({ ok: false, reason: "feed-unreadable" });
  });

  it("drops items without a title (a preview without a title is not previewable)", async () => {
    const untitledItems = `<?xml version="1.0"?><rss version="2.0"><channel><title>Untitled Items</title>
      <item><link>https://u.example.com/1</link><description>No title here</description></item>
      <item><title>Real entry</title><link>https://u.example.com/2</link></item>
    </channel></rss>`;
    fetchMock.mockResolvedValueOnce(
      fakeResponse({
        url: "https://feeds.example.com/untitled-items.xml",
        headers: {
          "content-type": "application/rss+xml",
          "content-length": String(untitledItems.length),
        },
        body: untitledItems,
      }),
    );
    const response = await ingest({ feedUrl: "https://feeds.example.com/untitled-items.xml" });
    expect(response.ok).toBe(true);
    if (!response.ok || !("feed" in response)) return;
    expect(response.feed.items).toHaveLength(1);
    expect(response.feed.items[0]!.title).toBe("Real entry");
  });

  it("never attaches a non-http(s) link or image (the httpUrl refinement)", async () => {
    const hostileLinks = `<?xml version="1.0"?><rss version="2.0"><channel><title>Hostile Links</title>
      <item><title>Entry</title><link>javascript:alert(1)</link><enclosure url="data:text/html,x" type="image/png"/></item>
    </channel></rss>`;
    fetchMock.mockResolvedValueOnce(
      fakeResponse({
        url: "https://feeds.example.com/hostile-links.xml",
        headers: {
          "content-type": "application/rss+xml",
          "content-length": String(hostileLinks.length),
        },
        body: hostileLinks,
      }),
    );
    const response = await ingest({ feedUrl: "https://feeds.example.com/hostile-links.xml" });
    expect(response.ok).toBe(true);
    if (!response.ok || !("feed" in response)) return;
    expect(response.feed.items[0]!.link).toBeUndefined();
    expect(response.feed.items[0]!.image).toBeUndefined();
  });
});
