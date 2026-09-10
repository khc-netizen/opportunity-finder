import assert from "node:assert/strict";
import { HOME_ZIP, eligibleZips, distanceForZip, isAllowedZip, passesHardZipGate, bestLocation } from "../worker/zip-geo.js";

assert.equal(HOME_ZIP, "44439");
assert.equal(distanceForZip("44439", 30), 0);
assert.equal(distanceForZip("44240", 30), null, "Kent 44240 is outside the 30-mile ZIP radius");
assert.equal(isAllowedZip("44410", 30), true);
assert.equal(isAllowedZip("44240", 30), false);
assert.equal(passesHardZipGate("Mesopotamia OH 44439", 30), true);
assert.equal(passesHardZipGate("Dunn NC 28334", 30), false);
assert.equal(passesHardZipGate("https://www.indeed.com/q-Warehouse-l-Dunn,-NC-jobs.html", 30), false);
assert.equal(bestLocation("Cortland OH 44410", 30)?.zip, "44410");
assert.ok(eligibleZips(30).every(x => x.distance <= 30));
assert.ok(eligibleZips(15).some(x => x.zip === "44410"));
assert.ok(!eligibleZips(15).some(x => x.zip === "44481"));
assert.ok(!eligibleZips(30).some(x => x.zip === "44240"));

console.log("Verified ZIP geography checks passed.");
