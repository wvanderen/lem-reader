// tests/unit/server/safe-fetch.spec.ts
// Plan 07-03 Task 1 — the 9-measure SSRF guard regression suite. Table-driven
// over the 13 behavior cases from 07-03-PLAN.md `<behavior>`. DNS is controlled
// via vi.mock("node:dns"); fetch is controlled via vi.stubGlobal. Every refusal
// case asserts the thrown IngestionError's typed `.reason` field, and (per
// Measure 7) that res.text() is NEVER invoked on refusal — the upstream body
// cannot leak. The single happy path asserts the FetchedContent shape.
//
// Threat coverage: T-7-08 (metadata exfil), T-7-09 (internal enumeration),
// T-7-10 (DNS rebinding TOCTOU — validated-then-fetch path), T-7-11
// (redirect-into-internal), T-7-12 (body leak on refusal), T-7-13 (DoS).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { IngestionError } from "../../../server/errors";

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
import {
  safeFetch,
  safeFetchCore,
  type FetchedContent,
  type SafeFetchProfile,
} from "../../../server/safeFetch";

const resolve4Mock = dns.promises.resolve4 as unknown as ReturnType<typeof vi.fn>;
const resolve6Mock = dns.promises.resolve6 as unknown as ReturnType<typeof vi.fn>;

/** A fake Response满足 safeFetch's read surface (headers + status + url + text). */
function fakeResponse(opts: {
  status?: number;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Phase 20 (Plan 20-01 Task 2) — byte body for the image-profile read
   * path. Additive: existing text-profile cells never supply it. */
  byteBody?: Uint8Array;
}): Response {
  const status = opts.status ?? 200;
  const headers = new Headers(opts.headers ?? {});
  return {
    status,
    ok: status >= 200 && status < 300,
    url: opts.url ?? "https://example.com/article",
    headers,
    text: async () => {
      textCallCount++;
      return opts.body ?? "";
    },
    arrayBuffer: async () => {
      arrayBufferCallCount++;
      return (opts.byteBody ?? new Uint8Array(0)).slice().buffer;
    },
  } as Response;
}

