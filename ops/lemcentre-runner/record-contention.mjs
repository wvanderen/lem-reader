#!/usr/bin/env node
// ops/lemcentre-runner/record-contention.mjs — the contention-policy
// adjudicator for the nightly-equivalent Linux lane (issue #282; lane
// contract: docs/specs/lemcentre-nightly-linux.md; policy source:
// docs/specs/lemcentre-ci-migration.md §Host workload coordination —
// "contention-invalidated measurements are infrastructure failures, not
// product regressions").
//
// Inputs are the host-load records the evidence bundles carry
// (identity/host-load.json members: per-phase loadavg at lease acquisition
// plus the lease record), plus the reviewed threshold file
// ops/lemcentre-runner/contention-threshold.json. The tool is READ-ONLY:
// it reads records, applies the threshold, and emits one machine-readable
// verdict; the lane's conclude step decides exits from it. It never
// re-runs anything, never edits records, and never guesses: a malformed
// record or threshold is exit 1 with findings, never a quiet verdict.
//
//   node ops/lemcentre-runner/record-contention.mjs \
//        --records <file-or-dir> [<file-or-dir>...] [--threshold PATH] [--out PATH]
//
// stdout is ALWAYS the verdict JSON (that is the interface); human notes
// go to stderr. Exit codes: 0 verdict produced (contended or not) ·
// 1 input/threshold error · 2 usage.
//
// Policy shape (the threshold file is the authority; defaults are the
// reviewed owner decision recorded in the file itself):
//   - a phase whose worst recorded loadavg 1m exceeds thresholds.loadavg1mMax
//     is `contended`;
//   - a contended phase listed in `invalidates` (default: exactly the
//     measurement phases, calibration + performance) sets
//     measurementInvalid — the lane reclassifies measurement failures as
//     infrastructure (exit 7) and refuses acceptance-grade green;
//   - contended phases NOT listed (functional by default) are recorded
//     with their load and never invalidate.
//
// Types for test consumers live in the sibling record-contention.d.mts;
// this file is plain JavaScript (the single truth, like compare-shadow.mjs).

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

/** The committed default threshold (beside this tool). */
export function defaultThresholdPath() {
  return join(import.meta.dirname, "contention-threshold.json");
}

/** Read + validate record files (directories contribute their *.json). */
export function readRecords(paths) {
  const files = [];
  for (const path of paths) {
    let entries;
    try {
      entries = readdirSync(path, { withFileTypes: true });
    } catch {
      files.push(path); // not a directory (or unreadable — named below)
      continue;
    }
    files.push(
      ...entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => join(path, entry.name))
        .sort(),
    );
  }
  const out = [];
  for (const file of files) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      throw new Error(`cannot read record ${file}: ${error.message}`);
    }
    const record = parsed;
    if (
      typeof record !== "object" ||
      record === null ||
      !Array.isArray(record.phases) ||
      record.phases.some(
        (phase) =>
          typeof phase !== "object" ||
          phase === null ||
          typeof phase.phase !== "string" ||
          typeof phase.loadavg?.["1m"] !== "number" ||
          !Number.isFinite(phase.loadavg["1m"]),
      )
    ) {
      throw new Error(
        `record ${file} is not a host-load record: every phase needs {phase, loadavg.1m} ` +
          "(schema: docs/specs/lemcentre-nightly-linux.md §Contention policy)",
      );
    }
    out.push({ source: file, record });
  }
  return out;
}

/** Validate a threshold file's shape (fail-closed on missing fields). */
export function readThreshold(path) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`cannot read threshold ${path}: ${error.message}`);
  }
  const config = parsed;
  if (
    typeof config !== "object" ||
    config === null ||
    config.schemaVersion !== 1 ||
    typeof config.thresholds?.loadavg1mMax !== "number" ||
    !Number.isFinite(config.thresholds.loadavg1mMax) ||
    config.thresholds.loadavg1mMax <= 0 ||
    !Array.isArray(config.invalidates) ||
    config.invalidates.some((phase) => typeof phase !== "string")
  ) {
    throw new Error(
      `threshold ${path} must carry {schemaVersion:1, thresholds.loadavg1mMax > 0, ` +
        "invalidates: [phases]} — threshold changes are owner decisions (see the file's changeControl)",
    );
  }
  return config;
}

