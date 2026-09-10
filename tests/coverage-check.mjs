import fs from "node:fs";
import assert from "node:assert/strict";

const coverage = fs.readFileSync("worker/coverage.js", "utf8");
const organic = fs.readFileSync("worker/organic.js", "utf8");
const wrangler = fs.readFileSync("wrangler.toml", "utf8");

assert.match(coverage, /import baseWorker from ['"]\.\/index\.js['"]/);
assert.match(coverage, /GROUP_LENS/);
assert.match(coverage, /EVENT_LENS/);
assert.match(coverage, /JOB_LENS/);
assert.match(coverage, /adaptiveLens/);
assert.match(coverage, /uniqueItems/);
assert.match(coverage, /baseWorker\.fetch\(/);
assert.match(coverage, /DIAGNOSTIC_SEEDS/);
assert.match(coverage, /seedCoverage/);
assert.match(coverage, /organicResults/);
assert.match(coverage, /discoveryHealth/);
assert.match(coverage, /recovery/);
assert.match(coverage, /seed-fallback/);
assert.match(coverage, /organic-first/);
assert.match(organic, /export async function organicDiscover/);
assert.match(organic, /organic-group-search/);
assert.match(organic, /organic-event-links/);
assert.match(organic, /-dance/);
assert.match(organic, /Trumbull County/);
assert.match(wrangler, /main = ['"]worker\/coverage\.js['"]/);

console.log("Discovery coverage and organic-first architecture checks passed.");
