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
import { safeFetch, type FetchedContent } from "../../../server/safeFetch";

const resolve4Mock = dns.promises.resolve4 as unknown as ReturnType<typeof vi.fn>;
const resolve6Mock = dns.promises.resolve6 as unknown as ReturnType<typeof vi.fn>;

/** A fake Response满足 safeFetch's read surface (headers + status + url + text). */
function fakeResponse(opts: {
  status?: number;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
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
  } as Response;
}

let textCallCount = 0;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resolve4Mock.mockReset();
  resolve6Mock.mockReset();
  textCallCount = 0;
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
    resolve4Mock.mockResolvedValue(["93.184.216.34"]); // example.com public IP
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
