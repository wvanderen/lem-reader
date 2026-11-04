// scripts/lib/runtime.mjs
// The Node runtime contract (issue #253). Lem Reader and its CI standardize
// on Node 22: the repo pins 22.x via .mise.toml, CI installs node-version 22,
// and the shared Omarchy box's global default is Node 26 — a runtime under
// which jsdom/localStorage unit failures appear that do NOT reproduce under
// Node 22 (the "misleading baseline breakage" class from prior sessions).
// Within major 22, docs/stack.md ("Version Compatibility") sets the Vite 8
// floor: Node 22.12+. The pure decision logic lives here so the preflight
// script, the doctor, the container wrapper, and the unit tests all enforce
// ONE spelling. Dependency-free on purpose: it must run correctly under the
// WRONG runtime.

export const REQUIRED_NODE_MAJOR = 22;
/** The Vite 8 compatibility floor within major 22 (docs/stack.md). */
export const REQUIRED_NODE_MIN_MINOR = 12;

/**
 * Decide whether the given process-style version string satisfies the
 * project's Node 22 requirement. Never throws — a runtime this script cannot
 * even parse must fail closed, with a message.
 * @param {string | undefined} version a process.version-style string ("v22.23.4")
 * @returns {{ok: boolean, kind: "ok"|"wrong-major"|"too-old-minor"|"unparseable", version: string, major: number|null, minor: number|null}}
 */
export function checkNodeRuntime(version) {
  const match = /^v(\d+)\.(\d+)\.(\d+)/.exec(version ?? "");
  if (!match) {
    return {
      ok: false,
      kind: "unparseable",
      version: String(version ?? ""),
      major: null,
      minor: null,
    };
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major !== REQUIRED_NODE_MAJOR) {
    return { ok: false, kind: "wrong-major", version: String(version), major, minor };
  }
  if (minor < REQUIRED_NODE_MIN_MINOR) {
    return { ok: false, kind: "too-old-minor", version: String(version), major, minor };
  }
  return { ok: true, kind: "ok", version: String(version), major, minor };
}

/**
 * Render the full actionable rejection text for a failed check. Returns ""
 * for an acceptable runtime — the fast path is silent (the preflight sits in
 * front of every expensive script and must not add noise).
 * @param {ReturnType<typeof checkNodeRuntime>} result
 * @returns {string}
 */
export function renderPreflightFailure(result) {
  if (result.ok) return "";
  const observed =
    result.kind === "unparseable" ? `unrecognizable ("${result.version}")` : result.version;
  const floorNote =
    result.kind === "too-old-minor"
      ? `  Within major ${REQUIRED_NODE_MAJOR}, ${REQUIRED_NODE_MAJOR}.${REQUIRED_NODE_MIN_MINOR}+ is required (Vite 8 floor, docs/stack.md).`
      : "";
  return [
    `✗ Node ${observed} is not supported for this command.`,
    ``,
    `  Lem Reader requires Node ${REQUIRED_NODE_MAJOR} (repo pin: .mise.toml; CI: node-version ${REQUIRED_NODE_MAJOR}).`,
    floorNote,
    `  Under other runtimes, unit suites fail in misleading ways (jsdom/localStorage),`,
    `  so expensive tests and builds are gated here before they run.`,
    ``,
    `  Fix — run this command under the repo-local pin (does not touch your global default):`,
    ``,
    `      mise exec -- <your command>`,
    ``,
    `  or start a fresh shell in the repo: mise shims pick .mise.toml automatically.`,
    `  If Node 22 is not installed yet:  mise install  (reads .mise.toml).`,
    `  The full contract and recovery steps: docs/setup.md ("Node runtime").`,
    ``,
  ].join("\n");
}
