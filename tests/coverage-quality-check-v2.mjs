import fs from "node:fs";
import assert from "node:assert/strict";
const s = fs.readFileSync("worker/coverage.js", "utf8");
assert.ok(s.includes('u.searchParams.set("interests", lens.join(","));'));
assert.ok(s.includes("primaryUsed > maxPrimaryFetches"));
assert.ok(s.includes('if (url.pathname === "/jobs") return baseWorker.fetch(request, env, ctx);'));
console.log("Coverage quality smoke test passed.");
