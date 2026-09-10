import assert from "node:assert/strict";
import fs from "node:fs";

const coverage = fs.readFileSync("worker/coverage.js", "utf8");

assert.match(coverage, /groupRadius/);
assert.match(coverage, /eventRadius/);
assert.match(coverage, /jobRadius/);
assert.match(coverage, /p\.groupRadius/);
assert.match(coverage, /p\.eventRadius/);
assert.match(coverage, /p\.jobRadius/);
assert.match(coverage, /independent ZIP radii/);
assert.match(coverage, /groupEligibleZipCount/);
assert.match(coverage, /eventEligibleZipCount/);
assert.match(coverage, /jobEligibleZipCount/);

console.log("Independent ZIP radius checks passed.");
