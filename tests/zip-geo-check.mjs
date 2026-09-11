import assert from "node:assert/strict";
import { HOME_ZIP, eligibleZips, distanceForZip, isAllowedZip, passesHardZipGate, passesHardAddressGate, hasPhysicalAddress, bestLocation } from "../worker/zip-geo.js";

assert.equal(HOME_ZIP, "44439");
assert.equal(distanceForZip("44439", 30), 0);
assert.equal(distanceForZip("44240", 30), null, "Kent 44240 is outside the 30-mile ZIP radius");
assert.equal(isAllowedZip("44410", 30), true);
assert.equal(isAllowedZip("44240", 30), false);

// ZIP proximity remains independently testable, but a ZIP/city mention alone is
// no longer sufficient for a production discovery result.
assert.equal(passesHardZipGate("Mesopotamia OH 44439", 30), true);
assert.equal(passesHardZipGate("Dunn NC 28334", 30), false);
assert.equal(passesHardZipGate("https://www.indeed.com/q-Warehouse-l-Dunn,-NC-jobs.html", 30), false);
assert.equal(bestLocation("Cortland OH 44410", 30)?.zip, "44410");
assert.ok(eligibleZips(30).every(x => x.distance <= 30));
assert.ok(eligibleZips(15).some(x => x.zip === "44410"));
assert.ok(!eligibleZips(15).some(x => x.zip === "44481"));
assert.ok(!eligibleZips(30).some(x => x.zip === "44240"));

// City-name collision regression checks: a matching Ohio city name by itself is
// not geographic evidence. This blocks unrelated pages such as Burton Snowboards
// and the Orwell Foundation from being assigned to Ohio merely because the city
// name happens to match a local ZIP.
assert.equal(passesHardZipGate("Burton Snowboards", 30), false);
assert.equal(passesHardZipGate("About George Orwell | The Orwell Foundation", 30), false);
assert.equal(passesHardZipGate("Burton Ohio historical organization", 30), true);
assert.equal(passesHardZipGate("Orwell OH historical society", 30), true);

// CAST-IRON PRODUCTION ADDRESS GATE.
// A result must have a physical street address, Ohio, and an eligible ZIP.
const wraba = "Western Reserve Artist Blacksmith Association, 14653 E Park St, Burton, OH 44021";
const tcba = "Trumbull County Beekeepers Association, 520 W Main St #1, Cortland, OH 44410";
assert.equal(hasPhysicalAddress(wraba), true);
assert.equal(hasPhysicalAddress(tcba), true);
assert.equal(passesHardAddressGate(wraba, 30), true);
assert.equal(passesHardAddressGate(tcba, 15), true);
assert.equal(passesHardAddressGate("Trumbull County Beekeepers Association, Cortland OH 44410", 15), false, "city/ZIP without street address must be rejected");
assert.equal(passesHardAddressGate("Mesopotamia OH 44439", 30), false, "ZIP without street address must be rejected");
assert.equal(passesHardAddressGate("P.O. Box 123, Cortland OH 44410", 15), false, "P.O. boxes are not physical addresses");
assert.equal(passesHardAddressGate("14653 E Park St, Burton, OH 44021", 15), false, "valid address outside selected radius must be rejected");
assert.equal(passesHardAddressGate("14653 E Park St, Burton, OH 44021", 30), true);
assert.equal(passesHardAddressGate("100 Main St, Dunn NC 28334", 50), false, "out-of-state physical addresses must be rejected");

// Independent-radius regression checks: one canonical ZIP map, three separate eligibility lenses.
const groups50 = eligibleZips(50).map(x => x.zip);
const events30 = eligibleZips(30).map(x => x.zip);
const jobs15 = eligibleZips(15).map(x => x.zip);
assert.ok(groups50.includes("44240"), "50-mile groups lens should include Kent");
assert.ok(!events30.includes("44240"), "30-mile events lens should exclude Kent");
assert.ok(!jobs15.includes("44240"), "15-mile jobs lens should exclude Kent");
assert.ok(jobs15.every(zip => events30.includes(zip)), "15-mile job pool must be contained within 30-mile event pool");
assert.ok(events30.every(zip => groups50.includes(zip)), "30-mile event pool must be contained within 50-mile group pool");

// Search-result evidence regression checks.
assert.equal(passesHardZipGate("local employer, Cortland OH 44410", 15), true);
assert.equal(passesHardZipGate("warehouse job, Dunn NC 28334", 15), false);
assert.equal(passesHardZipGate("Pennsylvania job 15201", 50), false);

console.log("Verified ZIP geography, independent radius, city-collision protection, and cast-iron physical-address gate checks passed.");
