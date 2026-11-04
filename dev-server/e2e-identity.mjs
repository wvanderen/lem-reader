// dev-server/e2e-identity.mjs
// The managed-e2e server identity contract (issue #253). The managed e2e
// launcher (scripts/e2e-server.mjs) spawns Vite with a per-run token and then
// PROVES the port answers with this exact server before Playwright starts
// testing: the dev-only middleware below serves the token at a fixed path.
// A foreign application on the same port (the prior-session "unknowingly
// tested FlowSynth" class) cannot echo the token, so identity verification
// fails explicitly instead of silently testing the wrong app.
//
// Plain .mjs: consumed by BOTH vite.config.ts (plugin) and the plain-node
// launcher; types live in the sibling .d.mts.

/** The fixed identity endpoint served by the dev server under managed e2e runs. */
export const E2E_IDENTITY_PATH = "/__lem-e2e-identity";

/** Playwright waits ONLY for this launcher message, never ordinary HTTP readiness. */
export const E2E_READY_MESSAGE = "LEM_E2E_SERVER_VERIFIED";

const KNOWN_TOOL = "lem-reader-e2e-server";

/** The canonical identity body for a run token. */
export function identityBody(token) {
  return { tool: KNOWN_TOOL, token };
}

/**
 * Verify a fetched identity payload against this run's token. Strict: the
 * tool must be ours AND the token must be this run's non-empty token, so a
 * server started outside a managed run (no token) never verifies.
 */
export function isIdentityMatch(expectedToken, body) {
  if (!expectedToken) return false;
  if (typeof body !== "object" || body === null) return false;
  return body.tool === KNOWN_TOOL && body.token === expectedToken;
}

/**
 * Dev-only Vite plugin serving the identity endpoint. Reads the run token
 * from the environment that the managed launcher set; unmanaged `npm run dev`
 * has no token and serves an empty one (which never verifies — by design).
 */
export function lemE2eIdentityPlugin() {
  return {
    name: "lem-e2e-identity",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(E2E_IDENTITY_PATH, (_req, res) => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(identityBody(process.env.LEM_E2E_TOKEN ?? "")));
      });
    },
  };
}
