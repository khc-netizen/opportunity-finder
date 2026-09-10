import fs from "node:fs";
import assert from "node:assert/strict";

const coverage = fs.readFileSync("worker/coverage.js", "utf8");
const wrangler = fs.readFileSync("wrangler.toml", "utf8");

assert.match(coverage, /import baseWorker from ['"]\.\/index\.js['"]/);
assert.match(coverage, /GROUP_LENS/);
assert.match(coverage, /EVENT_LENS/);
assert.match(coverage, /JOB_LENS/);
assert.match(coverage, /adaptiveLens/);
assert.match(coverage, /uniqueItems/);
assert.match(coverage, /baseWorker\.fetch\(request, env, ctx\)/);
assert.match(coverage, /DIAGNOSTIC_SEEDS/);
assert.match(coverage, /seedCoverage/);
assert.match(coverage, /organicResults/);
assert.match(coverage, /discoveryHealth/);
assert.match(coverage, /recovery/);
assert.match(wrangler, /main = ['"]worker\/coverage\.js['"]/);

console.log("Discovery coverage and seed diagnostics checks passed.");
