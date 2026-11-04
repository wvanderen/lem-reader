// tests/unit/e2e-server-isolation.test.ts
// Issue #253 — the managed e2e dev server must be isolated from unrelated
// development servers and concurrent worktrees. A prior session on this
// machine unknowingly tested a different app (FlowSynth) because Playwright
// silently reused whatever answered on the shared development port. The
// contract here: the default base URL is stable per worktree (so concurrent
// worktrees do not contend), the shared dev default :5173 is never targeted,
// an explicit LEM_E2E_BASE override always wins (CI's reference lane relies
// on it), and an occupied port is an EXPLICIT conflict with actionable
// guidance — never a silent reuse. The identity contract lets the managed
// server launcher prove that the port it is about to test is the server it
// spawned, not some other application.
import { createServer } from "node:net";
import { afterAll, describe, expect, test } from "vitest";
import {
  assertPortAvailable,
  deriveWorktreePort,
  E2E_PORT_MAX,
  E2E_PORT_MIN,
  resolveE2eBase,
} from "../e2e/_server-port.mjs";
import {
  E2E_IDENTITY_PATH,
  identityBody,
  isIdentityMatch,
} from "../../dev-server/e2e-identity.mjs";

describe("resolveE2eBase — the ONE base-URL source", () => {
  test("an explicit LEM_E2E_BASE override wins verbatim (CI reference lane)", () => {
    expect(resolveE2eBase({ LEM_E2E_BASE: "http://localhost:15173" }, "/somewhere")).toBe(
      "http://localhost:15173",
    );
  });

  test("the default derives a localhost URL from the worktree, never :5173", () => {
    const base = resolveE2eBase({}, "/home/lem/dev/lem-reader");
    const url = new URL(base);
    expect(url.protocol).toBe("http:");
    expect(url.hostname).toBe("localhost");
    const port = Number(url.port);
    expect(port).toBeGreaterThanOrEqual(E2E_PORT_MIN);
    expect(port).toBeLessThan(E2E_PORT_MAX);
    expect(port).not.toBe(5173);
  });
});

describe("deriveWorktreePort — stable per worktree, distinct across worktrees", () => {
  test("the same root always derives the same port (predictable, debuggable)", () => {
    const a = deriveWorktreePort("/home/lem/dev/lem-reader");
    const b = deriveWorktreePort("/home/lem/dev/lem-reader");
    expect(a).toBe(b);
  });

  test("different roots derive different ports (independent worktrees do not contend)", () => {
    const ports = new Set(
      [
        "/home/lem/dev/lem-reader",
        "/home/lem/.t3/worktrees/lem-reader/t3-abc",
        "/tmp/scratch-clone",
      ].map((root) => deriveWorktreePort(root)),
    );
    // The source of truth is independence: these three real-shaped paths must
    // not collide. (A 400-port space makes a 3-way collision unlikely, and a
    // collision is still safe — the occupied-port path fails explicitly.)
    expect(ports.size).toBe(3);
  });
});

describe("assertPortAvailable — occupied ports fail explicitly", () => {
  const held = createServer();
  const HELD_PORT = 5891; // outside the e2e range and the ephemeral range
  let listeners: ReturnType<typeof createServer>[] = [];

  afterAll(() => {
    for (const l of listeners) l.close();
  });

  test("a free port resolves", async () => {
    await assertPortAvailable(5890, "127.0.0.1");
  });

  test("a deliberately occupied port rejects with the port and the override hint", async () => {
    await new Promise<void>((resolve) => held.listen(HELD_PORT, "127.0.0.1", resolve));
    listeners.push(held);
    let message = "";
    try {
      await assertPortAvailable(HELD_PORT, "127.0.0.1");
      expect.unreachable("must have rejected");
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain(String(HELD_PORT));
    expect(message).toContain("LEM_E2E_BASE");
    expect(message).toContain("never reuse");
  });
});

describe("identity contract — prove the port answers with OUR server", () => {
  test("the endpoint path is a fixed, documented constant", () => {
    expect(E2E_IDENTITY_PATH).toBe("/__lem-e2e-identity");
  });

  test("a matching body (tool + this run's token) verifies", () => {
    const body = identityBody("token-123");
    expect(body).toEqual({ tool: "lem-reader-e2e-server", token: "token-123" });
    expect(isIdentityMatch("token-123", body)).toBe(true);
  });

  test("a different app's response (wrong token, wrong shape, empty token) does not verify", () => {
    expect(isIdentityMatch("token-123", identityBody("other-run"))).toBe(false);
    expect(isIdentityMatch("token-123", { tool: "flowsynth", token: "token-123" })).toBe(false);
    expect(isIdentityMatch("token-123", "index page html")).toBe(false);
    expect(isIdentityMatch("token-123", undefined)).toBe(false);
    // A server with no managed token (plain `npm run dev`) is never ours.
    expect(isIdentityMatch("", identityBody(""))).toBe(false);
    expect(isIdentityMatch(undefined, identityBody("token"))).toBe(false);
  });
});