let textCallCount = 0;
let arrayBufferCallCount = 0;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resolve4Mock.mockReset();
  resolve6Mock.mockReset();
  textCallCount = 0;
  arrayBufferCallCount = 0;
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("safeFetch SSRF guard (07-03 Task 1)", () => {
  it.each([
    ["file:///etc/passwd", "file:"],
    ["gopher://x/", "gopher:"],
    ["data:text/html,<script>", "data:"],
    ["dict://localhost:2628/", "dict:"],
    ["ftp://example.com/file", "ftp:"],
  ])("refuses non-http(s) scheme %s → ssrf-blocked-scheme", async (url) => {
    await expect(safeFetch(url)).rejects.toMatchObject({
      reason: "ssrf-blocked-scheme",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "http://169.254.169.254/latest/meta-data/",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://metadata.amazonaws.com/latest/meta-data/",
  ])("refuses cloud-metadata hostname %s → ssrf-blocked-metadata", async (url) => {
    await expect(safeFetch(url)).rejects.toMatchObject({
      reason: "ssrf-blocked-metadata",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(resolve4Mock).not.toHaveBeenCalled();
  });

  it.each([
    ["http://10.0.0.1/", ["10.0.0.1"], []],
    ["http://127.0.0.1/", ["127.0.0.1"], []],
    ["http://100.64.0.1/", ["100.64.0.1"], []], // CGNAT
    ["http://192.168.1.1/", ["192.168.1.1"], []],
    ["http://172.16.5.5/", ["172.16.5.5"], []],
  ])("refuses private/loopback/CGNAT IP via DNS resolve %s → ssrf-blocked-private-ip", async (url, v4) => {
    resolve4Mock.mockResolvedValue(v4);
    resolve6Mock.mockResolvedValue([]);
    await expect(safeFetch(url)).rejects.toMatchObject({
      reason: "ssrf-blocked-private-ip",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses IPv6 loopback ::1 → ssrf-blocked-private-ip", async () => {
    resolve4Mock.mockResolvedValue([]);
    resolve6Mock.mockResolvedValue(["::1"]);
    await expect(safeFetch("http://[::1]/")).rejects.toMatchObject({
      reason: "ssrf-blocked-private-ip",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses unique-local IPv6 fd00::1 → ssrf-blocked-private-ip", async () => {
    resolve4Mock.mockResolvedValue([]);
    resolve6Mock.mockResolvedValue(["fd00::1"]);
    await expect(safeFetch("http://[fd00::1]/")).rejects.toMatchObject({
      reason: "ssrf-blocked-private-ip",
    });
  });

  it.each([
    "http://0x7f000001/", // hex
    "http://2130706433/", // dword
    "http://0177.0.0.1/", // octal
  ])("refuses IP-encoding bypass %s (URL-normalized then deny-listed) → ssrf-blocked-private-ip", async (url) => {
    // Node's URL constructor normalizes all three to 127.0.0.1
    resolve4Mock.mockResolvedValue(["127.0.0.1"]);
    resolve6Mock.mockResolvedValue([]);
    await expect(safeFetch(url)).rejects.toMatchObject({
      reason: "ssrf-blocked-private-ip",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses IPv4-mapped IPv6 → ssrf-blocked-private-ip", async () => {
    // ::ffff:127.0.0.1 — an IPv4-mapped IPv6; the guard must check its v4 form.
    resolve4Mock.mockResolvedValue([]);
    resolve6Mock.mockResolvedValue(["::ffff:127.0.0.1"]);
    await expect(safeFetch("http://[::ffff:127.0.0.1]/")).rejects.toMatchObject({
      reason: "ssrf-blocked-private-ip",
    });
  });

  it("per-hop re-validation: 302 to http://10.0.0.1/ → ssrf-blocked-private-ip (Measure 2)", async () => {
    // First hop: public DNS, returns a 302 redirect to an internal IP.
    // Hostname-aware DNS mock: attacker.example → public; 10.0.0.1 → itself.
    resolve4Mock.mockImplementation((hostname: string) =>
      Promise.resolve(hostname === "10.0.0.1" ? ["10.0.0.1"] : ["93.184.216.34"]),
    );
    resolve6Mock.mockResolvedValue([]);
    fetchMock.mockResolvedValueOnce(
      fakeResponse({
        status: 302,
        url: "http://attacker.example/",
        headers: { location: "http://10.0.0.1/" },
      }),
    );
    await expect(safeFetch("http://attacker.example/")).rejects.toMatchObject({
      reason: "ssrf-blocked-private-ip",
    });
  });

  it("caps redirects at MAX_REDIRECTS=5 → fetch-failed", async () => {
    // Every hop redirects to another public URL; after 5 hops we refuse.
    resolve4Mock.mockResolvedValue(["93.184.216.34"]);
    resolve6Mock.mockResolvedValue([]);
    const redirectResp = (n: number) =>
      fakeResponse({
        status: 302,
        url: `https://example.com/redirect-${n}`,
        headers: { location: `https://example.com/redirect-${n + 1}` },
      });
    fetchMock
      .mockResolvedValueOnce(redirectResp(1))
      .mockResolvedValueOnce(redirectResp(2))
      .mockResolvedValueOnce(redirectResp(3))
      .mockResolvedValueOnce(redirectResp(4))
      .mockResolvedValueOnce(redirectResp(5))
      .mockResolvedValueOnce(redirectResp(6));
    await expect(safeFetch("https://example.com/entry")).rejects.toMatchObject({
      reason: "fetch-failed",
    });
  });

  it("refuses response > MAX_RESPONSE_BYTES BEFORE res.text() → response-too-large (Measure 7+8)", async () => {
    resolve4Mock.mockResolvedValue(["93.184.216.34"]);
    resolve6Mock.mockResolvedValue([]);
    fetchMock.mockResolvedValueOnce(
      fakeResponse({
        status: 200,
        url: "https://example.com/huge",
        headers: { "content-length": String(6 * 1024 * 1024), "content-type": "text/html" },
        body: "should-not-be-read",
      }),
    );
    await expect(safeFetch("https://example.com/huge")).rejects.toMatchObject({
      reason: "response-too-large",
    });
    expect(textCallCount).toBe(0); // Measure 7 — no body read on refusal
  });

  it("refuses non-html content-type BEFORE res.text() → unsupported-content-type", async () => {
    resolve4Mock.mockResolvedValue(["93.184.216.34"]);
    resolve6Mock.mockResolvedValue([]);
    fetchMock.mockResolvedValueOnce(
      fakeResponse({
        status: 200,
        url: "https://example.com/doc.pdf",
        headers: { "content-length": "1000", "content-type": "application/pdf" },
        body: "should-not-be-read",
      }),
    );
    await expect(safeFetch("https://example.com/doc.pdf")).rejects.toMatchObject({
      reason: "unsupported-content-type",
    });
    expect(textCallCount).toBe(0);
  });

  it("happy path: public hostname returns FetchedContent with sha256 hash", async () => {
    resolve4Mock.mockResolvedValue(["93.184.216.34"]);
    resolve6Mock.mockResolvedValue([]);
    const html = "<html><body><p>Hello world.</p></body></html>";
    fetchMock.mockResolvedValueOnce(
      fakeResponse({
        status: 200,
        url: "https://example.com/article",
        headers: { "content-length": String(html.length), "content-type": "text/html; charset=utf-8" },
        body: html,
      }),
    );
    const result: FetchedContent = await safeFetch("https://example.com/article");
    expect(result.html).toBe(html);
    expect(result.finalUrl).toBe("https://example.com/article");
    expect(result.contentType).toContain("text/html");
    expect(result.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(textCallCount).toBe(1); // body read exactly once, after all validation passed
  });

  it("happy path: xhtml+xml content-type is accepted", async () => {
    resolve4Mock.mockResolvedValue(["93.184.216.34"]);
    resolve6Mock.mockResolvedValue([]);
    fetchMock.mockResolvedValueOnce(
      fakeResponse({
        status: 200,
        url: "https://example.com/x",
        headers: { "content-type": "application/xhtml+xml" },
        body: "<p/>",
      }),
    );
    const result = await safeFetch("https://example.com/x");
    expect(result.contentType).toContain("application/xhtml+xml");
  });

  it("IngestionError carries typed .reason and is instanceof IngestionError", async () => {
    try {
      await safeFetch("file:///etc/passwd");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(IngestionError);
      expect((err as IngestionError).reason).toBe("ssrf-blocked-scheme");
      expect((err as Error).message).toBeTruthy();
    }
  });

  it("DNS unresolved (both v4+v6 empty) → fetch-failed", async () => {
    resolve4Mock.mockResolvedValue([]);
    resolve6Mock.mockResolvedValue([]);
    await expect(safeFetch("https://nonexistent.invalid/")).rejects.toMatchObject({
      reason: "fetch-failed",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ── Phase 20 (Plan 20-01 Task 2) — the two-profile seam ─────────────────────
// Strengthen-only extension: NO existing cell above is modified. These cells
// pin the parameterized core's image-profile behavior (the seam
// server/fetchImageAsset.ts wraps in Task 3): byte body read, the post-read
// byteLength re-check (12-04 header-lie discipline — content-length can lie /
// be absent / be chunked), the advisory image/ content-type gate, and the
// Measure-7 body-never-read guarantee on the bytes path.
describe("safeFetchCore image profile (20-01 Task 2 — Pitfall 4)", () => {
  /** A small-budget image profile — the byteLength re-check cells exercise
   * the post-read guard without materializing MAX_ASSET_BYTES (16MB) of body:
   * the CORE checks profile.maxBytes, so a 10-byte cap proves the mechanism. */
  const tinyImageProfile: SafeFetchProfile = {
    allowedContentTypes: ["image/"],
    timeoutMs: 15_000,
    maxBytes: 10,
    bodyKind: "bytes",
  };

  it("returns bytes (Uint8Array) with finalUrl + contentType on the image profile", async () => {
    resolve4Mock.mockResolvedValue(["93.184.216.34"]);
    resolve6Mock.mockResolvedValue([]);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    fetchMock.mockResolvedValueOnce(
      fakeResponse({
        status: 200,
        url: "https://cdn.example.com/pic.png",
        headers: { "content-type": "image/png", "content-length": String(png.byteLength) },
        byteBody: png,
      }),
    );
    const result = await safeFetchCore("https://cdn.example.com/pic.png", tinyImageProfile);
    expect(result.body).toBeInstanceOf(Uint8Array);
    expect(Array.from(result.body as Uint8Array)).toEqual(Array.from(png));
    expect(result.finalUrl).toBe("https://cdn.example.com/pic.png");
    expect(result.contentType).toContain("image/png");
    expect(arrayBufferCallCount).toBe(1);
    expect(textCallCount).toBe(0); // bytes profile NEVER reads text
  });

  it("post-read byteLength re-check: body over cap refuses response-too-large EVEN when content-length header lies (12-04)", async () => {
    resolve4Mock.mockResolvedValue(["93.184.216.34"]);
    resolve6Mock.mockResolvedValue([]);
    const lyingBody = new Uint8Array(20).fill(0xff); // 20 bytes > maxBytes 10
    fetchMock.mockResolvedValueOnce(
      fakeResponse({
        status: 200,
        url: "https://cdn.example.com/huge.png",
        // Header says 5 (under cap); the actual body is 20 (over cap). The
        // pre-read content-length gate passes; the post-read re-check refuses.
        headers: { "content-type": "image/png", "content-length": "5" },
        byteBody: lyingBody,
      }),
    );
    await expect(
      safeFetchCore("https://cdn.example.com/huge.png", tinyImageProfile),
    ).rejects.toMatchObject({ reason: "response-too-large" });
    expect(arrayBufferCallCount).toBe(1); // the read happened — that is the point
  });

  it("post-read byteLength re-check: chunked/absent content-length body over cap refuses too", async () => {
    resolve4Mock.mockResolvedValue(["93.184.216.34"]);
    resolve6Mock.mockResolvedValue([]);
    fetchMock.mockResolvedValueOnce(
      fakeResponse({
        status: 200,
        url: "https://cdn.example.com/chunked.png",
        headers: { "content-type": "image/png" }, // no content-length at all
        byteBody: new Uint8Array(11),
      }),
    );
    await expect(
      safeFetchCore("https://cdn.example.com/chunked.png", tinyImageProfile),
    ).rejects.toMatchObject({ reason: "response-too-large" });
  });

  it("image profile content-type gate refuses a non-image header BEFORE any body read (advisory gate, calm early refusal)", async () => {
    resolve4Mock.mockResolvedValue(["93.184.216.34"]);
    resolve6Mock.mockResolvedValue([]);
    fetchMock.mockResolvedValueOnce(
      fakeResponse({
        status: 200,
        url: "https://example.com/page.html",
        headers: { "content-type": "text/html; charset=utf-8", "content-length": "3" },
        byteBody: new Uint8Array([1, 2, 3]),
      }),
    );
    await expect(
      safeFetchCore("https://example.com/page.html", tinyImageProfile),
    ).rejects.toMatchObject({ reason: "unsupported-content-type" });
    expect(arrayBufferCallCount).toBe(0); // Measure 7 — no body read on refusal
  });

  // ── Quick task 260908-ef5 — the admit-opaque gate mode ────────────────────
  // The advisory claim made real: opaque/binary-ish declared headers reach
  // the body read under "admit-opaque" so the magic-byte sniff (D20-10)
  // decides admission — CDNs/S3/signed URLs serve real images under these
  // headers. The document profile (absent gate = "strict") keeps refusing
  // octet-stream exactly as before (byte-stability pin below).
  const admitOpaqueImageProfile: SafeFetchProfile = {
    ...tinyImageProfile,
    contentTypeGate: "admit-opaque",
  };

  it.each([
    ["application/octet-stream", { "content-type": "application/octet-stream" }],
    ["binary/octet-stream", { "content-type": "binary/octet-stream" }],
    [
      "parameterized octet-stream",
      { "content-type": "application/octet-stream; charset=binary" },
    ],
    ["no content-type header at all", {}],
  ])(
    "admit-opaque: %s returns the byte body — the sniff decides, not the declared header (D20-10)",
    async (_label, headers) => {
      resolve4Mock.mockResolvedValue(["93.184.216.34"]);
      resolve6Mock.mockResolvedValue([]);
      const body = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
      fetchMock.mockResolvedValueOnce(
        fakeResponse({
          status: 200,
          url: "https://cdn.example.com/s3-signed",
          headers: { ...headers, "content-length": String(body.byteLength) },
          byteBody: body,
        }),
      );
      const result = await safeFetchCore(
        "https://cdn.example.com/s3-signed",
        admitOpaqueImageProfile,
      );
      expect(Array.from(result.body as Uint8Array)).toEqual(Array.from(body));
      expect(arrayBufferCallCount).toBe(1); // the read happened — that is the point
      expect(textCallCount).toBe(0);
    },
  );

  it("admit-opaque still refuses a clearly-non-image declaration pre-read (text/html challenge page, zero body reads)", async () => {
    resolve4Mock.mockResolvedValue(["93.184.216.34"]);
    resolve6Mock.mockResolvedValue([]);
    fetchMock.mockResolvedValueOnce(
      fakeResponse({
        status: 200,
        url: "https://example.com/challenge.html",
        headers: { "content-type": "text/html; charset=utf-8", "content-length": "3" },
        byteBody: new Uint8Array([1, 2, 3]),
      }),
    );
    await expect(
      safeFetchCore("https://example.com/challenge.html", admitOpaqueImageProfile),
    ).rejects.toMatchObject({ reason: "unsupported-content-type" });
    expect(arrayBufferCallCount).toBe(0); // Measure 7 — no body read on refusal
  });

  it("document profile byte-stability: application/octet-stream still refuses unsupported-content-type (absent gate = strict)", async () => {
    resolve4Mock.mockResolvedValue(["93.184.216.34"]);
    resolve6Mock.mockResolvedValue([]);
    fetchMock.mockResolvedValueOnce(
      fakeResponse({
        status: 200,
        url: "https://example.com/binary-blob",
        headers: { "content-type": "application/octet-stream", "content-length": "4" },
        body: "xxxx",
      }),
    );
    await expect(safeFetch("https://example.com/binary-blob")).rejects.toMatchObject({
      reason: "unsupported-content-type",
    });
    expect(textCallCount).toBe(0); // Measure 7 — no body read on refusal
  });

  it("per-hop redirect re-validation runs under the SAME profile (image bytes follow the hop)", async () => {
    resolve4Mock.mockResolvedValue(["93.184.216.34"]);
    resolve6Mock.mockResolvedValue([]);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    fetchMock
      .mockResolvedValueOnce(
        fakeResponse({
          status: 302,
          url: "https://cdn.example.com/old.png",
          headers: { location: "https://cdn.example.com/new.png" },
        }),
      )
      .mockResolvedValueOnce(
        fakeResponse({
          status: 200,
          url: "https://cdn.example.com/new.png",
          headers: { "content-type": "image/png" },
          byteBody: png,
        }),
      );
    const result = await safeFetchCore("https://cdn.example.com/old.png", tinyImageProfile);
    expect(result.finalUrl).toBe("https://cdn.example.com/new.png");
    expect(Array.from(result.body as Uint8Array)).toEqual(Array.from(png));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("document profile via the core returns text and never touches arrayBuffer (byte-stable seam)", async () => {
    resolve4Mock.mockResolvedValue(["93.184.216.34"]);
    resolve6Mock.mockResolvedValue([]);
    const html = "<p>doc</p>";
    fetchMock.mockResolvedValueOnce(
      fakeResponse({
        status: 200,
        url: "https://example.com/a",
        headers: { "content-type": "text/html" },
        body: html,
        byteBody: new Uint8Array([9, 9, 9]),
      }),
    );
    const result = await safeFetchCore("https://example.com/a", {
      allowedContentTypes: ["text/html", "application/xhtml+xml"],
      timeoutMs: 30_000,
      maxBytes: 5 * 1024 * 1024,
      bodyKind: "text",
    });
    expect(result.body).toBe(html);
    expect(arrayBufferCallCount).toBe(0);
    expect(textCallCount).toBe(1);
  });
});
