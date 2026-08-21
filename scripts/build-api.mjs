// scripts/build-api.mjs — esbuild driver for the Vercel /api/ingest function.
//
// Bundles api-src/ingest.ts → api/ingest.js (gitignored) as ONE self-contained
// ESM file. Debug session vercel-ingest-500 (2026-08-21, fix 2):
//   - fix 1 (--packages=external) crashed in prod with ERR_REQUIRE_ESM:
//     @vercel/nft's traced node_modules subset let CJS html-encoding-sniffer
//     require() the ESM-only @exodus/bytes/encoding-lite.js subpath. Bundling
//     node_modules IN resolves every CJS↔ESM seam at BUILD time.
//   - The banner provides a real Node `require` (createRequire) so esbuild's
//     __require shim — used by 130+ dynamic requires from CJS deps, e.g.
//     jsdom's optional canvas — behaves exactly like plain Node. canvas stays
//     --external: jsdom wraps its require in try/catch and degrades gracefully.
//   - jsdom's computed-style.js reads default-stylesheet.css from disk at
//     MODULE LOAD via __dirname (undefined in ESM output); the plugin inlines
//     it as a string literal.
//   - css-tree 3.x loads its data at runtime via createRequire():
//     data-patch.js → ../data/patch.json, data.js → three mdn-data JSON
//     files, version.js → ../package.json. esbuild cannot see through
//     createRequire, so the plugin inlines every literal .json require in
//     css-tree as JSON.parse("<contents>").
//   - POST-BUILD ASSERTIONS scan the output: the build FAILS if any runtime
//     require of a non-builtin, non-canvas module survives, or any __dirname
//     reference — the classes of cold-start crash this session shipped twice.
//
// Verify the output in ISOLATION (temp dir with no reachable node_modules) —
// a smoke run from the repo root is masked by the full node_modules tree
// (the fix-1 lesson).
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { createRequire as nodeCreateRequire, isBuiltin } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = nodeCreateRequire(import.meta.url);

const computedStylePath = require.resolve(
  "jsdom/lib/jsdom/living/css/helpers/computed-style.js",
);
const stylesheetPath = path.resolve(
  path.dirname(computedStylePath),
  "../../../browser/default-stylesheet.css",
);
const stylesheetCss = readFileSync(stylesheetPath, "utf8");

/** JSON string literal that is a valid JS expression (ES2019+: U+2028/29 ok). */
function jsonStringLiteral(value) {
  return `JSON.parse(${JSON.stringify(JSON.stringify(value))})`;
}

/** Inline jsdom's default-stylesheet.css read (see header). */
const jsdomDefaultStylesheetPlugin = {
  name: "jsdom-default-stylesheet-inline",
  setup(build) {
    build.onLoad(
      { filter: /jsdom[/\\]lib[/\\]jsdom[/\\]living[/\\]css[/\\]helpers[/\\]computed-style\.js$/ },
      (args) => {
        if (args.path !== computedStylePath) return undefined; // only our jsdom copy
        let contents = readFileSync(args.path, "utf8");
        const pattern =
          /fs\.readFileSync\(\s*path\.resolve\(__dirname,\s*"\.\.\/\.\.\/\.\.\/browser\/default-stylesheet\.css"\),\s*\{\s*encoding:\s*"utf-8"\s*\}\s*\)/;
        if (!pattern.test(contents)) {
          throw new Error(
            `build-api: default-stylesheet readFileSync pattern not found in ${args.path} — jsdom layout changed; update this plugin`,
          );
        }
        contents = contents.replace(pattern, JSON.stringify(stylesheetCss));
        return { contents, loader: "js" };
      },
    );
  },
};

/**
 * Inline every literal `require("....json")` in css-tree as
 * JSON.parse("<contents>") — css-tree loads its datasets at runtime via
 * createRequire, which esbuild cannot bundle statically.
 */
