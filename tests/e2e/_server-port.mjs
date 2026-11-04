// tests/e2e/_server-port.mjs
// Port isolation for the managed e2e dev server (issue #253). A prior session
// unknowingly tested a different application because Playwright reused
// whatever answered on the shared development port. The contract:
//
//   - The default base URL is stable PER WORKTREE (hash of the repo root), so
//     concurrent worktrees and concurrent sessions do not contend, and a
//     failed run's port is predictable in logs.
//   - The shared development default :5173 is never targeted; `npm run dev`
//     keeps its own port.
//   - An explicit LEM_E2E_BASE always wins — CI's reference lane (port
//     15173) and the parallel-wayfinder discipline (#81/#94) keep working.
//   - Occupancy is an EXPLICIT conflict with actionable guidance; nothing in
//     the managed path reuses another process's server.
//
// Plain .mjs (not .ts): both the Playwright/TS side and the plain-node
// launcher (scripts/e2e-server.mjs) consume this ONE implementation; types
// live in the sibling .d.mts.

import { realpathSync } from "node:fs";
import { createServer } from "node:net";

/** The managed-e2e port lane: [5300, 5700) — clear of Vite's default 5173. */
export const E2E_PORT_MIN = 5300;
export const E2E_PORT_MAX = 5700;
const PORT_RANGE = E2E_PORT_MAX - E2E_PORT_MIN;

/**
 * Resolve the e2e base URL: an explicit LEM_E2E_BASE wins verbatim; otherwise
 * a stable per-worktree port on localhost.
 */
export function resolveE2eBase(env = process.env, cwd = process.cwd()) {
  const override = env.LEM_E2E_BASE;
  if (override) return override;
  return `http://localhost:${deriveWorktreePort(cwd)}`;
}

/** Derive the stable managed-e2e port for a worktree root. Pure and deterministic. */
export function deriveWorktreePort(root) {
  let resolved = root;
  try {
    resolved = realpathSync(root);
  } catch {
    // A not-yet-existing root still hashes deterministically from its path.
  }
  return E2E_PORT_MIN + (fnv1a(resolved) % PORT_RANGE);
}

/** FNV-1a (32-bit) — tiny, stable, dependency-free. */
function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Thrown when the managed server's port is already occupied. */
export class E2ePortConflictError extends Error {
  constructor(port, message) {
    super(message);
    this.name = "E2ePortConflictError";
    this.port = port;
  }
}

/**
 * Probe the port with a real bind/listen. Resolves only if nothing is
 * listening; rejects with an E2ePortConflictError (port + override guidance)
 * when occupied. This is the deliberate occupied-port verification path from
 * issue #253 — the managed launcher runs it BEFORE spawning Vite, so an
 * occupied port fails in milliseconds with a readable reason instead of a
 * Vite strictPort stack trace or, worse, a silent reuse.
 */
export function assertPortAvailable(port, host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", (err) => {
      probe.close();
      if (err.code === "EADDRINUSE") {
        reject(
          new E2ePortConflictError(
            port,
            [
              `✗ Managed e2e server port ${port} is already in use.`,
              `  This run never reuses another process's server (issue #253 — a prior session`,
              `  unknowingly tested a different app this way). Identify the listener with:`,
              ``,
              `      ss -ltnp 'sport = :${port}'`,
              ``,
              `  A leftover Lem e2e server can simply be killed. To pin a different port for`,
              `  this run instead:  LEM_E2E_BASE=http://localhost:<port> npx playwright test ...`,
            ].join("\n"),
          ),
        );
      } else {
        reject(err);
      }
    });
    probe.once("listening", () => {
      probe.close(() => resolve());
    });
    probe.listen(port, host);
  });
}
