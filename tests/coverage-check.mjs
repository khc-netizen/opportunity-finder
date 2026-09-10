import fs from "node:fs";
import assert from "node:assert/strict";

const coverage = fs.readFileSync("worker/coverage.js", "utf8");
const discovery = fs.readFileSync("worker/discovery.js", "utf8");
const exclusions = fs.readFileSync("worker/exclusions.js", "utf8");
const geo = fs.readFileSync("worker/zip-geo.js", "utf8");
const wrangler = fs.readFileSync("wrangler.toml", "utf8");

assert.match(coverage, /import baseWorker from ['"]\.\/index\.js['"]/);
assert.match(coverage, /import \{ discoverAll \} from ['"]\.\/discovery\.js['"]/);
assert.match(coverage, /groupRadius/);
assert.match(coverage, /eventRadius/);
assert.match(coverage, /jobRadius/);
assert.match(coverage, /hardZipGate/);
assert.match(coverage, /prefetchFiltering/);
assert.match(coverage, /independentRadii/);
assert.match(coverage, /configurableExclusions/);
assert.match(coverage, /organization-first/);
assert.match(discovery, /export async function discoverAll/);
assert.match(discovery, /hard ZIP gate failed before fetch/);
assert.match(discovery, /search-result evidence/);
assert.match(discovery, /exclusionQuery/);
assert.match(discovery, /isExcluded/);
assert.doesNotMatch(discovery, /-dance/);
assert.doesNotMatch(discovery, /-amish/);
assert.match(exclusions, /parseExclusions/);
assert.match(exclusions, /excludeGroups/);
assert.match(exclusions, /excludeEvents/);
assert.match(exclusions, /excludeJobs/);
assert.match(geo, /HOME_ZIP = ['"]44439['"]/);
assert.match(geo, /passesHardZipGate/);
assert.match(geo, /eligibleZips/);
assert.match(geo, /distanceForZip/);
assert.match(wrangler, /main = ['"]worker\/coverage\.js['"]/);

console.log("Configurable discovery, exclusion, and hard ZIP architecture checks passed.");