const cssTreeJsonInlinePlugin = {
  name: "css-tree-json-inline",
  setup(build) {
    build.onLoad({ filter: /css-tree[/\\]lib[/\\].*\.js$/ }, (args) => {
      let contents = readFileSync(args.path, "utf8");
      const requireJson = /require\(\s*(['"])([^'"]+\.json)\1\s*\)/g;
      let replaced = 0;
      contents = contents.replace(requireJson, (_match, _quote, spec) => {
        const resolved = spec.startsWith(".")
          ? path.resolve(path.dirname(args.path), spec)
          : require.resolve(spec);
        replaced += 1;
        return jsonStringLiteral(JSON.parse(readFileSync(resolved, "utf8")));
      });
      return replaced ? { contents, loader: "js" } : undefined;
    });
  },
};

/**
 * jsdom resolves its sync-XHR worker file eagerly at module load
 * (`require.resolve("./xhr-sync-worker.js")`, spawned only for synchronous
 * XHR — the ingest pipeline never issues XHR). The worker file cannot be
 * bundled (it is spawned as a separate worker needing its own module
 * resolution), so replace the eager resolve with a marker string: cold
 * start succeeds; a hypothetical sync-XHR call fails at spawn instead of
 * crashing every request.
 */
const jsdomSyncXhrWorkerPlugin = {
  name: "jsdom-sync-xhr-worker-stub",
  setup(build) {
    build.onLoad(
      { filter: /jsdom[/\\]lib[/\\]jsdom[/\\]living[/\\]xhr[/\\]XMLHttpRequest-impl\.js$/ },
      (args) => {
        let contents = readFileSync(args.path, "utf8");
        const pattern = /require\.resolve\(\s*(['"])\.\/xhr-sync-worker\.js\1\s*\)/;
        if (!pattern.test(contents)) {
          throw new Error(
            `build-api: xhr-sync-worker require.resolve pattern not found in ${args.path} — jsdom layout changed; update this plugin`,
          );
        }
        contents = contents.replace(
          pattern,
          '"xhr-sync-worker.js is not shipped in the bundled /api/ingest function (sync XHR is unused by the ingest pipeline)"',
        );
        return { contents, loader: "js" };
      },
    );
  },
};

const NODE_BUILTINS_ALLOWED = new Set(["canvas"]); // external by design (jsdom optional dep)

/** Fail the build if any runtime module resolution would reach node_modules. */
function assertSelfContained(outfile) {
  const output = readFileSync(outfile, "utf8");
  const offenders = new Set();
  for (const match of output.matchAll(
    /(?:__require|require\d*)\(\s*(['"])([^'"]+)\1\s*\)/g,
  )) {
    const spec = match[2];
    if (spec === "canvas" || isBuiltin(spec)) continue;
    offenders.add(spec);
  }
  // Eager require.resolve of relative/bare specs crashes ESM cold start the
  // same way (no __dirname-anchored tree exists beside the bundle).
  for (const match of output.matchAll(
    /require\d*\.resolve\(\s*(['"])([^'"]+)\1\s*\)/g,
  )) {
    offenders.add(`resolve:${match[2]}`);
  }
  if (offenders.size > 0) {
    throw new Error(
      `build-api: runtime module resolution survived bundling: ${[...offenders].join(", ")} — add a plugin transform or investigate`,
    );
  }
  if (output.includes("__dirname")) {
    throw new Error(
      "build-api: __dirname reference survived bundling — ESM output has none; add a plugin transform",
    );
  }
}

await build({
  entryPoints: ["api-src/ingest.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["canvas"],
  banner: {
    js: "import { createRequire as __nodeRequireFactory } from 'module'; const require = __nodeRequireFactory(import.meta.url);",
  },
  outfile: "api/ingest.js",
  plugins: [jsdomDefaultStylesheetPlugin, cssTreeJsonInlinePlugin, jsdomSyncXhrWorkerPlugin],
  logLevel: "info",
});

assertSelfContained(fileURLToPath(new URL("../api/ingest.js", import.meta.url)));
console.log("build-api: self-containment assertions passed");
