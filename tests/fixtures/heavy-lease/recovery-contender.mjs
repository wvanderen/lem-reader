// Schedules the stale-read interleaving from PR #258 without production hooks.
// A pauses its first lease read until B reads (or a serialized implementation
// keeps B out). B pauses its first read until A has acquired. A and B retain
// their processes until the parent test cleans up, so a second acquisition
// is unambiguously an overlap, not sequential ownership.
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";

const [file, owner, library] = process.argv.slice(2);
const originalRead = fs.readFileSync;
let firstRead = true;
fs.readFileSync = function (path, ...args) {
  const result = originalRead(path, ...args);
  if (path === file && firstRead) {
    firstRead = false;
    fs.writeFileSync(`${file}.${owner}.read`, "ready");
    const barrier = `${file}.${owner === "A" ? "B.read" : "A.acquired"}`;
    const deadline = Date.now() + 500;
    while (!fs.existsSync(barrier) && Date.now() < deadline) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
    }
  }
  return result;
};
syncBuiltinESMExports();

const { acquireLease } = await import(library);
try {
  await acquireLease({ file, owner });
  fs.writeFileSync(`${file}.${owner}.acquired`, "acquired");
  process.send?.({ outcome: "acquired", owner });
} catch (err) {
  process.send?.({ outcome: err.name, owner });
}
// Keep both contenders alive until the parent has checked exclusion.
setInterval(() => {}, 1000);