/** The pure policy: merge records per phase, apply the threshold. */
export function adjudicateContention(inputs, threshold, thresholdSource = "(in-memory)") {
  const merged = new Map();
  for (const { source, record } of inputs) {
    for (const phase of record.phases) {
      const load = phase.loadavg?.["1m"];
      if (typeof load !== "number" || !Number.isFinite(load)) continue; // readRecords validated; defensive
      const entry = merged.get(phase.phase) ?? {
        loadavg1m: -Infinity,
        samples: 0,
        sources: new Set(),
        measurement: threshold.invalidates.includes(phase.phase),
      };
      entry.loadavg1m = Math.max(entry.loadavg1m, load);
      entry.samples += 1;
      entry.sources.add(source);
      merged.set(phase.phase, entry);
    }
  }
  const phases = [...merged.entries()]
    .map(([phase, entry]) => {
      const contended = entry.loadavg1m > threshold.thresholds.loadavg1mMax;
      return {
        phase,
        measurement: entry.measurement,
        loadavg1m: entry.loadavg1m,
        contended,
        invalidates: contended && entry.measurement,
        samples: entry.samples,
        sources: [...entry.sources].sort(),
      };
    })
    .sort((a, b) => a.phase.localeCompare(b.phase));
  return {
    schemaVersion: 1,
    threshold: {
      source: thresholdSource,
      loadavg1mMax: threshold.thresholds.loadavg1mMax,
      invalidates: [...threshold.invalidates],
    },
    measurementInvalid: phases.some((phase) => phase.invalidates),
    phases,
  };
}

// ---------------------------------------------------------------- CLI ------

function usage(exitCode) {
  console.log(`usage: record-contention.mjs --records <file-or-dir> [<file-or-dir>...] [--threshold PATH] [--out PATH]

Adjudicates contention for the nightly-linux-shadow lane from host-load
records (evidence-bundle identity/host-load.json members). stdout is the
verdict JSON. Exit codes: 0 verdict produced · 1 input/threshold error ·
2 usage.`);
  process.exit(exitCode);
}

export function main(argv = process.argv.slice(2)) {
  const inputs = [];
  let thresholdPath = null;
  let outPath = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--records") inputs.push(argv[(i += 1)]);
    else if (arg === "--threshold") thresholdPath = argv[(i += 1)];
    else if (arg === "--out") outPath = argv[(i += 1)];
    else if (arg === "--help" || arg === "-h") usage(0);
    else {
      console.error(`unknown argument: ${arg}`);
      usage(2);
    }
  }
  if (inputs.length === 0 || inputs.some((path) => !path)) usage(2);
  const resolvedThreshold = thresholdPath ?? defaultThresholdPath();
  try {
    const verdict = adjudicateContention(
      readRecords(inputs),
      readThreshold(resolvedThreshold),
      isAbsolute(resolvedThreshold) ? resolvedThreshold : resolve(resolvedThreshold),
    );
    for (const phase of verdict.phases) {
      if (phase.contended) {
        console.error(
          `contention: phase ${phase.phase} peaked at loadavg1m ${phase.loadavg1m} ` +
            `(threshold ${verdict.threshold.loadavg1mMax})` +
            (phase.invalidates ? " — measurement-invalidating" : " — recorded, not invalidating"),
        );
      }
    }
    if (verdict.measurementInvalid) {
      console.error(
        "measurementInvalid: the measurement phases ran under contention — infrastructure failure (exit 7), not a product regression",
      );
    }
    const json = `${JSON.stringify(verdict, null, 2)}\n`;
    process.stdout.write(json);
    if (outPath) {
      writeFileSync(outPath, json);
      console.error(`verdict written: ${outPath}`);
    }
    return 0;
  } catch (error) {
    console.error(`✗ ${error.message}`);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main());
}
