import fs from "node:fs";
if (!fs.readFileSync("worker/coverage.js", "utf8").includes("lens.join")) throw new Error("lens coverage missing");
console.log("Coverage regression passed.");
