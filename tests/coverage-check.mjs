import fs from "node:fs";
import assert from "node:assert/strict";

const coverage = fs.readFileSync("worker/coverage.js", "utf8");
const wrangler = fs.readFileSync("wrangler.toml", "utf8");

assert.match(coverage, /import baseWorker from \"\.\/index\.js\"/);
assert.match(coverage, /GROUP_LENS/);
assert.match(coverage, /EVENT_LENS/);
assert.match(coverage, /JOB_LENS/);
assert.match(coverage, /adaptiveLens/);
assert.match(coverage, /uniqueItems/);
assert.match(coverage, /baseWorker\.fetch\(request, env, ctx\)/);
assert.match(coverage, /u\.searchParams\.set\(\"interests\", lens\.join\(\",\"\)\)/);
assert.match(coverage, /primaryUsed/);
assert.match(coverage, /maxPrimaryFetches/);
assert.match(coverage, /\/jobs.*baseWorker\.fetch/s);
assert.match(coverage, /\/discover.*baseWorker\.fetch/s);
assert.match(wrangler, /main = \"worker\/coverage\.js\"/);

console.log("Discovery coverage checks passed.");
