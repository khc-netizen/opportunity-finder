import fs from "node:fs";
import assert from "node:assert/strict";

const coverage = fs.readFileSync("worker/coverage.js", "utf8");
const organic = fs.readFileSync("worker/organic.js", "utf8");
const jobs = fs.readFileSync("worker/job-discovery.js", "utf8");
const geo = fs.readFileSync("worker/zip-geo.js", "utf8");
const wrangler = fs.readFileSync("wrangler.toml", "utf8");

assert.match(coverage, /import baseWorker from ['"]\.\/index\.js['"]/);
assert.match(coverage, /import \{ discoverJobsZipFirst \} from ['"]\.\/job-discovery\.js['"]/);
assert.match(coverage, /GROUP_LENS/);
assert.match(coverage, /EVENT_LENS/);
assert.match(coverage, /JOB_LENS/);
assert.match(coverage, /hardZipGate/);
assert.match(coverage, /prefetchFiltering/);
assert.match(coverage, /fallbackDisabled/);
assert.match(coverage, /organic-first/);
assert.match(organic, /export async function organicDiscover/);
assert.match(organic, /hard ZIP gate failed before fetch/);
assert.match(organic, /organic-group-search/);
assert.match(organic, /organic-event-links/);
assert.match(organic, /-dance/);
assert.match(organic, /44410/);
assert.match(jobs, /export async function discoverJobsZipFirst/);
assert.match(jobs, /hard ZIP gate failed before fetch/);
assert.match(jobs, /job-prefetch-zip-gate/);
assert.match(jobs, /parseJobs\(/);
assert.match(geo, /HOME_ZIP = ['"]44439['"]/);
assert.match(geo, /passesHardZipGate/);
assert.match(geo, /eligibleZips/);
assert.match(geo, /distanceForZip/);
assert.match(wrangler, /main = ['"]worker\/coverage\.js['"]/);

console.log("Discovery coverage and hard ZIP architecture checks passed.");
