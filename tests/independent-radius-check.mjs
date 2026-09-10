import assert from "node:assert/strict";
import fs from "node:fs";

const coverage = fs.readFileSync("worker/coverage.js", "utf8");
const organic = fs.readFileSync("worker/organic.js", "utf8");
const frontend = fs.readFileSync("public/index.html", "utf8");

assert.match(coverage, /groupRadius/);
assert.match(coverage, /eventRadius/);
assert.match(coverage, /jobRadius/);
assert.match(coverage, /p\.groupRadius/);
assert.match(coverage, /p\.eventRadius/);
assert.match(coverage, /p\.jobRadius/);
assert.match(coverage, /eligibleZips\(p\.groupRadius\)/);
assert.match(coverage, /eligibleZips\(p\.eventRadius\)/);
assert.match(coverage, /eligibleZips\(p\.jobRadius\)/);
assert.match(coverage, /independent ZIP radii/);

assert.match(organic, /organicDiscover\(interests=\[\],city='Mesopotamia',state='OH',groupRadius=30,eventRadius=30\)/);
assert.match(organic, /discoverGroups\(interests,state,budget,groupRadius\)/);
assert.match(organic, /discoverEvents\(groups,interests,state,budget,eventRadius\)/);
assert.match(organic, /eligibleZips\(groupRadius\)/);
assert.match(organic, /eligibleZips\(eventRadius\)/);

assert.match(frontend, /id="groupRadius"/);
assert.match(frontend, /id="eventRadius"/);
assert.match(frontend, /id="jobRadius"/);
assert.match(frontend, /groupRadius:g/);
assert.match(frontend, /eventRadius:e/);
assert.match(frontend, /jobRadius:j/);
assert.match(frontend, /radius:type==='jobs'\?j:type==='events'\?e:g/);

console.log("Independent ZIP radius checks passed.");
