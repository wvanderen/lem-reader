// tests/unit/server/ingest-url-publishedat.spec.ts
// Regression suite for the WordPress offset-date class of URL-ingest
// failures. WordPress (and most CMSs) emit
// `<meta property="article:published_time" content="2026-09-22T14:53:08+00:00">`
// — the OFFSET form, not the Z form. Provenance.publishedAt is
// `.datetime()`-refined (UTC-only) in src/content/schema.ts, so the raw
// passthrough failed ArticleSchema.parse with a ZodError, which the T-7-23
// catch wrapped as the catch-all "server-error" refusal: perfectly readable
// articles 400'd (prod-confirmed on communistusa.org, 2026-09).
//
// The fix normalizes at the single-article provenance assembly point
// (server/ingest.ts) via the EPUB stage's toIsoDatetimeOrNull precedent:
// parseable → ISO Z; unparseable → omitted (tolerant, never a refusal).
//
// Offline pattern (feed-ingest.spec.ts discipline): the REAL ingest({url})
// orchestrator runs; node:dns is controlled via vi.mock; fetch via
// vi.stubGlobal. The asset stage is a no-op (no figures in the fixture).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ingest } from "../../../server/ingest";

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

let fetchMock: ReturnType<typeof vi.fn>;

/** Minimal article-shaped HTML carrying one published_time meta value. */
function articleHtml(publishedTime?: string): string {
  const meta = publishedTime
    ? `\n  <meta property="article:published_time" content="${publishedTime}" />`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Offset-date canary</title>${meta}
</head>
<body>
  <article>
    <h1>Offset-date canary</h1>
    <p>The reader should see this paragraph regardless of how the CMS formats its publication timestamp.</p>
    <p>A second paragraph so Readability confidently admits the body.</p>
  </article>
</body>
</html>`;
}

function fakeHtmlResponse(html: string, url: string): Response {
  return {
    status: 200,
    ok: true,
    url,
    headers: new Headers({ "content-type": "text/html; charset=UTF-8" }),
    text: async () => html,
  } as unknown as Response;
}

beforeEach(() => {
  resolve4Mock.mockReset();
  resolve6Mock.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  resolve4Mock.mockResolvedValue(["93.184.216.34"]);
  resolve6Mock.mockResolvedValue([]);
  fetchMock.mockImplementation(async (u: string) =>
    fakeHtmlResponse(articleHtml("2026-09-22T14:53:08+00:00"), u),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function ingestUrl(publishedTime?: string): Promise<{
  ok: boolean;
  reason?: string;
  publishedAt?: string;
}> {
  fetchMock.mockImplementation(async (u: string) =>
    fakeHtmlResponse(articleHtml(publishedTime), u),
  );
  const response = await ingest({ url: "https://cms.example.com/offset-date-canary/" });
  if (!response.ok) return { ok: false, reason: (response as { reason: string }).reason };
  return {
    ok: true,
    publishedAt: (response as { article?: { provenance?: { publishedAt?: string } } })
      .article?.provenance?.publishedAt,
  };
}

describe("URL ingest — CMS published_time normalization (the communistusa.org canary)", () => {
  it("admits the WordPress offset form (+00:00) with a normalized UTC Z timestamp", async () => {
    const result = await ingestUrl("2026-09-22T14:53:08+00:00");
    expect(result).toEqual({ ok: true, publishedAt: "2026-09-22T14:53:08.000Z" });
  });

  it("admits a negative offset (-04:00), normalized to UTC Z", async () => {
    const result = await ingestUrl("2024-03-01T08:30:00-04:00");
    expect(result).toEqual({ ok: true, publishedAt: "2024-03-01T12:30:00.000Z" });
  });

  it("admits a date-only value, normalized to midnight UTC", async () => {
    const result = await ingestUrl("2024-03-01");
    expect(result).toEqual({ ok: true, publishedAt: "2024-03-01T00:00:00.000Z" });
  });

  it("admits a Z-form timestamp unchanged in meaning", async () => {
    const result = await ingestUrl("2024-03-01T12:00:00Z");
    expect(result).toEqual({ ok: true, publishedAt: "2024-03-01T12:00:00.000Z" });
  });

  it("omits an unparseable timestamp — tolerant, never a refusal", async () => {
    const result = await ingestUrl("not a date at all");
    expect(result).toEqual({ ok: true, publishedAt: undefined });
  });

  it("omits publishedAt when the page carries no published_time meta", async () => {
    const result = await ingestUrl(undefined);
    expect(result).toEqual({ ok: true, publishedAt: undefined });
  });
});
