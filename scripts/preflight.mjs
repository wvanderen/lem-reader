#!/usr/bin/env node
// scripts/preflight.mjs — the fast runtime gate (issue #253).
//
// Sits in front of every expensive test/build npm script (vitest, Playwright,
// build, calibration). It rejects unsupported Node runtimes BEFORE minutes of
// work with an actionable message, so a fresh session cannot burn a long run
// on the "wrong Node major" failure class and then misread it as baseline
// breakage. Silence on success is deliberate: the fast path adds no output.
//
// It must run correctly under the wrong runtime — keep it dependency-free.
import { checkNodeRuntime, renderPreflightFailure } from "./lib/runtime.mjs";

const failure = renderPreflightFailure(checkNodeRuntime(process.version));
if (failure) {
  console.error(failure);
  process.exit(1);
}
