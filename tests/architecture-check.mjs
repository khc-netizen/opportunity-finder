import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const worker = readFileSync("worker/index.js", "utf8");
const frontend = readFileSync("public/index.html", "utf8");

assert.match(worker, /architecture:\s*['\"]organization-first['\"]/);
assert.match(worker, /const DANCE_RE/);
assert.match(worker, /const AMISH_RE/);
assert.match(worker, /async function discover\(/);
assert.match(worker, /async function discoverJobs\(/);
assert.match(worker, /parseOrganizationPage\(/);
assert.match(worker, /parseEvents\(/);
assert.match(worker, /fetchBudget/);

const discoveryStart = worker.indexOf("async function discover(");
const orgStage = worker.indexOf("Stage 1: discover organizations first", discoveryStart);
const venueStage = worker.indexOf("Stage 2: venues", discoveryStart);
const eventStage = worker.indexOf("Stage 3: trusted event sources first", discoveryStart);
assert.ok(discoveryStart >= 0 && orgStage > discoveryStart);
assert.ok(venueStage > orgStage);
assert.ok(eventStage > venueStage);

assert.match(frontend, /opportunityFinder:notInterested:v1/);
assert.match(frontend, /Not interested/);
assert.match(frontend, /Restore/);
assert.match(frontend, /Show hidden/);
assert.match(frontend, /Clear not interested/);
assert.match(frontend, /id="homeLocation"/);
assert.doesNotMatch(frontend, /<input[^>]+id="home"/i);

console.log("Opportunity Finder architecture checks passed.");
