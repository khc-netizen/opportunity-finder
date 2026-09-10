import fs from "node:fs";
import assert from "node:assert/strict";

const coverage = fs.readFileSync("worker/coverage.js", "utf8");

assert.match(coverage, /supplemental pass is intentionally lens-led/);
assert.match(coverage, /searchParams\.set\("interests", lens\.join\(","\)\)/);
assert.match(coverage, /primaryUsed/);
assert.match(coverage, /primaryUsed > maxPrimaryFetches/);
assert.match(coverage, /\/groups.*6, 22/s);
assert.match(coverage, /\/events.*8, 22/s);
assert.match(coverage, /\/jobs.*baseWorker\.fetch\(request, env, ctx\)/s);
assert.match(coverage, /\/discover.*baseWorker\.fetch\(request, env, ctx\)/s);

console.log("Coverage quality checks passed.");
